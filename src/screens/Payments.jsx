import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import PayBox from './PayBox';
import { SupplierPayBox } from './SupplierLedger';
import { usePeriod, PeriodBar } from './Period';

// Money received from customers and money paid to suppliers, for the chosen day / month / all time.
export default function Payments() {
  const { data, customerById, supplierById, deletePayment, deleteSupplierPayment } = useStore();
  const t = useT();
  const [editing, setEditing] = useState(null);
  const [side, setSide] = useState('in'); // 'in' = from customers, 'out' = to suppliers
  const period = usePeriod();
  const received = data.payments.filter((p) => period.match(p.date));
  const paid = data.supplierPayments.filter((p) => period.match(p.date));
  const sum = (rows) => rows.reduce((s, p) => s + p.amount, 0);
  const hasSupply = data.suppliers.length > 0 || data.supplierPayments.length > 0;
  const showOut = hasSupply && side === 'out';
  const list = showOut ? paid : received;

  return (
    <>
      <h1><Icon name="money-bill-wave" /> {t.payments}</h1>

      <PeriodBar period={period} />

      {hasSupply ? (
        <div className="two paysides">
          <button className={`stat green ${side === 'in' ? 'on' : ''}`} onClick={() => setSide('in')}>
            <small><Icon name="arrow-down" /> {t.received}</small>
            <b>{money(sum(received))}</b>
          </button>
          <button className={`stat red ${side === 'out' ? 'on' : ''}`} onClick={() => setSide('out')}>
            <small><Icon name="truck" /> {t.paidOut}</small>
            <b>{money(sum(paid))}</b>
          </button>
        </div>
      ) : (
        <div className="stat green span-full">
          <small><Icon name="money-bill-wave" /> {t.paymentsCount(received.length)}</small>
          <b>{t.rs} {money(sum(received))}</b>
        </div>
      )}

      {hasSupply && (
        <p className="muted pad">{showOut ? t.supplierPaymentsCount(paid.length) : t.paymentsCount(received.length)}</p>
      )}
      {list.length === 0 && <p className="empty">{showOut ? t.noSupplierPayments : t.noPayments}</p>}

      {list.map((p) => {
        const name = showOut ? supplierById(p.supplierId)?.name : customerById(p.customerId)?.name;
        if (editing === p.id)
          return (
            <div key={p.id}>
              <div className="name pad">{name}</div>
              {showOut ? (
                <SupplierPayBox supplierId={p.supplierId} payment={p} onDone={() => setEditing(null)} />
              ) : (
                <PayBox payment={p} onDone={() => setEditing(null)} />
              )}
            </div>
          );
        return (
          <div key={p.id} className="card row small">
            <button className="grow link plain" onClick={() => setEditing(p.id)}>
              {showOut && <span className="catico"><Icon name="truck" /></span>}
              <div className="grow">
                <div>{name}{p.note && <span className="muted"> · {p.note}</span>}</div>
                <div className="muted">{t.fmtDate(p.date)}</div>
              </div>
              <b className={showOut ? 'redtext' : 'greentext'}>{t.rs} {money(p.amount)}</b>
              <Icon name="pen" className="muted" />
            </button>
            <button
              className="x"
              onClick={() =>
                showOut
                  ? confirm(t.deleteEntryConfirm) && deleteSupplierPayment(p.id)
                  : confirm(t.deleteConfirm) && deletePayment(p.id)
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
