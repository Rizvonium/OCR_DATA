import type { Metadata, Viewport } from "next";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/noto-naskh-arabic/arabic-400.css";
import "./globals.css";
import { AppState } from "@/components/AppState";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Kashmiri OCR Data",
  description: "Check pictures of printed Kashmiri words against their typed text, and help build an open Kashmiri OCR dataset.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#b4461e" };

// set theme before paint, from the visitor's last choice
const boot = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: boot }} /></head>
      <body>
        <AppState>
          <TopBar />
          <main>{children}</main>
        </AppState>
      </body>
    </html>
  );
}
