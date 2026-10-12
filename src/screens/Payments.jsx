import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import PayBox from './PayBox';
import { usePeriod, PeriodBar } from './Period';

export default function Payments() {
  const { data, customerById, deletePayment } = useStore();
  const t = useT();
  const [editing, setEditing] = useState(null);
  const period = usePeriod();
  const list = data.payments.filter((p) => period.match(p.date));
  const total = list.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <h1><Icon name="money-bill-wave" /> {t.payments}</h1>

      <PeriodBar period={period} />

      <div className="stat green span-full">
        <small><Icon name="money-bill-wave" /> {t.paymentsCount(list.length)}</small>
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
