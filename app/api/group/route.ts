import { fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { nextGroup } from "@/lib/groups";

export const dynamic = "force-dynamic";

// The next group of look-alike chunks to label.
export async function GET(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  const exclude = (new URL(req.url).searchParams.get("exclude") || "").split(",").filter(Boolean).slice(0, 20);
  return json(await nextGroup(me.id, exclude));
}
