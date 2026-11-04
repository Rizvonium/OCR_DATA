"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Me = { id: string; code: string; handle: string; status: string; email: string | null };
export type Stats = {
  reviews: number; corrections: number; confirmed_corrections: number; gold_total: number; gold_pass: number;
  agreement_n: number; agreement_hits: number; today: number; flags: string[]; trust: number;
  points: number | null; rank: number; ranked: number; photos: number; pages: number; days: number;
  badges: { id: string; icon: string; name: string; why: string }[];
};
type Ctx = { remembered: string | null; preview: boolean; me: Me | null; stats: Stats | null; loaded: boolean; refresh: () => Promise<void>; setStats: (s: Stats) => void };
const C = createContext<Ctx>({ remembered: null, preview: false, me: null, stats: null, loaded: false, refresh: async () => {}, setStats: () => {} });

export function AppState({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [remembered, setRemembered] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { cache: "no-store" }).then((r) => r.json());
      setMe(r.me); setStats(r.stats ?? null); setPreview(!!r.preview); setRemembered(r.remembered?.handle ?? null);
      if (r.me?.handle) { try { localStorage.setItem("ks_last_user", r.me.handle); } catch {} }
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <C.Provider value={{ remembered, preview, me, stats, loaded, refresh, setStats }}>{children}</C.Provider>;
}
export const useApp = () => useContext(C);

// Every call is retried up to 3 times when the network drops or the server has a passing problem
// (5xx), so a bad mobile connection does not lose an answer. Saves are upserts, so a retry never
// stores anything twice.
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const req = {
    ...init, cache: "no-store" as RequestCache,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  };
  let last: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700 * 2 ** (attempt - 1)));
    let r: Response;
    try { r = await fetch(url, req); } catch (e) { last = Object.assign(new Error("No connection. Retrying…"), { status: 0 }); continue; }
    const data = await r.json().catch(() => ({}));
    if (r.ok) return data;
    last = Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
    if (r.status < 500) break; // a real answer from the server (e.g. a check failed): do not retry
  }
  if (last?.status === 0) last.message = "No connection — your answer was not saved. Check the network and try again.";
  throw last;
}
