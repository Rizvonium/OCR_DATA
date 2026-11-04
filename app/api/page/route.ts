import { fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { nextPage } from "@/lib/pages";

export const dynamic = "force-dynamic";

// The page to review now (or ?id=), with this person's answers on it so far.
export async function GET(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  return json(await nextPage(me.id, new URL(req.url).searchParams.get("id")) ?? { page: null });
}
