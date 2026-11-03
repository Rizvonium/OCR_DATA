import { q } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Public progress of the whole dataset (shown on the home screen).
export async function GET() {
  const status = await q<{ status: string; n: number }>(
    "select status, count(*)::int as n from sample_consensus where not is_gold group by status");
  const [t] = await q<any>(
    `select (select count(*)::int from samples where not is_gold) as samples,
            (select count(*)::int from answers where verdict <> 'skip') as answers,
            (select count(*)::int from contributors) as contributors`);
  return json({ ...t, status: Object.fromEntries(status.map((s) => [s.status, s.n])) });
}
