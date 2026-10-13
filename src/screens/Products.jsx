import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';
import { useProducts } from '../products';

// Product catalogue: the main (daily delivery) product, then other products for the shop and as
// extra daily items for customers.
export default function Products({ onBack }) {
  const { saveProduct } = useStore();
  const { main, extras } = useProducts();
  const t = useT();
  const [editing, setEditing] = useState(null); // 'main' | product id | 'new'
  useBackClose(onBack);

  const list = [...extras].sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));

  return (
    <>
      <header className="datebar">
        <button className="arrow" aria-label={t.cancel} onClick={onBack}><Icon name="arrow-left" flip /></button>
        <div className="big"><Icon name="boxes-stacked" /> {t.products}</div>
        <span className="arrow ghost" />
      </header>

      <h2>{t.mainProduct}</h2>
      {editing === 'main' ? (
        <ProductForm product={main} onDone={() => setEditing(null)} />
      ) : (
        <div className="card row">
          <button className="grow link plain" onClick={() => setEditing('main')}>
            <span className="catico prod"><Icon name="star" /></span>
            <div className="grow">
              <div className="name">{main.name}</div>
              <div className="muted">{main.price ? `${t.rs} ${money(main.price)} / ${main.unit}` : main.unit}</div>
            </div>
            <Icon name="pen" className="muted" />
          </button>
        </div>
      )}
      <p className="muted pad">{t.mainProductHelp}</p>

      <h2>{t.otherProducts}</h2>
      {editing === 'new' ? (
        <ProductForm onDone={() => setEditing(null)} />
      ) : (
        <button className="btn primary solid wide" onClick={() => setEditing('new')}><Icon name="plus" /> {t.addProduct}</button>
      )}
      {list.length === 0 && editing !== 'new' && <p className="empty">{t.noOtherProducts}</p>}
      {list.map((p) =>
        editing === p.id ? (
          <ProductForm key={p.id} product={p} onDone={() => setEditing(null)} />
        ) : (
          <div key={p.id} className={`card row small ${p.active === false ? 'dim' : ''}`}>
            <button className="grow link plain" onClick={() => setEditing(p.id)}>
              <span className="catico prod"><Icon name="box" /></span>
              <div className="grow">
                <div>{p.name}</div>
                <div className="muted">{t.rs} {money(p.price)} / {p.unit}{p.active === false && ` · ${t.inactive}`}</div>
              </div>
              <Icon name="pen" className="muted" />
            </button>
            <button
              role="switch"
              aria-checked={p.active !== false}
              aria-label={p.active === false ? t.inactive : t.active}
              className={`switch ${p.active !== false ? 'on' : ''}`}
              onClick={() => saveProduct({ id: p.id, active: p.active === false })}
            >
              <span className="track"><span className="knob" /></span>
            </button>
          </div>
        ),
      )}
    </>
  );
}

// Add / edit a product. The main product is saved into settings.
function ProductForm({ product, onDone }) {
  const { saveProduct, saveSettings } = useStore();
  const t = useT();
  useBackClose(onDone);
  const [f, setF] = useState({
    name: product?.name || '',
    unit: product?.unit || '',
    price: product ? String(product.price || '') : '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: k === 'price' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const name = f.name.trim();
    const unit = f.unit.trim();
    if (!name || !unit) return;
    if (product?.main) saveSettings({ mainName: name, mainUnit: unit, mainPrice: Number(f.price) || 0 });
    else saveProduct({ ...(product && { id: product.id }), name, unit, price: Number(f.price) || 0 });
    onDone();
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label><span><Icon name="tag" /> {t.productName}</span><input value={f.name} onChange={set('name')} autoFocus required /></label>
      <div className="two">
        <label><span><Icon name="scale-balanced" /> {t.unitLabel}</span><input value={f.unit} onChange={set('unit')} required /></label>
        <label><span><Icon name="money-bill-wave" /> {t.priceOf(f.unit.trim() || '…')}</span><input value={f.price} onChange={set('price')} inputMode="decimal" dir="ltr" /></label>
      </div>
      <div className="two">
        <button type="submit" className="btn primary solid"><Icon name="thumbs-up" /> {t.save}</button>
        <button type="button" className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </form>
  );
}
