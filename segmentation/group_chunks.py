#!/usr/bin/env python3
"""Group chunks that look the same, across every page, so one decision labels many of them.

    python3 segmentation/group_chunks.py OUT.jsonl PAGES_JSONL [PAGES_JSONL ...] [--threshold 0.06] [--max-size 30]

Each PAGES_JSONL is made by make_pages.py (or data/pages/manifest.jsonl). Every chunk's cleaned crop
(only its own ink) is trimmed to its ink, scaled to a fixed height and compared with every other chunk:
chunks closer than --threshold (mean pixel difference, plus a penalty for a different shape) are
grouped (average-linkage clustering). The same printed piece repeats a lot, so groups get large.
Each group's proposed text is the most common word-model reading among its members.

Writes one group per line: id, members [{chunk, page, line, chunk_index, clean_url, text}],
proposed_text, size, fonts. Groups larger than --max-size are split; chunks with no look-alike are
written as groups of one only with --singletons.
"""
import argparse, collections, hashlib, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chunk_filter import lone_marks  # noqa: E402
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import pdist

H, W = 24, 72


def signature(ink):
    """Dots and signs decide first: the number of separate marks besides the main stroke, where each
    sits (above / below / beside it) and whether it is a dot or a larger sign. ا, آ and أ differ only
    here, as do و, ز and ژ; pixel distance alone would merge them."""
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    if n == 0:
        return (), np.zeros_like(ink)
    sizes = ndimage.sum(ink, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    my, mx = np.nonzero(lab == main)
    top, bot, mid = my.min(), my.max(), (my.min() + my.max()) / 2
    h = bot - top + 1
    marks = []
    for k in range(1, n + 1):
        if k == main or sizes[k - 1] < max(3, 0.004 * ink.sum()):
            continue
        ys, xs = np.nonzero(lab == k)
        cy = ys.mean()
        zone = "above" if cy < top + 0.2 * h else "below" if cy > bot - 0.2 * h else "beside"
        kind = "dot" if max(np.ptp(ys), np.ptp(xs)) + 1 < 0.22 * h + 3 else "sign"
        marks.append((zone, kind))
    return tuple(sorted(marks)), (lab != main) & (lab > 0)


MARK_FACTOR = 2.5  # marks (hamza, madd, dots, vowel signs) are small but decide the letter: weigh them up


def feature(path):
    g = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    ys, xs = np.nonzero(g < 160)
    if not len(ys):
        return None, None, None
    g = g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = g.shape
    aspect = w / h
    nw = max(1, min(W, round(H * aspect)))
    sig, mark_mask = signature(g < 160)
    x0 = (W - nw) // 2

    def place(img):
        im = Image.fromarray(img.astype(np.uint8)).resize((nw, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.8))
        c = np.zeros((H, W), np.float32)
        c[:, x0:x0 + nw] = 1 - np.asarray(im, np.float32) / 255
        return c.ravel()
    whole = place(g)
    marks = place(np.where(mark_mask, g, 255))  # the marks alone, same position
    return (np.r_[whole, np.log(aspect) * 0.6], np.r_[marks, mark_shapes(g, mark_mask)]), aspect, sig


S = 12


def mark_shapes(g, mark_mask, k=3):
    """Each mark (up to k, right to left) cut out and enlarged to SxS: a madd, a hamza, a zabar and a
    pesh are a few pixels each in the whole picture, but clearly different shapes once enlarged."""
    lab, n = ndimage.label(mark_mask, structure=np.ones((3, 3)))
    found = []
    for sl in ndimage.find_objects(lab):
        if sl is None:
            continue
        piece = g[sl]
        h, w = piece.shape
        side = max(h, w)
        sq = np.full((side, side), 255, np.uint8)
        sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = piece
        v = 1 - np.asarray(Image.fromarray(sq).resize((S, S), Image.BILINEAR), np.float32) / 255
        found.append((-sl[1].stop, sl[0].start, v.ravel()))
    found.sort(key=lambda t: (t[0], t[1]))
    out = np.zeros(k * S * S, np.float32)
    for i, (_, _, v) in enumerate(found[:k]):
        out[i * S * S:(i + 1) * S * S] = v
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out"); ap.add_argument("pages", nargs="+")
    ap.add_argument("--root", default="public", help="folder the clean_url paths are relative to")
    ap.add_argument("--threshold", type=float, default=0.06)
    ap.add_argument("--max-size", type=int, default=30)
    ap.add_argument("--singletons", action="store_true")
    a = ap.parse_args()

    items = []
    for f in a.pages:
        for line in open(f, encoding="utf-8"):
            p = json.loads(line)
            for li, l in enumerate(p["lines"]):
                marks = lone_marks(l["chunks"])  # a lone dot or sign is not a chunk to label
                for ci, c in enumerate(l["chunks"]):
                    if ci in marks:
                        continue
                    url = c.get("clean_url")
                    if not url:
                        continue
                    items.append({"chunk": f"{p['id']}:L{li + 1}:C{ci + 1}", "page": p["id"], "line": li, "chunk_index": ci,
                                  "clean_url": url, "text": c.get("text", ""), "font": p.get("font")})
    buckets = collections.defaultdict(list)  # mark signature -> [((stroke, marks), item)]
    for it in items:
        v, asp, sig = feature(os.path.join(a.root, it["clean_url"].lstrip("/")))
        if v is not None:
            buckets[sig].append((v, it))
    print(f"{sum(len(b) for b in buckets.values())} chunks, {len(buckets)} mark signatures", file=sys.stderr)
    clusters = collections.defaultdict(list)
    for sig, rows in buckets.items():
        if len(rows) == 1:
            clusters[(sig, 0)].append(rows[0][1]); continue
        A = np.array([r[0][0] for r in rows], np.float32)   # the whole piece (shape counts too)
        B = np.array([r[0][1] for r in rows], np.float32)   # its marks: in place, and each enlarged
        d_whole = pdist(A, "euclidean") / np.sqrt(H * W)
        d_marks = pdist(B, "euclidean") / np.sqrt(B.shape[1]) if sig else np.zeros_like(d_whole)
        d = np.maximum(d_whole, MARK_FACTOR * d_marks)      # both must be close: the stroke AND the marks
        for (_, it), lab in zip(rows, fcluster(linkage(d, "average"), a.threshold, criterion="distance")):
            clusters[(sig, lab)].append(it)

    groups, singles = [], 0
    for members in sorted(clusters.values(), key=len, reverse=True):
        if len(members) < 2 and not a.singletons:
            singles += 1
            continue
        proposed = collections.Counter(m["text"] for m in members if m["text"]).most_common(1)
        for k in range(0, len(members), a.max_size):
            part = members[k:k + a.max_size]
            # the id comes from the members, so a rebuilt group keeps its id only if its content is the same
            gid = "g" + hashlib.sha1("|".join(sorted(m["chunk"] for m in part)).encode()).hexdigest()[:12]
            groups.append({"id": gid, "members": part, "proposed_text": proposed[0][0] if proposed else "",
                           "size": len(part), "fonts": sorted({m["font"] for m in part if m["font"]})})
    with open(a.out, "w", encoding="utf-8") as fh:
        for g in groups:
            fh.write(json.dumps(g, ensure_ascii=False) + "\n")
    grouped = sum(g["size"] for g in groups)
    pure = sum(collections.Counter(m["text"] for m in g["members"]).most_common(1)[0][1] for g in groups)
    print(json.dumps({"groups": len(groups), "chunks_in_groups": grouped, "chunks_alone": singles,
                      "largest": max((g["size"] for g in groups), default=0),
                      "members_sharing_the_groups_main_reading": f"{100 * pure / max(1, grouped):.0f}%"}))


if __name__ == "__main__":
    main()
