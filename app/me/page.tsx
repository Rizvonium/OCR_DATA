"use client";
import Link from "next/link";
import { api, useApp } from "@/components/AppState";
import { Join } from "@/components/Join";


export default function Profile() {
  const { me, stats, loaded, refresh } = useApp();
  if (!loaded) return null;
  if (!me) return <Join />;
  const signOut = async () => { await api("/api/session", { method: "DELETE" }); await refresh(); };

  return (
    <>
      <h1>{me.handle}</h1>
      <p className="lede">Your work is credited to this username in the dataset.</p>
      <div className="grid3">
        <div className="card stat"><div className="k">Points</div><div className="v">{stats?.points ?? 0}</div><div className="s">1 point for every picture you answer</div></div>
        <div className="card stat"><div className="k">Rank</div><div className="v">{stats?.points ? `#${stats.rank}` : "—"}</div><div className="s">{stats?.ranked ? `of ${stats.ranked} people` : ""}</div></div>
        <div className="card stat"><div className="k">Today</div><div className="v">{stats?.today ?? 0}</div><div className="s">answered in the last 24 hours</div></div>
        <div className="card stat"><div className="k">Corrections typed</div><div className="v">{stats?.corrections ?? 0}</div><div className="s">fixes you wrote in Kashmiri</div></div>
        <div className="card stat"><div className="k">Page photos added</div><div className="v">{stats?.photos ?? 0}</div><div className="s"><Link href="/upload">add more</Link></div></div>
      </div>

      <div className="card panel" style={{ maxWidth: 680 }}>
        <h2>Other devices</h2>
        <p className="muted small">Sign in anywhere with your username <b>{me.handle}</b> and your PIN.</p>
        <button className="btn ghost" onClick={signOut}>Sign out on this device</button>
      </div>
    </>
  );
}
