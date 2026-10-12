import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import AmountInput from './AmountInput';
import Icon from '../Icon';

export default function PayBox({ customerId, onDone }) {
  const { balance, addPayment } = useStore();
  const t = useT();
  const due = Math.max(0, Math.round(balance(customerId)));
  const [amount, setAmount] = useState(due ? String(due) : '');

  const save = () => {
    const n = Number(amount);
    if (n > 0) addPayment(customerId, n);
    onDone();
  };

  return (
    <div className="card form">
      <label><Icon name="money-bill-wave" /> {t.amount}</label>
      <AmountInput value={amount} onChange={setAmount} autoFocus />
      <div className="chips">
        {due > 0 && <button className="btn" onClick={() => setAmount(String(due))}>{t.full} {money(due)}</button>}
        {[500, 1000, 2000, 5000].map((n) => (
          <button key={n} className="btn" onClick={() => setAmount(String(n))}>{money(n)}</button>
        ))}
      </div>
      <div className="two">
        <button className="btn green solid" onClick={save}><Icon name="thumbs-up" /> {t.save}</button>
        <button className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </div>
  );
}
