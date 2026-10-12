import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import CustomerForm from './CustomerForm';
import PayBox from './PayBox';
import Icon from '../Icon';
import SearchBar from './SearchBar';
import { filterCustomers } from '../search';

export default function Customers({ onOpen }) {
  const { data, balance } = useStore();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const [query, setQuery] = useState('');

  const list = filterCustomers(data.customers, query).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));

  return (
    <>
      <h1><Icon name="users" /> {t.customers}</h1>
      {adding ? (
        <CustomerForm onDone={() => setAdding(false)} />
      ) : (
        <button className="btn blue solid wide" onClick={() => setAdding(true)}><Icon name="user-plus" /> {t.addCustomer}</button>
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
          <div key={c.id} className={`card row ${c.active ? '' : 'dim'}`}>
            <button className="grow row link plain" onClick={() => onOpen(c.id)}>
              <div className="grow">
                <div className="name">{c.name}</div>
                <div className="muted">
                  {c.defaultQty} {t.liters} · {t.rs} {c.rate}
                  {!c.active && ` · ${t.inactive}`}
                </div>
              </div>
              <Balance amount={bal} />
            </button>
            {bal > 0.5 && (
              <button className="btn green solid compact" onClick={() => setPaying(c.id)}><Icon name="hand-holding-dollar" /> {t.receive}</button>
            )}
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
