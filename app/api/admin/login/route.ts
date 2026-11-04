import { cookies } from "next/headers";
import { body, fail, json } from "@/lib/http";
import { ADMIN_COOKIE, adminLoginMatches, adminToken, isAdmin } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Is this browser signed in as the admin?
export async function GET(req: Request) {
  return json({ admin: isAdmin(req) });
}

// Sign in as the admin with username + password; the browser keeps an admin cookie for 30 days.
export async function POST(req: Request) {
  const { user, password } = await body(req);
  if (typeof user !== "string" || typeof password !== "string" || !adminLoginMatches(user, password)) {
    await new Promise((r) => setTimeout(r, 1200)); // slows down guessing
    return fail("Wrong admin username or password.", 401);
  }
  (await cookies()).set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return json({ admin: true });
}

export async function DELETE() {
  (await cookies()).delete(ADMIN_COOKIE);
  return json({ admin: false });
}
