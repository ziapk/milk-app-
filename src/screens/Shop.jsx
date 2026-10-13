import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';
import { useProducts } from '../products';
import { usePeriod, PeriodBar } from './Period';
import AmountInput from './AmountInput';

// Litres and kilos sell in halves; bottles, eggs, packs in whole units.
export const stepOf = (p) => (/^(l|litre|liter|لیٹر|kg|کلو)$/i.test(p?.unit || '') ? 0.5 : 1);
const round2 = (n) => Math.round(n * 100) / 100;
export const saleSummary = (s) => s.items.map((i) => `${round2(i.qty)} ${i.name}`).join(', ');

// Shop counter: new sale, then the sales of the chosen day / month.
export default function Shop({ onNewSale }) {
  const { data, customerById, deleteSale } = useStore();
  const t = useT();
  const [editing, setEditing] = useState(null);
  const period = usePeriod();
  const list = data.sales.filter((s) => period.match(s.date));
  const total = list.reduce((s, x) => s + x.total, 0);
  const cash = list.reduce((s, x) => s + x.paid, 0);

  const editSale = editing && data.sales.find((s) => s.id === editing);
  if (editSale) return <SaleBox sale={editSale} onDone={() => setEditing(null)} />;

  return (
    <>
      <h1><Icon name="store" /> {t.shop}</h1>
      <button className="btn primary solid wide big" onClick={onNewSale}><Icon name="cart-plus" /> {t.newSale}</button>

      <PeriodBar period={period} />
      <div className="stat green span-full">
        <small><Icon name="store" /> {t.salesCount(list.length)}</small>
        <b>{t.rs} {money(total)}</b>
      </div>
      {list.length > 0 && (
        <div className="two">
          <div className="stat green"><small><Icon name="money-bill-wave" /> {t.cashSales}</small><b>{money(cash)}</b></div>
          <div className="stat red"><small><Icon name="book" /> {t.creditSales}</small><b>{money(total - cash)}</b></div>
        </div>
      )}

      {list.length === 0 && <p className="empty">{t.noSales}</p>}
      {list.map((s) => (
        <div key={s.id} className="card row small">
          <button className="grow link plain" onClick={() => setEditing(s.id)}>
            <span className="catico prod"><Icon name={s.customerId ? 'user' : 'store'} /></span>
            <div className="grow">
              <div>{s.customerId ? customerById(s.customerId)?.name || '?' : t.walkIn}</div>
              <div className="muted">{saleSummary(s)}</div>
              <div className="muted">{t.fmtDate(s.date)}</div>
            </div>
            <div className="lamt">
              <b className="greentext">{t.rs} {money(s.total)}</b>
              {s.total - s.paid > 0.5 && <small className="redtext">{money(s.total - s.paid)} {t.unpaidPart}</small>}
            </div>
            <Icon name="pen" className="muted" />
          </button>
          <button className="x" onClick={() => confirm(t.deleteSaleConfirm) && deleteSale(s.id)}><Icon name="xmark" /></button>
        </div>
      ))}
    </>
  );
}

// New sale, or edit an existing `sale`. Walk-in sales are paid in full; customer sales can be
// part paid, and the rest goes on the customer's account.
export function SaleBox({ sale, onDone }) {
  const { data, addSale, updateSale } = useStore();
  const { forSale, byId } = useProducts();
  const t = useT();
  useBackClose(onDone);
  const [lines, setLines] = useState(() => sale?.items.map((i) => ({ ...i, rate: String(i.rate) })) || []);
  const [customerId, setCustomerId] = useState(sale?.customerId || '');
  const [paid, setPaid] = useState(sale ? String(sale.paid) : '');
  const [date, setDate] = useState(sale?.date || today());
  const [note, setNote] = useState(sale?.note || '');

  const total = lines.reduce((s, l) => s + l.qty * (Number(l.rate) || 0), 0);
  const paidNow = customerId ? Math.min(Number(paid) || 0, total) : total;
  const customers = data.customers.filter((c) => c.active || c.id === customerId).sort((a, b) => a.name.localeCompare(b.name));

  const add = (p) =>
    setLines((ls) =>
      ls.some((l) => l.productId === p.id)
        ? ls.map((l) => (l.productId === p.id ? { ...l, qty: round2(l.qty + stepOf(p)) } : l))
        : [...ls, { productId: p.id, name: p.name, unit: p.unit, qty: 1, rate: String(p.price || 0) }],
    );
  const change = (n, patch) => setLines((ls) => ls.map((l, k) => (k === n ? { ...l, ...patch } : l)).filter((l) => l.qty > 0));

  const save = () => {
    if (!lines.length) return;
    const row = {
      customerId: customerId || null,
      items: lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, rate: Number(l.rate) || 0 })),
      paid: paidNow,
      note: note.trim(),
      date,
    };
    if (sale) updateSale(sale.id, row);
    else addSale(row);
    onDone();
  };

  return (
    <>
      <header className="datebar">
        <button className="arrow" aria-label={t.cancel} onClick={onDone}><Icon name="arrow-left" flip /></button>
        <div className="big"><Icon name="cart-plus" /> {t.newSale}</div>
        <span className="arrow ghost" />
      </header>

      <div className="prodgrid">
        {forSale.map((p) => {
          const inCart = lines.find((l) => l.productId === p.id);
          return (
            <button key={p.id} className={`prodtile ${inCart ? 'on' : ''}`} onClick={() => add(p)}>
              <b>{p.name}</b>
              <small>{t.rs} {money(p.price)} / {p.unit}</small>
              {inCart && <i className="count">{round2(inCart.qty)}</i>}
            </button>
          );
        })}
      </div>

      <div className="card form">
        {lines.length === 0 && <p className="empty small">{t.tapToAdd}</p>}
        {lines.map((l, n) => {
          const p = byId(l.productId) || l;
          return (
            <div key={l.productId} className="cartline">
              <div className="grow">
                <div className="name">{l.name}</div>
                <div className="muted" dir="ltr">{t.rs} {money(l.qty * (Number(l.rate) || 0))}</div>
              </div>
              <div className="stepper small">
                <button aria-label="-" onClick={() => change(n, { qty: round2(Math.max(0, l.qty - stepOf(p))) })}><Icon name="minus" /></button>
                <span className="num">{round2(l.qty)} <small>{l.unit}</small></span>
                <button aria-label="+" onClick={() => change(n, { qty: round2(l.qty + stepOf(p)) })}><Icon name="plus" /></button>
              </div>
              <input className="rate" value={l.rate} onChange={(e) => change(n, { rate: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" dir="ltr" aria-label={t.rateShort} />
            </div>
          );
        })}
        <div className="stat span-full"><small>{t.total}</small><b>{t.rs} {money(total)}</b></div>

        <div className="segments">
          <button className={!customerId ? 'on' : ''} onClick={() => setCustomerId('')}><Icon name="store" /> {t.walkIn}</button>
          <button className={customerId ? 'on' : ''} onClick={() => setCustomerId(customerId || customers[0]?.id || '')} disabled={!customers.length}>
            <Icon name="book" /> {t.onAccount}
          </button>
        </div>
        {customerId && (
          <>
            <label><span><Icon name="user" /> {t.chooseBuyer}</span>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label><Icon name="money-bill-wave" /> {t.paidNow}</label>
            <AmountInput value={paid} onChange={setPaid} />
            <div className="chips">
              <button className="btn" onClick={() => setPaid('0')}>0</button>
              <button className="btn" onClick={() => setPaid(String(Math.round(total)))}>{t.full} {money(total)}</button>
            </div>
            {total - paidNow > 0.5 && <p className="muted">{t.rs} {money(total - paidNow)} {t.unpaidPart}</p>}
          </>
        )}
        {sale && (
          <label><span><Icon name="calendar-days" /> {t.date}</span>
            <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        )}
        <label><span><Icon name="note-sticky" /> {t.note}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="two">
          <button className="btn primary solid" onClick={save} disabled={!lines.length}><Icon name="thumbs-up" /> {t.save}</button>
          <button className="btn" onClick={onDone}>{t.cancel}</button>
        </div>
      </div>
    </>
  );
}
