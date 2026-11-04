// One query function for two back ends:
//   DATABASE_URL set  -> real Postgres (Supabase) through the `postgres` driver
//   otherwise         -> PGlite, an embedded Postgres: .data/pglite locally; on Vercel a temporary
//                        copy in /tmp ("preview mode": the site works, but answers are not kept)
// Both run db/schema.sql, so the SQL is identical everywhere. On first start the tables are created
// if missing, and the demo pictures are loaded if there are no pictures at all, so a fresh deploy
// works without any manual step.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
export type Query = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

const g = globalThis as unknown as { __ksdb?: Promise<Query> };
// DATABASE_URL (set by hand, or by Vercel's Neon storage) or POSTGRES_URL (Vercel's Supabase/Neon
// integrations). Extra URL options those integrations add (sslmode, pgbouncer, supa...) are removed:
// the driver below sets SSL itself and some of them are not valid Postgres settings.
// Any other variable holding a postgres:// address is used too (Vercel's storage integrations name them
// after the chosen prefix, e.g. STORAGE_URL), preferring pooled connections.
export function databaseSource(): string | null {
  for (const k of ["DATABASE_URL", "POSTGRES_URL", "STORAGE_URL"]) if (process.env[k]) return k;
  const found = Object.keys(process.env)
    .filter((k) => /^postgres(ql)?:\/\//.test(process.env[k] || ""))
    .sort((a, b) => Number(/UNPOOLED|NON_POOLING|DIRECT/.test(a)) - Number(/UNPOOLED|NON_POOLING|DIRECT/.test(b)) || a.length - b.length);
  return found[0] ?? null;
}
export function databaseUrl(): string | null {
  const k = databaseSource();
  const raw = k ? process.env[k] : undefined;
  if (!raw) return null;
  try { const u = new URL(raw); u.search = ""; return u.toString(); } catch { return raw; }
}
export const isPreview = () => !databaseUrl() && !!process.env.VERCEL;
const file = (rel: string) => path.join(process.cwd(), rel);

async function connect(): Promise<Query> {
  const schema = fs.readFileSync(file("db/schema.sql"), "utf8");
  const url = databaseUrl();
  let query: Query;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false is required by Supabase's transaction pooler (port 6543), the right choice for serverless.
    const sql = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_SIZE || 3), idle_timeout: 20, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require", onnotice: () => {} });
    query = (async (text, params = []) => (await sql.unsafe(text, params as any[])) as any) as Query;
    // run the schema when it is new or changed (its hash is kept in app_meta)
    const hash = crypto.createHash("sha256").update(schema).digest("hex");
    const [{ has }] = await query<{ has: boolean }>("select to_regclass('public.app_meta') is not null as has");
    const v = has ? (await query<{ v: string }>("select v from app_meta where k = 'schema'"))[0]?.v ?? null : null;
    if (v !== hash || process.env.AUTO_MIGRATE === "1") {
      await sql.unsafe(schema);
      await query("insert into app_meta (k, v) values ('schema', $1) on conflict (k) do update set v = excluded.v", [hash]);
    }
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR || (process.env.VERCEL ? "/tmp/pglite" : file(".data/pglite"));
    fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.exec(schema);
    query = (async (text, params = []) => (await db.query(text, params as any[])).rows as any) as Query;
  }
  await seedStarterData(query);
  return query;
}

// Same choice of check items as scripts/import-samples.mjs (FNV hash of the id, 15%).
const fnv = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 2 ** 32; };

// Loads data/demo/manifest.jsonl: everything into an empty database, and afterwards only pictures
// that are new in the file (when it changes), never touching answers or existing pictures.
async function seedStarterData(query: Query) {
  if (process.env.SEED_DEMO === "0") return;
  const p = file("data/demo/manifest.jsonl");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  const [seen] = await query<{ v: string }>("select v from app_meta where k = 'starter_data'");
  if (seen?.v === hash) return;
  const recs = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const rows = recs.map((r) => {
    const gold = typeof r.truth === "string" && r.kind !== "line" && fnv(r.id) < 0.15;
    return {
      id: r.id, dataset: r.dataset, kind: r.kind || "word", font: r.font ?? null, image_url: r.image_url,
      context_url: r.context_url ?? null, proposed_text: r.text, source_ref: r.source_ref || {}, is_gold: gold,
      gold_verdict: gold ? (r.truth === r.text ? "correct" : "incorrect") : null, gold_text: gold ? r.truth : null,
    };
  });
  // a few large inserts instead of thousands of small ones, so the first start stays within Vercel's time limit
  for (let i = 0; i < rows.length; i += 1000) {
    await query(
      `insert into samples (id, dataset, kind, font, image_url, context_url, proposed_text, source_ref, is_gold, gold_verdict, gold_text)
       select id, dataset, kind, font, image_url, context_url, proposed_text, source_ref, is_gold, gold_verdict, gold_text
       from jsonb_to_recordset(($1::text)::jsonb) as x(id text, dataset text, kind text, font text, image_url text, context_url text,
         proposed_text text, source_ref jsonb, is_gold boolean, gold_verdict text, gold_text text)
       on conflict (id) do nothing`, [JSON.stringify(rows.slice(i, i + 1000))]);
  }
  await query("insert into app_meta (k, v) values ('starter_data', $1) on conflict (k) do update set v = excluded.v", [hash]);
}

export function db(): Promise<Query> {
  if (!g.__ksdb) g.__ksdb = connect().catch((e) => { g.__ksdb = undefined; throw e; });
  return g.__ksdb;
}

export async function q<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]> {
  return (await db())<T>(text, params);
}
