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

// Every character the on-screen keyboard can type (lib/ks-keyboard.json) must be accepted: any
// Perso-Arabic letter, digit or punctuation mark counts (earlier a fixed list of code ranges started at
// U+0621 and so refused ؠ U+0620, ۯ, the digits and the punctuation).
const ARABIC_BLOCKS = /[؀-ۿݐ-ݿࢠ-ࣿ﴾﴿]/;
const ALLOWED = /^[؀-ۿݐ-ݿࢠ-ࣿ‌﴾﴿\s.\-'"()]+$/;
const isBase = (c: string) => ARABIC_BLOCKS.test(c) && /[\p{L}\p{N}\p{P}\p{S}]/u.test(c); // not a mark or invisible

/** Returns an error message, or null if the correction looks like Kashmiri text. */
export function checkCorrection(s: string): string | null {
  if (!s) return "Type the text you see, or submit without typing.";
  if (s.length > 160) return "That is longer than any word or line here.";
  if (!ALLOWED.test(s)) return "Only Kashmiri letters and signs, please (no Latin letters or digits).";
  if (![...s].some(isBase)) {
    return /\p{M}/u.test(s)
      ? "A vowel sign needs the letter it sits on: type the letter first, then the sign."
      : "Please type in Kashmiri (Perso-Arabic) script.";
  }
  return null;
}

/** Same letters and signs, ignoring spacing differences: for comparing with gold answers. */
export function sameText(a: string, b: string): boolean {
  return normalizeKs(a).replace(/\s/g, "") === normalizeKs(b).replace(/\s/g, "");
}
