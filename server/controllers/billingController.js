import { db } from "../db.js";
import {
  ACTIONS, METHODS, addMonths, allBilling, billingDetail, billingSettings, feeFor, saveBillingSettings,
  today, validDate, validMonth,
} from "../billing.js";

// Monthly app fee: admins set each partner's fee and record the payments they receive
// (JazzCash, EasyPaisa, bank, cash). See billing.js for how a month counts as paid.

const userId = (req) => Number(req.params.id);
const text = (v, n) => String(v ?? "").trim().slice(0, n);
const MAX_AMOUNT = 1e6;

async function ledger(id) {
  const [fees] = await db.execute(
    `SELECT from_month AS \`from\`, fee FROM billing_fees WHERE distributor_id = ? ORDER BY from_month`,
    [id],
  );
  const [paid] = await db.execute(
    `SELECT month, SUM(amount) AS amount FROM billing_payments WHERE distributor_id = ? GROUP BY month`,
    [id],
  );
  return { fees: fees.map((f) => ({ from: f.from, fee: Number(f.fee) })), paid: new Map(paid.map((p) => [p.month, Number(p.amount)])) };
}

const sendDetail = async (res, id) => {
  const detail = await billingDetail(id, { admin: true });
  if (!detail) return res.status(404).json({ error: "not_found" });
  res.json(detail);
};

// --- Dashboard ---

export const billingList = async (req, res) => {
  const data = await allBilling();
  const month = data.today.slice(0, 7);
  const [[received]] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(DISTINCT distributor_id) AS partners FROM billing_payments
     WHERE method <> 'waived' AND paid_on >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
  );
  const [[forMonth]] = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) AS amount FROM billing_payments WHERE month = ?`,
    [month],
  );
  const active = data.partners.filter((p) => !p.disabled);
  res.json({
    ...data,
    totals: {
      expected: active.reduce((s, p) => s + p.fee, 0), // this month's fees
      paidForMonth: Number(forMonth.amount), // paid against this month (incl. waived)
      received: Number(received.amount), // money received this month, any month it was for
      outstanding: active.reduce((s, p) => s + p.outstanding, 0),
      due: active.filter((p) => p.status === "due").length,
      overdue: active.filter((p) => p.status === "overdue").length,
    },
  });
};

export const billingUser = (req, res) => sendDetail(res, userId(req));

export const getBillingSettings = async (req, res) => res.json(await billingSettings());

export const putBillingSettings = async (req, res) => {
  const saved = await saveBillingSettings(req.body);
  if (!saved) return res.status(400).json({ error: "invalid_billing" });
  res.json(saved);
};

// Fee from a month onward, until changed again: months before it keep their fee, and changes
// that were scheduled after it are replaced.
export const setFee = async (req, res) => {
  const id = userId(req);
  const fee = Number(req.body?.fee);
  const from = req.body?.from;
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_AMOUNT || !validMonth(from)) {
    return res.status(400).json({ error: "invalid_fee" });
  }
  const { fees } = await ledger(id);
  if (!fees.length) return res.status(404).json({ error: "not_found" });
  // The first fee row is when billing started for this partner; nothing is charged before it.
  if (from < fees[0].from) return res.status(400).json({ error: "before_start" });
  await db.execute(`DELETE FROM billing_fees WHERE distributor_id = ? AND from_month > ?`, [id, from]);
  await db.execute(
    `INSERT INTO billing_fees (distributor_id, from_month, fee, set_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE fee = VALUES(fee), set_by = VALUES(set_by), created_at = CURRENT_TIMESTAMP`,
    [id, from, Math.round(fee * 100) / 100, req.admin.username],
  );
  await sendDetail(res, id);
};

export const deleteFee = async (req, res) => {
  const id = userId(req);
  const [[first]] = await db.execute(`SELECT MIN(from_month) AS m FROM billing_fees WHERE distributor_id = ?`, [id]);
  const [r] = await db.execute(
    `DELETE FROM billing_fees WHERE id = ? AND distributor_id = ? AND from_month <> ?`,
    [Number(req.params.feeId), id, first?.m || ""],
  );
  if (!r.affectedRows) return res.status(400).json({ error: "cannot_delete_fee" });
  await sendDetail(res, id);
};

// Records money received. For one month the amount can be anything (part payment); for several
// months in one go, each month gets what is left of its fee. "waived" counts as paid but isn't income.
export const addPayment = async (req, res) => {
  const id = userId(req);
  const b = req.body || {};
  const months = Math.min(Math.max(Math.trunc(Number(b.months) || 1), 1), 24);
  const method = METHODS.includes(b.method) ? b.method : "other";
  const day = await today();
  const paidOn = validDate(b.paidOn) && b.paidOn <= day ? b.paidOn : day;
  if (!validMonth(b.month) || b.month > addMonths(day.slice(0, 7), 24)) return res.status(400).json({ error: "invalid_payment" });

  const { fees, paid } = await ledger(id);
  if (!fees.length) return res.status(404).json({ error: "not_found" });
  if (b.month < fees[0].from) return res.status(400).json({ error: "before_start" });

  const rows = [];
  for (let i = 0; i < months; i++) {
    const month = addMonths(b.month, i);
    const left = Math.round((feeFor(fees, month) - (paid.get(month) || 0)) * 100) / 100;
    const custom = months === 1 && method !== "waived" && b.amount !== undefined && b.amount !== "";
    const amount = custom ? Math.round(Number(b.amount) * 100) / 100 : left;
    if (custom && !(Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT)) {
      return res.status(400).json({ error: "invalid_payment" });
    }
    if (amount > 0) rows.push([id, month, amount, method, text(b.reference, 60), text(b.note, 255), paidOn, req.admin.username]);
  }
  if (!rows.length) return res.status(400).json({ error: "nothing_due" });

  for (const r of rows) {
    await db.execute(
      `INSERT INTO billing_payments (distributor_id, month, amount, method, reference, note, paid_on, admin_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      r,
    );
  }
  await sendDetail(res, id);
};

export const deletePayment = async (req, res) => {
  const [[p]] = await db.execute(`SELECT distributor_id AS uid FROM billing_payments WHERE id = ?`, [Number(req.params.paymentId)]);
  if (!p) return res.status(404).json({ error: "not_found" });
  await db.execute(`DELETE FROM billing_payments WHERE id = ?`, [Number(req.params.paymentId)]);
  await sendDetail(res, p.uid);
};

// Per-partner rules: unpaid action (null = the default from settings) and extra time until a date.
export const setRules = async (req, res) => {
  const id = userId(req);
  const action = req.body?.action || null;
  const graceUntil = req.body?.graceUntil || null;
  if ((action && !ACTIONS.includes(action)) || (graceUntil && !validDate(graceUntil))) {
    return res.status(400).json({ error: "invalid_billing" });
  }
  const [r] = await db.execute(`UPDATE distributors SET billing_action = ?, billing_grace_until = ? WHERE id = ?`, [action, graceUntil, id]);
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  await sendDetail(res, id);
};

// --- Partner app ---

// The Subscription screen: state, months and payments (without admin notes).
export const myBilling = async (req, res) => {
  res.json(await billingDetail(req.distributorId));
};
