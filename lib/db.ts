// One query function for two back ends:
//   DATABASE_URL set  -> real Postgres (Supabase) through the `postgres` driver
//   otherwise         -> PGlite, an embedded Postgres: .data/pglite locally; on Vercel a temporary
//                        copy in /tmp ("preview mode": the site works, but answers are not kept)
// Both run db/schema.sql, so the SQL is identical everywhere. On first start the tables are created
// if missing, and the demo pictures are loaded if there are no pictures at all, so a fresh deploy
// works without any manual step.
import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
export type Query = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

const g = globalThis as unknown as { __ksdb?: Promise<Query> };
export const isPreview = () => !process.env.DATABASE_URL && !!process.env.VERCEL;
const file = (rel: string) => path.join(process.cwd(), rel);

async function connect(): Promise<Query> {
  const schema = fs.readFileSync(file("db/schema.sql"), "utf8");
  const url = process.env.DATABASE_URL;
  let query: Query;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false is required by Supabase's transaction pooler (port 6543), the right choice for serverless.
    const sql = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_SIZE || 3), idle_timeout: 20, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require", onnotice: () => {} });
    query = (async (text, params = []) => (await sql.unsafe(text, params as any[])) as any) as Query;
    const [{ ok }] = await query<{ ok: boolean }>(
      "select to_regclass('public.sample_consensus') is not null and exists (select 1 from information_schema.columns where table_name = 'samples' and column_name = 'font') as ok");
    if (!ok || process.env.AUTO_MIGRATE === "1") await sql.unsafe(schema);
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR || (process.env.VERCEL ? "/tmp/pglite" : file(".data/pglite"));
    fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.exec(schema);
    query = (async (text, params = []) => (await db.query(text, params as any[])).rows as any) as Query;
  }
  await seedIfEmpty(query);
  return query;
}

// Same choice of check items as scripts/import-samples.mjs (FNV hash of the id, 15%).
const fnv = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 2 ** 32; };

async function seedIfEmpty(query: Query) {
  if (process.env.SEED_DEMO === "0") return;
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from samples");
  if (n > 0) return;
  const p = file("data/demo/manifest.jsonl");
  if (!fs.existsSync(p)) return;
  const recs = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const r of recs) {
    const gold = typeof r.truth === "string" && r.kind !== "line" && fnv(r.id) < 0.15;
    await query(
      `insert into samples (id, dataset, kind, font, image_url, context_url, proposed_text, source_ref, is_gold, gold_verdict, gold_text)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) on conflict (id) do nothing`,
      [r.id, r.dataset, r.kind || "word", r.font ?? null, r.image_url, r.context_url ?? null, r.text, JSON.stringify(r.source_ref || {}),
       gold, gold ? (r.truth === r.text ? "correct" : "incorrect") : null, gold ? r.truth : null]);
  }
}

export function db(): Promise<Query> {
  if (!g.__ksdb) g.__ksdb = connect().catch((e) => { g.__ksdb = undefined; throw e; });
  return g.__ksdb;
}

export async function q<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]> {
  return (await db())<T>(text, params);
}
