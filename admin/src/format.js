// MySQL returns "YYYY-MM-DD HH:MM:SS" strings (server time); parse them as local time.
export const toDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);

export const fmtDate = (s) =>
  s ? toDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtShortDay = (s) => toDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function ago(s) {
  if (!s) return 'Never';
  const mins = Math.round((Date.now() - toDate(s)) / 60000);
  if (mins < 60) return 'Within the hour';
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return days < 45 ? `${days} day${days === 1 ? '' : 's'} ago` : fmtDate(s);
}

export const isRecent = (s, days = 7) => !!s && Date.now() - toDate(s) < days * 864e5;

export const num = (n, digits = 0) =>
  Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: digits });

export const money = (n) => `Rs ${num(Math.round(n))}`;

// 1,234 -> 1.2K for chart ticks
export const compact = (n) => (n >= 1000 ? `${num(n / 1000, 1)}K` : num(n, 1));

// '2026-11' -> 'Nov 2026'
export const fmtMonth = (m) =>
  m ? new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';

// '2026-11' + 2 -> '2027-01'
export const addMonth = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + mo - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
