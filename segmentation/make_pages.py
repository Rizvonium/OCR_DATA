#!/usr/bin/env python3
"""Prepare whole pages for the guided review: page -> lines -> chunks -> text.

    python3 segmentation/make_pages.py PAGES_DIR OUT_DIR --dataset NAME [--col 0.02 0.98]
                                        [--font NAME | --font-map fonts.tsv]

For every page image: the segmenter (kashmiri_segmenter.py) finds the lines and, inside each line,
the chunks: PAWs (each connected piece of a word with its own dots and vowel signs), in reading order,
each remembering which word it belongs to (words = groups split at the wider gaps). Every chunk gets a
cleaned crop that keeps only its own ink components: anything else touching its box (a neighbouring
piece, a mark from another line) is erased. The Kashmiri word model reads the cleaned crop. Writes
  OUT_DIR/page/<id>.webp   the page
  OUT_DIR/heat/<id>.webp   the cleaned heat map (shadows and paper tone removed)
  OUT_DIR/clean/<id>-L<line>-C<chunk>.webp   each chunk's cleaned crop
  OUT_DIR/pages.jsonl      one page per line: id, dataset, font, image, heat, width, height,
                           lines: [{box, top, bottom, chunks: [{box, text, word, clean}]}]
Typed text (.txt next to a page) is not needed: reviewers check and correct the model's reading.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kashmiri_segmenter import segment_page  # noqa: E402
from make_samples import WordModel, slug  # noqa: E402

IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff")


def heat(ink_darkness):
    """Ink darkness as an inferno-like heat map: black paper, yellow-white ink."""
    t = np.clip(ink_darkness.astype(np.float32) / 255 * 1.6, 0, 1)
    rgb = np.stack([np.clip(3 * t, 0, 1), np.clip(3 * t - 1, 0, 1), np.clip(3 * t - 2, 0, 1) * 0.7 + 0.12 * (t > 0.04)], -1)
    return Image.fromarray((rgb * 255).astype(np.uint8))


def thin(points, step):
    """Keep every `step`-th separator point (and the last)."""
    pts = points[::step]
    if points and pts[-1] != points[-1]:
        pts.append(points[-1])
    return [[int(x), int(y)] for x, y in pts]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pages"); ap.add_argument("out")
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--col", nargs=2, type=float, default=(0.02, 0.98), metavar=("X0", "X1"))
    ap.add_argument("--font"); ap.add_argument("--font-map")
    ap.add_argument("--model", default=os.path.join(os.path.dirname(__file__), "..", "..", "kashmiri_ocr", "public", "models", "kashmiri_word_ocr_int8.onnx"))
    a = ap.parse_args()
    fonts = {}
    if a.font_map:
        for ln in open(a.font_map, encoding="utf-8"):
            if "\t" in ln:
                k, v = ln.rstrip("\n").split("\t", 1); fonts[os.path.splitext(k)[0]] = v.strip()
    model = WordModel(a.model)
    for d in ("page", "heat", "clean"):
        os.makedirs(os.path.join(a.out, d), exist_ok=True)
    n_pages = n_lines = n_chunks = 0
    with open(os.path.join(a.out, "pages.jsonl"), "w", encoding="utf-8") as out:
        for fname in sorted(f for f in os.listdir(a.pages) if f.lower().endswith(IMG_EXT)):
            stem = os.path.splitext(fname)[0]
            pid = f"{slug(a.dataset)}-{slug(stem)}"
            rgb = Image.open(os.path.join(a.pages, fname)).convert("RGB")
            gray = np.asarray(rgb.convert("L"))
            calib, lines, labels = segment_page(gray, tuple(a.col))
            margin = max(3, int(round(1.0 * calib["SW"])))
            norm = calib["norm_page"]
            rec_lines = []
            for line in lines:
                if not line["words"]:
                    continue
                chunks = []
                li = len(rec_lines)
                for wi, w in enumerate(line["words"]):
                    for part in w["parts"]:
                        x0, y0, x1, y1 = [int(v) for v in part["box"]]
                        ya, yb, xa, xb = max(0, y0 - margin), y1 + margin + 1, max(0, x0 - margin), x1 + margin + 1
                        own = np.isin(labels[ya:yb, xa:xb], part["uids"])  # this piece's own ink only
                        clean = np.where(own, np.minimum(norm[ya:yb, xa:xb], 200), 255).astype(np.uint8)
                        name = f"clean/{pid}-L{li + 1:02d}-C{len(chunks) + 1:02d}.webp"
                        ci = Image.fromarray(clean)
                        if ci.height > 72:  # small enough for a grid of many; still sharp on screen
                            ci = ci.resize((max(1, round(ci.width * 72 / ci.height)), 72), Image.LANCZOS)
                        ci.save(os.path.join(a.out, name), quality=72)
                        chunks.append({"box": [x0, y0, x1, y1], "text": model.read(clean), "word": wi, "clean": name})
                bs = np.array([c["box"] for c in chunks])
                rec_lines.append({
                    "box": [int(bs[:, 0].min()), int(bs[:, 1].min()), int(bs[:, 2].max()), int(bs[:, 3].max())],
                    "top": thin(line["separator_above"], 4), "bottom": thin(line["separator_below"], 4),
                    "chunks": chunks,  # right to left, as the segmenter orders them
                })
            rgb.save(os.path.join(a.out, "page", pid + ".webp"), quality=80)
            heat(calib["ink_darkness"]).save(os.path.join(a.out, "heat", pid + ".webp"), quality=70)
            out.write(json.dumps({
                "id": pid, "dataset": a.dataset, "font": fonts.get(stem, a.font),
                "image": f"page/{pid}.webp", "heat": f"heat/{pid}.webp", "width": rgb.width, "height": rgb.height,
                "lines": rec_lines,
                "source_ref": {"file": fname, "SW": round(calib["SW"], 2), "LH": round(calib["LH"], 1), "segmenter": "kashmiri_segmenter v1.1"},
            }, ensure_ascii=False) + "\n")
            n_pages += 1; n_lines += len(rec_lines); n_chunks += sum(len(l["chunks"]) for l in rec_lines)
    print(json.dumps({"pages": n_pages, "lines": n_lines, "chunks": n_chunks}))


if __name__ == "__main__":
    main()
