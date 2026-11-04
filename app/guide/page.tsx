export const metadata = { title: "How to judge · Kashmiri OCR Data" };

export default function Guide() {
  return (
    <div className="prose">
      <h1>How to review</h1>
      <p className="lede">You go through a page in three steps. A computer program found the lines, cut each line into chunks (the bigger gaps between words) and read each chunk. You check each step and fix what is wrong.</p>
      <ol>
        <li><b>Lines.</b> Each coloured band should hold exactly one line, with all its dots and vowel signs. If not: tap inside a band to split it, tap between two bands to join them.</li>
        <li><b>Chunks of each line.</b> Each box should hold one chunk, nothing cut off, nothing outside. If not: ✂ split a box where it should be cut, ⊕ join two neighbouring boxes, ✕ remove a box with only a speck.</li>
        <li><b>Text of each chunk.</b> Does the typed text match the chunk exactly? If not, type the right text; if you cannot, say so.</li>
      </ol>
      <p>‹ Back takes you to any earlier step to change your answer. Each decision is one point. The rules below say what counts as a match.</p>
      <h2 style={{ marginTop: 26 }}>Does the text match?</h2>

      <h2>Correct</h2>
      <p>Press <b>Correct</b> only when the typed text says <i>exactly</i> what is printed: the same letters, in the same order, with the same vowel signs.</p>
      <div className="examples">
        <div className="card"><h3>Same word, same signs</h3><p className="ks" style={{ fontSize: 30, margin: 0 }}>کِتاب</p><p className="small">Picture and typed text both have the zer under ک.</p></div>
        <div className="card"><h3>Signs the book did not print</h3><p className="small">If the book prints a word without vowel signs, the typed text should not add them either. Judge what is printed.</p></div>
      </div>

      <h2>Incorrect</h2>
      <ul>
        <li>A letter is different: ز for ژ, ر for ڑ, ی for ے, ک for گ.</li>
        <li>A Kashmiri vowel sign is missing, extra or different: ٲ, ۄ, ٕ (ɨ), ٔ (ə), ٚ, ٗ, ٖ.</li>
        <li>The typed text belongs to a neighbouring word.</li>
        <li>A sign in the typed text that you <b>cannot see</b> in the picture — too faint, or blended into a letter — counts as missing. Judge only what is visible.</li>
      </ul>
      <p>If you can, type the right text (it starts filled in with the typed text, so usually you only fix one letter or sign). If you are unsure how to type it, just press <b>Submit without typing</b> — knowing that a pair is wrong is already useful.</p>

      <h2>The box is wrong</h2>
      <p>Tick <b>“The box itself is wrong”</b> when the picture cuts off part of a letter or dot, holds two words, or holds only part of a word. Open <b>“Show the line this was cut from”</b> to see the picture’s box on its line. These answers tell us where the cutting program makes mistakes.</p>

      <h2>Skip</h2>
      <p>If the picture is too blurred, or it is not Kashmiri, press <b>Skip</b>. Skipping never costs points.</p>

      <h2>Points</h2>
      <p>You get one point for every picture you answer (skipping does not count). Please take your time: careful answers are what make this dataset valuable, and every picture is seen by several people.</p>
    </div>
  );
}
