import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

const KEY = 'doodh-app-v1';

// Shape:
// settings:   { delivery, shop, mainName, mainUnit, mainPrice } — which modes are on, and the main product
// products:   [{ id, name, unit, price, active }]  — extra products (the main product lives in settings)
// customers:  [{ id, name, phone, address, rate, defaultQty, items, active }]
//             rate/defaultQty are for the main product; items: [{ productId, qty, rate }] are extra daily products
// deliveries: { 'YYYY-MM-DD': { [customerId]: { qty, rate, x?: { [productId]: { qty, rate } } } } }
//             qty/rate = main product, x = extra products; rates are copied so price changes don't rewrite history
// sales:      [{ id, date, customerId | null, items: [{ productId, name, unit, qty, rate }], total, paid, note }]
//             shop counter sales; customerId null = walk-in. total - paid goes on the customer's balance
// payments:   [{ id, customerId, date, amount }]
// expenses:   [{ id, date, category, amount, note }]
// suppliers:        [{ id, name, phone, address, rate, active }]  — people the partner buys milk from
// purchases:        [{ id, supplierId, productId?, date, qty, rate, note }] — stock bought (no productId = main product)
// supplierPayments: [{ id, supplierId, date, amount, note }]      — money paid to a supplier
// queue:      changes not yet sent to the server, one per row: [{ t: 'c' | 'd' | 'p' | 'e' | 's' | 'b' | 'sp' | 'pr' | 'sa' | 'cfg', row }]
// cursor:     server time of the last successful sync
export const MAIN = 'main'; // product id used for the main product in sales and pickers
const defaultSettings = { delivery: true, shop: false, mainName: '', mainUnit: '', mainPrice: 0 };
const empty = { settings: defaultSettings, products: [], sales: [], customers: [], deliveries: {}, payments: [], expenses: [], suppliers: [], purchases: [], supplierPayments: [], lang: 'ur', urduFont: 'nastaliq', auth: null, queue: [], cursor: null };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return { ...empty, ...saved, settings: { ...defaultSettings, ...saved?.settings } };
  } catch {
    return empty;
  }
}

export const today = () => toISO(new Date());
export const toISO = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
// The date format shown in the app: "<weekday> <day> <month> <year>", e.g. "Monday 12 January 2026".
// Day and month names come from the language (see t.fmtDate in i18n.js).
export const formatDate = (iso, weekdays, months) => {
  const d = new Date(iso + 'T00:00:00');
  // Non-breaking spaces keep "12 January 2026" together; a narrow screen only breaks after the weekday.
  return `${weekdays[d.getDay()]} ${d.getDate()}\u00a0${months[d.getMonth()]}\u00a0${d.getFullYear()}`;
};
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const keyOf = ({ t, row }) =>
  t === 'd' ? `d:${row.customerId}|${row.date}|${row.productId || ''}` : t === 'cfg' ? 'cfg' : `${t}:${row.id}`;

// One delivery entry as server rows: the main product, then each extra product.
const deliveryRows = (customerId, date, v, deleted = false) => [
  { customerId, date, qty: v.qty, rate: v.rate, ...(deleted && { deleted: true }) },
  ...Object.entries(v.x || {}).map(([productId, e]) => ({ customerId, productId, date, qty: e.qty, rate: e.rate, ...(deleted && { deleted: true }) })),
];
const sumX = (v, f) => Object.values(v?.x || {}).reduce((s, e) => s + f(e), 0);

// What a customer usually gets: their main quantity plus each extra product that is still active.
const usual = (c, products) => {
  const x = {};
  for (const i of c.items || []) {
    const p = products.find((pr) => pr.id === i.productId);
    if (p && p.active !== false && i.qty > 0) x[i.productId] = { qty: i.qty, rate: i.rate };
  }
  return { qty: c.defaultQty, rate: c.rate, ...(Object.keys(x).length && { x }) };
};
export const hasUsual = (c, products) => {
  const u = usual(c, products);
  return u.qty > 0 || sumX(u, (e) => e.qty) > 0;
};
const saleTotal = (items) => items.reduce((s, i) => s + i.qty * i.rate, 0);

// Newer change to the same row replaces the older one, so the queue stays small.
const enqueue = (queue, item) => [...queue.filter((q) => keyOf(q) !== keyOf(item)), item];

function queueEverything(d) {
  let queue = d.queue;
  for (const c of d.customers) queue = enqueue(queue, { t: 'c', row: c });
  for (const [date, day] of Object.entries(d.deliveries))
    for (const [customerId, v] of Object.entries(day))
      for (const row of deliveryRows(customerId, date, v)) queue = enqueue(queue, { t: 'd', row });
  for (const p of d.payments) queue = enqueue(queue, { t: 'p', row: p });
  for (const e of d.expenses) queue = enqueue(queue, { t: 'e', row: e });
  for (const s of d.suppliers) queue = enqueue(queue, { t: 's', row: s });
  for (const b of d.purchases) queue = enqueue(queue, { t: 'b', row: b });
  for (const p of d.supplierPayments) queue = enqueue(queue, { t: 'sp', row: p });
  for (const p of d.products) queue = enqueue(queue, { t: 'pr', row: p });
  for (const s of d.sales) queue = enqueue(queue, { t: 'sa', row: s });
  queue = enqueue(queue, { t: 'cfg', row: d.settings });
  return queue;
}

const newestFirst = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// Server rows into a list keyed by id: replace or add each row, drop deleted ones, skip rows still pending here.
function mergeRows(list, rows = [], t, pending, pick) {
  let out = list;
  for (const { deleted, ...r } of rows) {
    if (pending.has(`${t}:${r.id}`)) continue;
    out = out.filter((x) => x.id !== r.id);
    if (!deleted) out.push(pick(r));
  }
  return out;
}

// Apply rows from the server, except rows the phone changed again while the request was in flight.
function mergeFromServer(d, res, pending) {
  const customers = [...d.customers];
  for (const { deleted, ...c } of res.customers) {
    if (pending.has(`c:${c.id}`)) continue;
    const i = customers.findIndex((x) => x.id === c.id);
    if (deleted) {
      if (i >= 0) customers.splice(i, 1);
    } else if (i >= 0) customers[i] = { ...c, items: c.items ?? customers[i].items ?? [] };
    else customers.push({ ...c, items: c.items ?? [] });
  }

  const deliveries = { ...d.deliveries };
  for (const r of res.deliveries) {
    if (pending.has(`d:${r.customerId}|${r.date}|${r.productId || ''}`)) continue;
    const day = { ...(deliveries[r.date] || {}) };
    const cur = day[r.customerId];
    if (!r.productId) {
      // Main product row: decides whether the customer is marked for the day at all.
      if (r.deleted) delete day[r.customerId];
      else day[r.customerId] = { ...cur, qty: r.qty, rate: r.rate };
    } else if (r.deleted) {
      if (cur?.x) {
        const { [r.productId]: _, ...x } = cur.x;
        day[r.customerId] = { ...cur, x };
      }
    } else {
      day[r.customerId] = { qty: 0, rate: 0, ...cur, x: { ...cur?.x, [r.productId]: { qty: r.qty, rate: r.rate } } };
    }
    deliveries[r.date] = day;
  }

  let payments = d.payments;
  for (const p of res.payments) {
    if (pending.has(`p:${p.id}`)) continue;
    payments = payments.filter((x) => x.id !== p.id);
    if (!p.deleted) payments.push({ id: p.id, customerId: p.customerId, date: p.date, amount: p.amount });
  }
  payments.sort(newestFirst);

  let expenses = d.expenses;
  for (const e of res.expenses) {
    if (pending.has(`e:${e.id}`)) continue;
    expenses = expenses.filter((x) => x.id !== e.id);
    if (!e.deleted) expenses.push({ id: e.id, date: e.date, category: e.category, amount: e.amount, note: e.note });
  }
  expenses.sort(newestFirst);

  const suppliers = mergeRows(d.suppliers, res.suppliers, 's', pending, (r) => r);
  const purchases = mergeRows(d.purchases, res.purchases, 'b', pending, (r) => r).sort(newestFirst);
  const supplierPayments = mergeRows(d.supplierPayments, res.supplierPayments, 'sp', pending, (r) => r).sort(newestFirst);

  const products = mergeRows(d.products, res.products, 'pr', pending, (r) => r);
  const sales = mergeRows(d.sales, res.sales, 'sa', pending, (r) => r).sort(newestFirst);
  const settings = res.settings && !pending.has('cfg') ? { ...defaultSettings, ...res.settings } : d.settings;

  return { ...d, settings, products, sales, customers, deliveries, payments, expenses, suppliers, purchases, supplierPayments, cursor: res.cursor };
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState(load);
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | ok | offline
  const dataRef = useRef(data);
  dataRef.current = data;
  const syncing = useRef(false);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);

  const logoutLocal = useCallback(() => setData((d) => ({ ...empty, lang: d.lang, urduFont: d.urduFont })), []);

  const sync = useCallback(async () => {
    const d = dataRef.current;
    if (!d.auth || syncing.current) return;
    syncing.current = true;
    setSyncState('syncing');
    const sent = d.queue;
    const changes = {
      customers: sent.filter((q) => q.t === 'c').map((q) => q.row),
      deliveries: sent.filter((q) => q.t === 'd').map((q) => q.row),
      payments: sent.filter((q) => q.t === 'p').map((q) => q.row),
      expenses: sent.filter((q) => q.t === 'e').map((q) => q.row),
      suppliers: sent.filter((q) => q.t === 's').map((q) => q.row),
      purchases: sent.filter((q) => q.t === 'b').map((q) => q.row),
      supplierPayments: sent.filter((q) => q.t === 'sp').map((q) => q.row),
      products: sent.filter((q) => q.t === 'pr').map((q) => q.row),
      sales: sent.filter((q) => q.t === 'sa').map((q) => q.row),
      ...(sent.some((q) => q.t === 'cfg') && { settings: sent.find((q) => q.t === 'cfg').row }),
    };
    try {
      const res = await api('/sync', { since: d.cursor, changes, features: ['products'] }, d.auth.token);
      setData((cur) => {
        // Keep the same array when nothing was removed, so the queue effect doesn't re-trigger sync.
        const left = cur.queue.filter((q) => !sent.includes(q));
        const queue = left.length === cur.queue.length ? cur.queue : left;
        return { ...mergeFromServer(cur, res, new Set(queue.map(keyOf))), queue };
      });
      setSyncState('ok');
    } catch (err) {
      if (err.status === 401) logoutLocal();
      setSyncState('offline');
    } finally {
      syncing.current = false;
    }
  }, [logoutLocal]);

  // Sync shortly after any change, every minute, and as soon as the internet comes back.
  useEffect(() => {
    if (!data.auth) return;
    const t = setTimeout(sync, data.queue.length ? 1500 : 0);
    return () => clearTimeout(t);
  }, [data.queue, data.auth, sync]);

  useEffect(() => {
    const i = setInterval(sync, 60000);
    window.addEventListener('online', sync);
    return () => {
      clearInterval(i);
      window.removeEventListener('online', sync);
    };
  }, [sync]);

  const api_ = useMemo(() => {
    const customerById = (id) => data.customers.find((c) => c.id === id);

    // Delivered between two dates (inclusive). liters = quantity of the main product; amount = all products.
    const billed = (cid, from = '', to = '9999') => {
      let liters = 0;
      let amount = 0;
      for (const [date, day] of Object.entries(data.deliveries)) {
        const v = day[cid];
        if (date < from || date > to || !v) continue;
        liters += v.qty;
        amount += v.qty * v.rate + sumX(v, (e) => e.qty * e.rate);
      }
      return { liters, amount };
    };

    // Shop sales to a customer that weren't paid at the counter (they go on the customer's balance).
    const salesOwed = (cid, from = '', to = '9999') =>
      data.sales
        .filter((s) => s.customerId === cid && s.date >= from && s.date <= to)
        .reduce((sum, s) => sum + s.total - s.paid, 0);

    const paid = (cid, from = '', to = '9999') =>
      data.payments
        .filter((p) => p.customerId === cid && p.date >= from && p.date <= to)
        .reduce((s, p) => s + p.amount, 0);

    // Milk bought from / money paid to a supplier between two dates (inclusive).
    const bought = (sid, from = '', to = '9999') => {
      let liters = 0;
      let amount = 0;
      for (const b of data.purchases) {
        if (b.supplierId !== sid || b.date < from || b.date > to) continue;
        if (!b.productId) liters += b.qty; // quantity of the main product only; amount counts everything
        amount += b.qty * b.rate;
      }
      return { liters, amount };
    };
    const paidSupplier = (sid, from = '', to = '9999') =>
      data.supplierPayments
        .filter((p) => p.supplierId === sid && p.date >= from && p.date <= to)
        .reduce((s, p) => s + p.amount, 0);

    // Generic add / edit / delete for the id-keyed supplier lists.
    const listOps = (key, t) => ({
      add: (row) =>
        setData((d) => {
          const r = { id: uid(), ...row };
          return { ...d, [key]: [r, ...d[key]].sort(newestFirst), queue: enqueue(d.queue, { t, row: r }) };
        }),
      update: (id, patch) =>
        setData((d) => {
          const r = { ...d[key].find((x) => x.id === id), ...patch };
          return { ...d, [key]: d[key].map((x) => (x.id === id ? r : x)).sort(newestFirst), queue: enqueue(d.queue, { t, row: r }) };
        }),
      remove: (id) =>
        setData((d) => {
          const r = d[key].find((x) => x.id === id);
          if (!r) return d;
          return { ...d, [key]: d[key].filter((x) => x.id !== id), queue: enqueue(d.queue, { t, row: { ...r, deleted: true } }) };
        }),
    });
    const purchaseOps = listOps('purchases', 'b');
    const saleOps = listOps('sales', 'sa');
    const supplierPayOps = listOps('supplierPayments', 'sp');

    return {
      data,
      syncState,
      sync,
      customerById,
      billed,
      paid,
      salesOwed,
      // > 0: the customer owes money (deliveries + unpaid shop sales - payments).
      balance: (cid) => billed(cid).amount + salesOwed(cid) - paid(cid),

      // A customer's usual delivery: main product plus their active extra products.
      usualFor: (c) => usual(c, data.products),

      saveSettings: (patch) =>
        setData((d) => {
          const settings = { ...d.settings, ...patch };
          return { ...d, settings, queue: enqueue(d.queue, { t: 'cfg', row: settings }) };
        }),
      saveProduct: (p) =>
        setData((d) => {
          const row = p.id ? { ...d.products.find((x) => x.id === p.id), ...p } : { active: true, ...p, id: uid() };
          const products = p.id ? d.products.map((x) => (x.id === p.id ? row : x)) : [...d.products, row];
          return { ...d, products, queue: enqueue(d.queue, { t: 'pr', row }) };
        }),
      addSale: (sale) => saleOps.add({ date: today(), note: '', ...sale, total: saleTotal(sale.items) }),
      updateSale: (id, patch) => saleOps.update(id, patch.items ? { ...patch, total: saleTotal(patch.items) } : patch),
      deleteSale: (id) => saleOps.remove(id),

      supplierById: (id) => data.suppliers.find((s) => s.id === id),
      bought,
      paidSupplier,
      // > 0: the partner still owes the supplier; < 0: paid in advance.
      supplierBalance: (sid) => bought(sid).amount - paidSupplier(sid),

      saveSupplier: (sp) =>
        setData((d) => {
          const row = sp.id ? { ...d.suppliers.find((x) => x.id === sp.id), ...sp } : { active: true, ...sp, id: uid() };
          const suppliers = sp.id ? d.suppliers.map((x) => (x.id === sp.id ? row : x)) : [...d.suppliers, row];
          return { ...d, suppliers, queue: enqueue(d.queue, { t: 's', row }) };
        }),

      // Removes the supplier together with their purchases and payments (on this phone and the server).
      deleteSupplier: (id) =>
        setData((d) => {
          const sp = d.suppliers.find((x) => x.id === id);
          if (!sp) return d;
          let queue = enqueue(d.queue, { t: 's', row: { ...sp, deleted: true } });
          const keep = (list, t) =>
            list.filter((r) => {
              if (r.supplierId !== id) return true;
              queue = enqueue(queue, { t, row: { ...r, deleted: true } });
              return false;
            });
          const purchases = keep(d.purchases, 'b');
          const supplierPayments = keep(d.supplierPayments, 'sp');
          return { ...d, suppliers: d.suppliers.filter((x) => x.id !== id), purchases, supplierPayments, queue };
        }),

      addPurchase: (supplierId, { productId, qty, rate, note = '', date = today() }) =>
        purchaseOps.add({ supplierId, ...(productId && { productId }), date, qty, rate, note }),
      updatePurchase: purchaseOps.update,
      deletePurchase: purchaseOps.remove,
      addSupplierPayment: (supplierId, { amount, note = '', date = today() }) => supplierPayOps.add({ supplierId, date, amount, note }),
      updateSupplierPayment: supplierPayOps.update,
      deleteSupplierPayment: supplierPayOps.remove,

      setLang: (lang) => setData((d) => ({ ...d, lang })),
      setUrduFont: (urduFont) => setData((d) => ({ ...d, urduFont })),

      // Called after a successful login/register. Anything entered before logging in gets uploaded.
      setAuth: (auth) => setData((d) => ({ ...d, auth, cursor: null, queue: queueEverything(d) })),

      // Ends every other session for this account; this phone stays logged in.
      logoutOthers: () => api('/auth/logout-others', {}, dataRef.current.auth?.token),

      // Deletes the account and all its data on the server, then clears this phone.
      deleteAccount: async (pin) => {
        await api('/auth/delete-account', { pin }, dataRef.current.auth?.token);
        logoutLocal();
      },

      logout: async () => {
        const auth = dataRef.current.auth;
        logoutLocal();
        try {
          await api('/auth/logout', {}, auth?.token);
        } catch {
          // Token is dropped locally either way.
        }
      },

      saveCustomer: (c) =>
        setData((d) => {
          const row = c.id ? { ...d.customers.find((x) => x.id === c.id), ...c } : { active: true, ...c, id: uid() };
          const customers = c.id ? d.customers.map((x) => (x.id === c.id ? row : x)) : [...d.customers, row];
          return { ...d, customers, queue: enqueue(d.queue, { t: 'c', row }) };
        }),

      // Removes the customer together with their milk entries and payments (on this phone and the server).
      deleteCustomer: (id) =>
        setData((d) => {
          const c = d.customers.find((x) => x.id === id);
          if (!c) return d;
          let queue = enqueue(d.queue, { t: 'c', row: { ...c, deleted: true } });
          const deliveries = {};
          for (const [date, day] of Object.entries(d.deliveries)) {
            if (!day[id]) {
              deliveries[date] = day;
              continue;
            }
            const { [id]: gone, ...rest } = day;
            deliveries[date] = rest;
            for (const row of deliveryRows(id, date, gone, true)) queue = enqueue(queue, { t: 'd', row });
          }
          const payments = d.payments.filter((p) => {
            if (p.customerId !== id) return true;
            queue = enqueue(queue, { t: 'p', row: { ...p, deleted: true } });
            return false;
          });
          const sales = d.sales.filter((s) => {
            if (s.customerId !== id) return true;
            queue = enqueue(queue, { t: 'sa', row: { ...s, deleted: true } });
            return false;
          });
          return { ...d, customers: d.customers.filter((x) => x.id !== id), deliveries, payments, sales, queue };
        }),

      // Main product. qty === null removes the whole entry (back to "not marked"); qty 0 marks it "not
      // given" for every product. The first mark of the day also fills in the customer's usual extras.
      setDelivery: (date, cid, qty) =>
        setData((d) => {
          const day = { ...(d.deliveries[date] || {}) };
          const cur = day[cid];
          let queue = d.queue;
          if (qty === null) {
            delete day[cid];
            if (cur) for (const row of deliveryRows(cid, date, cur, true)) queue = enqueue(queue, { t: 'd', row });
          } else {
            const c = d.customers.find((x) => x.id === cid);
            const base = cur || usual(c, d.products);
            const next = { ...base, qty, rate: base.rate ?? c.rate };
            if (qty === 0) next.x = Object.fromEntries(Object.entries(base.x || {}).map(([k, e]) => [k, { ...e, qty: 0 }]));
            day[cid] = next;
            for (const row of deliveryRows(cid, date, next)) queue = enqueue(queue, { t: 'd', row });
          }
          return { ...d, deliveries: { ...d.deliveries, [date]: day }, queue };
        }),

      // Gives / takes back everything the customer usually gets.
      giveUsual: (date, cid) =>
        setData((d) => {
          const c = d.customers.find((x) => x.id === cid);
          const next = usual(c, d.products);
          let queue = d.queue;
          for (const row of deliveryRows(cid, date, next)) queue = enqueue(queue, { t: 'd', row });
          return { ...d, deliveries: { ...d.deliveries, [date]: { ...(d.deliveries[date] || {}), [cid]: next } }, queue };
        }),

      // One extra product's quantity for the day (marks the customer if they weren't yet).
      setExtra: (date, cid, productId, qty) =>
        setData((d) => {
          const day = { ...(d.deliveries[date] || {}) };
          const c = d.customers.find((x) => x.id === cid);
          const base = day[cid] || usual(c, d.products);
          const item = (c.items || []).find((i) => i.productId === productId);
          const prev = base.x?.[productId];
          const next = { ...base, x: { ...base.x, [productId]: { qty, rate: prev?.rate ?? item?.rate ?? 0 } } };
          day[cid] = next;
          let queue = d.queue;
          for (const row of deliveryRows(cid, date, next)) queue = enqueue(queue, { t: 'd', row });
          return { ...d, deliveries: { ...d.deliveries, [date]: day }, queue };
        }),

      // Marks every active customer not yet marked on `date` as given their usual quantity.
      markAll: (date) =>
        setData((d) => {
          const day = { ...(d.deliveries[date] || {}) };
          let queue = d.queue;
          for (const c of d.customers) {
            if (!c.active || day[c.id] || !hasUsual(c, d.products)) continue;
            day[c.id] = usual(c, d.products);
            for (const row of deliveryRows(c.id, date, day[c.id])) queue = enqueue(queue, { t: 'd', row });
          }
          return { ...d, deliveries: { ...d.deliveries, [date]: day }, queue };
        }),

      updatePayment: (id, patch) =>
        setData((d) => {
          const row = { ...d.payments.find((x) => x.id === id), ...patch };
          const payments = d.payments.map((x) => (x.id === id ? row : x)).sort(newestFirst);
          return { ...d, payments, queue: enqueue(d.queue, { t: 'p', row }) };
        }),

      updateExpense: (id, patch) =>
        setData((d) => {
          const row = { ...d.expenses.find((x) => x.id === id), ...patch };
          const expenses = d.expenses.map((x) => (x.id === id ? row : x)).sort(newestFirst);
          return { ...d, expenses, queue: enqueue(d.queue, { t: 'e', row }) };
        }),

      addPayment: (customerId, amount, date = today()) =>
        setData((d) => {
          const row = { id: uid(), customerId, amount, date };
          return { ...d, payments: [row, ...d.payments], queue: enqueue(d.queue, { t: 'p', row }) };
        }),

      deletePayment: (id) =>
        setData((d) => {
          const p = d.payments.find((x) => x.id === id);
          return {
            ...d,
            payments: d.payments.filter((x) => x.id !== id),
            queue: enqueue(d.queue, { t: 'p', row: { ...p, deleted: true } }),
          };
        }),

      addExpense: ({ category, amount, note }, date = today()) =>
        setData((d) => {
          const row = { id: uid(), date, category, amount, note };
          return { ...d, expenses: [row, ...d.expenses], queue: enqueue(d.queue, { t: 'e', row }) };
        }),

      deleteExpense: (id) =>
        setData((d) => {
          const e = d.expenses.find((x) => x.id === id);
          return {
            ...d,
            expenses: d.expenses.filter((x) => x.id !== id),
            queue: enqueue(d.queue, { t: 'e', row: { ...e, deleted: true } }),
          };
        }),
    };
  }, [data, syncState, sync, logoutLocal]);

  return <StoreCtx.Provider value={api_}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
