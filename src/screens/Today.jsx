import { useState } from "react";
import { useStore, today, addDays } from "../store";
import { useT, money } from "../i18n";
import Icon from "../Icon";
import SearchBar from "./SearchBar";
import PayBox from "./PayBox";
import CustomerForm from "./CustomerForm";
import CustomerBill from "./CustomerBill";
import { filterCustomers } from "../search";

const STEP = 0.5;

export default function Today() {
  const { data, setDelivery, markAll, balance } = useStore();
  const t = useT();
  const [date, setDate] = useState(today());
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState(null); // customer id taking money on the spot
  const [adding, setAdding] = useState(false);
  const [billFor, setBillFor] = useState(null);
  const day = data.deliveries[date] || {};
  const list = data.customers.filter((c) => c.active);

  const totalLiters = Object.values(day).reduce((s, d) => s + d.qty, 0);
  const marked = list.filter((c) => day[c.id]).length;
  const shown = filterCustomers(list, query);
  const unmarked = list.filter((c) => !day[c.id] && c.defaultQty > 0).length;
  const doMarkAll = () => confirm(t.markAllConfirm(unmarked)) && markAll(date);
  const label = t.fmtDate(date);

  if (billFor) return <CustomerBill id={billFor} initialMonth={date.slice(0, 7)} onClose={() => setBillFor(null)} />;

  return (
    <>
      <header className="datebar">
        <button className="arrow" onClick={() => setDate(addDays(date, -1))}>
          <Icon name="chevron-left" flip />
        </button>
        <div>
          <div className="big">{date === today() ? t.today : label}</div>
          {date === today() && <div className="muted">{label}</div>}
        </div>
        <button
          className="arrow"
          disabled={date >= today()}
          onClick={() => setDate(addDays(date, 1))}
        >
          <Icon name="chevron-right" flip />
        </button>
      </header>

      <div className="progress">
        <div className="progress-text">
          <span>
            <Icon name="check-double" /> <b>{marked}</b>/{list.length}
          </span>
          <span>
            <Icon name="bottle-droplet" /> <b>{totalLiters}</b> {t.liters}
          </span>
        </div>
        <div className="bar">
          <i style={{ width: `${list.length ? (marked / list.length) * 100 : 0}%` }} />
        </div>
      </div>

      {adding ? (
        <CustomerForm onDone={() => setAdding(false)} />
      ) : list.length === 0 ? (
        <button className="btn primary solid wide" onClick={() => setAdding(true)}>
          <Icon name="user-plus" /> {t.addCustomer}
        </button>
      ) : (
        <SearchBar value={query} onChange={setQuery} />
      )}

      {unmarked > 0 && !query && (
        <button className="btn green wide" onClick={doMarkAll}>
          <Icon name="check-double" /> {t.markAll} ({unmarked})
        </button>
      )}

      {query && shown.length === 0 && <p className="empty">{t.noMatch}</p>}

      {shown.map((c) => {
        const entry = day[c.id];
        const qty = entry ? entry.qty : c.defaultQty;
        const state = !entry ? "pending" : entry.qty > 0 ? "done" : "skipped";
        const due = Math.round(balance(c.id));
        if (paying === c.id)
          return (
            <div key={c.id}>
              <div className="name pad">{c.name}</div>
              <PayBox customerId={c.id} onDone={() => setPaying(null)} />
            </div>
          );
        return (
          <div key={c.id} className={`daycard ${state}`}>
            <div className="dayhead">
              <div className="dayname">{c.name}</div>
              <div className="stepper">
                <button
                  aria-label="-"
                  onClick={() => setDelivery(date, c.id, Math.max(0, qty - STEP))}
                >
                  <Icon name="minus" />
                </button>
                <span className="num">
                  {qty} <small>{t.liters}</small>
                </span>
                <button aria-label="+" onClick={() => setDelivery(date, c.id, qty + STEP)}>
                  <Icon name="plus" />
                </button>
              </div>
            </div>
            <div className="cardfoot">
              <button className="paypill bill" aria-label={t.monthBill} onClick={() => setBillFor(c.id)}>
                <Icon name="file-invoice" />
              </button>
              <button
                className={`paypill ${due > 0 ? "due" : ""}`}
                aria-label={t.receive}
                onClick={() => setPaying(c.id)}
              >
                <Icon name="money-bill-wave" />
                {due > 0 && <span>{money(due)}</span>}
              </button>
              <button
                className={`mark skip push ${state === "skipped" ? "on" : ""}`}
                aria-label={t.skip}
                onClick={() => setDelivery(date, c.id, state === "skipped" ? null : 0)}
              >
                <Icon name="xmark" />
              </button>
              <button
                className={`mark give ${state === "done" ? "on" : ""}`}
                aria-label={t.done}
                onClick={() =>
                  setDelivery(date, c.id, state === "done" ? null : qty || c.defaultQty)
                }
              >
                <Icon name="check" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
