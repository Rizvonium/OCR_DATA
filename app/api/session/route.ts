import { databaseSource, isPreview, q } from "@/lib/db";
import { body, fail, json } from "@/lib/http";
import {
  COOKIE, PIN_RE, checkPin, cleanHandle, clientIpHash, currentContributor, hashPin, newCode, newKey, sha256, startSession,
} from "@/lib/identity";
import { myStats } from "@/lib/review";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
const SIGNUPS_PER_NETWORK_PER_DAY = Number(process.env.SIGNUPS_PER_NETWORK_PER_DAY || 30);
const MAX_WRONG_PINS = 5;          // then the name is locked for LOCK_MINUTES
const LOCK_MINUTES = 15;

export async function GET() {
  const me = await currentContributor();
  // `database` names the variable the connection came from (never its value), to check the setup
  const database = databaseSource();
  if (!me) return json({ me: null, preview: isPreview(), database });
  return json({ me, stats: await myStats(me.id), preview: isPreview(), database });
}

// Username + PIN. An unknown name creates a profile; a known name signs in with its PIN.
export async function POST(req: Request) {
  const b = await body(req);
  const handle = cleanHandle(b.handle);
  if (!handle) return fail("Choose a username of 2–24 letters or numbers.");
  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  if (!PIN_RE.test(pin)) return fail("The PIN is 4 to 6 digits.");

  const [user] = await q<any>(
    "select id, code, handle, status, pin_hash, failed_pins, locked_until > now() as locked from contributors where handle_key = $1",
    [handle.toLowerCase()]);

  if (user) {
    if (user.locked) return fail(`Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`, 429);
    if (!checkPin(pin, user.pin_hash)) {
      await q(`update contributors set
                 locked_until = case when failed_pins + 1 >= $2 then now() + ($3::text || ' minutes')::interval else locked_until end,
                 failed_pins = case when failed_pins + 1 >= $2 then 0 else failed_pins + 1 end
               where id = $1`, [user.id, MAX_WRONG_PINS, String(LOCK_MINUTES)]);
      return fail("That username is taken and the PIN does not match. If it is not you, choose another username.", 401);
    }
    await q("update contributors set failed_pins = 0, locked_until = null where id = $1", [user.id]);
    await startSession(user.id);
    return json({ me: { id: user.id, code: user.code, handle: user.handle, status: user.status }, created: false });
  }

  if (!b.consent) return fail("New username: please tick the box to agree to how your answers will be used.", 400);
  const ipHash = await clientIpHash();
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int as n from contributors where ip_hash = $1 and created_at > now() - interval '1 day'", [ipHash]);
  if (n >= SIGNUPS_PER_NETWORK_PER_DAY) return fail("Too many new usernames from this network today. Sign in with an existing one.", 429);
  for (let i = 0; i < 5; i++) {
    try {
      const [me] = await q(
        `insert into contributors (code, handle, handle_key, token_hash, pin_hash, ip_hash)
         values ($1, $2, $3, $4, $5, $6) returning id, code, handle, status, created_at`,
        [newCode(), handle, handle.toLowerCase(), sha256(newKey()), hashPin(pin), ipHash]);
      await startSession(me.id);
      return json({ me, created: true });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("handle_key")) return fail("That username was just taken. Try another.", 409);
      if (!msg.includes("code")) throw e; // public-code collision: try another code
    }
  }
  return fail("Could not create your profile. Try again.", 500);
}

// Sign out on this device.
export async function DELETE() {
  const jar = await cookies();
  const key = jar.get(COOKIE)?.value;
  if (key) await q("delete from sessions where token_hash = $1", [sha256(key)]);
  jar.delete(COOKIE);
  return json({ ok: true });
}
