"""Cropping and area downsampling to native resolution."""

from __future__ import annotations

from typing import Optional, Tuple

from PIL import Image

Box = Tuple[int, int, int, int]


def crop(image: Image.Image, box: Box) -> Image.Image:
    """Crop to ``(left, top, right, bottom)`` in source pixels."""
    return image.crop(box)


def target_size(
    image: Image.Image,
    width: Optional[int] = None,
    height: Optional[int] = None,
    factor: Optional[float] = None,
) -> Tuple[int, int]:
    """Resolve the native size from an explicit width/height or a divisor.

    Giving only one of width/height keeps the aspect ratio, so a recipe can say
    "make it 512 wide" without recomputing heights when a source is re-rolled.
    """
    w, h = image.size
    if factor is not None:
        return max(1, round(w / factor)), max(1, round(h / factor))
    if width is not None and height is not None:
        return width, height
    if width is not None:
        return width, max(1, round(h * width / w))
    if height is not None:
        return max(1, round(w * height / h)), height
    return w, h


def downsample(image: Image.Image, size: Tuple[int, int], then_nearest: Optional[Tuple[int, int]] = None) -> Image.Image:
    """Area-average to ``size`` and optionally finish with a nearest-neighbour step.

    Pillow premultiplies alpha when resizing RGBA, so keyed-out magenta never
    bleeds into the averaged edge colours. The optional nearest step exists for
    sources painted on a coarse grid: averaging to the grid first and then
    snapping keeps blocks solid instead of smearing them.
    """
    rgba = image.convert("RGBA")
    result = rgba.resize(size, Image.Resampling.BOX)
    if then_nearest is not None:
        result = result.resize(then_nearest, Image.Resampling.NEAREST)
    return result


def binarize_alpha(image: Image.Image, threshold: int = 128) -> Image.Image:
    """Snap alpha to 0/255 and zero the colour of transparent pixels."""
    rgba = image.convert("RGBA")
    out = []
    for r, g, b, a in rgba.getdata():
        out.append((r, g, b, 255) if a >= threshold else (0, 0, 0, 0))
    result = Image.new("RGBA", rgba.size)
    result.putdata(out)
    return result


def upscale(image: Image.Image, scale: int) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
