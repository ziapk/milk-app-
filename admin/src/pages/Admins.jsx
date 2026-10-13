import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Modal, useUi } from '../components/ui';
import { ago, fmtDate } from '../format';

export default function Admins() {
  const { notify, confirm } = useUi();
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api('/admins').then(setAdmins, (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const remove = async (a) => {
    const ok = await confirm({
      title: 'Remove this admin?',
      text: `${a.name} (@${a.username}) will no longer be able to sign in to the dashboard.`,
      ok: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admins/${a.id}`, { method: 'DELETE' });
      notify(`${a.name} removed`);
      load();
    } catch (e) {
      notify(errorText(e), true);
    }
  };

  if (error) return <div className="alert">{error}</div>;

  return (
    <>
      <div className="toolbar">
        <p className="muted grow">People who can sign in to this dashboard. They are separate from app users.</p>
        <button className="btn solid" onClick={() => setAdding(true)}><i className="fa-solid fa-user-plus" /> Add admin</button>
      </div>
      <section className="panel flush">
        {!admins ? (
          <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>
        ) : (
          <table className="table">
            <thead><tr><th>Admin</th><th>Last sign-in</th><th>Added</th><th /></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="avatar-row">
                      <span className="avatar navy">{a.name.charAt(0).toUpperCase()}</span>
                      <div>
                        <b>{a.name}</b> {a.you && <Badge kind="good">You</Badge>} {a.locked && <Badge kind="warn" icon="lock">Locked</Badge>}
                        <div className="muted small">@{a.username}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Last sign-in">{ago(a.lastLoginAt)}</td>
                  <td data-label="Added">{fmtDate(a.createdAt)}</td>
                  <td className="r">
                    {!a.you && (
                      <button className="btn danger-ghost" onClick={() => remove(a)}><i className="fa-solid fa-trash" /> Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {adding && <AddAdmin onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
    </>
  );
}

function AddAdmin({ onClose, onAdded }) {
  const { notify } = useUi();
  const [f, setF] = useState({ name: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/admins', { method: 'POST', body: f });
      notify(`${f.name} can now sign in as @${f.username.trim().toLowerCase()}`);
      onAdded();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add admin" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field"><span>Full name</span><input value={f.name} onChange={set('name')} required autoFocus /></label>
        <label className="field">
          <span>Username</span>
          <input value={f.username} onChange={set('username')} required autoCapitalize="none" pattern="[A-Za-z0-9._\-]{3,50}" title="3+ letters, numbers, . _ -" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
          <small className="muted">At least 8 characters. Share it with them privately.</small>
        </label>
        {error && <div className="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy}>Add admin</button>
        </div>
      </form>
    </Modal>
  );
}
