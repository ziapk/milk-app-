import { db } from "./db.js";

// Small schema changes applied on startup, so deploying is just `git pull` + restart.
// Each step checks first, so running it again is harmless.
export async function migrate() {
  const [cols] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'last_used_at'`,
  );
  if (cols.length === 0) {
    await db.query(
      `ALTER TABLE sessions ADD COLUMN last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    console.log("migrate: added sessions.last_used_at");
  }
}
