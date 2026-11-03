import { cookies } from "next/headers";
import { fail, json } from "@/lib/http";
import { COOKIE, currentContributor } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Shows a signed-in person their own recovery key (the cookie is httpOnly, so pages cannot read it).
export async function GET() {
  const me = await currentContributor();
  if (!me) return fail("Not signed in.", 401);
  return json({ key: (await cookies()).get(COOKIE)?.value });
}
