import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import { Balance } from './Customers';
import CustomerForm from './CustomerForm';
import PayBox from './PayBox';
import Icon from '../Icon';
import { useBackClose } from '../back';
import CustomerBill, { shiftMonth } from './CustomerBill';
import ActiveSwitch from './ActiveSwitch';
import { useProducts } from '../products';

export default function CustomerDetail({ id, onBack }) {
  const store = useStore();
  const { data, billed, paid, salesOwed, balance, deleteCustomer } = store;
  const { main } = useProducts();
  const t = useT();
  const c = store.customerById(id);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [mode, setMode] = useState(null); // 'edit' | 'pay'
  const [billOpen, setBillOpen] = useState(false);
  useBackClose(onBack);

  if (!c) return null;

  const from = month + '-01';
  const to = month + '-31';
  const delivered = billed(id, from, to);
  const m = { liters: delivered.liters, amount: delivered.amount + salesOwed(id, from, to) };
  const mPaid = paid(id, from, to);
  const bal = balance(id);
  const days = Object.keys(data.deliveries)
    .filter((d) => d >= from && d <= to && data.deliveries[d][id])
    .sort();
  const monthName = new Date(from + 'T00:00:00').toLocaleDateString(data.lang === 'ur' ? 'ur-PK' : 'en-PK', {
    month: 'long',
    year: 'numeric',
  });

  if (mode === 'edit') return <CustomerForm customer={c} onDone={() => setMode(null)} />;

  if (billOpen) return <CustomerBill id={id} initialMonth={month} onClose={() => setBillOpen(false)} />;

  return (
    <>
      <header className="datebar">
        <button className="arrow" onClick={onBack}><Icon name="arrow-left" flip /></button>
        <div className="big">{c.name}</div>
        <button className="arrow" onClick={() => setMode('edit')}><Icon name="pen" /></button>
      </header>

      <div className="card center">
        <Balance amount={bal} />
        {c.address && <div className="muted"><Icon name="house" /> {c.address}</div>}
        {c.phone && <a className="linkbtn primary" href={`tel:${c.phone}`} dir="ltr"><Icon name="phone" /> {c.phone}</a>}
        <ActiveSwitch customer={c} />
      </div>

      <header className="datebar">
        <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron-left" flip /></button>
        <div className="big">{monthName}</div>
        <button className="arrow" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron-right" flip /></button>
      </header>

      <div className="stats">
        <div className="stat primary"><small><Icon name="bottle-droplet" /> {main.unit}</small><b>{m.liters}</b></div>
        <div className="stat"><small><Icon name="file-invoice" /> {t.bill}</small><b>{money(m.amount)}</b></div>
        <div className="stat green"><small><Icon name="money-bill-wave" /></small><b>{money(mPaid)}</b></div>
      </div>

      {days.length > 0 && (
        <div className="card">
          <div className="days">
            {days.map((d) => {
              const q = data.deliveries[d][id].qty;
              return (
                <div key={d} className={`day ${q > 0 ? 'done' : 'skipped'}`}>
                  <small>{Number(d.slice(8))}</small>
                  <b>{q > 0 ? q : <Icon name="xmark" />}</b>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'pay' ? (
        <PayBox customerId={id} onDone={() => setMode(null)} />
      ) : (
        <button className="btn green solid wide" onClick={() => setMode('pay')}><Icon name="money-bill-wave" /> {t.receive}</button>
      )}
      <button className="btn primary wide" onClick={() => setBillOpen(true)}><Icon name="image" /> {t.shareBill}</button>
      <button
        className="linkbtn red deletelink"
        onClick={() => {
          if (!confirm(t.deleteCustomerConfirm(c.name))) return;
          deleteCustomer(id);
          onBack();
        }}
      >
        <Icon name="trash" /> {t.deleteCustomer}
      </button>
    </>
  );
}
