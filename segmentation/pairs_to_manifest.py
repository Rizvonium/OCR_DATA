#!/usr/bin/env python3
"""Make a review manifest from a dataset that is ALREADY cut into word/line images.

    python3 segmentation/pairs_to_manifest.py SOURCE OUT_DIR --dataset NAME [--kind word] [--limit N]

SOURCE is a folder or .zip in any layout the kashmiri_ocr importer understands:
  * labels/<id>.txt next to word_images/<id>.png   (Kaggle nawabhussaen/kashmiri-ocr)
  * a CSV with an image column and a text column
  * a JSONL with image and text keys
  * a TXT with "image<TAB>text" per line
Images are copied to OUT_DIR/img/ as webp and OUT_DIR/manifest.jsonl is written.
"""
import argparse
import csv
import io
import json
import os
import random
import re
import sys
import zipfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_samples import norm_ks, slug  # noqa: E402

IMG_EXT = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp")
IMG_COLS = ("file_name", "filename", "file", "image", "image_path", "img", "path", "image_file")
TXT_COLS = ("text", "label", "transcript", "transcription", "word", "ground_truth", "gt")
KS = re.compile(r"[؀-ۿ]")


def open_source(path):
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        names = [n for n in z.namelist() if not n.endswith("/")]
        return names, z.read
    names = [os.path.relpath(os.path.join(d, f), path) for d, _, fs in os.walk(path) for f in fs]
    return names, lambda n: open(os.path.join(path, n), "rb").read()


def pairs(names, read):
    by_base = {}
    for n in names:
        if n.lower().endswith(IMG_EXT):
            b = os.path.basename(n)
            by_base.setdefault(b, n)
            by_base.setdefault(os.path.splitext(b)[0], n)
    labels = [n for n in names if n.endswith(".txt") and "/labels/" in "/" + n]
    if labels:  # Kaggle layout
        for n in labels:
            img = by_base.get(os.path.splitext(os.path.basename(n))[0])
            if img:
                yield img, read(n).decode("utf-8", "ignore")
        return
    for n in names:
        low = n.lower()
        if low.endswith(".csv"):
            rows = list(csv.DictReader(io.StringIO(read(n).decode("utf-8-sig"))))
            if not rows:
                continue
            keys = {k.lower().strip(): k for k in rows[0]}
            ic = next((keys[k] for k in IMG_COLS if k in keys), None)
            tc = next((keys[k] for k in TXT_COLS if k in keys), None)
            if ic and tc:
                for r in rows:
                    img = by_base.get(os.path.basename(r[ic].strip())) or by_base.get(os.path.splitext(os.path.basename(r[ic].strip()))[0])
                    if img:
                        yield img, r[tc]
        elif low.endswith(".jsonl"):
            for line in read(n).decode("utf-8").splitlines():
                if not line.strip():
                    continue
                r = json.loads(line)
                ref = next((r[k] for k in IMG_COLS if k in r), None)
                txt = next((r[k] for k in TXT_COLS if k in r), None)
                img = ref and (by_base.get(os.path.basename(ref)) or by_base.get(os.path.splitext(os.path.basename(ref))[0]))
                if img and txt:
                    yield img, txt
        elif low.endswith(".txt") and "label" in os.path.basename(low):
            for line in read(n).decode("utf-8").splitlines():
                parts = re.split(r"\t| ", line, maxsplit=1)
                if len(parts) == 2 and parts[0] in by_base or (len(parts) == 2 and os.path.basename(parts[0]) in by_base):
                    yield by_base.get(parts[0]) or by_base[os.path.basename(parts[0])], parts[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("out")
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--kind", default="word", choices=("word", "paw", "line"))
    ap.add_argument("--font", help="typeface of these images, if known (statistics only; never shown to reviewers)")
    ap.add_argument("--limit", type=int, default=0, help="random subset of this size (0 = all)")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    names, read = open_source(a.source)
    items = [(i, t) for i, t in pairs(names, read)]
    if a.limit and len(items) > a.limit:
        random.Random(a.seed).shuffle(items)
        items = items[:a.limit]
    os.makedirs(os.path.join(a.out, "img"), exist_ok=True)
    n = skipped = 0
    with open(os.path.join(a.out, "manifest.jsonl"), "w", encoding="utf-8") as mf:
        for img, text in items:
            text = norm_ks(text)
            if not KS.search(text):
                skipped += 1
                continue
            sid = f"{slug(a.dataset)}-{slug(os.path.splitext(os.path.basename(img))[0])}"
            Image.open(io.BytesIO(read(img))).convert("L").save(os.path.join(a.out, "img", sid + ".webp"), quality=90)
            mf.write(json.dumps({"id": sid, "dataset": a.dataset, "kind": a.kind, "font": a.font, "image": f"img/{sid}.webp",
                                 "context": None, "text": text, "source_ref": {"file": img}}, ensure_ascii=False) + "\n")
            n += 1
    print(json.dumps({"samples": n, "skipped_no_kashmiri": skipped}))


if __name__ == "__main__":
    main()
