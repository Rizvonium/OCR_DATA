// Kashmiri text clean-up for typed corrections, in the dictionary repo's Unicode convention:
// NFC, Arabic ك/ي/ه mapped to Kashmiri ک/ی/ہ, tatweel and ZWJ removed, spaces collapsed.
const MAP: Record<string, string> = { "ك": "ک", "ي": "ی", "ه": "ہ", "ى": "ی" };

export function normalizeKs(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[ـ‍]/g, "")
    .replace(/[كيهى]/g, (c) => MAP[c] ?? c)
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
}

const ARABIC_LETTER = /[ء-يٮ-ۓۺ-ۿݐ-ݿ]/;
const ALLOWED = /^[؀-ۿݐ-ݿࢠ-ࣿ‌﴾﴿\s.\-'"()]+$/;

/** Returns an error message, or null if the correction looks like Kashmiri text. */
export function checkCorrection(s: string): string | null {
  if (!s) return "Type the text you see, or submit without typing.";
  if (s.length > 160) return "That is longer than any word or line here.";
  if (!ARABIC_LETTER.test(s)) return "Please type in Kashmiri (Perso-Arabic) script.";
  if (!ALLOWED.test(s)) return "Only Kashmiri letters and signs, please (no Latin letters or digits).";
  return null;
}

/** Same letters and signs, ignoring spacing differences: for comparing with gold answers. */
export function sameText(a: string, b: string): boolean {
  return normalizeKs(a).replace(/\s/g, "") === normalizeKs(b).replace(/\s/g, "");
}
