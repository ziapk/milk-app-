import { useEffect, useRef, useState } from 'react';
import { api, uploadFile, errorText } from '../api';
import { Badge, useUi } from '../components/ui';
import { ago } from '../format';

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const APPS = [
  ['partner', 'Partner app', 'npm run bump', 'npm run apk:release', 'android/app/build/outputs/apk/release/app-release.apk'],
  ['admin', 'Admin app', 'npm run admin:bump', 'npm run admin:apk', 'admin-app/android/app/build/outputs/apk/release/app-release.apk'],
];

// Android app releases for in-app updates (partner app and admin app). An uploaded APK replaces
// the published one of the same app (the server reads which app it is and deletes the old file);
// phones see the update the next time the app opens.
export default function Release() {
  const { notify, confirm } = useUi();
  const [releases, setReleases] = useState(undefined); // undefined = loading
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [force, setForce] = useState(false);
  const [pct, setPct] = useState(null); // upload progress while uploading
  const [error, setError] = useState('');
  const input = useRef();

  useEffect(() => {
    api('/release').then(setReleases, (err) => {
      setReleases({});
      setError(errorText(err));
    });
  }, []);

  const askForce = (text) => confirm({ title: 'Force this update?', text, ok: 'Force update', danger: true });

  const upload = async (e) => {
    e.preventDefault();
    setError('');
    if (force && !(await askForce('Everyone on an older version of this app will be blocked until they update.'))) return;
    setPct(0);
    try {
      const q = new URLSearchParams({ notes, ...(force && { force: '1' }) });
      const info = await uploadFile(`/release?${q}`, file, setPct);
      setReleases((r) => ({ ...r, [info.app]: info }));
      setFile(null);
      setNotes('');
      setForce(false);
      input.current.value = '';
      notify(`${APPS.find(([k]) => k === info.app)[1]} ${info.versionName} published`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPct(null);
    }
  };

  const setForced = async (app, info, forced) => {
    if (forced && !(await askForce(`Everyone below version ${info.versionName} will be blocked until they update.`))) return;
    try {
      const next = await api(`/release/${app}`, { method: 'PUT', body: { forced } });
      setReleases((r) => ({ ...r, [app]: next }));
      notify(forced ? 'Update is now required' : 'Update is now optional');
    } catch (err) {
      notify(errorText(err), true);
    }
  };

  const pageUrl = (app) => `${location.origin}/download${app === 'partner' ? '' : `?app=${app}`}`;
  const copyLink = async (app) => {
    try {
      await navigator.clipboard.writeText(pageUrl(app));
      notify('Download link copied');
    } catch {
      notify(pageUrl(app));
    }
  };

  const busy = pct !== null;
  return (
    <div className="narrow">
      {APPS.map(([app, label]) => {
        const info = releases?.[app];
        return (
          <section className="panel" key={app}>
            <div className="panel-head">
              <div>
                <h3>{label}</h3>
                <p className="muted">Published version, offered to phones when they open the app.</p>
              </div>
              {info && (info.forced ? <Badge kind="warn" icon="lock">Required</Badge> : <Badge kind="good">Optional</Badge>)}
            </div>
            {releases === undefined && <p className="muted"><i className="fa-solid fa-spinner fa-spin" /> Loading…</p>}
            {releases && !info && <p className="muted">Nothing published yet.</p>}
            {info && (
              <>
                <dl className="facts">
                  <div><dt>Version</dt><dd>{info.versionName} <span className="muted">({info.versionCode})</span></dd></div>
                  <div><dt>Size</dt><dd>{mb(info.size)}</dd></div>
                  <div><dt>Published</dt><dd>{ago(info.publishedAt)}</dd></div>
                  <div><dt>By</dt><dd>@{info.publishedBy}</dd></div>
                </dl>
                {info.notes && <p className="release-notes">{info.notes}</p>}
                <div className="share-link">
                  <i className="fa-solid fa-globe" />
                  <a href={pageUrl(app)} target="_blank" rel="noreferrer">{pageUrl(app).replace(/^https?:\/\//, '')}</a>
                  <button className="btn" onClick={() => copyLink(app)}><i className="fa-solid fa-copy" /> Copy</button>
                </div>
                <div className="row-btns">
                  <a className="btn" href={`/api/app/download?app=${app}`}><i className="fa-solid fa-download" /> Download APK</a>
                  <button className="btn" onClick={() => setForced(app, info, !info.forced)}>
                    <i className={`fa-solid fa-${info.forced ? 'lock-open' : 'lock'}`} /> {info.forced ? 'Make optional' : 'Make required'}
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}

      <section className="panel">
        <h3>Upload new version</h3>
        <p className="muted">
          Pick a release APK of either app. The app and version are read from the file, and that app's previous APK is
          deleted from the server.
        </p>
        <ul className="muted release-help">
          {APPS.map(([app, label, bump, build, out]) => (
            <li key={app}><b>{label}:</b> <code>{bump}</code>, then <code>{build}</code> → <code>{out}</code></li>
          ))}
        </ul>
        <form onSubmit={upload} className="stack">
          <label className="field">
            <span>Release APK</span>
            <input ref={input} type="file" accept=".apk,application/vnd.android.package-archive" required disabled={busy}
              onChange={(e) => setFile(e.target.files[0] || null)} />
            {file && <small className="muted">{file.name} · {mb(file.size)}</small>}
          </label>
          <label className="field">
            <span>What's new <small className="muted">(optional, shown in the app)</small></span>
            <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy}
              placeholder="e.g. Bug fixes and faster sync" />
          </label>
          <label className="check">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={busy} />
            <span>Required update <small className="muted">(older versions can't be used until they update)</small></span>
          </label>
          {busy && <div className="progress"><i style={{ width: `${pct}%` }} /></div>}
          {error && <div className="alert">{error}</div>}
          <div>
            <button className="btn solid" disabled={!file || busy}>
              <i className={`fa-solid fa-${busy ? 'spinner fa-spin' : 'upload'}`} /> {busy ? `Uploading ${pct}%` : 'Publish'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
