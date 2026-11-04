// Serving pictures to review and recording answers.
import crypto from "node:crypto";
import { q } from "./db";
import { checkCorrection, normalizeKs, sameText } from "./kashmiri";

const SECRET = process.env.TASK_SECRET || process.env.ADMIN_KEY || "ks-ocr-data-dev-secret";
const GOLD_SHARE = Number(process.env.GOLD_SHARE || 0.12); // ~1 in 8 items is a check item
const PER_MINUTE = Number(process.env.MAX_ANSWERS_PER_MINUTE || 30);

export type Task = {
  id: string; kind: string; image_url: string; context_url: string | null;
  proposed_text: string; ticket: string;
};

// A ticket ties an answer to the person and picture it was served for, and carries the time it was
// served, so answer speed is measured by the server rather than trusted from the browser.
function sign(cid: string, sid: string, t: number) {
  return crypto.createHmac("sha256", SECRET).update(`${cid}|${sid}|${t}`).digest("base64url").slice(0, 22);
}
const makeTicket = (cid: string, sid: string) => { const t = Date.now(); return `${t}.${sign(cid, sid, t)}`; };
function readTicket(cid: string, sid: string, ticket: unknown): number | null {
  if (typeof ticket !== "string") return null;
  const [ts, mac] = ticket.split(".");
  const t = Number(ts);
  if (!t || !mac || mac.length !== 22) return null;
  const want = sign(cid, sid, t);
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  return Date.now() - t;
}

// Only what a reviewer needs. Dataset, font and gold status stay on the server, so nothing hints at
// the typeface or at which pictures are check items.
const COLS = "id, kind, image_url, context_url, proposed_text";

export async function nextTask(cid: string, exclude: string[] = []): Promise<Task | null> {
  const [{ n }] = await q<{ n: number }>(
    "select count(*)::int as n from answers where contributor_id = $1", [cid]);
  // check items: the 3rd and 7th answer of every newcomer, then a random ~12%
  const wantGold = n === 2 || n === 6 || (n >= 10 && Math.random() < GOLD_SHARE);
  const gold = () => q<any>(
    `select ${COLS} from samples s where is_gold and not (id = any($2::text[]))
       and not exists (select 1 from answers a where a.sample_id = s.id and a.contributor_id = $1)
     order by (gold_verdict = 'incorrect' and random() < 0.6) desc, random() limit 1`, [cid, exclude]);
  // (known-wrong check items are favoured: they are what catches "always press Correct")
  // regular items: random, but leaning towards pictures that already have some reviews so each one
  // reaches a decision sooner; never one this person has answered
  const regular = () => q<any>(
    `select ${COLS} from samples s where not is_gold and review_count < target_reviews and not (id = any($2::text[]))
       and not exists (select 1 from answers a where a.sample_id = s.id and a.contributor_id = $1)
     order by review_count + random() * 1.6 desc limit 1`, [cid, exclude]);
  let rows = wantGold ? await gold() : await regular();
  if (!rows.length) rows = wantGold ? await regular() : await gold();
  if (!rows.length) return null;
  return { ...rows[0], ticket: makeTicket(cid, rows[0].id) };
}

export type AnswerIn = { sampleId: string; ticket: string; verdict: string; correction?: string; badCrop?: boolean };
export type AnswerOut =
  | { ok: true; gold: null | { pass: boolean | null; verdict: string; text: string } }
  | { ok: false; status: number; error: string };

export async function submitAnswer(cid: string, a: AnswerIn): Promise<AnswerOut> {
  if (!["correct", "incorrect", "skip"].includes(a.verdict)) return { ok: false, status: 400, error: "Unknown answer." };
  const ms = readTicket(cid, a.sampleId, a.ticket);
  if (ms === null) return { ok: false, status: 400, error: "This picture was not served to you. Reload and try again." };
  const [{ recent }] = await q<{ recent: number }>(
    "select count(*)::int as recent from answers where contributor_id = $1 and created_at > now() - interval '1 minute'", [cid]);
  if (recent >= PER_MINUTE) return { ok: false, status: 429, error: "That is very fast. Take a breath and look closely at each picture." };
  const [s] = await q<any>("select id, proposed_text, is_gold, gold_verdict, gold_text from samples where id = $1", [a.sampleId]);
  if (!s) return { ok: false, status: 404, error: "That picture no longer exists." };

  let verdict = a.verdict;
  let correction: string | null = null;
  const badCrop = verdict === "incorrect" && !!a.badCrop;
  if (verdict === "incorrect" && a.correction && a.correction.trim()) {
    correction = normalizeKs(a.correction);
    const err = checkCorrection(correction);
    if (err) return { ok: false, status: 400, error: err };
    // "incorrect" but typed exactly the proposed text, with a good crop: that is a "correct"
    if (sameText(correction, s.proposed_text)) { correction = null; if (!badCrop) verdict = "correct"; }
  }

  let goldPass: boolean | null = null;
  if (s.is_gold && verdict !== "skip" && s.gold_verdict) {
    goldPass = verdict === s.gold_verdict && (verdict === "correct" || !correction || sameText(correction, s.gold_text || ""));
  }
  const ins = await q(
    `insert into answers (sample_id, contributor_id, verdict, correction, bad_crop, ms_spent, is_gold, gold_pass)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (sample_id, contributor_id) do nothing returning id`,
    [s.id, cid, verdict, correction, badCrop, Math.min(ms, 3_600_000), s.is_gold, goldPass]);
  if (!ins.length) return { ok: false, status: 409, error: "You already answered this one." };
  // A check item that most people "fail" probably has a wrong stored answer (e.g. a vowel sign the
  // font printed too faintly to see). After 3 answers with fewer than half passing it stops being a
  // check item; nobody keeps a penalty and the answers count as ordinary votes.
  if (s.is_gold) {
    const retired = await q(
      `update samples set is_gold = false where id = $1 and (
         select count(*) >= 3 and count(*) filter (where gold_pass) * 2 < count(*)
         from answers where sample_id = $1 and is_gold and gold_pass is not null) returning id`, [s.id]);
    if (retired.length) await q("update answers set is_gold = false, gold_pass = null where sample_id = $1", [s.id]);
  }
  return {
    ok: true,
    gold: s.is_gold && verdict !== "skip"
      ? { pass: goldPass, verdict: s.gold_verdict, text: s.gold_verdict === "correct" ? s.proposed_text : (s.gold_text || "") }
      : null,
  };
}

export async function myStats(cid: string) {
  const [s] = await q<any>(
    `select f.reviews::int, f.corrections::int, f.confirmed_corrections::int, f.gold_total::int, f.gold_pass::int,
            f.agreement_n::int, f.agreement_hits::int, f.last_day::int as today, f.flags, f.trust::float,
            l.points::int as points,
            (select count(*)::int + 1 from leaderboard x where x.points > coalesce(l.points, -1)) as rank,
            (select count(*)::int from leaderboard) as ranked,
            (select count(*)::int from uploads u where u.contributor_id = f.id) as photos
     from contributor_flags f left join leaderboard l on l.code = f.code where f.id = $1`, [cid]);
  return s ?? null;
}
