import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useT } from './i18n';
import Today from './screens/Today';
import Customers from './screens/Customers';
import CustomerDetail from './screens/CustomerDetail';
import Payments from './screens/Payments';
import More from './screens/More';
import Login from './screens/Login';
import Stats from './screens/Stats';
import Expenses from './screens/Expenses';
import Icon, { BikeIcon } from './Icon';

const TABS = [
  ['today', null],
  ['customers', 'users'],
  ['payments', 'money-bill-wave'],
  ['expenses', 'receipt'],
  ['stats', 'chart-pie'],
  ['more', 'gear'],
];

export default function App() {
  const { data } = useStore();
  const t = useT();
  const [tab, setTab] = useState('today');
  const [openCustomer, setOpenCustomer] = useState(null);

  useEffect(() => {
    document.documentElement.lang = data.lang;
    document.documentElement.dir = data.lang === 'ur' ? 'rtl' : 'ltr';
  }, [data.lang]);

  const go = (k) => {
    setOpenCustomer(null);
    setTab(k);
  };

  if (!data.auth) return <Login />;

  let screen;
  if (openCustomer) screen = <CustomerDetail id={openCustomer} onBack={() => setOpenCustomer(null)} />;
  else if (tab === 'today') screen = <Today />;
  else if (tab === 'customers') screen = <Customers onOpen={setOpenCustomer} />;
  else if (tab === 'payments') screen = <Payments />;
  else if (tab === 'expenses') screen = <Expenses />;
  else if (tab === 'stats') screen = <Stats />;
  else screen = <More />;

  return (
    <div className="app">
      <main>{screen}</main>
      <nav className="tabs">
        {TABS.map(([k, icon]) => (
          <button key={k} className={tab === k && !openCustomer ? 'on' : ''} onClick={() => go(k)}>
            <span className="ico">
              {icon ? <Icon name={icon} /> : <BikeIcon />}
              {k === 'more' && data.queue.length > 0 && <i className="dot" />}
            </span>
            {t[k]}
          </button>
        ))}
      </nav>
    </div>
  );
}
