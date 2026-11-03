import { q } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period");
  const rows = await q(
    `select code, handle, points, reviews::int, confirmed_corrections::int, check_accuracy::int, agreement::int, last_answer_at
     from leaderboard order by points desc, reviews desc, created_at limit 100`);
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
