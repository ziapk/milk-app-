import fs from "node:fs/promises";
import zlib from "node:zlib";

// Reads package name, version and debuggable flag from an APK's AndroidManifest.xml, so an
// uploaded release can be checked without trusting what the uploader typed.
// An APK is a zip; the manifest inside is Android's binary XML format.
export async function readApk(file) {
  const fh = await fs.open(file);
  try {
    const read = async (len, pos) => {
      const b = Buffer.alloc(len);
      await fh.read(b, 0, len, pos);
      return b;
    };
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65557);
    const tail = await read(tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not_apk");

    const cd = await read(tail.readUInt32LE(eocd + 12), tail.readUInt32LE(eocd + 16));
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
      const nameLen = cd.readUInt16LE(p + 28);
      const next = p + 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
      if (cd.toString("utf8", p + 46, p + 46 + nameLen) === "AndroidManifest.xml") {
        const method = cd.readUInt16LE(p + 10);
        const localOff = cd.readUInt32LE(p + 42);
        const lh = await read(30, localOff);
        const data = await read(cd.readUInt32LE(p + 20), localOff + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28));
        if (method !== 0 && method !== 8) throw new Error("not_apk");
        return parseManifest(method === 8 ? zlib.inflateRawSync(data) : data);
      }
      p = next;
    }
    throw new Error("not_apk");
  } finally {
    await fh.close();
  }
}

function parseManifest(buf) {
  if (buf.readUInt16LE(0) !== 0x0003) throw new Error("not_apk");
  let strings = [];
  const found = {};
  for (let p = buf.readUInt16LE(2); p + 8 <= buf.length; p += buf.readUInt32LE(p + 4)) {
    const type = buf.readUInt16LE(p);
    if (type === 0x0001) strings = readStrings(buf, p);
    else if (type === 0x0102) {
      const ext = p + buf.readUInt16LE(p + 2);
      const tag = strings[buf.readUInt32LE(ext + 4)];
      if (tag === "manifest" || tag === "application") found[tag] = readAttrs(buf, ext, strings);
      if (found.manifest && found.application) break;
    }
  }
  const m = found.manifest;
  if (!m) throw new Error("not_apk");
  return {
    packageName: m.package,
    versionCode: Number(m.versionCode),
    versionName: String(m.versionName ?? ""),
    debuggable: found.application?.debuggable === true || found.application?.debuggable === -1,
  };
}

function readAttrs(buf, ext, strings) {
  const start = buf.readUInt16LE(ext + 8);
  const size = buf.readUInt16LE(ext + 10);
  const out = {};
  for (let i = 0, n = buf.readUInt16LE(ext + 12); i < n; i++) {
    const a = ext + start + i * size;
    const name = strings[buf.readUInt32LE(a + 4)];
    const raw = buf.readInt32LE(a + 8);
    const dataType = buf.readUInt8(a + 15);
    if (dataType === 0x03) out[name] = strings[buf.readUInt32LE(a + 16)];
    else if (dataType === 0x12) out[name] = buf.readInt32LE(a + 16) !== 0; // boolean
    else if (dataType >= 0x10 && dataType <= 0x1f) out[name] = buf.readInt32LE(a + 16);
    else if (raw >= 0) out[name] = strings[raw];
  }
  return out;
}

function readStrings(buf, p) {
  const count = buf.readUInt32LE(p + 8);
  const utf8 = buf.readUInt32LE(p + 16) & 0x100;
  const start = p + buf.readUInt32LE(p + 20);
  const offsets = p + buf.readUInt16LE(p + 2);
  const out = [];
  for (let i = 0; i < count; i++) {
    let o = start + buf.readUInt32LE(offsets + i * 4);
    if (utf8) {
      o += buf[o] & 0x80 ? 2 : 1; // length in characters (unused)
      let len = buf[o];
      if (len & 0x80) { len = ((len & 0x7f) << 8) | buf[o + 1]; o += 2; } else o += 1;
      out.push(buf.toString("utf8", o, o + len));
    } else {
      let len = buf.readUInt16LE(o);
      if (len & 0x8000) { len = ((len & 0x7fff) << 16) | buf.readUInt16LE(o + 2); o += 4; } else o += 2;
      out.push(buf.toString("utf16le", o, o + len * 2));
    }
  }
  return out;
}
