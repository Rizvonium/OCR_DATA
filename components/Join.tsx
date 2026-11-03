"use client";
import { useState } from "react";
import { api, useApp } from "./AppState";

export function Join() {
  const { refresh } = useApp();
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api("/api/session", { method: "POST", json: { handle, email, consent } }); await refresh(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  async function restore(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api("/api/session/restore", { method: "POST", json: { key } }); await refresh(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <section className="hero">
      <div>
        <p className="ksline">کٲشُر زَبان</p>
        <h1>Teach computers to read Kashmiri.</h1>
        <p className="lede">
          We have thousands of pictures of printed Kashmiri words, each cut out of a page by a computer and
          paired with typed text. Some pairs are wrong. You look at one picture at a time and tell us whether
          the typed text matches it. Every answer goes into an open dataset for Kashmiri text recognition.
        </p>
        <ol className="steps">
          <li><span className="n">1</span><span><b>Look at the picture</b> and the typed text under it.</span></li>
          <li><span className="n">2</span><span><b>Correct</b> if every letter and vowel sign matches. <b>Incorrect</b> if anything differs.</span></li>
          <li><span className="n">3</span><span>If incorrect, <b>type the right text</b> if you can, or just submit.</span></li>
        </ol>
      </div>
      <div className="card join">
        {!restoring ? (
          <form onSubmit={join}>
            <h2>Join in a few seconds</h2>
            <p className="muted small" style={{ marginTop: -4 }}>No password. You get your own contributor code; your name appears on the leaderboard.</p>
            <div className="field">
              <label htmlFor="h">Display name</label>
              <input id="h" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. Habba or ZoonDar" autoComplete="nickname" maxLength={24} required />
            </div>
            <div className="field">
              <label htmlFor="e">Email <span style={{ fontWeight: 400 }}>(optional, only to credit or contact you)</span></label>
              <input id="e" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>My answers may be published in an open Kashmiri OCR dataset, credited to my display name and contributor code.</span>
            </label>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy || !consent || handle.trim().length < 2}>Start reviewing</button>
            {err && <p className="err">{err}</p>}
            <div className="or">already joined on another device?</div>
            <button type="button" className="btn ghost" style={{ width: "100%" }} onClick={() => { setRestoring(true); setErr(""); }}>Continue with my recovery key</button>
          </form>
        ) : (
          <form onSubmit={restore}>
            <h2>Continue where you left off</h2>
            <p className="muted small">Paste the recovery key from your Profile page on the other device.</p>
            <div className="field">
              <label htmlFor="k">Recovery key</label>
              <input id="k" className="input mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ks_…" autoComplete="off" required />
            </div>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>Continue</button>
            {err && <p className="err">{err}</p>}
            <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => { setRestoring(false); setErr(""); }}>Back</button>
          </form>
        )}
      </div>
    </section>
  );
}
