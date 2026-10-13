import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import CustomerForm from './CustomerForm';
import PayBox from './PayBox';
import Icon from '../Icon';
import SearchBar from './SearchBar';
import { filterCustomers } from '../search';
import MonthlyReport from './MonthlyReport';
import CustomerBill from './CustomerBill';
import ActiveSwitch from './ActiveSwitch';
import { useProducts } from '../products';

export default function Customers({ onOpen }) {
  const { data, balance, deleteCustomer } = useStore();
  const { main, byId } = useProducts();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const [query, setQuery] = useState('');
  const [report, setReport] = useState(false);
  const [billFor, setBillFor] = useState(null);

  const list = filterCustomers(data.customers, query).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));

  if (report) return <MonthlyReport onClose={() => setReport(false)} />;
  if (billFor) return <CustomerBill id={billFor} onClose={() => setBillFor(null)} />;

  return (
    <>
      <div className="listhead">
        <h1><Icon name="users" /> {t.customers}</h1>
        {data.customers.length > 0 && (
          <button className="btn primary compact" onClick={() => setReport(true)}><Icon name="chart-column" /> {t.monthlyReport}</button>
        )}
      </div>
      {adding ? (
        <CustomerForm onDone={() => setAdding(false)} />
      ) : (
        data.customers.length === 0 && (
          <button className="btn primary solid wide" onClick={() => setAdding(true)}><Icon name="user-plus" /> {t.addCustomer}</button>
        )
      )}
      {data.customers.length > 0 && <SearchBar value={query} onChange={setQuery} />}
      {query && list.length === 0 && <p className="empty">{t.noMatch}</p>}
      {list.map((c) => {
        const bal = balance(c.id);
        if (paying === c.id)
          return (
            <div key={c.id}>
              <div className="name pad">{c.name}</div>
              <PayBox customerId={c.id} onDone={() => setPaying(null)} />
            </div>
          );
        return (
          <div key={c.id} className={`card custcard ${c.active ? '' : 'dim'}`}>
            <button className="row link plain" onClick={() => onOpen(c.id)}>
              <div className="grow">
                <div className="name">{c.name}</div>
                <div className="muted">
                  {c.defaultQty} {main.unit} · {t.rs} {c.rate}
                  {(c.items || []).filter((i) => byId(i.productId)).map((i) => ` + ${byId(i.productId).name}`).join('')}
                  {!c.active && ` · ${t.inactive}`}
                </div>
              </div>
              <Balance amount={bal} />
            </button>
            <div className="cardfoot">
              <ActiveSwitch customer={c} />
              <button className="paypill bill" aria-label={t.monthBill} onClick={() => setBillFor(c.id)}>
                <Icon name="file-invoice" />
              </button>
              <button
                className="paypill del"
                aria-label={t.deleteCustomer}
                onClick={() => confirm(t.deleteCustomerConfirm(c.name)) && deleteCustomer(c.id)}
              >
                <Icon name="trash" />
              </button>
              {bal > 0.5 && (
                <button className="paypill give push" onClick={() => setPaying(c.id)}>
                  <Icon name="money-bill-wave" /> <span>{t.receive}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function Balance({ amount }) {
  const t = useT();
  if (Math.round(amount) === 0) return <div className="pill green"><Icon name="check" /></div>;
  return (
    <div className={`pill ${amount > 0 ? 'red' : 'green'}`}>
      <small>{amount > 0 ? t.due : t.advance}</small>
      {t.rs} {money(Math.abs(amount))}
    </div>
  );
}
