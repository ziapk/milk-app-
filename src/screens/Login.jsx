import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { api } from '../api';
import Icon from '../Icon';

export default function Login() {
  const { data, setAuth, setLang } = useStore();
  const t = useT();
  const [isNew, setIsNew] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', pin: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === 'name' ? e.target.value : e.target.value.replace(/\D/g, '') });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api(isNew ? '/auth/register' : '/auth/login', f);
      setAuth(res);
    } catch (err) {
      setError(t.errors[err.code] || t.errors.server_error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <img className="logo" src="/icon.svg" alt="" />
      <h1>{t.appName}</h1>
      <form className="card form" onSubmit={submit}>
        {isNew && <label><span><Icon name="user" /> {t.name}</span><input value={f.name} onChange={set('name')} required /></label>}
        <label><span><Icon name="phone" /> {t.phone}</span><input value={f.phone} onChange={set('phone')} inputMode="tel" dir="ltr" placeholder="03001234567" required /></label>
        <label><span><Icon name="lock" /> {t.pin}</span><input className="pinbox" value={f.pin} onChange={set('pin')} inputMode="numeric" type="password" maxLength={6} dir="ltr" required /></label>
        {error && <div className="error"><Icon name="triangle-exclamation" /> {error}</div>}
        <button className="btn blue solid wide" disabled={busy}>{busy ? <Icon name="spinner" spin /> : isNew ? <><Icon name="user-plus" /> {t.register}</> : <><Icon name="right-to-bracket" flip /> {t.login}</>}</button>
        <button type="button" className="btn wide" onClick={() => setIsNew(!isNew)}>
          {isNew ? t.haveAccount : t.newAccount}
        </button>
      </form>
      <div className="two">
        <button className={`btn ${data.lang === 'ur' ? 'blue solid' : ''}`} onClick={() => setLang('ur')}>اردو</button>
        <button className={`btn ${data.lang === 'en' ? 'blue solid' : ''}`} onClick={() => setLang('en')}>English</button>
      </div>
    </main>
  );
}
