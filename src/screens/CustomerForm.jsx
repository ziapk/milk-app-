import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';

export default function CustomerForm({ customer, onDone }) {
  const { saveCustomer } = useStore();
  const t = useT();
  useBackClose(onDone);
  const [f, setF] = useState(
    customer || { name: '', phone: '', address: '', rate: 200, defaultQty: 1, active: true }
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    saveCustomer({ ...f, name: f.name.trim(), rate: Number(f.rate) || 0, defaultQty: Number(f.defaultQty) || 0 });
    onDone();
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label><span><Icon name="user" /> {t.name}</span><input value={f.name} onChange={set('name')} autoFocus required /></label>
      <label><span><Icon name="phone" /> {t.phone}</span><input value={f.phone} onChange={set('phone')} inputMode="tel" dir="ltr" /></label>
      <label><span><Icon name="house" /> {t.address}</span><input value={f.address} onChange={set('address')} /></label>
      <div className="two">
        <label><span><Icon name="tag" /> {t.rate}</span><input value={f.rate} onChange={set('rate')} inputMode="decimal" dir="ltr" /></label>
        <label><span><Icon name="bottle-droplet" /> {t.defaultQty}</span><input value={f.defaultQty} onChange={set('defaultQty')} inputMode="decimal" dir="ltr" /></label>
      </div>
      {customer && (
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          {f.active ? t.active : t.inactive}
        </label>
      )}
      <div className="two">
        <button type="submit" className="btn primary solid"><Icon name="thumbs-up" /> {t.save}</button>
        <button type="button" className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </form>
  );
}
