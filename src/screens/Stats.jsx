import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';

export default function Stats() {
  const { data, balance, supplierBalance } = useStore();
  const t = useT();

  const month = today().slice(0, 7);
  const sum = (list) => list.reduce((s, x) => s + x.amount, 0);
  const collectedToday = sum(data.payments.filter((p) => p.date === today()));
  const collectedMonth = sum(data.payments.filter((p) => p.date.startsWith(month)));
  const spentMonth = sum(data.expenses.filter((e) => e.date.startsWith(month)));
  const paidSuppliersMonth = sum(data.supplierPayments.filter((p) => p.date.startsWith(month)));
  const boughtMonth = data.purchases.filter((b) => b.date.startsWith(month)).reduce((s, b) => s + b.qty, 0);
  const owedSuppliers = data.suppliers.reduce((s, sp) => s + Math.max(0, supplierBalance(sp.id)), 0);
  const saving = collectedMonth - spentMonth - paidSuppliersMonth;
  const hasSupply = data.suppliers.length > 0;
  const totalDue = data.customers.reduce((s, c) => s + Math.max(0, balance(c.id)), 0);

  return (
    <>
      <h1><Icon name="chart-pie" /> {t.stats}</h1>
      <div className="statgrid">
        <div className="stat green"><small><Icon name="sun" /> {t.collectedToday}</small><b>{money(collectedToday)}</b></div>
        <div className="stat green"><small><Icon name="calendar-days" /> {t.collectedMonth}</small><b>{money(collectedMonth)}</b></div>
        <div className="stat red"><small><Icon name="receipt" /> {t.spentMonth}</small><b>{money(spentMonth)}</b></div>
        {hasSupply && (
          <>
            <div className="stat primary"><small><Icon name="truck" /> {t.boughtMonth}</small><b>{Math.round(boughtMonth * 100) / 100} <small>{t.liters}</small></b></div>
            <div className="stat red"><small><Icon name="hand-holding-dollar" /> {t.paidSuppliersMonth}</small><b>{money(paidSuppliersMonth)}</b></div>
          </>
        )}
        <div className={`stat ${saving >= 0 ? 'primary' : 'red'}`}><small><Icon name="piggy-bank" /> {t.saving}</small><b>{money(saving)}</b></div>
        <div className="stat red span2"><small><Icon name="hourglass-half" /> {t.totalDue}</small><b>{money(totalDue)}</b></div>
        {hasSupply && <div className="stat red span2"><small><Icon name="truck" /> {t.owedSuppliers}</small><b>{money(owedSuppliers)}</b></div>}
      </div>
    </>
  );
}
