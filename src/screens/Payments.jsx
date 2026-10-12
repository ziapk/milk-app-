import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import PayBox from './PayBox';
import { shiftMonth } from './CustomerBill';

const FILTERS = ['today', 'month', 'all'];

export default function Payments() {
  const { data, customerById, deletePayment } = useStore();
  const t = useT();
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('today');
  const [month, setMonth] = useState(today().slice(0, 7));

  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
  const monthName = new Date(month + '-01T00:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const list = data.payments.filter((p) =>
    filter === 'today' ? p.date === today() : filter === 'month' ? p.date.startsWith(month) : true,
  );
  const total = list.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <h1><Icon name="money-bill-wave" /> {t.payments}</h1>

      <div className="segments">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {t.payFilter[f]}
          </button>
        ))}
      </div>

      {filter === 'month' && (
        <header className="datebar">
          <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron-left" flip /></button>
          <div className="big">{monthName}</div>
          <button className="arrow" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>
            <Icon name="chevron-right" flip />
          </button>
        </header>
      )}

      <div className="stat green span-full">
        <small><Icon name="money-bill-wave" /> {filter === 'month' ? monthName : t.collectedIn[filter]} · {t.paymentsCount(list.length)}</small>
        <b>{t.rs} {money(total)}</b>
      </div>

      {list.length === 0 && <p className="empty">{t.noPayments}</p>}
      {list.map((p) =>
        editing === p.id ? (
          <div key={p.id}>
            <div className="name pad">{customerById(p.customerId)?.name}</div>
            <PayBox payment={p} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <div key={p.id} className="card row small">
            <button className="grow link plain" onClick={() => setEditing(p.id)}>
              <div className="grow">
                <div>{customerById(p.customerId)?.name}</div>
                <div className="muted" dir="ltr">{p.date}</div>
              </div>
              <b className="greentext">{t.rs} {money(p.amount)}</b>
              <Icon name="pen" className="muted" />
            </button>
            <button className="x" onClick={() => confirm(t.deleteConfirm) && deletePayment(p.id)}><Icon name="xmark" /></button>
          </div>
        ),
      )}
    </>
  );
}
