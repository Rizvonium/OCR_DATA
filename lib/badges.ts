// Badges, from a person's numbers. Shared by the server (leaderboard) and the pages.
export type BadgeStats = { points: number; pages: number; corrections: number; days: number; photos: number };
export type Badge = { id: string; icon: string; name: string; why: string };

const RULES: [string, string, string, string, (s: BadgeStats) => boolean][] = [
  ["first", "🌱", "First steps", "10 answers", (s) => s.points >= 10],
  ["hundred", "🍂", "Chinar leaf", "100 answers", (s) => s.points >= 100],
  ["five-hundred", "🍁", "Chinar tree", "500 answers", (s) => s.points >= 500],
  ["thousand", "🏔️", "Harmukh", "1,000 answers", (s) => s.points >= 1000],
  ["page", "📄", "First page", "finished a whole page", (s) => s.pages >= 1],
  ["pages10", "📚", "Page turner", "finished 10 pages", (s) => s.pages >= 10],
  ["scribe", "✍️", "Scribe", "typed 10 corrections", (s) => s.corrections >= 10],
  ["katib", "🖋️", "Katib", "typed 100 corrections", (s) => s.corrections >= 100],
  ["regular", "📅", "Regular", "answered on 3 different days", (s) => s.days >= 3],
  ["photographer", "📷", "Photographer", "added 5 page photos", (s) => s.photos >= 5],
];

export function badgesFor(s: BadgeStats): Badge[] {
  return RULES.filter((r) => r[4](s)).map(([id, icon, name, why]) => ({ id, icon, name, why }));
}
export const ALL_BADGES: Badge[] = RULES.map(([id, icon, name, why]) => ({ id, icon, name, why }));
