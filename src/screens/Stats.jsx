import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';

export default function Stats() {
  const { data, balance } = useStore();
  const t = useT();

  const month = today().slice(0, 7);
  const sum = (list) => list.reduce((s, x) => s + x.amount, 0);
  const collectedToday = sum(data.payments.filter((p) => p.date === today()));
  const collectedMonth = sum(data.payments.filter((p) => p.date.startsWith(month)));
  const spentMonth = sum(data.expenses.filter((e) => e.date.startsWith(month)));
  const saving = collectedMonth - spentMonth;
  const totalDue = data.customers.reduce((s, c) => s + Math.max(0, balance(c.id)), 0);

  return (
    <>
      <h1><Icon name="chart-pie" /> {t.stats}</h1>
      <div className="statgrid">
        <div className="stat green"><small><Icon name="sun" /> {t.collectedToday}</small><b>{money(collectedToday)}</b></div>
        <div className="stat green"><small><Icon name="calendar-days" /> {t.collectedMonth}</small><b>{money(collectedMonth)}</b></div>
        <div className="stat red"><small><Icon name="receipt" /> {t.spentMonth}</small><b>{money(spentMonth)}</b></div>
        <div className={`stat ${saving >= 0 ? 'primary' : 'red'}`}><small><Icon name="piggy-bank" /> {t.saving}</small><b>{money(saving)}</b></div>
        <div className="stat red span2"><small><Icon name="hourglass-half" /> {t.totalDue}</small><b>{money(totalDue)}</b></div>
      </div>
    </>
  );
}
