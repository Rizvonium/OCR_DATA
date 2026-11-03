// Small inline icons (stroke = currentColor).
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Check = () => <svg viewBox="0 0 24 24" {...P}><path d="M20 6 9 17l-5-5" /></svg>;
export const Cross = () => <svg viewBox="0 0 24 24" {...P}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const Chevron = () => <svg viewBox="0 0 24 24" {...P}><path d="m9 18 6-6-6-6" /></svg>;
export const Sun = () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const Moon = () => <svg viewBox="0 0 24 24" {...P}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>;
export const Copy = () => <svg viewBox="0 0 24 24" {...P}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
export function Leaf(props: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={props.className}>
      <path fill="currentColor" d="M50 64 Q55.3 69.1 57.6 63.3 L69.7 64.5 L76.9 64.3 L85.2 61.5 L78.8 55.5 L72.3 52.4 Q68.8 51 64.6 50.6 L75.3 43.8 L80.8 36.9 L84.7 26.9 L74 28.3 L66 31.9 Q59.5 37.5 56.6 40.5 L57.9 26.6 L55.8 17.7 L50 8 L44.2 17.7 L42.1 26.6 Q42.9 36.4 43.4 40.5 L34 31.9 L26 28.3 L15.3 26.9 L19.2 36.9 L24.7 43.8 Q31.8 48.4 35.4 50.6 L27.7 52.4 L21.2 55.5 L14.8 61.5 L23.1 64.3 L30.3 64.5 Q43.4 66.4 42.4 63.3 Z" />
      <path d="M50 92 L50 56 M50 56 L80.3 60.4 M50 56 L79.8 30.7 M50 56 L50 14.4 M50 56 L20.2 30.7 M50 56 L19.7 60.4" stroke="rgba(255,240,230,.75)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
