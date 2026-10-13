import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import PayBox from './PayBox';
import ExpenseBox, { CATEGORIES } from './ExpenseBox';
import { SupplierPayBox } from './SupplierLedger';
import { usePeriod, PeriodBar } from './Period';
import { drawExpenses } from '../bill';
import ImagePreview from './ImagePreview';
import { SaleBox, saleSummary } from './Shop';

const catIcon = Object.fromEntries(CATEGORIES);
// Newest first. Ids start with their creation time, so on the same day a longer / greater id is newer.
const newer = (a, b) => b.date.localeCompare(a.date) || b.id.length - a.id.length || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

// All money for the chosen day / month / all time:
//   Received: payments from customers
//   Spent:    expenses and payments to suppliers
export default function Payments({ onOpenSuppliers }) {
  const { data, customerById, supplierById, supplierBalance, deletePayment, deleteExpense, deleteSupplierPayment } = useStore();
  const t = useT();
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [side, setSide] = useState('in'); // 'in' | 'out'
  const period = usePeriod();

  const sum = (rows) => rows.reduce((s, x) => s + x.amount, 0);
  // Received = customer payments + money taken at the shop counter.
  const received = [
    ...data.payments.filter((p) => period.match(p.date)).map((row) => ({ kind: 'payment', ...row })),
    ...data.sales.filter((s) => period.match(s.date) && s.paid > 0).map((row) => ({ kind: 'sale', ...row, amount: row.paid })),
  ].sort(newer);
  const spent = [
    ...data.expenses.filter((e) => period.match(e.date)).map((row) => ({ kind: 'expense', ...row })),
    ...data.supplierPayments.filter((p) => period.match(p.date)).map((row) => ({ kind: 'supplier', ...row })),
  ].sort(newer);
  // Cash in hand = every payment and shop takings, minus every expense and supplier payment, since the start.
  const cash = sum(data.payments) + data.sales.reduce((s, x) => s + x.paid, 0) - sum(data.expenses) - sum(data.supplierPayments);
  // Still to pay suppliers, all time (an advance to one supplier doesn't cancel another's due).
  const owedSuppliers = data.suppliers.reduce((s, sp) => s + Math.max(0, supplierBalance(sp.id)), 0);
  const out = side === 'out';

  const label = (x) =>
    x.kind === 'supplier' ? supplierById(x.supplierId)?.name || t.suppliers : t.cat[x.category] || t.cat.other;

  const shareSpent = async () => {
    const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
    const rows = [...spent].reverse().map((x) => ({
      label: new Date(x.date + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      category: x.kind === 'supplier' ? t.suppliers : t.cat[x.category] || t.cat.other,
      note: x.kind === 'supplier' ? [label(x), x.note].filter(Boolean).join(' · ') : x.note,
      amount: x.amount,
    }));
    setPreview(await drawExpenses({ t, lang: data.lang, font: data.urduFont, seller: data.auth, monthName: period.label, rows, total: sum(spent) }));
  };

  if (preview)
    return (
      <ImagePreview canvas={preview} fileName={`spent-${period.key}.png`} title={`${t.spent} · ${period.label}`} onClose={() => setPreview(null)} />
    );

  const pick = (s) => {
    setSide(s);
    setEditing(null);
  };

  return (
    <>
      <h1><Icon name="money-bill-wave" /> {t.payments}</h1>

      <div className={`stat span-full ${cash >= 0 ? 'green' : 'red'}`}>
        <small><Icon name="wallet" /> {t.cashInHand}</small>
        <b>{money(cash)}</b>
      </div>

      <PeriodBar period={period} />

      <div className="two paysides">
        <button className={`stat green ${!out ? 'on' : ''}`} onClick={() => pick('in')}>
          <small><Icon name="arrow-down" /> {t.received}</small>
          <b>{money(sum(received))}</b>
        </button>
        <button className={`stat red ${out ? 'on' : ''}`} onClick={() => pick('out')}>
          <small><Icon name="arrow-up" /> {t.spent}</small>
          <b>{money(sum(spent))}</b>
        </button>
      </div>

      {out && (
        <>
          {data.suppliers.length > 0 && (
            <button className={`stat span-full owedcard ${owedSuppliers > 0.5 ? 'red' : 'green'}`} onClick={onOpenSuppliers}>
              <small><Icon name="truck" /> {t.owedSuppliers}</small>
              <b>{t.rs} {money(owedSuppliers)}</b>
              <span className="owedlink">{t.supplierLedger} <Icon name="chevron-right" flip /></span>
            </button>
          )}
        </>
      )}

      <div className="listhead">
        <p className="muted">{out ? t.spentCount(spent.length) : t.paymentsCount(received.length)}</p>
        {out && spent.length > 0 && (
          <button className="btn primary compact" onClick={shareSpent}><Icon name="share-nodes" /> {t.share}</button>
        )}
      </div>

      {!out && received.length === 0 && <p className="empty">{t.noPayments}</p>}
      {out && spent.length === 0 && <p className="empty">{t.noSpent}</p>}

      {!out &&
        received.map((p) =>
          p.kind === 'sale' ? (
            editing === p.id ? (
              <SaleBox key={p.id} sale={data.sales.find((s) => s.id === p.id)} onDone={() => setEditing(null)} />
            ) : (
              <div key={p.id} className="card row small">
                <button className="grow link plain" onClick={() => setEditing(p.id)}>
                  <span className="catico prod"><Icon name="store" /></span>
                  <div className="grow">
                    <div>{p.customerId ? customerById(p.customerId)?.name || '?' : t.walkIn}<span className="muted"> · {saleSummary(p)}</span></div>
                    <div className="muted">{t.fmtDate(p.date)}</div>
                  </div>
                  <b className="greentext">{t.rs} {money(p.amount)}</b>
                  <Icon name="pen" className="muted" />
                </button>
              </div>
            )
          ) : editing === p.id ? (
            <div key={p.id}>
              <div className="name pad">{customerById(p.customerId)?.name}</div>
              <PayBox payment={p} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <div key={p.id} className="card row small">
              <button className="grow link plain" onClick={() => setEditing(p.id)}>
                <div className="grow">
                  <div>{customerById(p.customerId)?.name}</div>
                  <div className="muted">{t.fmtDate(p.date)}</div>
                </div>
                <b className="greentext">{t.rs} {money(p.amount)}</b>
                <Icon name="pen" className="muted" />
              </button>
              <button className="x" onClick={() => confirm(t.deleteConfirm) && deletePayment(p.id)}><Icon name="xmark" /></button>
            </div>
          ),
        )}

      {out &&
        spent.map((x) => {
          const isSupplier = x.kind === 'supplier';
          if (editing === x.id)
            return isSupplier ? (
              <div key={x.id}>
                <div className="name pad">{label(x)}</div>
                <SupplierPayBox supplierId={x.supplierId} payment={x} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <ExpenseBox key={x.id} expense={x} onDone={() => setEditing(null)} />
            );
          return (
            <div key={x.id} className="card row small">
              <button className="grow link plain" onClick={() => setEditing(x.id)}>
                <span className="catico"><Icon name={isSupplier ? 'truck' : catIcon[x.category] || 'box'} /></span>
                <div className="grow">
                  <div>
                    {label(x)}
                    {isSupplier && <span className="muted"> · {t.supplierPaymentTag}</span>}
                    {x.note && <span className="muted"> · {x.note}</span>}
                  </div>
                  <div className="muted">{t.fmtDate(x.date)}</div>
                </div>
                <b className="redtext">{t.rs} {money(x.amount)}</b>
                <Icon name="pen" className="muted" />
              </button>
              <button
                className="x"
                onClick={() =>
                  isSupplier
                    ? confirm(t.deleteEntryConfirm) && deleteSupplierPayment(x.id)
                    : confirm(t.deleteExpenseConfirm) && deleteExpense(x.id)
                }
              >
                <Icon name="xmark" />
              </button>
            </div>
          );
        })}
    </>
  );
}
