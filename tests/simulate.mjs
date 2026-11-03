#!/usr/bin/env node
// End-to-end check of a running app with simulated people (needs a manifest with `truth`):
//   node tests/simulate.mjs http://localhost:3000 path/to/manifest.jsonl [answersPerPerson]
// Four careful reviewers answer from the known truth (one types corrections), one spammer
// presses "correct" as fast as possible. Prints each person's stats and the crowd's decisions.
import fs from "node:fs";

const [base = "http://localhost:3000", manifest, perArg] = process.argv.slice(2);
const PER = Number(perArg || 24);
const truth = new Map(fs.readFileSync(manifest, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.id, r]; }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function person(name, { careful, types, delay }) {
  let cookie = "";
  const call = async (path, method = "GET", body) => {
    const r = await fetch(base + path, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body && JSON.stringify(body) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
  const j = await call("/api/session", "POST", { handle: name, consent: true });
  if (j.status !== 200) throw new Error(`${name}: join ${j.status} ${JSON.stringify(j.data)}`);
  let refused = 0, golds = 0, goldOk = 0;
  for (let i = 0; i < PER; i++) {
    const { data } = await call("/api/task");
    const t = data.task; if (!t) break;
    await sleep(delay);
    const rec = truth.get(t.id);
    let body = { sampleId: t.id, ticket: t.ticket, verdict: "correct" };
    if (careful && rec) {
      const goldText = rec.truth ?? rec.text;
      if (goldText !== t.proposed_text) body = { ...body, verdict: "incorrect", correction: types ? goldText : undefined };
    }
    const r = await call("/api/answer", "POST", body);
    if (r.status === 429) { refused++; continue; }
    if (r.status !== 200) throw new Error(`${name}: answer ${r.status} ${JSON.stringify(r.data)}`);
    if (r.data.gold) { golds++; goldOk += r.data.gold.pass ? 1 : 0; }
  }
  const me = (await call("/api/session")).data;
  return { name, code: me.me.code, reviews: me.stats.reviews, points: me.stats.points, golds: `${goldOk}/${golds}`, trust: +me.stats.trust.toFixed(2), flags: me.stats.flags, refused };
}

const stamp = Date.now().toString(36).slice(-4);
const people = await Promise.all([
  person(`Careful${stamp}A`, { careful: true, types: true, delay: 1300 }),
  person(`Careful${stamp}B`, { careful: true, types: true, delay: 1400 }),
  person(`Careful${stamp}C`, { careful: true, types: false, delay: 1500 }),
  person(`Careful${stamp}D`, { careful: true, types: true, delay: 1350 }),
  person(`Spammer${stamp}`, { careful: false, types: false, delay: 0 }),
]);
console.table(people);
console.log("progress:", JSON.stringify((await (await fetch(base + "/api/progress")).json()).status));
console.log("leaderboard:", (await (await fetch(base + "/api/leaderboard")).json()).rows.map((r) => `${r.handle}:${r.points}`).join("  "));
