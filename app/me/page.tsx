"use client";
import { api, useApp } from "@/components/AppState";
import { Join } from "@/components/Join";

const FLAG_TEXT: Record<string, string> = {
  too_fast: "Answers come very quickly. Take a moment with each picture.",
  fails_checks: "Several check items were answered wrongly. Look closely at vowel signs.",
  same_button: "Almost every answer is the same button.",
  disagrees: "Your answers often differ from other reviewers'.",
  burst: "Very many answers in the last hour.",
};

export default function Profile() {
  const { me, stats, loaded, refresh } = useApp();
  if (!loaded) return null;
  if (!me) return <Join />;
  const acc = stats && stats.gold_total ? Math.round((100 * stats.gold_pass) / stats.gold_total) : null;
  const signOut = async () => { await api("/api/session", { method: "DELETE" }); await refresh(); };

  return (
    <>
      <h1>{me.handle}</h1>
      <p className="lede">Your work is credited to this username in the dataset.</p>
      {stats && stats.flags?.length > 0 && (
        <div className="card panel" style={{ marginBottom: 18, background: "var(--warn-soft)", borderColor: "transparent" }}>
          <h3>A gentle note</h3>
          {stats.flags.map((f) => <p key={f} className="small" style={{ margin: "4px 0" }}>{FLAG_TEXT[f] ?? f}</p>)}
          <p className="small muted" style={{ margin: "6px 0 0" }}>While this shows, your answers count less and you are not on the leaderboard. It clears by itself as your answers improve.</p>
        </div>
      )}
      <div className="grid3">
        <div className="card stat"><div className="k">Points</div><div className="v">{stats?.points ?? 0}</div><div className="s">{stats?.points ? `Rank #${stats.rank} of ${stats.ranked}` : "Not ranked yet"}</div></div>
        <div className="card stat"><div className="k">Pictures reviewed</div><div className="v">{stats?.reviews ?? 0}</div><div className="s">{stats?.today ?? 0} in the last 24 hours</div></div>
        <div className="card stat"><div className="k">Check items right</div><div className="v">{acc === null ? "—" : `${acc}%`}</div><div className="s">{stats?.gold_pass ?? 0} of {stats?.gold_total ?? 0}</div></div>
      </div>

      <div className="card panel" style={{ maxWidth: 680 }}>
        <h2>Other devices</h2>
        <p className="muted small">Sign in anywhere with your username <b>{me.handle}</b> and your PIN.</p>
        <button className="btn ghost" onClick={signOut}>Sign out on this device</button>
      </div>
    </>
  );
}
