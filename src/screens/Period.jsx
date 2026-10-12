import { useState } from 'react';
import { useStore, today, addDays } from '../store';
import { useT } from '../i18n';
import Icon from '../Icon';
import { shiftMonth } from './CustomerBill';

// Day / Month / All-time filter shared by Payments and Expenses. Day and Month can be stepped back.
export function usePeriod() {
  const { data } = useStore();
  const t = useT();
  const [kind, setKind] = useState('day');
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));

  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
  const fmt = (iso, opts) => new Date(iso + 'T00:00:00').toLocaleDateString(locale, opts);
  const dayLabel = day === today() ? t.today : fmt(day, { weekday: 'short', day: 'numeric', month: 'long' });
  const monthLabel = fmt(month + '-01', { month: 'long', year: 'numeric' });

  return {
    kind, setKind, day, setDay, month, setMonth,
    match: (date) => (kind === 'day' ? date === day : kind === 'month' ? date.startsWith(month) : true),
    label: kind === 'day' ? dayLabel : kind === 'month' ? monthLabel : t.payFilter.all,
    key: kind === 'day' ? day : kind === 'month' ? month : 'all',
    dayChip: day === today() ? t.payFilter.today : fmt(day, { day: 'numeric', month: 'short' }),
  };
}

export function PeriodBar({ period }) {
  const t = useT();
  const { kind, setKind, day, setDay, month, setMonth, label, dayChip } = period;
  const atEnd = kind === 'day' ? day >= today() : month >= today().slice(0, 7);
  const step = (n) => (kind === 'day' ? setDay(addDays(day, n)) : setMonth(shiftMonth(month, n)));

  return (
    <>
      <div className="segments">
        {['day', 'month', 'all'].map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k === 'day' ? dayChip : k === 'month' ? t.payFilter.month : t.payFilter.all}
          </button>
        ))}
      </div>
      {kind !== 'all' && (
        <header className="datebar">
          <button className="arrow" onClick={() => step(-1)}><Icon name="chevron-left" flip /></button>
          <div className="big">{label}</div>
          <button className="arrow" disabled={atEnd} onClick={() => step(1)}><Icon name="chevron-right" flip /></button>
        </header>
      )}
    </>
  );
}
