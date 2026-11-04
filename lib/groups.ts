// Labelling look-alike chunk groups: serve a group, save a decision.
import { q } from "./db";
import { checkCorrection, normalizeKs } from "./kashmiri";

/** Next group for this person: largest groups first, fewest answers first. */
export async function nextGroup(cid: string, exclude: string[] = [], wantId?: string | null) {
  // the group this person had open (e.g. before a reload), if they have not answered it yet
  const [want] = wantId ? await q<any>(
    `select id, members, proposed_text, size from chunk_groups g where id = $2
       and not exists (select 1 from group_answers a where a.group_id = g.id and a.contributor_id = $1)`, [cid, wantId]) : [];
  const [g] = want ? [want] : await q<any>(
    `select id, members, proposed_text, size from chunk_groups g
     where not exists (select 1 from group_answers a where a.group_id = g.id and a.contributor_id = $1)
       and not (id = any($2::text[]))
     order by (select count(*) from group_answers a where a.group_id = g.id), size desc, random() limit 1`, [cid, exclude]);
  const [{ left }] = await q<{ left: number }>(
    `select count(*)::int as left from chunk_groups g
     where not exists (select 1 from group_answers a where a.group_id = g.id and a.contributor_id = $1)`, [cid]);
  return { group: g ?? null, left };
}

export type GroupAnswerIn = { groupId: string; odd?: string[]; verdict: string; correction?: string; ms?: number };

export async function saveGroupAnswer(cid: string, a: GroupAnswerIn): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!["correct", "incorrect", "skip", "not_chunk"].includes(a.verdict)) return { ok: false, status: 400, error: "Unknown answer." };
  const [g] = await q<any>("select id, members from chunk_groups where id = $1", [a.groupId]);
  if (!g) return { ok: false, status: 404, error: "That group no longer exists." };
  const ids = new Set((g.members as any[]).map((m) => m.chunk));
  const odd = Array.isArray(a.odd) ? [...new Set(a.odd.filter((x) => typeof x === "string" && ids.has(x)))] : [];
  let correction: string | null = null;
  if (a.verdict === "incorrect" && a.correction && a.correction.trim()) {
    correction = normalizeKs(a.correction);
    const err = checkCorrection(correction);
    if (err) return { ok: false, status: 400, error: err };
  }
  await q(
    `insert into group_answers (group_id, contributor_id, odd, verdict, correction, ms_spent)
     values ($1, $2, ($3::text)::jsonb, $4, $5, $6)
     on conflict (group_id, contributor_id) do update set odd = excluded.odd, verdict = excluded.verdict,
       correction = excluded.correction, updated_at = now()`,
    [a.groupId, cid, JSON.stringify(odd), a.verdict, correction, Math.min(Number(a.ms) || 0, 3_600_000)]);
  return { ok: true };
}
