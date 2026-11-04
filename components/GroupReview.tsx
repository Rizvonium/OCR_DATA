"use client";
// Label look-alike chunks in one go: "Are these all the same?" (tap the ones that are not), then
// "Is this what they say?" (type the right text if not). One decision labels the whole group.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApp } from "./AppState";
import { enqueue } from "./saveQueue";
import { Check, Cross, Leaf } from "./icons";
import { Keyboard, applyKey, usePhoneKeyboard } from "./Keyboard";
import { useLeaveWarning } from "./useLeaveWarning";

type Member = { chunk: string; clean_url: string; text: string };
type Group = { id: string; members: Member[]; proposed_text: string; size: number };
type Done = { group: Group; odd: string[]; verdict: string; correction?: string };
type Phase = "same" | "mark" | "text" | "fix";

export function GroupReview() {
  const { stats } = useApp();
  const [group, setGroup] = useState<Group | null>(null);
  const upcoming = useRef<Promise<Group | null> | null>(null); // the next group, fetched in advance
  const answered = useRef<string[]>([]);                         // answered here (server may not have saved them yet)
  const [left, setLeft] = useState(0);
  const [none, setNone] = useState(false);
  const [phase, setPhase] = useState<Phase>("same");
  const [odd, setOdd] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState<Done[]>([]);
  const [pos, setPos] = useState<number | null>(null); // going back through history
  const shownAt = useRef(Date.now());
  const input = useRef<HTMLInputElement>(null);

  const past = pos === null ? null : history[pos];
  const cur = past ? past.group : group;

  const open = useCallback((g: Group | null, prev?: Done) => {
    setOdd(new Set(prev?.odd || [])); setText(prev?.correction || ""); setErr("");
    setPhase(g && g.members.length < 2 ? "text" : "same"); shownAt.current = Date.now();
  }, []);

  // fetch a group (and preload its pictures); `first` also reopens the one on screen before a reload
  // and asks for the "groups left" figure, which is then counted down here instead of on the server
  const fetchGroup = useCallback(async (exclude: string[], first = false) => {
    let want = ""; try { want = first ? localStorage.getItem("ks_group") || "" : ""; } catch {}
    const r = await api<{ group: Group | null; left: number | null }>(
      `/api/group?count=${first ? 1 : 0}&exclude=${encodeURIComponent(exclude.slice(-40).join(","))}${want ? `&id=${encodeURIComponent(want)}` : ""}`);
    if (r.left !== null) setLeft(r.left);
    for (const m of r.group?.members || []) { const im = new Image(); im.src = m.clean_url; }
    return r.group;
  }, []);
  const show = useCallback((g: Group | null) => {
    setGroup(g); setNone(!g); open(g);
    try { if (g) localStorage.setItem("ks_group", g.id); else localStorage.removeItem("ks_group"); } catch {}
    // fetch the one after it now, while this one is being looked at
    upcoming.current = g ? fetchGroup([...answered.current, g.id]).catch(() => null) : null;
  }, [fetchGroup, open]);
  useEffect(() => { fetchGroup([], true).then(show).catch((e) => setErr(e.message)); }, [fetchGroup, show]);

  const same = cur ? cur.members.filter((m) => !odd.has(m.chunk)) : [];
  useLeaveWarning((phase === "mark" && odd.size > 0) || (phase === "fix" && !!text.trim()) || busy);

  // The answer goes to the background save queue (sent in order, retried until it is saved, kept
  // across reloads) and the next group, fetched in advance, appears at once.
  async function save(verdict: "correct" | "incorrect" | "skip" | "not_chunk", correction?: string) {
    if (!cur) return;
    setErr("");
    enqueue("/api/group/answer", "POST", { groupId: cur.id, odd: [...odd], shown: cur.members.map((m) => m.chunk), verdict, correction, ms: Date.now() - shownAt.current });
    const rec: Done = { group: cur, odd: [...odd], verdict, correction };
    if (past && pos !== null) {
      setHistory((h) => h.map((x, i) => (i === pos ? rec : x)));
      const n = pos + 1 < history.length ? pos + 1 : null;
      setPos(n); open(n === null ? group : history[n].group, n === null ? undefined : history[n]);
      return;
    }
    setHistory((h) => [...h, rec]);
    answered.current = [...answered.current, cur.id].slice(-40);
    setLeft((l) => Math.max(0, l - 1));
    setBusy(true);
    try {
      let g = upcoming.current ? await upcoming.current : null;
      if (!g || answered.current.includes(g.id)) g = await fetchGroup(answered.current);
      show(g);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const back = () => { const p = pos === null ? history.length - 1 : pos - 1; if (p < 0) return; setPos(p); open(history[p].group, history[p]); };
  const next = () => { if (pos === null) return; const p = pos + 1 < history.length ? pos + 1 : null; setPos(p); open(p === null ? group : history[p].group, p === null ? undefined : history[p]); };
  const toggle = (id: string) => setOdd((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const startFix = () => { setText(past?.correction || cur?.proposed_text || ""); setPhase("fix"); setTimeout(() => { input.current?.focus(); input.current?.select(); }, 30); };
  const phoneKb = usePhoneKeyboard();
  const insert = (k: string) => applyKey(input.current, text, k, setText);

  if (none && !past) return (
    <div className="card empty"><Leaf /><h2 style={{ marginTop: 12 }}>Every group is labelled — thank you!</h2>
      <p className="muted">New pages bring new chunks. Meanwhile you can check how pages were cut into lines and chunks.</p></div>
  );
  if (!cur) return <div className="card empty"><p className="muted">{err || "Loading…"}</p></div>;

  const rep = same[0] ?? cur.members[0];
  const VERDICT: Record<string, string> = { correct: "✓ text correct", incorrect: "✗ text corrected", skip: "skipped", not_chunk: "not proper chunks" };
  return (
    <div className="review">
      <div className="status-line">
        <button className="btn ghost navbtn" onClick={back} disabled={busy || history.length === 0 || pos === 0}>‹ Back</button>
        <span className="where">{cur.members.length > 1 ? `${cur.members.length} look-alike chunks` : "A single chunk"}</span>
        <span className="muted small">{left.toLocaleString()} left for you</span>
        <span><b>{stats?.points ?? 0}</b> pts</span>
        <button className="btn ghost navbtn" onClick={next} disabled={busy || pos === null}>Next ›</button>
      </div>

      <article className="card task" key={cur.id + (past ? "-p" : "")}>
        {past && (
          <div className="past-note">You answered: <b>{VERDICT[past.verdict]}</b>{past.correction && <> → <span className="ks">{past.correction}</span></>}{past.odd.length ? ` · ${past.odd.length} marked different` : ""} · answer again to change it.</div>
        )}

        {(phase === "same" || phase === "mark") && (
          <>
            <div className={`grid-tiles ${phase === "mark" ? "marking" : ""}`}>
              {cur.members.map((m) => (
                <button key={m.chunk} type="button" className={`tile ${odd.has(m.chunk) ? "odd" : ""}`} disabled={phase !== "mark"} onClick={() => toggle(m.chunk)} aria-pressed={odd.has(m.chunk)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.clean_url} alt="" />
                  {odd.has(m.chunk) && <span className="x">✕</span>}
                </button>
              ))}
            </div>
            {phase === "same" ? (
              <>
                <p className="question">Are these <b>all the same</b> — the same letters, dots and vowel signs?</p>
                <div className="choices">
                  <button className="choice yes" disabled={busy} onClick={() => setPhase("text")}><Check /> Yes, all the same</button>
                  <button className="choice no" disabled={busy} onClick={() => setPhase("mark")}><Cross /> Some are different</button>
                </div>
                <div className="skip">
                  <button className="btn ghost" disabled={busy} onClick={() => save("not_chunk")}>Not proper chunks — only marks or specks</button>
                </div>
              </>
            ) : (
              <div className="fix">
                <p className="small"><b>Tap every chunk that is not the same</b> as most of the others. Tap again to undo.</p>
                <div className="fix-actions">
                  <button className="btn primary" disabled={busy || odd.size === 0} onClick={() => (odd.size >= cur.members.length - 0 ? save("skip") : setPhase("text"))}>
                    {odd.size >= cur.members.length ? "None are the same — next" : `Done: ${odd.size} different, ${cur.members.length - odd.size} the same`}
                  </button>
                  <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} onClick={() => { setOdd(new Set()); setPhase("same"); }}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        {(phase === "text" || phase === "fix") && (
          <>
            <div className="stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rep.clean_url} alt="The chunk" className="rep" />
            </div>
            {same.length > 1 && <p className="muted small" style={{ textAlign: "center", margin: "8px 0 0" }}>Your answer labels all {same.length} chunks that are the same.</p>}
            <div className="typed">
              <div className="label">Proposed text</div>
              <p className="text ks">{cur.proposed_text || <span className="muted" style={{ fontSize: 16, fontFamily: "var(--ui)" }}>(nothing yet: please type it)</span>}</p>
            </div>
            {phase === "text" ? (
              <>
                <p className="question">Is this what {same.length > 1 ? "they say" : "it says"} — every letter and vowel sign?</p>
                <div className="choices">
                  <button className="choice yes" disabled={busy || !cur.proposed_text} onClick={() => save("correct")}><Check /> Correct</button>
                  <button className="choice no" disabled={busy} onClick={startFix}><Cross /> {cur.proposed_text ? "Incorrect" : "Type it"}</button>
                </div>
                <div className="skip">
                  <button className="btn ghost" disabled={busy} onClick={() => save("skip")}>Can&apos;t tell — skip</button>
                  {cur.members.length > 1 && <button className="btn ghost" disabled={busy} onClick={() => setPhase("mark")}>Mark different ones</button>}
                  <button className="btn ghost" disabled={busy} onClick={() => save("not_chunk")}>Not a proper chunk</button>
                </div>
              </>
            ) : (
              <div className="fix">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="fix">Type what {same.length > 1 ? "they say" : "it says"}</label>
                  <input id="fix" ref={input} className="fix-input ks" dir="rtl" inputMode={phoneKb.inputMode} value={text} onChange={(e) => setText(e.target.value)} lang="ks" autoComplete="off" spellCheck={false}
                    onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); save("incorrect", text); } }} />
                </div>
                <Keyboard onKey={insert} phone={phoneKb} />
                <div className="fix-actions" style={{ marginTop: 14 }}>
                  <button className="btn primary" disabled={busy || !text.trim()} onClick={() => save("incorrect", text)}>Save text</button>
                  <button className="btn" disabled={busy} onClick={() => save("incorrect")}>Wrong, but I can&apos;t type it</button>
                  <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} onClick={() => setPhase("text")}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
        {err && <p className="err" style={{ padding: "0 22px 16px" }}>{err}</p>}
      </article>
    </div>
  );
}
