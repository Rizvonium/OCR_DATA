-- Kashmiri OCR Data: review app schema. Plain Postgres; safe to run more than once.
-- The app runs this file itself when it changes (it keeps the file's hash in app_meta); the lock
-- stops two servers starting at the same moment from changing the schema at the same time.
select pg_advisory_xact_lock(727274);
create table if not exists app_meta (k text primary key, v text);
-- Supabase: paste into SQL Editor and run, or `npm run db:setup` with DATABASE_URL set.
-- Locally (no DATABASE_URL) the app runs the same file in an embedded Postgres (PGlite).

-- People who review. Each person is a username + PIN; the app gives them a row here and a public
-- code (KS-XXXXXX, used in exports). The PIN is stored only as a salted scrypt hash.
create table if not exists contributors (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  handle        text not null,
  handle_key    text not null unique,            -- lower-cased handle, so names are unique
  token_hash    text not null unique,
  email         text,
  ip_hash       text,                             -- salted hash, only to limit sign-ups per network
  status        text not null default 'active' check (status in ('active', 'flagged', 'blocked')),
  admin_note    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- One picture to judge: a segmented word (or PAW / line) crop and the typed text proposed for it.
create table if not exists samples (
  id            text primary key,                 -- stable unique id from the manifest
  dataset       text not null,
  kind          text not null default 'word' check (kind in ('word', 'paw', 'line')),
  image_url     text not null,
  context_url   text,                             -- the line it was cut from, box drawn on it
  proposed_text text not null,
  source_ref    jsonb not null default '{}'::jsonb,
  is_gold       boolean not null default false,   -- check item with a known answer
  gold_verdict  text check (gold_verdict in ('correct', 'incorrect')),
  gold_text     text,                             -- the right text, for gold items
  target_reviews int not null default 3,
  review_count  int not null default 0,           -- kept up to date by a trigger
  created_at    timestamptz not null default now()
);
-- typeface of the printed text (Gulmarg Nastaleeq, Noto Nastaliq, Naskh...). Used only for statistics:
-- it is never sent to reviewers, who judge every picture the same way whatever the font.
alter table samples add column if not exists font text;
alter table contributors add column if not exists pin_hash text;
alter table contributors add column if not exists failed_pins int not null default 0;
alter table contributors add column if not exists locked_until timestamptz;

-- One row per signed-in browser (a person can be signed in on several devices).
create table if not exists sessions (
  token_hash     text primary key,
  contributor_id uuid not null references contributors(id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index if not exists sessions_by_contributor on sessions (contributor_id);
-- 'session' = signed in now; 'device' = this browser is remembered ("Continue as ..." without a PIN,
-- also after signing out, until the person chooses "Not me" on it)
alter table sessions add column if not exists kind text not null default 'session';

create index if not exists samples_queue on samples (is_gold, review_count);
create index if not exists samples_font on samples (font);
create index if not exists samples_dataset on samples (dataset);

-- One person's answer about one sample.
create table if not exists answers (
  id             bigint generated always as identity primary key,
  sample_id      text not null references samples(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  verdict        text not null check (verdict in ('correct', 'incorrect', 'skip')),
  correction     text,
  bad_crop       boolean not null default false,
  ms_spent       int,
  is_gold        boolean not null default false,
  gold_pass      boolean,
  created_at     timestamptz not null default now(),
  unique (sample_id, contributor_id)
);
create index if not exists answers_by_contributor on answers (contributor_id, created_at desc);
create index if not exists answers_by_sample on answers (sample_id);

create or replace function bump_review_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.verdict <> 'skip' then
    update samples set review_count = review_count + 1 where id = new.sample_id;
  elsif tg_op = 'DELETE' and old.verdict <> 'skip' then
    update samples set review_count = greatest(0, review_count - 1) where id = old.sample_id;
  end if;
  return null;
end $$;
drop trigger if exists answers_count on answers;
create trigger answers_count after insert or delete on answers
  for each row execute function bump_review_count();

-- Photos of Kashmiri pages that people upload, to be turned into review pictures later.
-- The photo lives in Vercel Blob storage when it is connected (url), otherwise in this table (data).
create table if not exists uploads (
  id             bigint generated always as identity primary key,
  contributor_id uuid not null references contributors(id) on delete cascade,
  sha256         text not null unique,            -- the same photo twice is stored once
  mime           text not null,
  bytes          int not null,
  width          int not null,
  height         int not null,
  source         text,                            -- book, newspaper, sign... as typed by the uploader
  page           text,
  note           text,
  quality        jsonb not null default '{}'::jsonb, -- sharpness / brightness measured in the browser
  url            text,                            -- Vercel Blob URL, when used
  data           bytea,                           -- the photo itself, when no Blob storage
  thumb          bytea not null,                  -- small JPEG for lists
  status         text not null default 'new' check (status in ('new', 'kept', 'rejected', 'used')),
  created_at     timestamptz not null default now()
);
create index if not exists uploads_by_contributor on uploads (contributor_id, created_at desc);
create index if not exists uploads_by_status on uploads (status, created_at desc);

-- Whole pages for the guided review: page -> lines -> chunks -> text.
-- lines: [{box, top, bottom, chunks: [{box, text}]}] from the segmenter, text = the word model's reading.
create table if not exists pages (
  id          text primary key,
  dataset     text not null,
  font        text,
  image_url   text not null,
  heat_url    text,
  width       int not null,
  height      int not null,
  lines       jsonb not null,
  source_ref  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Every decision a person makes on a page, one row each:
--   level 'lines'  (line = -1): are the lines right? edit = the corrected lines
--   level 'chunks' (line = i):  is line i cut into the right chunks? edit = the corrected chunks
--   level 'text'   (line, chunk): does the chunk's text match? correction = the typed text
--   level 'page'   : the person finished the page
create table if not exists page_answers (
  id             bigint generated always as identity primary key,
  page_id        text not null references pages(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  level          text not null check (level in ('lines', 'chunks', 'text', 'page')),
  line           int not null default -1,
  chunk          int not null default -1,
  verdict        text not null check (verdict in ('correct', 'incorrect', 'skip', 'done')),
  edit           jsonb,
  correction     text,
  ms_spent       int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (page_id, contributor_id, level, line, chunk)
);
create index if not exists page_answers_by_contributor on page_answers (contributor_id, created_at desc);

-- Groups of chunks that look the same (segmentation/group_chunks.py): one decision labels them all.
-- members: [{chunk, page, line, chunk_index, clean_url, text}]
create table if not exists chunk_groups (
  id            text primary key,
  members       jsonb not null,
  proposed_text text not null default '',
  size          int not null,
  fonts         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists chunk_groups_size on chunk_groups (size desc);
alter table chunk_groups add column if not exists family text;  -- groups cut from one big look-alike cluster

-- One person's decision on a group: which members are NOT the same (odd), and whether the text is right.
create table if not exists group_answers (
  id             bigint generated always as identity primary key,
  group_id       text not null references chunk_groups(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  odd            jsonb not null default '[]'::jsonb,  -- chunk ids marked "not the same"
  verdict        text not null check (verdict in ('correct', 'incorrect', 'skip')),
  correction     text,                              -- the right text for the (remaining) group
  ms_spent       int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (group_id, contributor_id)
);
create index if not exists group_answers_by_contributor on group_answers (contributor_id, created_at desc);
-- 'not_chunk': the group is only marks or specks, not proper pieces of words
-- the chunks this person was actually shown (a group is shown without chunks they labelled before);
-- null = the whole group (answers from before this was recorded)
alter table group_answers add column if not exists shown jsonb;
alter table group_answers drop constraint if exists group_answers_verdict_check;
alter table group_answers add constraint group_answers_verdict_check check (verdict in ('correct', 'incorrect', 'skip', 'not_chunk'));

-- Who has labelled which chunk (kept in step with group_answers by lib/groups.ts): lets the app pick
-- the next group without re-reading every answer.
create table if not exists chunk_labels (
  chunk          text not null,
  contributor_id uuid not null references contributors(id) on delete cascade,
  group_id       text not null references chunk_groups(id) on delete cascade,
  primary key (chunk, contributor_id)
);
create index if not exists chunk_labels_by_contributor on chunk_labels (contributor_id);
create index if not exists group_answers_by_group on group_answers (group_id);
-- filled from the answers given before this table existed (does nothing once filled)
insert into chunk_labels (chunk, contributor_id, group_id)
select distinct on (m->>'chunk', a.contributor_id) m->>'chunk', a.contributor_id, a.group_id
from group_answers a join chunk_groups g on g.id = a.group_id, jsonb_array_elements(g.members) m
where a.verdict <> 'skip' and not (a.odd ? (m->>'chunk')) and (a.shown is null or a.shown ? (m->>'chunk'))
on conflict do nothing;

-- Match game: boards of look-alike chunks mixed across fonts (segmentation/make_boards.py).
create table if not exists match_boards (
  id         text primary key,
  tiles      jsonb not null,   -- [{chunk, clean_url, font, text}]
  texts      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table match_boards add column if not exists skeleton text; -- the letter family a Match board is about
-- sets: [[chunk, chunk, ...], ...] each popped together = "one and the same"; rest: left as all different
create table if not exists match_answers (
  id             bigint generated always as identity primary key,
  board_id       text not null references match_boards(id) on delete cascade,
  contributor_id uuid not null references contributors(id) on delete cascade,
  sets           jsonb not null,
  rest           jsonb not null default '[]'::jsonb,
  ms_spent       int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (board_id, contributor_id)
);
create index if not exists match_answers_by_contributor on match_answers (contributor_id, created_at desc);
-- tiles flagged "not a chunk" (only a mark or a speck, not a proper piece of a word)
alter table match_answers add column if not exists junk jsonb not null default '[]'::jsonb;
-- false while the board is being played (saved after every pop, flag and undo), true once submitted
alter table match_answers add column if not exists done boolean not null default true;

-- Supabase exposes the public schema through its REST API to anyone holding the publishable key.
-- Row level security with no policies closes that door; the app's server connects as the
-- database owner and is not affected.
alter table contributors enable row level security;
alter table samples enable row level security;
alter table answers enable row level security;
alter table sessions enable row level security;
alter table app_meta enable row level security;
alter table uploads enable row level security;
alter table pages enable row level security;
alter table page_answers enable row level security;
alter table chunk_groups enable row level security;
alter table group_answers enable row level security;
alter table chunk_labels enable row level security;
alter table match_boards enable row level security;
alter table match_answers enable row level security;

-- ---------------------------------------------------------------- quality views
-- Per-person numbers used for trust, the leaderboard and spam flags.
create or replace view contributor_stats as
with agreement as (
  -- leave-one-out: does this answer agree with what the OTHER reviewers said?
  select a.contributor_id,
         count(*) as n,
         count(*) filter (where (a.verdict = 'correct') = (o.n_ok > o.n_bad)) as agree
  from answers a
  join lateral (
    select count(*) filter (where b.verdict = 'correct') as n_ok,
           count(*) filter (where b.verdict = 'incorrect') as n_bad
    from answers b
    where b.sample_id = a.sample_id and b.contributor_id <> a.contributor_id and b.verdict <> 'skip'
  ) o on o.n_ok + o.n_bad >= 2 and o.n_ok <> o.n_bad
  where a.verdict <> 'skip' and not a.is_gold
  group by a.contributor_id
), confirmed as (
  -- corrections someone else independently typed the same way
  select a.contributor_id, count(*) as n
  from answers a
  where a.correction is not null and exists (
    select 1 from answers b
    where b.sample_id = a.sample_id and b.contributor_id <> a.contributor_id and b.correction = a.correction)
  group by a.contributor_id
)
select c.id, c.code, c.handle, c.status, c.created_at, c.last_seen_at,
       count(a.id) filter (where a.verdict <> 'skip')                               as reviews,
       count(a.id) filter (where a.verdict = 'skip')                                as skips,
       count(a.id) filter (where a.correction is not null)                          as corrections,
       coalesce(max(cf.n), 0)                                                       as confirmed_corrections,
       count(a.id) filter (where a.is_gold)                                         as gold_total,
       count(a.id) filter (where a.gold_pass)                                       as gold_pass,
       coalesce(max(ag.n), 0)                                                       as agreement_n,
       coalesce(max(ag.agree), 0)                                                   as agreement_hits,
       percentile_cont(0.5) within group (order by a.ms_spent)
         filter (where a.verdict <> 'skip')                                         as median_ms,
       avg(case when a.verdict = 'correct' then 1.0 else 0.0 end)
         filter (where a.verdict <> 'skip' and not a.is_gold)                       as share_correct,
       count(a.id) filter (where a.created_at > now() - interval '1 hour')          as last_hour,
       count(a.id) filter (where a.created_at > now() - interval '1 day')           as last_day,
       max(a.created_at)                                                            as last_answer_at,
       -- trust: smoothed share of check items answered right (starts at 2/3, never 0 or 1)
       (count(a.id) filter (where a.gold_pass) + 2.0) / (count(a.id) filter (where a.is_gold) + 3.0) as trust
from contributors c
left join answers a on a.contributor_id = c.id
left join agreement ag on ag.contributor_id = c.id
left join confirmed cf on cf.contributor_id = c.id
group by c.id;

-- Automatic spam / low-quality signals. Thresholds are deliberately mild: they flag for a human
-- look (admin page) and down-weight in consensus; only an admin blocks.
create or replace view contributor_flags as
select s.*,
       array_remove(array[
         case when s.reviews >= 20 and s.median_ms < 1200 then 'too_fast' end,
         case when s.gold_total >= 5 and s.gold_pass::numeric / s.gold_total < 0.6 then 'fails_checks' end,
         case when s.reviews >= 30 and (s.share_correct > 0.97 or s.share_correct < 0.03) then 'same_button' end,
         case when s.agreement_n >= 20 and s.agreement_hits::numeric / s.agreement_n < 0.5 then 'disagrees' end,
         case when s.last_hour > 600 then 'burst' end
       ], null) as flags
from contributor_stats s;

-- Leaderboard points: kept simple for now, 1 point per picture answered (skips do not count).
create or replace view leaderboard as
select f.code, f.handle, f.reviews, f.corrections, f.confirmed_corrections, f.gold_total, f.gold_pass,
       case when f.gold_total > 0 then round(100.0 * f.gold_pass / f.gold_total) end                as check_accuracy,
       case when f.agreement_n > 0 then round(100.0 * f.agreement_hits / f.agreement_n) end         as agreement,
       (f.reviews + (select count(*) from page_answers pa
                     where pa.contributor_id = f.id and pa.level <> 'page' and pa.verdict <> 'skip')
                  + (select count(*) from group_answers ga where ga.contributor_id = f.id and ga.verdict <> 'skip')
                  + (select coalesce(sum(jsonb_array_length(ma.sets) + jsonb_array_length(ma.junk)), 0) from match_answers ma where ma.contributor_id = f.id))::int as points,
       f.last_answer_at, f.created_at
from contributor_flags f
where f.status <> 'blocked';  -- everyone who registered, except people the admin blocked

-- What the crowd decided about each sample: one vote per person (people the admin blocked: none).
create or replace view sample_consensus as
with w as (
  select id, case when status = 'blocked' then 0 else 1 end as weight from contributors
), v as (
  select s.id,
         count(a.id) filter (where a.verdict = 'correct')                       as n_correct,
         count(a.id) filter (where a.verdict = 'incorrect')                     as n_incorrect,
         coalesce(sum(w.weight) filter (where a.verdict = 'correct'), 0)        as w_correct,
         coalesce(sum(w.weight) filter (where a.verdict = 'incorrect'), 0)      as w_incorrect,
         count(a.id) filter (where a.bad_crop)                                  as n_bad_crop
  from samples s
  left join answers a on a.sample_id = s.id
  left join w on w.id = a.contributor_id
  group by s.id
)
select s.id, s.dataset, s.font, s.kind, s.image_url, s.context_url, s.proposed_text, s.source_ref, s.is_gold,
       v.n_correct, v.n_incorrect, v.n_bad_crop,
       round(v.w_correct::numeric, 3) as w_correct, round(v.w_incorrect::numeric, 3) as w_incorrect,
       tc.correction as top_correction, coalesce(tc.n, 0) as top_correction_votes,
       case
         when v.n_bad_crop >= 2 and v.n_bad_crop * 2 >= v.n_correct + v.n_incorrect then 'bad_crop'
         when v.n_correct >= 2 and v.w_correct >= 2 * v.w_incorrect                then 'verified'
         when coalesce(tc.n, 0) >= 2 and v.w_incorrect > v.w_correct               then 'corrected'
         when v.n_incorrect >= 2 and v.w_incorrect >= 2 * v.w_correct              then 'needs_text'
         when v.n_correct + v.n_incorrect >= s.target_reviews                      then 'disputed'
         else 'open'
       end as status,
       case
         when v.n_correct >= 2 and v.w_correct >= 2 * v.w_incorrect and not (v.n_bad_crop >= 2 and v.n_bad_crop * 2 >= v.n_correct + v.n_incorrect)
           then s.proposed_text
         when coalesce(tc.n, 0) >= 2 and v.w_incorrect > v.w_correct then tc.correction
       end as final_text
from samples s
join v on v.id = s.id
left join lateral (
  select a.correction, count(*) as n from answers a
  where a.sample_id = s.id and a.correction is not null
  group by a.correction order by count(*) desc, a.correction limit 1
) tc on true;
