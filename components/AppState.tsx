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

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(url, {
    ...init, cache: "no-store",
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}
