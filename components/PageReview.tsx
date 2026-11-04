"use client";
// Guided page review: the page with its lines -> each line with its chunks -> each chunk with its text.
// Every decision is saved at once (POST /api/page/answer); Back goes to any earlier step to change it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApp, type Stats } from "./AppState";
import { Check, Cross, Leaf } from "./icons";
import { Keyboard } from "./Keyboard";

type Box = [number, number, number, number];
type Chunk = { box: Box; text: string };
type Line = { box: Box; chunks: Chunk[] };
type Page = { id: string; image_url: string; heat_url: string | null; width: number; height: number; lines: Line[] };
type Ans = { level: string; line: number; chunk: number; verdict: string; edit: any; correction: string | null };
type Step = { kind: "lines" } | { kind: "chunks"; line: number } | { kind: "text"; line: number; chunk: number } | { kind: "done" };

const key = (level: string, line = -1, chunk = -1) => `${level}:${line}:${chunk}`;
const union = (bs: Box[]): Box => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
const rtl = (cs: Chunk[]) => [...cs].sort((a, b) => b.box[2] - a.box[2]);
const BAND = ["rgba(192,80,42,.20)", "rgba(47,122,74,.20)"];
const EDGE = ["rgb(192,80,42)", "rgb(47,122,74)"];

// ------------------------------------------------------------------ pictures (SVG crops of the page)
function usePoint() {
  return (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
}

function PageView({ page, lines, heat, onTap, zoom, focus, small }: { page: Page; lines: Line[]; heat: boolean; onTap?: (y: number) => void; zoom: boolean; focus?: number; small?: boolean }) {
  const point = usePoint();
  return (
    <div className={`pv ${zoom ? "zoom" : ""} ${small ? "small" : ""}`}>
      <svg viewBox={`0 0 ${page.width} ${page.height}`} onClick={onTap ? (e) => onTap(point(e).y) : undefined} style={{ cursor: onTap ? "crosshair" : "default" }}>
        <image href={heat && page.heat_url ? page.heat_url : page.image_url} width={page.width} height={page.height} />
        {lines.map((l, i) => {
          const [x0, y0, x1, y1] = l.box, p = 4;
          return (
            <g key={i}>
              <rect x={x0 - p} y={y0 - p} width={x1 - x0 + 2 * p} height={y1 - y0 + 2 * p} rx={4}
                fill={focus === undefined ? BAND[i % 2] : i === focus ? "rgba(59,130,196,.22)" : "rgba(0,0,0,0)"}
                stroke={focus === undefined ? EDGE[i % 2] : i === focus ? "rgb(59,130,196)" : "rgba(120,110,100,.35)"} strokeWidth={focus === i ? 4 : 2} />
              <text x={x1 + 10} y={(y0 + y1) / 2} fontSize={Math.max(16, (y1 - y0) * 0.45)} fill={EDGE[i % 2]} dominantBaseline="middle" fontWeight={700}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineView({ page, line, chunks, heat, sel, onTap }: { page: Page; line: Line; chunks: Chunk[]; heat: boolean; sel?: number | null; onTap?: (x: number, y: number) => void }) {
  const point = usePoint();
  const b = union([line.box, ...chunks.map((c) => c.box)]), m = Math.max(10, (b[3] - b[1]) * 0.35);
  const vb = [b[0] - m, b[1] - m, b[2] - b[0] + 2 * m, b[3] - b[1] + 2 * m];
  const h = 130, w = Math.round((vb[2] / vb[3]) * h);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollLeft = box.current.scrollWidth; }, [line]);
  return (
    <div className="lv" ref={box}>
      <svg viewBox={vb.join(" ")} width={w} height={h} onClick={onTap ? (e) => { const p = point(e); onTap(p.x, p.y); } : undefined} style={{ cursor: onTap ? "crosshair" : "default" }}>
        <image href={heat && page.heat_url ? page.heat_url : page.image_url} width={page.width} height={page.height} />
        {chunks.map((c, i) => {
          const [x0, y0, x1, y1] = c.box;
          return (
            <g key={i}>
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={i === sel ? "rgba(59,130,196,.25)" : BAND[i % 2]} stroke={i === sel ? "rgb(59,130,196)" : EDGE[i % 2]} strokeWidth={Math.max(1.5, vb[3] / 60)} />
              <text x={(x0 + x1) / 2} y={y0 - m * 0.25} fontSize={Math.max(10, vb[3] * 0.16)} fill={EDGE[i % 2]} textAnchor="middle" fontWeight={700}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChunkView({ page, box, heat }: { page: Page; box: Box; heat: boolean }) {
  const m = Math.max(8, (box[3] - box[1]) * 0.3);
  const vb = [box[0] - m, box[1] - m, box[2] - box[0] + 2 * m, box[3] - box[1] + 2 * m];
  return (
    <div className="stage">
      <svg viewBox={vb.join(" ")} className="cv" preserveAspectRatio="xMidYMid meet">
        <image href={heat && page.heat_url ? page.heat_url : page.image_url} width={page.width} height={page.height} />
        <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="none" stroke="rgba(192,80,42,.55)" strokeWidth={Math.max(1, vb[3] / 90)} strokeDasharray="4 3" />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ the flow
export function PageReview() {
  const { stats, setStats } = useApp();
  const [page, setPage] = useState<Page | null>(null);
  const [none, setNone] = useState(false);
  const [ans, setAns] = useState<Record<string, Ans>>({});
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"ask" | "fix">("ask");
  const [heat, setHeat] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const shownAt = useRef(Date.now());
  // drafts while fixing
  const [dLines, setDLines] = useState<Line[]>([]);
  const [dChunks, setDChunks] = useState<Chunk[]>([]);
  const [ops, setOps] = useState<any[]>([]);
  const [tool, setTool] = useState<"split" | "join" | "remove">("split");
  const [sel, setSel] = useState<number | null>(null);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const lines: Line[] = useMemo(() => {
    if (!page) return [];
    const a = ans[key("lines")];
    return a?.verdict === "incorrect" && a.edit?.lines ? a.edit.lines : page.lines;
  }, [page, ans]);
  const chunksOf = useCallback((i: number): Chunk[] => {
    const a = ans[key("chunks", i)];
    return a?.verdict === "incorrect" && a.edit?.chunks ? a.edit.chunks : lines[i]?.chunks ?? [];
  }, [ans, lines]);
  const steps: Step[] = useMemo(() => {
    if (!page) return [];
    const s: Step[] = [{ kind: "lines" }];
    lines.forEach((_, i) => {
      s.push({ kind: "chunks", line: i });
      chunksOf(i).forEach((__, j) => s.push({ kind: "text", line: i, chunk: j }));
    });
    s.push({ kind: "done" });
    return s;
  }, [page, lines, chunksOf]);
  const step = steps[idx];

  const load = useCallback(async () => {
    setErr(""); setMode("ask");
    const r = await api<{ page: Page | null; answers?: Ans[] }>("/api/page");
    if (!r.page) { setNone(true); setPage(null); return; }
    const m: Record<string, Ans> = {};
    for (const a of r.answers || []) m[key(a.level, a.line, a.chunk)] = a;
    setPage(r.page); setAns(m); setIdx(-1); // resume position is found below, once steps exist
  }, []);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);
  // resume at the first unanswered step
  useEffect(() => {
    if (idx !== -1 || !steps.length) return;
    const first = steps.findIndex((s) => s.kind === "done" || !ans[s.kind === "lines" ? key("lines") : s.kind === "chunks" ? key("chunks", s.line) : key("text", s.line, s.chunk)]);
    setIdx(Math.max(0, first));
  }, [idx, steps, ans]);
  const fixOnArrive = useRef(false); // set by "The box is wrong": open the chunk tools on arrival
  useEffect(() => {
    shownAt.current = Date.now(); setSel(null); setErr("");
    if (fixOnArrive.current && step?.kind === "chunks") {
      fixOnArrive.current = false;
      setDChunks(chunksOf(step.line)); setOps([]); setTool("split"); setNote("Fix the boxes of this line, then save."); setMode("fix");
    } else setMode("ask");
  }, [idx, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepKey = (s: Step) => s.kind === "lines" ? key("lines") : s.kind === "chunks" ? key("chunks", s.line) : s.kind === "text" ? key("text", s.line, s.chunk) : key("page");
  const prev = step ? ans[stepKey(step)] : undefined;

  async function save(level: string, verdict: string, extra: { line?: number; chunk?: number; edit?: any; correction?: string } = {}) {
    if (!page) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ stats: Stats }>("/api/page/answer", {
        method: "POST", json: { pageId: page.id, level, verdict, ms: Date.now() - shownAt.current, ...extra },
      });
      setStats(r.stats);
      setAns((m) => {
        const n = { ...m };
        // the server drops answers that a changed line or chunk list makes stale; do the same here
        if (level === "lines") for (const k of Object.keys(n)) if (!k.startsWith("lines:")) delete n[k];
        if (level === "chunks") for (const k of Object.keys(n)) if (k.startsWith(`text:${extra.line}:`) || k.startsWith("page:")) delete n[k];
        n[key(level, extra.line ?? -1, extra.chunk ?? -1)] = { level, line: extra.line ?? -1, chunk: extra.chunk ?? -1, verdict, edit: extra.edit ?? null, correction: extra.correction ?? null };
        return n;
      });
      setMode("ask");
      if (level !== "page") setIdx((i) => i + 1);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  // ---------------- fixing lines: tap inside a band to split it there, tap between two bands to join them
  function tapLines(y: number) {
    const ls = dLines;
    const inside = ls.findIndex((l) => y >= l.box[1] - 4 && y <= l.box[3] + 4);
    const near = (i: number) => Math.abs(y - ls[i].box[3]) < 10 || Math.abs(y - ls[i + 1].box[1]) < 10;
    for (let i = 0; i + 1 < ls.length; i++) {
      if ((y > ls[i].box[3] && y < ls[i + 1].box[1]) || (inside < 0 && near(i))) {
        const merged = rtl([...ls[i].chunks, ...ls[i + 1].chunks]);
        const out = [...ls.slice(0, i), { box: union(merged.map((c) => c.box)), chunks: merged }, ...ls.slice(i + 2)];
        setDLines(out); setOps((o) => [...o, { op: "join", line: i }]); setNote(`Joined lines ${i + 1} and ${i + 2}.`); return;
      }
    }
    if (inside >= 0) {
      const l = ls[inside], cy = (c: Chunk) => (c.box[1] + c.box[3]) / 2;
      const top = l.chunks.filter((c) => cy(c) < y), bottom = l.chunks.filter((c) => cy(c) >= y);
      if (!top.length || !bottom.length) { setNote("Nothing to split there: tap between two rows of text inside the band."); return; }
      const parts = [{ box: union(top.map((c) => c.box)), chunks: rtl(top) }, { box: union(bottom.map((c) => c.box)), chunks: rtl(bottom) }];
      setDLines([...ls.slice(0, inside), ...parts, ...ls.slice(inside + 1)]); setOps((o) => [...o, { op: "split", line: inside, y: Math.round(y) }]);
      setNote(`Split line ${inside + 1} in two.`);
    }
  }

  // ---------------- fixing chunks: split at a tap, join two neighbours, or remove a speck
  function tapChunks(x: number, y: number) {
    const cs = dChunks;
    const i = cs.findIndex((c) => x >= c.box[0] - 3 && x <= c.box[2] + 3 && y >= c.box[1] - 6 && y <= c.box[3] + 6);
    if (i < 0) { setNote("Tap on a box."); return; }
    const c = cs[i];
    if (tool === "remove") { setDChunks(cs.filter((_, k) => k !== i)); setOps((o) => [...o, { op: "remove", chunk: i }]); setNote(`Removed box ${i + 1}.`); return; }
    if (tool === "split") {
      const sx = Math.round(x);
      if (sx - c.box[0] < 3 || c.box[2] - sx < 3) { setNote("Tap further inside the box, where it should be cut."); return; }
      const right: Chunk = { box: [sx, c.box[1], c.box[2], c.box[3]], text: "" }, left: Chunk = { box: [c.box[0], c.box[1], sx, c.box[3]], text: "" };
      setDChunks([...cs.slice(0, i), right, left, ...cs.slice(i + 1)]); setOps((o) => [...o, { op: "split", chunk: i, x: sx }]); setNote(`Cut box ${i + 1} in two.`); return;
    }
    if (sel === null) { setSel(i); setNote(`Box ${i + 1} chosen: now tap the box next to it.`); return; }
    if (Math.abs(sel - i) !== 1) { setSel(i); setNote("Join only boxes that are next to each other. Box chosen again; tap its neighbour."); return; }
    const [a, b] = sel < i ? [sel, i] : [i, sel];
    const merged: Chunk = { box: union([cs[a].box, cs[b].box]), text: cs[a].text + cs[b].text };
    setDChunks([...cs.slice(0, a), merged, ...cs.slice(b + 1)]); setOps((o) => [...o, { op: "join", chunks: [a, b] }]); setSel(null); setNote(`Joined boxes ${a + 1} and ${b + 1}.`);
  }

  const startFix = () => {
    if (!step) return;
    setOps([]); setSel(null); setNote(""); setErr("");
    if (step.kind === "lines") setDLines(lines.map((l) => ({ box: l.box, chunks: l.chunks })));
    if (step.kind === "chunks") { setDChunks(chunksOf(step.line)); setTool("split"); }
    if (step.kind === "text") {
      const shown = chunksOf(step.line)[step.chunk]?.text || "";
      setText(prev?.correction || shown);
      setTimeout(() => { input.current?.focus(); input.current?.select(); }, 30);
    }
    setMode("fix");
  };

  const insert = (s: string) => {
    const el = input.current; if (!el) return;
    const a = el.selectionStart ?? text.length, b = el.selectionEnd ?? text.length;
    let v: string, p: number;
    if (s === "\b") { const f = a === b ? Math.max(0, a - 1) : a; v = text.slice(0, f) + text.slice(b); p = f; } else { v = text.slice(0, a) + s + text.slice(b); p = a + s.length; }
    setText(v); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(p, p); });
  };

  // ---------------- screens
  if (none) return (
    <div className="card empty"><Leaf /><h2 style={{ marginTop: 12 }}>You have reviewed every page for now.</h2>
      <p className="muted">Thank you! New pages are added regularly.</p><a className="btn" href="/words">Check single words instead</a></div>
  );
  if (!page || !step) return <div className="card empty"><p className="muted">{err || "Loading a page…"}</p></div>;

  const nLines = lines.length;
  const where = step.kind === "lines" ? "Lines of the page" : step.kind === "chunks" ? `Line ${step.line + 1} of ${nLines} · chunks`
    : step.kind === "text" ? `Line ${step.line + 1} of ${nLines} · chunk ${step.chunk + 1} of ${chunksOf(step.line).length}` : "Page finished";
  const verdictText = (a?: Ans) => (a ? (a.verdict === "correct" ? "✓ Correct" : a.verdict === "incorrect" ? "✗ Incorrect (fixed)" : "Skipped") : "");

  return (
    <div className="review">
      <div className="status-line">
        <button className="btn ghost navbtn" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={busy || idx <= 0}>‹ Back</button>
        <span className="where">{where}</span>
        <span className="bar-mini"><i style={{ width: `${Math.round((idx / Math.max(1, steps.length - 1)) * 100)}%` }} /></span>
        <span><b>{stats?.points ?? 0}</b> pts</span>
      </div>

      <article className="card task" key={`${page.id}-${idx}`}>
        <div className="task-head">
          <span className="tag">{step.kind === "lines" ? "Page" : step.kind === "chunks" ? "Line" : step.kind === "text" ? "Chunk" : "Done"}</span>
          <span>{step.kind === "done" ? "" : "Look closely at every dot and vowel sign"}</span>
          {step.kind !== "done" && step.kind !== "text" && (
            <span className="head-tools">
              <button className="btn ghost navbtn" onClick={() => setHeat(!heat)} aria-pressed={heat}>{heat ? "Photo" : "Heat map"}</button>
              {step.kind === "lines" && <button className="btn ghost navbtn" onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? "Fit" : "Zoom"}</button>}
            </span>
          )}
        </div>
        {prev && step.kind !== "done" && mode === "ask" && (
          <div className="past-note">You answered: <b>{verdictText(prev)}</b>{prev.correction && <> → <span className="ks">{prev.correction}</span></>} · answer again to change it.</div>
        )}

        {/* ---------------- 1. lines */}
        {step.kind === "lines" && (
          <>
            <PageView page={page} lines={mode === "fix" ? dLines : lines} heat={heat} zoom={zoom} onTap={mode === "fix" ? tapLines : undefined} />
            {mode === "ask" ? (
              <>
                <p className="question">Each coloured band should hold exactly <b>one line</b> of text, with all its dots and vowel signs. Are the {nLines} lines found correctly?</p>
                <div className="choices">
                  <button className="choice yes" disabled={busy} onClick={() => save("lines", "correct")}><Check /> Correct</button>
                  <button className="choice no" disabled={busy} onClick={startFix}><Cross /> Incorrect</button>
                </div>
              </>
            ) : (
              <div className="fix">
                <p className="small"><b>Fix the lines:</b> tap <b>inside a band</b> where it holds two lines, to split it there. Tap <b>between two bands</b> (or on their border) when they are one line, to join them. Use Zoom for precision.</p>
                {note && <p className="ok-note">{note}</p>}
                <div className="fix-actions">
                  <button className="btn primary" disabled={busy} onClick={() => save("lines", "incorrect", { edit: { lines: dLines, ops } })}>Save {dLines.length} lines</button>
                  <button className="btn" onClick={() => { setDLines(lines.map((l) => ({ box: l.box, chunks: l.chunks }))); setOps([]); setNote("Started over."); }}>Start over</button>
                  <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} onClick={() => setMode("ask")}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- 2. chunks of a line */}
        {step.kind === "chunks" && (
          <>
            <div className="ctx-label">The page — line {step.line + 1} in blue</div>
            <PageView page={page} lines={lines} heat={heat} zoom={false} focus={step.line} small />
            <div className="ctx-label">Line {step.line + 1}, cut into chunks</div>
            <LineView page={page} line={lines[step.line]} chunks={mode === "fix" ? dChunks : chunksOf(step.line)} heat={heat} sel={mode === "fix" ? sel : null}
              onTap={mode === "fix" ? tapChunks : undefined} />
            {mode === "ask" ? (
              <>
                <p className="question">Is line {step.line + 1} cut into the right chunks? Each box should hold <b>one chunk</b> (a word): <b>nothing missing</b>, every dot and vowel sign <b>inside</b> its box, nothing from a neighbour.</p>
                <div className="choices">
                  <button className="choice yes" disabled={busy} onClick={() => save("chunks", "correct", { line: step.line })}><Check /> Correct</button>
                  <button className="choice no" disabled={busy} onClick={startFix}><Cross /> Incorrect</button>
                </div>
              </>
            ) : (
              <div className="fix">
                <div className="tabs" style={{ margin: "0 0 8px" }}>
                  <button aria-pressed={tool === "split"} onClick={() => { setTool("split"); setSel(null); }}>✂ Split</button>
                  <button aria-pressed={tool === "join"} onClick={() => { setTool("join"); setSel(null); }}>⊕ Join</button>
                  <button aria-pressed={tool === "remove"} onClick={() => { setTool("remove"); setSel(null); }}>✕ Remove</button>
                </div>
                <p className="small">{tool === "split" ? "Tap inside a box at the place where it should be cut." : tool === "join" ? "Tap a box, then the box next to it: they become one." : "Tap a box that holds no text (a speck or a mark from another line)."}</p>
                {note && <p className="ok-note">{note}</p>}
                <div className="fix-actions">
                  <button className="btn primary" disabled={busy || !dChunks.length} onClick={() => save("chunks", "incorrect", { line: step.line, edit: { chunks: dChunks, ops } })}>Save {dChunks.length} chunks</button>
                  <button className="btn" onClick={() => { setDChunks(chunksOf(step.line)); setOps([]); setSel(null); setNote("Started over."); }}>Start over</button>
                  <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} onClick={() => setMode("ask")}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- 3. text of a chunk */}
        {step.kind === "text" && (() => {
          const c = chunksOf(step.line)[step.chunk];
          const meta = { line: step.line, chunk: step.chunk, edit: { box: c.box, shown: c.text } };
          return (
            <>
              <div className="ctx-label">Line {step.line + 1} — chunk {step.chunk + 1} in blue</div>
              <LineView page={page} line={lines[step.line]} chunks={chunksOf(step.line)} heat={false} sel={step.chunk} />
              <div className="ctx-label">Chunk {step.chunk + 1}</div>
              <ChunkView page={page} box={c.box} heat={false} />
              <div className="typed">
                <div className="label">Typed text</div>
                <p className="text ks">{c.text || <span className="muted" style={{ fontSize: 16, fontFamily: "var(--ui)" }}>(nothing yet: please type it)</span>}</p>
              </div>
              {mode === "ask" ? (
                <>
                  <p className="question">Is this chunk marked correctly: does the typed text match it exactly, every letter and vowel sign, with nothing missing?</p>
                  <div className="choices">
                    <button className="choice yes" disabled={busy || !c.text} onClick={() => save("text", "correct", meta)}><Check /> Correct</button>
                    <button className="choice no" disabled={busy} onClick={startFix}><Cross /> {c.text ? "Incorrect" : "Type it"}</button>
                  </div>
                  <div className="skip">
                    <button className="btn ghost" disabled={busy} onClick={() => save("text", "skip", meta)}>Can&apos;t tell — skip</button>
                    <button className="btn ghost" disabled={busy} onClick={() => {
                      fixOnArrive.current = true;
                      setIdx(steps.findIndex((s) => s.kind === "chunks" && s.line === step.line));
                    }}>The box is wrong</button>
                  </div>
                </>
              ) : (
                <div className="fix">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="fix">Type what the chunk says</label>
                    <input id="fix" ref={input} className="fix-input ks" dir="rtl" value={text} onChange={(e) => setText(e.target.value)} lang="ks" autoComplete="off" spellCheck={false}
                      onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); save("text", "incorrect", { ...meta, correction: text }); } }} />
                  </div>
                  <Keyboard onKey={insert} />
                  <div className="fix-actions" style={{ marginTop: 14 }}>
                    <button className="btn primary" disabled={busy || !text.trim()} onClick={() => save("text", "incorrect", { ...meta, correction: text })}>Save text</button>
                    <button className="btn" disabled={busy} onClick={() => save("text", "incorrect", meta)}>Wrong, but I can&apos;t type it</button>
                    <button className="btn ghost" style={{ flex: "none", minWidth: 0 }} onClick={() => setMode("ask")}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ---------------- 4. page finished */}
        {step.kind === "done" && (
          <div className="empty">
            <Leaf />
            <h2 style={{ marginTop: 10 }}>Page finished — thank you!</h2>
            <p className="muted">{nLines} lines, {lines.reduce((n, _, i) => n + chunksOf(i).length, 0)} chunks checked. You have <b>{stats?.points ?? 0}</b> points.</p>
            {stats?.badges?.length ? <p className="badges">{stats.badges.map((b) => <span key={b.id} className="badge" title={b.why}>{b.icon} {b.name}</span>)}</p> : null}
            <button className="btn primary" disabled={busy} onClick={async () => { await save("page", "done"); await load(); }}>Next page ›</button>
          </div>
        )}
        {err && <p className="err" style={{ padding: "0 22px 16px" }}>{err}</p>}
      </article>
    </div>
  );
}
