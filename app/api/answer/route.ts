import { body, fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { myStats, submitAnswer } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Join first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  const b = await body(req);
  const r = await submitAnswer(me.id, {
    sampleId: String(b.sampleId || ""), ticket: b.ticket, verdict: String(b.verdict || ""),
    correction: typeof b.correction === "string" ? b.correction : undefined, badCrop: !!b.badCrop,
  });
  if (!r.ok) return fail(r.error, r.status);
  return json({ gold: r.gold, stats: await myStats(me.id) });
}
