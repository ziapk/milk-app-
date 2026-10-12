import { db } from "../db.js";

// A session that hasn't been used for this long is treated as logged out.
export const SESSION_DAYS = 90;

export const requireAuth = async (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const [rows] = await db.execute(
    `SELECT distributor_id, last_used_at < NOW() - INTERVAL 1 HOUR AS stale
     FROM sessions WHERE token = ? AND last_used_at > NOW() - INTERVAL ${SESSION_DAYS} DAY LIMIT 1`,
    [token],
  );
  if (rows.length === 0) return res.status(401).json({ error: "unauthorized" });

  // Sliding expiry; only written once an hour so every sync isn't a DB write.
  if (rows[0].stale) await db.execute(`UPDATE sessions SET last_used_at = NOW() WHERE token = ?`, [token]);

  req.distributorId = rows[0].distributor_id;
  req.token = token;
  next();
};
