import { db } from "../db.js";

// The phone sends what changed since its last sync and gets back everything the
// server has that changed since `since`. Pulling a few seconds of overlap means a
// write that commits during the read is not missed; the phone ignores duplicates.
const OVERLAP_SECONDS = 5;

const id = (v) => typeof v === "string" && v.length > 0 && v.length <= 24;
const num = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
const date = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const flag = (v) => (v ? 1 : 0);

export const sync = async (req, res) => {
  const distributorId = req.distributorId;
  const { since, changes = {} } = req.body || {};

  const customers = (changes.customers || []).filter((c) => id(c.id) && String(c.name || "").trim() && num(c.rate) && num(c.defaultQty));
  const deliveries = (changes.deliveries || []).filter((d) => id(d.customerId) && date(d.date) && num(d.qty) && num(d.rate));
  const payments = (changes.payments || []).filter((p) => id(p.id) && id(p.customerId) && date(p.date) && num(p.amount));
  const expenses = (changes.expenses || []).filter((e) => id(e.id) && date(e.date) && num(e.amount));
  const suppliers = (changes.suppliers || []).filter((s) => id(s.id) && String(s.name || "").trim() && num(s.rate));
  const purchases = (changes.purchases || []).filter((b) => id(b.id) && id(b.supplierId) && date(b.date) && num(b.qty) && num(b.rate));
  const supplierPayments = (changes.supplierPayments || []).filter((p) => id(p.id) && id(p.supplierId) && date(p.date) && num(p.amount));

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of customers) {
      await conn.execute(
        `INSERT INTO customers (distributor_id, id, name, phone, address, rate, default_qty, active, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), address = VALUES(address),
           rate = VALUES(rate), default_qty = VALUES(default_qty), active = VALUES(active),
           deleted = VALUES(deleted), updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, c.id, String(c.name).trim().slice(0, 100), String(c.phone || "").slice(0, 20),
         String(c.address || "").slice(0, 255), Number(c.rate), Number(c.defaultQty), flag(c.active), flag(c.deleted)],
      );
    }

    for (const d of deliveries) {
      await conn.execute(
        `INSERT INTO deliveries (distributor_id, customer_id, date, qty, rate, deleted)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE qty = VALUES(qty), rate = VALUES(rate), deleted = VALUES(deleted),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, d.customerId, d.date, Number(d.qty), Number(d.rate), flag(d.deleted)],
      );
    }

    for (const p of payments) {
      await conn.execute(
        `INSERT INTO payments (distributor_id, id, customer_id, date, amount, deleted)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id), date = VALUES(date),
           amount = VALUES(amount), deleted = VALUES(deleted), updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, p.id, p.customerId, p.date, Number(p.amount), flag(p.deleted)],
      );
    }

    for (const e of expenses) {
      await conn.execute(
        `INSERT INTO expenses (distributor_id, id, date, category, amount, note, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE date = VALUES(date), category = VALUES(category), amount = VALUES(amount),
           note = VALUES(note), deleted = VALUES(deleted), updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, e.id, e.date, String(e.category || "other").slice(0, 20), Number(e.amount),
         String(e.note || "").slice(0, 255), flag(e.deleted)],
      );
    }

    for (const sp of suppliers) {
      await conn.execute(
        `INSERT INTO suppliers (distributor_id, id, name, phone, address, rate, active, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), address = VALUES(address),
           rate = VALUES(rate), active = VALUES(active), deleted = VALUES(deleted), updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, sp.id, String(sp.name).trim().slice(0, 100), String(sp.phone || "").slice(0, 20),
         String(sp.address || "").slice(0, 255), Number(sp.rate), flag(sp.active ?? true), flag(sp.deleted)],
      );
    }

    for (const b of purchases) {
      await conn.execute(
        `INSERT INTO purchases (distributor_id, id, supplier_id, date, qty, rate, note, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE supplier_id = VALUES(supplier_id), date = VALUES(date), qty = VALUES(qty),
           rate = VALUES(rate), note = VALUES(note), deleted = VALUES(deleted), updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, b.id, b.supplierId, b.date, Number(b.qty), Number(b.rate), String(b.note || "").slice(0, 255), flag(b.deleted)],
      );
    }

    for (const p of supplierPayments) {
      await conn.execute(
        `INSERT INTO supplier_payments (distributor_id, id, supplier_id, date, amount, note, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE supplier_id = VALUES(supplier_id), date = VALUES(date), amount = VALUES(amount),
           note = VALUES(note), deleted = VALUES(deleted), updated_at = CURRENT_TIMESTAMP(3)`,
        [distributorId, p.id, p.supplierId, p.date, Number(p.amount), String(p.note || "").slice(0, 255), flag(p.deleted)],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [[{ cursor }]] = await db.query(`SELECT NOW(3) AS \`cursor\``);
  const from = since || "1970-01-02 00:00:00";
  const args = [distributorId, from];
  const after = `distributor_id = ? AND updated_at > ? - INTERVAL ${OVERLAP_SECONDS} SECOND`;

  const [outCustomers] = await db.execute(
    `SELECT id, name, phone, address, rate, default_qty AS defaultQty, active = 1 AS active, deleted
     FROM customers WHERE ${after}`,
    args,
  );
  const [outDeliveries] = await db.execute(
    `SELECT customer_id AS customerId, date, qty, rate, deleted FROM deliveries WHERE ${after}`,
    args,
  );
  const [outPayments] = await db.execute(
    `SELECT id, customer_id AS customerId, date, amount, deleted FROM payments WHERE ${after}`,
    args,
  );
  const [outExpenses] = await db.execute(
    `SELECT id, date, category, amount, note, deleted FROM expenses WHERE ${after}`,
    args,
  );

  const [outSuppliers] = await db.execute(
    `SELECT id, name, phone, address, rate, active = 1 AS active, deleted FROM suppliers WHERE ${after}`,
    args,
  );
  const [outPurchases] = await db.execute(
    `SELECT id, supplier_id AS supplierId, date, qty, rate, note, deleted FROM purchases WHERE ${after}`,
    args,
  );
  const [outSupplierPayments] = await db.execute(
    `SELECT id, supplier_id AS supplierId, date, amount, note, deleted FROM supplier_payments WHERE ${after}`,
    args,
  );

  res.json({
    cursor,
    customers: outCustomers.map((c) => ({ ...c, active: !!c.active })),
    deliveries: outDeliveries,
    payments: outPayments,
    expenses: outExpenses,
    suppliers: outSuppliers.map((sp) => ({ ...sp, active: !!sp.active })),
    purchases: outPurchases,
    supplierPayments: outSupplierPayments,
  });
};
