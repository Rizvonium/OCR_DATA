"use client";
import { useEffect, useState } from "react";
import { GroupReview } from "@/components/GroupReview";
import { PageReview } from "@/components/PageReview";

// Two tasks: label look-alike chunks (main), and check how pages were cut into lines and chunks.
export default function Home() {
  const [task, setTask] = useState<"label" | "cut">("label");
  useEffect(() => { try { const t = localStorage.getItem("ks_task"); if (t === "cut" || t === "label") setTask(t); } catch {} }, []);
  const pick = (t: "label" | "cut") => { setTask(t); try { localStorage.setItem("ks_task", t); } catch {} };
  return (
    <>
      <div className="task-switch">
        <div className="tabs" style={{ margin: 0 }}>
          <button aria-pressed={task === "label"} onClick={() => pick("label")}>Label chunks</button>
          <button aria-pressed={task === "cut"} onClick={() => pick("cut")}>Check segmentation</button>
        </div>
      </div>
      {task === "label" ? <GroupReview /> : <PageReview />}
      <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}><a href="/words">Quick check of single words ›</a></p>
    </>
  );
}
