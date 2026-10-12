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

      <div className="stats">
        <div className="stat blue">
          <Icon name="bottle-droplet" /> <b>{totalLiters}</b> {t.liters}
        </div>
        <div className="stat">
          <Icon name="check-double" />{" "}
          <b>
            {marked}/{list.length}
          </b>
        </div>
      </div>

      {list.length === 0 && <p className="empty">{t.noCustomers}</p>}

      {list.map((c) => {
        const entry = day[c.id];
        const qty = entry ? entry.qty : c.defaultQty;
        const state = !entry ? "pending" : entry.qty > 0 ? "done" : "skipped";
        return (
          <div key={c.id} className={`card row daycard ${state}`}>
            <div className="grow">
              <div className="name">{c.name}</div>
              <div className="qty">
                <button
                  className="round"
                  onClick={() =>
                    setDelivery(date, c.id, Math.max(0, qty - STEP))
                  }
                >
                  <Icon name="minus" />
                </button>
                <span className="num">{qty}</span>
                <button
                  className="round"
                  onClick={() => setDelivery(date, c.id, qty + STEP)}
                >
                  <Icon name="plus" />
                </button>
                <span className="muted">{t.liters}</span>
              </div>
            </div>
            <div className="actions iconbtns">
              <button
                className={`btn red ${state === "skipped" ? "solid" : ""}`}
                aria-label={t.skip}
                onClick={() =>
                  setDelivery(date, c.id, state === "skipped" ? null : 0)
                }
              >
                <Icon name="xmark" />
              </button>
              <button
                className={`btn green ${state === "done" ? "solid" : ""}`}
                aria-label={t.done}
                onClick={() =>
                  setDelivery(
                    date,
                    c.id,
                    state === "done" ? null : qty || c.defaultQty,
                  )
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
