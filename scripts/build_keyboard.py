#!/usr/bin/env python3
"""Build the on-screen keyboard from every character that appears in the data.

    python3 scripts/build_keyboard.py OUT.json SOURCE [SOURCE ...]

A SOURCE is a .txt (one text per line), a .jsonl manifest (fields text/truth), a .json word manifest
(list of {"word": ...}), or a .zip with labels/*.txt (Kaggle word-image sets). The standard Kashmiri
letters and vowel signs are always included, even if the data happens not to use them. Characters the
app rewrites when saving (Arabic ك ي ه, presentation forms, invisible format marks) are left out so the
keyboard only offers what is actually stored.
"""
import collections, json, sys, unicodedata, zipfile

ALWAYS = "اآأٲٳبپتٹثجچحخدڈذرڑزژسشصضطظعغفقکگلمنںوۄۆۅہھءیؠێۍےۓئؤۂ" + "َُِٕٖٟٔٗٚٛٓٗٔ" + "ّْٰٖٓ" + "‌"
DROP = set("كيهى؁؂﻿‍")
SHORT = {  # sound first, then the usual name, so the right key is easy to spot
    "\u064e": "a · zabar", "\u0650": "i · zer", "\u064f": "u · pesh", "\u0654": "ə · hamza", "\u0655": "ɨ · hamza below",
    "\u065a": "e/o · small v", "\u065b": "ʲ/ʷ · inverted v", "\u0657": "uː · ulṭā pesh", "\u0656": "iː · khaḍā zer",
    "\u065f": "ɨː · wavy hamza", "\u0651": "shad", "\u0652": "sukun", "\u0670": "khaḍā zabar", "\u0653": "madd",
    "\u064b": "do zabar", "\u064d": "do zer", "\u064c": "do pesh", "\u0658": "noon ghunna", "\u06ea": "low stop",
    "\u06ed": "small meem", "\u0659": "zwarakay", "\u0610": "sallallahu", "\u0611": "alayhis-salam",
    "\u0612": "rahmatullah", "\u0613": "radiallahu", "\u0614": "takhallus", "\u200c": "no join",
}
# Kashmiri vowel signs, always first and in this order on the signs tab
CORE = "\u064e\u0650\u064f\u0654\u0655\u065a\u065b\u0657\u0656\u065f\u0651\u0652"


def texts(path):
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        for n in z.namelist():
            if n.startswith("labels/") and n.endswith(".txt"):
                yield z.read(n).decode("utf-8", "ignore")
    elif path.endswith(".jsonl"):
        for l in open(path, encoding="utf-8"):
            r = json.loads(l)
            yield r.get("text") or ""
            yield r.get("truth") or ""
    elif path.endswith(".json"):
        for r in json.load(open(path, encoding="utf-8")):
            yield r.get("word", "") if isinstance(r, dict) else str(r)
    else:
        yield from open(path, encoding="utf-8")


def arabic(c):
    o = ord(c)
    return 0x0600 <= o <= 0x06FF or 0x0750 <= o <= 0x077F or 0x08A0 <= o <= 0x08FF or c in "‌﴾﴿"


def main():
    out, sources = sys.argv[1], sys.argv[2:]
    cnt = collections.Counter()
    for s in sources:
        for t in texts(s):
            cnt.update(unicodedata.normalize("NFC", t))
    for c in ALWAYS:
        cnt[c] += 0
    keys = []
    for c, n in cnt.items():
        if c in DROP or not arabic(c):
            continue
        cat = unicodedata.category(c)
        group = "signs" if cat.startswith("M") else "letters" if cat == "Lo" else "more"
        name = unicodedata.name(c, "").title().replace("Arabic ", "").replace("Letter ", "")
        keys.append({"c": c, "group": group, "n": n, "name": name, "code": f"U+{ord(c):04X}",
                     "label": SHORT.get(c, "")})
    # signs: most used first; letters: Unicode order (close to the Arabic alphabet); the rest by use
    keys.sort(key=lambda k: (k["group"] != "signs", k["group"] != "letters",
                             k["c"] not in CORE, (CORE.index(k["c"]) if k["c"] in CORE else -k["n"]) if k["group"] != "letters" else ord(k["c"])))
    json.dump({"sources": [s.split("/")[-1] for s in sources], "keys": keys}, open(out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    g = collections.Counter(k["group"] for k in keys)
    print(f"{len(keys)} keys: {dict(g)}")


if __name__ == "__main__":
    main()
