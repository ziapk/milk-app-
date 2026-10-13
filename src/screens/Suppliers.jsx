import { useState } from 'react';
import { useStore } from '../store';
import { useT, money } from '../i18n';
import Icon from '../Icon';
import SupplierForm from './SupplierForm';
import SupplierLedger from './SupplierLedger';
import { useProducts } from '../products';

// Supplier ledger: everyone the partner buys milk from, with what is still owed to each.
export default function Suppliers() {
  const { data, supplierBalance } = useStore();
  const t = useT();
  const { main } = useProducts();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);

  if (open) return <SupplierLedger id={open} onBack={() => setOpen(null)} />;

  const list = [...data.suppliers].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  const owed = data.suppliers.reduce((s, sp) => s + Math.max(0, supplierBalance(sp.id)), 0);

  return (
    <>
      <h1><Icon name="truck" /> {t.supplierLedger}</h1>
      {data.suppliers.length > 0 && (
        <div className={`stat span-full ${owed > 0.5 ? 'red' : 'green'}`}>
          <small><Icon name="hand-holding-dollar" /> {t.owedSuppliers}</small>
          <b>{t.rs} {money(owed)}</b>
        </div>
      )}
      {adding ? (
        <SupplierForm onDone={() => setAdding(false)} />
      ) : (
        data.suppliers.length === 0 && (
          <button className="btn primary solid wide" onClick={() => setAdding(true)}><Icon name="user-plus" /> {t.addSupplier}</button>
        )
      )}
      {data.suppliers.length === 0 && !adding && <p className="empty">{t.noSuppliers}</p>}
      {list.map((sp) => (
        <div key={sp.id} className={`card ${sp.active ? '' : 'dim'}`}>
          <button className="row link plain" onClick={() => setOpen(sp.id)}>
            <div className="grow">
              <div className="name">{sp.name}</div>
              <div className="muted">
                {t.rs} {sp.rate} / {main.unit}
                {!sp.active && ` · ${t.inactive}`}
              </div>
            </div>
            <SupplierBalance amount={supplierBalance(sp.id)} />
          </button>
        </div>
      ))}
    </>
  );
}

// Positive = the partner still has to pay the supplier.
export function SupplierBalance({ amount }) {
  const t = useT();
  if (Math.round(amount) === 0) return <div className="pill green"><Icon name="check" /></div>;
  return (
    <div className={`pill ${amount > 0 ? 'red' : 'green'}`}>
      <small>{amount > 0 ? t.toPay : t.advance}</small>
      {t.rs} {money(Math.abs(amount))}
    </div>
  );
}
