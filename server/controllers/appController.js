import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { readApk } from "../apk.js";

// The latest build of each Android app lives in server/releases/<app>/, uploaded from the admin
// dashboard (App release page). Each folder only ever holds one APK, so older versions cannot
// be downloaded. Which app an upload belongs to is read from the APK's package name.
const RELEASES = path.join(import.meta.dirname, "../releases");
export const APPS = {
  partner: { id: "com.doodhhisaab.app", name: "Partner app", title: "Moo Partner", urdu: "مو پارٹنر" },
  admin: { id: "com.moopartner.admin", name: "Admin app", title: "MooPartner Admin", urdu: "مو پارٹنر ایڈمن" },
};
const MAX_BYTES = 200 * 1024 * 1024;

const dir = (app) => path.join(RELEASES, app);
const infoFile = (app) => path.join(dir(app), "latest.json");
const readInfo = async (app) => JSON.parse(await fs.readFile(infoFile(app), "utf8"));
// ?app= / :app from the request; the partner app is the default (its builds don't send one).
const appOf = (req) => {
  const app = req.params.app || req.query.app || "partner";
  return Object.hasOwn(APPS, app) ? app : null;
};

async function writeInfo(app, info) {
  const tmp = `${infoFile(app)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(info, null, 2) + "\n");
  await fs.rename(tmp, infoFile(app)); // swap in one step so the app never reads a half-written file
}

// --- Public (the app) ---

export async function latest(req, res) {
  const app = appOf(req);
  if (!app) return res.status(404).json({ error: "no_release" });
  try {
    const { versionCode, versionName, minVersionCode, sha256, size, notes } = await readInfo(app);
    res.set("Cache-Control", "no-store").json({ versionCode, versionName, minVersionCode, sha256, size, notes });
  } catch {
    res.status(404).json({ error: "no_release" });
  }
}

export async function download(req, res) {
  const app = appOf(req);
  if (!app) return res.status(404).json({ error: "no_release" });
  try {
    const { file } = await readInfo(app);
    res.set("Cache-Control", "no-store");
    res.download(path.join(dir(app), path.basename(file)), path.basename(file), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "no_release" });
    });
  } catch {
    res.status(404).json({ error: "no_release" });
  }
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Public download page: /download (partner app) or /download?app=admin. Share this link
// for the first install; after that the app updates itself.
export async function downloadPage(req, res) {
  const app = appOf(req);
  if (!app) return res.redirect("/download");
  const { title, urdu } = APPS[app];
  const info = await readInfo(app).catch(() => null);
  const href = `/api/app/download?app=${app}`;
  const date = info && new Date(info.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  res.set("Cache-Control", "no-store").type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Download ${esc(title)}</title>
<link rel="icon" href="/favicon.png">
<style>
  :root { --primary: #01822f; --primary-dark: #016326; --text: #021627; --muted: #687581; --line: #e2e8f0; --bg: #f4f7f5; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 17px/1.6 system-ui, sans-serif; color: var(--text); background: var(--bg); }
  main { max-width: 480px; margin: 0 auto; padding: 32px 16px 40px; }
  .card { background: #fff; border-radius: 20px; padding: 28px 20px; box-shadow: 0 1px 3px #0001; text-align: center; }
  .logo { width: 96px; height: 96px; border-radius: 22px; }
  h1 { font-size: 26px; margin: 12px 0 0; }
  .ur { direction: rtl; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif; line-height: 2.1; }
  .sub { color: var(--muted); margin: 4px 0 0; }
  .meta { color: var(--muted); font-size: 15px; margin: 14px 0 0; }
  .btn { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 22px 0 0; padding: 16px; border-radius: 14px;
    background: var(--primary); color: #fff; font-weight: 700; font-size: 19px; text-decoration: none; }
  .btn:active { background: var(--primary-dark); transform: scale(0.98); }
  .notes { text-align: start; white-space: pre-line; background: var(--bg); border-radius: 12px; padding: 12px 14px; margin: 18px 0 0; font-size: 15px; }
  .none { color: var(--muted); margin: 22px 0 0; }
  h2 { font-size: 18px; margin: 28px 0 8px; }
  ol { margin: 0; padding-inline-start: 22px; }
  li { margin: 4px 0; }
  .steps { background: #fff; border-radius: 20px; padding: 4px 20px 20px; margin-top: 16px; box-shadow: 0 1px 3px #0001; }
  .steps .ur { border-top: 1px solid var(--line); margin-top: 18px; }
  footer { text-align: center; color: var(--muted); font-size: 13px; margin-top: 24px; }
</style>
</head>
<body>
<main>
  <div class="card">
    <img class="logo" src="/icon-192.png" alt="" onerror="this.remove()">
    <h1>${esc(title)}</h1>
    <p class="sub ur">${esc(urdu)}</p>
    ${info ? `
    <p class="meta">Version ${esc(info.versionName)} · ${(info.size / 1048576).toFixed(1)} MB · ${esc(date)}</p>
    <a class="btn" href="${href}" download>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/></svg>
      Download for Android
    </a>
    ${info.notes ? `<p class="notes">${esc(info.notes)}</p>` : ""}` : `
    <p class="none">Not available yet. Please check back soon.<br><span class="ur">ابھی دستیاب نہیں، تھوڑی دیر بعد دوبارہ دیکھیں۔</span></p>`}
  </div>

  <div class="steps">
    <h2>How to install</h2>
    <ol>
      <li>Tap <b>Download for Android</b> and wait for it to finish.</li>
      <li>Open the downloaded file (from the notification or the <b>Downloads</b> folder).</li>
      <li>If Android asks, allow <b>Install unknown apps</b> for your browser, then go back.</li>
      <li>Tap <b>Install</b>. Later updates install from inside the app.</li>
    </ol>
    <div class="ur">
      <h2>انسٹال کرنے کا طریقہ</h2>
      <ol>
        <li><b>Download for Android</b> پر ٹیپ کریں اور ڈاؤن لوڈ مکمل ہونے دیں۔</li>
        <li>ڈاؤن لوڈ کی گئی فائل کھولیں (نوٹیفکیشن یا <b>Downloads</b> فولڈر سے)۔</li>
        <li>اگر فون اجازت مانگے تو براؤزر کے لیے <b>Install unknown apps</b> کی اجازت دیں، پھر واپس آئیں۔</li>
        <li><b>Install</b> پر ٹیپ کریں۔ آئندہ اپ ڈیٹ ایپ کے اندر سے ہوں گی۔</li>
      </ol>
    </div>
  </div>
  <footer>Android 6.0 or newer · <a href="/privacy.html">Privacy</a></footer>
</main>
</body>
</html>`);
}

// --- Admin dashboard ---

// Published release of every app: { partner: {...} | null, admin: {...} | null }
export async function currentRelease(req, res) {
  const out = {};
  for (const app of Object.keys(APPS)) out[app] = await readInfo(app).catch(() => null);
  res.json(out);
}

// Body: the raw APK file. Query: force=1 to block older versions, notes=<text for the app>.
// The app and version are read from the APK itself; it must be one of our apps, a release build,
// and newer than what is published for that app. On success it replaces that app's previous
// APK, which is deleted.
export async function uploadRelease(req, res) {
  await fs.mkdir(RELEASES, { recursive: true });
  const tmp = path.join(RELEASES, `upload-${crypto.randomBytes(6).toString("hex")}.tmp`);
  const hash = crypto.createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      req,
      async function* (src) {
        for await (const chunk of src) {
          size += chunk.length;
          if (size > MAX_BYTES) throw new Error("too_large");
          hash.update(chunk);
          yield chunk;
        }
      },
      createWriteStream(tmp),
    );

    const apk = await readApk(tmp);
    const app = Object.keys(APPS).find((k) => APPS[k].id === apk.packageName);
    if (!app) throw new Error("wrong_app");
    if (apk.debuggable) throw new Error("debug_build");
    const prev = await readInfo(app).catch(() => ({}));
    if (prev.versionCode >= apk.versionCode) throw new Error("not_newer");

    const force = req.query.force === "1";
    const baseMinVersionCode = prev.minVersionCode || 0;
    const file = `moo-${app}-${apk.versionName.replace(/[^\w.-]/g, "") || apk.versionCode}.apk`;
    await fs.mkdir(dir(app), { recursive: true });
    await fs.rename(tmp, path.join(dir(app), file));
    const info = {
      app,
      versionCode: apk.versionCode,
      versionName: apk.versionName,
      // Installed versions below this are blocked in the app until they update.
      minVersionCode: force ? apk.versionCode : baseMinVersionCode,
      baseMinVersionCode, // what minVersionCode goes back to if "forced" is turned off
      forced: force,
      sha256: hash.digest("hex"),
      size,
      notes: String(req.query.notes || "").slice(0, 1000),
      file,
      publishedAt: new Date().toISOString(),
      publishedBy: req.admin.username,
    };
    await writeInfo(app, info);

    // Keep only the new APK of this app.
    for (const f of await fs.readdir(dir(app))) {
      if (f !== file && f.endsWith(".apk")) await fs.rm(path.join(dir(app), f), { force: true });
    }
    res.json(info);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    const code = ["too_large", "not_apk", "wrong_app", "debug_build", "not_newer"].includes(err.message) ? err.message : "not_apk";
    res.status(code === "too_large" ? 413 : 400).json({ error: code });
  }
}

// Change "forced" or the notes of the published release without uploading again.
export async function updateRelease(req, res) {
  const app = appOf(req);
  const info = app && (await readInfo(app).catch(() => null));
  if (!info) return res.status(404).json({ error: "no_release" });
  if (typeof req.body.forced === "boolean") {
    info.forced = req.body.forced;
    info.minVersionCode = info.forced ? info.versionCode : info.baseMinVersionCode || 0;
  }
  if (typeof req.body.notes === "string") info.notes = req.body.notes.slice(0, 1000);
  await writeInfo(app, info);
  res.json(info);
}
