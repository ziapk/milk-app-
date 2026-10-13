import { useState } from 'react';
import { api, errorText } from '../api';
import { useUi } from '../components/ui';

export default function Account({ admin }) {
  const { notify } = useUi();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.next !== f.again) return setError('The new passwords do not match');
    setBusy(true);
    try {
      await api('/me/password', { method: 'POST', body: { current: f.current, next: f.next } });
      setF({ current: '', next: '', again: '' });
      notify('Password changed');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <section className="panel">
        <h3>Profile</h3>
        <dl className="facts">
          <div><dt>Name</dt><dd>{admin.name}</dd></div>
          <div><dt>Username</dt><dd>@{admin.username}</dd></div>
        </dl>
      </section>
      <section className="panel">
        <h3>Change password</h3>
        <p className="muted">Other browsers signed in as you will be signed out.</p>
        <form onSubmit={submit} className="stack">
          <label className="field"><span>Current password</span><input type="password" value={f.current} onChange={set('current')} required autoComplete="current-password" /></label>
          <label className="field"><span>New password</span><input type="password" value={f.next} onChange={set('next')} required minLength={8} autoComplete="new-password" /><small className="muted">At least 8 characters</small></label>
          <label className="field"><span>New password again</span><input type="password" value={f.again} onChange={set('again')} required minLength={8} autoComplete="new-password" /></label>
          {error && <div className="alert">{error}</div>}
          <div><button className="btn solid" disabled={busy}>Change password</button></div>
        </form>
      </section>
    </div>
  );
}
