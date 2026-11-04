#!/usr/bin/env python3
"""Render a few scan-like Kashmiri pages (+ their typed text) to try the pipeline end to end.

    python3 segmentation/render_demo_pages.py WORDLIST FONT_DIR OUT_DIR [--pages 6]

WORDLIST is a file with one Kashmiri word per line (e.g. Kashmiri_dictionary/data/kashmiri_headwords.txt).
FONT_DIR holds .ttf fonts (Noto Naskh Arabic, Noto Nastaliq Urdu, Gulzar...). These pages are
only a stand-in until real scans are imported: the typed text is exactly what was rendered.
"""
import argparse
import os
import random
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, features


def font_label(path):
    """Gulmarg_Nastaleeq.ttf -> 'Gulmarg Nastaleeq', NotoNastaliqUrdu-Regular.ttf -> 'NotoNastaliqUrdu'."""
    stem = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r"[_ -]?(400)?Regular$", "", stem).replace("_", " ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wordlist"); ap.add_argument("fonts"); ap.add_argument("out")
    ap.add_argument("--pages", type=int, default=6, help="pages per font"); ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    assert features.check("raqm"), "Pillow needs libraqm to shape Arabic script"
    rnd = random.Random(a.seed)
    words = [w.strip() for w in open(a.wordlist, encoding="utf-8") if w.strip() and " " not in w.strip() and 2 <= len(w.strip()) <= 12]
    fonts = sorted(os.path.join(a.fonts, f) for f in os.listdir(a.fonts) if f.endswith(".ttf"))
    os.makedirs(a.out, exist_ok=True)
    font_names = open(os.path.join(a.out, "fonts.tsv"), "w", encoding="utf-8")
    # only words the font can draw: a missing glyph would print as an empty box
    from fontTools.ttLib import TTFont
    drawable = {}
    for fp in fonts:
        cmap = TTFont(fp).getBestCmap() or {}
        drawable[fp] = [w for w in words if all(ord(c) in cmap for c in w)]
        print(f"{font_label(fp)}: can draw {len(drawable[fp])} of {len(words)} words")
    for p in range(a.pages * len(fonts)):
        font_path = fonts[p % len(fonts)]
        nast = any(k in font_path for k in ("Nastaliq", "Nastaleeq", "Gulzar"))
        size = rnd.randint(34, 44)
        font = ImageFont.truetype(font_path, size, layout_engine=ImageFont.Layout.RAQM)
        W, H = 1100, 1400
        img = Image.new("L", (W, H), 255)
        d = ImageDraw.Draw(img)
        pitch = int(size * (2.6 if nast else 2.0))
        lines, y = [], int(pitch * 0.9)
        while y < H - pitch * 0.9:
            ln = [rnd.choice(drawable[font_path]) for _ in range(rnd.randint(3, 5))]
            text = " ".join(ln)
            spaced = "   ".join(ln)  # generous word gaps, as in printed Kashmiri books
            d.text((W - 70, y), spaced, font=font, fill=0, anchor="rm", direction="rtl", language="ks")
            lines.append(text)
            y += pitch
        # scan look: paper tone gradient, slight blur, noise, a soft shadow on one side
        arr = np.asarray(img.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32)
        xs = np.linspace(0, 1, W)[None, :]
        paper = 236 - 28 * np.exp(-xs / 0.08) - 10 * np.linspace(0, 1, H)[:, None]
        ink = 255 - arr
        arr = paper - ink * (paper - 40) / 255
        arr += np.random.default_rng(p).normal(0, 5, arr.shape)
        Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(a.out, f"page{p + 1:02d}.png"))
        with open(os.path.join(a.out, f"page{p + 1:02d}.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        font_names.write(f"page{p + 1:02d}\t{font_label(font_path)}\n")
        print(f"page{p + 1:02d}: {os.path.basename(font_path)} size {size}, {len(lines)} lines")


if __name__ == "__main__":
    main()
