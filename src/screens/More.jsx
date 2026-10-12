import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from '../Icon';
import { canOpenVoiceSettings, openVoiceSettings, voiceLanguage } from '../search';

export default function More() {
  const { data, setLang, logout, logoutOthers, deleteAccount, sync, syncState } = useStore();
  const t = useT();
  const pending = data.queue.length;
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pin, setPin] = useState('');

  const doLogout = () => {
    if (confirm(pending ? t.logoutUnsynced : t.logoutConfirm)) logout();
  };

  const doLogoutOthers = async () => {
    if (!confirm(t.logoutOthersConfirm)) return;
    try {
      await logoutOthers();
      setNote(t.logoutOthersDone);
    } catch (e) {
      setNote(t.errors[e.code] || t.errors.server_error);
    }
  };

  const doDelete = async () => {
    if (!confirm(t.deleteAccountConfirm)) return;
    try {
      await deleteAccount(pin);
    } catch (e) {
      setNote(t.errors[e.code] || t.errors.server_error);
    }
  };

  return (
    <>
      <h1><Icon name="gear" /> {t.settings}</h1>
      <div className="card form">
        <div className="name"><Icon name="circle-user" /> {data.auth.name}</div>
        <div className="muted" dir="ltr">{data.auth.phone}</div>
      </div>
      <div className="card form">
        <div className="name">
          {pending ? (
            <><Icon name="cloud-arrow-up" className="orangetext" /> {t.pendingSync(pending)}</>
          ) : syncState === 'offline' ? (
            <><Icon name="wifi" className="muted" /> {t.offline}</>
          ) : (
            <><Icon name="circle-check" className="greentext" /> {t.synced}</>
          )}
        </div>
        <button className="btn blue wide" onClick={sync} disabled={syncState === 'syncing'}>
          <Icon name="rotate" spin={syncState === 'syncing'} /> {t.syncNow}
        </button>
      </div>
      <div className="card form">
        <div className="name"><Icon name="language" /> {t.language}</div>
        <div className="two">
          <button className={`btn ${data.lang === 'ur' ? 'blue solid' : ''}`} onClick={() => setLang('ur')}>اردو</button>
          <button className={`btn ${data.lang === 'en' ? 'blue solid' : ''}`} onClick={() => setLang('en')}>English</button>
        </div>
      </div>
      {canOpenVoiceSettings() && (
        <div className="card form">
          <div className="name"><Icon name="microphone" /> {t.offlineVoice}</div>
          <div className="muted">{t.offlineVoiceHelp(voiceLanguage(data.customers) === 'ur-PK' ? t.langUrdu : t.langEnIndia)}</div>
          <button className="btn wide" onClick={() => openVoiceSettings().catch(() => {})}>
            <Icon name="download" /> {t.offlineVoiceGet}
          </button>
        </div>
      )}
      <div className="card form">
        <div className="name"><Icon name="shield-halved" /> {t.security}</div>
        <button className="btn wide" onClick={doLogoutOthers}><Icon name="mobile-screen" /> {t.logoutOthers}</button>
        {note && <div className="muted">{note}</div>}
      </div>
      <button className="btn red wide" onClick={doLogout}><Icon name="right-from-bracket" flip /> {t.logout}</button>

      <div className="card form danger">
        {deleting ? (
          <>
            <div className="muted">{t.deleteAccountHelp}</div>
            <label><span>{t.pin}</span>
              <input className="pinbox" type="password" inputMode="numeric" maxLength={6} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="two">
              <button className="btn red solid" disabled={pin.length < 4} onClick={doDelete}><Icon name="trash" /> {t.deleteAccount}</button>
              <button className="btn" onClick={() => { setDeleting(false); setPin(''); }}>{t.cancel}</button>
            </div>
          </>
        ) : (
          <button className="linkbtn red" onClick={() => setDeleting(true)}><Icon name="trash" /> {t.deleteAccount}</button>
        )}
      </div>

      <p className="muted center footer">
        <a href="privacy.html" target="_blank" rel="noreferrer">{t.privacy}</a>
        <span dir="ltr">v{__APP_VERSION__}</span>
      </p>
    </>
  );
}
