"use client";
import { useApp } from "@/components/AppState";
import { Join } from "@/components/Join";
import { Reviewer } from "@/components/Reviewer";

export default function Home() {
  const { me, loaded } = useApp();
  if (!loaded) return null;
  return me ? <Reviewer /> : <Join />;
}
