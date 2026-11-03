"use client";
// Kashmiri on-screen keyboard, same phonetic layout as the Kashmiri dictionary site.
// Also maps the physical keyboard when "Type Kashmiri with my keyboard" is on.
export const KS_LAYOUT: [string, string, string, string][][] = [
  [["Backquote", "‌", "ً", "`"], ["Digit1", "1", "َ", "1"], ["Digit2", "2", "ِ", "2"], ["Digit3", "3", "ُ", "3"], ["Digit4", "4", "ٔ", "4"], ["Digit5", "5", "ٕ", "5"], ["Digit6", "6", "ٖ", "6"], ["Digit7", "7", "ٗ", "7"], ["Digit8", "8", "ٚ", "8"], ["Digit9", "9", "ٛ", "9"], ["Digit0", "0", "ٟ", "0"], ["Minus", "-", "ّ", "-"], ["Equal", "=", "ٰ", "="]],
  [["KeyQ", "ق", "ۄ", "q"], ["KeyW", "و", "ؤ", "w"], ["KeyE", "ع", "ٲ", "e"], ["KeyR", "ر", "ڑ", "r"], ["KeyT", "ت", "ٹ", "t"], ["KeyY", "ے", "ؠ", "y"], ["KeyU", "ء", "ۍ", "u"], ["KeyI", "ی", "ێ", "i"], ["KeyO", "ہ", "أ", "o"], ["KeyP", "پ", "إ", "p"], ["BracketLeft", "ْ", "ٓ", "["], ["BracketRight", "ٌ", "ٍ", "]"]],
  [["KeyA", "ا", "آ", "a"], ["KeyS", "س", "ص", "s"], ["KeyD", "د", "ڈ", "d"], ["KeyF", "ف", "ئ", "f"], ["KeyG", "گ", "غ", "g"], ["KeyH", "ھ", "ح", "h"], ["KeyJ", "ج", "ض", "j"], ["KeyK", "ک", "خ", "k"], ["KeyL", "ل", "ۂ", "l"]],
  [["KeyZ", "ز", "ذ", "z"], ["KeyX", "ش", "ژ", "x"], ["KeyC", "چ", "ث", "c"], ["KeyV", "ط", "ظ", "v"], ["KeyB", "ب", "ة", "b"], ["KeyN", "ن", "ں", "n"], ["KeyM", "م", "ۓ", "m"]],
];
export const KEYMAP: Record<string, [string, string]> = {};
KS_LAYOUT.flat().forEach(([code, n, s]) => { if (!code.startsWith("Digit") && code !== "Minus" && code !== "Equal") KEYMAP[code] = [n, s]; });
KS_LAYOUT[0].forEach(([code, , s]) => { KEYMAP[code] = [s, s]; }); // number row types the vowel signs

// The signs most often missing or wrong in typed Kashmiri, one tap each.
export const MARKS: [string, string][] = [["َ", "a"], ["ِ", "i"], ["ُ", "u"], ["ٔ", "ə"], ["ٕ", "ɨ"], ["ٖ", "iː"], ["ٗ", "uː"], ["ٚ", "e/o"], ["ٛ", "ʲ"], ["ٟ", "ɨː"], ["ّ", "shad"], ["ْ", "sukun"]];
export const KS_LETTERS = ["ٲ", "ۄ", "ؠ", "ۍ", "ے", "ژ", "ٹ", "ڈ", "ڑ", "ھ"];
const isMark = (c: string) => /\p{M}/u.test(c);

export function Keyboard({ onKey, full, shift }: { onKey: (s: string) => void; full: boolean; shift: boolean }) {
  return (
    <div className="kb" onMouseDown={(e) => e.preventDefault()}>
      <div className="kb-row">
        {MARKS.map(([c, n]) => <button type="button" key={c} className="key mark" title={n} onClick={() => onKey(c)}>{"\u25CC" + c}<small>{n}</small></button>)}
      </div>
      <div className="kb-row">
        {KS_LETTERS.map((c) => <button type="button" key={c} className="key" onClick={() => onKey(c)}>{c}</button>)}
        <button type="button" className="key wide" onClick={() => onKey("\b")}>⌫ delete</button>
      </div>
      {full && KS_LAYOUT.slice(1).map((row, i) => (
        <div className="kb-row" key={i}>
          {row.map(([code, n, s, latin]) => {
            const c = shift ? s : n;
            return <button type="button" key={code} className={"key" + (isMark(c) ? " mark" : "")} onClick={() => onKey(c)}>{isMark(c) ? "\u25CC" + c : c}<small>{latin}</small></button>;
          })}
          {i === 2 && <button type="button" className="key wide" onClick={() => onKey(" ")}>space</button>}
        </div>
      ))}
    </div>
  );
}
