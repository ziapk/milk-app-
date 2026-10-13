import crypto from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db.js";
import { SESSION_DAYS } from "./requireAuth.js";

const scrypt = promisify(crypto.scrypt);
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const cleanPhone = (p) => String(p || "").replace(/\D/g, "");
export const validPin = (pin) => /^\d{4,6}$/.test(String(pin || ""));

export async function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(String(pin), salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function checkPin(pin, stored) {
  const [salt, hex] = stored.split(":");
  const hash = await scrypt(String(pin), salt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hex, "hex"));
}

async function newSession(distributorId) {
  await db.execute(
    `DELETE FROM sessions WHERE distributor_id = ? AND last_used_at < NOW() - INTERVAL ${SESSION_DAYS} DAY`,
    [distributorId],
  );
  const token = crypto.randomBytes(32).toString("hex");
  await db.execute(
    `INSERT INTO sessions (token, distributor_id) VALUES (?, ?)`,
    [token, distributorId],
  );
  return token;
}

export const register = async (req, res) => {
  const { name, pin } = req.body || {};
  const phone = cleanPhone(req.body?.phone);

  if (phone.length < 10 || !validPin(pin) || !String(name || "").trim()) {
    return res.status(400).json({ error: "invalid_input" });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO distributors (phone, name, pin_hash) VALUES (?, ?, ?)`,
      [phone, String(name).trim().slice(0, 100), await hashPin(pin)],
    );
    const token = await newSession(result.insertId);
    res.json({ token, name: String(name).trim(), phone });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "phone_taken" });
    throw err;
  }
};

export const login = async (req, res) => {
  const phone = cleanPhone(req.body?.phone);
  const { pin } = req.body || {};

  const [rows] = await db.execute(
    `SELECT id, name, pin_hash, failed_attempts, disabled, locked_until > NOW() AS locked
     FROM distributors WHERE phone = ? LIMIT 1`,
    [phone],
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "wrong_login" });
  if (user.disabled) return res.status(403).json({ error: "disabled" });
  if (user.locked) return res.status(429).json({ error: "locked" });

  if (!validPin(pin) || !(await checkPin(pin, user.pin_hash))) {
    // A 4-digit PIN is easy to guess, so lock the account after a few wrong tries.
    const attempts = user.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.execute(
        `UPDATE distributors SET failed_attempts = 0,
           locked_until = NOW() + INTERVAL ${LOCK_MINUTES} MINUTE WHERE id = ?`,
        [user.id],
      );
      return res.status(429).json({ error: "locked" });
    }
    await db.execute(`UPDATE distributors SET failed_attempts = ? WHERE id = ?`, [attempts, user.id]);
    return res.status(401).json({ error: "wrong_login" });
  }

  await db.execute(
    `UPDATE distributors SET failed_attempts = 0, locked_until = NULL, last_seen_at = NOW() WHERE id = ?`,
    [user.id],
  );
  const token = await newSession(user.id);
  res.json({ token, name: user.name, phone });
};

export const logout = async (req, res) => {
  await db.execute(`DELETE FROM sessions WHERE token = ?`, [req.token]);
  res.json({ status: true });
};

export const logoutOthers = async (req, res) => {
  await db.execute(`DELETE FROM sessions WHERE distributor_id = ? AND token <> ?`, [req.distributorId, req.token]);
  res.json({ status: true });
};

// Google Play requires in-app account deletion. Every data table cascades from distributors.
export const deleteAccount = async (req, res) => {
  const [rows] = await db.execute(`SELECT pin_hash FROM distributors WHERE id = ?`, [req.distributorId]);
  if (!rows[0] || !validPin(req.body?.pin) || !(await checkPin(req.body.pin, rows[0].pin_hash))) {
    return res.status(401).json({ error: "wrong_pin" });
  }
  await db.execute(`DELETE FROM distributors WHERE id = ?`, [req.distributorId]);
  res.json({ status: true });
};
