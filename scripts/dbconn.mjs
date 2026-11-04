// Same two back ends as lib/db.ts, for command-line scripts.
import fs from "node:fs";
import path from "node:path";

export async function open() {
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (raw) {
    const postgres = (await import("postgres")).default;
    let url = raw;
    try { const u = new URL(raw); u.search = ""; url = u.toString(); } catch {}
    const sql = postgres(url, { prepare: false, max: 1, ssl: url.includes("localhost") ? false : "require", onnotice: () => {} });
    return { kind: "postgres", schema, exec: (t) => sql.unsafe(t), query: (t, p = []) => sql.unsafe(t, p), close: () => sql.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  return { kind: "pglite", schema, exec: (t) => db.exec(t), query: async (t, p = []) => (await db.query(t, p)).rows, close: () => db.close() };
}
