"""Make horizontal strips repeat without a visible seam.

``cut`` searches for a crop whose two ends "rhyme": the columns around its
right end look like the columns around its left end, so when the strip wraps,
what follows the last column is what naturally followed it in the painting.
Both the crop start and (optionally) its width are searched, because a row of
houses only rhymes at house boundaries and those rarely sit a fixed distance
apart. Nothing is blended, so pixels stay hand-placed.

``blend`` additionally cross-fades a short overlap across the wrap point, for
continuous textures where no rhyming pair exists. ``mirror`` appends a flipped
copy; seamless by construction but visibly symmetric, so it is a last resort.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from PIL import Image

from .color import distance_sq

Signature = List[Tuple[float, float, float, float]]

_TRANSPARENT_MISMATCH = 120000.0


def _signatures(image: Image.Image, band: int = 4) -> List[Signature]:
    """Per column, the mean colour and coverage of each ``band``-row block.

    Comparing banded means instead of single pixels is ~4x faster and ignores
    single-pixel texture noise that would not be visible as a seam anyway.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    result: List[Signature] = []
    for x in range(w):
        sig: Signature = []
        for y0 in range(0, h, band):
            r = g = b = cover = 0.0
            n = 0
            for y in range(y0, min(h, y0 + band)):
                pr, pg, pb, pa = px[x, y]
                n += 1
                if pa:
                    cover += 1
                    r += pr
                    g += pg
                    b += pb
            if cover:
                sig.append((r / cover, g / cover, b / cover, cover / n))
            else:
                sig.append((0.0, 0.0, 0.0, 0.0))
        result.append(sig)
    return result


def _sig_difference(a: Signature, b: Signature) -> float:
    total = 0.0
    for p, q in zip(a, b):
        if p[3] == 0 and q[3] == 0:
            continue
        total += abs(p[3] - q[3]) * _TRANSPARENT_MISMATCH
        if p[3] and q[3]:
            total += distance_sq(p, q)
    return total


def edge_columns(image: Image.Image, keep: float = 0.12) -> List[int]:
    """Columns that start a new vertical feature (a building's party wall).

    Ranked by how much the colour changes from the previous column summed over
    the height; the top ``keep`` fraction are returned.
    """
    sigs = _signatures(image, band=2)
    strength = [0.0] + [_sig_difference(sigs[x - 1], sigs[x]) for x in range(1, len(sigs))]
    ranked = sorted(range(len(sigs)), key=lambda x: strength[x], reverse=True)
    return sorted(ranked[: max(2, int(len(sigs) * keep))])


def find_seam(
    image: Image.Image,
    widths: Sequence[int],
    window: int = 3,
    overlap: int = 0,
    on_edges: bool = False,
) -> Tuple[int, int]:
    """Return ``(start, width)`` of the best-rhyming crop among ``widths``.

    With ``on_edges`` both ends of the crop must fall on an edge column, so a
    row of buildings is cut between buildings rather than through a facade.
    """
    sigs = _signatures(image)
    w = len(sigs)
    edges = set(edge_columns(image)) if on_edges else None
    best = (0, widths[0])
    best_score = float("inf")
    for width in widths:
        for start in range(window, w - width - max(window, overlap, 1) + 1):
            end = start + width
            if edges is not None and (start not in edges or end not in edges):
                continue
            score = 0.0
            for i in range(-window, window):
                score += _sig_difference(sigs[end + i], sigs[start + i])
                if score >= best_score:
                    break
            if score < best_score:
                best, best_score = (start, width), score
    if best_score == float("inf"):
        raise ValueError(f"strip of {w}px is too narrow for widths {min(widths)}-{max(widths)}")
    return best


def make_tileable(
    image: Image.Image,
    widths: Sequence[int],
    mode: str = "cut",
    overlap: int = 16,
    on_edges: bool = False,
) -> Image.Image:
    rgba = image.convert("RGBA")
    if mode == "mirror":
        width = widths[0]
        half = rgba.crop((0, 0, width // 2, rgba.height))
        result = Image.new("RGBA", (width, rgba.height))
        result.paste(half, (0, 0))
        result.paste(half.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (width // 2, 0))
        return result
    if mode not in ("cut", "blend"):
        raise ValueError(f"unknown tile mode {mode!r}")
    blend_px = overlap if mode == "blend" else 0
    start, width = find_seam(rgba, widths, overlap=blend_px, on_edges=on_edges)
    strip = rgba.crop((start, 0, start + width + blend_px, rgba.height))
    if mode == "cut":
        return strip
    # Column ``width`` is what naturally follows the last kept column, so the
    # first ``overlap`` columns fade from that continuation into the original.
    result = strip.crop((0, 0, width, strip.height))
    for x in range(blend_px):
        t = (x + 0.5) / blend_px
        tail = strip.crop((width + x, 0, width + x + 1, strip.height))
        head = strip.crop((x, 0, x + 1, strip.height))
        result.paste(Image.blend(tail, head, t), (x, 0))
    return result


def seam_error(image: Image.Image) -> float:
    """Mean banded difference across the wrap (last column vs first; 0 = identical)."""
    sigs = _signatures(image)
    return _sig_difference(sigs[-1], sigs[0]) / max(1, len(sigs[0]))
