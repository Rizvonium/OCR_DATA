export const metadata = { title: "How to judge · Kashmiri OCR Data" };

export default function Guide() {
  return (
    <div className="prose">
      <h1>How to judge a picture</h1>
      <p className="lede">Each picture was cut out of a printed page by a computer program, then paired with typed text. Your job is to say whether the pair is right.</p>

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

      <h2>Check items</h2>
      <p>Now and then you will see a picture whose answer we already know. They look like every other picture. Getting them right raises your trust, which is how much your vote counts and how your points are scaled. If you get one wrong you will see the right answer, so you learn as you go.</p>

      <h2>Fair play</h2>
      <p>Every picture is seen by at least three people, and their answers are compared. Very fast answering, pressing the same button every time, or often disagreeing with everyone else is flagged automatically, and flagged answers count much less. Please take your time: careful answers are what make this dataset valuable.</p>
    </div>
  );
}
