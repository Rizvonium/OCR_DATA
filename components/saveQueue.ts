"use client";
// Answers are saved in the background so the next item appears at once. Every save goes into a queue
// kept on the phone (localStorage) and is sent in order; network problems and server hiccups are
// retried until they succeed, also after a reload or when the phone comes back online. Only an answer
// the server refuses for good (a 4xx such as "already answered") is dropped, with a message.
import { useEffect, useState } from "react";

type Job = { id: string; url: string; method: string; body: unknown };
export type SaveState = { pending: number; status: "idle" | "saving" | "offline" | "error"; error?: string; savedAt?: number };

const KEY = "ks_pending_saves";
let jobs: Job[] = [];
let loaded = false, running = false;
let state: SaveState = { pending: 0, status: "idle" };
const subs = new Set<(s: SaveState) => void>();
const savedHandlers = new Set<(data: any) => void>();
const idleWaiters: (() => void)[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function load() { if (loaded) return; loaded = true; try { jobs = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { jobs = []; } }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch {} }
function emit(p: Partial<SaveState>) {
  state = { ...state, ...p, pending: jobs.length };
  subs.forEach((f) => f(state));
  if (!jobs.length) idleWaiters.splice(0).forEach((f) => f());
}

/** Queue a save; it is sent as soon as possible, in order, and survives reloads. */
export function enqueue(url: string, method: string, body: unknown) {
  load();
  jobs.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, url, method, body });
  persist(); emit({ status: "saving", error: undefined }); run();
}

/** Called with the server's reply to every save (e.g. to update the points). */
export function onSaved(fn: (data: any) => void) { savedHandlers.add(fn); return () => { savedHandlers.delete(fn); }; }

/** Resolves when every queued save has been sent. */
export function whenIdle(): Promise<void> { load(); return jobs.length ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve(); }

async function run() {
  if (running) return;
  running = true;
  let delay = 800;
  while (jobs.length) {
    const j = jobs[0];
    try {
      const r = await fetch(j.url, { method: j.method, headers: { "content-type": "application/json" }, body: JSON.stringify(j.body), cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        jobs.shift(); persist(); delay = 800;
        savedHandlers.forEach((f) => f(data));
        emit({ status: jobs.length ? "saving" : "idle", error: undefined, savedAt: Date.now() });
        continue;
      }
      if (r.status === 401) { emit({ status: "error", error: "You were signed out. Sign in again: your answers are kept and will be sent." }); break; }
      if (r.status >= 500 || r.status === 429) { emit({ status: "offline" }); await sleep(delay); delay = Math.min(delay * 2, 15000); continue; }
      jobs.shift(); persist(); // refused for good: drop it, say so, carry on with the rest
      emit({ status: jobs.length ? "saving" : "error", error: data.error || `One answer was not accepted (${r.status}).` });
    } catch {
      emit({ status: "offline" }); await sleep(delay); delay = Math.min(delay * 2, 15000);
    }
  }
  running = false;
}

/** Start sending what an earlier visit left in the queue; resume when the phone is back online. */
export function startQueue() {
  load();
  if (jobs.length) { emit({ status: "saving" }); run(); }
  window.addEventListener("online", () => { load(); if (jobs.length) run(); });
}

export function useSaveState() {
  const [s, set] = useState<SaveState>(state);
  useEffect(() => { subs.add(set); set(state); return () => { subs.delete(set); }; }, []);
  return s;
}
