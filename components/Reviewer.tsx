"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApp, type Stats } from "./AppState";
import { Check, Chevron, Cross, Leaf } from "./icons";
import { Keyboard } from "./Keyboard";

type Task = { id: string; kind: string; image_url: string; context_url: string | null; proposed_text: string; ticket: string };
type Gold = { pass: boolean | null; verdict: string; text: string } | null;
type Toast = { kind: "good" | "bad" | "info"; text: string; ks?: string } | null;
const SESSION_GOAL = 20;
const KIND_LABEL: Record<string, string> = { word: "Word", paw: "Part of a word", line: "Whole line" };

export function Reviewer() {
  const { stats, setStats } = useApp();
  const [task, setTask] = useState<Task | null>(null);
  const [next, setNext] = useState<Task | null>(null);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<"ask" | "fix">("ask");
  const [text, setText] = useState("");
  const [badCrop, setBadCrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [session, setSession] = useState(0);
  const [plus, setPlus] = useState(0);
  const [fullKb, setFullKb] = useState(false);
  const [shift, setShift] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchTask = useCallback(async (exclude: string[]) => {
    const r = await api<{ task: Task | null }>(`/api/task?exclude=${encodeURIComponent(exclude.join(","))}`);
    if (r.task) { const im = new Image(); im.src = r.task.image_url; } // preload
    return r.task;
  }, []);

  useEffect(() => {
    (async () => {
      const t = await fetchTask([]);
      setTask(t); setDone(!t);
      if (t) setNext(await fetchTask([t.id]));
    })().catch((e) => setErr(e.message));
  }, [fetchTask]);

  const show = (t: Toast, ms = 2600) => {
    clearTimeout(toastTimer.current); setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  const advance = useCallback(async (current: Task) => {
    setMode("ask"); setText(""); setBadCrop(false); setErr("");
    let n = next && next.id !== current.id ? next : await fetchTask([current.id]);
    setTask(n); setDone(!n); setNext(null);
    if (n) fetchTask([current.id, n.id]).then(setNext).catch(() => {});
  }, [next, fetchTask]);

  const answer = useCallback(async (verdict: "correct" | "incorrect" | "skip", correction?: string) => {
    if (!task || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ gold: Gold; stats: Stats }>("/api/answer", {
        method: "POST", json: { sampleId: task.id, ticket: task.ticket, verdict, correction, badCrop: verdict === "incorrect" && badCrop },
      });
      setStats(r.stats);
      if (verdict !== "skip") { setSession((s) => s + 1); setPlus((p) => p + 1); }
      if (r.gold && r.gold.pass === true) show({ kind: "good", text: "Spot on — that one was a check item with a known answer." });
      else if (r.gold && r.gold.pass === false)
        show(r.gold.verdict === "correct"
          ? { kind: "bad", text: "Check item: the typed text was actually correct.", ks: r.gold.text }
          : { kind: "bad", text: "Check item: the right text is", ks: r.gold.text }, 5200);
      await advance(task);
    } catch (e: any) {
      if (e.status === 409) await advance(task); else setErr(e.message);
    } finally { setBusy(false); }
  }, [task, busy, badCrop, advance, setStats]);

  const openFix = () => {
    if (!task) return;
    setMode("fix"); setText(task.proposed_text);
    setTimeout(() => { input.current?.focus(); input.current?.select(); }, 30);
  };

  const insert = (s: string) => {
    const el = input.current; if (!el) return;
    const a = el.selectionStart ?? text.length, b = el.selectionEnd ?? text.length;
    let v: string, pos: number;
    if (s === "\b") { const from = a === b ? Math.max(0, a - 1) : a; v = text.slice(0, from) + text.slice(b); pos = from; }
    else { v = text.slice(0, a) + s + text.slice(b); pos = a + s.length; }
    setText(v);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  };

  // keyboard shortcuts: C/1 correct, X/2 incorrect, S skip, Esc back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (mode === "fix") { if (e.key === "Escape") setMode("ask"); return; }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "c" || k === "1") { e.preventDefault(); answer("correct"); }
      else if (k === "x" || k === "2") { e.preventDefault(); openFix(); }
      else if (k === "s") { e.preventDefault(); answer("skip"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); answer("incorrect", text); return; }
    setShift(e.shiftKey);
  };


  const pct = Math.min(100, Math.round(session / SESSION_GOAL * 100));

  return (
    <div className="review">
      <div className="status-line">
        <span><b>{session}</b> of {SESSION_GOAL}</span>
        <span className="bar-mini"><i style={{ width: `${pct}%` }} /></span>
        <span><b>{stats?.points ?? 0}</b> points{stats?.points ? ` · #${stats.rank}` : ""}</span>
      </div>
      <div>
        {done ? (
          <div className="card empty">
            <Leaf />
            <h2 style={{ marginTop: 12 }}>You have seen every picture for now.</h2>
            <p className="muted">Thank you! New pages are added regularly — come back soon, or see how you rank.</p>
            <a className="btn primary" href="/leaderboard">See the leaderboard</a>
          </div>
        ) : !task ? (
          <div className="card empty"><p className="muted">{err || "Loading a picture…"}</p></div>
        ) : (
          <article className="card task swap-enter" key={task.id}>
            <div className="task-head">
              <span className="tag">{KIND_LABEL[task.kind] ?? task.kind}</span>
              <span>Look closely at every dot and vowel sign</span>
            </div>
            {plus > 0 && <span className="plus" key={plus}>+1</span>}
            <div className="stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={task.image_url} alt="Segmented Kashmiri text to check" />
              <a className="zoom" href={task.image_url} target="_blank" rel="noreferrer">open full size</a>
            </div>
            {task.context_url && (
              <details className="ctx">
                <summary><Chevron /> Show the line this was cut from</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="ctx-img"><img src={task.context_url} alt="The line the picture was cut from, with its box marked" loading="lazy" /></div>
              </details>
            )}
            <div className="typed">
              <div className="label">Typed text</div>
              <p className="text ks">{task.proposed_text}</p>
            </div>
            {mode === "ask" ? (
              <>
                <p className="question">Does the typed text match the picture exactly — every letter and vowel sign?</p>
                <div className="choices">
                  <button className="choice yes" onClick={() => answer("correct")} disabled={busy}><Check /> Correct <kbd>C</kbd></button>
                  <button className="choice no" onClick={openFix} disabled={busy}><Cross /> Incorrect <kbd>X</kbd></button>
                </div>
                <div className="skip">
                  <button className="btn ghost" onClick={() => answer("skip")} disabled={busy}>Can&apos;t tell — skip</button>
                </div>
              </>
            ) : (
              <div className="fix">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="fix">Type what the picture actually says (optional)</label>
                  <input id="fix" ref={input} className="fix-input ks" dir="rtl" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onInputKey} onKeyUp={(e) => setShift(e.shiftKey)} autoComplete="off" spellCheck={false} lang="ks" />
                </div>
                <div className="fix-tools">
                  <button type="button" className="btn ghost" onClick={() => setFullKb(!fullKb)}>{fullKb ? "Fewer keys" : "All letters"}</button>
                </div>
                <Keyboard onKey={insert} full={fullKb} shift={shift} />
                <label className="check" style={{ marginTop: 16 }}>
                  <input type="checkbox" checked={badCrop} onChange={(e) => setBadCrop(e.target.checked)} />
                  <span>The box itself is wrong — it cuts letters off, or holds more or less than one {task.kind === "line" ? "line" : "word"}.</span>
                </label>
                <div className="fix-actions">
                  <button className="btn primary" onClick={() => answer("incorrect", text)} disabled={busy || !text.trim()}>Submit correction <kbd style={{ background: "transparent", color: "inherit" }}>Enter</kbd></button>
                  <button className="btn" onClick={() => answer("incorrect")} disabled={busy}>Submit without typing</button>
                  <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} onClick={() => setMode("ask")}>Back</button>
                </div>
              </div>
            )}
            {err && <p className="err" style={{ padding: "0 22px 16px" }}>{err}</p>}
          </article>
        )}
      </div>


      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <span>{toast.text}</span>{toast.ks && <span className="ks">{toast.ks}</span>}
        </div>
      )}
    </div>
  );
}
