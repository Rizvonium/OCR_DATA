import { q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";
import { PIN_RE, hashPin, isAdmin } from "@/lib/identity";
import { CHECKS_ON } from "@/lib/review";

export const dynamic = "force-dynamic";

// Every answer to every picture, with who gave it and whether it was right.
// "Right" = matches the known answer on check items, or the crowd's decision on other pictures.
async function answersView(only: string, offset: number, who: string | null) {
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
       and ($3::text is null or c.id in (select a2.sample_id from answers a2 join contributors k2 on k2.id = a2.contributor_id where k2.code = $3))
     group by c.id, c.image_url, c.font, c.proposed_text, c.is_gold, c.status, c.final_text, s.gold_verdict, s.proposed_text, s.gold_text
     order by max(a.created_at) desc limit 100 offset $2`, [only, offset, who]);
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return fail("Admin key required.", 401);
  const u = new URL(req.url);
  if (u.searchParams.get("view") === "match") {
    const rows = await q(
      `select a.board_id, a.sets, a.rest, a.updated_at, c.handle, c.code, b.tiles
       from match_answers a join match_boards b on b.id = a.board_id join contributors c on c.id = a.contributor_id
       order by a.updated_at desc limit 200`);
    return json({ rows });
  }
  if (u.searchParams.get("view") === "groups") {
    // answered groups with every person's decision; "same" = people who decided exactly alike
    const rows = await q(
      `select g.id, g.size, g.proposed_text, g.members, a.verdict, a.correction, a.odd, a.updated_at, c.handle, c.code,
              (select count(*)::int from group_answers b where b.group_id = a.group_id and b.verdict = a.verdict
                 and coalesce(b.correction, '') = coalesce(a.correction, '') and b.odd = a.odd) as same
       from group_answers a join chunk_groups g on g.id = a.group_id join contributors c on c.id = a.contributor_id
       order by a.updated_at desc limit 300`);
    const [t] = await q<any>(
      `select (select count(*)::int from chunk_groups) as groups, (select coalesce(sum(size), 0)::int from chunk_groups) as chunks,
              (select count(distinct group_id)::int from group_answers where verdict <> 'skip') as labelled_groups,
              (select coalesce(sum(g.size), 0)::int from chunk_groups g where exists (select 1 from group_answers a where a.group_id = g.id and a.verdict <> 'skip')) as labelled_chunks`);
    return json({ rows, totals: t });
  }
  if (u.searchParams.get("view") === "pages") {
    // each page: how many people worked on / finished it, and how they judged the lines, chunks and texts
    const rows = await q(
      `select p.id, p.font, p.image_url, jsonb_array_length(p.lines) as lines,
              count(distinct a.contributor_id)::int as people,
              count(distinct a.contributor_id) filter (where a.level = 'page')::int as finished,
              count(*) filter (where a.level = 'lines' and a.verdict = 'correct')::int as lines_ok,
              count(*) filter (where a.level = 'lines' and a.verdict = 'incorrect')::int as lines_fixed,
              count(*) filter (where a.level = 'chunks' and a.verdict = 'correct')::int as chunks_ok,
              count(*) filter (where a.level = 'chunks' and a.verdict = 'incorrect')::int as chunks_fixed,
              count(*) filter (where a.level = 'text' and a.verdict = 'correct')::int as text_ok,
              count(*) filter (where a.level = 'text' and a.verdict = 'incorrect')::int as text_fixed,
              max(a.updated_at) as last
       from pages p left join page_answers a on a.page_id = p.id
       group by p.id order by count(a.id) desc, p.id limit 500`);
    return json({ rows });
  }
  if (u.searchParams.get("view") === "page") {
    // every decision on one page, by person; texts that 2+ people typed the same way are agreed
    const id = u.searchParams.get("id");
    const rows = await q(
      `select a.level, a.line, a.chunk, a.verdict, a.correction, a.edit, a.updated_at, c.handle, c.code,
              (select count(*)::int from page_answers b where b.page_id = a.page_id and b.level = a.level and b.line = a.line
                 and b.chunk = a.chunk and b.verdict = a.verdict and coalesce(b.correction, '') = coalesce(a.correction, '')) as same
       from page_answers a join contributors c on c.id = a.contributor_id
       where a.page_id = $1 and a.level <> 'page' order by a.level = 'text', a.line, a.chunk, c.handle`, [id]);
    return json({ rows });
  }
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
    return json({ rows: await answersView(u.searchParams.get("only") || "gold", Number(u.searchParams.get("offset")) || 0, u.searchParams.get("who")) });
  const people = await q(
    `select f.code, f.handle, f.status, f.reviews::int, f.skips::int, f.corrections::int, f.confirmed_corrections::int,
            f.gold_total::int, f.gold_pass::int, f.agreement_n::int, f.agreement_hits::int, round(f.median_ms)::int as median_ms,
            round(f.share_correct * 100)::int as pct_correct, f.last_hour::int, f.last_day::int, round(f.trust::numeric, 2)::float as trust,
            f.flags, f.created_at, f.last_seen_at, f.last_answer_at, c.admin_note,
            c.pin_hash is not null as has_pin, c.locked_until > now() as locked,
            (select count(*)::int from sessions s where s.contributor_id = c.id) as devices,
            (select count(*)::int from uploads u where u.contributor_id = c.id) as photos,
            l.points::int as points
     from contributor_flags f join contributors c on c.id = f.id left join leaderboard l on l.code = f.code
     order by cardinality(f.flags) desc, f.reviews desc limit 1000`);
  const ordinary = CHECKS_ON ? "not is_gold" : "true"; // with checks off, check items are ordinary pictures
  const status = await q(`select dataset, status, count(*)::int as n from sample_consensus where ${ordinary} group by dataset, status order by dataset, status`);
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
     from sample_consensus where ${ordinary} group by 1 order by samples desc`);
  return json({ people, status, disputed, fonts, gold: gold.n, checks: CHECKS_ON });
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
  if (b.action === "reset_pin") {
    // PINs are stored one-way (they cannot be read back), so the admin sets a new one instead.
    if (typeof b.pin !== "string" || !PIN_RE.test(b.pin)) return fail("The new PIN must be 4 to 6 digits.");
    const r = await q("update contributors set pin_hash = $2, failed_pins = 0, locked_until = null where code = $1 returning id",
      [b.code, hashPin(b.pin)]);
    if (!r.length) return fail("No such contributor.", 404);
    await q("delete from sessions where contributor_id = $1", [r[0].id]); // signed out everywhere; they sign in with the new PIN
    return json({ ok: true });
  }
  if (b.action === "note") {
    await q("update contributors set admin_note = $2 where code = $1", [b.code, typeof b.note === "string" ? b.note.slice(0, 500) : null]);
    return json({ ok: true });
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
