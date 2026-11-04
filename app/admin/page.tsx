"use client";
import { useCallback, useEffect, useState } from "react";

type Person = {
  code: string; handle: string; status: string; reviews: number; skips: number; corrections: number; confirmed_corrections: number;
  gold_total: number; gold_pass: number; agreement_n: number; agreement_hits: number; median_ms: number | null; pct_correct: number | null;
  last_hour: number; last_day: number; trust: number; flags: string[];
};
type Data = { people: Person[]; status: { dataset: string; status: string; n: number }[]; disputed: any[]; fonts: any[]; gold: number };

type Ans = { code: string; handle: string; verdict: string; correction: string | null; bad_crop: boolean; seconds: number; right: boolean | null };
const VERDICT: Record<string, string> = { correct: "✓ correct", incorrect: "✗ incorrect", skip: "skipped" };

function WhoAnswered({ adminKey }: { adminKey: string }) {
  const [only, setOnly] = useState<"gold" | "decided" | "all">("gold");
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    setRows(null);
    fetch(`/api/admin?view=answers&only=${only}`, { headers: { "x-admin-key": adminKey } }).then((r) => r.json()).then((j) => setRows(j.rows || []));
  }, [only, adminKey]);
  return (
    <>
      <h2>Who answered what</h2>
      <p className="muted small" style={{ marginTop: -4 }}>Every reviewer’s answer per picture. Green = right (matches the known answer, or what the crowd decided), red = wrong.</p>
      <div className="tabs">
        <button aria-pressed={only === "gold"} onClick={() => setOnly("gold")}>Known answers (check items)</button>
        <button aria-pressed={only === "decided"} onClick={() => setOnly("decided")}>Decided by the crowd</button>
        <button aria-pressed={only === "all"} onClick={() => setOnly("all")}>All</button>
      </div>
      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        {!rows ? <p className="muted" style={{ padding: 16 }}>Loading…</p> : rows.length === 0 ? <p className="muted" style={{ padding: 16 }}>No answers yet.</p> : (
          <table>
            <thead><tr><th>Picture</th><th>Typed text</th><th>Right answer</th><th>Answers</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <td><img src={r.image_url} alt="" style={{ maxHeight: 48, background: "#fff", borderRadius: 4 }} /><br /><span className="mono muted small">{r.id}</span>{r.font && <><br /><span className="small muted">{r.font}</span></>}</td>
                <td className="ks" style={{ fontSize: 22 }}>{r.proposed_text}</td>
                <td>{r.is_gold
                  ? <><span className="ks" style={{ fontSize: 22 }}>{r.known_text}</span><br /><span className="small muted">known · typed text was {r.gold_verdict}</span></>
                  : r.final_text ? <><span className="ks" style={{ fontSize: 22 }}>{r.final_text}</span><br /><span className="small muted">{r.status}</span></>
                  : <span className="small muted">{r.status}</span>}</td>
                <td>{(r.answers as Ans[]).map((a, i) => (
                  <div key={i} className={`ans ${a.right === true ? "yes" : a.right === false ? "no" : ""}`}>
                    <b>{a.handle}</b> <span className="mono muted">{a.code}</span> · {VERDICT[a.verdict]}
                    {a.correction && <> → <span className="ks" style={{ fontSize: 18 }}>{a.correction}</span></>}
                    {a.bad_crop && " · bad box"} <span className="muted">· {a.seconds}s</span>
                  </div>
                ))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function Admin() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async (k: string) => {
    setErr("");
    const r = await fetch("/api/admin", { headers: { "x-admin-key": k }, cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); setData(null); return; }
    setData(j);
    try { sessionStorage.setItem("adminKey", k); } catch {}
  }, []);
  useEffect(() => { let k = ""; try { k = sessionStorage.getItem("adminKey") || ""; } catch {} setKey(k); load(k); }, [load]);

  const post = async (body: unknown) => {
    const r = await fetch("/api/admin", { method: "POST", headers: { "x-admin-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); setMsg(r.ok ? JSON.stringify(j) : j.error); load(key);
  };

  if (!data) return (
    <form onSubmit={(e) => { e.preventDefault(); load(key); }} className="card panel" style={{ maxWidth: 420 }}>
      <h2>Admin</h2>
      <div className="field"><label htmlFor="ak">Admin key</label><input id="ak" type="password" className="input" value={key} onChange={(e) => setKey(e.target.value)} /></div>
      <button className="btn primary">Open</button>{err && <p className="err">{err}</p>}
    </form>
  );

  const ex = (s: string) => `/api/export?key=${encodeURIComponent(key)}&status=${s}`;
  return (
    <>
      <h1>Admin</h1>
      <p className="lede">Spam signals, the state of every dataset, and exports. Flags are automatic; only you block. Blocked people’s answers are ignored in every decision.</p>
      <div className="card panel" style={{ marginBottom: 18 }}>
        <h3>Export reviewed data (JSONL)</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn primary" href={ex("verified,corrected")}>Verified + corrected</a>
          <a className="btn" href={ex("needs_text,disputed")}>Wrong / disputed</a>
          <a className="btn" href={ex("bad_crop")}>Bad boxes</a>
          <a className="btn" href={ex("all")}>Everything, with every answer</a>
          <a className="btn" href={`/api/export?key=${encodeURIComponent(key)}&format=csv&view=answers`}>Answers sheet (CSV, one row per answer)</a>
          <a className="btn" href={`/api/export?key=${encodeURIComponent(key)}&format=csv`}>Pictures sheet (CSV)</a>
          <button className="btn ghost" onClick={() => post({ action: "promote_gold", limit: 50 })}>Make 50 unanimous items into check items ({data.gold} now)</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Live copy in Google Sheets: put this in cell A1 of an empty sheet —{" "}
          <code style={{ userSelect: "all", wordBreak: "break-all" }}>{`=IMPORTDATA("${typeof window !== "undefined" ? location.origin : ""}/api/export?key=${encodeURIComponent(key)}&format=csv&view=answers")`}</code>
          {" "}(it refreshes about every hour; keep that sheet private, it contains your admin key).</p>
        {msg && <p className="small muted">{msg}</p>}
      </div>

      <h2>Data per font</h2>
      <p className="muted small" style={{ marginTop: -4 }}>Only you see this; reviewers are never told the typeface.</p>
      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        <table>
          <thead><tr><th>Font</th><th className="num">Samples</th><th className="num">Words</th><th className="num">Lines</th><th className="num">Reviewed</th><th className="num">Verified / corrected</th><th className="num">Wrong / disputed</th><th className="num">Bad box</th></tr></thead>
          <tbody>{data.fonts.map((f) => (
            <tr key={f.font}><td><b>{f.font}</b></td><td className="num">{f.samples.toLocaleString()}</td><td className="num">{f.words.toLocaleString()}</td><td className="num">{f.lines.toLocaleString()}</td>
              <td className="num">{f.reviewed.toLocaleString()}</td><td className="num">{f.done.toLocaleString()}</td><td className="num">{f.wrong.toLocaleString()}</td><td className="num">{f.bad_crop.toLocaleString()}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        <table>
          <thead><tr><th>Dataset</th><th>Status</th><th className="num">Samples</th></tr></thead>
          <tbody>{data.status.map((s) => <tr key={s.dataset + s.status}><td>{s.dataset}</td><td>{s.status}</td><td className="num">{s.n}</td></tr>)}</tbody>
        </table>
      </div>

      <h2>Contributors</h2>
      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        <table>
          <thead><tr><th>Who</th><th>Flags</th><th className="num">Reviews</th><th className="num">Checks</th><th className="num">Agree</th><th className="num">Median s</th><th className="num">% “correct”</th><th className="num">Last hr</th><th className="num">Trust</th><th>Status</th></tr></thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={p.code}>
                <td><b>{p.handle}</b><br /><span className="mono muted">{p.code}</span></td>
                <td>{p.flags.map((f) => <span className="flag" key={f}>{f}</span>)}</td>
                <td className="num">{p.reviews}</td>
                <td className="num">{p.gold_pass}/{p.gold_total}</td>
                <td className="num">{p.agreement_n ? `${Math.round((100 * p.agreement_hits) / p.agreement_n)}%` : "—"}</td>
                <td className="num">{p.median_ms == null ? "—" : (p.median_ms / 1000).toFixed(1)}</td>
                <td className="num">{p.pct_correct ?? "—"}</td>
                <td className="num">{p.last_hour}</td>
                <td className="num">{p.trust.toFixed(2)}</td>
                <td>
                  <select value={p.status} onChange={(e) => post({ action: "status", code: p.code, status: e.target.value })} className="input" style={{ height: 32, padding: "0 6px" }}>
                    <option value="active">active</option><option value="flagged">flagged</option><option value="blocked">blocked</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WhoAnswered adminKey={key} />

      <h2>Needs a look</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Picture</th><th>Typed</th><th className="num">✓</th><th className="num">✗</th><th className="num">Box</th><th>Top correction</th><th>Status</th></tr></thead>
          <tbody>{data.disputed.map((d) => (
            <tr key={d.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td><img src={d.image_url} alt="" style={{ maxHeight: 44, background: "#fff", borderRadius: 4 }} /><br /><span className="mono muted small">{d.id}</span></td>
              <td className="ks" style={{ fontSize: 22 }}>{d.proposed_text}</td>
              <td className="num">{d.n_correct}</td><td className="num">{d.n_incorrect}</td><td className="num">{d.n_bad_crop}</td>
              <td className="ks" style={{ fontSize: 22 }}>{d.top_correction ? `${d.top_correction} (${d.top_correction_votes})` : "—"}</td>
              <td>{d.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
