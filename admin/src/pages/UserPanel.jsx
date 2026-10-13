import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Modal, useUi } from '../components/ui';
import { StatusBadges } from './Users';
import { ago, fmtDate, money, num } from '../format';

// Slide-over with one user's numbers and every action on their account.
export default function UserPanel({ id, onClose, onChanged }) {
  const { notify, confirm } = useUi();
  const [u, setU] = useState(null);
  const [error, setError] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    api(`/users/${id}`).then(setU, (e) => setError(errorText(e)));
  }, [id]);
  useEffect(() => {
    setU(null);
    load();
  }, [load]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !pinOpen && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose, pinOpen]);

  const act = async (path, opts, done, { close = false } = {}) => {
    setBusy(true);
    try {
      await api(path, opts);
      notify(done);
      onChanged();
      if (close) onClose();
      else load();
    } catch (e) {
      notify(errorText(e), true);
    } finally {
      setBusy(false);
    }
  };

  const who = u ? `${u.name} (${u.phone})` : '';

  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className="drawer" aria-label="User details">
        <div className="drawer-head">
          <h2>{u ? u.name : 'User'}</h2>
          <button className="iconbtn" aria-label="Close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        {error && <div className="alert">{error}</div>}
        {!u && !error && <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>}

        {u && (
          <>
            <div className="drawer-id">
              <span className="avatar big">{u.name.trim().charAt(0).toUpperCase() || '?'}</span>
              <div>
                <a href={`tel:${u.phone}`} className="phone"><i className="fa-solid fa-phone" /> {u.phone}</a>
                <div><StatusBadges u={u} /></div>
              </div>
            </div>

            <dl className="facts">
              <div><dt>Joined</dt><dd>{fmtDate(u.createdAt)}</dd></div>
              <div><dt>Last active</dt><dd>{ago(u.lastSeenAt)}</dd></div>
              <div><dt>Phones logged in</dt><dd>{u.devices}</dd></div>
              <div><dt>Last delivery</dt><dd>{fmtDate(u.lastDelivery)}</dd></div>
            </dl>

            <h3 className="drawer-sub">Business</h3>
            <div className="mini-stats">
              <div><small>Customers</small><b>{num(u.customersActive)}</b><span className="muted small">{u.customersStopped ? `+${u.customersStopped} stopped` : 'active'}</span></div>
              <div><small>Milk this month</small><b>{num(u.litersMonth, 1)} L</b><span className="muted small">{money(u.salesMonth)}</span></div>
              <div><small>Collected this month</small><b>{money(u.paidMonth)}</b></div>
              <div><small>Owed by customers</small><b>{money(Math.max(0, u.due))}</b><span className="muted small">all time</span></div>
            </div>
            <div className="row-btns">
              <a className="btn" href={`#/customers/${u.id}`}><i className="fa-solid fa-list" /> View customers</a>
            </div>

            <h3 className="drawer-sub">Supply</h3>
            <div className="mini-stats">
              <div><small>Suppliers</small><b>{num(u.suppliers)}</b></div>
              <div><small>Milk bought this month</small><b>{num(u.boughtMonth, 1)} L</b></div>
              <div><small>Owed to suppliers</small><b>{money(Math.max(0, u.owedSuppliers))}</b><span className="muted small">all time</span></div>
            </div>
            <div className="row-btns">
              <a className="btn" href={`#/suppliers/${u.id}`}><i className="fa-solid fa-truck" /> View suppliers</a>
            </div>

            <h3 className="drawer-sub">Account</h3>
            <div className="actions">
              {u.locked && (
                <button className="action" disabled={busy} onClick={() => act(`/users/${u.id}/unlock`, { method: 'POST' }, `${u.name} unlocked`)}>
                  <i className="fa-solid fa-lock-open" />
                  <span><b>Unlock</b><small>Locked after too many wrong PINs</small></span>
                </button>
              )}
              <button className="action" disabled={busy} onClick={() => setPinOpen(true)}>
                <i className="fa-solid fa-key" />
                <span><b>Reset PIN</b><small>Set a new PIN when they forget it</small></span>
              </button>
              <button
                className="action"
                disabled={busy || !u.devices}
                onClick={async () => {
                  if (await confirm({ title: 'Log out all phones?', text: `${who} will need to log in again with their PIN. Their data stays safe.`, ok: 'Log out' }))
                    act(`/users/${u.id}/logout`, { method: 'POST' }, `${u.name} logged out`);
                }}
              >
                <i className="fa-solid fa-mobile-screen" />
                <span><b>Log out all phones</b><small>{u.devices ? `${u.devices} logged in now` : 'Not logged in anywhere'}</small></span>
              </button>
              {u.disabled ? (
                <button className="action" disabled={busy} onClick={() => act(`/users/${u.id}/disabled`, { method: 'POST', body: { disabled: false } }, `${u.name} unblocked`)}>
                  <i className="fa-solid fa-circle-check" />
                  <span><b>Unblock</b><small>Let them log in again</small></span>
                </button>
              ) : (
                <button
                  className="action warn"
                  disabled={busy}
                  onClick={async () => {
                    if (await confirm({ title: 'Block this user?', text: `${who} will be logged out and can't log in until you unblock them. Their data is kept.`, ok: 'Block', danger: true }))
                      act(`/users/${u.id}/disabled`, { method: 'POST', body: { disabled: true } }, `${u.name} blocked`);
                  }}
                >
                  <i className="fa-solid fa-ban" />
                  <span><b>Block</b><small>Stop them from using the app</small></span>
                </button>
              )}
              <button
                className="action danger"
                disabled={busy}
                onClick={async () => {
                  if (await confirm({ title: 'Delete this user?', text: `${who} and ALL their customers, deliveries, payments and expenses will be permanently deleted. This cannot be undone.`, ok: 'Delete forever', danger: true }))
                    act(`/users/${u.id}`, { method: 'DELETE' }, `${u.name} deleted`, { close: true });
                }}
              >
                <i className="fa-solid fa-trash" />
                <span><b>Delete account</b><small>Removes the user and all their records</small></span>
              </button>
            </div>
          </>
        )}
      </aside>

      {pinOpen && u && (
        <ResetPin
          who={who}
          onClose={() => setPinOpen(false)}
          onSave={(pin) => {
            setPinOpen(false);
            act(`/users/${u.id}/reset-pin`, { method: 'POST', body: { pin } }, `New PIN set for ${u.name}`);
          }}
        />
      )}
    </>
  );
}

function ResetPin({ who, onClose, onSave }) {
  const [pin, setPin] = useState('');
  const ok = /^\d{4,6}$/.test(pin);
  return (
    <Modal title="Reset PIN" onClose={onClose}>
      <p className="muted">{who}</p>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onSave(pin); }}>
        <input
          className="pin-input"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="••••"
          autoFocus
          aria-label="New PIN"
        />
        <p className="muted small">4–6 digits. They are logged out on every phone and log in with the new PIN.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={!ok}>Set PIN</button>
        </div>
      </form>
    </Modal>
  );
}
