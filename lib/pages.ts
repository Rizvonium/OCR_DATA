// The guided page review: serving pages and saving each decision.
import { q } from "./db";
import { checkCorrection, normalizeKs } from "./kashmiri";

export type Box = [number, number, number, number];
export type Chunk = { box: Box; text: string; word?: number; clean_url?: string };
export type Line = { box: Box; top?: number[][]; bottom?: number[][]; chunks: Chunk[] };
export type PageAnswer = { level: string; line: number; chunk: number; verdict: string; edit: any; correction: string | null };

const PAGE_COLS = "id, image_url, heat_url, width, height, lines";

/** The page to work on: an unfinished one this person started, else the page fewest people finished. */
export async function nextPage(cid: string, wantId?: string | null) {
  let [page] = wantId ? await q<any>(`select ${PAGE_COLS} from pages where id = $1`, [wantId]) : [];
  if (!page) [page] = await q<any>(
    `select ${PAGE_COLS} from pages p
     where exists (select 1 from page_answers a where a.page_id = p.id and a.contributor_id = $1)
       and not exists (select 1 from page_answers a where a.page_id = p.id and a.contributor_id = $1 and a.level = 'page')
     order by (select max(updated_at) from page_answers a where a.page_id = p.id and a.contributor_id = $1) desc limit 1`, [cid]);
  if (!page) [page] = await q<any>(
    `select ${PAGE_COLS} from pages p
     where not exists (select 1 from page_answers a where a.page_id = p.id and a.contributor_id = $1)
     order by (select count(*) from page_answers a where a.page_id = p.id and a.level = 'page') + random() * 0.9, id limit 1`, [cid]);
  if (!page) return null;
  const answers = await q<PageAnswer>(
    "select level, line, chunk, verdict, edit, correction from page_answers where page_id = $1 and contributor_id = $2", [page.id, cid]);
  const [{ done }] = await q<{ done: number }>(
    "select count(*)::int as done from page_answers where contributor_id = $1 and level = 'page'", [cid]);
  return { page, answers, pagesDone: done };
}

const isBox = (b: unknown) => Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(n));
const cleanChunks = (cs: unknown): Chunk[] | null =>
  Array.isArray(cs) && cs.length <= 200 && cs.every((c: any) => isBox(c?.box))
    ? cs.map((c: any) => ({
        box: c.box.map((n: number) => Math.round(n)) as Box, text: typeof c.text === "string" ? normalizeKs(c.text).slice(0, 160) : "",
        ...(Number.isInteger(c.word) ? { word: c.word } : {}),
        ...(typeof c.clean_url === "string" && c.clean_url.startsWith("/pages/") ? { clean_url: c.clean_url } : {}),
      }))
    : null;

export type PageAnswerIn = { pageId: string; level: string; line?: number; chunk?: number; verdict: string; edit?: any; correction?: string; ms?: number };

export async function savePageAnswer(cid: string, a: PageAnswerIn): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!["lines", "chunks", "text", "page"].includes(a.level)) return { ok: false, status: 400, error: "Unknown step." };
  if (!["correct", "incorrect", "skip", "done"].includes(a.verdict)) return { ok: false, status: 400, error: "Unknown answer." };
  const [page] = await q<any>("select id from pages where id = $1", [a.pageId]);
  if (!page) return { ok: false, status: 404, error: "That page no longer exists." };
  const line = a.level === "lines" || a.level === "page" ? -1 : Math.trunc(Number(a.line));
  const chunk = a.level === "text" ? Math.trunc(Number(a.chunk)) : -1;
  if (!Number.isFinite(line) || !Number.isFinite(chunk) || line < -1 || chunk < -1 || line > 500 || chunk > 500)
    return { ok: false, status: 400, error: "Unknown line or chunk." };

  let edit: any = null;
  if (a.verdict === "incorrect" && a.level === "lines") {
    const lines = Array.isArray(a.edit?.lines) ? a.edit.lines : null;
    if (!lines || lines.length > 200 || !lines.every((l: any) => isBox(l?.box) && cleanChunks(l?.chunks)))
      return { ok: false, status: 400, error: "The corrected lines could not be read." };
    edit = { lines: lines.map((l: any) => ({ box: l.box, chunks: cleanChunks(l.chunks) })), ops: Array.isArray(a.edit?.ops) ? a.edit.ops.slice(0, 200) : [] };
  }
  if (a.verdict === "incorrect" && a.level === "chunks") {
    const chunks = cleanChunks(a.edit?.chunks);
    if (!chunks) return { ok: false, status: 400, error: "The corrected chunks could not be read." };
    edit = { chunks, ops: Array.isArray(a.edit?.ops) ? a.edit.ops.slice(0, 200) : [] };
  }
  if (a.level === "text" && isBox(a.edit?.box)) edit = { box: a.edit.box, shown: typeof a.edit?.shown === "string" ? a.edit.shown.slice(0, 160) : "" };
  let correction: string | null = null;
  if (a.level === "text" && a.verdict === "incorrect" && a.correction && a.correction.trim()) {
    correction = normalizeKs(a.correction);
    const err = checkCorrection(correction);
    if (err) return { ok: false, status: 400, error: err };
  }

  await q(
    `insert into page_answers (page_id, contributor_id, level, line, chunk, verdict, edit, correction, ms_spent)
     values ($1, $2, $3, $4, $5, $6, ($7::text)::jsonb, $8, $9)
     on conflict (page_id, contributor_id, level, line, chunk)
     do update set verdict = excluded.verdict, edit = excluded.edit, correction = excluded.correction, updated_at = now()`,
    [a.pageId, cid, a.level, line, chunk, a.verdict, edit ? JSON.stringify(edit) : null, correction, Math.min(Number(a.ms) || 0, 3_600_000)]);
  // changing the lines (or one line's chunks) makes the later answers on them stale: they are redone
  if (a.level === "lines")
    await q("delete from page_answers where page_id = $1 and contributor_id = $2 and level in ('chunks', 'text', 'page')", [a.pageId, cid]);
  if (a.level === "chunks")
    await q("delete from page_answers where page_id = $1 and contributor_id = $2 and ((level = 'text' and line = $3) or level = 'page')", [a.pageId, cid, line]);
  return { ok: true };
}
