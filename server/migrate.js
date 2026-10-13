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

  // Products: one main product per account (name/unit in distributors.settings), extra products in
  // a catalogue, extra daily products per customer, and shop (counter) sales.
  if (!(await hasColumn("distributors", "settings"))) {
    await db.query(`ALTER TABLE distributors ADD COLUMN settings TEXT NULL AFTER last_seen_at`);
    await db.query(`ALTER TABLE distributors ADD COLUMN settings_updated_at TIMESTAMP(3) NULL AFTER settings`);
    console.log("migrate: added distributors.settings");
  }
  if (!(await hasColumn("customers", "items"))) {
    await db.query(`ALTER TABLE customers ADD COLUMN items TEXT NULL AFTER default_qty`);
    console.log("migrate: added customers.items");
  }
  if (!(await hasColumn("deliveries", "product_id"))) {
    // '' = the main product, so every existing row keeps its meaning.
    await db.query(`ALTER TABLE deliveries ADD COLUMN product_id VARCHAR(24) NOT NULL DEFAULT '' AFTER customer_id`);
    await db.query(`ALTER TABLE deliveries DROP PRIMARY KEY, ADD PRIMARY KEY (distributor_id, customer_id, date, product_id)`);
    console.log("migrate: added deliveries.product_id");
  }
  if (!(await hasColumn("purchases", "product_id"))) {
    // '' = the main product (all purchases before this were of the main product).
    await db.query(`ALTER TABLE purchases ADD COLUMN product_id VARCHAR(24) NOT NULL DEFAULT '' AFTER supplier_id`);
    console.log("migrate: added purchases.product_id");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS products (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_products_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);
  await db.query(`CREATE TABLE IF NOT EXISTS sales (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  customer_id VARCHAR(24) NOT NULL DEFAULT '',
  date DATE NOT NULL,
  items TEXT NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NOT NULL DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_sales_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);

  // Supply module: milk bought from suppliers (CREATE ... IF NOT EXISTS is safe to repeat).
  await db.query(`CREATE TABLE IF NOT EXISTS suppliers (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_suppliers_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);
  await db.query(`CREATE TABLE IF NOT EXISTS purchases (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  supplier_id VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  qty DECIMAL(8,2) NOT NULL DEFAULT 0,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NOT NULL DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_purchases_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);
  await db.query(`CREATE TABLE IF NOT EXISTS supplier_payments (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  supplier_id VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_supplier_payments_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);

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
