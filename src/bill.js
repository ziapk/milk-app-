import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { money } from './i18n';

const W = 1080;
const PAD = 64;
const ROW = 56;

// Draws a customer's monthly bill as a PNG-ready canvas. Mirrors the layout for Urdu.
export async function drawBill({ t, lang, seller, customer, monthName, rows, totals }) {
  const rtl = lang === 'ur';
  const family = rtl ? '"Noto Nastaliq Urdu", "Noto Naskh Arabic", sans-serif' : 'system-ui, -apple-system, Roboto, sans-serif';
  await document.fonts?.ready;

  const headH = 330;
  const tableH = ROW * (rows.length + 1) + 24;
  const footH = 4 * 64 + 140;
  const H = headH + tableH + footH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';

  // x is measured from the reading start (left in English, right in Urdu).
  const text = (s, x, y, { size = 32, weight = 400, color = '#1b2430', align = 'start' } = {}) => {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(String(s), rtl ? W - x : x, y);
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

  text(customer.name, PAD, 215, { size: 44, weight: 800 });
  text(`${t.bill} · ${monthName}`, PAD, 275, { size: 30, color: '#6b7686' });

  // Columns: date, liters, rate, amount (amount aligned to the far edge).
  const cols = [PAD, PAD + 300, PAD + 520, W - PAD];
  let y = headH + ROW / 2;
  ctx.fillStyle = '#f1f4f8';
  ctx.fillRect(PAD, headH, W - PAD * 2, ROW);
  const head = { size: 26, weight: 700, color: '#6b7686' };
  text(t.date, cols[0] + 16, y, head);
  text(t.liters, cols[1], y, head);
  text(t.rateShort, cols[2], y, head);
  text(t.amount, cols[3] - 16, y, { ...head, align: 'end' });

  for (const r of rows) {
    y += ROW;
    const skipped = r.qty === 0;
    const c = skipped ? '#d93b3b' : '#1b2430';
    text(r.label, cols[0] + 16, y, { size: 28, color: c });
    text(skipped ? '—' : r.qty, cols[1], y, { size: 28, weight: 700, color: c });
    text(skipped ? '' : money(r.rate), cols[2], y, { size: 28, color: '#6b7686' });
    text(skipped ? '' : money(r.qty * r.rate), cols[3] - 16, y, { size: 28, weight: 700, align: 'end' });
    line(y + ROW / 2 - 1);
  }

  y = headH + tableH + 40;
  const sum = (label, value, opts = {}) => {
    text(label, PAD, y, { size: 32, color: '#6b7686' });
    text(value, W - PAD, y, { size: 34, weight: 800, align: 'end', ...opts });
    y += 64;
  };
  sum(t.totalMilk, `${totals.liters} ${t.liters}`);
  sum(t.bill, `${t.rs} ${money(totals.amount)}`);
  sum(t.paidMonth, `${t.rs} ${money(totals.paid)}`, { color: '#1a9e55' });
  line(y - 34, '#1b2430');
  sum(totals.due >= 0 ? t.totalDue : t.advance, `${t.rs} ${money(Math.abs(totals.due))}`, {
    size: 44,
    color: totals.due > 0 ? '#d93b3b' : '#1a9e55',
  });
  text(t.thanks, W / 2, H - 50, { size: 28, color: '#6b7686', align: 'center' });

  return canvas;
}

// Opens the phone's share sheet (WhatsApp, etc.) with the bill image; on desktop it downloads.
export async function shareBill(canvas, fileName, title) {
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
