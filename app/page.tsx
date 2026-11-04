"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GroupReview } from "@/components/GroupReview";
import { MatchGame } from "@/components/MatchGame";
import { PageReview } from "@/components/PageReview";

// Three tasks: label look-alike groups, match the same letters across fonts, check the segmentation.
type Task = "label" | "match" | "cut";
const TASKS: [Task, string][] = [["label", "Label"], ["match", "Match"], ["cut", "Segmentation"]];

export default function Home() {
  const [task, setTask] = useState<Task>("label");
  useEffect(() => { try { const t = localStorage.getItem("ks_task") as Task; if (TASKS.some(([k]) => k === t)) setTask(t); } catch {} }, []);
  const pick = (t: Task) => { setTask(t); try { localStorage.setItem("ks_task", t); } catch {} };
  return (
    <>
      <div className="task-switch">
        <div className="tabs" style={{ margin: 0 }}>
          {TASKS.map(([k, l]) => <button key={k} aria-pressed={task === k} onClick={() => pick(k)}>{l}</button>)}
        </div>
      </div>
      <TeamProgress task={task} />
      {task === "label" ? <GroupReview /> : task === "match" ? <MatchGame /> : <PageReview />}
      <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}><Link href="/words">Quick check of single words ›</Link></p>
    </>
  );
}

// "Everyone together": how far the whole team is with this task, so it is clear nobody starts over.
type Team = { label: { done: number; full: number; total: number }; match: { done: number; total: number }; cut: { done: number; total: number }; people: number };
function TeamProgress({ task }: { task: Task }) {
  const [t, setT] = useState<Team | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/team", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (live && d.label) setT(d); }).catch(() => {});
    load(); const id = setInterval(load, 60_000);
    return () => { live = false; clearInterval(id); };
  }, [task]);
  if (!t) return null;
  const n = (x: number) => x.toLocaleString();
  const [done, total, what] = task === "label" ? [t.label.done, t.label.total, "chunks labelled"]
    : task === "match" ? [t.match.done, t.match.total, "boards played"] : [t.cut.done, t.cut.total, "pages checked"];
  const pct = total ? Math.min(100, (100 * done) / total) : 0;
  return (
    <div className="team-progress" title="You are always given what the fewest people have done yet">
      <div className="small"><b>Everyone together:</b> {n(done)} of {n(total)} {what} · {n(t.people)} people
        {task === "label" && t.label.full ? ` · ${n(t.label.full)} finished` : ""}</div>
      <div className="bar"><span style={{ width: `${pct.toFixed(1)}%` }} /></div>
    </div>
  );
}
