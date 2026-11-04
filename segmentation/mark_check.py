"""Can a reader see, in this font, every Kashmiri letter and vowel sign of a word?

    marks_ok(font_path, word, size) -> (ok, reason)

Two checks, both at the real print size with the same light blur as the rendered pages:

1. Letters: each Kashmiri letter must look different from its look-alikes (ٲ vs أ/ا, ۄ vs و, ؠ vs ی ...).
   Fonts get this wrong: Gulzar draws nothing for ٲ, Afan Koshur Naksh draws ٲ exactly like أ,
   Narqalam draws ۄ exactly like و. Compared glyph by glyph, in every joining form.
2. Signs: each vowel sign / mark must add ink of its own, and most of that ink must stand apart from the
   letters. A sign drawn on top of a stroke disappears into it: Noto Naskh and Gulzar put ٕ under ھ
   right on the stroke, so the picture shows no sign at all.

Pixel checks cannot judge everything a reader sees, so human review stays the final word.
"""
import unicodedata
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import binary_dilation

MIN_INK = 0.004    # a sign must add at least this share of size² in ink (36 px text: ~5 px)
MIN_APART = 0.45   # ... and at least this share of its ink must stand 2 px clear of the letters
MIN_DIFF = 0.012   # two look-alike letters must differ by at least this share of size²

# letter -> letters it must not look like
LOOKALIKE = {
    "ٲ": "أا", "ٳ": "إا", "آ": "ا", "ۄ": "وؤ", "ۆ": "و", "ۅ": "و", "ؤ": "و",
    "ؠ": "ی", "ۍ": "یے", "ێ": "ی", "ے": "ی", "ۓ": "ے", "ئ": "ی",
    "ٹ": "ت", "ڈ": "د", "ڑ": "ر", "ژ": "ز", "ھ": "ہ", "گ": "ک", "ۂ": "ہ",
}
TATWEEL = "ـ"


def _ink(font, text, w):
    im = Image.new("L", (w, int(font.size * 3)), 255)
    ImageDraw.Draw(im).text((w - font.size, int(font.size * 1.5)), text, font=font, fill=0, anchor="rm", direction="rtl", language="ks")
    return np.asarray(im.filter(ImageFilter.GaussianBlur(0.7))) < 200


@lru_cache(maxsize=8)
def _font(path, size):
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)


def _crop(m):
    ys, xs = np.nonzero(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1] if len(ys) else np.zeros((1, 1), bool)


def _differs(a, b, size):
    """Glyph shapes, aligned on their ink boxes, differ visibly."""
    if not a.any() or not b.any():
        return a.any() != b.any()
    a, b = _crop(a), _crop(b)
    h, w = max(a.shape[0], b.shape[0]), max(a.shape[1], b.shape[1])
    pa = np.zeros((h, w), bool); pb = np.zeros((h, w), bool)
    pa[h - a.shape[0]:, w - a.shape[1]:] = a; pb[h - b.shape[0]:, w - b.shape[1]:] = b
    return (pa ^ pb).sum() >= MIN_DIFF * size * size


@lru_cache(maxsize=4096)
def unreadable_letters(font_path, size):
    """Letters this font draws invisibly, or exactly like one of their look-alikes."""
    f = _font(font_path, size)
    bad = {}
    for c, others in LOOKALIKE.items():
        for form in (c, TATWEEL + c, c + TATWEEL, TATWEEL + c + TATWEEL):
            w = size * 6
            mine = _ink(f, form, w)
            if not mine.any():
                bad[c] = f"{unicodedata.name(c)} is not drawn"
                break
            twin = next((o for o in others if not _differs(mine, _ink(f, form.replace(c, o), w), size)), None)
            if twin:
                bad[c] = f"{unicodedata.name(c)} looks like {unicodedata.name(twin)}"
                break
    return bad


def marks_ok(font_path, word, size):
    word = unicodedata.normalize("NFC", word)
    bad = unreadable_letters(font_path, size)
    for c in word:
        if c in bad:
            return False, bad[c]
    idx = [i for i, c in enumerate(word) if unicodedata.category(c).startswith("M")]
    if not idx:
        return True, ""
    f = _font(font_path, size)
    width = max(200, int(size * (len(word) + 2)))  # same canvas for every variant of the word
    full = _ink(f, word, width)
    for i in idx:
        base = _ink(f, word[:i] + word[i + 1:], width)
        new = full & ~base
        n = int(new.sum())
        if n < MIN_INK * size * size:
            return False, f"{unicodedata.name(word[i])} adds no visible ink"
        apart = n - int((new & binary_dilation(base, iterations=2)).sum())
        if apart < MIN_APART * n:
            return False, f"{unicodedata.name(word[i])} is drawn on top of a letter"
    return True, ""
