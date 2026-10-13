import { useEffect, useState } from 'react';
import { useStore, today } from '../store';
import { useT, money } from '../i18n';
import { drawBill } from '../bill';
import ImagePreview from './ImagePreview';
import Icon from '../Icon';
import { useProducts } from '../products';

export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// 03001234567 -> 923001234567 for wa.me links (Pakistan numbers)
const waNumber = (p = '') => {
  const d = p.replace(/\D/g, '');
  return d.startsWith('0') ? '92' + d.slice(1) : d;
};

// Month switcher shown above report/bill previews.
export function MonthBar({ month, onChange, label }) {
  return (
    <header className="datebar preview-head">
      <button className="arrow" onClick={() => onChange(shiftMonth(month, -1))}><Icon name="chevron-left" flip /></button>
      <div className="big">{label}</div>
      <button className="arrow" disabled={month >= today().slice(0, 7)} onClick={() => onChange(shiftMonth(month, 1))}>
        <Icon name="chevron-right" flip />
      </button>
    </header>
  );
}

// One customer's monthly bill as an image, with month switching, share and WhatsApp text.
export default function CustomerBill({ id, initialMonth, onClose }) {
  const { data, billed, paid, salesOwed, customerById } = useStore();
  const { main, byId } = useProducts();
  const t = useT();
  const c = customerById(id);
  const [month, setMonth] = useState(initialMonth || today().slice(0, 7));
  const [canvas, setCanvas] = useState(null);

  const locale = data.lang === 'ur' ? 'ur-PK' : 'en-PK';
  const monthName = new Date(month + '-01T00:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const from = month + '-01';
  const to = month + '-31';
  const delivered = billed(id, from, to);
  // Shop purchases put on the customer's account count as part of the bill.
  const m = { liters: delivered.liters, amount: delivered.amount + salesOwed(id, from, to) };
  const mPaid = paid(id, from, to);
  // Due as it stood at the end of this month (same as the monthly report).
  const due = billed(id, '', to).amount + salesOwed(id, '', to) - paid(id, '', to);

  useEffect(() => {
    if (!c) return;
    const short = (d) => new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const days = Object.keys(data.deliveries).filter((d) => d >= from && d <= to && data.deliveries[d][id]);
    const credit = data.sales.filter((s) => s.customerId === id && s.date >= from && s.date <= to && s.total - s.paid > 0.5);
    const rows = [];
    for (const d of [...new Set([...days, ...credit.map((s) => s.date)])].sort()) {
      const v = data.deliveries[d]?.[id];
      if (v) {
        const extras = Object.entries(v.x || {}).filter(([, e]) => e.qty > 0);
        // A day with only extra products doesn't need an empty main-product line.
        if (v.qty > 0 || extras.length === 0) rows.push({ label: short(d), qty: v.qty, rate: v.rate });
        for (const [pid, e] of extras) {
          const p = byId(pid);
          rows.push({ label: `${short(d)} · ${p?.name || '?'}`, qty: e.qty, rate: e.rate, unit: p?.unit });
        }
      }
      for (const s of credit.filter((x) => x.date === d))
        rows.push({
          label: `${short(d)} · ${t.shopSale}`,
          text: s.items.map((i) => `${i.qty} ${i.name}`).join(', '),
          amount: s.total - s.paid,
        });
    }
    let live = true;
    drawBill({
      t,
      lang: data.lang,
      font: data.urduFont,
      seller: data.auth,
      customer: c,
      monthName,
      rows,
      totals: { liters: m.liters, amount: m.amount, paid: mPaid, due },
      main,
    }).then((cv) => live && setCanvas(cv));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, data]);

  if (!c || !canvas) return null;

  const sendText = () => {
    const text = t.billText(c.name, monthName, `${m.liters} ${main.unit} ${main.name}`, money(m.amount), money(Math.max(0, due)));
    window.open(`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(text)}`);
  };

  return (
    <ImagePreview
      canvas={canvas}
      fileName={`bill-${month}-${c.id}.png`}
      title={`${c.name} · ${monthName}`}
      onClose={onClose}
      header={<MonthBar month={month} onChange={setMonth} label={monthName} />}
    >
      {c.phone && <button className="btn wa" onClick={sendText}><Icon name="whatsapp" brand /> {t.sendText}</button>}
    </ImagePreview>
  );
}
