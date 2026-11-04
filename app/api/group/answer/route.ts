import { body, fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { saveGroupAnswer } from "@/lib/groups";
import { myStats } from "@/lib/review";

export const dynamic = "force-dynamic";

// Save (or change) a decision on a group: odd members and the text.
export async function POST(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  const r = await saveGroupAnswer(me.id, await body(req));
  if (!r.ok) return fail(r.error, r.status);
  return json({ ok: true, stats: await myStats(me.id) });
}
