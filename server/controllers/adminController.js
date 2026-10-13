import { db } from "../db.js";
import { hashPin, cleanPhone, validPin } from "./authController.js";
import { SESSION_DAYS } from "./requireAuth.js";

const userId = (req) => Number(req.params.id);
const DAYS = 30;

// The last DAYS dates (oldest first) as YYYY-MM-DD in the DB's time zone, with 0 where nothing happened.
async function dailySeries(sql) {
  const [rows] = await db.query(sql);
  const byDay = new Map(rows.map((r) => [r.day, Number(r.value)]));
  const [[{ today }]] = await db.query(`SELECT CURDATE() AS today`);
  const out = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, value: byDay.get(day) || 0 });
  }
  return out;
}

const MONTH_START = `DATE_FORMAT(CURDATE(), '%Y-%m-01')`;

export const overview = async (req, res) => {
  const [[users]] = await db.query(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(last_seen_at > NOW() - INTERVAL 7 DAY), 0) AS active7,
       COALESCE(SUM(created_at > NOW() - INTERVAL 30 DAY), 0) AS new30,
       COALESCE(SUM(disabled = 1), 0) AS blocked
     FROM distributors`,
  );
  const [[{ customers }]] = await db.query(
    `SELECT COUNT(*) AS customers FROM customers WHERE deleted = 0 AND active = 1`,
  );
  const [[month]] = await db.query(
    `SELECT COALESCE(SUM(qty), 0) AS liters, COALESCE(SUM(qty * rate), 0) AS sales
     FROM deliveries WHERE deleted = 0 AND date >= ${MONTH_START}`,
  );
  const [[{ collected }]] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS collected FROM payments WHERE deleted = 0 AND date >= ${MONTH_START}`,
  );
  const [[supply]] = await db.query(
    `SELECT
       (SELECT COALESCE(SUM(qty), 0) FROM purchases WHERE deleted = 0 AND date >= ${MONTH_START}) AS liters,
       (SELECT COALESCE(SUM(qty * rate), 0) FROM purchases WHERE deleted = 0 AND date >= ${MONTH_START}) AS amount,
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE deleted = 0 AND date >= ${MONTH_START}) AS paid,
       (SELECT COALESCE(SUM(qty * rate), 0) FROM purchases WHERE deleted = 0) -
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE deleted = 0) AS owed,
       (SELECT COUNT(*) FROM suppliers WHERE deleted = 0) AS suppliers`,
  );
  const liters = await dailySeries(
    `SELECT date AS day, SUM(qty) AS value FROM deliveries
     WHERE deleted = 0 AND date > CURDATE() - INTERVAL ${DAYS} DAY GROUP BY date`,
  );
  const signups = await dailySeries(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS value FROM distributors
     WHERE created_at >= CURDATE() - INTERVAL ${DAYS - 1} DAY GROUP BY day`,
  );
  const [top] = await db.query(
    `SELECT d.id, d.name, d.phone, SUM(x.qty) AS liters, SUM(x.qty * x.rate) AS sales
     FROM deliveries x JOIN distributors d ON d.id = x.distributor_id
     WHERE x.deleted = 0 AND x.date >= ${MONTH_START}
     GROUP BY d.id ORDER BY liters DESC LIMIT 5`,
  );
  res.json({
    users,
    customers,
    month: { liters: Number(month.liters), sales: Number(month.sales), collected: Number(collected) },
    supply: {
      suppliers: Number(supply.suppliers),
      liters: Number(supply.liters),
      amount: Number(supply.amount),
      paid: Number(supply.paid),
      owed: Number(supply.owed),
    },
    liters,
    signups,
    top: top.map((t) => ({ ...t, liters: Number(t.liters), sales: Number(t.sales) })),
  });
};

export const userDetail = async (req, res) => {
  const id = userId(req);
  const [[user]] = await db.execute(
    `SELECT id, name, phone, created_at AS createdAt, last_seen_at AS lastSeenAt,
       disabled = 1 AS disabled, COALESCE(locked_until > NOW(), 0) AS locked
     FROM distributors WHERE id = ?`,
    [id],
  );
  if (!user) return res.status(404).json({ error: "not_found" });
  const [[c]] = await db.execute(
    `SELECT COALESCE(SUM(active = 1), 0) AS active, COALESCE(SUM(active = 0), 0) AS stopped
     FROM customers WHERE distributor_id = ? AND deleted = 0`,
    [id],
  );
  const [[d]] = await db.execute(
    `SELECT COALESCE(SUM(qty * rate), 0) AS salesAll,
       COALESCE(SUM(IF(date >= ${MONTH_START}, qty, 0)), 0) AS litersMonth,
       COALESCE(SUM(IF(date >= ${MONTH_START}, qty * rate, 0)), 0) AS salesMonth,
       MAX(date) AS lastDelivery
     FROM deliveries WHERE distributor_id = ? AND deleted = 0`,
    [id],
  );
  const [[p]] = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) AS paidAll,
       COALESCE(SUM(IF(date >= ${MONTH_START}, amount, 0)), 0) AS paidMonth
     FROM payments WHERE distributor_id = ? AND deleted = 0`,
    [id],
  );
  const [[{ devices }]] = await db.execute(
    `SELECT COUNT(*) AS devices FROM sessions WHERE distributor_id = ?
       AND last_used_at > NOW() - INTERVAL ${SESSION_DAYS} DAY`,
    [id],
  );
  const [[sup]] = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM suppliers WHERE distributor_id = ? AND deleted = 0) AS suppliers,
       (SELECT COALESCE(SUM(qty), 0) FROM purchases WHERE distributor_id = ? AND deleted = 0 AND date >= ${MONTH_START}) AS boughtMonth,
       (SELECT COALESCE(SUM(qty * rate), 0) FROM purchases WHERE distributor_id = ? AND deleted = 0) -
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE distributor_id = ? AND deleted = 0) AS owedSuppliers`,
    [id, id, id, id],
  );
  const n = (v) => Number(v);
  res.json({
    ...user,
    suppliers: n(sup.suppliers),
    boughtMonth: n(sup.boughtMonth),
    owedSuppliers: n(sup.owedSuppliers),
    disabled: !!user.disabled,
    locked: !!user.locked,
    devices,
    customersActive: n(c.active),
    customersStopped: n(c.stopped),
    litersMonth: n(d.litersMonth),
    salesMonth: n(d.salesMonth),
    paidMonth: n(p.paidMonth),
    due: n(d.salesAll) - n(p.paidAll),
    lastDelivery: d.lastDelivery,
  });
};

export const listUsers = async (req, res) => {
  const [users] = await db.query(
    `SELECT d.id, d.name, d.phone, d.created_at AS createdAt, d.last_seen_at AS lastSeenAt,
       d.disabled = 1 AS disabled, COALESCE(d.locked_until > NOW(), 0) AS locked,
       (SELECT COUNT(*) FROM customers c WHERE c.distributor_id = d.id AND c.deleted = 0) AS customers,
       (SELECT COUNT(*) FROM sessions s WHERE s.distributor_id = d.id
          AND s.last_used_at > NOW() - INTERVAL ${SESSION_DAYS} DAY) AS devices,
       (SELECT MAX(x.date) FROM deliveries x WHERE x.distributor_id = d.id AND x.deleted = 0) AS lastDelivery
     FROM distributors d
     ORDER BY d.created_at DESC`,
  );
  const [[stats]] = await db.query(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(last_seen_at > NOW() - INTERVAL 7 DAY), 0) AS active7,
       COALESCE(SUM(created_at > NOW() - INTERVAL 30 DAY), 0) AS new30,
       COALESCE(SUM(disabled = 1), 0) AS disabled
     FROM distributors`,
  );
  res.json({
    stats,
    users: users.map((u) => ({ ...u, disabled: !!u.disabled, locked: !!u.locked })),
  });
};

// Same rules as signing up in the app; the user then logs in on their phone with this PIN.
export const createUser = async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 100);
  const phone = cleanPhone(req.body?.phone);
  const pin = String(req.body?.pin || "");
  if (!name || phone.length < 10) return res.status(400).json({ error: "invalid_user" });
  if (!validPin(pin)) return res.status(400).json({ error: "invalid_pin" });
  try {
    const [r] = await db.execute(`INSERT INTO distributors (phone, name, pin_hash) VALUES (?, ?, ?)`, [
      phone, name, await hashPin(pin),
    ]);
    res.json({ id: r.insertId, name, phone });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "phone_taken" });
    throw err;
  }
};

// Blocking also logs the user out everywhere; their data is kept.
export const setDisabled = async (req, res) => {
  const disabled = req.body?.disabled ? 1 : 0;
  const [r] = await db.execute(`UPDATE distributors SET disabled = ? WHERE id = ?`, [disabled, userId(req)]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  if (disabled) await db.execute(`DELETE FROM sessions WHERE distributor_id = ?`, [userId(req)]);
  res.json({ status: true });
};

export const unlock = async (req, res) => {
  await db.execute(`UPDATE distributors SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [userId(req)]);
  res.json({ status: true });
};

export const resetPin = async (req, res) => {
  const pin = String(req.body?.pin || "");
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "invalid_pin" });
  const [r] = await db.execute(
    `UPDATE distributors SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?`,
    [await hashPin(pin), userId(req)],
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  await db.execute(`DELETE FROM sessions WHERE distributor_id = ?`, [userId(req)]);
  res.json({ status: true });
};

export const logoutAll = async (req, res) => {
  await db.execute(`DELETE FROM sessions WHERE distributor_id = ?`, [userId(req)]);
  res.json({ status: true });
};

// Every data table cascades from distributors, so this removes all of the user's records.
export const deleteUser = async (req, res) => {
  const [r] = await db.execute(`DELETE FROM distributors WHERE id = ?`, [userId(req)]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ status: true });
};

// --- Customers (each belongs to one user/distributor). Changes here sync down to the user's
// phone, because sync sends every row whose updated_at is newer than the phone's cursor.

// Same id format the phone uses for rows it creates offline.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function customerFields(body = {}) {
  const name = String(body.name || "").trim().slice(0, 100);
  const rate = Number(body.rate);
  const defaultQty = Number(body.defaultQty);
  if (!name || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(defaultQty) || defaultQty < 0 || defaultQty > 999) {
    return null;
  }
  return {
    name,
    phone: String(body.phone || "").replace(/[^\d+]/g, "").slice(0, 20),
    address: String(body.address || "").trim().slice(0, 255),
    rate,
    defaultQty,
  };
}

export const listCustomers = async (req, res) => {
  const userFilter = Number(req.query.user) || null;
  const [rows] = await db.query(
    `SELECT c.distributor_id AS userId, d.name AS userName, c.id, c.name, c.phone, c.address,
       c.rate, c.default_qty AS defaultQty, c.active = 1 AS active,
       COALESCE(x.litersMonth, 0) AS litersMonth, x.lastDelivery,
       COALESCE(x.salesAll, 0) - COALESCE(p.paidAll, 0) AS due
     FROM customers c
     JOIN distributors d ON d.id = c.distributor_id
     LEFT JOIN (
       SELECT distributor_id, customer_id, MAX(date) AS lastDelivery, SUM(qty * rate) AS salesAll,
         SUM(IF(date >= ${MONTH_START}, qty, 0)) AS litersMonth
       FROM deliveries WHERE deleted = 0 GROUP BY distributor_id, customer_id
     ) x ON x.distributor_id = c.distributor_id AND x.customer_id = c.id
     LEFT JOIN (
       SELECT distributor_id, customer_id, SUM(amount) AS paidAll
       FROM payments WHERE deleted = 0 GROUP BY distributor_id, customer_id
     ) p ON p.distributor_id = c.distributor_id AND p.customer_id = c.id
     WHERE c.deleted = 0 ${userFilter ? "AND c.distributor_id = ?" : ""}
     ORDER BY d.name, c.name`,
    userFilter ? [userFilter] : [],
  );
  res.json(rows.map((r) => ({ ...r, active: !!r.active, litersMonth: Number(r.litersMonth), due: Number(r.due) })));
};

export const createCustomer = async (req, res) => {
  const f = customerFields(req.body);
  if (!f) return res.status(400).json({ error: "invalid_customer" });
  const [[user]] = await db.execute(`SELECT id FROM distributors WHERE id = ?`, [userId(req)]);
  if (!user) return res.status(404).json({ error: "not_found" });
  const id = uid();
  await db.execute(
    `INSERT INTO customers (distributor_id, id, name, phone, address, rate, default_qty, active, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [user.id, id, f.name, f.phone, f.address, f.rate, f.defaultQty],
  );
  res.json({ id, ...f });
};

export const updateCustomer = async (req, res) => {
  const f = customerFields(req.body);
  if (!f) return res.status(400).json({ error: "invalid_customer" });
  const [r] = await db.execute(
    `UPDATE customers SET name = ?, phone = ?, address = ?, rate = ?, default_qty = ?, active = ?,
       updated_at = CURRENT_TIMESTAMP(3)
     WHERE distributor_id = ? AND id = ? AND deleted = 0`,
    [f.name, f.phone, f.address, f.rate, f.defaultQty, req.body?.active === false ? 0 : 1, userId(req), String(req.params.customerId)],
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ status: true });
};

// --- Suppliers (milk each user buys). Same sync rule as customers: rows written here reach the
// user's phone because sync sends everything with a newer updated_at.

function supplierFields(body = {}) {
  const name = String(body.name || "").trim().slice(0, 100);
  const rate = Number(body.rate);
  if (!name || !Number.isFinite(rate) || rate < 0) return null;
  return {
    name,
    phone: String(body.phone || "").replace(/[^\d+]/g, "").slice(0, 20),
    address: String(body.address || "").trim().slice(0, 255),
    rate,
  };
}

export const listSuppliers = async (req, res) => {
  const userFilter = Number(req.query.user) || null;
  const [rows] = await db.query(
    `SELECT s.distributor_id AS userId, d.name AS userName, s.id, s.name, s.phone, s.address,
       s.rate, s.active = 1 AS active,
       COALESCE(b.litersMonth, 0) AS litersMonth, COALESCE(b.amountMonth, 0) AS amountMonth,
       COALESCE(p.paidMonth, 0) AS paidMonth, b.lastPurchase,
       COALESCE(b.amountAll, 0) - COALESCE(p.paidAll, 0) AS owed
     FROM suppliers s
     JOIN distributors d ON d.id = s.distributor_id
     LEFT JOIN (
       SELECT distributor_id, supplier_id, MAX(date) AS lastPurchase, SUM(qty * rate) AS amountAll,
         SUM(IF(date >= ${MONTH_START}, qty, 0)) AS litersMonth,
         SUM(IF(date >= ${MONTH_START}, qty * rate, 0)) AS amountMonth
       FROM purchases WHERE deleted = 0 GROUP BY distributor_id, supplier_id
     ) b ON b.distributor_id = s.distributor_id AND b.supplier_id = s.id
     LEFT JOIN (
       SELECT distributor_id, supplier_id, SUM(amount) AS paidAll,
         SUM(IF(date >= ${MONTH_START}, amount, 0)) AS paidMonth
       FROM supplier_payments WHERE deleted = 0 GROUP BY distributor_id, supplier_id
     ) p ON p.distributor_id = s.distributor_id AND p.supplier_id = s.id
     WHERE s.deleted = 0 ${userFilter ? "AND s.distributor_id = ?" : ""}
     ORDER BY d.name, s.name`,
    userFilter ? [userFilter] : [],
  );
  const n = (v) => Number(v);
  res.json(rows.map((r) => ({
    ...r, active: !!r.active, litersMonth: n(r.litersMonth), amountMonth: n(r.amountMonth), paidMonth: n(r.paidMonth), owed: n(r.owed),
  })));
};

export const createSupplier = async (req, res) => {
  const f = supplierFields(req.body);
  if (!f) return res.status(400).json({ error: "invalid_supplier" });
  const [[user]] = await db.execute(`SELECT id FROM distributors WHERE id = ?`, [userId(req)]);
  if (!user) return res.status(404).json({ error: "not_found" });
  const id = uid();
  await db.execute(
    `INSERT INTO suppliers (distributor_id, id, name, phone, address, rate, active, deleted) VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
    [user.id, id, f.name, f.phone, f.address, f.rate],
  );
  res.json({ id, ...f });
};

export const updateSupplier = async (req, res) => {
  const f = supplierFields(req.body);
  if (!f) return res.status(400).json({ error: "invalid_supplier" });
  const [r] = await db.execute(
    `UPDATE suppliers SET name = ?, phone = ?, address = ?, rate = ?, active = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE distributor_id = ? AND id = ? AND deleted = 0`,
    [f.name, f.phone, f.address, f.rate, req.body?.active === false ? 0 : 1, userId(req), String(req.params.supplierId)],
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  res.json({ status: true });
};

// One supplier's month: opening balance, purchases and payments in date order with a running
// balance, and the closing balance. Positive = the user still owes the supplier.
export const supplierLedger = async (req, res) => {
  const uidNum = userId(req);
  const sid = String(req.params.supplierId);
  const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : new Date().toISOString().slice(0, 7);
  const from = `${month}-01`;
  const [[sup]] = await db.execute(
    `SELECT s.id, s.name, s.phone, s.address, s.rate, s.active = 1 AS active, d.name AS userName
     FROM suppliers s JOIN distributors d ON d.id = s.distributor_id
     WHERE s.distributor_id = ? AND s.id = ? AND s.deleted = 0`,
    [uidNum, sid],
  );
  if (!sup) return res.status(404).json({ error: "not_found" });

  const [[open]] = await db.execute(
    `SELECT
       (SELECT COALESCE(SUM(qty * rate), 0) FROM purchases WHERE distributor_id = ? AND supplier_id = ? AND deleted = 0 AND date < ?) -
       (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments WHERE distributor_id = ? AND supplier_id = ? AND deleted = 0 AND date < ?) AS opening`,
    [uidNum, sid, from, uidNum, sid, from],
  );
  const [rows] = await db.execute(
    `SELECT 'buy' AS kind, id, date, qty, rate, qty * rate AS amount, note FROM purchases
       WHERE distributor_id = ? AND supplier_id = ? AND deleted = 0 AND date >= ? AND date < ? + INTERVAL 1 MONTH
     UNION ALL
     SELECT 'pay', id, date, NULL, NULL, -amount, note FROM supplier_payments
       WHERE distributor_id = ? AND supplier_id = ? AND deleted = 0 AND date >= ? AND date < ? + INTERVAL 1 MONTH
     ORDER BY date, kind, LENGTH(id), id`,
    [uidNum, sid, from, from, uidNum, sid, from, from],
  );
  let balance = Number(open.opening);
  const entries = rows.map((r) => {
    balance += Number(r.amount);
    return { ...r, qty: r.qty === null ? null : Number(r.qty), rate: r.rate === null ? null : Number(r.rate), amount: Number(r.amount), balance };
  });
  res.json({ supplier: { ...sup, active: !!sup.active }, month, opening: Number(open.opening), entries, closing: balance });
};
