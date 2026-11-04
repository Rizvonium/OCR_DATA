"use client";
import { usePathname } from "next/navigation";
import { useApp } from "./AppState";
import { Join } from "./Join";

// Nothing but the sign-in screen until someone is signed in. /admin has its own sign-in.
export function Gate({ children }: { children: React.ReactNode }) {
  const { me, loaded } = useApp();
  const path = usePathname();
  if (path.startsWith("/admin")) return <>{children}</>;
  if (!loaded) return null;
  return me ? <>{children}</> : <Join />;
}
