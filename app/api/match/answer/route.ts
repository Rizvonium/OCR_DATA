import { q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { quickStats } from "@/lib/review";

export const dynamic = "force-dynamic";

// Save the sets popped on a board (each set = chunks that are one and the same), the tiles flagged
// "not a chunk", and what was left unsorted. A board may be submitted at any time.
export async function POST(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  const b = await body(req);
  const [board] = await q<any>("select tiles from match_boards where id = $1", [b.boardId]);
  if (!board) return fail("That board no longer exists.", 404);
  const ids = new Set((board.tiles as any[]).map((t) => t.chunk));
  const used = new Set<string>();
  const sets: string[][] = [];
  for (const s of Array.isArray(b.sets) ? b.sets : []) {
    const clean = (Array.isArray(s) ? s : []).filter((x: unknown) => typeof x === "string" && ids.has(x) && !used.has(x));
    if (clean.length >= 2) { clean.forEach((x: string) => used.add(x)); sets.push(clean); }
  }
  // tiles flagged "not a chunk" (only a mark or a speck)
  const junk = (Array.isArray(b.junk) ? b.junk : []).filter((x: unknown) => typeof x === "string" && ids.has(x) && !used.has(x));
  junk.forEach((x: string) => used.add(x));
  const rest = [...ids].filter((x) => !used.has(x));
  await q(
    `insert into match_answers (board_id, contributor_id, sets, rest, junk, ms_spent, done) values ($1, $2, ($3::text)::jsonb, ($4::text)::jsonb, ($5::text)::jsonb, $6, $7)
     on conflict (board_id, contributor_id) do update set sets = excluded.sets, rest = excluded.rest, junk = excluded.junk,
       ms_spent = greatest(match_answers.ms_spent, excluded.ms_spent), done = excluded.done, updated_at = now()`,
    [b.boardId, me.id, JSON.stringify(sets), JSON.stringify(rest), JSON.stringify(junk), Math.min(Number(b.ms) || 0, 3_600_000), b.done !== false]);
  return json({ ok: true, sets: sets.length, stats: await quickStats(me.id) });
}
