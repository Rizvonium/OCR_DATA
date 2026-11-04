import { q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";
import { isAdmin } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Every answer to every picture, with who gave it and whether it was right.
// "Right" = matches the known answer on check items, or the crowd's decision on other pictures.
async function answersView(only: string, offset: number) {
  return q(
    `select c.id, c.image_url, c.font, c.proposed_text, c.is_gold, c.status, c.final_text,
            s.gold_verdict, case when s.gold_verdict = 'correct' then s.proposed_text else s.gold_text end as known_text,
            json_agg(json_build_object(
              'code', k.code, 'handle', k.handle, 'verdict', a.verdict, 'correction', a.correction,
              'bad_crop', a.bad_crop, 'seconds', round(a.ms_spent / 1000.0, 1), 'at', a.created_at,
              'right', case
                when a.verdict = 'skip' then null
                when s.is_gold then a.gold_pass
                when c.status = 'verified' then a.verdict = 'correct'
                when c.status in ('corrected', 'needs_text') then a.verdict = 'incorrect'
              end) order by a.created_at) as answers
     from sample_consensus c join samples s on s.id = c.id join answers a on a.sample_id = c.id
     join contributors k on k.id = a.contributor_id
     where ($1 = 'all' or ($1 = 'gold' and s.is_gold) or ($1 = 'decided' and c.status in ('verified', 'corrected')))
     group by c.id, c.image_url, c.font, c.proposed_text, c.is_gold, c.status, c.final_text, s.gold_verdict, s.proposed_text, s.gold_text
     order by max(a.created_at) desc limit 50 offset $2`, [only, offset]);
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return fail("Admin key required.", 401);
  const u = new URL(req.url);
  if (u.searchParams.get("view") === "uploads") {
    const status = u.searchParams.get("status") || "new";
    const rows = await q(
      `select u.id, u.source, u.page, u.note, u.width, u.height, u.bytes, u.quality, u.status, u.created_at, u.url,
              c.handle, c.code
       from uploads u join contributors c on c.id = u.contributor_id
       where ($1 = 'all' or u.status = $1) order by u.created_at desc limit 300`, [status]);
    const counts = await q("select status, count(*)::int as n from uploads group by status");
    return json({ rows, counts: Object.fromEntries(counts.map((r: any) => [r.status, r.n])) });
  }
  if (u.searchParams.get("view") === "answers")
    return json({ rows: await answersView(u.searchParams.get("only") || "gold", Number(u.searchParams.get("offset")) || 0) });
  const people = await q(
    `select code, handle, status, reviews::int, skips::int, corrections::int, confirmed_corrections::int, gold_total::int, gold_pass::int,
            agreement_n::int, agreement_hits::int, round(median_ms)::int as median_ms, round(share_correct * 100)::int as pct_correct,
            last_hour::int, last_day::int, round(trust::numeric, 2)::float as trust, flags, created_at, last_answer_at
     from contributor_flags order by cardinality(flags) desc, status desc, reviews desc limit 500`);
  const status = await q("select dataset, status, count(*)::int as n from sample_consensus where not is_gold group by dataset, status order by dataset, status");
  const disputed = await q(
    `select id, image_url, proposed_text, n_correct::int, n_incorrect::int, n_bad_crop::int, top_correction, top_correction_votes::int, status
     from sample_consensus where status in ('disputed', 'needs_text', 'bad_crop') order by n_incorrect desc limit 60`);
  const [gold] = await q("select count(*)::int as n from samples where is_gold");
  // how much data per typeface (never shown to reviewers)
  const fonts = await q(
    `select coalesce(font, 'unknown') as font, count(*)::int as samples,
            count(*) filter (where kind = 'word')::int as words, count(*) filter (where kind = 'line')::int as lines,
            count(*) filter (where n_correct + n_incorrect > 0)::int as reviewed,
            count(*) filter (where status in ('verified', 'corrected'))::int as done,
            count(*) filter (where status in ('needs_text', 'disputed'))::int as wrong,
            count(*) filter (where status = 'bad_crop')::int as bad_crop
     from sample_consensus where not is_gold group by 1 order by samples desc`);
  return json({ people, status, disputed, fonts, gold: gold.n });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return fail("Admin key required.", 401);
  const b = await body(req);
  if (b.action === "status") {
    if (!["active", "flagged", "blocked"].includes(b.status)) return fail("Unknown status.");
    const r = await q("update contributors set status = $2, admin_note = coalesce($3, admin_note) where code = $1 returning code, status",
      [b.code, b.status, b.note ?? null]);
    return r.length ? json(r[0]) : fail("No such contributor.", 404);
  }
  if (b.action === "upload_status") {
    if (!["new", "kept", "rejected", "used"].includes(b.status)) return fail("Unknown status.");
    const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter(Number.isInteger);
    const r = await q("update uploads set status = $2 where id = any($1::bigint[]) returning id", [ids, b.status]);
    return json({ updated: r.length });
  }
  if (b.action === "promote_gold") {
    // Unanimous, well-reviewed items become new check items for people who have not seen them yet.
    const r = await q(
      `update samples s set is_gold = true, gold_verdict = 'correct', gold_text = s.proposed_text
       from sample_consensus c where c.id = s.id and not s.is_gold and c.status = 'verified' and c.n_correct >= 3 and c.n_incorrect = 0
         and s.id in (select id from sample_consensus where status = 'verified' and n_correct >= 3 and n_incorrect = 0 and not is_gold limit $1)
       returning s.id`, [Math.min(500, Number(b.limit) || 50)]);
    return json({ promoted: r.length });
  }
  return fail("Unknown action.");
}
