import { useStore } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';

export default function Payments() {
  const { data, customerById, deletePayment } = useStore();
  const t = useT();
  return (
    <>
      <h1><Icon name="money-bill-wave" /> {t.payments}</h1>
      {data.payments.length === 0 && <p className="empty"><Icon name="money-bill-wave" className="fa-3x" /></p>}
      {data.payments.length > 0 && <h2>{t.recent}</h2>}
      {data.payments.slice(0, 30).map((p) => (
        <div key={p.id} className="card row small">
          <div className="grow">
            <div>{customerById(p.customerId)?.name}</div>
            <div className="muted" dir="ltr">{p.date}</div>
          </div>
          <b className="greentext">{t.rs} {money(p.amount)}</b>
          <button className="x" onClick={() => confirm(t.deleteConfirm) && deletePayment(p.id)}><Icon name="xmark" /></button>
        </div>
      ))}
    </>
  );
}
