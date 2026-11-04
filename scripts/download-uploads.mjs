#!/usr/bin/env node
// Download uploaded page photos for segmentation.
//   SITE=https://kasdata.vercel.app ADMIN_KEY=... npm run uploads:download -- OUT_DIR [--status kept] [--mark-used]
// Writes OUT_DIR/<id>.jpg and OUT_DIR/uploads.jsonl (uploader, source, page, quality). --mark-used sets
// the downloaded photos to "used" so they are not fetched twice. Then, for photos without typed text:
//   python3 segmentation/make_samples.py OUT_DIR out/photos --dataset photos --no-text
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const out = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const site = (process.env.SITE || "https://kasdata.vercel.app").replace(/\/$/, "");
const key = process.env.ADMIN_KEY;
if (!out || !key) { console.error("usage: SITE=... ADMIN_KEY=... npm run uploads:download -- OUT_DIR [--status kept] [--mark-used]"); process.exit(1); }
const status = opt("status", "kept");
const H = { "x-admin-key": key };
const list = await (await fetch(`${site}/api/admin?view=uploads&status=${status}`, { headers: H })).json();
if (!list.rows) { console.error(list.error || list); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const meta = fs.createWriteStream(path.join(out, "uploads.jsonl"), { flags: "a" });
const done = [];
for (const r of list.rows) {
  const file = path.join(out, `upload-${r.id}.jpg`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`${site}/api/uploads/${r.id}`, { headers: H, redirect: "follow" });
    if (!res.ok) { console.error(`photo ${r.id}: HTTP ${res.status}`); continue; }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    meta.write(JSON.stringify({ file: path.basename(file), id: r.id, uploader: r.handle, code: r.code, source: r.source, page: r.page, quality: r.quality, created_at: r.created_at }) + "\n");
  }
  done.push(r.id);
}
meta.end();
console.log(`${done.length} photos in ${out}`);
if (args.includes("--mark-used") && done.length) {
  const r = await (await fetch(`${site}/api/admin`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ action: "upload_status", ids: done, status: "used" }) })).json();
  console.log(`marked ${r.updated} as used`);
}
