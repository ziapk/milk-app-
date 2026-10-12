import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from '../Icon';

export default function More() {
  const { data, setLang, logout, sync, syncState } = useStore();
  const t = useT();
  const pending = data.queue.length;

  const doLogout = () => {
    if (confirm(pending ? t.logoutUnsynced : t.logoutConfirm)) logout();
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
      <button className="btn red wide" onClick={doLogout}><Icon name="right-from-bracket" flip /> {t.logout}</button>
    </>
  );
}
