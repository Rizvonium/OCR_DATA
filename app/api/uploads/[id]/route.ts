import { q } from "@/lib/db";
import { fail } from "@/lib/http";
import { currentContributor, isAdmin } from "@/lib/identity";

export const dynamic = "force-dynamic";

// The photo (or ?size=thumb), for its uploader and for the admin (?key=ADMIN_KEY).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return fail("Not found.", 404);
  const thumb = new URL(req.url).searchParams.get("size") === "thumb";
  const [u] = await q<any>(`select contributor_id, mime, url, ${thumb ? "thumb as bytes_" : "data as bytes_"} from uploads where id = $1`, [id]);
  if (!u) return fail("Not found.", 404);
  if (!isAdmin(req)) {
    const me = await currentContributor();
    if (!me || me.id !== u.contributor_id) return fail("Not yours.", 403);
  }
  if (!thumb && u.url) return Response.redirect(u.url, 302);
  const body = u.bytes_ as Uint8Array | null;
  if (!body) return fail("Not found.", 404);
  return new Response(Buffer.from(body), {
    headers: { "content-type": thumb ? "image/jpeg" : u.mime, "cache-control": "private, max-age=86400" },
  });
}

// Remove one of your own photos while it has not been used yet.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentContributor();
  if (!me) return fail("Sign in first.", 401);
  const r = await q("delete from uploads where id = $1 and contributor_id = $2 and status in ('new', 'rejected') returning id",
    [Number((await ctx.params).id), me.id]);
  return r.length ? new Response(null, { status: 204 }) : fail("Not found, or already in use.", 404);
}
