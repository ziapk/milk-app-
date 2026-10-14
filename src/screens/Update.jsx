import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BASE } from '../api';
import { useT } from '../i18n';
import { useBackClose } from '../back';
import Icon from '../Icon';

// In-app updates for the Android app installed outside the Play Store. On start (and when the
// app comes back to the front) it asks the server for the latest version. A newer one can be
// downloaded and installed from here; a version below the server's minimum is blocked until
// it updates. The native side (AppUpdatePlugin.java) keeps only one APK and deletes it once
// installed, and refuses any APK that is not newer than the installed app.
const AppUpdate = registerPlugin('AppUpdate');
const RECHECK_MS = 30 * 60 * 1000;

export default function Update() {
  const t = useT();
  const [info, setInfo] = useState(null); // latest.json from the server, when newer than this app
  const [forced, setForced] = useState(false);
  const [later, setLater] = useState(false);
  const [state, setState] = useState('idle'); // idle | downloading | permission | error
  const [pct, setPct] = useState(-1);
  const lastCheck = useRef(0);
  const waitingPermission = useRef(false);

  const install = async () => {
    const { status } = await AppUpdate.install();
    waitingPermission.current = status === 'permission';
    setState(status === 'permission' ? 'permission' : 'idle');
  };

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    const check = async () => {
      lastCheck.current = Date.now();
      try {
        const [{ build }, res] = await Promise.all([App.getInfo(), fetch(`${BASE}/app/latest?app=partner`, { cache: 'no-store' })]);
        if (!res.ok) return;
        const latest = await res.json();
        const current = Number(build);
        if (latest.versionCode > current) {
          setInfo(latest);
          setForced(current < (latest.minVersionCode || 0));
        } else setInfo(null);
      } catch {
        // Offline: try again next time the app opens.
      }
    };
    AppUpdate.cleanup().catch(() => {}).finally(check);
    const sub = App.addListener('resume', () => {
      // Back from the "Install unknown apps" settings screen: carry on with the install.
      if (waitingPermission.current) install().catch(() => setState('error'));
      else if (Date.now() - lastCheck.current > RECHECK_MS) check();
    });
    return () => { sub.then((s) => s.remove()); };
  }, []);

  const open = !!info && (forced || !later);
  useBackClose(() => (forced ? App.exitApp() : setLater(true)), open);
  if (!open) return null;

  const update = async () => {
    setState('downloading');
    setPct(-1);
    const sub = await AppUpdate.addListener('progress', (p) => setPct(p.percent));
    try {
      await AppUpdate.download({ url: `${BASE}/app/download?app=partner&v=${info.versionCode}`, sha256: info.sha256 || '' });
      await install();
    } catch {
      setState('error');
    } finally {
      sub.remove();
    }
  };

  const busy = state === 'downloading';
  return (
    <div className="update-wrap">
      <div className="update card">
        <Icon name="circle-arrow-up" className="update-icon" />
        <h2>{forced ? t.updateRequired : t.updateAvailable}</h2>
        <p className="muted">{t.updateVersion(info.versionName)}</p>
        {info.notes && <p className="update-notes">{info.notes}</p>}
        {forced && <p className="muted">{t.updateForcedText}</p>}
        {state === 'permission' && <p className="muted">{t.updatePermission}</p>}
        {state === 'error' && <p className="update-error">{t.updateFailed}</p>}
        {busy && (
          <div className="update-bar" aria-label={t.updateDownloading}>
            <i style={{ width: pct >= 0 ? `${pct}%` : '100%' }} className={pct < 0 ? 'indeterminate' : ''} />
          </div>
        )}
        <button className="btn primary solid wide" onClick={state === 'permission' ? install : update} disabled={busy}>
          <Icon name={busy ? 'spinner' : 'download'} spin={busy} />{' '}
          {busy ? (pct >= 0 ? `${t.updateDownloading} ${pct}%` : t.updateDownloading) : state === 'error' ? t.retry : t.updateNow}
        </button>
        {!forced && !busy && (
          <button className="btn wide" onClick={() => setLater(true)}>{t.updateLater}</button>
        )}
      </div>
    </div>
  );
}
