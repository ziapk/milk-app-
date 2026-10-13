import { useState } from 'react';
import { useStore, today, MAIN } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';
import { shiftMonth } from './CustomerBill';
import { SupplierBalance } from './Suppliers';
import SupplierForm from './SupplierForm';
import AmountInput from './AmountInput';
import { useProducts } from '../products';
import { stepOf } from './Shop';

// One supplier's ledger for a month: opening balance, every purchase and payment with a running
// balance, and the balance at the end. Positive balance = still owed to the supplier.
export default function SupplierLedger({ id, onBack }) {
  const store = useStore();
  const { data, bought, paidSupplier, supplierBalance, deletePurchase, deleteSupplierPayment, deleteSupplier } = store;
  const t = useT();
  const { main, byId } = useProducts();
  const sp = store.supplierById(id);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [mode, setMode] = useState(null); // 'edit' | 'buy' | 'pay'
  const [editing, setEditing] = useState(null); // { kind: 'b' | 'p', row }
  useBackClose(onBack);

  if (!sp) return null;
  if (mode === 'edit') return <SupplierForm supplier={sp} onDone={() => setMode(null)} />;

  const from = month + '-01';
  const to = month + '-31';
  const before = shiftMonth(month, -1) + '-31';
  const opening = bought(id, '', before).amount - paidSupplier(id, '', before);
  const m = bought(id, from, to);
  const mPaid = paidSupplier(id, from, to);

  // Oldest first; purchases before payments on the same day, then in the order they were made
  // (ids start with their creation time), so every phone shows the same order.
  const inMonth = (list) => list.filter((r) => r.supplierId === id && r.date >= from && r.date <= to);
  const entries = [
    ...inMonth(data.purchases).map((row) => ({ kind: 'b', row, amount: row.qty * row.rate })),
    ...inMonth(data.supplierPayments).map((row) => ({ kind: 'p', row, amount: -row.amount })),
  ].sort((a, b) => a.row.date.localeCompare(b.row.date) || (a.kind === b.kind ? byCreation(a.row.id, b.row.id) : a.kind === 'b' ? -1 : 1));
  let running = opening;
  for (const e of entries) e.balance = running += e.amount;

  const purchaseText = (b) => {
    const p = byId(b.productId || MAIN) || main;
    return t.purchaseLine(num(b.qty), p.unit, p.name, money(b.rate));
  };

  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
  const monthName = new Date(from + 'T00:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <>
      <header className="datebar">
        <button className="arrow" onClick={onBack}><Icon name="arrow-left" flip /></button>
        <div className="big">{sp.name}</div>
        <button className="arrow" onClick={() => setMode('edit')}><Icon name="pen" /></button>
      </header>

      <div className="card center">
        <SupplierBalance amount={supplierBalance(id)} />
        {sp.address && <div className="muted"><Icon name="house" /> {sp.address}</div>}
        {sp.phone && <a className="linkbtn primary" href={`tel:${sp.phone}`} dir="ltr"><Icon name="phone" /> {sp.phone}</a>}
        <div className="muted">{t.rs} {sp.rate} / {main.unit}{!sp.active && ` · ${t.inactive}`}</div>
      </div>

      {mode === 'buy' ? (
        <PurchaseBox supplier={sp} onDone={() => setMode(null)} />
      ) : mode === 'pay' ? (
        <SupplierPayBox supplierId={id} onDone={() => setMode(null)} />
      ) : (
        <div className="two">
          <button className="btn primary solid" onClick={() => setMode('buy')}><Icon name="bottle-droplet" /> {t.buyMilk}</button>
          <button className="btn green solid" onClick={() => setMode('pay')}><Icon name="money-bill-wave" /> {t.paySupplier}</button>
        </div>
      )}

      <header className="datebar">
        <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron-left" flip /></button>
        <div className="big">{monthName}</div>
        <button className="arrow" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron-right" flip /></button>
      </header>

      <div className="stats">
        <div className="stat primary"><small><Icon name="bottle-droplet" /> {main.unit}</small><b>{num(m.liters)}</b></div>
        <div className="stat"><small><Icon name="file-invoice" /> {t.milkBought}</small><b>{money(m.amount)}</b></div>
        <div className="stat green"><small><Icon name="money-bill-wave" /> {t.paidShortSupplier}</small><b>{money(mPaid)}</b></div>
      </div>

      <div className="card ledger">
        <div className="lrow muted">
          <span className="grow">{t.openingBalance}</span>
          <b className="lbal" dir="ltr">{money(opening)}</b>
        </div>
        {entries.length === 0 && <p className="empty small">{t.ledgerEmpty}</p>}
        {entries.map((e) =>
          editing?.row.id === e.row.id ? (
            e.kind === 'b' ? (
              <PurchaseBox key={e.row.id} supplier={sp} purchase={e.row} onDone={() => setEditing(null)} />
            ) : (
              <SupplierPayBox key={e.row.id} supplierId={id} payment={e.row} onDone={() => setEditing(null)} />
            )
          ) : (
            <div key={e.row.id} className="lrow">
              <button className="grow link plain" onClick={() => setEditing(e)}>
                <span className={`lico ${e.kind === 'b' ? 'buy' : 'pay'}`}>
                  <Icon name={e.kind === 'b' ? 'bottle-droplet' : 'money-bill-wave'} />
                </span>
                <div className="grow">
                  <div>{e.kind === 'b' ? purchaseText(e.row) : t.paymentEntry}{e.row.note && ` · ${e.row.note}`}</div>
                  <div className="muted">{t.fmtDate(e.row.date)}</div>
                </div>
                <div className="lamt">
                  <b className={e.kind === 'b' ? 'redtext' : 'greentext'} dir="ltr">{e.kind === 'b' ? '+' : '−'}{money(Math.abs(e.amount))}</b>
                  <small className="muted" dir="ltr">{money(e.balance)}</small>
                </div>
              </button>
              <button
                className="x"
                aria-label={t.deleteEntryConfirm}
                onClick={() => confirm(t.deleteEntryConfirm) && (e.kind === 'b' ? deletePurchase(e.row.id) : deleteSupplierPayment(e.row.id))}
              >
                <Icon name="xmark" />
              </button>
            </div>
          ),
        )}
        <div className="lrow total">
          <span className="grow">{t.closingBalance}</span>
          <b className="lbal" dir="ltr">{money(running)}</b>
        </div>
      </div>

      <button
        className="linkbtn red deletelink"
        onClick={() => {
          if (!confirm(t.deleteSupplierConfirm(sp.name))) return;
          deleteSupplier(id);
          onBack();
        }}
      >
        <Icon name="trash" /> {t.deleteSupplier}
      </button>
    </>
  );
}

const num = (n) => Math.round(n * 100) / 100;

// Ids are base-36 creation time + random suffix: a shorter id is older, same length compares as text.
const byCreation = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

// Stock bought from `supplier`: several products in one go (one ledger line each), or edit one
// existing `purchase`. Each rate starts at what was last paid this supplier for that product.
export function PurchaseBox({ supplier, purchase, onDone }) {
  const { data, addPurchase, updatePurchase } = useStore();
  const t = useT();
  const { forSale, byId } = useProducts();
  useBackClose(onDone);
  const lastRate = (pid) => {
    const prev = data.purchases.find((b) => b.supplierId === supplier.id && (b.productId || MAIN) === pid);
    return prev ? prev.rate : pid === MAIN ? supplier.rate : byId(pid)?.price || '';
  };
  const lineFor = (pid, qty = '') => ({ productId: pid, qty, rate: String(lastRate(pid)) });
  // A new purchase opens with the main product ready to type, so a plain milk purchase stays quick.
  const [lines, setLines] = useState(() =>
    purchase
      ? [{ productId: purchase.productId || MAIN, qty: String(purchase.qty), rate: String(purchase.rate) }]
      : [lineFor(MAIN)],
  );
  const [note, setNote] = useState(purchase?.note || '');
  const [date, setDate] = useState(purchase?.date || today());
  const decimal = (v) => v.replace(/[^\d.]/g, '');
  const change = (n, patch) => setLines((ls) => ls.map((l, k) => (k === n ? { ...l, ...patch } : l)));
  const remove = (n) => setLines((ls) => ls.filter((_, k) => k !== n));
  const add = (pid) =>
    setLines((ls) =>
      ls.some((l) => l.productId === pid)
        ? ls.map((l) => (l.productId === pid ? { ...l, qty: String(num((Number(l.qty) || 0) + stepOf(byId(pid)))) } : l))
        : [...ls, lineFor(pid, '1')],
    );
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const filled = lines.filter((l) => Number(l.qty) > 0);

  const save = () => {
    const rows = filled.map((l) => ({
      productId: l.productId === MAIN ? undefined : l.productId,
      qty: Number(l.qty),
      rate: Number(l.rate) || 0,
      note: note.trim(),
      date,
    }));
    if (purchase && rows[0]) updatePurchase(purchase.id, rows[0]);
    else for (const row of rows) addPurchase(supplier.id, row);
    onDone();
  };

  return (
    <div className="card form">
      {!purchase && forSale.length > 1 && (
        <>
          <label><Icon name="boxes-stacked" /> {t.whatBought}</label>
          <div className="prodgrid">
            {forSale.map((p) => {
              const line = lines.find((l) => l.productId === p.id);
              return (
                <button key={p.id} className={`prodtile ${line ? 'on' : ''}`} onClick={() => add(p.id)}>
                  <b>{p.name}</b>
                  <small>{p.unit}</small>
                  {line && Number(line.qty) > 0 && <i className="count">{num(Number(line.qty))}</i>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {lines.length === 0 && <p className="empty small">{t.tapToAdd}</p>}
      {lines.map((l, n) => {
        const p = byId(l.productId) || { name: '?', unit: '' };
        const q = Number(l.qty) || 0;
        return (
          <div key={l.productId} className="buyline">
            <div className="buyhead">
              <b className="grow">{p.name} <small className="muted">({p.unit})</small></b>
              <span className="muted" dir="ltr">{t.rs} {money(q * (Number(l.rate) || 0))}</span>
              {!purchase && lines.length > 1 && (
                <button type="button" className="x" aria-label={t.close} onClick={() => remove(n)}><Icon name="xmark" /></button>
              )}
            </div>
            <div className="buyrow" dir="ltr">
              <button type="button" className="round" aria-label="-" onClick={() => change(n, { qty: String(Math.max(0, num(q - stepOf(p)))) })}><Icon name="minus" /></button>
              <input className="qtyin" value={l.qty} onChange={(e) => change(n, { qty: decimal(e.target.value) })} inputMode="decimal"
                autoFocus={!purchase && n === 0} aria-label={`${p.name} (${p.unit})`} placeholder="0" />
              <button type="button" className="round" aria-label="+" onClick={() => change(n, { qty: String(num(q + stepOf(p))) })}><Icon name="plus" /></button>
              <span className="at">×</span>
              <input className="ratein" value={l.rate} onChange={(e) => change(n, { rate: decimal(e.target.value) })} inputMode="decimal" aria-label={t.rateShort} />
            </div>
          </div>
        );
      })}

      <div className="stat span-full"><small>{t.total}</small><b>{t.rs} {money(total)}</b></div>
      <label><span><Icon name="calendar-days" /> {t.date}</span>
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <label><span><Icon name="note-sticky" /> {t.note}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="two">
        <button className="btn primary solid" onClick={save} disabled={!filled.length}><Icon name="thumbs-up" /> {t.save}</button>
        <button className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </div>
  );
}

// Money paid to the supplier (new), or edit an existing `payment`.
export function SupplierPayBox({ supplierId, payment, onDone }) {
  const { supplierBalance, addSupplierPayment, updateSupplierPayment } = useStore();
  const t = useT();
  useBackClose(onDone);
  const due = Math.max(0, Math.round(supplierBalance(supplierId)));
  const [amount, setAmount] = useState(payment ? String(payment.amount) : due ? String(due) : '');
  const [date, setDate] = useState(payment?.date || today());
  const [note, setNote] = useState(payment?.note || '');

  const save = () => {
    const n = Number(amount);
    const row = { amount: n, date, note: note.trim() };
    if (n > 0 && payment) updateSupplierPayment(payment.id, row);
    else if (n > 0) addSupplierPayment(supplierId, row);
    onDone();
  };

  return (
    <div className="card form">
      <label><Icon name="money-bill-wave" /> {t.amount}</label>
      <AmountInput value={amount} onChange={setAmount} autoFocus={!payment} />
      {!payment && (
        <div className="chips">
          {due > 0 && <button className="btn" onClick={() => setAmount(String(due))}>{t.full} {money(due)}</button>}
          {[1000, 5000, 10000].map((n) => (
            <button key={n} className="btn" onClick={() => setAmount(String(n))}>{money(n)}</button>
          ))}
        </div>
      )}
      <label><span><Icon name="calendar-days" /> {t.date}</span>
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      <label><span><Icon name="note-sticky" /> {t.note}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="two">
        <button className="btn green solid" onClick={save}><Icon name="thumbs-up" /> {t.save}</button>
        <button className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </div>
  );
}
