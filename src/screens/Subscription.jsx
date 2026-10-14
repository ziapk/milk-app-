import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { money, useT } from '../i18n';
import Icon from '../Icon';
import { useBackClose } from '../back';
import Support from './Support';

// Monthly app fee: where the subscription stands, how to pay, and past months and payments.
// `locked` is the full screen shown instead of the app when the fee is overdue and the admin
// has "lock" on; it opens again by itself once a sync brings the payment.
export default function Subscription({ onBack, locked = false }) {
  const { data, sync, syncState, subscription: sub, logout } = useStore();
  const t = useT();
  useBackClose(() => onBack?.(), !locked);
  const [detail, setDetail] = useState(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const b = data.billing;

  const load = () => api('/billing/mine', {}, data.auth?.token).then(setDetail, () => {});
  useEffect(() => {
    load();
  }, []);

  const check = async () => {
    await sync();
    await load();
    setChecked(true);
  };

  if (supportOpen) return <Support onBack={() => setSupportOpen(false)} />;

  const amount = b?.outstanding > 0 ? b.outstanding : b?.dueAmount || 0;
  let tone = 'good';
  let icon = 'circle-check';
  let title = b?.fee > 0 ? t.subOk : t.subFreeNow;
  let help = b?.paidThrough ? t.subPaidThrough(t.fmtMonth(b.paidThrough)) : '';
  if (sub.stage === 'soon') {
    [tone, icon, title, help] = ['warn', 'bell', t.subSoon(money(b.dueAmount), t.fmtDate(b.dueFrom)), t.subSoonHelp];
  } else if (sub.stage === 'due') {
    [tone, icon, title, help] = ['warn', 'clock', t.subDue(money(amount)), t.subDaysLeft(sub.days)];
  } else if (sub.stage === 'overdue') {
    tone = 'bad';
    icon = sub.block === 'lock' ? 'lock' : 'circle-exclamation';
    title = sub.block === 'lock' ? t.subLockedTitle : t.subOverdue(money(amount));
    help = sub.block === 'lock' ? t.subLockedHelp : sub.block === 'readonly' ? t.subReadOnly : t.subOverdueHelp;
  }
  const unpaid = sub.stage !== 'ok';

  return (
    <>
      {locked ? (
        <div className="center sublogo"><img src="/logo.png" alt="" /><b>{t.appName}</b></div>
      ) : (
        <header className="datebar">
          <button className="arrow" aria-label={t.cancel} onClick={onBack}><Icon name="arrow-left" flip /></button>
          <div className="big"><Icon name="receipt" /> {t.subscription}</div>
          <button className="arrow" aria-label={t.refresh} onClick={check} disabled={syncState === 'syncing'}><Icon name="rotate" spin={syncState === 'syncing'} /></button>
        </header>
      )}

      <div className={`card substatus ${tone}`}>
        <Icon name={icon} />
        <div className="grow">
          <div className="name">{title}</div>
          {help && <div className="muted">{help}</div>}
        </div>
      </div>

      {b && (
        <div className="card subfacts">
          <div><small>{t.subMonthlyFee}</small><b>{b.fee > 0 ? `${t.rs} ${money(b.fee)}` : t.subFree}</b></div>
          {amount > 0 && sub.stage !== 'ok' && sub.stage !== 'soon' && <div><small>{t.subOutstanding}</small><b className="redtext">{t.rs} {money(amount)}</b></div>}
          {b.nextFee && <div><small>{t.subNextFee(t.fmtMonth(b.nextFee.month))}</small><b>{b.nextFee.fee > 0 ? `${t.rs} ${money(b.nextFee.fee)}` : t.subFree}</b></div>}
        </div>
      )}

      {(unpaid || b?.fee > 0 || b?.nextFee) && (
        <div className="card form">
          <div className="name"><Icon name="wallet" /> {t.subHowToPay}</div>
          <div className="payinfo" dir="auto">{b?.payInfo || t.subNoPayInfo}</div>
          <div className="muted">{t.subPayHelp}</div>
          <button className="btn primary wide" onClick={() => setSupportOpen(true)}><Icon name="headset" /> {t.support}</button>
          {unpaid && (
            <button className="btn primary solid wide" onClick={check} disabled={syncState === 'syncing'}>
              <Icon name="rotate" spin={syncState === 'syncing'} /> {t.subCheck}
            </button>
          )}
          {checked && unpaid && syncState !== 'offline' && <div className="muted center">{t.subStillDue}</div>}
          {checked && syncState === 'offline' && <div className="muted center">{t.errors.offline}</div>}
        </div>
      )}

      {detail?.months?.length > 0 && (
        <>
          <h2>{t.subMonths}</h2>
          <div className="card sublist">
            {detail.months.map((m) => (
              <div key={m.month} className="row small">
                <span className="grow">{t.fmtMonth(m.month)}</span>
                <span dir="ltr">{m.fee > 0 ? money(m.fee) : '—'}</span>
                <span className={`subpill ${m.status}`}>{t.subStatus[m.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {detail?.payments?.length > 0 && (
        <>
          <h2>{t.subPayments}</h2>
          <div className="card sublist">
            {detail.payments.map((p) => (
              <div key={p.id} className="row small">
                <span className="grow">
                  {t.fmtMonth(p.month)}
                  <small className="muted"> · {t.fmtDate(p.paidOn)} · {t.subMethods[p.method] || p.method}</small>
                </span>
                <b dir="ltr">{money(p.amount)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {locked && (
        <>
          {data.queue.length > 0 && <div className="muted center">{t.pendingSync(data.queue.length)}</div>}
          <button className="btn red wide" onClick={() => confirm(data.queue.length ? t.logoutUnsynced : t.logoutConfirm) && logout()}>
            <Icon name="right-from-bracket" flip /> {t.logout}
          </button>
        </>
      )}
    </>
  );
}

// Reminder strip above every screen while the fee is due soon, due, or overdue (without lock).
export function SubBanner({ onOpen }) {
  const { data, subscription: sub } = useStore();
  const t = useT();
  const b = data.billing;
  if (!b || sub.stage === 'ok' || sub.block === 'lock') return null;
  const amount = b.outstanding > 0 ? b.outstanding : b.dueAmount;
  const text =
    sub.stage === 'soon' ? t.subSoon(money(b.dueAmount), t.fmtDate(b.dueFrom))
      : sub.stage === 'due' ? `${t.subDue(money(amount))} ${t.subDaysLeft(sub.days)}`
        : sub.block === 'readonly' ? t.subReadOnlyShort
          : t.subOverdue(money(amount));
  return (
    <button className={`subbanner ${sub.stage === 'overdue' ? 'bad' : 'warn'}`} onClick={onOpen}>
      <Icon name={sub.stage === 'overdue' ? 'circle-exclamation' : 'bell'} />
      <span className="grow">{text}</span>
      <Icon name="chevron-right" flip />
    </button>
  );
}
