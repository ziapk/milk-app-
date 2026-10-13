import { useState } from 'react';
import { api, errorText } from '../api';
import logo from '../../../public/logo.png';

export default function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onLogin(await api('/login', { method: 'POST', body: f }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <img src={logo} alt="" className="login-logo" />
        <h1>Moo<span>Partner</span> Admin</h1>
        <p className="muted">Sign in to manage users</p>

        <label className="field">
          <span>Username</span>
          <input
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value })}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <div className="pw">
            <input
              type={show ? 'text' : 'password'}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete="current-password"
              required
            />
            <button type="button" className="iconbtn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
              <i className={`fa-solid fa-${show ? 'eye-slash' : 'eye'}`} />
            </button>
          </div>
        </label>

        {error && <div className="alert"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}

        <button className="btn solid wide big" disabled={busy}>
          {busy ? <i className="fa-solid fa-spinner fa-spin" /> : <><i className="fa-solid fa-right-to-bracket" /> Sign in</>}
        </button>
      </form>
    </div>
  );
}
