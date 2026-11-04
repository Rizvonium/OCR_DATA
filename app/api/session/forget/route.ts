import { cookies } from "next/headers";
import { json } from "@/lib/http";
import { COOKIE, forgetDevice, sha256 } from "@/lib/identity";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// "Not me": sign out here and forget this browser.
export async function POST() {
  const jar = await cookies();
  const key = jar.get(COOKIE)?.value;
  if (key) await q("delete from sessions where token_hash = $1 and kind = 'session'", [sha256(key)]);
  jar.delete(COOKIE);
  await forgetDevice();
  return json({ ok: true });
}
