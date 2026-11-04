import { q } from "@/lib/db";
import { json } from "@/lib/http";
import { LABELS_PER_CHUNK } from "@/lib/groups";

export const dynamic = "force-dynamic";

// Everyone's work together, per task: shown above each task so a new person sees the work carry on
// from where others stopped (each person is given what the fewest people have done yet).
let cache: { at: number; data: unknown } | null = null;
export async function GET() {
  if (cache && Date.now() - cache.at < 20_000) return json(cache.data);
  const [r] = await q<any>(
    `with lab as (select chunk, count(*) as n from chunk_labels group by chunk)
     select (select count(distinct m->>'chunk')::int from chunk_groups g, jsonb_array_elements(g.members) m) as chunks,
            (select count(*)::int from lab) as chunks_started,
            (select count(*)::int from lab where n >= ${LABELS_PER_CHUNK}) as chunks_full,
            (select count(*)::int from match_boards) as boards,
            (select count(distinct board_id)::int from match_answers where done) as boards_started,
            (select count(*)::int from pages) as pages,
            (select count(distinct page_id)::int from page_answers where level = 'page') as pages_started,
            (select count(*)::int from contributors where status <> 'blocked') as people`);
  const data = {
    label: { done: r.chunks_started, full: r.chunks_full, total: r.chunks, per: LABELS_PER_CHUNK },
    match: { done: r.boards_started, total: r.boards },
    cut: { done: r.pages_started, total: r.pages },
    people: r.people,
  };
  cache = { at: Date.now(), data };
  return json(data);
}
