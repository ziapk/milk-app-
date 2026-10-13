import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Modal, useUi } from '../components/ui';
import { fmtDate, money, num } from '../format';

const STATUS = [
  ['all', 'All'],
  ['owed', 'To pay'],
  ['active', 'Active'],
  ['stopped', 'Stopped'],
];

// #/suppliers lists every user's suppliers; #/suppliers/12 shows only user 12's.
export default function Suppliers({ userId }) {
  const [suppliers, setSuppliers] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null); // {} = new supplier, otherwise the supplier
  const [ledgerFor, setLedgerFor] = useState(null);

  const load = useCallback(() => {
    api(`/suppliers${userId ? `?user=${userId}` : ''}`).then(setSuppliers, (e) => setError(errorText(e)));
  }, [userId]);
  useEffect(() => {
    setSuppliers(null);
    load();
  }, [load]);
  useEffect(() => {
    api('/users').then((d) => setUsers(d.users), () => {});
  }, []);

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (suppliers || []).filter((s) => {
      if (status === 'owed' && !(s.owed > 0.5)) return false;
      if (status === 'active' && !s.active) return false;
      if (status === 'stopped' && s.active) return false;
      return !text || [s.name, s.phone, s.address, s.userName].some((v) => v.toLowerCase().includes(text));
    });
  }, [suppliers, q, status]);

  const totals = useMemo(() => {
    const all = suppliers || [];
    return {
      count: all.length,
      liters: all.reduce((s, x) => s + x.litersMonth, 0),
      paid: all.reduce((s, x) => s + x.paidMonth, 0),
      owed: all.reduce((s, x) => s + Math.max(0, x.owed), 0),
    };
  }, [suppliers]);

  const user = users.find((u) => u.id === userId);
  if (error) return <div className="alert">{error}</div>;

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="search" placeholder="Search name, phone, address or user" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" value={userId || ''} onChange={(e) => (location.hash = e.target.value ? `#/suppliers/${e.target.value}` : '#/suppliers')} aria-label="Filter by user">
          <option value="">All users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.phone}</option>)}
        </select>
        <div className="segments">
          {STATUS.map(([k, label]) => (
            <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
        <button className="btn solid" onClick={() => setEditing({})} disabled={!users.length}>
          <i className="fa-solid fa-truck" /> Add supplier
        </button>
      </div>

      {suppliers && (
        <p className="summary muted">
          {user ? <><b>{user.name}</b>: </> : null}
          {num(totals.count)} supplier{totals.count === 1 ? '' : 's'} · {num(totals.liters, 1)} L bought this month · {money(totals.paid)} paid this month · <b className="owed-text">{money(totals.owed)} to pay</b>
        </p>
      )}

      <section className="panel flush">
        {!suppliers ? (
          <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>
        ) : list.length === 0 ? (
          <p className="empty">{suppliers.length ? 'No suppliers match' : user ? `${user.name} has no suppliers yet` : 'No suppliers yet'}</p>
        ) : (
          <table className="table customers">
            <thead>
              <tr>
                <th>Supplier</th>
                {!userId && <th>User</th>}
                <th className="r">Rate</th>
                <th className="r">Bought this month</th>
                <th className="r">Paid this month</th>
                <th className="r">To pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={`${s.userId}-${s.id}`} className="link" onClick={() => setLedgerFor(s)}>
                  <td>
                    <b>{s.name}</b>
                    <div className="muted small">{[s.phone, s.address].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  {!userId && (
                    <td data-label="User">
                      <a href={`#/users/${s.userId}`} onClick={(e) => e.stopPropagation()}>{s.userName}</a>
                    </td>
                  )}
                  <td className="r" data-label="Rate">{money(s.rate)}/L</td>
                  <td className="r" data-label="Bought this month">{num(s.litersMonth, 1)} L<div className="muted small">{money(s.amountMonth)}</div></td>
                  <td className="r" data-label="Paid this month">{money(s.paidMonth)}</td>
                  <td className={`r ${s.owed > 0.5 ? 'owed' : ''}`} data-label="To pay">
                    {s.owed < -0.5 ? <span className="muted">{money(-s.owed)} advance</span> : money(Math.max(0, s.owed))}
                  </td>
                  <td>
                    {s.active ? <Badge kind="good" icon="circle">Active</Badge> : <Badge kind="idle">Stopped</Badge>}
                    {s.lastPurchase && <div className="muted small">Last bought {fmtDate(s.lastPurchase)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {ledgerFor && (
        <SupplierLedger
          supplier={ledgerFor}
          onClose={() => setLedgerFor(null)}
          onEdit={() => {
            setEditing(ledgerFor);
            setLedgerFor(null);
          }}
        />
      )}
      {editing && (
        <SupplierForm
          supplier={editing.id ? editing : null}
          users={users}
          defaultUserId={userId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

const shiftMonth = (ym, n) => {
  const d = new Date(`${ym}-01T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const thisMonth = () => shiftMonth(new Date().toISOString().slice(0, 7), 0);

// Slide-over with one supplier's ledger, a month at a time.
function SupplierLedger({ supplier, onClose, onEdit }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api(`/users/${supplier.userId}/suppliers/${supplier.id}/ledger?month=${month}`).then(setData, (e) => setError(errorText(e)));
  }, [supplier, month]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const bought = data ? data.entries.filter((e) => e.kind === 'buy') : [];
  const paid = data ? data.entries.filter((e) => e.kind === 'pay').reduce((s, e) => s - e.amount, 0) : 0;

  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className="drawer wide" aria-label="Supplier ledger">
        <div className="drawer-head">
          <div>
            <h2>{supplier.name}</h2>
            <div className="muted small">Supplier of <a href={`#/users/${supplier.userId}`}>{supplier.userName}</a> · {money(supplier.rate)}/L</div>
          </div>
          <div className="row-btns tight">
            <button className="iconbtn" aria-label="Edit supplier" onClick={onEdit}><i className="fa-solid fa-pen" /></button>
            <button className="iconbtn" aria-label="Close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
          </div>
        </div>

        <div className="monthbar">
          <button className="iconbtn" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><i className="fa-solid fa-chevron-left" /></button>
          <b>{monthName}</b>
          <button className="iconbtn" aria-label="Next month" disabled={month >= thisMonth()} onClick={() => setMonth(shiftMonth(month, 1))}><i className="fa-solid fa-chevron-right" /></button>
        </div>

        {error && <div className="alert">{error}</div>}
        {!data && !error && <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>}
        {data && (
          <>
            <div className="mini-stats">
              <div><small>Milk bought</small><b>{num(bought.reduce((s, e) => s + e.qty, 0), 1)} L</b><span className="muted small">{money(bought.reduce((s, e) => s + e.amount, 0))}</span></div>
              <div><small>Paid</small><b>{money(paid)}</b></div>
            </div>
            <table className="table compact ledger-table">
              <thead><tr><th>Date</th><th>Entry</th><th className="r">Amount</th><th className="r">Balance</th></tr></thead>
              <tbody>
                <tr className="muted"><td colSpan={3}>Opening balance</td><td className="r">{money(data.opening)}</td></tr>
                {data.entries.length === 0 && <tr><td colSpan={4} className="empty">No entries this month</td></tr>}
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td>
                    <td>
                      {e.kind === 'buy'
                        ? <><i className="fa-solid fa-bottle-droplet buy-ico" /> {num(e.qty, 2)} L × {money(e.rate)}</>
                        : <><i className="fa-solid fa-money-bill-wave pay-ico" /> Payment</>}
                      {e.note && <span className="muted"> · {e.note}</span>}
                    </td>
                    <td className={`r ${e.kind === 'buy' ? 'owed' : 'paid'}`}>{e.kind === 'buy' ? '+' : '−'}{money(Math.abs(e.amount))}</td>
                    <td className="r">{money(e.balance)}</td>
                  </tr>
                ))}
                <tr className="total"><td colSpan={3}>Balance at month end</td><td className="r">{money(data.closing)}</td></tr>
              </tbody>
            </table>
            <p className="muted small">Positive balance = still to pay the supplier. Entries are added on the partner's phone.</p>
          </>
        )}
      </aside>
    </>
  );
}

function SupplierForm({ supplier, users, defaultUserId, onClose, onSaved }) {
  const { notify } = useUi();
  const [f, setF] = useState(() =>
    supplier
      ? { ...supplier, rate: String(supplier.rate) }
      : { userId: defaultUserId || '', name: '', phone: '', address: '', rate: '150', active: true },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.userId) return setError('Choose which user buys from this supplier');
    setError('');
    setBusy(true);
    const body = { name: f.name, phone: f.phone, address: f.address, rate: Number(f.rate), active: f.active };
    try {
      if (supplier) await api(`/users/${f.userId}/suppliers/${supplier.id}`, { method: 'PUT', body });
      else await api(`/users/${f.userId}/suppliers`, { method: 'POST', body });
      const owner = users.find((u) => u.id === Number(f.userId));
      notify(supplier ? `${f.name} saved` : `${f.name} added for ${owner?.name || 'the user'}. It appears on their phone at the next sync`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>User (who buys the milk)</span>
          {supplier ? (
            <input value={supplier.userName} disabled />
          ) : (
            <select className="select" value={f.userId} onChange={(e) => setF({ ...f, userId: Number(e.target.value) || '' })} required autoFocus={!defaultUserId}>
              <option value="">Choose a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.phone}</option>)}
            </select>
          )}
        </label>
        <label className="field"><span>Supplier name</span><input value={f.name} onChange={set('name')} required autoFocus={!!defaultUserId || !!supplier} /></label>
        <div className="two">
          <label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="Optional" /></label>
          <label className="field"><span>Address</span><input value={f.address} onChange={set('address')} placeholder="Optional" /></label>
        </div>
        <label className="field">
          <span>Buying rate (Rs per litre)</span>
          <input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" required />
        </label>
        {supplier && (
          <label className="check">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            <span><b>Active</b> <small className="muted">— untick if they no longer buy from this supplier (history is kept)</small></span>
          </label>
        )}
        {error && <div className="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy}>{supplier ? 'Save' : 'Add supplier'}</button>
        </div>
      </form>
    </Modal>
  );
}
