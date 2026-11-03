# Kashmiri OCR Data — crowd review app

People look at one picture of printed Kashmiri at a time — a word (or line) cut out of a page by the
segmenter — with the typed text proposed for it, and answer **Correct** or **Incorrect**. If incorrect,
they can type the right text or just submit. Every picture is seen by several people; their answers are
combined into a clean dataset for training Kashmiri OCR.

![Review screen](docs/review.png)

| | |
|---|---|
| **Review** | picture, typed text, two buttons. Keys: `C` correct, `X` incorrect, `S` skip. If incorrect: the text box starts with the typed text so you fix one letter; on-screen keys for every Kashmiri vowel sign; a tick box for "the box itself is wrong". |
| **Leaderboard** | points, reviews, this week / all time, and the progress of the whole dataset. |
| **Profile** | your contributor code, stats, and a recovery key to continue on another device. |
| **Admin** (`/admin`) | **who answered what** (every picture, every reviewer's answer, right or wrong), **data per font**, spam flags, block / unblock, JSONL export. |

Reviewers are never told the font, the dataset or which pictures are check items: none of it is sent
to the browser, and picture file names are hashes.

## Run it on your computer

```bash
npm install
```
```bash
npm run import -- data/demo --gold-fraction 0.15
```
```bash
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL` the app uses a built-in local Postgres (PGlite, in
`.data/`), so nothing else is needed (the import step is optional: an empty database loads `data/demo` by itself).

### Starter data (`data/demo`, 2,651 pictures)

| Font | Pictures | From |
|---|---|---|
| Gulmarg Nastaleeq | 113 | 5 rendered pages |
| Afan Koshur Naksh | 312 | 5 rendered pages |
| Narqalam | 295 | 5 rendered pages |
| Noto Nastaliq Urdu | 227 | 5 + 2 rendered pages |
| Noto Naskh Arabic | 140 | 2 rendered pages |
| Gulzar | 64 | 2 rendered pages |
| Kaggle word images (font not labelled) | 1,500 | random sample of `nawabhussaen/kashmiri-ocr` |

Rendered pages use real words from Kaggle `faizaniqbal52/koshur-master-50k-manifest` in the fonts of
`faizaniqbal52/kashmiri-fonts`, segmented by `segmentation/`. Their typed text is the Kashmiri word
model's reading, so wrong pairs are real model mistakes: about half of the Gulmarg Nastaleeq words,
8–19% for the Naskh-style fonts. The Kaggle sample shows its own labels. About 15% of the rendered
words (known answers) are check items.

**Not used yet:** `jazz786/handwritten-kashmiri-text-dataset` (51 handwritten pages) has no typed text,
so there is nothing to compare against until the pages are transcribed.

## Put it online (Vercel + Supabase)

**Step 0 — it launches with no setup.** Import the GitHub repo in Vercel (framework: Next.js, all
defaults) and deploy. With no database connected it runs in *preview mode*: a temporary built-in
database with the demo pictures and a banner saying answers are not kept. Everything works, so you
can try it and share the link — then connect Supabase to keep the answers.

**About "Supabase only has one user":** that one user is *you*, the owner of the Supabase project.
This app does not use Supabase logins at all. Supabase is only the database; every reviewer gets their
own row in the `contributors` table, created by the app, so there is no limit on the number of reviewers.

You need two values from Supabase, not the `sb_publishable_…` key (that key is meant for browsers and
this app does not use it — the server talks to Postgres directly):

1. **Database connection string** — Supabase → your project → **Connect** → *Transaction pooler*
   (port 6543). It looks like `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
2. That's all: on its first start the app creates its tables in Supabase and, if there are no
   pictures yet, loads the demo set. (To do it by hand instead: paste `db/schema.sql` into Supabase →
   SQL Editor → Run, or `DATABASE_URL=... npm run db:setup`. `SEED_DEMO=0` skips the demo set.)

Then in Vercel → Project → Settings → Environment Variables add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the connection string from step 1 |
| `ADMIN_KEY` | any long random text; you type it on `/admin` |

Then **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the new variables are used. Never paste
these into the code or a chat; keep them only in Vercel (and in a local `.env` that git ignores).

Load the pictures into the online database from your computer:

```bash
DATABASE_URL='postgresql://...' npm run import -- data/demo --gold-fraction 0.15
```

Images under `public/samples/` are deployed with the site. For large datasets (tens of thousands of
images) upload them to Supabase Storage instead: also set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
(Supabase → Project Settings → API keys → *secret* key, `sb_secret_…`) and add `--storage supabase`.

## Who is who: unique contributor ids

- Joining takes a display name and a tick for consent (email optional). No password.
- Each person gets a **contributor id** (UUID, internal), a public **code** like `KS-7F3K2Q` (shown on
  the leaderboard and written into the export next to every sample they reviewed), and a secret
  **recovery key** kept in a secure cookie. The database stores only a hash of the key.
- To continue on another phone or computer, copy the recovery key from the Profile page.
- Every sample has its own stable id (`<dataset>-<page>-L<line>-W<word>`), every answer its own row.

## Spam and quality checks

| Check | How |
|---|---|
| Check items | ~1 in 8 pictures has a known answer (known-wrong ones favoured, to catch "always Correct"). Trust = share answered right; it scales points and vote weight. Wrong answers show the right one, so people learn. |
| Several opinions | each picture goes to 3 people; a decision needs agreement (votes weighted by trust). |
| Automatic flags | median answer under 1.2 s, under 60% on check items, the same button 97% of the time, disagreeing with others over half the time, or 600+ answers an hour. Flagged people count 1/5 and leave the leaderboard; it clears when their answers improve. |
| Limits | 30 answers a minute; answer speed is measured by the server; 30 new names per network per day (raise `SIGNUPS_PER_NETWORK_PER_DAY` for a big workshop on one Wi-Fi). |
| You decide | `/admin` lists everyone with their numbers; set a person to *blocked* and their answers are ignored everywhere. |

### Seeing who answered what

Every answer is saved with the person who gave it. **Admin → Who answered what** lists each picture
with its typed text, the right answer, and every reviewer's name, code, answer, typed fix and time —
green when right, red when wrong. "Right" means it matches the known answer on check items, or what
the crowd decided on other pictures. Three views: *known answers* (check items), *decided by the
crowd*, *all*. The export **Everything, with every answer** has the same per-person answers for each
picture, and the Contributors table gives each person's totals (check items right, agreement, speed).

Each picture ends up **verified** (typed text right), **corrected** (2+ people typed the same fix),
**needs text** (wrong, no agreed fix yet), **bad box** (segmentation wrong), **disputed** or **open**.
Export from `/admin` or `/api/export?key=ADMIN_KEY&status=verified,corrected` (JSONL: id, font,
image, final text, votes, every reviewer's answer, source page and box).

## Adding your data

**Pages + typed text** (needs segmentation): put `page.png` next to `page.txt` (one typed line per
printed line, words separated by spaces). Then:

```bash
pip install -r segmentation/requirements.txt
```
```bash
python3 segmentation/make_samples.py PAGES_DIR out/vol1 --dataset vol1 --font "Gulmarg Nastaleeq"
```
```bash
npm run import -- out/vol1
```

Use `--col 0.67 0.96` for the Kashmiri column of dictionary pages, and `--font-map fonts.tsv`
(`page<TAB>font`) when pages are in different fonts. Lines whose word count differs between the picture
and the text become one *line* sample instead of guessed word pairs.

**Already cut into word images** (e.g. Kaggle `nawabhussaen/kashmiri-ocr`, CSV, JSONL or `labels.txt`):

```bash
python3 segmentation/pairs_to_manifest.py dataset.zip out/kaggle --dataset kaggle --font "Noto Nastaliq"
```

The font is stored for statistics only (**Admin → Data per font**).

## Segmentation

`segmentation/kashmiri_segmenter.py` is the scale-invariant, Kashmiri-aware segmenter (stroke width SW
and line height LH drive every threshold). Two fixes were needed on test pages, marked `FIX (v1.1)`:
SW is measured on the stroke ridge (the all-pixel median gave about half the real width), and line
centres closer than 0.6 × the autocorrelation line pitch are merged (rows of vowel signs were being
taken for lines; 6 test pages went from about 2× too many lines to exactly right). To use a different
segmenter later, keep `segment_page()`'s output shape.

## Files

```
app/              pages (review, leaderboard, guide, profile, admin) and API routes
components/       review card, Kashmiri keys, join form
lib/              database, identity, review logic, Kashmiri text clean-up
db/schema.sql     tables, consensus, trust and spam-flag views (Supabase and local)
scripts/          import-samples.mjs, db-setup.mjs
segmentation/     segmenter, make_samples.py, pairs_to_manifest.py, render_demo_pages.py
tests/simulate.mjs  five simulated people incl. a spammer against a running app
data/demo/        demo manifest (images in public/samples/)
```
