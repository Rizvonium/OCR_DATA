import { q } from "@/lib/db";
import { fail } from "@/lib/http";
import { isAdmin } from "@/lib/identity";

export const dynamic = "force-dynamic";

// The reviewed dataset as JSONL: one sample per line with its final text and the vote counts.
//   /api/export?key=ADMIN_KEY&status=verified,corrected&dataset=demo
export async function GET(req: Request) {
  if (!isAdmin(req)) return fail("Admin key required.", 401);
  const u = new URL(req.url);
  const statuses = (u.searchParams.get("status") || "verified,corrected").split(",");
  const dataset = u.searchParams.get("dataset");
  const rows = await q(
    `select c.id, c.dataset, c.font, c.kind, c.image_url, c.context_url, c.proposed_text, c.final_text, c.status,
            c.n_correct::int, c.n_incorrect::int, c.n_bad_crop::int, c.top_correction, c.source_ref,
            (select json_agg(json_build_object('code', k.code, 'handle', k.handle, 'verdict', a.verdict,
                     'correction', a.correction, 'bad_crop', a.bad_crop, 'at', a.created_at) order by a.created_at)
               from answers a join contributors k on k.id = a.contributor_id
              where a.sample_id = c.id and a.verdict <> 'skip') as answers
     from sample_consensus c where (c.status = any($1::text[]) or 'all' = any($1::text[])) and ($2::text is null or c.dataset = $2)
     order by c.id`, [statuses, dataset]);
  const out = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  return new Response(out, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="kashmiri-ocr-reviewed-${new Date().toISOString().slice(0, 10)}.jsonl"`,
    },
  });
}
