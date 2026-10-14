import { useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { UiProvider } from './components/ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Users from './pages/Users';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Admins from './pages/Admins';
import Account from './pages/Account';
import Release from './pages/Release';
import Support from './pages/Support';
import Billing from './pages/Billing';
import AppUpdate from './components/AppUpdate';
import logo from '../../public/logo.png';

const PAGES = [
  ['overview', 'Overview', 'chart-line'],
  ['users', 'Users', 'users'],
  ['billing', 'Billing', 'file-invoice-dollar'],
  ['customers', 'Customers', 'house-user'],
  ['suppliers', 'Suppliers', 'truck'],
  ['support', 'Support', 'headset'],
  ['admins', 'Admins', 'user-shield'],
  ['release', 'App release', 'mobile-screen-button'],
  ['account', 'My account', 'circle-user'],
];

// Routes live in the URL hash: #/users, #/users/12 (that user's panel open), #/customers/12 (their customers), ...
const readRoute = () => {
  const [page = 'overview', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: PAGES.some(([k]) => k === page) ? page : 'overview', id: id ? Number(id) : null };
};
export const go = (path) => (location.hash = `#/${path}`);

export default function App() {
  const [admin, setAdmin] = useState(undefined); // undefined = checking, null = logged out
  const [route, setRoute] = useState(readRoute);
  const [navOpen, setNavOpen] = useState(false);
  const [openTickets, setOpenTickets] = useState(0); // badge on the Support link

  useEffect(() => {
    setUnauthorizedHandler(() => setAdmin(null));
    api('/me').then((me) => {
      setAdmin(me);
      api('/support?status=open').then((r) => setOpenTickets(r.counts.open), () => {});
    }, () => setAdmin(null));
    const onHash = () => {
      setRoute(readRoute());
      setNavOpen(false);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (admin === undefined) return <div className="boot"><i className="fa-solid fa-spinner fa-spin" /></div>;
  if (!admin) return <UiProvider><Login onLogin={setAdmin} /><AppUpdate /></UiProvider>;

  const logout = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setAdmin(null);
  };

  const title = PAGES.find(([k]) => k === route.page)[1];
  return (
    <UiProvider>
      <div className={`layout ${navOpen ? 'nav-open' : ''}`}>
        <aside className="sidebar">
          <div className="side-brand">
            <img src={logo} alt="" />
            <div>
              <b>Moo<span>Partner</span></b>
              <small>Admin</small>
            </div>
          </div>
          <nav>
            {PAGES.map(([k, label, icon]) => (
              <a key={k} href={`#/${k}`} className={route.page === k ? 'on' : ''}>
                <i className={`fa-solid fa-${icon}`} /> {label}
                {k === 'support' && openTickets > 0 && <span className="nav-count">{openTickets}</span>}
              </a>
            ))}
          </nav>
          <div className="side-foot">
            <div className="who">
              <i className="fa-solid fa-circle-user" />
              <div>
                <b>{admin.name}</b>
                <small>@{admin.username}</small>
              </div>
            </div>
            <button className="btn ghost wide" onClick={logout}>
              <i className="fa-solid fa-right-from-bracket" /> Log out
            </button>
          </div>
        </aside>
        <div className="veil" onClick={() => setNavOpen(false)} />
        <div className="content">
          <header className="topbar">
            <button className="iconbtn menu" aria-label="Menu" onClick={() => setNavOpen(true)}>
              <i className="fa-solid fa-bars" />
            </button>
            <h1>{title}</h1>
          </header>
          <main>
            {route.page === 'overview' && <Overview />}
            {route.page === 'users' && <Users openId={route.id} />}
            {route.page === 'billing' && <Billing openId={route.id} />}
            {route.page === 'customers' && <Customers userId={route.id} />}
            {route.page === 'suppliers' && <Suppliers userId={route.id} />}
            {route.page === 'support' && <Support onCount={setOpenTickets} />}
            {route.page === 'admins' && <Admins />}
            {route.page === 'release' && <Release />}
            {route.page === 'account' && <Account admin={admin} />}
          </main>
        </div>
      </div>
      <AppUpdate />
    </UiProvider>
  );
}
