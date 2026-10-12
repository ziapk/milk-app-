import { useEffect, useState } from 'react';
import { useStore, today } from '../store';
import { useT } from '../i18n';
import { drawReport } from '../bill';
import ImagePreview from './ImagePreview';
import Icon from '../Icon';
import { shiftMonth } from './CustomerDetail';

// All customers' milk, bill, payments and dues for one month, as a shareable image.
export default function MonthlyReport({ onClose }) {
  const { data, billed, paid } = useStore();
  const t = useT();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [canvas, setCanvas] = useState(null);

  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
  const monthName = new Date(month + '-01T00:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  useEffect(() => {
    const from = month + '-01';
    const to = month + '-31';
    const rows = [];
    for (const c of [...data.customers].sort((a, b) => a.name.localeCompare(b.name))) {
      const b = billed(c.id, from, to);
      const p = paid(c.id, from, to);
      // Due as it stood at the end of this month, not today.
      const due = Math.max(0, billed(c.id, '', to).amount - paid(c.id, '', to));
      if (b.liters === 0 && p === 0 && Math.round(due) === 0) continue;
      rows.push({ name: c.name, liters: b.liters, amount: b.amount, paid: p, due });
    }
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    let live = true;
    drawReport({
      t,
      lang: data.lang,
      seller: data.auth,
      monthName,
      rows,
      totals: { liters: sum('liters'), amount: sum('amount'), paid: sum('paid'), due: sum('due') },
    }).then((c) => live && setCanvas(c));
    return () => {
      live = false;
    };
  }, [month, data, billed, paid, t, monthName]);

  if (!canvas) return null;

  return (
    <ImagePreview
      canvas={canvas}
      fileName={`report-${month}.png`}
      title={`${t.monthlyReport} · ${monthName}`}
      onClose={onClose}
      header={
        <header className="datebar preview-head">
          <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron-left" flip /></button>
          <div className="big">{monthName}</div>
          <button className="arrow" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>
            <Icon name="chevron-right" flip />
          </button>
        </header>
      }
    />
  );
}
