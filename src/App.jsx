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

// Daily-use screens sit in the bottom bar; the rest live in the top-right menu.
const TABS = [
  ['today', 'delivery', null],
  ['customers', 'customers', 'users'],
  ['expenses', 'expenses', 'receipt'],
];
const MENU = [
  ['stats', 'chart-pie'],
  ['payments', 'money-bill-wave'],
  ['more', 'gear', 'settings'],
];

export default function App() {
  const { data } = useStore();
  const t = useT();
  const [tab, setTab] = useState('today');
  const [openCustomer, setOpenCustomer] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.lang = data.lang;
    document.documentElement.dir = data.lang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.dataset.font = data.urduFont;
  }, [data.lang, data.urduFont]);

  const go = (k) => {
    setOpenCustomer(null);
    setMenuOpen(false);
    setTab(k);
  };
  const pending = data.queue.length > 0;

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
      <header className="topbar">
        <div className="brand"><BikeIcon /> {t.appName}</div>
        <button className="menubtn" aria-label={t.menu} onClick={() => setMenuOpen((o) => !o)}>
          <Icon name={menuOpen ? 'xmark' : 'bars'} />
          {pending && <i className="dot" />}
        </button>
        {menuOpen && (
          <>
            <div className="menuveil" onClick={() => setMenuOpen(false)} />
            <div className="menu">
              {MENU.map(([k, icon, label]) => (
                <button key={k} className={tab === k && !openCustomer ? 'on' : ''} onClick={() => go(k)}>
                  <Icon name={icon} /> {t[label || k]}
                  {k === 'more' && pending && <i className="dot" />}
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
