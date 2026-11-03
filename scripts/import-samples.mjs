#!/usr/bin/env node
// Load a manifest made by segmentation/make_samples.py (or pairs_to_manifest.py) into the app.
//
//   npm run import -- OUT_DIR [--storage local|supabase] [--gold-fraction 0.12] [--target-reviews 3] [--replace]
//
// --storage local     copies images to public/samples/<dataset>/ (fine for a few thousand images;
//                     they are deployed with the site)
// --storage supabase  uploads them to a public Supabase Storage bucket (SUPABASE_URL and
//                     SUPABASE_SECRET_KEY must be set; bucket from --bucket, default "samples")
// --gold-fraction     share of samples that have a known `truth` to turn into check items
// --font NAME        typeface for samples whose manifest has no `font` (statistics only)
// Pictures get opaque file names (a hash of the sample id), so a URL never reveals the dataset or font.
// Re-importing the same ids updates their text and images but never deletes answers.
// Local database: stop `npm run dev` first (the embedded database allows one process at a time).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { open } from "./dbconn.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
if (!dir) { console.error("usage: npm run import -- OUT_DIR [--storage local|supabase] [--gold-fraction 0.12]"); process.exit(1); }
const storage = opt("storage", "local");
const goldFraction = Number(opt("gold-fraction", "0"));
const target = Number(opt("target-reviews", "3"));
const bucket = opt("bucket", "samples");
const fontDefault = opt("font", null);
const recs = fs.readFileSync(path.join(dir, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
console.log(`${recs.length} samples in ${dir}`);

const SUPA = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (storage === "supabase" && (!SUPA || !SECRET)) { console.error("set SUPABASE_URL and SUPABASE_SECRET_KEY"); process.exit(1); }

async function ensureBucket() {
  const r = await fetch(`${SUPA}/storage/v1/bucket`, {
    method: "POST", headers: { authorization: `Bearer ${SECRET}`, apikey: SECRET, "content-type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (!r.ok && r.status !== 409 && !(await r.text()).includes("already exists")) throw new Error(`bucket: HTTP ${r.status}`);
}

async function place(rel, id, role) {
  if (!rel) return null;
  const src = path.join(dir, rel);
  const h = crypto.createHash("sha256").update(`${role}:${id}`).digest("hex").slice(0, 24);
  const key = `${h.slice(0, 2)}/${h}${path.extname(rel)}`;
  if (storage === "local") {
    const dst = path.join(process.cwd(), "public", "samples", key);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    return `/samples/${key}`;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${SUPA}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, apikey: SECRET, "x-upsert": "true", "content-type": rel.endsWith(".webp") ? "image/webp" : "image/png", "cache-control": "max-age=31536000" },
      body: fs.readFileSync(src),
    });
    if (r.ok) return `${SUPA}/storage/v1/object/public/${bucket}/${key}`;
    if (attempt === 3) throw new Error(`upload ${key}: HTTP ${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
}

// deterministic choice of gold items, so re-imports pick the same ones
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 2 ** 32; };

const db = await open();
await db.exec(db.schema);
if (storage === "supabase") await ensureBucket();
let n = 0, gold = 0;
for (const r of recs) {
  // manifests exported by this app already carry final URLs (image_url/context_url): use them as they are
  const image = r.image_url ?? await place(r.image, r.id, "img");
  const context = r.context_url !== undefined ? r.context_url : await place(r.context, r.id, "ctx");
  const isGold = goldFraction > 0 && typeof r.truth === "string" && r.kind !== "line" && hash(r.id) < goldFraction;
  const goldVerdict = isGold ? (r.truth === r.text ? "correct" : "incorrect") : null;
  await db.query(
    `insert into samples (id, dataset, kind, image_url, context_url, proposed_text, source_ref, is_gold, gold_verdict, gold_text, target_reviews, font)
     values ($1, $2, $3, $4, $5, $6, ($7::text)::jsonb, $8, $9, $10, $11, $12)
     on conflict (id) do update set image_url = excluded.image_url, context_url = excluded.context_url,
       proposed_text = excluded.proposed_text, source_ref = excluded.source_ref, is_gold = excluded.is_gold,
       gold_verdict = excluded.gold_verdict, gold_text = excluded.gold_text, target_reviews = excluded.target_reviews,
       font = excluded.font`,
    [r.id, r.dataset, r.kind || "word", image, context, r.text, JSON.stringify(r.source_ref || {}), isGold, goldVerdict, isGold ? r.truth : null, target, r.font || fontDefault]);
  n++; gold += isGold ? 1 : 0;
  if (n % 500 === 0) console.log(`  ${n}/${recs.length}`);
}
console.log(`imported ${n} samples (${gold} check items) into ${db.kind}, images: ${storage}`);
await db.close();
