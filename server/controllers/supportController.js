import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db.js";

// Help & Support. Users send a message with an optional photo and voice note from the app;
// admins read and reply in the dashboard. Files live in server/uploads/support and are only
// served to admins.
const UPLOADS = path.join(import.meta.dirname, "../uploads/support");
const MAX_FILE = 3 * 1024 * 1024;
const PER_DAY = 10;
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VOICE_TYPES = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3" };
const CONTACT_KEYS = ["phone", "whatsapp", "email"];

// Decodes { data: base64, type } and saves it; returns the file name or throws "invalid_file".
async function saveFile(file, types) {
  if (!file) return null;
  const type = String(file.type || "").split(";")[0].trim().toLowerCase();
  const ext = types[type];
  const buf = Buffer.from(String(file.data || ""), "base64");
  if (!ext || buf.length === 0 || buf.length > MAX_FILE) throw new Error("invalid_file");
  const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  await fs.mkdir(UPLOADS, { recursive: true });
  await fs.writeFile(path.join(UPLOADS, name), buf);
  return name;
}

const removeFiles = (...names) =>
  Promise.all(names.filter(Boolean).map((n) => fs.rm(path.join(UPLOADS, path.basename(n)), { force: true })));

// Before a user is deleted (their tickets go with the row, but the files would stay behind).
export async function removeUserSupportFiles(distributorId) {
  const [rows] = await db.execute(`SELECT image, voice FROM support_tickets WHERE distributor_id = ?`, [distributorId]);
  await removeFiles(...rows.flatMap((r) => [r.image, r.voice]));
}

async function readContact() {
  const [rows] = await db.query(`SELECT k, v FROM app_settings WHERE k LIKE 'support_%'`);
  const out = Object.fromEntries(CONTACT_KEYS.map((k) => [k, ""]));
  for (const { k, v } of rows) if (CONTACT_KEYS.includes(k.slice(8))) out[k.slice(8)] = v;
  return out;
}

const ticketRow = (r) => ({
  id: r.id,
  message: r.message,
  hasImage: !!r.image,
  hasVoice: !!r.voice,
  voiceSeconds: r.voice_seconds,
  status: r.status,
  reply: r.reply,
  repliedAt: r.replied_at,
  createdAt: r.created_at,
});

// --- App (public / logged-in user) ---

export async function contact(req, res) {
  res.json(await readContact());
}

// Body: { message, image?: { data, type }, voice?: { data, type, seconds }, appVersion }
export async function createTicket(req, res) {
  const { message = "", image, voice, appVersion = "" } = req.body || {};
  const text = String(message).trim().slice(0, 4000);
  if (!text && !image && !voice) return res.status(400).json({ error: "empty_message" });

  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM support_tickets WHERE distributor_id = ? AND created_at > NOW() - INTERVAL 1 DAY`,
    [req.distributorId],
  );
  if (n >= PER_DAY) return res.status(429).json({ error: "too_many" });

  let imageName = null;
  let voiceName = null;
  try {
    imageName = await saveFile(image, IMAGE_TYPES);
    voiceName = await saveFile(voice, VOICE_TYPES);
  } catch {
    await removeFiles(imageName, voiceName);
    return res.status(400).json({ error: "invalid_file" });
  }
  const seconds = voiceName ? Math.min(Math.max(Math.round(Number(voice.seconds) || 0), 0), 600) : null;
  const [r] = await db.execute(
    `INSERT INTO support_tickets (distributor_id, message, image, voice, voice_seconds, app_version) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.distributorId, text, imageName, voiceName, seconds, String(appVersion).slice(0, 20)],
  );
  const [[row]] = await db.execute(`SELECT * FROM support_tickets WHERE id = ?`, [r.insertId]);
  res.json(ticketRow(row));
}

export async function myTickets(req, res) {
  const [rows] = await db.execute(
    `SELECT * FROM support_tickets WHERE distributor_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.distributorId],
  );
  res.json({ tickets: rows.map(ticketRow) });
}

// --- Admin dashboard ---

export async function adminTickets(req, res) {
  const status = ["open", "replied", "closed"].includes(req.query.status) ? req.query.status : null;
  const [rows] = await db.query(
    `SELECT t.*, d.name AS user_name, d.phone AS user_phone
     FROM support_tickets t JOIN distributors d ON d.id = t.distributor_id
     ${status ? "WHERE t.status = ?" : ""}
     ORDER BY t.status = 'open' DESC, t.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  const [[counts]] = await db.query(
    `SELECT COALESCE(SUM(status = 'open'), 0) AS open, COALESCE(SUM(status = 'replied'), 0) AS replied,
       COALESCE(SUM(status = 'closed'), 0) AS closed, COUNT(*) AS total FROM support_tickets`,
  );
  res.json({
    counts,
    tickets: rows.map((r) => ({
      ...ticketRow(r),
      image: r.image,
      voice: r.voice,
      appVersion: r.app_version,
      repliedBy: r.replied_by,
      user: { id: r.distributor_id, name: r.user_name, phone: r.user_phone },
    })),
  });
}

// Attachment for <img>/<audio> in the dashboard (cookie-authenticated GET).
export async function adminFile(req, res) {
  const name = path.basename(req.params.name);
  if (!/^[0-9a-f]{24}\.\w+$/.test(name)) return res.status(404).end();
  res.set("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(UPLOADS, name), (err) => err && !res.headersSent && res.status(404).end());
}

export async function replyTicket(req, res) {
  const reply = String(req.body?.reply || "").trim().slice(0, 4000);
  if (!reply) return res.status(400).json({ error: "empty_message" });
  const [r] = await db.execute(
    `UPDATE support_tickets SET reply = ?, replied_at = NOW(), replied_by = ?, status = 'replied' WHERE id = ?`,
    [reply, req.admin.username, req.params.id],
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}

export async function setTicketStatus(req, res) {
  const { status } = req.body || {};
  if (!["open", "replied", "closed"].includes(status)) return res.status(400).json({ error: "invalid_input" });
  const [r] = await db.execute(`UPDATE support_tickets SET status = ? WHERE id = ?`, [status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}

export async function deleteTicket(req, res) {
  const [[row]] = await db.execute(`SELECT image, voice FROM support_tickets WHERE id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "not_found" });
  await db.execute(`DELETE FROM support_tickets WHERE id = ?`, [req.params.id]);
  await removeFiles(row.image, row.voice);
  res.json({ ok: true });
}

export async function getContact(req, res) {
  res.json(await readContact());
}

export async function saveContact(req, res) {
  for (const k of CONTACT_KEYS) {
    const v = String(req.body?.[k] ?? "").trim().slice(0, 120);
    await db.execute(`INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [`support_${k}`, v]);
  }
  res.json(await readContact());
}
