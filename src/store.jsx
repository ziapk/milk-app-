import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

const KEY = 'doodh-app-v1';

// Shape:
// customers:  [{ id, name, phone, address, rate, defaultQty, active }]
// deliveries: { 'YYYY-MM-DD': { [customerId]: { qty, rate } } }  — rate copied at delivery time so price changes don't rewrite history
// payments:   [{ id, customerId, date, amount }]
// expenses:   [{ id, date, category, amount, note }]
// queue:      changes not yet sent to the server, one per row: [{ t: 'c' | 'd' | 'p' | 'e', row }]
// cursor:     server time of the last successful sync
const empty = { customers: [], deliveries: {}, payments: [], expenses: [], lang: 'ur', urduFont: 'nastaliq', auth: null, queue: [], cursor: null };

function load() {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return empty;
  }
}

export const today = () => toISO(new Date());
export const toISO = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const keyOf = ({ t, row }) => (t === 'd' ? `d:${row.customerId}|${row.date}` : `${t}:${row.id}`);

// Newer change to the same row replaces the older one, so the queue stays small.
const enqueue = (queue, item) => [...queue.filter((q) => keyOf(q) !== keyOf(item)), item];

function queueEverything(d) {
  let queue = d.queue;
  for (const c of d.customers) queue = enqueue(queue, { t: 'c', row: c });
  for (const [date, day] of Object.entries(d.deliveries))
    for (const [customerId, v] of Object.entries(day)) queue = enqueue(queue, { t: 'd', row: { customerId, date, ...v } });
  for (const p of d.payments) queue = enqueue(queue, { t: 'p', row: p });
  for (const e of d.expenses) queue = enqueue(queue, { t: 'e', row: e });
  return queue;
}

const newestFirst = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// Apply rows from the server, except rows the phone changed again while the request was in flight.
function mergeFromServer(d, res, pending) {
  const customers = [...d.customers];
  for (const { deleted, ...c } of res.customers) {
    if (pending.has(`c:${c.id}`)) continue;
    const i = customers.findIndex((x) => x.id === c.id);
    if (deleted) {
      if (i >= 0) customers.splice(i, 1);
    } else if (i >= 0) customers[i] = c;
    else customers.push(c);
  }

  const deliveries = { ...d.deliveries };
  for (const r of res.deliveries) {
    if (pending.has(`d:${r.customerId}|${r.date}`)) continue;
    const day = { ...(deliveries[r.date] || {}) };
    if (r.deleted) delete day[r.customerId];
    else day[r.customerId] = { qty: r.qty, rate: r.rate };
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

  return { ...d, customers, deliveries, payments, expenses, cursor: res.cursor };
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
    };
    try {
      const res = await api('/sync', { since: d.cursor, changes }, d.auth.token);
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

    const billed = (cid, from = '', to = '9999') => {
      let liters = 0;
      let amount = 0;
      for (const [date, day] of Object.entries(data.deliveries)) {
        if (date < from || date > to || !day[cid]) continue;
        liters += day[cid].qty;
        amount += day[cid].qty * day[cid].rate;
      }
      return { liters, amount };
    };

    const paid = (cid, from = '', to = '9999') =>
      data.payments
        .filter((p) => p.customerId === cid && p.date >= from && p.date <= to)
        .reduce((s, p) => s + p.amount, 0);

    return {
      data,
      syncState,
      sync,
      customerById,
      billed,
      paid,
      balance: (cid) => billed(cid).amount - paid(cid),

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
            const { [id]: _, ...rest } = day;
            deliveries[date] = rest;
            queue = enqueue(queue, { t: 'd', row: { customerId: id, date, qty: 0, rate: 0, deleted: true } });
          }
          const payments = d.payments.filter((p) => {
            if (p.customerId !== id) return true;
            queue = enqueue(queue, { t: 'p', row: { ...p, deleted: true } });
            return false;
          });
          return { ...d, customers: d.customers.filter((x) => x.id !== id), deliveries, payments, queue };
        }),

      // qty === null removes the entry (back to "not marked")
      setDelivery: (date, cid, qty) =>
        setData((d) => {
          const day = { ...(d.deliveries[date] || {}) };
          let row;
          if (qty === null) {
            delete day[cid];
            row = { customerId: cid, date, qty: 0, rate: 0, deleted: true };
          } else {
            day[cid] = { qty, rate: day[cid]?.rate ?? d.customers.find((c) => c.id === cid).rate };
            row = { customerId: cid, date, ...day[cid] };
          }
          return { ...d, deliveries: { ...d.deliveries, [date]: day }, queue: enqueue(d.queue, { t: 'd', row }) };
        }),

      // Marks every active customer not yet marked on `date` as given their usual quantity.
      markAll: (date) =>
        setData((d) => {
          const day = { ...(d.deliveries[date] || {}) };
          let queue = d.queue;
          for (const c of d.customers) {
            if (!c.active || day[c.id] || !(c.defaultQty > 0)) continue;
            day[c.id] = { qty: c.defaultQty, rate: c.rate };
            queue = enqueue(queue, { t: 'd', row: { customerId: c.id, date, ...day[c.id] } });
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
