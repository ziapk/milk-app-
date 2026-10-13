CREATE DATABASE IF NOT EXISTS milk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE milk_db;

CREATE TABLE IF NOT EXISTS distributors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  pin_hash VARCHAR(200) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token CHAR(64) PRIMARY KEY,
  distributor_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

-- Row ids are generated on the phone so entries can be made offline.
-- Every table is keyed by distributor_id so one distributor can never touch another's rows.
CREATE TABLE IF NOT EXISTS customers (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  default_qty DECIMAL(6,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_customers_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deliveries (
  distributor_id INT NOT NULL,
  customer_id VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  qty DECIMAL(6,2) NOT NULL DEFAULT 0,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, customer_id, date),
  KEY idx_deliveries_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  customer_id VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_payments_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  distributor_id INT NOT NULL,
  id VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'other',
  amount DECIMAL(12,2) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (distributor_id, id),
  KEY idx_expenses_sync (distributor_id, updated_at),
  FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE CASCADE
);

-- Milk the distributor buys: suppliers, purchases (milk in) and payments to suppliers.
CREATE TABLE IF NOT EXISTS suppliers (
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
);

CREATE TABLE IF NOT EXISTS purchases (
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
);

CREATE TABLE IF NOT EXISTS supplier_payments (
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
);

-- Dashboard logins (separate from distributors, who use the phone app).
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token CHAR(64) PRIMARY KEY,
  admin_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
