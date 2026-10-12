import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import AmountInput from './AmountInput';
import Icon from '../Icon';

export const CATEGORIES = [
  ['feed', 'wheat-awn'],
  ['fuel', 'gas-pump'],
  ['animal', 'cow'],
  ['salary', 'user-tie'],
  ['other', 'box'],
];

// New expense, or edit an existing `expense`.
export default function ExpenseBox({ expense, onDone }) {
  const { data, addExpense, updateExpense } = useStore();
  const t = useT();
  const [category, setCategory] = useState(expense?.category || 'feed');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [note, setNote] = useState(expense?.note || '');
  const [date, setDate] = useState(expense?.date || today());

  // Recent amounts for this category first (most likely to repeat), then round figures.
  const recent = data.expenses.filter((e) => e.category === category).map((e) => e.amount);
  const suggestions = [...new Set([...recent.slice(0, 3), 500, 1000, 2000, 5000])].slice(0, 6);

  const save = () => {
    const n = Number(amount);
    const row = { category, amount: n, note: note.trim() };
    if (n > 0 && expense) updateExpense(expense.id, { ...row, date });
    else if (n > 0) addExpense(row);
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
      <div className="chips">
        {suggestions.map((n) => (
          <button key={n} className={`btn ${Number(amount) === n ? 'red' : ''}`} onClick={() => setAmount(String(n))}>{money(n)}</button>
        ))}
      </div>
      <label><span><Icon name="note-sticky" /> {t.note}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {expense && (
        <label><span><Icon name="calendar-days" /> {t.date}</span>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      )}
      <div className="two">
        <button className="btn red solid" onClick={save}><Icon name="thumbs-up" /> {t.save}</button>
        <button className="btn" onClick={onDone}>{t.cancel}</button>
      </div>
    </div>
  );
}
