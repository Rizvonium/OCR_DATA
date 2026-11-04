import { fail, json } from "@/lib/http";
import { rememberedContributor, startSession } from "@/lib/identity";

export const dynamic = "force-dynamic";

// "Continue as <name>": this browser is remembered, so no PIN is needed.
export async function POST() {
  const r = await rememberedContributor();
  if (!r) return fail("This browser does not remember anyone any more. Sign in with your username and PIN.", 401);
  if (r.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  await startSession(r.id, false); // the device pass stays as it is
  return json({ me: { handle: r.handle } });
}
