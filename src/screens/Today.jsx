import { useState } from "react";
import { useStore, today, addDays } from "../store";
import { useT } from "../i18n";
import Icon from "../Icon";

const STEP = 0.5;

export default function Today() {
  const { data, setDelivery } = useStore();
  const t = useT();
  const [date, setDate] = useState(today());
  const day = data.deliveries[date] || {};
  const list = data.customers.filter((c) => c.active);

  const totalLiters = Object.values(day).reduce((s, d) => s + d.qty, 0);
  const marked = list.filter((c) => day[c.id]).length;
  const label = new Date(date + "T00:00:00").toLocaleDateString(
    data.lang === "ur" ? "ur-PK" : "en-PK",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
    },
  );

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

      {list.length === 0 && <p className="empty">{t.noCustomers}</p>}

      {list.map((c) => {
        const entry = day[c.id];
        const qty = entry ? entry.qty : c.defaultQty;
        const state = !entry ? "pending" : entry.qty > 0 ? "done" : "skipped";
        return (
          <div key={c.id} className={`daycard ${state}`}>
            <div className="grow">
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
            <button
              className={`mark skip ${state === "skipped" ? "on" : ""}`}
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
        );
      })}
    </>
  );
}
