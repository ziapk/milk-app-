import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import AmountInput from './AmountInput';
import Icon from '../Icon';

export const CATEGORIES = [
  ['feed', 'wheat-awn'],
  ['fuel', 'gas-pump'],
  ['animal', 'cow'],
  ['salary', 'user-tie'],
  ['other', 'box'],
];

export default function ExpenseBox({ onDone }) {
  const { addExpense } = useStore();
  const t = useT();
  const [category, setCategory] = useState('feed');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const save = () => {
    const n = Number(amount);
    if (n > 0) addExpense({ category, amount: n, note: note.trim() });
    onDone();
  };

  return (
    <div className="card form">
      <div className="cats">
        {CATEGORIES.map(([k, icon]) => (
          <button key={k} className={`cat ${category === k ? 'on' : ''}`} onClick={() => setCategory(k)}>
            <Icon name={icon} />
            {t.cat[k]}
          </button>
        ))}
      </div>
      <label><Icon name="money-bill-wave" /> {t.amount}</label>
      <AmountInput value={amount} onChange={setAmount} />
      <label><span><Icon name="note-sticky" /> {t.note}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="two">
        <button className="btn red solid" onClick={save}><Icon name="thumbs-up" /> {t.save}</button>
        <button className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </div>
  );
}
