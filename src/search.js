import { Capacitor, registerPlugin } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ْٰ]/g, '') // Urdu diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();

// Allows one typo in longer words, since voice results are rarely spelt like the saved name.
function close(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Every word typed (or heard) must start, or nearly match, a word in the name.
export function matches(name, query) {
  const q = norm(query).split(/\s+/).filter(Boolean);
  if (q.length === 0) return true;
  const words = norm(name).split(/\s+/);
  const flat = words.join('');
  return q.every((w) => flat.includes(w) || words.some((n) => n.startsWith(w) || close(n, w)));
}

export const filterCustomers = (list, query) => list.filter((c) => matches(c.name, query));

// Native helper (android/.../VoiceSettingsPlugin.java) that opens the phone's voice settings,
// where offline speech languages are downloaded.
const VoiceSettings = registerPlugin('VoiceSettings');
export const canOpenVoiceSettings = () => Capacitor.getPlatform() === 'android';
export const openVoiceSettings = () => VoiceSettings.open();

const webRecognizer = () => window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupported = () => Capacitor.isNativePlatform() || !!webRecognizer();

// Names are usually saved in English letters, so listen in English unless most names are in Urdu script.
export function voiceLanguage(customers) {
  const urdu = customers.filter((c) => /[؀-ۿ]/.test(c.name)).length;
  return urdu > customers.length / 2 ? 'ur-PK' : 'en-IN';
}

// Resolves with the candidate phrases heard (best first), or [] if nothing was understood.
export async function listen(language) {
  if (Capacitor.isNativePlatform()) {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error('unavailable');
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('denied');
    const { matches } = await SpeechRecognition.start({ language, maxResults: 5, popup: true, partialResults: false });
    return matches || [];
  }
  const Rec = webRecognizer();
  if (!Rec) throw new Error('unavailable');
  return new Promise((resolve, reject) => {
    const r = new Rec();
    r.lang = language;
    r.maxAlternatives = 5;
    r.onresult = (e) => resolve([...e.results[0]].map((a) => a.transcript));
    r.onerror = (e) => (e.error === 'no-speech' ? resolve([]) : reject(new Error(e.error)));
    r.onend = () => resolve([]);
    r.start();
  });
}
