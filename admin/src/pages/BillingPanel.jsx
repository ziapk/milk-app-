import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Badge, Modal, useUi } from '../components/ui';
import { ACTION_LABELS, BillingBadge } from './Billing';
import { addMonth, fmtDate, fmtMonth, money } from '../format';

export const METHOD_LABELS = {
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  bank: 'Bank transfer',
  cash: 'Cash',
  waived: 'Waived (free)',
  other: 'Other',
};

const MONTH_STATUS = {
  paid: ['good', 'Paid'],
  partial: ['warn', 'Part paid'],
  unpaid: ['bad', 'Unpaid'],
  upcoming: ['idle', 'Not yet'],
  free: ['idle', 'Free'],
};

// Slide-over with one partner's subscription: fee, months, payments, and the actions on them.
export default function BillingPanel({ id, onClose, onChanged }) {
  const { notify, confirm } = useUi();
  const [b, setB] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'pay' | 'fee' | 'rules'

  const load = useCallback(() => {
    setError('');
    api(`/users/${id}/billing`).then(setB, (e) => setError(errorText(e)));
    api(`/users/${id}`).then((u) => setName(`${u.name} (${u.phone})`), () => {});
  }, [id]);
  useEffect(() => {
    setB(null);
    load();
  }, [load]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !modal && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose, modal]);

  // Every billing call answers with the partner's updated billing.
  const run = async (path, opts, done) => {
    try {
      setB(await api(path, opts));
      setModal(null);
      notify(done);
      onChanged();
    } catch (e) {
      notify(errorText(e), true);
    }
  };

  const removePayment = async (p) => {
    if (await confirm({ title: 'Delete this payment?', text: `${money(p.amount)} for ${fmtMonth(p.month)}. That month counts as unpaid again if this was its payment.`, ok: 'Delete', danger: true }))
      run(`/billing/payments/${p.id}`, { method: 'DELETE' }, 'Payment deleted');
  };
  const removeFee = async (f) => {
    if (await confirm({ title: 'Remove this fee change?', text: `${money(f.fee)} from ${fmtMonth(f.from)}. The fee before it continues instead.`, ok: 'Remove', danger: true }))
      run(`/users/${id}/billing/fee/${f.id}`, { method: 'DELETE' }, 'Fee change removed');
  };

  const firstFee = b?.fees?.[b.fees.length - 1];
  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className="drawer wide" aria-label="Partner billing">
        <div className="drawer-head">
          <h2>{name || 'Subscription'}</h2>
          <button className="iconbtn" aria-label="Close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        {error && <div className="alert">{error}</div>}
        {!b && !error && <div className="loading"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div>}

        {b && (
          <>
            <div className="bill-status">
              <BillingBadge b={b} />
              <span className="muted small">
                {b.status === 'overdue' && <>Unpaid since {fmtDate(b.dueFrom)}. {ACTION_LABELS[b.action]} is on.</>}
                {b.status === 'due' && <>{money(b.dueAmount)} for {fmtMonth(b.dueMonth)}. {ACTION_LABELS[b.action]} from {fmtDate(b.restrictFrom)}.</>}
                {b.status === 'paid' && <>Next payment {b.dueMonth ? `for ${fmtMonth(b.dueMonth)} due ${fmtDate(b.dueFrom)}` : 'not due yet'}.</>}
                {b.status === 'free' && (b.dueMonth ? <>Free now. {money(b.dueAmount)} due from {fmtDate(b.dueFrom)}.</> : <>No fee is charged.</>)}
              </span>
            </div>

            <div className="mini-stats">
              <div><small>Monthly fee now</small><b>{b.fee > 0 ? money(b.fee) : 'Free'}</b>{b.nextFee && <span className="muted small">{money(b.nextFee.fee)} from {fmtMonth(b.nextFee.month)}</span>}</div>
              <div><small>Outstanding</small><b className={b.outstanding > 0 ? 'redtext' : ''}>{money(b.outstanding)}</b><span className="muted small">up to {fmtMonth(b.month)}</span></div>
              <div><small>Paid through</small><b>{b.paidThrough ? fmtMonth(b.paidThrough) : '—'}</b></div>
              <div>
                <small>When unpaid</small>
                <b className="small-b">{ACTION_LABELS[b.action].split(' (')[0]}</b>
                <span className="muted small">{b.actionOverride ? 'Set for this partner' : 'Default'}{b.graceUntil ? ` · extra time to ${fmtDate(b.graceUntil)}` : ''}</span>
              </div>
            </div>

            <div className="row-btns">
              <button className="btn solid" onClick={() => setModal('pay')}><i className="fa-solid fa-plus" /> Record payment</button>
              <button className="btn" onClick={() => setModal('fee')}><i className="fa-solid fa-tag" /> Change fee</button>
              <button className="btn" onClick={() => setModal('rules')}><i className="fa-solid fa-sliders" /> Rules</button>
            </div>

            <h3 className="drawer-sub">Months</h3>
            <table className="table compact">
              <thead><tr><th>Month</th><th className="r">Fee</th><th className="r">Paid</th><th>Status</th></tr></thead>
              <tbody>
                {b.months.map((m) => {
                  const [kind, label] = MONTH_STATUS[m.status];
                  return (
                    <tr key={m.month} className={m.month === b.month ? 'selected' : ''}>
                      <td>{fmtMonth(m.month)}</td>
                      <td className="r">{m.fee > 0 ? money(m.fee) : '—'}</td>
                      <td className="r">{m.paid > 0 ? money(m.paid) : '—'}</td>
                      <td><Badge kind={kind}>{label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 className="drawer-sub">Payments</h3>
            {b.payments.length === 0 ? (
              <p className="muted small">No payments recorded yet.</p>
            ) : (
              <table className="table compact">
                <thead><tr><th>Received</th><th>For</th><th className="r">Amount</th><th>Method</th><th /></tr></thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paidOn)}</td>
                      <td>{fmtMonth(p.month)}</td>
                      <td className="r">{money(p.amount)}</td>
                      <td>
                        {METHOD_LABELS[p.method] || p.method}
                        <div className="muted small">{[p.reference, p.note, p.recordedBy && `by @${p.recordedBy}`].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="r"><button className="iconbtn" aria-label="Delete payment" onClick={() => removePayment(p)}><i className="fa-solid fa-trash" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 className="drawer-sub">Fee history</h3>
            <table className="table compact">
              <thead><tr><th>From</th><th className="r">Fee</th><th>Set by</th><th /></tr></thead>
              <tbody>
                {b.fees.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtMonth(f.from)}{f === firstFee && <div className="muted small">Billing started</div>}</td>
                    <td className="r">{f.fee > 0 ? money(f.fee) : 'Free'}</td>
                    <td className="muted small">{f.setBy ? `@${f.setBy}` : 'Automatic'} · {fmtDate(f.createdAt)}</td>
                    <td className="r">
                      {f !== firstFee && <button className="iconbtn" aria-label="Remove fee change" onClick={() => removeFee(f)}><i className="fa-solid fa-trash" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row-btns">
              <a className="btn" href={`#/users/${id}`}><i className="fa-solid fa-user" /> Open user</a>
            </div>
          </>
        )}
      </aside>

      {b && modal === 'pay' && <RecordPayment b={b} start={firstFee?.from} onClose={() => setModal(null)} onSave={(body) => run(`/users/${id}/billing/payments`, { method: 'POST', body }, 'Payment recorded')} />}
      {b && modal === 'fee' && <ChangeFee b={b} start={firstFee?.from} onClose={() => setModal(null)} onSave={(body) => run(`/users/${id}/billing/fee`, { method: 'POST', body }, 'Fee saved')} />}
      {b && modal === 'rules' && <Rules b={b} onClose={() => setModal(null)} onSave={(body) => run(`/users/${id}/billing/rules`, { method: 'PUT', body }, 'Rules saved')} />}
    </>
  );
}

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function RecordPayment({ b, start, onClose, onSave }) {
  const [f, setF] = useState({
    month: b.dueMonth || b.month,
    months: 1,
    amount: String(b.dueMonth ? b.dueAmount : b.fee || ''),
    method: 'jazzcash',
    reference: '',
    note: '',
    paidOn: todayISO(),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const several = Number(f.months) > 1;
  const waived = f.method === 'waived';
  const last = addMonth(f.month, Number(f.months) - 1);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...f, months: Number(f.months), amount: several || waived ? undefined : Number(f.amount) });
    setBusy(false);
  };

  return (
    <Modal title="Record payment" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="two">
          <label className="field">
            <span>For month</span>
            <input type="month" value={f.month} min={start} onChange={set('month')} required />
          </label>
          <label className="field">
            <span>Months</span>
            <select className="select" value={f.months} onChange={set('months')}>
              {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n === 1 ? '1 month' : `${n} months`}</option>)}
            </select>
          </label>
        </div>
        {several || waived ? (
          <p className="muted small">
            {waived ? 'Marks' : 'Pays'} {several ? `${fmtMonth(f.month)} to ${fmtMonth(last)}` : fmtMonth(f.month)} in full,
            each at its own fee. Months already paid are skipped.{waived && ' Waived months are free and not counted as money received.'}
          </p>
        ) : (
          <label className="field">
            <span>Amount received (Rs)</span>
            <input type="number" min="1" step="any" inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus />
            <small className="muted">Less than the fee is saved as part payment.</small>
          </label>
        )}
        <div className="two">
          <label className="field">
            <span>Method</span>
            <select className="select" value={f.method} onChange={set('method')}>
              {Object.entries(METHOD_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Received on</span>
            <input type="date" value={f.paidOn} max={todayISO()} onChange={set('paidOn')} required />
          </label>
        </div>
        {!waived && (
          <label className="field">
            <span>Transaction ID <small className="muted">(optional)</small></span>
            <input value={f.reference} onChange={set('reference')} maxLength={60} />
          </label>
        )}
        <label className="field">
          <span>Note <small className="muted">(optional)</small></span>
          <input value={f.note} onChange={set('note')} maxLength={255} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy}>Save payment</button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeFee({ b, start, onClose, onSave }) {
  const next = addMonth(b.month, 1);
  const [fee, setFee] = useState(String(b.nextFee?.fee ?? b.fee));
  const [when, setWhen] = useState('next'); // this | next | pick
  const [pick, setPick] = useState(addMonth(b.month, 2));
  const from = when === 'this' ? b.month : when === 'next' ? next : pick;
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave({ fee: Number(fee), from });
    setBusy(false);
  };

  return (
    <Modal title="Change monthly fee" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>New monthly fee (Rs)</span>
          <input type="number" min="0" step="any" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} required autoFocus />
          <small className="muted">0 = free.</small>
        </label>
        <div className="field">
          <span>Starting from</span>
          <label className="check"><input type="radio" checked={when === 'next'} onChange={() => setWhen('next')} /> Next month ({fmtMonth(next)})</label>
          <label className="check"><input type="radio" checked={when === 'this'} onChange={() => setWhen('this')} /> This month ({fmtMonth(b.month)})</label>
          <label className="check"><input type="radio" checked={when === 'pick'} onChange={() => setWhen('pick')} /> Another month</label>
          {when === 'pick' && <input type="month" value={pick} min={start} onChange={(e) => setPick(e.target.value)} required />}
        </div>
        <p className="muted small">
          {fmtMonth(from)} and every month after it use {Number(fee) > 0 ? money(Number(fee)) : 'no fee'}. Months before it
          keep their fee{b.nextFee && b.nextFee.month > from ? `, and the change planned for ${fmtMonth(b.nextFee.month)} is replaced` : ''}.
          The partner sees the new fee in the app.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy || fee === ''}>Save fee</button>
        </div>
      </form>
    </Modal>
  );
}

function Rules({ b, onClose, onSave }) {
  const [action, setAction] = useState(b.actionOverride || '');
  const [graceUntil, setGraceUntil] = useState(b.graceUntil || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave({ action: action || null, graceUntil: graceUntil || null });
    setBusy(false);
  };

  return (
    <Modal title="Rules for this partner" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>When unpaid after the grace days</span>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Default from billing settings</option>
            {Object.entries(ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Extra time until <small className="muted">(optional)</small></span>
          <input type="date" value={graceUntil} onChange={(e) => setGraceUntil(e.target.value)} />
          <small className="muted">Nothing is blocked before this date, e.g. when they promise to pay next week. Clear it to remove.</small>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn solid" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
