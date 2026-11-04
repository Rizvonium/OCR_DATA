import { q } from "@/lib/db";
import { fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";

export const dynamic = "force-dynamic";

// The next Match board: fewest answers first. Tile fonts and model readings stay on the server.
export async function GET(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  const exclude = (new URL(req.url).searchParams.get("exclude") || "").split(",").filter(Boolean).slice(0, 20);
  const tilesSql = "(select jsonb_agg(jsonb_build_object('chunk', t->>'chunk', 'clean_url', t->>'clean_url')) from jsonb_array_elements(tiles) t)";
  // a board this person started but did not submit comes back first, with what they already did
  const [open] = await q<any>(
    `select m.id, ${tilesSql} as tiles, a.sets, a.junk from match_answers a join match_boards m on m.id = a.board_id
     where a.contributor_id = $1 and not a.done and not (m.id = any($2::text[])) order by a.updated_at desc limit 1`, [me.id, exclude]);
  const [b] = open ? [open] : await q<any>(
    `select id, (select jsonb_agg(jsonb_build_object('chunk', t->>'chunk', 'clean_url', t->>'clean_url')) from jsonb_array_elements(tiles) t) as tiles
     from match_boards m where not exists (select 1 from match_answers a where a.board_id = m.id and a.contributor_id = $1)
       and not (id = any($2::text[]))
     order by (select count(*) from match_answers a where a.board_id = m.id), random() limit 1`, [me.id, exclude]);
  const [{ left }] = await q<{ left: number }>(
    "select count(*)::int as left from match_boards m where not exists (select 1 from match_answers a where a.board_id = m.id and a.contributor_id = $1)", [me.id]);
  return json({ board: b ? { id: b.id, tiles: b.tiles } : null, saved: open ? { sets: open.sets, junk: open.junk } : null, left });
}
