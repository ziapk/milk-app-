import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Modal, useUi } from '../components/ui';
import UserPanel from './UserPanel';
import { ago, fmtDate, isRecent, num } from '../format';

const FILTERS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['inactive', 'Inactive'],
  ['blocked', 'Blocked'],
  ['locked', 'Locked'],
];

export function StatusBadges({ u }) {
  return (
    <>
      {u.disabled ? (
        <Badge kind="bad" icon="ban">Blocked</Badge>
      ) : isRecent(u.lastSeenAt) ? (
        <Badge kind="good" icon="circle">Active</Badge>
      ) : (
        <Badge kind="idle">Inactive</Badge>
      )}
      {u.locked && <Badge kind="warn" icon="lock">Locked</Badge>}
    </>
  );
}

export default function Users({ openId }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api('/users').then((d) => setUsers(d.users), (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, inactive: 0, blocked: 0, locked: 0 };
    for (const u of users || []) {
      c.all++;
      if (u.disabled) c.blocked++;
      else if (isRecent(u.lastSeenAt)) c.active++;
      else c.inactive++;
      if (u.locked) c.locked++;
    }
    return c;
  }, [users]);

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    const digits = text.replace(/\D/g, '');
    return (users || []).filter((u) => {
      if (filter === 'active' && (u.disabled || !isRecent(u.lastSeenAt))) return false;
      if (filter === 'inactive' && (u.disabled || isRecent(u.lastSeenAt))) return false;
      if (filter === 'blocked' && !u.disabled) return false;
      if (filter === 'locked' && !u.locked) return false;
      return !text || u.name.toLowerCase().includes(text) || (digits && u.phone.includes(digits));
    });
  }, [users, q, filter]);

  if (error) return <div className="alert">{error}</div>;

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="search" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="segments" role="tablist">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {label} <span className="count">{counts[k]}</span>
            </button>
          ))}
        </div>
        <button className="btn solid" onClick={() => setAdding(true)}><i className="fa-solid fa-user-plus" /> Add user</button>
      </div>

      <section className="panel flush">
        {!users ? (
          <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>
        ) : list.length === 0 ? (
          <p className="empty">{users.length ? 'No users match' : 'No users yet'}</p>
        ) : (
          <table className="table users">
            <thead>
              <tr><th>User</th><th className="r">Customers</th><th>Last active</th><th>Joined</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={`link ${openId === u.id ? 'selected' : ''}`} onClick={() => (location.hash = `#/users/${u.id}`)}>
                  <td>
                    <div className="avatar-row">
                      <span className="avatar">{u.name.trim().charAt(0).toUpperCase() || '?'}</span>
                      <div><b>{u.name}</b><div className="muted small">{u.phone}</div></div>
                    </div>
                  </td>
                  <td className="r" data-label="Customers">{num(u.customers)}</td>
                  <td data-label="Last active">{ago(u.lastSeenAt)}</td>
                  <td data-label="Joined">{fmtDate(u.createdAt)}</td>
                  <td><StatusBadges u={u} /></td>
                  <td className="r chev"><i className="fa-solid fa-chevron-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {adding && (
        <AddUser
          onClose={() => setAdding(false)}
          onAdded={(u) => {
            setAdding(false);
            load();
            location.hash = `#/users/${u.id}`;
          }}
        />
      )}
      {openId && <UserPanel id={openId} onClose={() => (location.hash = '#/users')} onChanged={load} />}
    </>
  );
}

function AddUser({ onClose, onAdded }) {
  const { notify } = useUi();
  const [f, setF] = useState({ name: '', phone: '', pin: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const digits = (max) => (v) => v.replace(/\D/g, '').slice(0, max);
  const set = (k, clean = (v) => v) => (e) => setF({ ...f, [k]: clean(e.target.value) });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await api('/users', { method: 'POST', body: f });
      notify(`${u.name} added. They can log in on the app with ${u.phone} and the PIN`);
      onAdded(u);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add user" onClose={onClose}>
      <p className="muted">Creates a MooPartner app account. Give them the phone number and PIN to log in.</p>
      <form onSubmit={submit} className="stack">
        <label className="field"><span>Name</span><input value={f.name} onChange={set('name')} required autoFocus /></label>
        <label className="field">
          <span>Phone number</span>
          <input value={f.phone} onChange={set('phone', digits(15))} inputMode="tel" placeholder="03001234567" required minLength={10} />
        </label>
        <label className="field">
          <span>PIN</span>
          <input className="pin-input" value={f.pin} onChange={set('pin', digits(6))} inputMode="numeric" placeholder="••••" required minLength={4} autoComplete="off" />
          <small className="muted">4–6 digits. If they forget it, you can reset it here.</small>
        </label>
        {error && <div className="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy}>Add user</button>
        </div>
      </form>
    </Modal>
  );
}
