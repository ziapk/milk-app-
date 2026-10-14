import { db } from "./db.js";

// Monthly app fee (subscription) that partners pay to use the app. Months are calendar months
// ("2026-10"). Each partner has a fee history (billing_fees: this fee from this month onward), so a
// fee change never rewrites past months, and admins record payments against a month
// (billing_payments). A month is paid when its payments reach its fee; a month with fee 0 is free.
//
// The earliest unpaid month makes the partner "due" from its 1st day. After the grace days they
// are "overdue" and the unpaid action applies in the app: lock (app closed until paid),
// readonly (can look, can't add or change), or remind (banner only).

export const ACTIONS = ["lock", "readonly", "remind"];
export const METHODS = ["jazzcash", "easypaisa", "bank", "cash", "waived", "other"];
const AHEAD = 24; // months ahead that can be paid in advance

const SETTING_KEYS = {
  defaultFee: "billing_default_fee",
  graceDays: "billing_grace_days",
  action: "billing_action",
  payInfo: "billing_pay_info",
};

export const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
export const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
export const addMonths = (m, n) => {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + mo - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const round2 = (n) => Math.round(n * 100) / 100;

// The DB's date, like the rest of the server (dashboard "this month" uses CURDATE() too).
export async function today() {
  const [[{ d }]] = await db.query(`SELECT CURDATE() AS d`);
  return d;
}

export async function billingSettings() {
  const [rows] = await db.query(`SELECT k, v FROM app_settings WHERE k LIKE 'billing_%'`);
  const v = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const fee = Number(v[SETTING_KEYS.defaultFee]);
  const grace = Number(v[SETTING_KEYS.graceDays]);
  return {
    defaultFee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    graceDays: Number.isInteger(grace) && grace >= 0 ? grace : 7,
    action: ACTIONS.includes(v[SETTING_KEYS.action]) ? v[SETTING_KEYS.action] : "lock",
    payInfo: v[SETTING_KEYS.payInfo] || "",
  };
}

export async function saveBillingSettings(body = {}) {
  const fee = Number(body.defaultFee);
  const grace = Number(body.graceDays);
  if (!Number.isFinite(fee) || fee < 0 || fee > 1e6 || !Number.isInteger(grace) || grace < 0 || grace > 60 || !ACTIONS.includes(body.action)) {
    return null;
  }
  const values = { defaultFee: String(round2(fee)), graceDays: String(grace), action: body.action, payInfo: String(body.payInfo || "").trim().slice(0, 500) };
  for (const [k, key] of Object.entries(SETTING_KEYS)) {
    await db.execute(`INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [key, values[k]]);
  }
  return billingSettings();
}

// fees: [{ from, fee }] oldest first. Before the first row the partner wasn't billed.
export const feeFor = (fees, month) => {
  let fee = 0;
  for (const f of fees) {
    if (f.from > month) break;
    fee = f.fee;
  }
  return fee;
};

// A new partner's month of joining is free; the default fee starts the month after.
export async function startBilling(distributorId) {
  const { defaultFee } = await billingSettings();
  const month = (await today()).slice(0, 7);
  await db.execute(`INSERT IGNORE INTO billing_fees (distributor_id, from_month, fee) VALUES (?, ?, 0)`, [distributorId, month]);
  if (defaultFee > 0) {
    await db.execute(`INSERT IGNORE INTO billing_fees (distributor_id, from_month, fee) VALUES (?, ?, ?)`, [
      distributorId, addMonths(month, 1), defaultFee,
    ]);
  }
}

// One partner's subscription state. `paid` maps month -> amount paid for it.
// dueFrom / restrictFrom are dates, so the app can switch to "due" and then apply the unpaid
// action on its own when it is offline.
export function summarize({ fees, paid, action, graceUntil, settings, today: day }) {
  const current = day.slice(0, 7);
  const base = {
    month: current,
    fee: feeFor(fees, current),
    action: action || settings.action,
    actionOverride: action || null,
    graceDays: settings.graceDays,
    graceUntil: graceUntil || null,
    payInfo: settings.payInfo,
  };
  const next = fees.find((f) => f.from > current && f.fee !== base.fee);
  base.nextFee = next ? { month: next.from, fee: next.fee } : null;

  const start = fees[0]?.from;
  let outstanding = 0;
  let due = null; // earliest unpaid month, possibly a future one
  if (start) {
    for (let m = start; m <= addMonths(current, AHEAD); m = addMonths(m, 1)) {
      const left = round2(feeFor(fees, m) - (paid.get(m) || 0));
      if (left <= 0) continue;
      if (m <= current) outstanding += left;
      due ||= { month: m, amount: left };
      if (m >= current) break;
    }
  }

  const free = base.fee <= 0;
  if (!due) {
    const lastPaid = [...paid.keys()].filter((m) => m >= current).sort().pop();
    return { ...base, status: free ? "free" : "paid", outstanding: 0, dueMonth: null, dueAmount: 0, dueFrom: null, restrictFrom: null, paidThrough: free ? null : lastPaid || null };
  }
  const dueFrom = `${due.month}-01`;
  let restrictFrom = addDays(dueFrom, settings.graceDays);
  if (graceUntil && graceUntil >= restrictFrom) restrictFrom = addDays(graceUntil, 1);
  const status = day < dueFrom ? (free ? "free" : "paid") : day < restrictFrom ? "due" : "overdue";
  return {
    ...base,
    status,
    outstanding: round2(outstanding),
    dueMonth: due.month,
    dueAmount: due.amount,
    dueFrom,
    restrictFrom,
    // Last month covered before the first unpaid one (null when nothing was ever charged).
    paidThrough: due.month > start && feeFor(fees, addMonths(due.month, -1)) > 0 ? addMonths(due.month, -1) : null,
  };
}

// Fees and paid-per-month for one partner (id) or everyone (id undefined), grouped by partner.
async function loadLedgers(id) {
  const where = id === undefined ? "" : "WHERE distributor_id = ?";
  const args = id === undefined ? [] : [id];
  const [fees] = await db.query(
    `SELECT distributor_id AS uid, from_month AS \`from\`, fee FROM billing_fees ${where} ORDER BY from_month`,
    args,
  );
  const [paid] = await db.query(
    `SELECT distributor_id AS uid, month, SUM(amount) AS amount FROM billing_payments ${where} GROUP BY distributor_id, month`,
    args,
  );
  const byUser = new Map();
  const get = (uid) => byUser.get(uid) || byUser.set(uid, { fees: [], paid: new Map() }).get(uid);
  for (const f of fees) get(f.uid).fees.push({ from: f.from, fee: Number(f.fee) });
  for (const p of paid) get(p.uid).paid.set(p.month, Number(p.amount));
  return (uid) => byUser.get(uid) || { fees: [], paid: new Map() };
}

export async function partnerBilling(distributorId) {
  const [[u]] = await db.execute(
    `SELECT billing_action AS action, billing_grace_until AS graceUntil FROM distributors WHERE id = ?`,
    [distributorId],
  );
  if (!u) return null;
  const ledger = (await loadLedgers(distributorId))(distributorId);
  return summarize({ ...ledger, ...u, settings: await billingSettings(), today: await today() });
}

// Every partner with their subscription state, for the dashboard's Billing page.
export async function allBilling() {
  const [users] = await db.query(
    `SELECT d.id, d.name, d.phone, d.disabled = 1 AS disabled, d.billing_action AS action, d.billing_grace_until AS graceUntil,
       (SELECT MAX(p.paid_on) FROM billing_payments p WHERE p.distributor_id = d.id AND p.method <> 'waived') AS lastPaidOn
     FROM distributors d ORDER BY d.name`,
  );
  const ledgerOf = await loadLedgers();
  const settings = await billingSettings();
  const day = await today();
  return {
    settings,
    today: day,
    partners: users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      disabled: !!u.disabled,
      lastPaidOn: u.lastPaidOn,
      ...summarize({ ...ledgerOf(u.id), action: u.action, graceUntil: u.graceUntil, settings, today: day }),
    })),
  };
}

// Month-by-month view: the last 12 months, plus any later month that is already paid.
export function monthRows(fees, paid, current) {
  const start = fees[0]?.from;
  if (!start) return [];
  let last = current;
  for (const m of paid.keys()) if (m > last) last = m;
  const first = addMonths(current, -11) > start ? addMonths(current, -11) : start;
  const rows = [];
  for (let m = last; m >= first; m = addMonths(m, -1)) {
    const fee = feeFor(fees, m);
    const amount = paid.get(m) || 0;
    const status = fee <= 0 ? "free" : amount >= fee ? "paid" : m > current ? "upcoming" : amount > 0 ? "partial" : "unpaid";
    rows.push({ month: m, fee, paid: amount, status });
  }
  return rows;
}

// Subscription, months, fee history and payments for one partner. `admin` adds who recorded what.
export async function billingDetail(distributorId, { admin = false } = {}) {
  const summary = await partnerBilling(distributorId);
  if (!summary) return null;
  const ledger = (await loadLedgers(distributorId))(distributorId);
  const [payments] = await db.execute(
    `SELECT id, month, amount, method, reference, paid_on AS paidOn ${admin ? ", note, admin_username AS recordedBy, created_at AS createdAt" : ""}
     FROM billing_payments WHERE distributor_id = ? ORDER BY paid_on DESC, id DESC LIMIT 100`,
    [distributorId],
  );
  const out = { ...summary, months: monthRows(ledger.fees, ledger.paid, summary.month), payments };
  if (admin) {
    const [fees] = await db.execute(
      `SELECT id, from_month AS \`from\`, fee, set_by AS setBy, created_at AS createdAt FROM billing_fees
       WHERE distributor_id = ? ORDER BY from_month DESC`,
      [distributorId],
    );
    out.fees = fees;
  }
  return out;
}
