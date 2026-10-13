import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import Icon from '../Icon';
import { useBackClose, useSomethingOpen } from '../back';
import { filterCustomers } from '../search';
import CustomerForm from './CustomerForm';
import SupplierForm from './SupplierForm';
import ExpenseBox from './ExpenseBox';
import PayBox from './PayBox';
import SearchBar from './SearchBar';
import { Balance } from './Customers';
import { SupplierBalance } from './Suppliers';
import { PurchaseBox, SupplierPayBox } from './SupplierLedger';
import { useProducts } from '../products';
import { SaleBox } from './Shop';

// Everything that can be created from the floating + button. [key, icon, label key, colour]
const ACTIONS = [
  ['sale', 'cart-plus', 'newSale', 'primary', 'shop'],
  ['customer', 'user-plus', 'addCustomer', 'primary'],
  ['payment', 'money-bill-wave', 'receive', 'green'],
  ['expense', 'receipt', 'addExpense', 'red'],
  ['supplier', 'truck', 'addSupplier', 'primary'],
  ['purchase', 'bottle-droplet', 'buyMilk', 'primary'],
  ['supplierPay', 'hand-holding-dollar', 'paySupplier', 'green'],
];

// Floating + button that opens the list of things to add.
export function Fab({ onPick }) {
  const t = useT();
  const { data } = useStore();
  const actions = ACTIONS.filter(([, , , , mode]) => !mode || data.settings[mode]);
  // Hide while a form or sub-screen is open so it never covers fields (its own sheet counts too).
  const busy = useSomethingOpen();
  const [open, setOpen] = useState(false);
  useBackClose(() => setOpen(false), open);

  return (
    <>
      {open && (
        <div className="fabveil" onClick={() => setOpen(false)}>
          <div className="fabsheet" onClick={(e) => e.stopPropagation()} role="menu" aria-label={t.newEntry}>
            <div className="fabtitle">{t.newEntry}</div>
            <div className="fabgrid">
              {actions.map(([k, icon, label, colour]) => (
                <button key={k} role="menuitem" className={`fabitem ${colour}`} onClick={() => { setOpen(false); onPick(k); }}>
                  <span className="fabico"><Icon name={icon} /></span>
                  {t[label]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {(open || !busy) && <button className={`fab ${open ? 'open' : ''}`} aria-label={t.newEntry} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="plus" />
      </button>}
    </>
  );
}

// The chosen create form. Payment / buy milk / pay supplier first ask who it is for.
export default function QuickAdd({ action, onDone, onSwitch }) {
  const t = useT();
  const [who, setWho] = useState(null);
  useBackClose(onDone);
  const [, icon, label] = ACTIONS.find(([k]) => k === action);

  let body;
  if (action === 'sale') return <SaleBox onDone={onDone} />;
  if (action === 'customer') body = <CustomerForm onDone={onDone} />;
  else if (action === 'supplier') body = <SupplierForm onDone={onDone} />;
  else if (action === 'expense') body = <ExpenseBox onDone={onDone} />;
  else if (action === 'payment')
    body = who ? <PayBox customerId={who.id} onDone={onDone} /> : <PickCustomer onPick={setWho} onAdd={() => onSwitch('customer')} />;
  else
    body = who ? (
      action === 'purchase' ? <PurchaseBox supplier={who} onDone={onDone} /> : <SupplierPayBox supplierId={who.id} onDone={onDone} />
    ) : (
      <PickSupplier onPick={setWho} onAdd={() => onSwitch('supplier')} />
    );

  return (
    <>
      <header className="datebar">
        <button className="arrow" aria-label={t.cancel} onClick={who ? () => setWho(null) : onDone}><Icon name="arrow-left" flip /></button>
        <div className="big"><Icon name={icon} /> {t[label]}</div>
        <span className="arrow ghost" />
      </header>
      {who && <div className="name pad center">{who.name}</div>}
      {body}
    </>
  );
}

function PickCustomer({ onPick, onAdd }) {
  const { data, balance } = useStore();
  const t = useT();
  const [query, setQuery] = useState('');
  const list = filterCustomers(data.customers, query).sort(
    (a, b) => b.active - a.active || balance(b.id) - balance(a.id) || a.name.localeCompare(b.name),
  );

  if (data.customers.length === 0) return <EmptyPick text={t.noCustomers} addLabel={t.addCustomer} onAdd={onAdd} />;
  return (
    <>
      <p className="muted pad">{t.chooseCustomer}</p>
      <SearchBar value={query} onChange={setQuery} />
      {query && list.length === 0 && <p className="empty">{t.noMatch}</p>}
      {list.map((c) => (
        <button key={c.id} className={`card row link pickrow ${c.active ? '' : 'dim'}`} onClick={() => onPick(c)}>
          <div className="grow name">{c.name}</div>
          <Balance amount={balance(c.id)} />
        </button>
      ))}
    </>
  );
}

function PickSupplier({ onPick, onAdd }) {
  const { data, supplierBalance } = useStore();
  const t = useT();
  const { main } = useProducts();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = data.suppliers
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.phone || '').includes(q))
    .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));

  if (data.suppliers.length === 0) return <EmptyPick text={t.noSuppliers} addLabel={t.addSupplier} onAdd={onAdd} />;
  return (
    <>
      <p className="muted pad">{t.chooseSupplier}</p>
      {data.suppliers.length > 5 && (
        <div className="search">
          <Icon name="magnifying-glass" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchSuppliers} />
        </div>
      )}
      {list.map((s) => (
        <button key={s.id} className={`card row link pickrow ${s.active ? '' : 'dim'}`} onClick={() => onPick(s)}>
          <div className="grow">
            <div className="name">{s.name}</div>
            <div className="muted">{t.rs} {s.rate} / {main.unit}</div>
          </div>
          <SupplierBalance amount={supplierBalance(s.id)} />
        </button>
      ))}
    </>
  );
}

function EmptyPick({ text, addLabel, onAdd }) {
  return (
    <>
      <p className="empty">{text}</p>
      <button className="btn primary solid wide" onClick={onAdd}><Icon name="plus" /> {addLabel}</button>
    </>
  );
}
