import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db.js";

// Help & Support conversations. A user starts one from the app with a message (text, photo,
// voice note); support and the user then reply back and forth until it is closed. Files live in
// server/uploads/support and are served only to admins and to the user who sent them.
const UPLOADS = path.join(import.meta.dirname, "../uploads/support");
const MAX_FILE = 3 * 1024 * 1024;
const NEW_PER_DAY = 10; // new conversations per user per day
const MESSAGES_PER_DAY = 60; // messages per user per day, all conversations together
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VOICE_TYPES = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3" };
const CONTACT_KEYS = ["phone", "whatsapp", "email"];
const FILE_NAME = /^[0-9a-f]{24}\.\w+$/;

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

const filesOf = async (where, params) => {
  const [rows] = await db.execute(
    `SELECT m.image, m.voice FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE ${where}`,
    params,
  );
  return rows.flatMap((r) => [r.image, r.voice]);
};

// Before a user is deleted (their conversations go with the row, but the files would stay behind).
export async function removeUserSupportFiles(distributorId) {
  await removeFiles(...(await filesOf("t.distributor_id = ?", [distributorId])));
}

async function readContact() {
  const [rows] = await db.query(`SELECT k, v FROM app_settings WHERE k LIKE 'support_%'`);
  const out = Object.fromEntries(CONTACT_KEYS.map((k) => [k, ""]));
  for (const { k, v } of rows) if (CONTACT_KEYS.includes(k.slice(8))) out[k.slice(8)] = v;
  return out;
}

const messageRow = (m) => ({
  id: m.id,
  from: m.sender, // 'user' | 'admin'
  admin: m.admin_username || undefined,
  message: m.message,
  image: m.image,
  voice: m.voice,
  voiceSeconds: m.voice_seconds,
  createdAt: m.created_at,
});

// Saves one message (with optional files) in a conversation.
async function addMessage(ticketId, sender, body, adminUsername = null) {
  const text = String(body.message || "").trim().slice(0, 4000);
  if (!text && !body.image && !body.voice) throw new Error("empty_message");
  let image = null;
  let voice = null;
  try {
    image = await saveFile(body.image, IMAGE_TYPES);
    voice = await saveFile(body.voice, VOICE_TYPES);
  } catch {
    await removeFiles(image, voice);
    throw new Error("invalid_file");
  }
  const seconds = voice ? Math.min(Math.max(Math.round(Number(body.voice.seconds) || 0), 0), 600) : null;
  await db.execute(
    `INSERT INTO support_messages (ticket_id, sender, admin_username, message, image, voice, voice_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, sender, adminUsername, text, image, voice, seconds],
  );
}

const fail = (res, err) => {
  const code = ["empty_message", "invalid_file"].includes(err.message) ? err.message : null;
  if (!code) throw err;
  res.status(400).json({ error: code });
};

async function tooManyToday(distributorId) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id
     WHERE t.distributor_id = ? AND m.sender = 'user' AND m.created_at > NOW() - INTERVAL 1 DAY`,
    [distributorId],
  );
  return n >= MESSAGES_PER_DAY;
}

async function threadMessages(ticketIds) {
  if (!ticketIds.length) return {};
  const [rows] = await db.query(`SELECT * FROM support_messages WHERE ticket_id IN (?) ORDER BY id`, [ticketIds]);
  const out = {};
  for (const m of rows) (out[m.ticket_id] ||= []).push(messageRow(m));
  return out;
}

// --- App (public / logged-in user) ---

export async function contact(req, res) {
  res.json(await readContact());
}

// Start a conversation. Body: { message, image?: { data, type }, voice?: { data, type, seconds }, appVersion }
export async function createTicket(req, res) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM support_tickets WHERE distributor_id = ? AND created_at > NOW() - INTERVAL 1 DAY`,
    [req.distributorId],
  );
  if (n >= NEW_PER_DAY || (await tooManyToday(req.distributorId))) return res.status(429).json({ error: "too_many" });

  const body = req.body || {};
  if (!String(body.message || "").trim() && !body.image && !body.voice) return res.status(400).json({ error: "empty_message" });
  const [r] = await db.execute(`INSERT INTO support_tickets (distributor_id, app_version) VALUES (?, ?)`, [
    req.distributorId,
    String(body.appVersion || "").slice(0, 20),
  ]);
  try {
    await addMessage(r.insertId, "user", body);
  } catch (err) {
    await db.execute(`DELETE FROM support_tickets WHERE id = ?`, [r.insertId]);
    return fail(res, err);
  }
  res.json({ id: r.insertId });
}

// The user's conversations, newest activity first, with the last message as a preview.
export async function myTickets(req, res) {
  const [rows] = await db.execute(
    `SELECT t.*, (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS count,
       (SELECT MAX(m.id) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender = 'admin') AS last_reply
     FROM support_tickets t WHERE t.distributor_id = ? ORDER BY t.updated_at DESC LIMIT 50`,
    [req.distributorId],
  );
  const last = {};
  if (rows.length) {
    const [msgs] = await db.query(
      `SELECT m.* FROM support_messages m JOIN (SELECT ticket_id, MAX(id) AS id FROM support_messages WHERE ticket_id IN (?) GROUP BY ticket_id) x ON x.id = m.id`,
      [rows.map((r) => r.id)],
    );
    for (const m of msgs) last[m.ticket_id] = messageRow(m);
  }
  res.json({
    tickets: rows.map((t) => ({
      id: t.id,
      status: t.status,
      count: t.count,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      unread: !!t.last_reply && t.last_reply > t.user_seen_id,
      last: last[t.id],
    })),
  });
}

const ownTicket = async (req) => {
  const [[t]] = await db.execute(`SELECT * FROM support_tickets WHERE id = ? AND distributor_id = ?`, [req.params.id, req.distributorId]);
  return t;
};

// One conversation; opening it marks support's replies as seen.
export async function myThread(req, res) {
  const t = await ownTicket(req);
  if (!t) return res.status(404).json({ error: "not_found" });
  const messages = (await threadMessages([t.id]))[t.id] || [];
  if (messages.length) await db.execute(`UPDATE support_tickets SET user_seen_id = ? WHERE id = ?`, [messages.at(-1).id, t.id]);
  res.json({ id: t.id, status: t.status, createdAt: t.created_at, messages });
}

// User replies in a conversation; this (re)opens it for support.
export async function userReply(req, res) {
  const t = await ownTicket(req);
  if (!t) return res.status(404).json({ error: "not_found" });
  if (await tooManyToday(req.distributorId)) return res.status(429).json({ error: "too_many" });
  try {
    await addMessage(t.id, "user", req.body || {});
  } catch (err) {
    return fail(res, err);
  }
  await db.execute(`UPDATE support_tickets SET status = 'open', updated_at = NOW() WHERE id = ?`, [t.id]);
  res.json({ ok: true });
}

// A photo or voice note from one of the user's own conversations. POST with the token, because
// <img>/<audio> can't send it; the app shows the result as a blob URL.
export async function myFile(req, res) {
  const name = path.basename(String(req.body?.name || ""));
  if (!FILE_NAME.test(name)) return res.status(404).end();
  const [[row]] = await db.execute(
    `SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id
     WHERE t.distributor_id = ? AND (m.image = ? OR m.voice = ?) LIMIT 1`,
    [req.distributorId, name, name],
  );
  if (!row) return res.status(404).end();
  res.set("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(UPLOADS, name), (err) => err && !res.headersSent && res.status(404).end());
}

// --- Admin dashboard ---

export async function adminTickets(req, res) {
  const status = ["open", "replied", "closed"].includes(req.query.status) ? req.query.status : null;
  const [rows] = await db.query(
    `SELECT t.*, d.name AS user_name, d.phone AS user_phone
     FROM support_tickets t JOIN distributors d ON d.id = t.distributor_id
     ${status ? "WHERE t.status = ?" : ""}
     ORDER BY t.status = 'open' DESC, t.updated_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  const [[counts]] = await db.query(
    `SELECT COALESCE(SUM(status = 'open'), 0) AS open, COALESCE(SUM(status = 'replied'), 0) AS replied,
       COALESCE(SUM(status = 'closed'), 0) AS closed, COUNT(*) AS total FROM support_tickets`,
  );
  const messages = await threadMessages(rows.map((r) => r.id));
  res.json({
    counts,
    tickets: rows.map((t) => ({
      id: t.id,
      status: t.status,
      appVersion: t.app_version,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      user: { id: t.distributor_id, name: t.user_name, phone: t.user_phone },
      messages: messages[t.id] || [],
    })),
  });
}

// Attachment for <img>/<audio> in the dashboard (cookie-authenticated GET).
export async function adminFile(req, res) {
  const name = path.basename(req.params.name);
  if (!FILE_NAME.test(name)) return res.status(404).end();
  res.set("Cache-Control", "private, max-age=86400");
  res.sendFile(path.join(UPLOADS, name), (err) => err && !res.headersSent && res.status(404).end());
}

export async function replyTicket(req, res) {
  const [[t]] = await db.execute(`SELECT id FROM support_tickets WHERE id = ?`, [req.params.id]);
  if (!t) return res.status(404).json({ error: "not_found" });
  try {
    await addMessage(t.id, "admin", { message: req.body?.reply }, req.admin.username);
  } catch (err) {
    return fail(res, err);
  }
  await db.execute(`UPDATE support_tickets SET status = 'replied', updated_at = NOW() WHERE id = ?`, [t.id]);
  res.json({ ok: true });
}

export async function setTicketStatus(req, res) {
  const { status } = req.body || {};
  if (!["open", "replied", "closed"].includes(status)) return res.status(400).json({ error: "invalid_input" });
  const [r] = await db.execute(`UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?`, [status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}

export async function deleteTicket(req, res) {
  const files = await filesOf("t.id = ?", [req.params.id]);
  const [r] = await db.execute(`DELETE FROM support_tickets WHERE id = ?`, [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  await removeFiles(...files);
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
