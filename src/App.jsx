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
import Shop from './screens/Shop';
import Icon from './Icon';
import QuickAdd, { Fab } from './screens/QuickAdd';
import Subscription, { SubBanner } from './screens/Subscription';

// Daily-use screens sit in the bottom bar. The logo opens the summary dashboard and the
// gear opens settings.
const TABS = [
  ['today', 'delivery', null, 'delivery'],
  ['shop', 'shop', 'store', 'shop'],
  ['customers', 'customers', 'users'],
  ['payments', 'payments', 'money-bill-wave'],
  ['suppliers', 'suppliers', 'truck'],
];

export default function App() {
  const { data, sync, syncState, subscription, blockedAt, clearBlocked } = useStore();
  const t = useT();
  const [tab, setTab] = useState('today');
  const [openCustomer, setOpenCustomer] = useState(null);
  const [create, setCreate] = useState(null); // what the + button is adding, if anything
  const [subOpen, setSubOpen] = useState(false); // Subscription screen (from the fee reminder)

  useEffect(() => {
    document.documentElement.lang = data.lang;
    document.documentElement.dir = data.lang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.dataset.font = data.urduFont;
  }, [data.lang, data.urduFont]);

  // A change was refused because the monthly fee is unpaid and read-only is on.
  useEffect(() => {
    if (!blockedAt) return;
    alert(t.subBlockedWrite);
    clearBlocked();
  }, [blockedAt]);

  const go = (k) => {
    setOpenCustomer(null);
    setCreate(null);
    setSubOpen(false);
    setTab(k);
  };
  const pending = data.queue.length > 0;

  if (!data.auth) return <Login />;

  // Monthly fee overdue with "lock" on: only the subscription screen until it is paid.
  if (subscription.block === 'lock') {
    return <div className="app"><main><Subscription locked /></main></div>;
  }

  // Delivery and Shop tabs only show when that business mode is on (Settings > Business).
  const tabs = TABS.filter(([, , , mode]) => !mode || data.settings[mode]);
  const current = tab === 'today' && !data.settings.delivery ? (data.settings.shop ? 'shop' : 'customers') : tab === 'shop' && !data.settings.shop ? 'today' : tab;

  let screen;
  if (subOpen) screen = <Subscription onBack={() => setSubOpen(false)} />;
  else if (create) screen = <QuickAdd key={create} action={create} onDone={() => setCreate(null)} onSwitch={setCreate} />;
  else if (openCustomer) screen = <CustomerDetail id={openCustomer} onBack={() => setOpenCustomer(null)} />;
  else if (current === 'today') screen = <Today />;
  else if (current === 'shop') screen = <Shop onNewSale={() => setCreate('sale')} />;
  else if (current === 'customers') screen = <Customers onOpen={setOpenCustomer} />;
  else if (current === 'payments') screen = <Payments onOpenSuppliers={() => go('suppliers')} />;
  else if (current === 'stats') screen = <Stats />;
  else if (current === 'suppliers') screen = <Suppliers />;
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
      <main>
        {!subOpen && <SubBanner onOpen={() => setSubOpen(true)} />}
        {screen}
      </main>
      {!create && !subOpen && subscription.block !== 'readonly' && <Fab onPick={setCreate} />}
      <nav className="tabs">
        {tabs.map(([k, label, icon]) => (
          <button key={k} className={current === k && !openCustomer ? 'on' : ''} onClick={() => go(k)}>
            <span className="ico">{icon ? <Icon name={icon} /> : <img className="tablogo" src="/logo.png" alt="" />}</span>
            {t[label]}
          </button>
        ))}
      </nav>
    </div>
  );
}
