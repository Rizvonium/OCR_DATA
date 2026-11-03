import { isPreview, q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";
import { COOKIE, cleanHandle, clientIpHash, currentContributor, newCode, newKey, setKeyCookie, sha256 } from "@/lib/identity";
import { myStats } from "@/lib/review";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
const SIGNUPS_PER_NETWORK_PER_DAY = Number(process.env.SIGNUPS_PER_NETWORK_PER_DAY || 30);

export async function GET() {
  const me = await currentContributor();
  if (!me) return json({ me: null, preview: isPreview() });
  return json({ me, stats: await myStats(me.id), preview: isPreview() });
}

// Join: pick a display name -> your own contributor id, public code and secret key.
export async function POST(req: Request) {
  const b = await body(req);
  const handle = cleanHandle(b.handle);
  if (!handle) return fail("Choose a name of 2–24 letters or numbers.");
  if (!b.consent) return fail("Please agree to how your answers will be used.");
  const email = typeof b.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ? b.email.trim().toLowerCase() : null;
  const ipHash = await clientIpHash();
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int as n from contributors where ip_hash = $1 and created_at > now() - interval '1 day'", [ipHash]);
  if (n >= SIGNUPS_PER_NETWORK_PER_DAY) return fail("Too many new names from this network today. Use your recovery key instead.", 429);
  const key = newKey();
  for (let i = 0; i < 5; i++) {
    try {
      const [me] = await q(
        `insert into contributors (code, handle, handle_key, token_hash, email, ip_hash)
         values ($1, $2, $3, $4, $5, $6) returning id, code, handle, status, email, created_at`,
        [newCode(), handle, handle.toLowerCase(), sha256(key), email, ipHash]);
      await setKeyCookie(key);
      return json({ me, key });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("handle_key")) return fail("That name is taken. Try another, or add a letter.", 409);
      if (!msg.includes("code")) throw e; // code collision: try another code
    }
  }
  return fail("Could not create your profile. Try again.", 500);
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return json({ ok: true });
}
