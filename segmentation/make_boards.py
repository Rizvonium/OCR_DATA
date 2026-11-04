#!/usr/bin/env python3
"""Make boards for the Match game: chunks of look-alike letters, mixed across fonts.

    python3 segmentation/make_boards.py OUT.jsonl PAGES_JSONL [...] [--size 16] [--seed 1]

A board mixes chunks whose word-model readings have the same *skeleton* (the base shapes once dots,
hamzas and vowel signs are removed: ر ز ڑ ژ share one, ب پ ت ٹ ث another) but are different texts,
taken from different fonts. People pop away sets that are the same letters, however each font draws
them. The sets say which shapes, across all fonts, are one and the same.
"""
import argparse, collections, json, random, unicodedata

FOLD = {}
for group in ["اآأإٲٳ", "بپتٹثٮ", "جچحخ", "دڈذ", "رڑزژ", "سش", "صض", "طظ", "عغ", "فق", "کگ", "ںن", "وۄۆۅؤ", "ہھۂۃةه", "یؠێۍئيےۓ"]:
    for c in group:
        FOLD.setdefault(c, group[0])


def skeleton(text):
    base = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.category(c).startswith("M"))
    return "".join(FOLD.get(c, c) for c in base)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out"); ap.add_argument("pages", nargs="+")
    ap.add_argument("--size", type=int, default=16); ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rnd = random.Random(a.seed)
    by_text = collections.defaultdict(list)
    for f in a.pages:
        for line in open(f, encoding="utf-8"):
            p = json.loads(line)
            for li, l in enumerate(p["lines"]):
                for ci, c in enumerate(l["chunks"]):
                    t = (c.get("text") or "").strip()
                    if t and c.get("clean_url") and len(t) <= 4:
                        by_text[t].append({"chunk": f"{p['id']}:L{li + 1}:C{ci + 1}", "clean_url": c["clean_url"], "font": p.get("font"), "text": t})
    by_skel = collections.defaultdict(list)
    for t, items in by_text.items():
        if len({i["font"] for i in items}) >= 2 or len(items) >= 3:
            by_skel[skeleton(t)].append(t)
    boards = []
    for sk, texts in sorted(by_skel.items(), key=lambda kv: -sum(len(by_text[t]) for t in kv[1])):
        if len(texts) < 2:
            continue  # nothing to tell apart
        pool = {t: rnd.sample(by_text[t], len(by_text[t])) for t in texts}
        while sum(len(v) > 0 for v in pool.values()) >= 2:
            # 2-4 texts per board, a few chunks of each, preferring different fonts
            pick = rnd.sample([t for t in pool if pool[t]], min(4, sum(len(v) > 0 for v in pool.values())))
            per = max(2, a.size // len(pick))
            tiles = []
            for t in pick:
                fonts_seen, take = set(), []
                for it in list(pool[t]):
                    if len(take) >= per:
                        break
                    if it["font"] not in fonts_seen or len(fonts_seen) >= 3:
                        take.append(it); fonts_seen.add(it["font"]); pool[t].remove(it)
                tiles += take
            if len({t["text"] for t in tiles}) < 2 or len(tiles) < 6:
                break
            rnd.shuffle(tiles)
            boards.append({"id": f"m{len(boards) + 1:05d}", "skeleton": sk, "texts": sorted({t["text"] for t in tiles}), "tiles": tiles})
            if len(boards) >= 400:
                break
        if len(boards) >= 400:
            break
    with open(a.out, "w", encoding="utf-8") as fh:
        for b in boards:
            fh.write(json.dumps(b, ensure_ascii=False) + "\n")
    print(json.dumps({"boards": len(boards), "tiles": sum(len(b["tiles"]) for b in boards),
                      "examples": [b["texts"] for b in boards[:6]]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
