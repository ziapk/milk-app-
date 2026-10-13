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
import Suppliers from './screens/Suppliers';
import Icon from './Icon';
import QuickAdd, { Fab } from './screens/QuickAdd';

// Daily-use screens sit in the bottom bar. The logo opens the summary dashboard and the
// gear opens settings.
const TABS = [
  ['today', 'delivery', null],
  ['customers', 'customers', 'users'],
  ['payments', 'payments', 'money-bill-wave'],
  ['suppliers', 'suppliers', 'truck'],
];

export default function App() {
  const { data, sync, syncState } = useStore();
  const t = useT();
  const [tab, setTab] = useState('today');
  const [openCustomer, setOpenCustomer] = useState(null);
  const [create, setCreate] = useState(null); // what the + button is adding, if anything

  useEffect(() => {
    document.documentElement.lang = data.lang;
    document.documentElement.dir = data.lang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.dataset.font = data.urduFont;
  }, [data.lang, data.urduFont]);

  const go = (k) => {
    setOpenCustomer(null);
    setCreate(null);
    setTab(k);
  };
  const pending = data.queue.length > 0;

  if (!data.auth) return <Login />;

  let screen;
  if (create) screen = <QuickAdd key={create} action={create} onDone={() => setCreate(null)} onSwitch={setCreate} />;
  else if (openCustomer) screen = <CustomerDetail id={openCustomer} onBack={() => setOpenCustomer(null)} />;
  else if (tab === 'today') screen = <Today />;
  else if (tab === 'customers') screen = <Customers onOpen={setOpenCustomer} />;
  else if (tab === 'payments') screen = <Payments onOpenSuppliers={() => go('suppliers')} />;
  else if (tab === 'stats') screen = <Stats />;
  else if (tab === 'suppliers') screen = <Suppliers />;
  else screen = <More />;

  return (
    <div className="app">
      <header className="topbar">
        <button className={`brand ${tab === 'stats' && !openCustomer && !create ? 'on' : ''}`} aria-label={t.openDashboard} onClick={() => go('stats')}>
          <img src="/logo.png" alt="" /> {t.appName}
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
        <button className={`menubtn ${tab === 'more' && !openCustomer && !create ? 'on' : ''}`} aria-label={t.settings} onClick={() => go('more')}>
          <Icon name="gear" />
        </button>
      </header>
      <main>{screen}</main>
      {!create && <Fab onPick={setCreate} />}
      <nav className="tabs">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={tab === k && !openCustomer ? 'on' : ''} onClick={() => go(k)}>
            <span className="ico">{icon ? <Icon name={icon} /> : <img className="tablogo" src="/logo.png" alt="" />}</span>
            {t[label]}
          </button>
        ))}
      </nav>
    </div>
  );
}
