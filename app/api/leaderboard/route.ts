import { q } from "@/lib/db";
import { badgesFor } from "@/lib/badges";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period");
  const rows = await q(
    `select l.code, l.handle, l.points, l.reviews::int, l.confirmed_corrections::int, l.check_accuracy::int, l.agreement::int, l.last_answer_at,
            (select count(*)::int from page_answers pa where pa.contributor_id = c.id and pa.level = 'page') as pages,
            l.corrections::int + (select count(*)::int from page_answers pa where pa.contributor_id = c.id and pa.correction is not null) as corrections,
            (select count(*)::int from uploads u where u.contributor_id = c.id) as photos,
            (select count(distinct d)::int from (select date_trunc('day', created_at) d from answers where contributor_id = c.id
               union select date_trunc('day', created_at) from page_answers where contributor_id = c.id) x) as days
     from leaderboard l join contributors c on c.code = l.code order by l.points desc nulls last, l.reviews desc, l.created_at limit 2000`);
  for (const r of rows as any[]) r.badges = badgesFor({ points: r.points || 0, pages: r.pages, corrections: r.corrections, days: r.days, photos: r.photos }).map((b) => b.icon + " " + b.name);
  // weekly view: same trust rules, only this week's reviews
  if (period === "week") {
    const week = await q<{ code: string; n: number }>(
      `select c.code, count(*)::int as n from answers a join contributors c on c.id = a.contributor_id
       where a.created_at > now() - interval '7 days' and a.verdict <> 'skip' and not a.is_gold group by c.code`);
    const m = new Map(week.map((w) => [w.code, w.n]));
    return json({ rows: rows.map((r: any) => ({ ...r, week: m.get(r.code) ?? 0 })).filter((r: any) => r.week > 0).sort((a: any, b: any) => b.week - a.week) });
  }
  return json({ rows });
}
