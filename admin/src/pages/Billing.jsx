import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Stat, useUi } from '../components/ui';
import BillingPanel from './BillingPanel';
import { fmtDate, fmtMonth, money } from '../format';

// Monthly app fee: every partner's fee and whether this month is paid, plus the billing rules.
export const ACTION_LABELS = {
  lock: 'Lock the app',
  readonly: 'Read-only (can view, cannot add or edit)',
  remind: 'Reminders only (never blocks)',
};

const FILTERS = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['due', 'Due'],
  ['paid', 'Paid'],
  ['free', 'Free'],
];

export function BillingBadge({ b }) {
  if (!b) return null;
  if (b.status === 'overdue') return <Badge kind="bad" icon="circle-exclamation">Overdue</Badge>;
  if (b.status === 'due') return <Badge kind="warn" icon="clock">Due</Badge>;
  if (b.status === 'paid') return <Badge kind="good" icon="circle-check">Paid</Badge>;
  return <Badge kind="idle">Free</Badge>;
}

export default function Billing({ openId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    api('/billing').then(setData, (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, overdue: 0, due: 0, paid: 0, free: 0 };
    for (const p of data?.partners || []) {
      c.all++;
      c[p.status]++;
    }
    return c;
  }, [data]);

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    const digits = text.replace(/\D/g, '');
    return (data?.partners || [])
      .filter((p) => filter === 'all' || p.status === filter)
      .filter((p) => !text || p.name.toLowerCase().includes(text) || (digits && p.phone.includes(digits)));
  }, [data, q, filter]);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>;

  const { totals } = data;
  const month = fmtMonth(data.today.slice(0, 7));
  return (
    <>
      <section className="stats">
        <Stat label={`Fees for ${month}`} value={money(totals.expected)} icon="file-invoice-dollar" sub={`${money(totals.paidForMonth)} paid so far`} />
        <Stat label="Received this month" value={money(totals.received)} icon="money-bill-wave" tone="good" sub="Money in, for any month" />
        <Stat label="Outstanding" value={money(totals.outstanding)} icon="hourglass-half" tone={totals.outstanding ? 'bad' : ''} sub="Unpaid up to this month" />
        <Stat label="Overdue partners" value={totals.overdue} icon="circle-exclamation" tone={totals.overdue ? 'bad' : ''} sub={`${totals.due} more within grace days`} />
      </section>

      <div className="toolbar">
        <div className="search">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="search" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="segments" role="tablist">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
              {label} <span className="count">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="panel flush">
        {list.length === 0 ? (
          <p className="empty">{data.partners.length ? 'No partners match' : 'No partners yet'}</p>
        ) : (
          <table className="table users">
            <thead>
              <tr><th>Partner</th><th className="r">Monthly fee</th><th>Status</th><th className="r">Outstanding</th><th>Paid through</th><th>Last payment</th><th /></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={`link ${openId === p.id ? 'selected' : ''}`} onClick={() => (location.hash = `#/billing/${p.id}`)}>
                  <td>
                    <div className="avatar-row">
                      <span className="avatar">{p.name.trim().charAt(0).toUpperCase() || '?'}</span>
                      <div><b>{p.name}</b><div className="muted small">{p.phone}</div></div>
                    </div>
                  </td>
                  <td className="r" data-label="Monthly fee">
                    {p.fee > 0 ? money(p.fee) : 'Free'}
                    {p.nextFee && <div className="muted small">{money(p.nextFee.fee)} from {fmtMonth(p.nextFee.month)}</div>}
                  </td>
                  <td>
                    <BillingBadge b={p} />
                    {p.disabled && <Badge kind="idle" icon="ban">Blocked</Badge>}
                  </td>
                  <td className="r" data-label="Outstanding">{p.outstanding > 0 ? money(p.outstanding) : '—'}</td>
                  <td data-label="Paid through">{p.paidThrough ? fmtMonth(p.paidThrough) : '—'}</td>
                  <td data-label="Last payment">{fmtDate(p.lastPaidOn)}</td>
                  <td className="r chev"><i className="fa-solid fa-chevron-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <SettingsPanel settings={data.settings} onSaved={load} />

      {openId && <BillingPanel id={openId} onClose={() => (location.hash = '#/billing')} onChanged={load} />}
    </>
  );
}

function SettingsPanel({ settings, onSaved }) {
  const { notify } = useUi();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(settings), [settings]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/billing/settings', { method: 'PUT', body: { ...f, defaultFee: Number(f.defaultFee), graceDays: Number(f.graceDays) } });
      setOpen(false);
      notify('Billing settings saved');
      onSaved();
    } catch (err) {
      notify(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Billing settings</h3>
          <p className="muted">Apply to every partner unless you change it on that partner.</p>
        </div>
        {!open && <button className="btn" onClick={() => setOpen(true)}><i className="fa-solid fa-pen" /> Edit</button>}
      </div>
      {open ? (
        <form onSubmit={save} className="stack">
          <label className="field">
            <span>Monthly fee for new partners (Rs)</span>
            <input value={f.defaultFee} onChange={set('defaultFee')} inputMode="decimal" type="number" min="0" step="any" required />
            <small className="muted">The month they join is free; this fee starts the month after. Existing partners keep their own fee.</small>
          </label>
          <label className="field">
            <span>Grace days</span>
            <input value={f.graceDays} onChange={set('graceDays')} inputMode="numeric" type="number" min="0" max="60" required />
            <small className="muted">Days after the 1st of the month before the unpaid action starts. The app shows a reminder during these days.</small>
          </label>
          <label className="field">
            <span>When a partner has not paid after the grace days</span>
            <select className="select" value={f.action} onChange={set('action')}>
              {Object.entries(ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>How to pay (shown in the app)</span>
            <textarea rows={4} value={f.payInfo} onChange={set('payInfo')} maxLength={500} placeholder={'JazzCash: 0300 1234567 (Name)\nEasyPaisa: 0300 1234567\nBank: Meezan 0123456789'} />
            <small className="muted">Account numbers partners send the fee to. Ask them to send a screenshot on WhatsApp or in Help &amp; Support.</small>
          </label>
          <div className="row-btns">
            <button type="button" className="btn" onClick={() => { setF(settings); setOpen(false); }}>Cancel</button>
            <button className="btn solid" disabled={busy}>Save</button>
          </div>
        </form>
      ) : (
        <dl className="facts">
          <div><dt>Fee for new partners</dt><dd>{settings.defaultFee > 0 ? money(settings.defaultFee) : 'Free'}</dd></div>
          <div><dt>Grace days</dt><dd>{settings.graceDays}</dd></div>
          <div><dt>When unpaid</dt><dd>{ACTION_LABELS[settings.action]}</dd></div>
          <div><dt>How to pay</dt><dd className="pre">{settings.payInfo || <span className="muted">Not set yet</span>}</dd></div>
        </dl>
      )}
    </section>
  );
}
