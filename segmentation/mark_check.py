"""Does every vowel sign / mark of a word actually show up when a font prints it?

    marks_ok(font, word, size) -> (ok, reason)

A mark fails when, at the given print size and after the scan-like blur, it adds almost no ink
(less than MIN_INK of size², e.g. a font with no glyph or anchor for it, which draws nothing or a dot).
It cannot judge everything a reader sees (a well-sized sign can still blend into a stroke), so human
review remains the final check.
"""
import unicodedata
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

MIN_INK = 0.004  # of size²: 36 px text needs at least ~5 visible pixels per mark


def _ink(font, text, w):
    im = Image.new("L", (w, int(font.size * 3)), 255)
    ImageDraw.Draw(im).text((w - font.size, int(font.size * 1.5)), text, font=font, fill=0, anchor="rm", direction="rtl", language="ks")
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.7))) < 200


@lru_cache(maxsize=4)
def _font(path, size):
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)


def marks_ok(font_path, word, size):
    word = unicodedata.normalize("NFC", word)
    idx = [i for i, c in enumerate(word) if unicodedata.category(c).startswith("M")]
    if not idx:
        return True, ""
    f = _font(font_path, size)
    width = max(200, int(size * (len(word) + 2)))  # same canvas for every variant of the word
    full = _ink(f, word, width)
    for i in idx:
        new = full & ~_ink(f, word[:i] + word[i + 1:], width)
        if new.sum() < MIN_INK * size * size:
            return False, f"{unicodedata.name(word[i])} ({new.sum()} px)"
    return True, ""
