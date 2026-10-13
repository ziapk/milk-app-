import crypto from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db.js";

const scrypt = promisify(crypto.scrypt);
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
export const ADMIN_SESSION_DAYS = 7;
export const COOKIE = "mp_admin";

const cleanUsername = (u) => String(u || "").trim().toLowerCase();
const validUsername = (u) => /^[a-z0-9._-]{3,50}$/.test(u);
// New passwords need 8+ characters; existing ones (e.g. the first one from .env) are only checked.
const validPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 200;
const givenPassword = (p) => typeof p === "string" && p.length > 0 && p.length <= 200;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(String(password), salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function checkPassword(password, stored) {
  const [salt, hex] = stored.split(":");
  const hash = await scrypt(String(password), salt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hex, "hex"));
}

// HttpOnly: page scripts can't read the token. SameSite=Strict: other sites can't send it (CSRF).
function setCookie(req, res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    path: "/api/admin",
    maxAge: token ? ADMIN_SESSION_DAYS * 864e5 : 0,
  });
}

// Extra brake per IP on top of the per-account lock, so one address can't try many usernames.
const ipFails = new Map(); // ip -> { count, until }
const IP_MAX = 20;

export const login = async (req, res) => {
  const ip = req.ip;
  const entry = ipFails.get(ip);
  if (entry?.until > Date.now()) return res.status(429).json({ error: "locked" });
  const failIp = () => {
    const count = (entry?.count || 0) + 1;
    ipFails.set(ip, count >= IP_MAX ? { count: 0, until: Date.now() + LOCK_MINUTES * 60_000 } : { count });
  };

  const username = cleanUsername(req.body?.username);
  const password = req.body?.password;
  const [rows] = await db.execute(
    `SELECT id, name, username, password_hash, failed_attempts, locked_until > NOW() AS locked
     FROM admins WHERE username = ? LIMIT 1`,
    [username],
  );
  const admin = rows[0];
  if (!admin) {
    failIp();
    return res.status(401).json({ error: "wrong_login" });
  }
  if (admin.locked) return res.status(429).json({ error: "locked" });

  if (!givenPassword(password) || !(await checkPassword(password, admin.password_hash))) {
    failIp();
    const attempts = admin.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.execute(
        `UPDATE admins SET failed_attempts = 0, locked_until = NOW() + INTERVAL ${LOCK_MINUTES} MINUTE WHERE id = ?`,
        [admin.id],
      );
      return res.status(429).json({ error: "locked" });
    }
    await db.execute(`UPDATE admins SET failed_attempts = ? WHERE id = ?`, [attempts, admin.id]);
    return res.status(401).json({ error: "wrong_login" });
  }

  ipFails.delete(ip);
  await db.execute(
    `UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?`,
    [admin.id],
  );
  await db.execute(
    `DELETE FROM admin_sessions WHERE admin_id = ? AND last_used_at < NOW() - INTERVAL ${ADMIN_SESSION_DAYS} DAY`,
    [admin.id],
  );
  const token = crypto.randomBytes(32).toString("hex");
  await db.execute(`INSERT INTO admin_sessions (token, admin_id) VALUES (?, ?)`, [token, admin.id]);
  setCookie(req, res, token);
  res.json({ id: admin.id, name: admin.name, username: admin.username });
};

export const logout = async (req, res) => {
  await db.execute(`DELETE FROM admin_sessions WHERE token = ?`, [req.adminToken]);
  setCookie(req, res, "");
  res.json({ status: true });
};

export const me = (req, res) => res.json(req.admin);

export const changePassword = async (req, res) => {
  const { current, next } = req.body || {};
  if (!validPassword(next)) return res.status(400).json({ error: "weak_password" });
  const [[row]] = await db.execute(`SELECT password_hash FROM admins WHERE id = ?`, [req.admin.id]);
  if (!givenPassword(current) || !(await checkPassword(current, row.password_hash))) {
    return res.status(401).json({ error: "wrong_password" });
  }
  await db.execute(`UPDATE admins SET password_hash = ? WHERE id = ?`, [await hashPassword(next), req.admin.id]);
  // Other browsers logged in as this admin must log in again with the new password.
  await db.execute(`DELETE FROM admin_sessions WHERE admin_id = ? AND token <> ?`, [req.admin.id, req.adminToken]);
  res.json({ status: true });
};

// --- Managing admin accounts

export const listAdmins = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, username, name, created_at AS createdAt, last_login_at AS lastLoginAt,
       COALESCE(locked_until > NOW(), 0) AS locked
     FROM admins ORDER BY created_at`,
  );
  res.json(rows.map((a) => ({ ...a, locked: !!a.locked, you: a.id === req.admin.id })));
};

export const createAdmin = async (req, res) => {
  const username = cleanUsername(req.body?.username);
  const name = String(req.body?.name || "").trim().slice(0, 100);
  const { password } = req.body || {};
  if (!validUsername(username) || !name) return res.status(400).json({ error: "invalid_input" });
  if (!validPassword(password)) return res.status(400).json({ error: "weak_password" });
  try {
    await db.execute(`INSERT INTO admins (username, name, password_hash) VALUES (?, ?, ?)`, [
      username, name, await hashPassword(password),
    ]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "username_taken" });
    throw err;
  }
  res.json({ status: true });
};

export const deleteAdmin = async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.admin.id) return res.status(400).json({ error: "cannot_delete_self" });
  const [r] = await db.execute(`DELETE FROM admins WHERE id = ?`, [id]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ status: true });
};
