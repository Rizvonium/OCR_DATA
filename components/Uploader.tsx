"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./AppState";

// Photos of Kashmiri pages. Each photo is shrunk in the browser (long side 2400 px, JPEG), checked for
// blur and darkness, and uploaded one by one.
const LONG_SIDE = 2400, THUMB = 360;
type Q = { sharp: number; bright: number; label: "sharp" | "ok" | "blurry"; dark: boolean };
type Item = { key: string; name: string; photo?: Blob; thumb?: Blob; preview?: string; q?: Q; w?: number; h?: number;
  state: "reading" | "ready" | "uploading" | "done" | "duplicate" | "error"; error?: string };
type Mine = { id: number; source: string | null; page: string | null; status: string; created_at: string };
const STATUS: Record<string, string> = { new: "waiting for review", kept: "kept ✓", used: "in the dataset ✓", rejected: "not usable" };

function canvasOf(img: ImageBitmap, long: number) {
  const s = Math.min(1, long / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
const toBlob = (c: HTMLCanvasElement, quality: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));

// Sharpness = variance of the Laplacian over the middle of the page (on a 1000 px copy); brightness = mean grey.
function measure(img: ImageBitmap): Q {
  const c = canvasOf(img, 1000), ctx = c.getContext("2d")!;
  const x0 = Math.round(c.width * 0.2), y0 = Math.round(c.height * 0.2), w = Math.round(c.width * 0.6), h = Math.round(c.height * 0.6);
  const d = ctx.getImageData(x0, y0, w, h).data, g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < g.length; i++) { g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]; sum += g[i]; }
  let s1 = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, l = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
    s1 += l; s2 += l * l; n++;
  }
  const sharp = n ? s2 / n - (s1 / n) ** 2 : 0, bright = sum / g.length;
  return { sharp: Math.round(sharp), bright: Math.round(bright), label: sharp > 140 ? "sharp" : sharp > 50 ? "ok" : "blurry", dark: bright < 90 };
}

export function Uploader() {
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState("");
  const [page, setPage] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<{ rows: Mine[]; total: number } | null>(null);
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);
  const loadMine = useCallback(() => api("/api/uploads").then(setMine).catch(() => {}), []);
  useEffect(() => { loadMine(); }, [loadMine]);
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function add(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      setItems((xs) => [...xs, { key, name: f.name, state: "reading" }]);
      try {
        const img = await createImageBitmap(f, { imageOrientation: "from-image" });
        const q = measure(img);
        const photo = await toBlob(canvasOf(img, LONG_SIDE), 0.88);
        const thumb = await toBlob(canvasOf(img, THUMB), 0.7);
        patch(key, { photo, thumb, q, w: img.width, h: img.height, preview: URL.createObjectURL(thumb), state: "ready" });
        img.close();
      } catch {
        patch(key, { state: "error", error: "Could not open this photo. If it is HEIC, take it with the camera button here instead." });
      }
    }
  }

  async function uploadAll() {
    setBusy(true);
    for (const it of items.filter((x) => x.state === "ready")) {
      patch(it.key, { state: "uploading" });
      const fd = new FormData();
      fd.append("photo", it.photo!, "page.jpg"); fd.append("thumb", it.thumb!, "thumb.jpg");
      fd.append("source", source); fd.append("page", page); fd.append("quality", JSON.stringify(it.q));
      try {
        const r = await fetch("/api/uploads", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) patch(it.key, { state: "error", error: j.error || `HTTP ${r.status}` });
        else patch(it.key, { state: j.duplicate ? "duplicate" : "done" });
      } catch { patch(it.key, { state: "error", error: "Network problem. Try again." }); }
    }
    setBusy(false); loadMine();
  }

  const ready = items.filter((x) => x.state === "ready").length;
  return (
    <div className="uploader">
      <h1>Add photos of Kashmiri pages</h1>
      <p className="lede">Books, newspapers, magazines, signs: any printed or handwritten Kashmiri. We cut your photos into words for
        everyone to check, and they become part of the open dataset.</p>

      <div className="tips card panel">
        <b>For a good photo</b>
        <ul>
          <li>One page per photo, the <b>whole page</b> in the frame, held flat.</li>
          <li><b>Daylight</b>, no flash, no shadow of your phone or hand.</li>
          <li>Hold the phone <b>straight above</b> the page and keep still.</li>
          <li>No faces, names, phone numbers or private documents.</li>
        </ul>
      </div>

      <div className="card panel">
        <div className="up-fields">
          <div className="field"><label htmlFor="src">Book, newspaper or place (optional)</label>
            <input id="src" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Kaesher Lugaat, vol. 2" maxLength={160} /></div>
          <div className="field"><label htmlFor="pg">Page (optional)</label>
            <input id="pg" className="input" value={page} onChange={(e) => setPage(e.target.value)} placeholder="e.g. 112" maxLength={40} /></div>
        </div>
        <div className="up-buttons">
          <button className="btn primary" onClick={() => camera.current?.click()}>📷 Take a photo</button>
          <button className="btn" onClick={() => gallery.current?.click()}>Choose photos</button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>

        {items.length > 0 && (
          <div className="up-list">
            {items.map((it) => (
              <div className="up-item" key={it.key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.preview ? <img src={it.preview} alt="" /> : <div className="up-ph" />}
                <div className="up-meta">
                  <div className="small">{it.w ? `${it.w} × ${it.h}` : it.name}</div>
                  {it.q && (
                    <div className="small">
                      <span className={`flag ${it.q.label === "blurry" ? "" : "okflag"}`}>{it.q.label === "blurry" ? "looks blurry: retake?" : it.q.label === "ok" ? "a little soft" : "sharp"}</span>
                      {it.q.dark && <span className="flag">dark: more light?</span>}
                    </div>
                  )}
                  <div className="small muted">{{ reading: "preparing…", ready: "ready", uploading: "uploading…", done: "uploaded ✓", duplicate: "already uploaded before", error: it.error }[it.state]}</div>
                </div>
                {(it.state === "ready" || it.state === "error") && (
                  <button className="iconbtn" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I took these photos or may share them, they show no private information, and they may be used in the open Kashmiri OCR dataset.</span>
        </label>
        <button className="btn primary" style={{ width: "100%" }} disabled={!ok || !ready || busy} onClick={uploadAll}>
          {busy ? "Uploading…" : ready ? `Upload ${ready} photo${ready > 1 ? "s" : ""}` : "Upload"}
        </button>
      </div>

      {mine && mine.total > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Your photos <span className="muted small">({mine.total})</span></h2>
          <div className="up-grid">
            {mine.rows.map((m) => (
              <div className="card up-card" key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/uploads/${m.id}?size=thumb`} alt="" loading="lazy" />
                <div className="small">{m.source || "—"}{m.page ? ` · p. ${m.page}` : ""}</div>
                <div className="small muted">{STATUS[m.status] ?? m.status}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
