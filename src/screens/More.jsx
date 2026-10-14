import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { money, useT } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';
import { URDU_FONTS } from '../fonts';
import { canOpenVoiceSettings, openVoiceSettings, voiceLanguage } from '../search';
import Products from './Products';
import Support from './Support';
import Subscription from './Subscription';
import { useProducts } from '../products';

export default function More() {
  const { data, subscription, setLang, setUrduFont, logout, logoutOthers, deleteAccount, sync, syncState, saveSettings } = useStore();
  const { main, extras } = useProducts();
  const [productsOpen, setProductsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0); // conversations with a reply not seen yet
  const t = useT();
  const pending = data.queue.length;
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pin, setPin] = useState('');
  useBackClose(() => { setDeleting(false); setPin(''); }, deleting);

  useEffect(() => {
    if (supportOpen) return;
    api('/support/mine', {}, data.auth?.token).then((r) => setSupportUnread(r.tickets.filter((k) => k.unread).length), () => {});
  }, [supportOpen]);

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

  if (productsOpen) return <Products onBack={() => setProductsOpen(false)} />;
  if (supportOpen) return <Support onBack={() => setSupportOpen(false)} />;
  if (subOpen) return <Subscription onBack={() => setSubOpen(false)} />;

  const modes = data.settings;
  // At least one of delivery / shop stays on.
  const toggle = (k) => {
    if (modes[k] && !(k === 'delivery' ? modes.shop : modes.delivery)) return setNote(t.needOneMode);
    setNote('');
    saveSettings({ [k]: !modes[k] });
  };

  return (
    <>
      <h1><Icon name="gear" /> {t.settings}</h1>
      <button className="btn primary wide helpbtn" onClick={() => setSupportOpen(true)}>
        <Icon name="headset" /> {t.support}
        {supportUnread > 0 && <span className="dotcount">{supportUnread}</span>}
      </button>
      <button className="btn wide helpbtn" onClick={() => setSubOpen(true)}>
        <Icon name="receipt" /> {t.subscription}
        {data.billing && (data.billing.fee > 0 ? `: ${t.rs} ${money(data.billing.fee)}` : `: ${t.subFree}`)}
        {subscription.stage !== 'ok' && <span className="dotcount">!</span>}
      </button>
      <div className="card form">
        <div className="name"><Icon name="briefcase" /> {t.business}</div>
        <div className="muted">{t.businessHelp}</div>
        {[['delivery', 'motorcycle', t.homeDelivery, t.homeDeliveryHelp], ['shop', 'store', t.shop, t.shopHelp]].map(([k, icon, label, help]) => (
          <button key={k} role="switch" aria-checked={!!modes[k]} className={`modeswitch ${modes[k] ? 'on' : ''}`} onClick={() => toggle(k)}>
            <Icon name={icon} />
            <span className="grow"><b>{label}</b><small>{help}</small></span>
            <span className="track"><span className="knob" /></span>
          </button>
        ))}
        <button className="btn wide" onClick={() => setProductsOpen(true)}>
          <Icon name="boxes-stacked" /> {t.products}: {main.name} ({main.unit}){extras.length ? ` + ${extras.length}` : ''}
        </button>
      </div>
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
        <button className="btn primary wide" onClick={sync} disabled={syncState === 'syncing'}>
          <Icon name="rotate" spin={syncState === 'syncing'} /> {t.syncNow}
        </button>
      </div>
      <div className="card form">
        <div className="name"><Icon name="language" /> {t.language}</div>
        <div className="two">
          <button className={`btn ${data.lang === 'ur' ? 'primary solid' : ''}`} onClick={() => setLang('ur')}>اردو</button>
          <button className={`btn ${data.lang === 'en' ? 'primary solid' : ''}`} onClick={() => setLang('en')}>English</button>
        </div>
      </div>
      <div className="card form">
        <div className="name"><Icon name="font" /> {t.urduFont}</div>
        <div className="fontpick">
          {Object.entries(URDU_FONTS).map(([k, family]) => (
            <button key={k} className={data.urduFont === k ? 'on' : ''} onClick={() => setUrduFont(k)}>
              <span lang="ur" style={{ fontFamily: `"${family}"` }}>دودھ حساب</span>
              <small>{t.fontNames[k]}</small>
            </button>
          ))}
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
        <a href="privacy.html">{t.privacy}</a>
        <span dir="ltr">v{__APP_VERSION__}</span>
      </p>
    </>
  );
}
