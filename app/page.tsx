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
      {task === "label" ? <GroupReview /> : task === "match" ? <MatchGame /> : <PageReview />}
      <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}><Link href="/words">Quick check of single words ›</Link></p>
    </>
  );
}
