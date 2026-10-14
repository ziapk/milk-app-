import { useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Modal, useUi } from '../components/ui';
import { ago } from '../format';

const FILTERS = [
  ['open', 'Open'],
  ['replied', 'Replied'],
  ['closed', 'Closed'],
  ['', 'All'],
];
const STATUS = {
  open: ['warn', 'clock', 'Open'],
  replied: ['good', 'reply', 'Replied'],
  closed: ['idle', 'circle-check', 'Closed'],
};
const fileUrl = (name) => `/api/admin/support/files/${name}`;
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Messages sent from the app's Help & Support screen (text, photo, voice note), and the contact
// details that screen shows.
export default function Support({ onCount }) {
  const { notify } = useUi();
  const [filter, setFilter] = useState('open');
  const [list, setList] = useState(null);
  const [counts, setCounts] = useState({});
  const [photo, setPhoto] = useState(null);

  const load = () =>
    api(`/support${filter ? `?status=${filter}` : ''}`).then((r) => {
      setList(r.tickets);
      setCounts({ ...r.counts, '': r.counts.total });
      onCount?.(r.counts.open);
    }, (err) => notify(errorText(err), true));

  useEffect(() => {
    setList(null);
    load();
  }, [filter]);

  return (
    <div className="narrow wide-ish">
      <ContactPanel />
      <div className="toolbar">
        <div className="segments" role="tablist">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {label} <span className="count">{counts[k] ?? ''}</span>
            </button>
          ))}
        </div>
      </div>
      {list === null && <p className="empty"><i className="fa-solid fa-spinner fa-spin" /></p>}
      {list?.length === 0 && <p className="empty">No messages here.</p>}
      {list?.map((k) => <Ticket key={k.id} k={k} onChanged={load} onPhoto={setPhoto} />)}
      {photo && (
        <Modal title="Photo" onClose={() => setPhoto(null)}>
          <img className="support-photo-full" src={fileUrl(photo)} alt="" />
          <div className="modal-actions">
            <a className="btn" href={fileUrl(photo)} target="_blank" rel="noreferrer"><i className="fa-solid fa-up-right-from-square" /> Open</a>
            <button className="btn solid" onClick={() => setPhoto(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Ticket({ k, onChanged, onPhoto }) {
  const { notify, confirm } = useUi();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, icon, label] = STATUS[k.status] || STATUS.open;

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      notify(done);
      onChanged();
    } catch (err) {
      notify(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };
  const sendReply = (e) => {
    e.preventDefault();
    run(() => api(`/support/${k.id}/reply`, { method: 'POST', body: { reply } }), 'Reply sent').then(() => setReply(''));
  };
  const setStatus = (status) => run(() => api(`/support/${k.id}/status`, { method: 'POST', body: { status } }), status === 'closed' ? 'Closed' : 'Reopened');
  const remove = async () => {
    if (await confirm({ title: 'Delete this message?', text: 'The message, photo and voice note are deleted for good.', ok: 'Delete', danger: true })) {
      run(() => api(`/support/${k.id}`, { method: 'DELETE' }), 'Deleted');
    }
  };

  return (
    <section className="panel ticket">
      <div className="panel-head">
        <div>
          <h3><a href={`#/users/${k.user.id}`}>{k.user.name}</a> <span className="muted">· {k.user.phone}</span></h3>
          <p className="muted">{ago(k.createdAt)}{k.appVersion && ` · app v${k.appVersion}`}</p>
        </div>
        <Badge kind={kind} icon={icon}>{label}</Badge>
      </div>
      {k.message && <p className="ticket-text" dir="auto">{k.message}</p>}
      {(k.image || k.voice) && (
        <div className="ticket-files">
          {k.image && (
            <button className="ticket-thumb" onClick={() => onPhoto(k.image)} aria-label="View photo">
              <img src={fileUrl(k.image)} alt="" loading="lazy" />
            </button>
          )}
          {k.voice && (
            <div className="ticket-voice">
              <i className="fa-solid fa-microphone" /> {k.voiceSeconds ? clock(k.voiceSeconds) : 'Voice note'}
              <audio src={fileUrl(k.voice)} controls preload="none" />
            </div>
          )}
        </div>
      )}
      {k.reply && (
        <div className="ticket-reply">
          <small className="muted">Reply by @{k.repliedBy} · {ago(k.repliedAt)}</small>
          <p dir="auto">{k.reply}</p>
        </div>
      )}
      {k.status !== 'closed' && (
        <form onSubmit={sendReply} className="ticket-form">
          <textarea rows={2} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy}
            placeholder={k.reply ? 'Send another reply (replaces the one above)' : 'Write a reply. The user sees it in the app.'} />
          <button className="btn solid" disabled={busy || !reply.trim()}><i className="fa-solid fa-paper-plane" /> Reply</button>
        </form>
      )}
      <div className="row-btns tight-end">
        {k.user.phone && <a className="btn" href={`tel:${k.user.phone}`}><i className="fa-solid fa-phone" /> Call</a>}
        {k.status === 'closed'
          ? <button className="btn" onClick={() => setStatus('open')} disabled={busy}><i className="fa-solid fa-rotate-left" /> Reopen</button>
          : <button className="btn" onClick={() => setStatus('closed')} disabled={busy}><i className="fa-solid fa-circle-check" /> Close</button>}
        <button className="btn danger-ghost" onClick={remove} disabled={busy}><i className="fa-solid fa-trash" /> Delete</button>
      </div>
    </section>
  );
}

function ContactPanel() {
  const { notify } = useUi();
  const [f, setF] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/support-contact').then(setF, () => setF({ phone: '', whatsapp: '', email: '' }));
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setF(await api('/support-contact', { method: 'PUT', body: f }));
      setOpen(false);
      notify('Contact details saved');
    } catch (err) {
      notify(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  if (!f) return null;
  const missing = !f.phone && !f.whatsapp && !f.email;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Contact details in the app</h3>
          <p className="muted">Shown on the app's Help &amp; Support screen and the login screen.</p>
        </div>
        {!open && <button className="btn" onClick={() => setOpen(true)}><i className="fa-solid fa-pen" /> Edit</button>}
      </div>
      {open ? (
        <form onSubmit={save} className="stack">
          <label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} placeholder="0300 1234567" inputMode="tel" /></label>
          <label className="field"><span>WhatsApp <small className="muted">(leave empty to use the phone number)</small></span><input value={f.whatsapp} onChange={set('whatsapp')} placeholder="0300 1234567" inputMode="tel" /></label>
          <label className="field"><span>Email</span><input value={f.email} onChange={set('email')} placeholder="support@example.com" type="email" /></label>
          <div className="row-btns">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn solid" disabled={busy}>Save</button>
          </div>
        </form>
      ) : missing ? (
        <div className="alert">No contact details yet. Users will see "not available". Add them with Edit.</div>
      ) : (
        <dl className="facts">
          <div><dt>Phone</dt><dd>{f.phone || '—'}</dd></div>
          <div><dt>WhatsApp</dt><dd>{f.whatsapp || (f.phone ? 'Same as phone' : '—')}</dd></div>
          <div><dt>Email</dt><dd>{f.email || '—'}</dd></div>
        </dl>
      )}
    </section>
  );
}
