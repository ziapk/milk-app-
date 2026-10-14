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

  // Help & Support: a conversation (ticket) per problem, with messages from the user and from
  // support. User messages can carry a photo and a voice note; the files are in
  // server/uploads/support and the rows keep only their names.
  // status: open = waiting for support, replied = support answered last, closed.
  await db.query(`CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_id INT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  app_version VARCHAR(20) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_seen_id INT NOT NULL DEFAULT 0, -- last message the user has seen (for "new reply")
  KEY idx_support_user (distributor_id, updated_at),
  KEY idx_support_status (status, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);
  await db.query(`CREATE TABLE IF NOT EXISTS support_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sender VARCHAR(10) NOT NULL,
  admin_username VARCHAR(60) NULL,
  message TEXT NOT NULL,
  image VARCHAR(40) NULL,
  voice VARCHAR(40) NULL,
  voice_seconds SMALLINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_support_msg (ticket_id, id),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
)`);
  // First version kept one message and one reply on the ticket row: move them into messages.
  if (await hasColumn("support_tickets", "reply")) {
    await db.query(
      `INSERT INTO support_messages (ticket_id, sender, message, image, voice, voice_seconds, created_at)
       SELECT id, 'user', message, image, voice, voice_seconds, created_at FROM support_tickets`,
    );
    await db.query(
      `INSERT INTO support_messages (ticket_id, sender, admin_username, message, created_at)
       SELECT id, 'admin', replied_by, reply, replied_at FROM support_tickets WHERE reply IS NOT NULL`,
    );
    if (!(await hasColumn("support_tickets", "updated_at"))) {
      await db.query(`ALTER TABLE support_tickets ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    }
    await db.query(`UPDATE support_tickets SET updated_at = COALESCE(replied_at, created_at)`);
    await db.query(`ALTER TABLE support_tickets DROP COLUMN message, DROP COLUMN image, DROP COLUMN voice,
      DROP COLUMN voice_seconds, DROP COLUMN reply, DROP COLUMN replied_at, DROP COLUMN replied_by`);
    console.log("migrate: support tickets -> conversations");
  }
  if (!(await hasColumn("support_tickets", "user_seen_id"))) {
    await db.query(`ALTER TABLE support_tickets ADD COLUMN user_seen_id INT NOT NULL DEFAULT 0`);
    // Replies from before conversations were already shown to the user: don't flag them as new.
    await db.query(`UPDATE support_tickets t SET user_seen_id = (SELECT COALESCE(MAX(m.id), 0) FROM support_messages m WHERE m.ticket_id = t.id)`);
  }
  if (await hasColumn("support_tickets", "user_seen_at")) {
    await db.query(`ALTER TABLE support_tickets DROP COLUMN user_seen_at`);
  }

  // Small key/value settings edited in the dashboard (support phone, email, WhatsApp).
  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
  k VARCHAR(40) PRIMARY KEY,
  v TEXT NOT NULL
)`);

  // Monthly app fee (subscription): see billing.js. billing_action / billing_grace_until are
  // per-partner overrides of the unpaid action and extra time before it applies.
  if (!(await hasColumn("distributors", "billing_action"))) {
    await db.query(`ALTER TABLE distributors ADD COLUMN billing_action VARCHAR(10) NULL, ADD COLUMN billing_grace_until DATE NULL`);
    console.log("migrate: added distributors.billing_action");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS billing_fees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_id INT NOT NULL,
  from_month CHAR(7) NOT NULL, -- 'YYYY-MM': this fee applies from this month until the next row
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  set_by VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_billing_fee (distributor_id, from_month),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);
  await db.query(`CREATE TABLE IF NOT EXISTS billing_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_id INT NOT NULL,
  month CHAR(7) NOT NULL, -- 'YYYY-MM' the payment is for
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'other',
  reference VARCHAR(60) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  paid_on DATE NOT NULL,
  admin_username VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_billing_pay_user (distributor_id, month),
  KEY idx_billing_pay_date (paid_on),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
)`);
  // Partners from before billing (or added some other way) start this month, free.
  await db.query(
    `INSERT INTO billing_fees (distributor_id, from_month, fee)
     SELECT d.id, DATE_FORMAT(CURDATE(), '%Y-%m'), 0 FROM distributors d
     WHERE NOT EXISTS (SELECT 1 FROM billing_fees f WHERE f.distributor_id = d.id)`,
  );

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
