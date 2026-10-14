import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { api, BASE } from '../api';
import Icon from '../Icon';
import { useBackClose } from '../back';

// Help & Support: contact details (set in the admin dashboard) and conversations with the
// support team. A conversation starts with a message (text, photo, voice note) and continues
// with replies from both sides. `contactOnly` is the logged-out version on the login screen.
const MAX_VOICE_SECONDS = 120;
const CONTACT_CACHE = 'supportContact';

// 0300 1234567 -> 923001234567 (wa.me wants the international number without +)
const waNumber = (n) => {
  const d = String(n).replace(/\D/g, '');
  return d.startsWith('0') ? `92${d.slice(1)}` : d;
};

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

// Phone photos are several MB; send a JPEG at most 1600px on the long side.
async function shrinkImage(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

const voiceType = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Support({ onBack, contactOnly = false }) {
  const { data } = useStore();
  const t = useT();
  useBackClose(onBack);

  const [contact, setContact] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CONTACT_CACHE)) || null; } catch { return null; }
  });
  const [tickets, setTickets] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState(null); // conversation being viewed
  const token = data.auth?.token;

  const loadTickets = () => api('/support/mine', {}, token).then((r) => setTickets(r.tickets), () => setTickets((x) => x || []));
  const loadContact = () =>
    api('/support/contact').then((c) => {
      setContact(c);
      try { localStorage.setItem(CONTACT_CACHE, JSON.stringify(c)); } catch {}
    }, () => {});

  // Contact details and conversations (e.g. to check whether support has answered).
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadContact(), !contactOnly && loadTickets()]);
    setRefreshing(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (openId) {
    return <Thread id={openId} token={token} onBack={() => { setOpenId(null); loadTickets(); }} />;
  }

  const hasContact = contact && (contact.phone || contact.whatsapp || contact.email);

  return (
    <>
      <header className="datebar">
        <button className="arrow" aria-label={t.cancel} onClick={onBack}><Icon name="arrow-left" flip /></button>
        <div className="big"><Icon name="headset" /> {t.support}</div>
        <button className="arrow" aria-label={t.refresh} onClick={refresh} disabled={refreshing}><Icon name="rotate" spin={refreshing} /></button>
      </header>

      <div className="card form">
        <div className="name"><Icon name="phone" /> {t.contactUs}</div>
        {!hasContact && <div className="muted">{contact ? t.contactNone : t.errors.offline}</div>}
        {contact?.phone && (
          <a className="btn wide contactbtn" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
            <Icon name="phone" /> <span>{t.call}</span> <b dir="ltr">{contact.phone}</b>
          </a>
        )}
        {(contact?.whatsapp || contact?.phone) && (
          <a className="btn wide wa contactbtn" href={`https://wa.me/${waNumber(contact.whatsapp || contact.phone)}`}>
            <Icon name="whatsapp" brand /> <span>WhatsApp</span> <b dir="ltr">{contact.whatsapp || contact.phone}</b>
          </a>
        )}
        {contact?.email && (
          <a className="btn wide contactbtn" href={`mailto:${contact.email}`}>
            <Icon name="envelope" /> <span>{t.email}</span> <b dir="ltr">{contact.email}</b>
          </a>
        )}
      </div>

      {contactOnly ? (
        <div className="muted center">{t.supportLoginToSend}</div>
      ) : (
        <>
          <SendForm token={token} onSent={(r) => r?.id && setOpenId(r.id)} />
          <h2>{t.supportHistory}</h2>
          {tickets === null && <div className="empty"><Icon name="spinner" spin /></div>}
          {tickets?.length === 0 && <div className="empty">{t.supportNoHistory}</div>}
          {tickets?.map((k) => <ConversationRow key={k.id} k={k} onOpen={() => setOpenId(k.id)} />)}
        </>
      )}
    </>
  );
}

const fmtTime = (s) => new Date(String(s).replace(' ', 'T')).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function StatusTag({ status }) {
  const t = useT();
  const [cls, icon, label] = status === 'open' ? ['orangetext', 'clock', t.ticketOpen] : status === 'replied' ? ['greentext', 'reply', t.ticketReplied] : ['muted', 'circle-check', t.ticketClosed];
  return <span className={cls}><Icon name={icon} /> {label}</span>;
}

// What a message holds, in one line: its text, or "Photo" / "Voice note".
function preview(m, t) {
  if (!m) return '';
  if (m.message) return m.message;
  return m.voice ? `🎤 ${t.voiceNote}` : `📷 ${t.photo}`;
}

function ConversationRow({ k, onOpen }) {
  const t = useT();
  return (
    <button className={`card ticket convo ${k.unread ? 'unread' : ''}`} onClick={onOpen}>
      <div className="ticket-head">
        <span className="muted" dir="ltr">{fmtTime(k.updatedAt)}</span>
        {k.unread ? <span className="newreply"><Icon name="circle" /> {t.newReply}</span> : <StatusTag status={k.status} />}
      </div>
      <p className="convo-last" dir="auto">
        <b>{k.last?.from === 'admin' ? t.supportTeam : t.you}:</b> {preview(k.last, t)}
      </p>
      <span className="muted convo-count"><Icon name="comments" /> {k.count}</span>
    </button>
  );
}

function Thread({ id, token, onBack }) {
  const t = useT();
  useBackClose(onBack);
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const end = useRef();

  const load = async () => {
    setRefreshing(true);
    try {
      setThread(await api(`/support/${id}`, {}, token));
      setError('');
    } catch (e) {
      setError(t.errors[e.code] || t.errors.server_error);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  return (
    <>
      <header className="datebar">
        <button className="arrow" aria-label={t.cancel} onClick={onBack}><Icon name="arrow-left" flip /></button>
        <div className="big"><Icon name="comments" /> {t.conversation}</div>
        <button className="arrow" aria-label={t.refresh} onClick={load} disabled={refreshing}><Icon name="rotate" spin={refreshing} /></button>
      </header>
      {error && <div className="error">{error}</div>}
      {!thread && !error && <div className="empty"><Icon name="spinner" spin /></div>}
      {thread && (
        <>
          <div className="chat">
            {thread.messages.map((m) => <Bubble key={m.id} m={m} token={token} />)}
          </div>
          {thread.status === 'closed' && <div className="muted center">{t.threadClosed}</div>}
          <SendForm token={token} ticketId={id} onSent={load} />
          <div ref={end} />
        </>
      )}
    </>
  );
}

function Bubble({ m, token }) {
  const t = useT();
  const mine = m.from === 'user';
  return (
    <div className={`bubble ${mine ? 'me' : 'them'}`}>
      {!mine && <b className="bubble-who"><Icon name="headset" /> {t.supportTeam}</b>}
      {m.image && <AuthMedia name={m.image} token={token} kind="image" />}
      {m.voice && <AuthMedia name={m.voice} token={token} kind="voice" seconds={m.voiceSeconds} />}
      {m.message && <p dir="auto">{m.message}</p>}
      <small dir="ltr">{fmtTime(m.createdAt)}</small>
    </div>
  );
}

// Photos and voice notes need the login token, which <img>/<audio> can't send: fetch them as
// blobs once per app session.
const mediaCache = new Map();
function useAuthBlob(name, token) {
  const [url, setUrl] = useState(() => mediaCache.get(name) || null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    let alive = true;
    fetch(`${BASE}/support/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        const u = URL.createObjectURL(b);
        mediaCache.set(name, u);
        if (alive) setUrl(u);
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [name]);
  return [url, failed];
}

function AuthMedia({ name, token, kind, seconds }) {
  const t = useT();
  const [url, failed] = useAuthBlob(name, token);
  const [big, setBig] = useState(false);
  useBackClose(() => setBig(false), big);
  if (failed) return <div className="muted"><Icon name={kind === 'image' ? 'image' : 'microphone'} /> {kind === 'image' ? t.photo : t.voiceNote}</div>;
  if (!url) return <div className="muted"><Icon name="spinner" spin /></div>;
  if (kind === 'voice') {
    return (
      <div className="bubble-voice">
        <audio src={url} controls preload="metadata" />
        {seconds ? <small dir="ltr">{clock(seconds)}</small> : null}
      </div>
    );
  }
  return (
    <>
      <img className="bubble-img" src={url} alt={t.photo} onClick={() => setBig(true)} />
      {big && (
        <div className="photo-full" onClick={() => setBig(false)}>
          <img src={url} alt={t.photo} />
        </div>
      )}
    </>
  );
}

function SendForm({ token, onSent, ticketId = null }) {
  const t = useT();
  const [message, setMessage] = useState('');
  const [image, setImage] = useState(null); // { blob, url }
  const [voice, setVoice] = useState(null); // { blob, url, seconds }
  const [recording, setRecording] = useState(0); // seconds while recording, 0 = not recording
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { text, error }
  const rec = useRef(null);
  const fileInput = useRef();

  // Stop the mic and free preview URLs when leaving the screen.
  useEffect(() => () => {
    rec.current?.stop();
  }, []);
  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);
  useEffect(() => () => voice && URL.revokeObjectURL(voice.url), [voice]);

  const pickImage = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrinkImage(file);
      setImage({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setNote({ text: t.supportBadImage, error: true });
    }
  };

  const startRecording = async () => {
    setNote(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setNote({ text: t.micDenied, error: true });
    }
    const type = voiceType();
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const started = Date.now();
    const timer = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      setRecording(Math.max(s, 1));
      if (s >= MAX_VOICE_SECONDS) mr.stop();
    }, 250);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((tr) => tr.stop());
      rec.current = null;
      setRecording(0);
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const blob = new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] });
      if (blob.size) setVoice({ blob, url: URL.createObjectURL(blob), seconds });
    };
    mr.start();
    rec.current = mr;
    setRecording(1);
  };

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await api(ticketId ? `/support/${ticketId}/reply` : '/support', {
        message,
        image: image && { data: await toBase64(image.blob), type: image.blob.type },
        voice: voice && { data: await toBase64(voice.blob), type: voice.blob.type, seconds: voice.seconds },
        appVersion: __APP_VERSION__,
      }, token);
      setMessage('');
      setImage(null);
      setVoice(null);
      onSent(res);
    } catch (e) {
      setNote({ text: t.errors[e.code] || t.errors.server_error, error: true });
    } finally {
      setBusy(false);
    }
  };

  const empty = !message.trim() && !image && !voice;
  return (
    <div className="card form">
      {!ticketId && (
        <>
          <div className="name"><Icon name="comment-dots" /> {t.supportSend}</div>
          <div className="muted">{t.supportSendHelp}</div>
        </>
      )}
      <textarea className="supportbox" dir="auto" rows={ticketId ? 2 : 4} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder={ticketId ? t.replyPlaceholder : t.supportPlaceholder} disabled={busy} />

      {image && (
        <div className="attach">
          <img src={image.url} alt="" />
          <button className="btn red compact" onClick={() => setImage(null)} disabled={busy} aria-label={t.remove}><Icon name="trash" /></button>
        </div>
      )}
      {voice && (
        <div className="attach">
          <audio src={voice.url} controls />
          <button className="btn red compact" onClick={() => setVoice(null)} disabled={busy} aria-label={t.remove}><Icon name="trash" /></button>
        </div>
      )}

      {recording ? (
        <button className="btn red solid wide recording" onClick={() => rec.current?.stop()}>
          <Icon name="stop" /> {t.stopRecording} <b dir="ltr">{clock(recording)} / {clock(MAX_VOICE_SECONDS)}</b>
        </button>
      ) : (
        <div className="two">
          <button className="btn" onClick={() => fileInput.current.click()} disabled={busy}>
            <Icon name="camera" /> {image ? t.changePhoto : t.addPhoto}
          </button>
          <button className="btn" onClick={startRecording} disabled={busy || !window.MediaRecorder}>
            <Icon name="microphone" /> {voice ? t.recordAgain : t.recordVoice}
          </button>
        </div>
      )}
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickImage} />

      {note && <div className={note.error ? 'error' : 'muted greentext'}>{note.text}</div>}
      <button className="btn primary solid wide" onClick={send} disabled={busy || empty || !!recording}>
        <Icon name={busy ? 'spinner' : 'paper-plane'} spin={busy} flip={!busy} /> {t.send}
      </button>
    </div>
  );
}
