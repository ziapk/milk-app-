// Builds every app icon and the Android splash screen from the main logo (public/icon.svg).
// Run with: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const logo = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8');
const res = path.join(root, 'android/app/src/main/res');

const png = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(file);

// Full-bleed version (no rounded corners) for places where the OS applies its own shape.
const square = logo.replace('rx="112"', 'rx="0"');

// Android adaptive icons are two layers, and only the centre ~2/3 is always visible.
// Background: sky + milk wave edge to edge. Foreground: sun, drop, bike and cans, scaled into the safe zone.
const waves = logo.match(/<path d="M0 4[^"]*"[^>]*\/>/g);
const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${logo.match(/<defs>[\s\S]*?<\/defs>/)[0]}
  <rect width="512" height="512" fill="url(#sky)"/>
  <g transform="translate(0 -36)">${waves.join('').replaceAll('V512 H0', 'V560 H0')}</g>
</svg>`;
let foreground = square.replace('<rect width="512" height="512" fill="url(#sky)"/>', '');
for (const w of waves) foreground = foreground.replace(w, '');
foreground = foreground
  .replace('</defs>', '</defs><g transform="translate(256 256) scale(0.68) translate(-256 -256)">')
  .replace(/<\/svg>\s*$/, '</g></svg>');

const round = square.replace('</defs>', '<clipPath id="round"><circle cx="256" cy="256" r="256"/></clipPath></defs><g clip-path="url(#round)">')
  .replace(/<\/svg>\s*$/, '</g></svg>');

// --- Web / PWA
await png(logo, 192, path.join(root, 'public/icon-192.png'));
await png(logo, 512, path.join(root, 'public/icon-512.png'));
await png(square, 512, path.join(root, 'public/icon-maskable-512.png'));
await png(square, 180, path.join(root, 'public/apple-touch-icon.png'));

// --- Android launcher icons
if (fs.existsSync(res)) {
  const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = path.join(res, `mipmap-${name}`);
    fs.mkdirSync(dir, { recursive: true });
    await png(logo, Math.round(48 * scale), path.join(dir, 'ic_launcher.png'));
    await png(round, Math.round(48 * scale), path.join(dir, 'ic_launcher_round.png'));
    await png(foreground, Math.round(108 * scale), path.join(dir, 'ic_launcher_foreground.png'));
    await png(background, Math.round(108 * scale), path.join(dir, 'ic_launcher_background.png'));
  }

  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);

  // --- Splash screens: the logo centred on the brand blue, at every size Capacitor created.
  for (const dir of fs.readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const size = Math.round(Math.min(width, height) * 0.38);
    const mark = await sharp(Buffer.from(logo), { density: 600 }).resize(size, size).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: '#1e6fd9' } })
      .composite([{ input: mark, gravity: 'center' }])
      .png()
      .toFile(file);
  }
}

console.log('Icons and splash screens updated from public/icon.svg');
