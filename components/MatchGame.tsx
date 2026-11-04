"use client";
// Match: tap one chunk, tap every chunk that is the same letters (however the font draws them), Pop —
// they burst away. Repeat until the board is clear. Each popped set says "these are one and the same".
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApp, type Stats } from "./AppState";
import { Leaf } from "./icons";

type Tile = { chunk: string; clean_url: string };
type Board = { id: string; tiles: Tile[] };
const COLORS = ["#c0502a", "#2f7a4a", "#3b82c4", "#8b5cf6", "#d4a017", "#d9468f"];

export function MatchGame() {
  const { stats, setStats } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [left, setLeft] = useState(0);
  const [none, setNone] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());     // popped tiles
  const [popping, setPopping] = useState<Set<string>>(new Set()); // tiles bursting right now
  const [sel, setSel] = useState<string[]>([]);                   // current set; sel[0] is the one tapped first
  const [sets, setSets] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cheer, setCheer] = useState("");
  const shownAt = useRef(Date.now());

  const load = useCallback(async (exclude: string[] = []) => {
    const r = await api<{ board: Board | null; left: number }>(`/api/match?exclude=${encodeURIComponent(exclude.join(","))}`);
    setLeft(r.left); setBoard(r.board); setNone(!r.board);
    setGone(new Set()); setSel([]); setSets([]); setErr(""); shownAt.current = Date.now();
    for (const t of r.board?.tiles || []) { const im = new Image(); im.src = t.clean_url; }
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const color = COLORS[sets.length % COLORS.length];
  const remaining = board ? board.tiles.filter((t) => !gone.has(t.chunk)) : [];

  const tap = (id: string) => {
    if (busy || popping.size) return;
    setSel((s) => (s.length === 0 ? [id] : id === s[0] ? [] : s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  function pop() {
    if (sel.length < 2) return;
    const set = [...sel];
    setPopping(new Set(set)); setSel([]);
    setCheer(["Pop!", "Nice!", "Match!", "Yes!", "Great eye!"][sets.length % 5]);
    setTimeout(() => {
      setGone((g) => new Set([...g, ...set])); setSets((s) => [...s, set]); setPopping(new Set()); setCheer("");
    }, 520);
  }
  const undo = () => {
    const last = sets[sets.length - 1]; if (!last) return;
    setSets((s) => s.slice(0, -1)); setGone((g) => { const n = new Set(g); last.forEach((x) => n.delete(x)); return n; }); setSel([]);
  };

  async function finish() {
    if (!board) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ stats: Stats; sets: number }>("/api/match/answer", { method: "POST", json: { boardId: board.id, sets, ms: Date.now() - shownAt.current } });
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

  return (
    <div className="review">
      <div className="status-line">
        <span className="where">Match the same ones</span>
        <span className="muted small">{left.toLocaleString()} boards left</span>
        <span><b>{stats?.points ?? 0}</b> pts</span>
      </div>
      <article className="card task">
        <p className="question" style={{ marginTop: 16 }}>
          {sel.length === 0 ? <>Tap a chunk, then tap <b>every chunk that is the same letters</b> — even if it is drawn a little differently. Then <b>Pop</b>.</>
            : <>Now tap all the ones that are the <b>same</b> as the first. <span className="muted">({sel.length} chosen)</span></>}
        </p>
        <div className="match-grid">
          {board.tiles.map((t) => {
            if (gone.has(t.chunk)) return <div key={t.chunk} className="mtile gone" />;
            const i = sel.indexOf(t.chunk);
            return (
              <button key={t.chunk} type="button" className={`mtile ${i === 0 ? "first" : i > 0 ? "picked" : ""} ${popping.has(t.chunk) ? "popping" : ""}`}
                style={i >= 0 || popping.has(t.chunk) ? { borderColor: color, boxShadow: `0 0 0 3px ${color}55` } : undefined} onClick={() => tap(t.chunk)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.clean_url} alt="" />
              </button>
            );
          })}
          {cheer && <div className="cheer" style={{ color }}>{cheer}</div>}
        </div>
        <div className="fix-actions" style={{ padding: "14px 18px 18px" }}>
          {cleared ? (
            <button className="btn primary" disabled={busy} onClick={finish}>🎉 Board cleared — next board ›</button>
          ) : (
            <>
              <button className="btn primary" disabled={busy || sel.length < 2} onClick={pop} style={sel.length >= 2 ? { background: color, borderColor: color } : undefined}>
                Pop {sel.length >= 2 ? sel.length : ""}
              </button>
              <button className="btn" disabled={busy} onClick={finish}>The rest are all different ›</button>
            </>
          )}
          <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} disabled={!sets.length || busy} onClick={undo}>Undo</button>
        </div>
        <p className="muted small" style={{ textAlign: "center", margin: "0 0 14px" }}>{sets.length} set{sets.length === 1 ? "" : "s"} popped on this board · 1 point each</p>
        {err && <p className="err" style={{ padding: "0 22px 16px" }}>{err}</p>}
      </article>
    </div>
  );
}
