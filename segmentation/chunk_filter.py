"""Which chunks are proper pieces of words, and which are only a lone mark (a dot, three dots, the top
stroke of ک/گ, a small sign) that the segmenter cut off on its own.

A chunk is a lone mark when it is much smaller than the chunks of its own line: less than 40% of the
line's median chunk height and less than 80% of it wide. Lone marks are left out of the Label and
Match tasks (they are fixed in Segmentation, by joining them into the chunk they belong to).
"""
import statistics


def lone_marks(line_chunks):
    """Indexes of the chunks of one line that are only a mark."""
    hs = [c["box"][3] - c["box"][1] for c in line_chunks]
    if not hs:
        return set()
    med = statistics.median(hs)
    return {i for i, c in enumerate(line_chunks)
            if (c["box"][3] - c["box"][1]) < 0.4 * med and (c["box"][2] - c["box"][0]) < 0.8 * med}
