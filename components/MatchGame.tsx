"use client";
// Match: tap one chunk, tap every chunk that is the same letters (however the font draws them), Pop —
// they burst away. Pop as many sets as you see, then Submit (the rest stay unsorted). "Not a chunk"
// flags tiles that are only a mark or a speck, not a proper piece of a word.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApp, type Stats } from "./AppState";
import { Leaf } from "./icons";

type Tile = { chunk: string; clean_url: string };
type Board = { id: string; tiles: Tile[] };
type Action = { type: "set" | "junk"; ids: string[] };
const COLORS = ["#c0502a", "#2f7a4a", "#3b82c4", "#8b5cf6", "#d4a017", "#d9468f"];

export function MatchGame() {
  const { stats, setStats } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [left, setLeft] = useState(0);
  const [none, setNone] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);          // popped sets and flagged tiles, in order
  const [popping, setPopping] = useState<Set<string>>(new Set()); // tiles bursting right now
  const [sel, setSel] = useState<string[]>([]);                   // current set; sel[0] is the one tapped first
  const [junkMode, setJunkMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cheer, setCheer] = useState("");
  const shownAt = useRef(Date.now());

  const load = useCallback(async (exclude: string[] = []) => {
    const r = await api<{ board: Board | null; left: number }>(`/api/match?exclude=${encodeURIComponent(exclude.join(","))}`);
    setLeft(r.left); setBoard(r.board); setNone(!r.board);
    setActions([]); setSel([]); setJunkMode(false); setErr(""); shownAt.current = Date.now();
    for (const t of r.board?.tiles || []) { const im = new Image(); im.src = t.clean_url; }
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const sets = actions.filter((a) => a.type === "set").map((a) => a.ids);
  const junk = actions.filter((a) => a.type === "junk").flatMap((a) => a.ids);
  const gone = new Set(actions.flatMap((a) => a.ids));
  const color = COLORS[sets.length % COLORS.length];
  const remaining = board ? board.tiles.filter((t) => !gone.has(t.chunk)) : [];

  const burst = (ids: string[], then: () => void, word = "") => {
    setPopping(new Set(ids)); setCheer(word);
    setTimeout(() => { then(); setPopping(new Set()); setCheer(""); }, 520);
  };

  const tap = (id: string) => {
    if (busy || popping.size) return;
    if (junkMode) { burst([id], () => setActions((a) => [...a, { type: "junk", ids: [id] }])); return; }
    setSel((s) => (s.length === 0 ? [id] : id === s[0] ? [] : s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  function pop() {
    if (sel.length < 2) return;
    const set = [...sel]; setSel([]);
    burst(set, () => setActions((a) => [...a, { type: "set", ids: set }]), ["Pop!", "Nice!", "Match!", "Yes!", "Great eye!"][sets.length % 5]);
  }
  const undo = () => { setActions((a) => a.slice(0, -1)); setSel([]); };

  async function submit() {
    if (!board) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ stats: Stats }>("/api/match/answer", { method: "POST", json: { boardId: board.id, sets, junk, ms: Date.now() - shownAt.current } });
      setStats(r.stats);
      await load([board.id]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (none) return (
    <div className="card empty"><Leaf /><h2 style={{ marginTop: 12 }}>You have played every board — thank you!</h2>
      <p className="muted">New pages bring new boards.</p></div>
  );
  if (!board) return <div className="card empty"><p className="muted">{err || "Loading a board…"}</p></div>;
  const cleared = remaining.length <= 1 && !popping.size;
  const done = sets.length + junk.length;

  return (
    <div className="review">
      <div className="status-line">
        <span className="where">Match the same ones</span>
        <span className="muted small">{left.toLocaleString()} boards left</span>
        <span><b>{stats?.points ?? 0}</b> pts</span>
      </div>
      <article className="card task">
        <p className="question" style={{ marginTop: 16 }}>
          {junkMode ? <>Tap every tile that is <b>not a proper chunk</b> — only a dot, a mark or a speck. Tap <b>Done</b> when finished.</>
            : sel.length === 0 ? <>Tap a chunk, then tap <b>every chunk that is the same letters</b> — even if drawn a little differently. Then <b>Pop</b>. Pop as many sets as you see, then <b>Submit</b>.</>
              : <>Now tap all the ones that are the <b>same</b> as the first. <span className="muted">({sel.length} chosen)</span></>}
        </p>
        <div className={`match-grid ${junkMode ? "junk-mode" : ""}`}>
          {board.tiles.map((t) => {
            if (gone.has(t.chunk) && !popping.has(t.chunk)) return <div key={t.chunk} className="mtile gone" />;
            const i = sel.indexOf(t.chunk);
            const isJunkPop = popping.has(t.chunk) && junkMode;
            return (
              <button key={t.chunk} type="button" className={`mtile ${i === 0 ? "first" : i > 0 ? "picked" : ""} ${popping.has(t.chunk) ? (isJunkPop ? "junking" : "popping") : ""}`}
                style={!junkMode && (i >= 0 || popping.has(t.chunk)) ? { borderColor: color, boxShadow: `0 0 0 3px ${color}55` } : undefined} onClick={() => tap(t.chunk)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.clean_url} alt="" />
              </button>
            );
          })}
          {cheer && <div className="cheer" style={{ color }}>{cheer}</div>}
        </div>
        <div className="fix-actions" style={{ padding: "14px 18px 6px" }}>
          {junkMode ? (
            <button className="btn primary" onClick={() => setJunkMode(false)}>Done flagging</button>
          ) : (
            <>
              <button className="btn primary" disabled={busy || sel.length < 2} onClick={pop} style={sel.length >= 2 ? { background: color, borderColor: color } : undefined}>
                Pop {sel.length >= 2 ? sel.length : ""}
              </button>
              <button className="btn" disabled={busy || cleared} onClick={() => { setSel([]); setJunkMode(true); }}>Not a chunk…</button>
            </>
          )}
          <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} disabled={!actions.length || busy} onClick={undo}>Undo</button>
        </div>
        <div className="fix-actions" style={{ padding: "6px 18px 18px" }}>
          <button className={`btn ${done ? "primary submit" : ""}`} disabled={busy} onClick={submit}>
            {cleared ? "🎉 Board cleared — Submit ›" : done ? `Submit ${sets.length} set${sets.length === 1 ? "" : "s"}${junk.length ? ` + ${junk.length} not a chunk` : ""} ›` : "Skip this board ›"}
          </button>
        </div>
        <p className="muted small" style={{ textAlign: "center", margin: "0 0 14px" }}>Unsorted tiles stay as they are · 1 point per set and per flag</p>
        {err && <p className="err" style={{ padding: "0 22px 16px" }}>{err}</p>}
      </article>
    </div>
  );
}
