import { useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import ExpenseBox, { CATEGORIES } from './ExpenseBox';
import Icon from '../Icon';
import { drawExpenses } from '../bill';
import ImagePreview from './ImagePreview';

const catIcon = Object.fromEntries(CATEGORIES);

export default function Expenses() {
  const { data, deleteExpense } = useStore();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);

  const month = today().slice(0, 7);
  const monthExpenses = data.expenses.filter((e) => e.date.startsWith(month));
  const sum = (list) => list.reduce((s, x) => s + x.amount, 0);
  const spentToday = sum(data.expenses.filter((e) => e.date === today()));
  const spentMonth = sum(monthExpenses);
  // Cash in hand = every payment collected minus every expense paid, since the start.
  const cash = sum(data.payments) - sum(data.expenses);
  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
  const monthName = new Date(month + '-01T00:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const showList = async () => {
    const rows = [...monthExpenses].reverse().map((e) => ({
      label: new Date(e.date + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      category: t.cat[e.category] || t.cat.other,
      note: e.note,
      amount: e.amount,
    }));
    setPreview(await drawExpenses({ t, lang: data.lang,
        font: data.urduFont, seller: data.auth, monthName, rows, total: spentMonth }));
  };

  if (preview)
    return (
      <ImagePreview canvas={preview} fileName={`expenses-${month}.png`} title={`${t.expenses} · ${monthName}`} onClose={() => setPreview(null)} />
    );

  return (
    <>
      <h1><Icon name="receipt" /> {t.expenses}</h1>
      <div className={`stat span-full ${cash >= 0 ? 'green' : 'red'}`}>
        <small><Icon name="wallet" /> {t.cashInHand}</small>
        <b>{money(cash)}</b>
      </div>
      <div className="stats">
        <div className="stat red"><small><Icon name="sun" /> {t.spentToday}</small><b>{money(spentToday)}</b></div>
        <div className="stat red"><small><Icon name="calendar-days" /> {t.spentMonth}</small><b>{money(spentMonth)}</b></div>
      </div>
      {adding ? (
        <ExpenseBox onDone={() => setAdding(false)} />
      ) : (
        <button className="btn red solid wide" onClick={() => setAdding(true)}><Icon name="plus" /> {t.addExpense}</button>
      )}

      {monthExpenses.length > 0 && (
        <div className="listhead">
          <h2>{t.expensesMonth}</h2>
          <button className="btn blue compact" onClick={showList}><Icon name="share-nodes" /> {t.share}</button>
        </div>
      )}
      {monthExpenses.map((e) =>
        editing === e.id ? (
          <ExpenseBox key={e.id} expense={e} onDone={() => setEditing(null)} />
        ) : (
          <div key={e.id} className="card row small">
            <button className="grow link plain" onClick={() => setEditing(e.id)}>
              <span className="catico"><Icon name={catIcon[e.category] || 'box'} /></span>
              <div className="grow">
                <div>{t.cat[e.category] || t.cat.other}{e.note && ` · ${e.note}`}</div>
                <div className="muted" dir="ltr">{e.date}</div>
              </div>
              <b className="redtext">{t.rs} {money(e.amount)}</b>
              <Icon name="pen" className="muted" />
            </button>
            <button className="x" onClick={() => confirm(t.deleteExpenseConfirm) && deleteExpense(e.id)}><Icon name="xmark" /></button>
          </div>
        ),
      )}
    </>
  );
}
