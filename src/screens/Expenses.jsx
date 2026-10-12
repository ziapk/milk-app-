import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import ExpenseBox, { CATEGORIES } from './ExpenseBox';
import Icon from '../Icon';
import { drawExpenses } from '../bill';
import ImagePreview from './ImagePreview';
import { usePeriod, PeriodBar } from './Period';

const catIcon = Object.fromEntries(CATEGORIES);

export default function Expenses() {
  const { data, deleteExpense } = useStore();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);

  const period = usePeriod();
  const list = data.expenses.filter((e) => period.match(e.date));
  const sum = (rows) => rows.reduce((s, x) => s + x.amount, 0);
  const spent = sum(list);
  // Cash in hand = every payment collected minus every expense paid, since the start.
  const cash = sum(data.payments) - sum(data.expenses);
  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';

  const showList = async () => {
    const rows = [...list].reverse().map((e) => ({
      label: new Date(e.date + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      category: t.cat[e.category] || t.cat.other,
      note: e.note,
      amount: e.amount,
    }));
    setPreview(await drawExpenses({ t, lang: data.lang,
        font: data.urduFont, seller: data.auth, monthName: period.label, rows, total: spent }));
  };

  if (preview)
    return (
      <ImagePreview canvas={preview} fileName={`expenses-${period.key}.png`} title={`${t.expenses} · ${period.label}`} onClose={() => setPreview(null)} />
    );

  return (
    <>
      <h1><Icon name="receipt" /> {t.expenses}</h1>
      <div className={`stat span-full ${cash >= 0 ? 'green' : 'red'}`}>
        <small><Icon name="money-bill-wave" /> {t.cashInHand}</small>
        <b>{money(cash)}</b>
      </div>
      {adding ? (
        <ExpenseBox onDone={() => setAdding(false)} />
      ) : (
        <button className="btn red solid wide" onClick={() => setAdding(true)}><Icon name="plus" /> {t.addExpense}</button>
      )}


      <PeriodBar period={period} />

      <div className="stat red span-full">
        <small><Icon name="receipt" /> {t.expensesCount(list.length)}</small>
        <b>{t.rs} {money(spent)}</b>
        {list.length > 0 && (
          <button className="btn blue compact sharebtn" onClick={showList}><Icon name="share-nodes" /> {t.share}</button>
        )}
      </div>

      {list.length === 0 && <p className="empty">{t.noExpenses}</p>}
      {list.map((e) =>
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
