// Labelling look-alike chunk groups: serve a group, save a decision.
//
// Serving keeps track of every chunk, not only of groups:
//   - a chunk this person has already labelled (in any group) is never shown to them again; a group
//     is shown without those chunks, and skipped when nothing new is left in it
//   - variety: a reading among this person's last 8 groups waits (so ا does not follow ا), and families
//     (groups cut from one big look-alike cluster, e.g. hundreds of ا) they have done come after new ones
//   - chunks nobody has labelled come first; a chunk goes to at most LABELS_PER_CHUNK different people
//     (repeats by other people check correctness), then it is not shown any more
import { q } from "./db";
import { checkCorrection, normalizeKs } from "./kashmiri";

export const LABELS_PER_CHUNK = Number(process.env.LABELS_PER_CHUNK || 3);

const CANDIDATES = `
  with labelled as (                       -- every chunk-label given so far: chunk, person
    select distinct m->>'chunk' as chunk, a.contributor_id as who
    from group_answers a join chunk_groups g on g.id = a.group_id, jsonb_array_elements(g.members) m
    where a.verdict <> 'skip' and not (a.odd ? (m->>'chunk')) and (a.shown is null or a.shown ? (m->>'chunk'))),
  per_chunk as (select chunk, count(*) as n, bool_or(who = $1) as mine from labelled group by chunk),
  my_families as (select distinct g.family from group_answers a join chunk_groups g on g.id = a.group_id where a.contributor_id = $1),
  my_recent as (                           -- what this person's last 8 groups said: not again right away
    select g.proposed_text from group_answers a join chunk_groups g on g.id = a.group_id
    where a.contributor_id = $1 order by a.updated_at desc limit 8),
  open as (                                -- each group with only the chunks still useful for this person
    select g.id, g.family, g.proposed_text, g.size,
           jsonb_agg(m order by o) as members, min(coalesce(p.n, 0)) as fewest
    from chunk_groups g, jsonb_array_elements(g.members) with ordinality t(m, o)
    left join per_chunk p on p.chunk = m->>'chunk'
    where not exists (select 1 from group_answers a where a.group_id = g.id and a.contributor_id = $1)
      and coalesce(p.mine, false) = false and coalesce(p.n, 0) < ${LABELS_PER_CHUNK}
    group by g.id)`;

/** Next group for this person (see above), or the one they had open (wantId). */
export async function nextGroup(cid: string, exclude: string[] = [], wantId?: string | null) {
  const pick = (extra: string, params: unknown[]) => q<any>(
    `${CANDIDATES}
     select id, members, proposed_text, jsonb_array_length(members) as size from open o
     where not (id = any($2::text[])) ${extra}
     order by (o.proposed_text in (select proposed_text from my_recent)), (o.family in (select family from my_families)),
              o.fewest, jsonb_array_length(o.members) desc, random() limit 1`,
    [cid, exclude, ...params]);
  const [want] = wantId ? await pick("and id = $3", [wantId]) : [];
  const [g] = want ? [want] : await pick("", []);
  const [{ left }] = await q<{ left: number }>(`${CANDIDATES} select count(*)::int as left from open`, [cid]);
  return { group: g ?? null, left };
}

export type GroupAnswerIn = { groupId: string; odd?: string[]; shown?: string[]; verdict: string; correction?: string; ms?: number };

export async function saveGroupAnswer(cid: string, a: GroupAnswerIn): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!["correct", "incorrect", "skip", "not_chunk"].includes(a.verdict)) return { ok: false, status: 400, error: "Unknown answer." };
  const [g] = await q<any>("select id, members from chunk_groups where id = $1", [a.groupId]);
  if (!g) return { ok: false, status: 404, error: "That group no longer exists." };
  const ids = new Set((g.members as any[]).map((m) => m.chunk));
  const odd = Array.isArray(a.odd) ? [...new Set(a.odd.filter((x) => typeof x === "string" && ids.has(x)))] : [];
  const shown = Array.isArray(a.shown) ? [...new Set(a.shown.filter((x) => typeof x === "string" && ids.has(x)))] : null;
  let correction: string | null = null;
  if (a.verdict === "incorrect" && a.correction && a.correction.trim()) {
    correction = normalizeKs(a.correction);
    const err = checkCorrection(correction);
    if (err) return { ok: false, status: 400, error: err };
  }
  await q(
    `insert into group_answers (group_id, contributor_id, odd, shown, verdict, correction, ms_spent)
     values ($1, $2, ($3::text)::jsonb, ($4::text)::jsonb, $5, $6, $7)
     on conflict (group_id, contributor_id) do update set odd = excluded.odd, shown = excluded.shown, verdict = excluded.verdict,
       correction = excluded.correction, updated_at = now()`,
    [a.groupId, cid, JSON.stringify(odd), shown && shown.length ? JSON.stringify(shown) : null, a.verdict, correction, Math.min(Number(a.ms) || 0, 3_600_000)]);
  return { ok: true };
}
