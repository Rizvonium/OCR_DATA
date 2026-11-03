"""Scale-invariant, Kashmiri-aware line / PAW / word segmenter (Noori Nastaleeq and Naskh).

This is the segmenter supplied by the project owner. Changes (marked "FIX (v1.1)" in the code):
stroke width is measured on the stroke ridge (it came out ~2x too small), the line pitch is
estimated by autocorrelation so rows of vowel signs are not taken for lines, plus a guard for
blank pages and a `segment_page()` wrapper. To swap in a new
segmentation method later, keep `segment_page()`'s return shape (see make_samples.py) and
everything downstream (crops, manifest, the review app) keeps working.

Every threshold is a multiple of the page's own stroke width (SW) and line height (LH), so the
same code works on 72 DPI screenshots and 600 DPI archival scans.
"""
import unicodedata
import numpy as np
import cv2
from scipy.interpolate import make_interp_spline
from scipy.signal import find_peaks


def nfc(text: str) -> str:
    """Enforce canonical Unicode NFC normalization for Kashmiri codepoints."""
    return unicodedata.normalize("NFC", text)


# ==============================================================================
# 1. INTRINSIC SCALE CALIBRATION (STROKE WIDTH 'SW' & LINE HEIGHT 'LH')
# ==============================================================================
def estimate_page_scale_and_ink(gray_img: np.ndarray, col_x_frac=(0.67, 0.96)):
    H, W = gray_img.shape
    x0_col, x1_col = int(W * col_x_frac[0]), int(W * col_x_frac[1])

    k_init = int(max(31, (min(H, W) // 12) | 1))
    bg_init = cv2.GaussianBlur(gray_img, (k_init, k_init), 0).astype(np.float32)
    norm_init = np.clip((gray_img.astype(np.float32) / (bg_init + 1e-5)) * 255.0, 0, 255).astype(np.uint8)
    ink_init = 255 - norm_init

    col_ink = ink_init[:, x0_col:x1_col]
    otsu_val, _ = cv2.threshold(col_ink, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ink_thresh_val = max(28, int(0.65 * otsu_val))
    rough_bin = (col_ink > ink_thresh_val).astype(np.uint8)

    dist = cv2.distanceTransform(rough_bin, cv2.DIST_L2, 3)
    # FIX (v1.1): the median over ALL ink pixels is ~1/4 of the stroke width (edge pixels dominate),
    # which made SW, and every threshold built on it, about half as large as intended. Measure the
    # radius on the stroke's ridge instead: pixels that are a local maximum of the distance map.
    ridge = (dist >= cv2.dilate(dist, np.ones((3, 3), np.uint8))) & (dist > 0.5)
    ink_radii = dist[ridge]
    median_radius = float(np.median(ink_radii)) if len(ink_radii) > 0 else 1.2
    SW = max(2.0, 2.0 * median_radius)

    k_bg = int(max(31, int(round(22 * SW)) | 1))
    blur_bg = cv2.GaussianBlur(gray_img, (k_bg, k_bg), 0).astype(np.float32)
    norm_page = np.clip((gray_img.astype(np.float32) / (blur_bg + 1e-5)) * 255.0, 0, 255).astype(np.uint8)
    ink_darkness = 255 - norm_page

    binary_ink = (ink_darkness > ink_thresh_val).astype(np.uint8)
    border_margin = max(10, int(0.018 * H))
    binary_ink[:border_margin, :] = 0
    binary_ink[H - border_margin:, :] = 0

    row_prof = binary_ink[:, x0_col:x1_col].sum(axis=1).astype(np.float32)
    smooth_k = int(max(5, int(round(5 * SW)) | 1))
    smooth_prof = cv2.GaussianBlur(row_prof.reshape(-1, 1), (1, smooth_k), 0).ravel()

    min_peak_dist = max(14, int(round(7.5 * SW)))
    # FIX (v1.1): Kashmiri vowel signs and dots form their own rows of ink above/below the kursi, and
    # each became a "line". Estimate the line pitch first from the profile's autocorrelation and
    # never accept two line centres closer than 0.6 of it.
    prof0 = smooth_prof - smooth_prof.mean()
    ac = np.correlate(prof0, prof0, mode="full")[len(prof0) - 1:]
    if ac[0] > 0:
        ac = ac / ac[0]
        lo = max(min_peak_dist, 4)
        ac_peaks, _ = find_peaks(ac[lo:len(ac) // 2], height=0.15)
        if len(ac_peaks):
            min_peak_dist = max(min_peak_dist, int(0.6 * (ac_peaks[0] + lo)))
    peaks, _ = find_peaks(smooth_prof, height=max(4.0, 2.5 * SW), distance=min_peak_dist)

    if len(peaks) >= 2:
        diffs = np.diff(peaks)
        single_line_diffs = diffs[diffs < 2.2 * np.median(diffs)]
        LH = float(np.median(single_line_diffs)) if len(single_line_diffs) > 0 else float(np.median(diffs))
    else:
        LH = 12.0 * SW

    return {
        "SW": SW, "LH": LH, "x_left": x0_col, "x_right": x1_col,
        "norm_page": norm_page, "ink_darkness": ink_darkness, "binary_ink": binary_ink,
        "peaks": peaks, "smooth_prof": smooth_prof,
    }


# ==============================================================================
# 2. SCALE-INVARIANT SPLINE SEPARATOR (BENDS AROUND FLOATING KASHMIRI VOWELS)
# ==============================================================================
def compute_adaptive_spline(binary_ink, y_top, y_bot, x_left, x_right, SW):
    H, W = binary_ink.shape
    col_w = x_right - x_left
    num_ctrl = max(7, min(15, int(round(col_w / max(8.0, 7.5 * SW)))))
    win_half = max(3, int(round(2.5 * SW)))

    xs_ctrl = np.linspace(x_left, x_right, num_ctrl)
    ys_ctrl = []
    for x in xs_ctrl:
        xi0 = max(0, int(round(x)) - win_half)
        xi1 = min(W, int(round(x)) + win_half + 1)
        col_slice = binary_ink[y_top:y_bot + 1, xi0:xi1]
        zero_mask = (col_slice.sum(axis=1) == 0)
        best_len = -1
        best_mid = 0.5 * (y_top + y_bot)
        cur_start = None
        for idx_y, is_free in enumerate(zero_mask):
            if is_free and cur_start is None:
                cur_start = idx_y
            elif not is_free and cur_start is not None:
                run_len = idx_y - cur_start
                if run_len > best_len:
                    best_len = run_len
                    best_mid = y_top + cur_start + 0.5 * run_len
                cur_start = None
        if cur_start is not None:
            run_len = len(zero_mask) - cur_start
            if run_len > best_len:
                best_mid = y_top + cur_start + 0.5 * run_len
        ys_ctrl.append(best_mid)

    num_dense = max(30, int(round(col_w / max(2.0, 1.8 * SW))))
    spl = make_interp_spline(xs_ctrl, np.array(ys_ctrl, dtype=np.float32), k=min(3, len(xs_ctrl) - 1))
    xs_dense = np.linspace(x_left, x_right, num_dense)
    ys_dense = spl(xs_dense)

    max_nudge = max(10, int(round(6.0 * SW)))
    pts = []
    for x_val, y_val in zip(xs_dense, ys_dense):
        ix = min(W - 1, int(round(x_val)))
        iy = np.clip(int(round(y_val)), y_top, y_bot)
        if binary_ink[iy, ix] > 0:
            for dy in range(1, max_nudge + 1):
                if iy - dy >= y_top and binary_ink[iy - dy, ix] == 0:
                    iy -= dy
                    break
                if iy + dy <= y_bot and binary_ink[iy + dy, ix] == 0:
                    iy += dy
                    break
        pts.append([ix, int(iy)])
    return pts


# ==============================================================================
# 3. KASHMIRI NASTALEEQ PAW & WORD SEGMENTER (WITH NON-JOINER & DIACRITIC LOGIC)
# ==============================================================================
def segment_kashmiri_column(calib: dict):
    SW = calib["SW"]
    LH = calib["LH"]
    x_left, x_right = calib["x_left"], calib["x_right"]
    binary_ink = calib["binary_ink"]
    peaks = calib["peaks"]
    smooth_prof = calib["smooth_prof"]
    H, W = binary_ink.shape
    if len(peaks) == 0:  # blank page or column: nothing to segment
        return [], None, None

    sep_bands = [(max(8, int(peaks[0] - 0.55 * LH)), max(12, int(peaks[0] - 0.25 * LH)))]
    for i in range(len(peaks) - 1):
        p_curr, p_next = peaks[i], peaks[i + 1]
        valley_y = p_curr + int(np.argmin(smooth_prof[p_curr:p_next]))
        half_band = max(int(round(1.8 * SW)), int(0.22 * (p_next - p_curr)))
        sep_bands.append((max(0, valley_y - half_band), min(H - 1, valley_y + half_band)))
    sep_bands.append((min(H - 12, int(peaks[-1] + 0.30 * LH)), min(H - 4, int(peaks[-1] + 0.65 * LH))))

    separators = [compute_adaptive_spline(binary_ink, b0, b1, x_left, x_right, SW) for (b0, b1) in sep_bands]

    spline_y_maps = []
    for pts in separators:
        xs_p = np.array([p[0] for p in pts])
        ys_p = np.array([p[1] for p in pts])
        spline_y_maps.append(np.interp(np.arange(W), xs_p, ys_p))

    num_cc, cc_labels, cc_stats, cc_centroids = cv2.connectedComponentsWithStats(binary_ink, connectivity=8)
    min_cc_area = max(2, int(round(0.35 * (SW ** 2))))

    lines_raw_paws = []
    all_inter_paw_gaps = []

    for line_idx in range(len(peaks)):
        y_top_map = spline_y_maps[line_idx]
        y_bot_map = spline_y_maps[line_idx + 1]
        ccs = []
        for uid in range(1, num_cc):
            x, y, w_cc, h_cc, area = cc_stats[uid]
            cx, cy = cc_centroids[uid]
            ix = int(np.clip(round(cx), 0, W - 1))
            if area >= min_cc_area and x_left <= cx <= x_right and y_top_map[ix] <= cy < y_bot_map[ix]:
                ccs.append({
                    "uid": uid, "x0": int(x), "y0": int(y),
                    "x1": int(x + w_cc - 1), "y1": int(y + h_cc - 1),
                    "w": int(w_cc), "h": int(h_cc), "area": int(area),
                    "cx": float(cx), "cy": float(cy),
                })
        if not ccs:
            lines_raw_paws.append([])
            continue

        kursi_y = float(np.average([c["cy"] for c in ccs], weights=[c["area"] for c in ccs]))

        main_bodies, diacritics = [], []
        for c in ccs:
            near_kursi = abs(c["cy"] - kursi_y) <= 2.4 * SW
            is_tall_alef_or_kaf = c["h"] >= 2.6 * SW and near_kursi
            is_wide_ligature = c["w"] >= 2.8 * SW or c["area"] >= 3.8 * (SW ** 2)
            is_kursi_letter = near_kursi and (c["area"] >= 1.6 * (SW ** 2) or c["w"] >= 1.6 * SW)
            if is_wide_ligature or is_tall_alef_or_kaf or is_kursi_letter:
                main_bodies.append({"x0": c["x0"], "y0": c["y0"], "x1": c["x1"], "y1": c["y1"],
                                    "cx": c["cx"], "cy": c["cy"], "uids": [c["uid"]]})
            else:
                diacritics.append(c)

        if not main_bodies:
            main_bodies = [{"x0": c["x0"], "y0": c["y0"], "x1": c["x1"], "y1": c["y1"],
                            "cx": c["cx"], "cy": c["cy"], "uids": [c["uid"]]} for c in ccs]
            diacritics = []

        main_bodies.sort(key=lambda b: -b["x1"])
        merged_paws = []
        for b in main_bodies:
            if not merged_paws:
                merged_paws.append(b)
            else:
                prev = merged_paws[-1]
                overlap_x = min(prev["x1"], b["x1"]) - max(prev["x0"], b["x0"])
                min_w = max(1, min(prev["x1"] - prev["x0"], b["x1"] - b["x0"]))
                if overlap_x >= max(1.2 * SW, 0.45 * min_w):
                    prev["x0"] = min(prev["x0"], b["x0"]); prev["y0"] = min(prev["y0"], b["y0"])
                    prev["x1"] = max(prev["x1"], b["x1"]); prev["y1"] = max(prev["y1"], b["y1"])
                    prev["cx"] = 0.5 * (prev["x0"] + prev["x1"])
                    prev["uids"].extend(b["uids"])
                else:
                    merged_paws.append(b)

        for d in diacritics:
            def paw_dist(p):
                dx = max(0.0, p["x0"] - d["cx"], d["cx"] - p["x1"])
                dy = max(0.0, p["y0"] - d["cy"], d["cy"] - p["y1"])
                center_dx = abs(p["cx"] - d["cx"])
                return 5.0 * dx + 0.35 * dy + 0.25 * center_dx
            best_paw = min(merged_paws, key=paw_dist)
            best_paw["x0"] = min(best_paw["x0"], d["x0"]); best_paw["y0"] = min(best_paw["y0"], d["y0"])
            best_paw["x1"] = max(best_paw["x1"], d["x1"]); best_paw["y1"] = max(best_paw["y1"], d["y1"])
            best_paw["uids"].append(d["uid"])

        pad = max(1, int(round(0.35 * SW)))
        for p in merged_paws:
            p["box"] = [p["x0"] - pad, p["y0"] - pad, p["x1"] + pad, p["y1"] + pad]
            p["w"] = p["x1"] - p["x0"] + 1
            p["h"] = p["y1"] - p["y0"] + 1

        for j in range(len(merged_paws) - 1):
            gap = merged_paws[j]["x0"] - merged_paws[j + 1]["x1"]
            if gap > -2.0 * SW:
                all_inter_paw_gaps.append(gap)
        lines_raw_paws.append(merged_paws)

    word_gap_thresh = max(2.0 * SW, 4.5)
    if len(all_inter_paw_gaps) >= 6:
        pos_gaps = np.array([g for g in all_inter_paw_gaps if g >= 0], dtype=np.float32)
        if len(pos_gaps) >= 4:
            adaptive_t = float(np.percentile(pos_gaps, 62))
            word_gap_thresh = float(np.clip(adaptive_t, 1.7 * SW, 2.8 * SW))

    lines_spec = []
    for line_idx, paws in enumerate(lines_raw_paws):
        words, cur_parts = [], []
        for idx_p, p in enumerate(paws):
            p_entry = {"box": p["box"], "text": "", "uids": p["uids"]}
            if not cur_parts:
                cur_parts.append(p_entry)
                continue
            prev_p = paws[idx_p - 1]
            raw_gap = prev_p["x0"] - p["x1"]
            prev_is_narrow_nonjoiner = (prev_p["w"] <= 3.0 * SW and prev_p["h"] <= 4.8 * SW)
            effective_thresh = word_gap_thresh * (1.28 if prev_is_narrow_nonjoiner else 1.0)
            if raw_gap >= effective_thresh:
                words.append({"text": "", "confidence": 0.95, "alternatives": [], "parts": cur_parts})
                cur_parts = [p_entry]
            else:
                cur_parts.append(p_entry)
        if cur_parts:
            words.append({"text": "", "confidence": 0.95, "alternatives": [], "parts": cur_parts})

        lines_spec.append({
            "line": line_idx + 1,
            "y_band": (sep_bands[line_idx][0], sep_bands[line_idx + 1][1]),
            "separator_above": separators[line_idx],
            "separator_below": separators[line_idx + 1],
            "roman_in_same_row": "",
            "words": words,
        })
    return lines_spec, cc_labels, cc_stats


def word_box(word):
    """Union of a word's PAW boxes: [x0, y0, x1, y1] (inclusive, padded)."""
    bs = np.array([p["box"] for p in word["parts"]])
    return [int(bs[:, 0].min()), int(bs[:, 1].min()), int(bs[:, 2].max()), int(bs[:, 3].max())]


def segment_page(gray_img: np.ndarray, col_x_frac=(0.67, 0.96)):
    """Calibrate and segment one page. Returns (calib, lines_spec, cc_labels)."""
    calib = estimate_page_scale_and_ink(gray_img, col_x_frac)
    lines, cc_labels, _ = segment_kashmiri_column(calib)
    return calib, lines, cc_labels
