"use client";
import { useCallback, useEffect, useState } from "react";

// Admin area: sign in with the admin username + password (kept as an httpOnly cookie for 30 days), then four tabs.
const get = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());
const post = (body: unknown) => fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const day = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const VERDICT: Record<string, string> = { correct: "✓ correct", incorrect: "✗ incorrect", skip: "skipped" };
type Tab = "people" | "answers" | "photos" | "data";

export default function Admin() {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => { get("/api/admin/login").then((r) => setState(r.admin ? "in" : "out")); }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, password }) });
    if (r.ok) { setPassword(""); setState("in"); } else setErr((await r.json()).error);
  }
  async function signOut() { await fetch("/api/admin/login", { method: "DELETE" }); setState("out"); }

  if (state === "loading") return null;
  if (state === "out") return (
    <form onSubmit={signIn} className="card panel admin-login">
      <h2>🔒 Admin sign-in</h2>
      <p className="muted small">Only for the project admin.</p>
      <div className="field"><label htmlFor="au">Admin username</label>
        <input id="au" className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus /></div>
      <div className="field"><label htmlFor="ap">Password</label>
        <input id="ap" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
      <button className="btn primary" style={{ width: "100%" }} disabled={!user || !password}>Sign in as admin</button>
      {err && <p className="err">{err}</p>}
    </form>
  );

  const openPerson = (code: string) => { setWho(code); setTab("answers"); };
  return (
    <>
      <div className="admin-head">
        <h1>Admin</h1>
        <button className="btn ghost" onClick={signOut}>Sign out of admin</button>
      </div>
      <div className="tabs admin-tabs">
        {([["people", "People"], ["answers", "Answers"], ["photos", "Photos"], ["data", "Data & export"]] as [Tab, string][]).map(([t, l]) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>
      {tab === "people" && <People onOpen={openPerson} />}
      {tab === "answers" && <Answers who={who} clearWho={() => setWho(null)} />}
      {tab === "photos" && <Photos />}
      {tab === "data" && <Data />}
    </>
  );
}

function People({ onOpen }: { onOpen: (code: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");
  const load = useCallback(() => get("/api/admin").then((r) => setRows(r.people)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (body: any, done: string) => { const r = await post(body); setMsg(r.error || done); load(); };
  const resetPin = (p: any) => {
    const pin = prompt(`New PIN for ${p.handle} (4–6 digits). Tell them the new PIN; they will be signed out on every device.`);
    if (pin) act({ action: "reset_pin", code: p.code, pin }, `PIN for ${p.handle} changed.`);
  };
  const shown = (rows || []).filter((p) => !filter || p.handle.toLowerCase().includes(filter.toLowerCase()) || p.code.includes(filter.toUpperCase()));
  return (
    <>
      <p className="muted small">Everyone who joined. PINs are stored scrambled one-way and cannot be shown; use <b>Reset PIN</b> to give someone a new one.</p>
      <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Search name or code" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {msg && <p className="small" style={{ color: "var(--ok-text)" }}>{msg}</p>}
      <div className="card" style={{ overflowX: "auto" }}>
        {!rows ? <p className="muted" style={{ padding: 16 }}>Loading…</p> : (
          <table className="admin-table">
            <thead><tr><th>Person</th><th>Joined / last seen</th><th className="num">Reviews</th><th className="num">Points</th><th className="num">Checks</th><th className="num">Agree</th><th className="num">Sec/answer</th><th className="num">Photos</th><th>Sign-in</th><th>Flags</th><th>Status</th><th></th></tr></thead>
            <tbody>{shown.map((p) => (
              <tr key={p.code}>
                <td><b>{p.handle}</b><br /><span className="mono muted">{p.code}</span></td>
                <td className="small">{day(p.created_at)}<br /><span className="muted">{day(p.last_seen_at)}</span></td>
                <td className="num">{p.reviews}{p.corrections ? <><br /><span className="muted small">{p.corrections} fixes</span></> : null}</td>
                <td className="num">{p.points ?? "—"}</td>
                <td className="num">{p.gold_pass}/{p.gold_total}</td>
                <td className="num">{p.agreement_n ? `${Math.round((100 * p.agreement_hits) / p.agreement_n)}%` : "—"}</td>
                <td className="num">{p.median_ms == null ? "—" : (p.median_ms / 1000).toFixed(1)}</td>
                <td className="num">{p.photos}</td>
                <td className="small">{p.has_pin ? "PIN set" : <span className="flag">no PIN yet</span>}{p.locked && <span className="flag">locked</span>}<br /><span className="muted">{p.devices} device{p.devices === 1 ? "" : "s"}</span></td>
                <td>{p.flags.map((f: string) => <span className="flag" key={f}>{f}</span>)}</td>
                <td><select value={p.status} className="input" style={{ height: 32, padding: "0 6px" }} onChange={(e) => act({ action: "status", code: p.code, status: e.target.value }, `${p.handle} is now ${e.target.value}.`)}>
                  <option value="active">active</option><option value="flagged">flagged</option><option value="blocked">blocked</option></select></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn" style={{ height: 32, padding: "0 10px" }} onClick={() => onOpen(p.code)}>Answers</button>{" "}
                  <button className="btn ghost" style={{ height: 32, padding: "0 10px" }} onClick={() => resetPin(p)}>Reset PIN</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Answers({ who, clearWho }: { who: string | null; clearWho: () => void }) {
  const [only, setOnly] = useState<"all" | "gold" | "decided">("all");
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    setRows(null);
    get(`/api/admin?view=answers&only=${only}${who ? `&who=${encodeURIComponent(who)}` : ""}`).then((j) => setRows(j.rows || []));
  }, [only, who]);
  return (
    <>
      <p className="muted small">Every picture with every person’s answer. Green = right (the known answer on check items, otherwise what the crowd decided), red = wrong.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button aria-pressed={only === "all"} onClick={() => setOnly("all")}>All</button>
          <button aria-pressed={only === "gold"} onClick={() => setOnly("gold")}>Check items</button>
          <button aria-pressed={only === "decided"} onClick={() => setOnly("decided")}>Decided</button>
        </div>
        {who && <span className="chip">Only pictures answered by <b className="mono">{who}</b> <button className="btn ghost" style={{ height: 24, padding: "0 6px" }} onClick={clearWho}>✕</button></span>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {!rows ? <p className="muted" style={{ padding: 16 }}>Loading…</p> : rows.length === 0 ? <p className="muted" style={{ padding: 16 }}>No answers yet.</p> : (
          <table>
            <thead><tr><th>Picture</th><th>Typed text</th><th>Right answer</th><th>Answers</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <td><a href={r.image_url} target="_blank" rel="noreferrer"><img src={r.image_url} alt="" style={{ maxHeight: 48, background: "#fff", borderRadius: 4 }} /></a><br /><span className="mono muted small">{r.id}</span>{r.font && <><br /><span className="small muted">{r.font}</span></>}</td>
                <td className="ks" style={{ fontSize: 22 }}>{r.proposed_text}</td>
                <td>{r.is_gold
                  ? <><span className="ks" style={{ fontSize: 22 }}>{r.known_text}</span><br /><span className="small muted">known · typed text was {r.gold_verdict}</span></>
                  : r.final_text ? <><span className="ks" style={{ fontSize: 22 }}>{r.final_text}</span><br /><span className="small muted">{r.status}</span></>
                  : <span className="small muted">{r.status}</span>}</td>
                <td>{r.answers.map((a: any, i: number) => (
                  <div key={i} className={`ans ${a.right === true ? "yes" : a.right === false ? "no" : ""}`} style={a.code === who ? { outline: "2px solid var(--accent)" } : undefined}>
                    <b>{a.handle}</b> <span className="mono muted">{a.code}</span> · {VERDICT[a.verdict]}
                    {a.correction && <> → <span className="ks" style={{ fontSize: 18 }}>{a.correction}</span></>}
                    {a.bad_crop && " · bad box"} <span className="muted">· {a.seconds}s · {day(a.at)}</span>
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

function Photos() {
  const [status, setStatus] = useState("new");
  const [data, setData] = useState<{ rows: any[]; counts: Record<string, number> } | null>(null);
  const load = useCallback(() => get(`/api/admin?view=uploads&status=${status}`).then(setData), [status]);
  useEffect(() => { load(); }, [load]);
  const set = async (id: number, s: string) => { await post({ action: "upload_status", id, status: s }); load(); };
  return (
    <>
      <p className="muted small">Page photos people uploaded. Keep the usable ones; <code>npm run uploads:download</code> fetches kept photos for segmentation (README).</p>
      <div className="tabs">
        {["new", "kept", "used", "rejected", "all"].map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s} {s !== "all" && <span className="muted">{data?.counts[s] ?? 0}</span>}</button>
        ))}
      </div>
      <div className="up-grid">
        {!data ? <p className="muted">Loading…</p> : data.rows.length === 0 ? <p className="muted">No photos here.</p> : data.rows.map((p) => (
          <div className="card up-card" key={p.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <a href={`/api/uploads/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/uploads/${p.id}?size=thumb`} alt="" loading="lazy" /></a>
            <div className="small"><b>{p.handle}</b> <span className="mono muted">{p.code}</span></div>
            <div className="small muted">{day(p.created_at)}</div>
            <div className="small muted">{p.source || "—"}{p.page ? ` · p. ${p.page}` : ""} · {p.width}×{p.height}</div>
            <div className="small">{p.quality?.label === "blurry" ? <span className="flag">blurry</span> : <span className="flag okflag">{p.quality?.label || "?"}</span>}{p.quality?.dark && <span className="flag">dark</span>}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button className="btn" style={{ height: 32, padding: "0 10px", flex: 1 }} disabled={p.status === "kept"} onClick={() => set(p.id, "kept")}>Keep</button>
              <button className="btn ghost" style={{ height: 32, padding: "0 10px", flex: 1 }} disabled={p.status === "rejected"} onClick={() => set(p.id, "rejected")}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Data() {
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => get("/api/admin").then(setD), []);
  useEffect(() => { load(); }, [load]);
  const ex = (q: string) => `/api/export?${q}`;
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="card panel" style={{ marginBottom: 18 }}>
        <h3>Download</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn primary" href={ex("format=csv&view=answers")}>Answers sheet (CSV): one row per answer</a>
          <a className="btn" href={ex("format=csv")}>Pictures sheet (CSV)</a>
          <a className="btn" href={ex("status=verified,corrected")}>Training data (JSONL): verified + corrected</a>
          <a className="btn" href={ex("status=all")}>Everything with every answer (JSONL)</a>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Live copy in Google Sheets (cell A1 of a private sheet):{" "}
          <code style={{ userSelect: "all", wordBreak: "break-all" }}>{`=IMPORTDATA("${typeof window !== "undefined" ? location.origin : ""}/api/export?key=YOUR_ADMIN_PASSWORD&format=csv&view=answers")`}</code></p>
        <div style={{ marginTop: 12 }}><button className="btn ghost" onClick={async () => { const r = await post({ action: "promote_gold", limit: 50 }); setMsg(r.error || `${r.promoted} pictures became check items.`); load(); }}>Make 50 unanimous pictures into check items ({d.gold} now)</button> {msg && <span className="small">{msg}</span>}</div>
      </div>
      <h2>Data per font</h2>
      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        <table>
          <thead><tr><th>Font</th><th className="num">Pictures</th><th className="num">Words</th><th className="num">Lines</th><th className="num">Reviewed</th><th className="num">Verified / corrected</th><th className="num">Wrong / disputed</th><th className="num">Bad box</th></tr></thead>
          <tbody>{d.fonts.map((f: any) => (
            <tr key={f.font}><td><b>{f.font}</b></td><td className="num">{f.samples}</td><td className="num">{f.words}</td><td className="num">{f.lines}</td><td className="num">{f.reviewed}</td><td className="num">{f.done}</td><td className="num">{f.wrong}</td><td className="num">{f.bad_crop}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <h2>Needs a look</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Picture</th><th>Typed</th><th className="num">✓</th><th className="num">✗</th><th className="num">Box</th><th>Top correction</th><th>Status</th></tr></thead>
          <tbody>{d.disputed.map((x: any) => (
            <tr key={x.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td><img src={x.image_url} alt="" style={{ maxHeight: 44, background: "#fff", borderRadius: 4 }} /><br /><span className="mono muted small">{x.id}</span></td>
              <td className="ks" style={{ fontSize: 22 }}>{x.proposed_text}</td><td className="num">{x.n_correct}</td><td className="num">{x.n_incorrect}</td><td className="num">{x.n_bad_crop}</td>
              <td className="ks" style={{ fontSize: 22 }}>{x.top_correction ? `${x.top_correction} (${x.top_correction_votes})` : "—"}</td><td>{x.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
