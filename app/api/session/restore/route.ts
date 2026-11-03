import { q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";
import { setKeyCookie, sha256 } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Continue on another device with the recovery key.
export async function POST(req: Request) {
  const { key } = await body(req);
  if (typeof key !== "string" || !/^ks_[A-Za-z0-9_-]{20,64}$/.test(key.trim())) return fail("That does not look like a recovery key.");
  const [me] = await q("select id, code, handle, status from contributors where token_hash = $1", [sha256(key.trim())]);
  if (!me) return fail("No contributor has this key.", 404);
  await setKeyCookie(key.trim());
  return json({ me });
}
