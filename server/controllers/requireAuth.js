import { db } from "../db.js";

export const requireAuth = async (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const [rows] = await db.execute(
    `SELECT distributor_id FROM sessions WHERE token = ? LIMIT 1`,
    [token],
  );
  if (rows.length === 0) return res.status(401).json({ error: "unauthorized" });

  req.distributorId = rows[0].distributor_id;
  req.token = token;
  next();
};
