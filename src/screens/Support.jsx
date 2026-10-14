import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { api } from '../api';
import Icon from '../Icon';
import { useBackClose } from '../back';

// Help & Support: contact details (set in the admin dashboard) and a message to the support team
// with an optional photo and voice note, plus the user's earlier messages and replies.
// `contactOnly` is the logged-out version on the login screen.
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
  const token = data.auth?.token;

  const loadTickets = () => api('/support/mine', {}, token).then((r) => setTickets(r.tickets), () => setTickets((x) => x || []));

  useEffect(() => {
    api('/support/contact').then((c) => {
      setContact(c);
      try { localStorage.setItem(CONTACT_CACHE, JSON.stringify(c)); } catch {}
    }, () => {});
    if (!contactOnly) loadTickets();
  }, []);

  const hasContact = contact && (contact.phone || contact.whatsapp || contact.email);

  return (
    <>
      <header className="datebar">
        <button className="arrow" aria-label={t.cancel} onClick={onBack}><Icon name="arrow-left" flip /></button>
        <div className="big"><Icon name="headset" /> {t.support}</div>
        <span className="arrow ghost" />
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
          <SendForm token={token} onSent={loadTickets} />
          <h2>{t.supportHistory}</h2>
          {tickets === null && <div className="empty"><Icon name="spinner" spin /></div>}
          {tickets?.length === 0 && <div className="empty">{t.supportNoHistory}</div>}
          {tickets?.map((k) => <Ticket key={k.id} k={k} />)}
        </>
      )}
    </>
  );
}

function SendForm({ token, onSent }) {
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
      await api('/support', {
        message,
        image: image && { data: await toBase64(image.blob), type: image.blob.type },
        voice: voice && { data: await toBase64(voice.blob), type: voice.blob.type, seconds: voice.seconds },
        appVersion: __APP_VERSION__,
      }, token);
      setMessage('');
      setImage(null);
      setVoice(null);
      setNote({ text: t.supportSent });
      onSent();
    } catch (e) {
      setNote({ text: t.errors[e.code] || t.errors.server_error, error: true });
    } finally {
      setBusy(false);
    }
  };

  const empty = !message.trim() && !image && !voice;
  return (
    <div className="card form">
      <div className="name"><Icon name="comment-dots" /> {t.supportSend}</div>
      <div className="muted">{t.supportSendHelp}</div>
      <textarea className="supportbox" dir="auto" rows={4} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder={t.supportPlaceholder} disabled={busy} />

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

function Ticket({ k }) {
  const t = useT();
  const status = k.status === 'open' ? ['orangetext', 'clock', t.ticketOpen] : k.status === 'replied' ? ['greentext', 'reply', t.ticketReplied] : ['muted', 'circle-check', t.ticketClosed];
  return (
    <div className="card ticket">
      <div className="ticket-head">
        <span className="muted" dir="ltr">{new Date(k.createdAt.replace(' ', 'T')).toLocaleString()}</span>
        <span className={status[0]}><Icon name={status[1]} /> {status[2]}</span>
      </div>
      {k.message && <p className="ticket-text" dir="auto">{k.message}</p>}
      {(k.hasImage || k.hasVoice) && (
        <div className="muted">
          {k.hasImage && <span><Icon name="image" /> {t.photo} </span>}
          {k.hasVoice && <span><Icon name="microphone" /> {t.voiceNote} {k.voiceSeconds ? <span dir="ltr">({clock(k.voiceSeconds)})</span> : null}</span>}
        </div>
      )}
      {k.reply && (
        <div className="ticket-reply">
          <b><Icon name="headset" /> {t.supportTeam}</b>
          <p dir="auto">{k.reply}</p>
        </div>
      )}
    </div>
  );
}
