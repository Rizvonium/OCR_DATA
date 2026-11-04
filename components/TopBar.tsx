"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "./AppState";
import { Leaf, Moon, Sun } from "./icons";

const LINKS = [["/", "Review"], ["/upload", "Photos", "Add photos"], ["/leaderboard", "Board", "Leaderboard"], ["/guide", "Guide", "How to judge"], ["/me", "Me", "Profile"]];

export function TopBar() {
  const path = usePathname();
  const { me, stats, preview } = useApp();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    setDark(!dark);
  };
  return (
    <>
    {preview && (
      <div className="preview">Preview mode: no database is connected, so answers are temporary. Add <code>DATABASE_URL</code> in Vercel to keep them (see README).</div>
    )}
    <header className="top">
      <div className="top-in">
        <Link href="/" className="brand" aria-label="Kashmiri OCR Data home">
          <Leaf />
          <div><b>Kashmiri OCR Data</b><span className="ks">کٲشُر</span></div>
        </Link>
        {me && <nav className="nav">
          {LINKS.map(([href, label, long]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
              {long ? <><span className="long">{long}</span><span className="short">{label}</span></> : label}
            </Link>
          ))}
        </nav>}
        <div className="top-right">
          {me && stats && (
            <Link href="/me" className="chip hide-sm" style={{ textDecoration: "none", color: "inherit" }} title="Your points and rank">
              <span className="dot" />{stats.points ?? 0} pts{stats.points ? ` · #${stats.rank}` : ""}
            </Link>
          )}
          <button className="iconbtn" onClick={toggle} aria-label={dark ? "Light theme" : "Dark theme"}>{dark ? <Sun /> : <Moon />}</button>
        </div>
      </div>
    </header>
    </>
  );
}
