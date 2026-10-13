import { useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Stat } from '../components/ui';
import BarChart from '../components/BarChart';
import { money, num } from '../format';

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/overview').then(setData, (e) => setError(errorText(e)));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>;

  const { users, month } = data;
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });
  const litersTotal = data.liters.reduce((s, d) => s + d.value, 0);
  const signupsTotal = data.signups.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <section className="stats">
        <Stat label="Total users" value={num(users.total)} icon="users" sub={`${num(users.new30)} joined in 30 days`} />
        <Stat label="Active this week" value={num(users.active7)} icon="signal" tone="good" sub="Opened the app in 7 days" />
        <Stat label="Customers" value={num(data.customers)} icon="house-user" sub="Active, across all users" />
        <Stat label="Blocked users" value={num(users.blocked)} icon="ban" tone={users.blocked ? 'bad' : ''} />
      </section>

      <h2 className="section-title">{monthName} so far</h2>
      <section className="stats three">
        <Stat label="Milk delivered" value={`${num(month.liters, 1)} L`} icon="bottle-droplet" />
        <Stat label="Milk sales recorded" value={money(month.sales)} icon="file-invoice" />
        <Stat label="Payments collected" value={money(month.collected)} icon="money-bill-wave" tone="good" />
      </section>

      {data.supply.suppliers > 0 && (
        <>
          <h2 className="section-title">Milk bought from suppliers · {monthName}</h2>
          <section className="stats">
            <Stat label="Milk bought" value={`${num(data.supply.liters, 1)} L`} icon="truck" sub={money(data.supply.amount)} />
            <Stat label="Paid to suppliers" value={money(data.supply.paid)} icon="hand-holding-dollar" />
            <Stat label="Owed to suppliers" value={money(Math.max(0, data.supply.owed))} icon="scale-unbalanced" tone={data.supply.owed > 0.5 ? 'bad' : ''} sub="All time, all users" />
            <Stat label="Suppliers" value={num(data.supply.suppliers)} icon="people-carry-box" sub={<a href="#/suppliers">View all</a>} />
          </section>
        </>
      )}

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Milk delivered per day</h3>
              <p className="muted">Last 30 days · {num(litersTotal, 1)} L total</p>
            </div>
          </div>
          <BarChart data={data.liters} unit="L" label="Milk delivered" />
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>New users per day</h3>
              <p className="muted">Last 30 days · {num(signupsTotal)} total</p>
            </div>
          </div>
          <BarChart data={data.signups} unit={signupsTotal === 1 ? 'user' : 'users'} label="New users" />
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Top users in {monthName}</h3>
            <p className="muted">By milk delivered</p>
          </div>
          <a className="btn" href="#/users">All users <i className="fa-solid fa-arrow-right" /></a>
        </div>
        {data.top.length === 0 ? (
          <p className="empty">No deliveries recorded this month yet</p>
        ) : (
          <table className="table">
            <thead><tr><th>#</th><th>User</th><th className="r">Milk</th><th className="r">Sales</th></tr></thead>
            <tbody>
              {data.top.map((t, i) => (
                <tr key={t.id} className="link" onClick={() => (location.hash = `#/users/${t.id}`)}>
                  <td className="muted">{i + 1}</td>
                  <td><b>{t.name}</b><div className="muted small">{t.phone}</div></td>
                  <td className="r">{num(t.liters, 1)} L</td>
                  <td className="r">{money(t.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
