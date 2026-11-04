import { json } from "@/lib/http";
import { cleanHandle, findByName } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Live check while someone types a new username: is it free?
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("handle") || "";
  const handle = cleanHandle(raw);
  if (!handle) return json({ available: false, reason: "2–24 letters or numbers (spaces, . _ - allowed)." });
  const user = await findByName(handle);
  return json(user ? { available: false, reason: `“${user.handle}” is already registered.`, taken: user.handle } : { available: true });
}
