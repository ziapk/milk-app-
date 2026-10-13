import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';
import { useProducts } from '../products';

export default function CustomerForm({ customer, onDone }) {
  const { saveCustomer } = useStore();
  const { main, extras } = useProducts();
  const t = useT();
  useBackClose(onDone);
  const [f, setF] = useState(() => {
    const c = customer || { name: '', phone: '', address: '', rate: main.price || 200, defaultQty: 1, active: true };
    return { ...c, items: (c.items || []).map((i) => ({ ...i, qty: String(i.qty), rate: String(i.rate) })) };
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Extra daily products (only offered once some exist in Settings > Products).
  const available = extras.filter((p) => p.active !== false && !f.items.some((i) => i.productId === p.id));
  const setItem = (n, patch) => setF({ ...f, items: f.items.map((i, k) => (k === n ? { ...i, ...patch } : i)) });
  const addItem = (productId) => {
    const p = extras.find((x) => x.id === productId);
    if (p) setF({ ...f, items: [...f.items, { productId, qty: '1', rate: String(p.price || 0) }] });
  };
  const decimal = (v) => v.replace(/[^\d.]/g, '');

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    saveCustomer({
      ...f,
      name: f.name.trim(),
      rate: Number(f.rate) || 0,
      defaultQty: Number(f.defaultQty) || 0,
      items: f.items.map((i) => ({ productId: i.productId, qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 })),
    });
    onDone();
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label><span><Icon name="user" /> {t.name}</span><input value={f.name} onChange={set('name')} autoFocus required /></label>
      <label><span><Icon name="phone" /> {t.phone}</span><input value={f.phone} onChange={set('phone')} inputMode="tel" dir="ltr" /></label>
      <label><span><Icon name="house" /> {t.address}</span><input value={f.address} onChange={set('address')} /></label>
      <div className="two">
        <label><span><Icon name="tag" /> {t.rateOf(main.unit)}</span><input value={f.rate} onChange={set('rate')} inputMode="decimal" dir="ltr" /></label>
        <label><span><Icon name="bottle-droplet" /> {t.dailyQtyOf(main.name, main.unit)}</span><input value={f.defaultQty} onChange={set('defaultQty')} inputMode="decimal" dir="ltr" /></label>
      </div>

      {(f.items.length > 0 || available.length > 0) && (
        <div className="extras">
          <div className="extras-title"><Icon name="basket-shopping" /> {t.extraDaily}</div>
          {f.items.map((i, n) => {
            const p = extras.find((x) => x.id === i.productId);
            return (
              <div key={i.productId} className="extra-row">
                <div className="extra-name">{p?.name || '?'}{p?.active === false && <small className="muted"> · {t.inactive}</small>}</div>
                <label><small>{p?.unit}</small>
                  <input value={i.qty} onChange={(e) => setItem(n, { qty: decimal(e.target.value) })} inputMode="decimal" dir="ltr" aria-label={t.dailyQtyOf(p?.name || '', p?.unit || '')} />
                </label>
                <label><small>{t.rs}</small>
                  <input value={i.rate} onChange={(e) => setItem(n, { rate: decimal(e.target.value) })} inputMode="decimal" dir="ltr" aria-label={t.rateShort} />
                </label>
                <button type="button" className="x" aria-label={t.close} onClick={() => setF({ ...f, items: f.items.filter((_, k) => k !== n) })}>
                  <Icon name="xmark" />
                </button>
              </div>
            );
          })}
          {available.length > 0 && (
            <select className="addextra" value="" onChange={(e) => addItem(e.target.value)} aria-label={t.addExtra}>
              <option value="">+ {t.addExtra}</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name} ({t.rs} {p.price} / {p.unit})</option>)}
            </select>
          )}
        </div>
      )}

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
