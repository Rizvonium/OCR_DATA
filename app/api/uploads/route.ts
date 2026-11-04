import { q } from "@/lib/db";
import { fail, json } from "@/lib/http";
import { currentContributor } from "@/lib/identity";
import { MAX_BYTES, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Upload one page photo (multipart form: photo, thumb, source, page, note, quality).
export async function POST(req: Request) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  if (me.status === "blocked") return fail("This profile is paused. Contact the project team.", 403);
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES + 512 * 1024) return fail("That photo is too large.", 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("Could not read the upload. Try again."); }
  const photo = form.get("photo"), thumb = form.get("thumb");
  if (!(photo instanceof Blob) || !(thumb instanceof Blob)) return fail("No photo received.");
  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : undefined; };
  let quality: unknown = {};
  try { quality = JSON.parse(str("quality") || "{}"); } catch {}
  const r = await saveUpload(me.id, {
    photo: Buffer.from(await photo.arrayBuffer()), mime: photo.type, thumb: Buffer.from(await thumb.arrayBuffer()),
    source: str("source"), page: str("page"), note: str("note"), quality,
  });
  if (!r.ok) return fail(r.error, r.status);
  return json({ id: r.id, duplicate: r.duplicate });
}

// Your own uploads (newest first).
export async function GET() {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  const rows = await q(
    `select id, source, page, width, height, bytes, status, created_at from uploads where contributor_id = $1 order by created_at desc limit 200`, [me.id]);
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from uploads where contributor_id = $1", [me.id]);
  return json({ rows, total: n });
}
