import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { money } from './i18n';
import { fontStack, loadFont } from './fonts';

const W = 1080;
const PAD = 64;
const ROW = 56;

// Draws a shareable sheet: coloured header, a table, then totals. Mirrors the layout for Urdu.
// columns: [{ label, x, align?, width? }] with x measured from the reading start.
// rows:    [{ cells: [..], color? }]   totals: [{ label, value, color?, big? }]
async function drawSheet({ t, lang, font, seller, title, subtitle, columns, rows, totals }) {
  const rtl = lang === 'ur';
  const family = rtl ? fontStack(font) : 'system-ui, -apple-system, Roboto, sans-serif';
  if (rtl) await loadFont(font);

  const headH = 330;
  const tableH = ROW * (rows.length + 1) + 24;
  const footH = totals.length * 64 + 140;
  const H = headH + tableH + footH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';

  const fit = (s, width) => {
    s = String(s);
    if (!width || ctx.measureText(s).width <= width) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > width) s = s.slice(0, -1);
    return s + '…';
  };
  const text = (s, x, y, { size = 32, weight = 400, color = '#1b2430', align = 'start', width } = {}) => {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(fit(s, width), rtl ? W - x : x, y);
  };
  const line = (y, color = '#e2e8f0') => {
    ctx.fillStyle = color;
    ctx.fillRect(PAD, y, W - PAD * 2, 2);
  };

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e6fd9';
  ctx.fillRect(0, 0, W, 150);
  text(t.appName, PAD, 60, { size: 48, weight: 800, color: '#fff' });
  text(`${seller.name}  ·  ${seller.phone}`, PAD, 112, { size: 28, color: '#dbe8fb' });
  text(title, PAD, 215, { size: 44, weight: 800, width: W - PAD * 2 });
  text(subtitle, PAD, 275, { size: 30, color: '#6b7686' });

  let y = headH + ROW / 2;
  ctx.fillStyle = '#f1f4f8';
  ctx.fillRect(PAD, headH, W - PAD * 2, ROW);
  for (const c of columns) text(c.label, c.x, y, { size: 26, weight: 700, color: '#6b7686', align: c.align, width: c.width });

  for (const r of rows) {
    y += ROW;
    r.cells.forEach((cell, i) => {
      const c = columns[i];
      text(cell, c.x, y, { size: 28, weight: c.bold ? 700 : 400, color: r.color || c.color || '#1b2430', align: c.align, width: c.width });
    });
    line(y + ROW / 2 - 1);
  }

  y = headH + tableH + 40;
  totals.forEach((s, i) => {
    if (s.big && i > 0) line(y - 34, '#1b2430');
    text(s.label, PAD, y, { size: 32, color: '#6b7686' });
    text(s.value, W - PAD, y, { size: s.big ? 44 : 34, weight: 800, align: 'end', color: s.color || '#1b2430' });
    y += 64;
  });
  text(t.thanks, W / 2, H - 50, { size: 28, color: '#6b7686', align: 'center' });
  return canvas;
}

// rows: [{ label, qty, rate }] — one per day the customer was marked.
export function drawBill({ t, lang, font, seller, customer, monthName, rows, totals }) {
  const skip = '#d93b3b';
  return drawSheet({
    t, lang, font, seller,
    title: customer.name,
    subtitle: `${t.bill} · ${monthName}`,
    columns: [
      { label: t.date, x: PAD + 16 },
      { label: t.liters, x: PAD + 300, bold: true },
      { label: t.rateShort, x: PAD + 520, color: '#6b7686' },
      { label: t.amount, x: W - PAD - 16, align: 'end', bold: true },
    ],
    rows: rows.map((r) =>
      r.qty === 0
        ? { cells: [r.label, '—', '', ''], color: skip }
        : { cells: [r.label, r.qty, money(r.rate), money(r.qty * r.rate)] },
    ),
    totals: [
      { label: t.totalMilk, value: `${totals.liters} ${t.liters}` },
      { label: t.bill, value: `${t.rs} ${money(totals.amount)}` },
      { label: t.paidMonth, value: `${t.rs} ${money(totals.paid)}`, color: '#1a9e55' },
      {
        label: totals.due >= 0 ? t.totalDue : t.advance,
        value: `${t.rs} ${money(Math.abs(totals.due))}`,
        color: totals.due > 0 ? skip : '#1a9e55',
        big: true,
      },
    ],
  });
}

// rows: [{ label, category, note, amount }]
export function drawExpenses({ t, lang, font, seller, monthName, rows, total }) {
  return drawSheet({
    t, lang, font, seller,
    title: t.expenses,
    subtitle: monthName,
    columns: [
      { label: t.date, x: PAD + 16 },
      { label: t.category, x: PAD + 200, width: 220 },
      { label: t.noteShort, x: PAD + 440, width: 280, color: '#6b7686' },
      { label: t.amount, x: W - PAD - 16, align: 'end', bold: true },
    ],
    rows: rows.map((r) => ({ cells: [r.label, r.category, r.note, money(r.amount)] })),
    totals: [{ label: t.spentMonth, value: `${t.rs} ${money(total)}`, color: '#d93b3b', big: true }],
  });
}

// rows: [{ name, liters, amount, paid, due }] — one per customer active that month.
export function drawReport({ t, lang, font, seller, monthName, rows, totals }) {
  const red = '#d93b3b';
  const green = '#1a9e55';
  return drawSheet({
    t, lang, font, seller,
    title: t.monthlyReport,
    subtitle: `${monthName} · ${rows.length} ${t.customers}`,
    columns: [
      { label: t.name, x: PAD + 16, width: 300 },
      { label: t.liters, x: PAD + 340, bold: true },
      { label: t.bill, x: PAD + 470 },
      { label: t.paidShort, x: PAD + 640, color: green },
      { label: t.due, x: W - PAD - 16, align: 'end', bold: true },
    ],
    rows: rows.map((r) => ({
      cells: [r.name, r.liters, money(r.amount), money(r.paid), money(r.due)],
    })),
    totals: [
      { label: t.totalMilk, value: `${totals.liters} ${t.liters}` },
      { label: t.bill, value: `${t.rs} ${money(totals.amount)}` },
      { label: t.collectedMonth, value: `${t.rs} ${money(totals.paid)}`, color: green },
      { label: t.totalDue, value: `${t.rs} ${money(totals.due)}`, color: totals.due > 0 ? red : green, big: true },
    ],
  });
}

// Opens the phone's share sheet (WhatsApp, etc.) with the image; on desktop it downloads.
export async function shareImage(canvas, fileName, title) {
  const dataUrl = canvas.toDataURL('image/png');
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: fileName, data: dataUrl.split(',')[1], directory: Directory.Cache });
    await Share.share({ title, files: [uri] });
    return;
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}
