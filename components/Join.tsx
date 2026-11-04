"use client";
import { useState } from "react";
import { api, useApp } from "./AppState";

// One form for everyone: a new username creates a profile, a known one signs in with its PIN.
export function Join() {
  const { refresh } = useApp();
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api("/api/session", { method: "POST", json: { handle, pin, consent } }); await refresh(); }
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
      <form className="card join" onSubmit={go}>
        <h2>Start, or continue</h2>
        <p className="muted small" style={{ marginTop: -4 }}>New here? Pick a username and a PIN. Back again, on any device? Type the same username and PIN.</p>
        <div className="field">
          <label htmlFor="h">Username</label>
          <input id="h" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. Habba or ZoonDar" autoComplete="username" maxLength={24} required />
        </div>
        <div className="field">
          <label htmlFor="p">PIN (4–6 digits)</label>
          <input id="p" className="input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            type="password" inputMode="numeric" autoComplete="current-password" placeholder="••••" required />
        </div>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>New username: my answers may be published in an open Kashmiri OCR dataset, credited to my username.</span>
        </label>
        <button className="btn primary" style={{ width: "100%" }} disabled={busy || handle.trim().length < 2 || pin.length < 4}>Continue</button>
        {err && <p className="err">{err}</p>}
        <p className="muted small" style={{ marginBottom: 0 }}>Remember your PIN: it is the only way back into your profile and points.</p>
      </form>
    </section>
  );
}
