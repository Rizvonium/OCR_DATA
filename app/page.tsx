"use client";
import { PageReview } from "@/components/PageReview";

// Main review: whole pages, step by step (lines -> chunks -> text). Single words: /words.
export default function Home() {
  return (
    <>
      <PageReview />
      <p className="muted small" style={{ textAlign: "center", marginTop: 14 }}><a href="/words">Quick check of single words instead ›</a></p>
    </>
  );
}
