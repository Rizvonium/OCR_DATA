"use client";
import { useEffect, useState } from "react";
import { api, useApp } from "@/components/AppState";

type Row = { code: string; handle: string; points: number; reviews: number; confirmed_corrections: number; check_accuracy: number | null; agreement: number | null; week?: number };
type Progress = { samples: number; answers: number; contributors: number; status: Record<string, number> };
const STATUS: [string, string, string][] = [
  ["verified", "Verified", "var(--ok)"], ["corrected", "Corrected", "#3b82c4"], ["needs_text", "Wrong, text needed", "var(--warn)"],
  ["bad_crop", "Bad box", "#8b5cf6"], ["disputed", "Disputed", "var(--accent)"], ["open", "Needs reviews", "var(--line-strong)"],
];

export default function Leaderboard() {
  const { me } = useApp();
  const [period, setPeriod] = useState<"all" | "week">("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [prog, setProg] = useState<Progress | null>(null);
  useEffect(() => { setRows(null); api(`/api/leaderboard${period === "week" ? "?period=week" : ""}`).then((r) => setRows(r.rows)); }, [period]);
  useEffect(() => { api("/api/progress").then(setProg); }, []);
  const total = prog ? Object.values(prog.status).reduce((a, b) => a + b, 0) : 0;
  const top = rows?.slice(0, 3) ?? [];
  const val = (r: Row) => (period === "week" ? r.week ?? 0 : r.points);

  return (
    <>
      <h1>Leaderboard</h1>
      <p className="lede">One point per picture, more for corrections others agree with. Careful answers count most.</p>

      {prog && (
        <div className="card panel" style={{ marginBottom: 22 }}>
          <h3>The dataset so far <span className="muted small" style={{ fontWeight: 400 }}>{prog.samples.toLocaleString()} pictures · {prog.answers.toLocaleString()} answers · {prog.contributors} people</span></h3>
          <div className="bar">{STATUS.map(([k, , c]) => <i key={k} style={{ width: `${total ? (100 * (prog.status[k] || 0)) / total : 0}%`, background: c }} />)}</div>
          <div className="legend">{STATUS.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l} {(prog.status[k] || 0).toLocaleString()}</span>)}</div>
        </div>
      )}

      <div className="tabs">
        <button aria-pressed={period === "all"} onClick={() => setPeriod("all")}>All time</button>
        <button aria-pressed={period === "week"} onClick={() => setPeriod("week")}>This week</button>
      </div>

      {rows && rows.length > 0 && (
        <div className="podium">
          {top.map((r, i) => (
            <div className="card" key={r.code}>
              <span className={`medal m${i + 1}`}>{i + 1}</span>
              <div className="who">{r.handle}</div>
              <div className="pts">{val(r).toLocaleString()}</div>
              <div className="muted small">{period === "week" ? "reviews this week" : "points"} · <span className="mono">{r.code}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        {!rows ? <p className="muted" style={{ padding: 18 }}>Loading…</p> : rows.length === 0 ? (
          <p className="muted" style={{ padding: 18 }}>No one is ranked yet. Be the first!</p>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Name</th><th className="num">{period === "week" ? "This week" : "Points"}</th><th className="num">Reviews</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code} className={me?.code === r.code ? "me" : ""}>
                  <td className="rank">{i + 1}</td>
                  <td><b>{r.handle}</b> <span className="mono muted">{r.code}</span></td>
                  <td className="num"><b>{val(r).toLocaleString()}</b></td>
                  <td className="num">{r.reviews.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
