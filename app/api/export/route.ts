import { q } from "@/lib/db";
import { fail } from "@/lib/http";
import { isAdmin } from "@/lib/identity";

export const dynamic = "force-dynamic";

// Reviewed data, for training or for looking at in a spreadsheet.
//   /api/export?key=ADMIN_PASSWORD&status=verified,corrected            one JSON line per picture (JSONL)
//   /api/export?key=ADMIN_PASSWORD&format=csv                           one row per picture (CSV)
//   /api/export?key=ADMIN_PASSWORD&format=csv&view=answers              one row per answer: who, what, right or wrong
// In Google Sheets: =IMPORTDATA("https://<site>/api/export?key=...&format=csv&view=answers") keeps a live copy.
// &status=all includes every picture; &dataset=NAME limits to one dataset.

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], cols: string[]) =>
  "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";

export async function GET(req: Request) {
  if (!isAdmin(req)) return fail("Admin key required.", 401);
  const u = new URL(req.url);
  const csv = u.searchParams.get("format") === "csv";
  const view = u.searchParams.get("view") === "answers" ? "answers" : "samples";
  const statuses = (u.searchParams.get("status") || (csv ? "all" : "verified,corrected")).split(",");
  const dataset = u.searchParams.get("dataset");
  const day = new Date().toISOString().slice(0, 10);

  if (view === "answers") {
    const rows = await q(
      `select a.created_at as time, k.handle as reviewer, k.code as reviewer_code,
              c.id as picture_id, c.dataset, c.font, c.kind, c.proposed_text as typed_text, a.verdict as answer,
              a.correction, a.bad_crop, round(a.ms_spent / 1000.0, 1) as seconds, a.is_gold as check_item,
              case when s.is_gold then (case when s.gold_verdict = 'correct' then s.proposed_text else s.gold_text end) else c.final_text end as right_text,
              case when a.verdict = 'skip' then null when s.is_gold then a.gold_pass
                   when c.status = 'verified' then a.verdict = 'correct'
                   when c.status in ('corrected', 'needs_text') then a.verdict = 'incorrect' end as was_right,
              c.status as picture_status, c.image_url
       from answers a join contributors k on k.id = a.contributor_id join samples s on s.id = a.sample_id
       join sample_consensus c on c.id = a.sample_id
       where ($1::text is null or c.dataset = $1) order by a.created_at`, [dataset]);
    const origin = u.origin;
    for (const r of rows as any[]) if (typeof r.image_url === "string" && r.image_url.startsWith("/")) r.image_url = origin + r.image_url;
    if (csv) {
      const cols = ["time", "reviewer", "reviewer_code", "picture_id", "dataset", "font", "kind", "typed_text", "answer",
        "correction", "bad_crop", "seconds", "check_item", "right_text", "was_right", "picture_status", "image_url"];
      return new Response(toCsv(rows, cols), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kashmiri-ocr-answers-${day}.csv"` } });
    }
    return new Response(rows.map((r) => JSON.stringify(r)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson; charset=utf-8", "content-disposition": `attachment; filename="kashmiri-ocr-answers-${day}.jsonl"` } });
  }

  const rows = await q(
    `select c.id, c.dataset, c.font, c.kind, c.image_url, c.context_url, c.proposed_text, c.final_text, c.status,
            c.n_correct::int, c.n_incorrect::int, c.n_bad_crop::int, c.top_correction, c.source_ref,
            (select json_agg(json_build_object('code', k.code, 'handle', k.handle, 'verdict', a.verdict,
                     'correction', a.correction, 'bad_crop', a.bad_crop, 'at', a.created_at) order by a.created_at)
               from answers a join contributors k on k.id = a.contributor_id
              where a.sample_id = c.id and a.verdict <> 'skip') as answers
     from sample_consensus c where (c.status = any($1::text[]) or 'all' = any($1::text[])) and ($2::text is null or c.dataset = $2)
     order by c.id`, [statuses, dataset]);
  if (csv) {
    const abs = (x: unknown) => (typeof x === "string" && x.startsWith("/") ? u.origin + x : x);
    const flat = (rows as any[]).map((r) => ({
      ...r, image_url: abs(r.image_url), reviewers: (r.answers || []).map((a: any) => `${a.handle} (${a.code}): ${a.verdict}${a.correction ? " → " + a.correction : ""}`).join(" | "),
    }));
    const cols = ["id", "dataset", "font", "kind", "proposed_text", "final_text", "status", "n_correct", "n_incorrect", "n_bad_crop", "top_correction", "reviewers", "image_url"];
    return new Response(toCsv(flat, cols), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kashmiri-ocr-pictures-${day}.csv"` } });
  }
  const out = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  return new Response(out, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "content-disposition": `attachment; filename="kashmiri-ocr-reviewed-${day}.jsonl"` },
  });
}
