// Saving and reading uploaded page photos.
// With BLOB_READ_WRITE_TOKEN set (Vercel → Storage → Blob → connect), photos go to Vercel Blob and
// only their URL is kept; otherwise the photo bytes are kept in the database (fine for a few hundred).
import crypto from "node:crypto";
import { q } from "./db";

export const MAX_BYTES = 4 * 1024 * 1024;        // after the browser has shrunk the photo
export const PER_DAY = Number(process.env.MAX_UPLOADS_PER_DAY || 80);
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function size(buf: Buffer, mime: string): { w: number; h: number } | null {
  if (mime === "image/png" && buf.length > 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (mime === "image/webp" && buf.length > 30 && buf.toString("ascii", 12, 16) === "VP8X") {
    return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return mime === "image/webp" ? { w: 0, h: 0 } : null;
}

export type NewUpload = { photo: Buffer; mime: string; thumb: Buffer; source?: string; page?: string; note?: string; quality?: unknown };

export async function saveUpload(cid: string, u: NewUpload): Promise<{ ok: true; id: number; duplicate: boolean } | { ok: false; status: number; error: string }> {
  if (!MIME.has(u.mime)) return { ok: false, status: 400, error: "Only JPEG, PNG or WebP photos." };
  if (u.photo.length > MAX_BYTES) return { ok: false, status: 413, error: "That photo is too large even after shrinking. Try a smaller one." };
  if (u.photo.length < 10_000) return { ok: false, status: 400, error: "That photo is too small to read." };
  const dim = size(u.photo, u.mime);
  if (!dim) return { ok: false, status: 400, error: "That file is not a readable photo." };
  if (dim.w && Math.min(dim.w, dim.h) < 500) return { ok: false, status: 400, error: "The photo is too small (needs at least 500 pixels on each side)." };
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int as n from uploads where contributor_id = $1 and created_at > now() - interval '1 day'", [cid]);
  if (n >= PER_DAY) return { ok: false, status: 429, error: `You have uploaded ${PER_DAY} photos today. Thank you! Please continue tomorrow.` };
  const sha = crypto.createHash("sha256").update(u.photo).digest("hex");
  const [dup] = await q<{ id: number }>("select id from uploads where sha256 = $1", [sha]);
  if (dup) return { ok: true, id: dup.id, duplicate: true };

  let url: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const ext = u.mime === "image/png" ? "png" : u.mime === "image/webp" ? "webp" : "jpg";
    url = (await put(`pages/${sha.slice(0, 2)}/${sha}.${ext}`, u.photo, { access: "public", contentType: u.mime, addRandomSuffix: true })).url;
  }
  const clean = (s?: string) => (s ? s.normalize("NFC").trim().slice(0, 160) || null : null);
  const [row] = await q<{ id: number }>(
    `insert into uploads (contributor_id, sha256, mime, bytes, width, height, source, page, note, quality, url, data, thumb)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, ($10::text)::jsonb, $11, $12, $13)
     on conflict (sha256) do update set sha256 = excluded.sha256 returning id`,
    [cid, sha, u.mime, u.photo.length, dim.w, dim.h, clean(u.source), clean(u.page), clean(u.note),
     JSON.stringify(u.quality ?? {}), url, url ? null : u.photo, u.thumb]);
  return { ok: true, id: row.id, duplicate: false };
}
