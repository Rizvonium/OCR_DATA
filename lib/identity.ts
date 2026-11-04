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

export function isAdmin(req: Request): boolean {
  const want = process.env.ADMIN_KEY;
  if (!want) return process.env.NODE_ENV !== "production"; // open locally, locked in production
  const got = req.headers.get("x-admin-key") || new URL(req.url).searchParams.get("key") || "";
  const a = Buffer.from(sha256(got)), b = Buffer.from(sha256(want));
  return crypto.timingSafeEqual(a, b);
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
