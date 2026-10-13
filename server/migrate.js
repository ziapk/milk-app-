import { db } from "./db.js";
import { hashPassword } from "./controllers/adminAuthController.js";

// Small schema changes applied on startup, so deploying is just `git pull` + restart.
// Each step checks first, so running it again is harmless.
const hasColumn = async (table, column) => {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
};

export async function migrate() {
  if (!(await hasColumn("sessions", "last_used_at"))) {
    await db.query(
      `ALTER TABLE sessions ADD COLUMN last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    console.log("migrate: added sessions.last_used_at");
  }
  if (!(await hasColumn("customers", "deleted"))) {
    await db.query(`ALTER TABLE customers ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER active`);
    console.log("migrate: added customers.deleted");
  }
  if (!(await hasColumn("distributors", "disabled"))) {
    await db.query(`ALTER TABLE distributors ADD COLUMN disabled TINYINT(1) NOT NULL DEFAULT 0 AFTER locked_until`);
    console.log("migrate: added distributors.disabled");
  }
  if (!(await hasColumn("distributors", "last_seen_at"))) {
    await db.query(`ALTER TABLE distributors ADD COLUMN last_seen_at DATETIME NULL AFTER disabled`);
    // Start from the newest session activity so existing users don't all show "never".
    await db.query(
      `UPDATE distributors d SET last_seen_at = (SELECT MAX(s.last_used_at) FROM sessions s WHERE s.distributor_id = d.id)`,
    );
    console.log("migrate: added distributors.last_seen_at");
  }

  // Dashboard admin tables (CREATE ... IF NOT EXISTS is safe to repeat).
  await db.query(`CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_sessions (
  token CHAR(64) PRIMARY KEY,
  admin_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
)`);

  // First admin: created once from ADMIN_USER / ADMIN_PASSWORD in .env when there is none yet.
  // After that, admins are managed in the dashboard (or with `npm run create-admin`).
  const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM admins`);
  if (n === 0 && process.env.ADMIN_PASSWORD) {
    const username = (process.env.ADMIN_USER || "admin").toLowerCase();
    await db.execute(`INSERT INTO admins (username, name, password_hash) VALUES (?, ?, ?)`, [
      username, "Administrator", await hashPassword(process.env.ADMIN_PASSWORD),
    ]);
    console.log(`migrate: created first admin "${username}" from .env`);
  }
}
