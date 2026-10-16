// Renders the Facebook page images (profile, cover, posts) with headless Chrome.
// Run: node marketing/facebook/build.mjs   → PNGs in marketing/facebook/images/
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'src');
const OUT = join(HERE, 'images');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const GREEN = '#03822f';
const DARK = '#071828';

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: var(--w); height: var(--h); overflow: hidden; }
  body { font-family: 'Avenir Next', 'Helvetica Neue', sans-serif; color: ${DARK}; position: relative; }
  .ur { font-family: 'Noto Nastaliq Urdu', serif; direction: rtl; line-height: 2; }
  .green { color: ${GREEN}; }
  .card { background: #fff; border-radius: 28px; box-shadow: 0 18px 50px rgba(7,24,40,.16); }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 120px; background: ${DARK}; color: #fff;
    display: flex; align-items: center; justify-content: space-between; padding: 0 60px; }
  .foot img { height: 62px; filter: brightness(0) invert(1); }
  .foot .cta { font-weight: 700; font-size: 30px; background: ${GREEN}; padding: 14px 30px; border-radius: 60px; }
  .bg-dots { background-color: #f3faf5; background-image: radial-gradient(#d3ecda 2.5px, transparent 2.5px); background-size: 34px 34px; }
`;

const page = (w, h, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8">
<style>:root{--w:${w}px;--h:${h}px}${css}${extra}</style></head><body>${body}</body></html>`;

const foot = (cta = 'Download Moo Partner') =>
  `<div class="foot"><img src="moopartner-wordmark.png"><div class="cta">${cta}</div></div>`;

// Post layout: Urdu headline, English line, a visual, footer.
const post = (ur, en, visual, extra = '') => page(1080, 1080, `
  <div class="bg-dots" style="position:absolute;inset:0"></div>
  <div style="position:absolute;top:50px;left:60px;right:60px;text-align:center">
    <div class="ur" style="font-size:70px;font-weight:700">${ur}</div>
    <div style="font-size:36px;font-weight:600;margin-top:4px;color:#3a4a5c">${en}</div>
  </div>
  <div style="position:absolute;top:290px;left:0;right:0;bottom:140px;display:flex;align-items:center;justify-content:center">${visual}</div>
  ${foot()}`, extra);

const row = (name, qty, state) => `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 28px;border-bottom:2px solid #eef2f0">
    <div><div style="font-size:30px;font-weight:700">${name}</div><div style="font-size:22px;color:#6b7a8a">${qty}</div></div>
    ${state === 'done'
      ? `<div style="background:${GREEN};color:#fff;font-size:24px;font-weight:700;padding:12px 26px;border-radius:40px">✓ Given</div>`
      : `<div style="border:3px solid ${GREEN};color:${GREEN};font-size:24px;font-weight:700;padding:9px 23px;border-radius:40px">Tap to mark</div>`}
  </div>`;

const feature = (icon, ur, en) => `
  <div class="card" style="padding:22px 14px 28px;text-align:center">
    <div style="font-size:54px">${icon}</div>
    <div class="ur" style="font-size:30px;line-height:1.9">${ur}</div>
    <div style="font-size:21px;font-weight:600;color:#6b7a8a">${en}</div>
  </div>`;

const deliveryCard = `
    <div class="card" style="width:720px;overflow:hidden">
      <div style="background:${GREEN};color:#fff;padding:18px 28px;font-size:28px;font-weight:700;display:flex;justify-content:space-between">
        <span>Today</span><span>3 of 4 delivered</span></div>
      ${row('Ahmed Ali', '2 L · Rs 220/L', 'done')}
      ${row('Bilal Khan', '1.5 L · Rs 220/L', 'done')}
      ${row('Fatima Bibi', '1 L · Rs 220/L', 'done')}
      ${row('Usman Shah', '3 L · Rs 210/L', 'todo')}
    </div>`;

const billChat = `
    <div style="background:#e7ddd3;border-radius:28px;padding:40px;width:720px;box-shadow:0 18px 50px rgba(7,24,40,.16)">
      <div style="background:#d9fdd3;border-radius:22px 22px 6px 22px;padding:28px 34px;margin-left:80px;font-size:28px;line-height:1.55">
        <b>Moo Partner – Bill</b><br>
        Ahmed Ali · September<br>
        Milk: 60 L × Rs 220 = <b>Rs 13,200</b><br>
        Paid: Rs 10,000<br>
        <b class="green">Due: Rs 3,200</b><br>
        <span style="color:#6b7a8a">Thank you 🙏</span>
        <div style="text-align:right;font-size:20px;color:#6b7a8a">9:41 ✓✓</div>
      </div>
    </div>`;

// Story frame, 1080×1920. Facebook covers the top ~250px (name, progress bar) and the
// bottom ~340px (reply box), so everything important sits between them.
const story = (ur, en, visual, { dark = false, step = '' } = {}) => page(1080, 1920, `
  <div class="${dark ? '' : 'bg-dots'}" style="position:absolute;inset:0;${dark ? `background:linear-gradient(170deg,${GREEN},#025a21)` : ''}"></div>
  <div style="position:absolute;top:270px;left:70px;right:70px;text-align:center;color:${dark ? '#fff' : DARK}">
    ${step ? `<div style="display:inline-block;font-size:28px;font-weight:700;padding:8px 26px;border-radius:40px;
      background:${dark ? 'rgba(255,255,255,.18)' : '#dff1e5'};color:${dark ? '#fff' : GREEN}">${step}</div>` : ''}
    <div class="ur" style="font-size:84px;font-weight:700;margin-top:10px">${ur}</div>
    <div style="font-size:40px;font-weight:600;margin-top:6px;opacity:.85">${en}</div>
  </div>
  <div style="position:absolute;top:760px;left:0;right:0;bottom:360px;display:flex;align-items:center;justify-content:center">${visual}</div>
  <img src="moopartner-wordmark.png" style="position:absolute;bottom:250px;left:50%;transform:translateX(-50%);height:70px;
    ${dark ? 'filter:brightness(0) invert(1)' : ''}">`);

const images = {
  // 720×720, shown as a circle: keep the mascot inside the middle.
  'profile-picture': page(720, 720, `
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,#ffffff 0,#ffffff 55%,#e3f4e8 100%)"></div>
    <img src="moopartner-bike.png" style="position:absolute;width:620px;left:50px;top:95px">`),

  // 1640×624. Mobile crops the sides, so text and mascot stay in the middle ~1200px.
  'cover-photo': page(1640, 624, `
    <div style="position:absolute;inset:0;background:linear-gradient(115deg,#f3faf5 0%,#f3faf5 60%,${GREEN} 60.1%,#026b27 100%)"></div>
    <div style="position:absolute;left:290px;top:80px;width:700px">
      <img src="moopartner-wordmark.png" style="width:560px">
      <div class="ur" style="font-size:52px;font-weight:700;margin-top:18px;text-align:left">دودھ کا حساب، اب آسان</div>
      <div style="font-size:25px;font-weight:600;color:#3a4a5c;margin-top:4px">Daily milk · Monthly bills · Payments<br>Works even without internet</div>
    </div>
    <img src="moopartner-bike.png" style="position:absolute;height:470px;right:290px;top:80px">`),

  'post-1-launch': post('دودھ والوں کی اپنی ایپ', 'The app made for milk sellers',
    `<img src="moopartner-bike.png" style="height:560px">`),

  'post-2-daily-delivery': post('روز کا دودھ، ایک ٹچ میں', 'Mark today\'s delivery in one tap', deliveryCard),

  'post-3-whatsapp-bill': post('مہینے کا بل، سیدھا واٹس ایپ پر', 'Send monthly bills on WhatsApp', billChat),

  'post-4-offline': post('انٹرنیٹ نہیں؟ کوئی مسئلہ نہیں', 'Works without internet, syncs when you are back online', `
    <div style="display:flex;align-items:center;gap:50px">
      <div class="card" style="width:300px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:120px">📵</div><div style="font-size:28px;font-weight:700">Saved on phone</div></div>
      <div style="font-size:90px;color:${GREEN}">➜</div>
      <div class="card" style="width:300px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:120px">☁️</div><div style="font-size:28px;font-weight:700">Backed up safe</div></div>
    </div>`),

  'post-5-voice-search': post('بول کر گاہک ڈھونڈیں', 'Find any customer by voice, in Urdu', `
    <div style="display:flex;flex-direction:column;align-items:center;gap:40px">
      <div style="width:230px;height:230px;border-radius:50%;background:${GREEN};display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 0 30px rgba(3,130,47,.15),0 0 0 60px rgba(3,130,47,.07);font-size:110px">🎙️</div>
      <div class="card" style="padding:6px 50px"><span class="ur" style="font-size:40px">"احمد علی"</span></div>
    </div>`),

  'post-6-all-in-one': post('سارا کاروبار، ایک ایپ میں', 'Everything your milk business needs', `
    <div style="display:grid;grid-template-columns:repeat(3,270px);gap:26px">
      ${feature('👥', 'گاہک', 'Customers')}
      ${feature('🥛', 'روز کا دودھ', 'Daily delivery')}
      ${feature('💰', 'وصولی', 'Payments')}
      ${feature('🧾', 'خرچے', 'Expenses')}
      ${feature('🚚', 'سپلائر', 'Suppliers')}
      ${feature('🏪', 'دکان', 'Shop sales')}
    </div>`),
  // Stories: post 1–6 in order as one sequence.
  'story-1-hook': story('ابھی بھی کاپی میں حساب؟', 'Still writing milk accounts in a notebook?',
    `<div style="font-size:340px;filter:drop-shadow(0 20px 40px rgba(0,0,0,.3))">📒</div>`, { dark: true }),

  'story-2-meet': story('ملیے مو پارٹنر سے', 'Meet Moo Partner, the app for milk sellers',
    `<img src="moopartner-bike.png" style="width:900px">`),

  'story-3-delivery': story('روز کا دودھ، ایک ٹچ میں', 'Mark today\'s delivery in one tap',
    `<div style="transform:scale(1.25)">${deliveryCard}</div>`, { step: '1 · Deliver' }),

  'story-4-bill': story('بل سیدھا واٹس ایپ پر', 'Monthly bill made for you, sent on WhatsApp',
    `<div style="transform:scale(1.25)">${billChat}</div>`, { step: '2 · Bill' }),

  'story-5-features': story('اور بھی بہت کچھ', 'And a lot more', `
    <div style="display:grid;grid-template-columns:repeat(2,300px);gap:24px;zoom:1.55">
      ${feature('📶', 'بغیر انٹرنیٹ', 'Works offline')}
      ${feature('🎙️', 'بول کر تلاش', 'Voice search')}
      ${feature('🧾', 'خرچے اور بچت', 'Expenses & savings')}
      ${feature('🚚', 'سپلائر کھاتہ', 'Supplier accounts')}
    </div>`, { step: '3 · Grow' }),

  'story-6-download': story('آج ہی ڈاؤن لوڈ کریں', 'Download Moo Partner today', `
    <div style="display:flex;flex-direction:column;align-items:center;gap:40px;color:#fff;text-align:center">
      <img src="moopartner-bike.png" style="width:640px">
      <div style="font-size:44px;font-weight:700;background:#fff;color:${GREEN};padding:22px 50px;border-radius:70px">
        Tap the link below 👇</div>
    </div>`, { dark: true }),
};

for (const [name, html] of Object.entries(images)) {
  const file = join(SRC, `${name}.html`);
  writeFileSync(file, html);
  const [w, h] = html.match(/--w:(\d+)px;--h:(\d+)px/).slice(1);
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, `--screenshot=${join(OUT, `${name}.png`)}`, `file://${file}`], { stdio: 'ignore' });
  console.log(`${name}.png  ${w}×${h}`);
}
