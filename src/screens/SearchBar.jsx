import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { canOpenVoiceSettings, listen, matches, openVoiceSettings, voiceLanguage, voiceSupported } from '../search';
import Icon from '../Icon';

// Text search with a mic button. Voice returns several guesses; we keep the first that matches a customer.
export default function SearchBar({ value, onChange }) {
  const { data } = useStore();
  const t = useT();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');

  const voice = async () => {
    setError('');
    setListening(true);
    try {
      const heard = await listen(voiceLanguage(data.customers));
      if (heard.length === 0) return;
      const best = heard.find((h) => data.customers.some((c) => matches(c.name, h))) || heard[0];
      onChange(best);
    } catch (e) {
      setError(e.message === 'denied' ? t.micDenied : t.voiceFailed);
    } finally {
      setListening(false);
    }
  };

  return (
    <>
      <div className="search">
        <Icon name="magnifying-glass" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t.search} enterKeyHint="search" />
        {value && (
          <button aria-label={t.clear} onClick={() => onChange('')}><Icon name="xmark" /></button>
        )}
        {voiceSupported() && (
          <button aria-label={t.voiceSearch} className={listening ? 'live' : ''} onClick={voice} disabled={listening}>
            <Icon name="microphone" />
          </button>
        )}
      </div>
      {error && (
        <div className="muted center voiceerr">
          {error}
          {canOpenVoiceSettings() && error === t.voiceFailed && (
            <button className="linkbtn blue" onClick={() => openVoiceSettings().catch(() => {})}>
              <Icon name="download" /> {t.offlineVoiceGet}
            </button>
          )}
        </div>
      )}
    </>
  );
}
