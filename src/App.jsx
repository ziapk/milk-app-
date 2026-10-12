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
import CustomerForm from './screens/CustomerForm';

// Daily-use screens sit in the bottom bar; the rest live in the top-right menu.
const TABS = [
  ['today', 'delivery', null],
  ['customers', 'customers', 'users'],
  ['payments', 'payments', 'money-bill-wave'],
  ['expenses', 'expenses', 'receipt'],
];
const MENU = [
  ['stats', 'chart-pie'],
  ['more', 'gear', 'settings'],
];

export default function App() {
  const { data, sync, syncState } = useStore();
  const t = useT();
  const [tab, setTab] = useState('today');
  const [openCustomer, setOpenCustomer] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    document.documentElement.lang = data.lang;
    document.documentElement.dir = data.lang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.dataset.font = data.urduFont;
  }, [data.lang, data.urduFont]);

  const go = (k) => {
    setOpenCustomer(null);
    setMenuOpen(false);
    setAdding(false);
    setTab(k);
  };
  const pending = data.queue.length > 0;

  if (!data.auth) return <Login />;

  let screen;
  if (adding)
    screen = (
      <>
        <h1><Icon name="user-plus" /> {t.addCustomer}</h1>
        <CustomerForm onDone={() => setAdding(false)} />
      </>
    );
  else if (openCustomer) screen = <CustomerDetail id={openCustomer} onBack={() => setOpenCustomer(null)} />;
  else if (tab === 'today') screen = <Today />;
  else if (tab === 'customers') screen = <Customers onOpen={setOpenCustomer} />;
  else if (tab === 'payments') screen = <Payments />;
  else if (tab === 'expenses') screen = <Expenses />;
  else if (tab === 'stats') screen = <Stats />;
  else screen = <More />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><BikeIcon /> {t.appName}</div>
        <button
          className={`menubtn addcust ${adding ? 'on' : ''}`}
          aria-label={t.addCustomer}
          onClick={() => {
            setMenuOpen(false);
            setAdding(true);
          }}
        >
          <Icon name="user-plus" />
        </button>
        <button
          className={`menubtn syncbtn ${syncState === 'offline' ? 'off' : pending ? 'pending' : ''}`}
          aria-label={t.syncNow}
          onClick={sync}
          disabled={syncState === 'syncing'}
        >
          <Icon name={syncState === 'offline' ? 'cloud-arrow-up' : 'rotate'} spin={syncState === 'syncing'} />
          {pending && <i className="count">{data.queue.length > 99 ? '99+' : data.queue.length}</i>}
        </button>
        <button className="menubtn" aria-label={t.menu} onClick={() => setMenuOpen((o) => !o)}>
          <Icon name={menuOpen ? 'xmark' : 'bars'} />
        </button>
        {menuOpen && (
          <>
            <div className="menuveil" onClick={() => setMenuOpen(false)} />
            <div className="menu">
              {MENU.map(([k, icon, label]) => (
                <button key={k} className={tab === k && !openCustomer ? 'on' : ''} onClick={() => go(k)}>
                  <Icon name={icon} /> {t[label || k]}
                </button>
              ))}
            </div>
          </>
        )}
      </header>
      <main>{screen}</main>
      <nav className="tabs">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={tab === k && !openCustomer ? 'on' : ''} onClick={() => go(k)}>
            <span className="ico">{icon ? <Icon name={icon} /> : <BikeIcon />}</span>
            {t[label]}
          </button>
        ))}
      </nav>
    </div>
  );
}
