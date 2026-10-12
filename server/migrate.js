import { db } from "./db.js";

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
}
