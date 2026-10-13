// Create a dashboard admin, or reset an existing admin's password (also clears a lockout).
// Usage: npm run create-admin -- <username> <password> [name]
import { db } from "../db.js";
import { hashPassword } from "../controllers/adminAuthController.js";
import { migrate } from "../migrate.js";

const [username, password, ...nameParts] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: npm run create-admin -- <username> <password> [name]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

await migrate();
const user = username.trim().toLowerCase();
const name = nameParts.join(" ").trim() || "Administrator";
const [r] = await db.execute(
  `INSERT INTO admins (username, name, password_hash) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), failed_attempts = 0, locked_until = NULL`,
  [user, name, await hashPassword(password)],
);
console.log(r.affectedRows === 1 ? `Created admin "${user}".` : `Password reset for admin "${user}".`);
await db.end();
