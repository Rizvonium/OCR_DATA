// Contributor identity: a username and a PIN, nothing else.
// Signing in gives the browser a random session key in an httpOnly cookie; the database keeps only
// its SHA-256 hash (table `sessions`), and the PIN only as a salted scrypt hash.
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { q } from "./db";

export const COOKIE = "ks_key";
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const newKey = () => "ks_" + crypto.randomBytes(24).toString("base64url");
export function newCode() {
  const b = crypto.randomBytes(6);
  return "KS-" + Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export type Me = { id: string; code: string; handle: string; status: string; email: string | null; created_at: string };

export async function currentContributor(): Promise<Me | null> {
  const key = (await cookies()).get(COOKIE)?.value;
  if (!key) return null;
  const h = sha256(key);
  const rows = await q<Me>(
    `update contributors set last_seen_at = now()
     where id = (select contributor_id from sessions where token_hash = $1) or token_hash = $1
     returning id, code, handle, status, email, created_at`, [h]);
  return rows[0] ?? null;
}

export async function setKeyCookie(key: string) {
  (await cookies()).set(COOKIE, key, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400,
  });
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "local").split(",")[0].trim();
  return sha256((process.env.IP_SALT || "ks-ocr-data") + ip).slice(0, 32);
}

export function cleanHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (h.length < 2 || h.length > 24) return null;
  if (!/^[\p{L}\p{M}\p{N} _.\-]+$/u.test(h)) return null;
  return h;
}

// Admin: the ADMIN_KEY itself (header x-admin-key or ?key=, for scripts and Google Sheets), or the
// admin cookie set by signing in on /admin. The cookie holds a hash derived from the key, never the key,
// and stops working as soon as ADMIN_KEY is changed.
export const ADMIN_COOKIE = "ks_admin";
export const adminToken = (key: string) => sha256("ks-admin-session:" + key);
const same = (a: string, b: string) => crypto.timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));

export function adminKeyMatches(got: string): boolean {
  const want = process.env.ADMIN_KEY;
  if (!want) return process.env.NODE_ENV !== "production"; // open locally, locked in production
  return same(got, want);
}

export function isAdmin(req: Request): boolean {
  const want = process.env.ADMIN_KEY;
  if (!want) return process.env.NODE_ENV !== "production";
  const got = req.headers.get("x-admin-key") || new URL(req.url).searchParams.get("key") || "";
  if (got && same(got, want)) return true;
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(ADMIN_COOKIE + "="));
  return !!cookie && same(decodeURIComponent(cookie.slice(ADMIN_COOKIE.length + 1)), adminToken(want));
}

// ---------------------------------------------------------------- PIN
export const PIN_RE = /^\d{4,6}$/;
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 32).toString("hex")}`;
}
export function checkPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hex] = stored.split(":");
  const a = crypto.scryptSync(pin, salt, 32), b = Buffer.from(hex, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Starts a signed-in session in this browser. */
export async function startSession(contributorId: string) {
  const key = newKey();
  await q("insert into sessions (token_hash, contributor_id) values ($1, $2)", [sha256(key), contributorId]);
  await setKeyCookie(key);
}
