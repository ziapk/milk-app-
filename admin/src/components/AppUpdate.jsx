import { useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

// Shown only inside the admin Android app (admin-app/, a shell that loads this dashboard).
// The dashboard itself updates on every deploy; this offers a new APK when one is published on
// the App release page. Same native plugin as the partner app (android-shared/).
const Updater = registerPlugin('AppUpdate');

export default function AppUpdate() {
  const [info, setInfo] = useState(null); // latest.json when newer than the installed app
  const [forced, setForced] = useState(false);
  const [later, setLater] = useState(false);
  const [state, setState] = useState('idle'); // idle | downloading | permission | error
  const [pct, setPct] = useState(-1);
  const waitingPermission = useRef(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('AppUpdate')) return;
    (async () => {
      await Updater.cleanup().catch(() => {});
      const [{ versionCode }, res] = await Promise.all([Updater.info(), fetch('/api/app/latest?app=admin', { cache: 'no-store' })]);
      if (!res.ok) return;
      const latest = await res.json();
      if (latest.versionCode > versionCode) {
        setInfo(latest);
        setForced(versionCode < (latest.minVersionCode || 0));
      }
    })().catch(() => {});
    // Back from the "Install unknown apps" settings screen: try the install again.
    const onFocus = () => {
      if (document.visibilityState === 'visible' && waitingPermission.current) install();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, []);

  if (!info || (later && !forced)) return null;

  async function install() {
    try {
      const { status } = await Updater.install();
      waitingPermission.current = status === 'permission';
      setState(status === 'permission' ? 'permission' : 'idle');
    } catch {
      setState('error');
    }
  }

  const update = async () => {
    setState('downloading');
    setPct(-1);
    const sub = await Updater.addListener('progress', (p) => setPct(p.percent));
    try {
      await Updater.download({ url: `${location.origin}/api/app/download?app=admin&v=${info.versionCode}`, sha256: info.sha256 || '' });
      await install();
    } catch {
      setState('error');
    } finally {
      sub.remove();
    }
  };

  const busy = state === 'downloading';
  return (
    <div className="modal-veil">
      <div className="modal app-update" role="dialog" aria-modal="true" aria-label="App update">
        <i className="fa-solid fa-circle-arrow-up" />
        <h2>{forced ? 'Update required' : 'New version available'}</h2>
        <p className="muted">Admin app {info.versionName}</p>
        {info.notes && <p className="release-notes">{info.notes}</p>}
        {forced && <p className="muted">Please update to keep using the app.</p>}
        {state === 'permission' && <p className="muted">Turn on “Allow from this source” in settings, then come back.</p>}
        {state === 'error' && <div className="alert">Download failed. Check your internet and try again.</div>}
        {busy && <div className="progress"><i style={{ width: pct >= 0 ? `${pct}%` : '100%' }} /></div>}
        <div className="modal-actions">
          {!forced && !busy && <button className="btn" onClick={() => setLater(true)}>Later</button>}
          <button className="btn solid" onClick={state === 'permission' ? install : update} disabled={busy}>
            <i className={`fa-solid fa-${busy ? 'spinner fa-spin' : 'download'}`} />{' '}
            {busy ? (pct >= 0 ? `Downloading ${pct}%` : 'Downloading') : state === 'error' ? 'Try again' : 'Update now'}
          </button>
        </div>
      </div>
    </div>
  );
}
