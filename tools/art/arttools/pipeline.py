"""The ordered processing pipeline shared by ``pixelate.py`` and ``build.py``.

Order matters and is fixed: everything that mixes colours (keying, area
downsampling, grading, sharpening, seam blending, outlines) happens before
palette quantisation, so the final image only ever contains palette colours.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

from PIL import Image

from . import arrange, chroma, grade, outline, quantize, resample, tiling
from .color import MAGENTA, RGB, load_palette, parse_hex


@dataclass(frozen=True)
class Steps:
    """Every knob of the pipeline. Defaults are a no-op except alpha snapping."""

    crop: Optional[Tuple[int, int, int, int]] = None
    source_alpha_threshold: int = 128
    key: Optional[RGB] = None
    key_tolerance: float = 90.0
    key_fringe: int = 3
    trim: bool = False
    width: Optional[int] = None
    height: Optional[int] = None
    factor: Optional[float] = None
    then_nearest: Optional[Tuple[int, int]] = None
    saturation: float = 1.0
    brightness: float = 1.0
    contrast: float = 1.0
    tint: Optional[RGB] = None
    tint_amount: float = 0.0
    sharpen: float = 1.0
    arrange_width: Optional[int] = None
    arrange_order: Optional[Tuple[int, ...]] = None
    tile_width: Optional[int] = None
    tile_width_max: Optional[int] = None
    tile_mode: str = "cut"
    tile_overlap: int = 16
    tile_on_edges: bool = False
    drop_fragments: int = 0
    outline: bool = False
    outline_color: Optional[RGB] = None
    colors: Optional[int] = None
    palette: Optional[Path] = None
    dither: Optional[str] = None
    dither_strength: float = 24.0
    despeckle: bool = False
    pad: Optional[Tuple[int, int]] = None
    anchor: str = "bottom"
    canvas_height: Optional[int] = None

    @staticmethod
    def from_mapping(raw: Mapping[str, Any], base_dir: Optional[Path] = None) -> "Steps":
        """Build from a recipe dict (snake_case keys; colours as ``#rrggbb``)."""
        known = {f.name for f in fields(Steps)}
        unknown = set(raw) - known
        if unknown:
            raise ValueError(f"unknown pipeline options: {sorted(unknown)}")
        values: Dict[str, Any] = dict(raw)
        for name in ("key", "tint", "outline_color"):
            if isinstance(values.get(name), str):
                values[name] = MAGENTA if values[name] == "magenta" else parse_hex(values[name])
        for name in ("crop", "then_nearest", "pad", "arrange_order"):
            if values.get(name) is not None:
                values[name] = tuple(values[name])
        if values.get("palette") is not None:
            path = Path(values["palette"])
            values["palette"] = path if path.is_absolute() or base_dir is None else base_dir / path
        return Steps(**values)


@dataclass
class Result:
    image: Image.Image
    palette: List[RGB] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


def run(source: Image.Image, steps: Steps) -> Result:
    notes: List[str] = []
    image = _snap_source_alpha(source.convert("RGBA"), steps.source_alpha_threshold)
    if steps.crop:
        image = resample.crop(image, steps.crop)
    if steps.key is not None:
        image = chroma.chroma_key(image, steps.key, steps.key_tolerance, steps.key_fringe)
    if steps.trim:
        bbox = image.getchannel("A").getbbox()
        if bbox:
            image = image.crop(bbox)
    size = resample.target_size(image, steps.width, steps.height, steps.factor)
    if size != image.size:
        image = resample.downsample(image, size, steps.then_nearest)
    image = resample.binarize_alpha(image)
    if steps.key is not None:
        image = chroma.remove_specks(chroma.despill_edges(image))
    if steps.drop_fragments:
        image = arrange.drop_fragments(image, steps.drop_fragments)
    if steps.arrange_width:
        image = arrange.arrange(image, steps.arrange_width, steps.arrange_order)
    image = grade.grade(image, steps.saturation, steps.brightness, steps.contrast, steps.tint, steps.tint_amount)
    if steps.sharpen != 1.0:
        image = grade.sharpen(image, steps.sharpen)
    if steps.tile_width:
        widths = range(steps.tile_width, (steps.tile_width_max or steps.tile_width) + 1)
        image = resample.binarize_alpha(tiling.make_tileable(image, widths, steps.tile_mode, steps.tile_overlap, steps.tile_on_edges))
        notes.append(f"tiled to {image.width}px, seam error {tiling.seam_error(image):.0f}")
    if steps.outline:
        image = outline.add_outline(image, steps.outline_color)
    palette: List[RGB] = []
    if steps.palette is not None:
        palette = load_palette(steps.palette)
    elif steps.colors:
        palette = quantize.adaptive_palette(image, steps.colors)
    if palette:
        image = quantize.map_to_palette(image, palette, steps.dither, steps.dither_strength)
    if steps.despeckle:
        image = quantize.despeckle(image)
    if steps.pad:
        image = _pad(image, steps.pad, steps.anchor)
    if steps.canvas_height and steps.canvas_height != image.height:
        image = _pad(image, (image.width, steps.canvas_height), steps.anchor)
    return Result(image, quantize.used_colors(image), notes)


def _snap_source_alpha(image: Image.Image, threshold: int) -> Image.Image:
    # Generators sometimes return their own transparency with a soft glow; a
    # glow has no place in pixel art, so anything below the threshold goes.
    alpha = image.getchannel("A")
    if alpha.getextrema() == (255, 255):
        return image
    image = image.copy()
    image.putalpha(alpha.point(lambda a: 255 if a >= threshold else 0))
    return image


def _pad(image: Image.Image, size: Tuple[int, int], anchor: str) -> Image.Image:
    """Place ``image`` on a transparent canvas (bottom-centre by default)."""
    w, h = size
    if image.width > w or image.height > h:
        raise ValueError(f"image {image.size} does not fit pad {size}")
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (w - image.width) // 2
    y = h - image.height if anchor == "bottom" else (h - image.height) // 2 if anchor == "center" else 0
    canvas.paste(image, (x, y))
    return canvas
