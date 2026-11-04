import { cookies } from "next/headers";
import { body, fail, json } from "@/lib/http";
import { ADMIN_COOKIE, adminKeyMatches, adminToken, isAdmin } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Is this browser signed in as admin?
export async function GET(req: Request) {
  return json({ admin: isAdmin(req), configured: !!process.env.ADMIN_KEY });
}

// Sign in as admin with ADMIN_KEY; the browser keeps an admin cookie for 30 days.
export async function POST(req: Request) {
  const { key } = await body(req);
  if (typeof key !== "string" || !adminKeyMatches(key)) {
    await new Promise((r) => setTimeout(r, 1200)); // slows down guessing
    return fail(process.env.ADMIN_KEY ? "Wrong admin key." : "ADMIN_KEY is not set in Vercel yet.", 401);
  }
  (await cookies()).set(ADMIN_COOKIE, adminToken(process.env.ADMIN_KEY || "dev"), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return json({ admin: true });
}

export async function DELETE() {
  (await cookies()).delete(ADMIN_COOKIE);
  return json({ admin: false });
}
