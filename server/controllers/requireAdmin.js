import { db } from "../db.js";
import { ADMIN_SESSION_DAYS, COOKIE } from "./adminAuthController.js";

const readCookie = (req, name) => {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
};

// Dashboard requests carry the session cookie set at login (see adminAuthController).
export const requireAdmin = async (req, res, next) => {
  const token = readCookie(req, COOKIE);
  if (!/^[0-9a-f]{64}$/.test(token)) return res.status(401).json({ error: "unauthorized" });

  const [rows] = await db.execute(
    `SELECT a.id, a.username, a.name, s.last_used_at < NOW() - INTERVAL 1 HOUR AS stale
     FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token = ? AND s.last_used_at > NOW() - INTERVAL ${ADMIN_SESSION_DAYS} DAY LIMIT 1`,
    [token],
  );
  if (rows.length === 0) return res.status(401).json({ error: "unauthorized" });
  if (rows[0].stale) await db.execute(`UPDATE admin_sessions SET last_used_at = NOW() WHERE token = ?`, [token]);

  const { stale, ...admin } = rows[0];
  req.admin = admin;
  req.adminToken = token;
  next();
};
