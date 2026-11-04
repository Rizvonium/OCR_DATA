import { body, fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { savePageAnswer } from "@/lib/pages";
import { quickStats } from "@/lib/review";

export const dynamic = "force-dynamic";

// Save (or change) one decision on a page.
export async function POST(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  const r = await savePageAnswer(me.id, await body(req));
  if (!r.ok) return fail(r.error, r.status);
  return json({ ok: true, stats: await quickStats(me.id) });
}
