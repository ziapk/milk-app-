import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import AmountInput from './AmountInput';
import Icon from '../Icon';

// New payment for `customerId`, or edit an existing `payment`.
export default function PayBox({ customerId, payment, onDone }) {
  const { balance, addPayment, updatePayment } = useStore();
  const t = useT();
  const due = Math.max(0, Math.round(balance(customerId ?? payment.customerId)));
  const [amount, setAmount] = useState(payment ? String(payment.amount) : due ? String(due) : '');
  const [date, setDate] = useState(payment ? payment.date : today());

  const save = () => {
    const n = Number(amount);
    if (n > 0 && payment) updatePayment(payment.id, { amount: n, date });
    else if (n > 0) addPayment(customerId, n);
    onDone();
  };

  return (
    <div className="card form">
      <label><Icon name="money-bill-wave" /> {t.amount}</label>
      <AmountInput value={amount} onChange={setAmount} autoFocus={!payment} />
      {payment ? (
        <label><span><Icon name="calendar-days" /> {t.date}</span>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      ) : (
        <div className="chips">
          {due > 0 && <button className="btn" onClick={() => setAmount(String(due))}>{t.full} {money(due)}</button>}
          {[500, 1000, 2000, 5000].map((n) => (
            <button key={n} className="btn" onClick={() => setAmount(String(n))}>{money(n)}</button>
          ))}
        </div>
      )}
      <div className="two">
        <button className="btn green solid" onClick={save}><Icon name="thumbs-up" /> {t.save}</button>
        <button className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </div>
  );
}
