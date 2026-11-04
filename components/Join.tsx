"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApp } from "./AppState";

// The first screen. Three ways in:
//   remembered: this browser has a device pass -> "Continue as <name>", no PIN needed
//   signin:     username + PIN of an existing profile
//   create:     a new username (checked live against registered names) + PIN chosen twice
const LAST = "ks_last_user";
type Mode = "remembered" | "signin" | "create";
const remember = (h: string) => { try { localStorage.setItem(LAST, h); } catch {} };

export function Join() {
  const { refresh, remembered } = useApp();
  const [last, setLast] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("signin");
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [consent, setConsent] = useState(false);
  const [check, setCheck] = useState<{ available: boolean; reason?: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // the server's device pass decides "Continue as"; the name kept in the browser only pre-fills sign-in
    let l: string | null = null;
    try { l = localStorage.getItem(LAST); } catch {}
    if (remembered) { setLast(remembered); setMode("remembered"); }
    else { setLast(null); setHandle(l || ""); setMode("signin"); }
  }, [remembered]);

  async function resume() {
    setErr(""); setBusy(true);
    try { await api("/api/session/resume", { method: "POST" }); await refresh(); }
    catch (x: any) { setErr(x.message); await refresh(); } finally { setBusy(false); }
  }
  async function notMe() {
    await api("/api/session/forget", { method: "POST" }).catch(() => {});
    try { localStorage.removeItem(LAST); } catch {}
    setLast(null); setHandle(""); setMode("signin"); await refresh();
  }

  // live check of a new username
  useEffect(() => {
    clearTimeout(timer.current); setCheck(null);
    if (mode !== "create" || handle.trim().length < 2) return;
    timer.current = setTimeout(() => {
      api(`/api/session/check?handle=${encodeURIComponent(handle)}`).then(setCheck).catch(() => {});
    }, 350);
  }, [handle, mode]);

  const go = (m: Mode) => { setMode(m); setErr(""); setPin(""); setPin2(""); if (m === "create") setHandle(""); };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (mode === "create" && pin !== pin2) { setErr("The two PINs are different."); return; }
    const name = handle;
    setBusy(true);
    try {
      const r = await api("/api/session", { method: "POST", json: { mode: mode === "create" ? "create" : "signin", handle: name, pin, consent } });
      remember(r.me.handle);
      await refresh();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }

  const pinInput = (id: string, value: string, set: (v: string) => void, label: string, auto: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input pin" value={value} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 6))}
        type="password" inputMode="numeric" autoComplete={auto} placeholder="••••" required />
    </div>
  );

  return (
    <section className="gate">
      <div className="gate-brand">
        <p className="ksline">کٲشُر زَبان</p>
        <h1>Kashmiri OCR Data</h1>
        <p className="lede">Check pictures of printed Kashmiri words against their typed text, and help build an open dataset that teaches computers to read Kashmiri.</p>
      </div>

      <form className="card join" onSubmit={submit}>
        {mode === "remembered" && last && (
          <>
            <h2>Welcome back</h2>
            <div className="who-card"><span className="avatar">{last.slice(0, 1).toUpperCase()}</span><b>{last}</b></div>
            <button type="button" className="btn primary" style={{ width: "100%" }} disabled={busy} onClick={resume}>Continue as {last}</button>
            {err && <p className="err">{err}</p>}
            <div className="join-links">
              <button type="button" className="linkbtn" onClick={notMe}>Not {last}? Use another name</button>
              <button type="button" className="linkbtn" onClick={() => go("create")}>New here? Create a profile</button>
            </div>
          </>
        )}

        {mode === "signin" && (
          <>
            <h2>Sign in</h2>
            <div className="field"><label htmlFor="h">Username</label>
              <input id="h" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="username" maxLength={24} required /></div>
            {pinInput("p", pin, setPin, "PIN", "current-password")}
            <button className="btn primary" style={{ width: "100%" }} disabled={busy || handle.trim().length < 2 || pin.length < 4}>Sign in</button>
            {err && <p className="err">{err}</p>}
            <div className="join-links"><span className="muted small">New here?</span>
              <button type="button" className="linkbtn" onClick={() => go("create")}>Create a profile</button></div>
          </>
        )}

        {mode === "create" && (
          <>
            <h2>Create your profile</h2>
            <div className="field"><label htmlFor="h">Choose a username</label>
              <input id="h" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. Habba or ZoonDar" autoComplete="username" maxLength={24} required />
              {check && <p className={check.available ? "ok-note" : "err"} style={{ margin: 0 }}>{check.available ? "✓ This name is free." : `${check.reason} Pick another, or sign in if it is yours.`}</p>}
            </div>
            {pinInput("p", pin, setPin, "Choose a PIN (4–6 digits)", "new-password")}
            {pinInput("p2", pin2, setPin2, "Type the PIN again", "new-password")}
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>My answers and photos may be published in an open Kashmiri OCR dataset, credited to my username.</span>
            </label>
            <button className="btn primary" style={{ width: "100%" }}
              disabled={busy || handle.trim().length < 2 || pin.length < 4 || pin2.length < 4 || !consent || check?.available === false}>Create profile</button>
            {err && <p className="err">{err}</p>}
            <p className="muted small">Remember your PIN: it is the only way back into your profile on another device.</p>
            <div className="join-links"><span className="muted small">Already registered?</span>
              <button type="button" className="linkbtn" onClick={() => { go(last ? "remembered" : "signin"); }}>Sign in</button></div>
          </>
        )}
      </form>
      <Link href="/admin" className="admin-link">Admin</Link>
    </section>
  );
}
