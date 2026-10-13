// Builds every app icon, the in-app logo and the Android splash screens from the bike logo
// (public/moopartner-bike.png), for the main app and the admin app. Run with: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'public/moopartner-bike.png');
const wordmark = path.join(root, 'public/moopartner-wordmark.png');
const NONE = { r: 0, g: 0, b: 0, alpha: 0 };

// The two apps share the artwork. The admin icon gets a mint tile and a navy "ADMIN" label
// so it can't be mistaken for the distributor app on a home screen.
const APPS = [
  { res: path.join(root, 'android/app/src/main/res'), tile: '#ffffff' },
  { res: path.join(root, 'admin-app/android/app/src/main/res'), tile: '#e4f3e9', label: 'ADMIN' },
];

// The bike, trimmed and fitted inside a w x h box (keeps its aspect ratio).
const bike = (w, h = w) =>
  sharp(source).trim().resize(Math.round(w), Math.round(h), { fit: 'contain', background: NONE }).png().toBuffer();

const pill = (w, h, text) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" rx="${h / 2}" fill="#021627"/>
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff"
      font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${h * 0.62}" letter-spacing="${h * 0.06}">${text}</text>
  </svg>`);

// The artwork for a `size` square: the bike filling `fill` of it, with the label under it if any.
async function mark(size, fill, label) {
  const box = Math.round(size * fill);
  const offset = Math.round((size - box) / 2);
  if (!label) return [{ input: await bike(box), left: offset, top: offset }];
  const pillH = Math.max(6, Math.round(box * 0.2));
  const pillW = Math.round(box * 0.78);
  const bikeH = Math.round(box * 0.74);
  const art = await sharp(await bike(box, bikeH)).trim().toBuffer();
  const { width: aw, height: ah } = await sharp(art).metadata();
  const gap = Math.round(box * 0.05);
  const top = Math.round((size - ah - gap - pillH) / 2);
  return [
    { input: art, left: Math.round((size - aw) / 2), top },
    { input: pill(pillW, pillH, label), left: Math.round((size - pillW) / 2), top: top + ah + gap },
  ];
}

// `size` square icon on `bg`; optional corner radius or circle.
async function tile(size, fill, file, { bg = '#ffffff', label, radius = 0, circle = false, transparent = false } = {}) {
  const layers = await mark(size, fill, label);
  const shape = circle
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/>`
    : `<rect width="${size}" height="${size}" rx="${radius}"/>`;
  if (radius || circle) {
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape}</svg>`), blend: 'dest-in' });
  }
  await sharp({ create: { width: size, height: size, channels: 4, background: transparent ? NONE : bg } })
    .composite(layers).png().toFile(file);
}

// --- In-app logo (login screen, header): a lighter copy of the bike
await sharp(source).trim().resize(480).png({ compressionLevel: 9, palette: true, quality: 90 })
  .toFile(path.join(root, 'public/logo.png'));

// --- Web / PWA
await tile(192, 0.86, path.join(root, 'public/icon-192.png'), { radius: 42 });
await tile(512, 0.86, path.join(root, 'public/icon-512.png'), { radius: 112 });
await tile(512, 0.7, path.join(root, 'public/icon-maskable-512.png')); // OS crops to its own shape
await tile(180, 0.86, path.join(root, 'public/apple-touch-icon.png'));
await tile(64, 0.92, path.join(root, 'public/favicon.png'), { transparent: true });

// --- Android launcher icons and splash screens, for each app whose android/ project exists
for (const app of APPS.filter((a) => fs.existsSync(a.res))) {
  const { res, tile: bg, label } = app;
  const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = path.join(res, `mipmap-${name}`);
    fs.mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * scale);
    const adaptive = Math.round(108 * scale);
    await tile(legacy, 0.84, path.join(dir, 'ic_launcher.png'), { bg, label, radius: Math.round(legacy * 0.22) });
    await tile(legacy, 0.78, path.join(dir, 'ic_launcher_round.png'), { bg, label, circle: true });
    // Adaptive icons: only the centre ~66% is always visible, so the artwork sits inside that.
    await tile(adaptive, label ? 0.5 : 0.56, path.join(dir, 'ic_launcher_foreground.png'), { label, transparent: true });
    await sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: bg } }).png()
      .toFile(path.join(dir, 'ic_launcher_background.png'));
  }

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptiveXml);
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptiveXml);

  // Splash screens: the bike with the MooPartner wordmark (and the label) under it, centred on
  // white, at every size Capacitor created.
  for (const dir of fs.readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const side = Math.min(width, height);
    const parts = [
      await sharp(await bike(side * 0.6)).trim().toBuffer(),
      await sharp(wordmark).trim().resize(Math.round(side * 0.62)).toBuffer(),
    ];
    if (label) parts.push(pill(Math.round(side * 0.3), Math.round(side * 0.075), label));
    const sizes = await Promise.all(parts.map((p) => sharp(p).metadata()));
    const gap = Math.round(side * 0.05);
    let top = Math.round((height - sizes.reduce((s, m) => s + m.height, 0) - gap * (parts.length - 1)) / 2);
    const layers = parts.map((input, i) => {
      const layer = { input, left: Math.round((width - sizes[i].width) / 2), top };
      top += sizes[i].height + gap;
      return layer;
    });
    await sharp({ create: { width, height, channels: 4, background: '#ffffff' } }).composite(layers).png().toFile(file);
  }
}

console.log('Icons, logo and splash screens updated from public/moopartner-bike.png');
