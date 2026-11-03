import { fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { nextTask } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Join first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  const exclude = (new URL(req.url).searchParams.get("exclude") || "").split(",").filter(Boolean).slice(0, 20);
  return json({ task: await nextTask(me.id, exclude) });
}
