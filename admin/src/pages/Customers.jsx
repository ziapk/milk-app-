import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Modal, useUi } from '../components/ui';
import { fmtDate, money, num } from '../format';

const STATUS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['stopped', 'Stopped'],
];

// #/customers lists everyone's customers; #/customers/12 shows only user 12's.
export default function Customers({ userId }) {
  const [customers, setCustomers] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null); // {} = new customer, otherwise the customer

  const load = useCallback(() => {
    api(`/customers${userId ? `?user=${userId}` : ''}`).then(setCustomers, (e) => setError(errorText(e)));
  }, [userId]);
  useEffect(() => {
    setCustomers(null);
    load();
  }, [load]);
  useEffect(() => {
    api('/users').then((d) => setUsers(d.users), () => {});
  }, []);

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (customers || []).filter((c) => {
      if (status === 'active' && !c.active) return false;
      if (status === 'stopped' && c.active) return false;
      return !text || [c.name, c.phone, c.address, c.userName].some((v) => v.toLowerCase().includes(text));
    });
  }, [customers, q, status]);

  const totals = useMemo(() => {
    const active = (customers || []).filter((c) => c.active);
    return {
      active: active.length,
      stopped: (customers || []).length - active.length,
      daily: active.reduce((s, c) => s + c.defaultQty, 0),
      due: (customers || []).reduce((s, c) => s + Math.max(0, c.due), 0),
    };
  }, [customers]);

  const user = users.find((u) => u.id === userId);
  if (error) return <div className="alert">{error}</div>;

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="search" placeholder="Search name, phone, address or user" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" value={userId || ''} onChange={(e) => (location.hash = e.target.value ? `#/customers/${e.target.value}` : '#/customers')} aria-label="Filter by user">
          <option value="">All users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.phone}</option>)}
        </select>
        <div className="segments">
          {STATUS.map(([k, label]) => (
            <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
        <button className="btn solid" onClick={() => setEditing({})} disabled={!users.length}>
          <i className="fa-solid fa-user-plus" /> Add customer
        </button>
      </div>

      {customers && (
        <p className="summary muted">
          {user ? <><b>{user.name}</b>: </> : null}
          {num(totals.active)} active · {num(totals.stopped)} stopped · {num(totals.daily, 1)} L a day · {money(totals.due)} owed
        </p>
      )}

      <section className="panel flush">
        {!customers ? (
          <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>
        ) : list.length === 0 ? (
          <p className="empty">{customers.length ? 'No customers match' : user ? `${user.name} has no customers yet` : 'No customers yet'}</p>
        ) : (
          <table className="table customers">
            <thead>
              <tr>
                <th>Customer</th>
                {!userId && <th>User</th>}
                <th className="r">Rate</th>
                <th className="r">Daily</th>
                <th className="r">Milk this month</th>
                <th className="r">Owed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={`${c.userId}-${c.id}`} className="link" onClick={() => setEditing(c)}>
                  <td>
                    <b>{c.name}</b>
                    <div className="muted small">{[c.phone, c.address].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  {!userId && (
                    <td data-label="User">
                      <a href={`#/users/${c.userId}`} onClick={(e) => e.stopPropagation()}>{c.userName}</a>
                    </td>
                  )}
                  <td className="r" data-label="Rate">{money(c.rate)}/L</td>
                  <td className="r" data-label="Daily">{num(c.defaultQty, 2)} L</td>
                  <td className="r" data-label="Milk this month">{num(c.litersMonth, 1)} L</td>
                  <td className={`r ${c.due > 0 ? 'owed' : ''}`} data-label="Owed">{money(Math.max(0, c.due))}</td>
                  <td>
                    {c.active ? <Badge kind="good" icon="circle">Active</Badge> : <Badge kind="idle">Stopped</Badge>}
                    {c.lastDelivery && <div className="muted small">Last milk {fmtDate(c.lastDelivery)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <CustomerForm
          customer={editing.id ? editing : null}
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

function CustomerForm({ customer, users, defaultUserId, onClose, onSaved }) {
  const { notify } = useUi();
  const [f, setF] = useState(() =>
    customer
      ? { ...customer, rate: String(customer.rate), defaultQty: String(customer.defaultQty) }
      : { userId: defaultUserId || '', name: '', phone: '', address: '', rate: '200', defaultQty: '1', active: true },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const decimal = (k) => (e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.userId) return setError('Choose which user this customer belongs to');
    setError('');
    setBusy(true);
    const body = { name: f.name, phone: f.phone, address: f.address, rate: Number(f.rate), defaultQty: Number(f.defaultQty), active: f.active };
    try {
      if (customer) await api(`/users/${f.userId}/customers/${customer.id}`, { method: 'PUT', body });
      else await api(`/users/${f.userId}/customers`, { method: 'POST', body });
      const owner = users.find((u) => u.id === Number(f.userId));
      notify(customer ? `${f.name} saved` : `${f.name} added for ${owner?.name || 'the user'}. It appears on their phone at the next sync`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>User (milk seller)</span>
          {customer ? (
            <input value={customer.userName} disabled />
          ) : (
            <select className="select" value={f.userId} onChange={(e) => setF({ ...f, userId: Number(e.target.value) || '' })} required autoFocus={!defaultUserId}>
              <option value="">Choose a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.phone}</option>)}
            </select>
          )}
        </label>
        <label className="field"><span>Customer name</span><input value={f.name} onChange={set('name')} required autoFocus={!!defaultUserId || !!customer} /></label>
        <div className="two">
          <label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="Optional" /></label>
          <label className="field"><span>Address</span><input value={f.address} onChange={set('address')} placeholder="Optional" /></label>
        </div>
        <div className="two">
          <label className="field"><span>Rate (Rs per litre)</span><input value={f.rate} onChange={decimal('rate')} inputMode="decimal" required /></label>
          <label className="field"><span>Daily milk (litres)</span><input value={f.defaultQty} onChange={decimal('defaultQty')} inputMode="decimal" required /></label>
        </div>
        {customer && (
          <label className="check">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            <span><b>Active</b> <small className="muted">— untick to stop daily milk (history is kept)</small></span>
          </label>
        )}
        {error && <div className="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy}>{customer ? 'Save' : 'Add customer'}</button>
        </div>
      </form>
    </Modal>
  );
}
