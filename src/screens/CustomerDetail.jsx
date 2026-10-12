import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import { Balance } from './Customers';
import CustomerForm from './CustomerForm';
import PayBox from './PayBox';
import Icon from '../Icon';
import { drawBill, shareBill } from '../bill';

const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// 03001234567 -> 923001234567 for wa.me links (Pakistan numbers)
const waNumber = (p = '') => {
  const d = p.replace(/\D/g, '');
  return d.startsWith('0') ? '92' + d.slice(1) : d;
};

export default function CustomerDetail({ id, onBack }) {
  const store = useStore();
  const { data, billed, paid, balance } = store;
  const t = useT();
  const c = store.customerById(id);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [mode, setMode] = useState(null); // 'edit' | 'pay'
  const [sharing, setSharing] = useState(false);

  if (!c) return null;

  const from = month + '-01';
  const to = month + '-31';
  const m = billed(id, from, to);
  const mPaid = paid(id, from, to);
  const bal = balance(id);
  const days = Object.keys(data.deliveries)
    .filter((d) => d >= from && d <= to && data.deliveries[d][id])
    .sort();
  const monthName = new Date(from + 'T00:00:00').toLocaleDateString(data.lang === 'ur' ? 'ur-PK' : 'en-PK', {
    month: 'long',
    year: 'numeric',
  });

  const sendBill = () => {
    const text = t.billText(c.name, monthName, m.liters, money(m.amount), money(Math.max(0, bal)));
    window.open(`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(text)}`);
  };

  const shareImage = async () => {
    setSharing(true);
    try {
      const rows = days.map((d) => ({
        label: new Date(d + 'T00:00:00').toLocaleDateString(data.lang === 'ur' ? 'ur-PK' : 'en-PK', { day: 'numeric', month: 'short' }),
        ...data.deliveries[d][id],
      }));
      const canvas = await drawBill({
        t,
        lang: data.lang,
        seller: data.auth,
        customer: c,
        monthName,
        rows,
        totals: { liters: m.liters, amount: m.amount, paid: mPaid, due: bal },
      });
      await shareBill(canvas, `bill-${month}-${c.id}.png`, `${c.name} · ${monthName}`);
    } catch {
      // Closing the share sheet without picking an app also lands here.
    } finally {
      setSharing(false);
    }
  };

  if (mode === 'edit') return <CustomerForm customer={c} onDone={() => setMode(null)} />;

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
      </div>

      {mode === 'pay' ? (
        <PayBox customerId={id} onDone={() => setMode(null)} />
      ) : (
        <div className="two">
          <button className="btn green solid" onClick={() => setMode('pay')}><Icon name="hand-holding-dollar" /> {t.receive}</button>
          {c.phone && <a className="btn blue" href={`tel:${c.phone}`}><Icon name="phone" /> {t.call}</a>}
        </div>
      )}

      <header className="datebar">
        <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron-left" flip /></button>
        <div className="big">{monthName}</div>
        <button className="arrow" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron-right" flip /></button>
      </header>

      <div className="stats">
        <div className="stat blue"><small><Icon name="bottle-droplet" /> {t.liters}</small><b>{m.liters}</b></div>
        <div className="stat"><small><Icon name="file-invoice" /> {t.bill}</small><b>{money(m.amount)}</b></div>
        <div className="stat green"><small><Icon name="hand-holding-dollar" /></small><b>{money(mPaid)}</b></div>
      </div>

      <div className="two">
        <button className="btn blue" onClick={shareImage} disabled={sharing || days.length === 0}>
          <Icon name={sharing ? 'spinner' : 'image'} spin={sharing} /> {t.shareBill}
        </button>
        {c.phone && <button className="btn wa" onClick={sendBill}><Icon name="whatsapp" brand /> {t.sendText}</button>}
      </div>

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
    </>
  );
}
