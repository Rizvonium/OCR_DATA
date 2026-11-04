#!/usr/bin/env python3
"""Turn page images + their typed Kashmiri text into review samples for the app.

    python3 segmentation/make_samples.py PAGES_DIR OUT_DIR --dataset NAME [--col 0.02 0.98]
                                          [--proposals typed|model] [--model path.onnx]

PAGES_DIR holds page images (png/jpg/webp/tif) and, next to each, a .txt file with the same
name: one line of typed Kashmiri per text line on the page, words separated by spaces, in
reading order (right to left = first word first).

For every page the segmenter (kashmiri_segmenter.py) finds lines and words. When a line has the
same number of words in the image and in the text, each word box is paired with its typed word
and becomes one `word` sample. Otherwise the whole line becomes one `line` sample, so nothing is
paired by guesswork.

OUT_DIR gets
  img/<id>.webp   the crop people judge
  ctx/<id>.webp   the line it came from, with the crop's box drawn on it
  manifest.jsonl  one sample per line: id, dataset, kind, image, context, text, source_ref

Every sample id is stable and unique: <dataset>-<page>-L<line>-W<word> (or -LINE).
Fonts: give --font NAME when the whole folder is one typeface, or --font-map fonts.tsv with
"<page file stem><TAB><font>" lines when pages differ. The font is stored with every sample for
statistics only (how much data per typeface); reviewers are never shown it.
--proposals model shows the reviewers the Kashmiri word model's reading instead of the typed
text (the typed text is kept as `truth` and can be used for gold check items).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kashmiri_segmenter import segment_page, word_box  # noqa: E402

IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp")
ACCENT = (192, 80, 42)


def norm_ks(s: str) -> str:
    s = unicodedata.normalize("NFC", s.replace("ـ", "").replace("‍", ""))
    return s.translate(str.maketrans({"ك": "ک", "ي": "ی", "ه": "ہ"})).strip()


def slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", s).strip("-")[:60] or "page"


class WordModel:
    """The Kashmiri word OCR model from the kashmiri_ocr repo (CNN+BiLSTM+CTC, ONNX)."""

    def __init__(self, path):
        import onnxruntime as ort
        self.sess = ort.InferenceSession(path)
        self.units = json.load(open(os.path.splitext(path.replace("_int8", ""))[0] + ".json", encoding="utf-8"))["units"]

    def read(self, gray: np.ndarray) -> str:
        ys, xs = np.nonzero(gray < 128)
        if not len(ys):
            return ""
        p = max(2, int(0.12 * (ys.max() - ys.min() + 1)))
        g = gray[max(0, ys.min() - p):ys.max() + p + 1, max(0, xs.min() - p):xs.max() + p + 1]
        im = Image.fromarray(g)
        w = max(8, min(512, round(im.width * 48 / im.height)))
        a = 1 - np.asarray(im.resize((w, 48), Image.BILINEAR), dtype=np.float32) / 255
        ids = self.sess.run(None, {"image": a[:, ::-1].copy()[None, None]})[0][0].argmax(-1)
        out, prev = [], 0
        for i in ids:
            if i != prev and i:
                out.append(self.units[i])
            prev = i
        return norm_ks("".join(out))


def crop(gray, box, margin):
    H, W = gray.shape
    x0, y0, x1, y1 = box
    return gray[max(0, y0 - margin):min(H, y1 + margin + 1), max(0, x0 - margin):min(W, x1 + margin + 1)]


def context(rgb: Image.Image, band, box, x_left, x_right, margin, reach):
    """The line strip with the sample's box drawn on it, so reviewers see what was cut.
    Only `reach` pixels either side of the box are kept: enough to see the neighbouring words."""
    x_left, x_right = max(x_left, box[0] - reach), min(x_right, box[2] + reach)
    y0 = max(0, min(band[0], box[1]) - margin)
    y1 = min(rgb.height, max(band[1], box[3]) + margin)
    strip = rgb.crop((max(0, x_left - margin), y0, min(rgb.width, x_right + margin), y1)).convert("RGBA")
    ox, oy = max(0, x_left - margin), y0
    over = Image.new("RGBA", strip.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    b = (box[0] - ox, box[1] - oy, box[2] - ox, box[3] - oy)
    d.rectangle(b, fill=ACCENT + (38,), outline=ACCENT + (255,), width=max(2, strip.height // 60))
    return Image.alpha_composite(strip, over).convert("RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pages")
    ap.add_argument("out")
    ap.add_argument("--dataset", required=True, help="short dataset name, e.g. lugaat-vol1")
    ap.add_argument("--col", nargs=2, type=float, default=(0.02, 0.98), metavar=("X0", "X1"),
                    help="Kashmiri column as fractions of page width (dictionary pages: 0.67 0.96)")
    ap.add_argument("--proposals", choices=("typed", "model"), default="typed")
    ap.add_argument("--model", default=os.path.join(os.path.dirname(__file__), "..", "..", "kashmiri_ocr",
                                                     "public", "models", "kashmiri_word_ocr_int8.onnx"))
    ap.add_argument("--font", help="typeface of every page here, e.g. 'Gulmarg Nastaleeq'")
    ap.add_argument("--font-map", help="TSV: page file stem <TAB> font (overrides --font per page)")
    ap.add_argument("--max-width", type=int, default=900, help="downscale crops wider than this")
    a = ap.parse_args()

    font_map = {}
    if a.font_map:
        for ln in open(a.font_map, encoding="utf-8"):
            if "\t" in ln:
                k, v = ln.rstrip("\n").split("\t", 1)
                font_map[os.path.splitext(k)[0]] = v.strip()
    model = WordModel(a.model) if a.proposals == "model" else None
    os.makedirs(os.path.join(a.out, "img"), exist_ok=True)
    os.makedirs(os.path.join(a.out, "ctx"), exist_ok=True)
    pages = sorted(f for f in os.listdir(a.pages) if f.lower().endswith(IMG_EXT))
    stats = {"pages": 0, "lines": 0, "word_samples": 0, "line_samples": 0, "line_count_mismatch": 0, "no_text": 0}
    with open(os.path.join(a.out, "manifest.jsonl"), "w", encoding="utf-8") as mf:
        for fname in pages:
            stem = os.path.splitext(fname)[0]
            txt = os.path.join(a.pages, stem + ".txt")
            if not os.path.exists(txt):
                stats["no_text"] += 1
                print(f"skip {fname}: no {stem}.txt", file=sys.stderr)
                continue
            typed = [norm_ks(l) for l in open(txt, encoding="utf-8").read().splitlines() if l.strip()]
            rgb = Image.open(os.path.join(a.pages, fname)).convert("RGB")
            gray = np.asarray(rgb.convert("L"))
            calib, lines, _ = segment_page(gray, tuple(a.col))
            SW, LH = calib["SW"], calib["LH"]
            margin = max(4, int(round(1.5 * SW)))
            stats["pages"] += 1
            if len(lines) != len(typed):
                stats["line_count_mismatch"] += 1
                print(f"{fname}: {len(lines)} lines found, {len(typed)} typed; pairing the first {min(len(lines), len(typed))}",
                      file=sys.stderr)
            for li, (line, text) in enumerate(zip(lines, typed)):
                if not line["words"]:
                    continue
                stats["lines"] += 1
                tw = text.split()
                boxes = [word_box(w) for w in line["words"]]
                if len(boxes) == len(tw):
                    items = [(f"L{li + 1:02d}-W{wi + 1:02d}", "word", b, t, wi) for wi, (b, t) in enumerate(zip(boxes, tw))]
                else:
                    bs = np.array(boxes)
                    lb = [int(bs[:, 0].min()), int(bs[:, 1].min()), int(bs[:, 2].max()), int(bs[:, 3].max())]
                    items = [(f"L{li + 1:02d}-LINE", "line", lb, text, None)]
                for suffix, kind, box, truth, wi in items:
                    sid = f"{slug(a.dataset)}-{slug(stem)}-{suffix}"
                    g = crop(gray, box, margin)
                    proposed = truth
                    if model is not None and kind == "word":
                        proposed = model.read(g) or truth
                    im = Image.fromarray(g)
                    if im.width > a.max_width:
                        im = im.resize((a.max_width, max(1, round(im.height * a.max_width / im.width))), Image.LANCZOS)
                    im.save(os.path.join(a.out, "img", sid + ".webp"), quality=88)
                    ctx = context(rgb, line["y_band"], box, calib["x_left"], calib["x_right"], margin, int(3 * LH))
                    if ctx.width > 1400:
                        ctx = ctx.resize((1400, max(1, round(ctx.height * 1400 / ctx.width))), Image.LANCZOS)
                    ctx.save(os.path.join(a.out, "ctx", sid + ".webp"), quality=62)
                    rec = {
                        "id": sid, "dataset": a.dataset, "kind": kind, "font": font_map.get(stem, a.font),
                        "image": f"img/{sid}.webp", "context": f"ctx/{sid}.webp",
                        "text": proposed, "truth": truth,
                        "source_ref": {"page": fname, "line": li + 1, "word": None if wi is None else wi + 1,
                                       "box": box, "SW": round(SW, 2), "LH": round(LH, 1),
                                       "segmenter": "kashmiri_segmenter v1", "proposals": a.proposals},
                    }
                    mf.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    stats["word_samples" if kind == "word" else "line_samples"] += 1
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
