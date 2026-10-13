// Builds every app icon, the in-app logo and the Android splash screen from the bike logo
// (public/moopartner-bike.png). Run with: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'public/moopartner-bike.png');
const res = path.join(root, 'android/app/src/main/res');
const TILE = '#ffffff'; // icon / splash background; the green bike reads best on white

// The bike, trimmed and fitted inside a `box`-sized square (keeps its aspect ratio).
const bike = (box) =>
  sharp(source).trim().resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

// `size` square with the bike filling `fill` of it, on white; optional corner radius or circle.
async function tile(size, fill, file, { radius = 0, circle = false, transparent = false } = {}) {
  const inner = Math.round(size * fill);
  const layers = [{ input: await bike(inner), gravity: 'center' }];
  const shape = circle
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/>`
    : `<rect width="${size}" height="${size}" rx="${radius}"/>`;
  if (radius || circle) {
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape}</svg>`), blend: 'dest-in' });
  }
  const background = transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : TILE;
  await sharp({ create: { width: size, height: size, channels: 4, background } }).composite(layers).png().toFile(file);
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

// --- Android launcher icons
if (fs.existsSync(res)) {
  const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = path.join(res, `mipmap-${name}`);
    fs.mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * scale);
    const adaptive = Math.round(108 * scale);
    await tile(legacy, 0.84, path.join(dir, 'ic_launcher.png'), { radius: Math.round(legacy * 0.22) });
    await tile(legacy, 0.78, path.join(dir, 'ic_launcher_round.png'), { circle: true });
    // Adaptive icons: only the centre ~66% is always visible, so the bike sits inside that.
    await tile(adaptive, 0.56, path.join(dir, 'ic_launcher_foreground.png'), { transparent: true });
    await sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: TILE } }).png()
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

  // --- Splash screens: the bike with the MooPartner wordmark under it, centred on white,
  // at every size Capacitor created.
  const wordmark = path.join(root, 'public/moopartner-wordmark.png');
  for (const dir of fs.readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const side = Math.min(width, height);
    const mark = await sharp(await bike(Math.round(side * 0.6))).trim().toBuffer();
    const text = await sharp(wordmark).trim().resize(Math.round(side * 0.62)).toBuffer();
    const [m, w] = await Promise.all([sharp(mark).metadata(), sharp(text).metadata()]);
    const gap = Math.round(side * 0.05);
    const top = Math.round((height - m.height - gap - w.height) / 2);
    await sharp({ create: { width, height, channels: 4, background: TILE } })
      .composite([
        { input: mark, left: Math.round((width - m.width) / 2), top },
        { input: text, left: Math.round((width - w.width) / 2), top: top + m.height + gap },
      ])
      .png()
      .toFile(file);
  }
}

console.log('Icons, logo and splash screens updated from public/moopartner-bike.png');
