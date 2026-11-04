#!/usr/bin/env node
// Load pages made by segmentation/make_pages.py into the guided review.
//   npm run import:pages -- OUT_DIR [--starter]
// Images are copied to public/pages/ with hashed names. --starter adds the pages to
// data/pages/manifest.jsonl, so every deployed copy of the app loads them by itself on its next start;
// without it they go straight into the database of DATABASE_URL (or the local one).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { open } from "./dbconn.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) { console.error("usage: npm run import:pages -- OUT_DIR [--starter]"); process.exit(1); }
const recs = fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const place = (rel, id, role) => {
  const h = crypto.createHash("sha256").update(`${role}:${id}`).digest("hex").slice(0, 24);
  const out = path.join("public", "pages", `${h}${path.extname(rel)}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(dir, rel), out);
  return "/" + path.relative("public", out).replace(/\\/g, "/");
};
const withClean = (lines, id) => lines.map((l, i) => ({ ...l, chunks: l.chunks.map((c, j) => {
  const { clean, ...rest } = c;
  return clean ? { ...rest, clean_url: place(clean, `${id}:${i}:${j}`, "clean") } : rest;
}) }));
const rows = recs.map((r) => ({ id: r.id, dataset: r.dataset, font: r.font ?? null, image_url: place(r.image, r.id, "page"),
  heat_url: r.heat ? place(r.heat, r.id, "heat") : null, width: r.width, height: r.height, lines: withClean(r.lines, r.id), source_ref: r.source_ref || {} }));
if (args.includes("--starter")) {
  const f = path.join("data", "pages", "manifest.jsonl");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  // pages already in the file are replaced by the new version, others are added
  const old = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const ids = new Set(rows.map((r) => r.id));
  fs.writeFileSync(f, [...old.filter((r) => !ids.has(r.id)), ...rows].map((r) => JSON.stringify(r) + "\n").join(""));
  console.log(`${rows.length} pages added to ${f}`);
} else {
  const db = await open();
  await db.exec(db.schema);
  for (const r of rows) {
    await db.query(
      `insert into pages (id, dataset, font, image_url, heat_url, width, height, lines, source_ref)
       values ($1, $2, $3, $4, $5, $6, $7, ($8::text)::jsonb, ($9::text)::jsonb) on conflict (id) do nothing`,
      [r.id, r.dataset, r.font, r.image_url, r.heat_url, r.width, r.height, JSON.stringify(r.lines), JSON.stringify(r.source_ref)]);
  }
  console.log(`${rows.length} pages imported into ${db.kind}`);
  await db.close();
}
