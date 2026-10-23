#!/usr/bin/env python3
"""Turn one generated painting into native-resolution pixel art.

Examples:
  # Opaque sky: crop to 4:3, area-downsample to 320x240, 24 colours, 4x4 Bayer.
  pixelate.py sky.png -o sky.png --crop 85,0,1451,1024 --size 320x240 \\
      --colors 24 --dither bayer4

  # Transparent skyline on #FF00FF, 512 wide, desaturated, 20 colours.
  pixelate.py far.png -o far.png --key magenta --width 512 \\
      --saturation 0.8 --colors 20

  # Tileable 480 px strip, cut where two columns already match.
  pixelate.py mid.png -o mid.png --key magenta --width 520 --tile 480 --tile-mode cut

  # Prop scaled into an exact sprite box, outlined, on a supplied palette.
  pixelate.py car.png -o car.png --key magenta --trim --width 92 --pad 96x48 \\
      --outline --palette level-palette.json

Steps always run in the order documented in arttools/pipeline.py.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Sequence, Tuple

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from arttools.color import MAGENTA, RGB, parse_hex, to_hex  # noqa: E402
from arttools.pipeline import Steps, run  # noqa: E402


def _ints(text: str, count: int, sep: str = ",") -> Tuple[int, ...]:
    parts = [int(p) for p in text.lower().replace("x", sep).split(sep)]
    if len(parts) != count:
        raise argparse.ArgumentTypeError(f"expected {count} integers, got {text!r}")
    return tuple(parts)


def _color(text: str) -> RGB:
    return MAGENTA if text == "magenta" else parse_hex(text)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", type=Path)
    p.add_argument("-o", "--out", type=Path, required=True)
    g = p.add_argument_group("geometry")
    g.add_argument("--crop", type=lambda t: _ints(t, 4), help="left,top,right,bottom in source pixels")
    g.add_argument("--trim", action="store_true", help="crop to the opaque bounding box after keying")
    g.add_argument("--size", type=lambda t: _ints(t, 2), help="exact native WxH")
    g.add_argument("--width", type=int, help="native width (keeps aspect)")
    g.add_argument("--height", type=int, help="native height (keeps aspect)")
    g.add_argument("--factor", type=float, help="downsample divisor, e.g. 4")
    g.add_argument("--then-nearest", type=lambda t: _ints(t, 2), help="extra nearest-neighbour resize to WxH")
    g.add_argument("--pad", type=lambda t: _ints(t, 2), help="place result on a transparent WxH canvas")
    g.add_argument("--anchor", choices=["bottom", "center", "top"], default="bottom")
    k = p.add_argument_group("transparency")
    k.add_argument("--key", type=_color, help="chroma key colour: 'magenta' or #rrggbb")
    k.add_argument("--key-tolerance", type=float, default=90.0)
    k.add_argument("--key-fringe", type=int, default=3, help="source-pixel passes that eat tinted fringes")
    k.add_argument("--source-alpha-threshold", type=int, default=128)
    k.add_argument("--drop-fragments", type=int, default=0, help="remove disconnected bits smaller than N pixels")
    c = p.add_argument_group("colour")
    c.add_argument("--saturation", type=float, default=1.0)
    c.add_argument("--brightness", type=float, default=1.0)
    c.add_argument("--contrast", type=float, default=1.0)
    c.add_argument("--tint", type=_color)
    c.add_argument("--tint-amount", type=float, default=0.0)
    c.add_argument("--sharpen", type=float, default=1.0)
    c.add_argument("--colors", type=int, help="adaptive palette size")
    c.add_argument("--palette", type=Path, help="fixed palette (.json/.hex/.gpl/image)")
    c.add_argument("--dither", choices=["bayer2", "bayer4"])
    c.add_argument("--dither-strength", type=float, default=24.0)
    c.add_argument("--despeckle", action="store_true")
    c.add_argument("--outline", action="store_true", help="darken the silhouette edge")
    c.add_argument("--outline-color", type=_color)
    t = p.add_argument_group("tiling")
    t.add_argument("--arrange", type=int, help="re-space separate objects evenly across this width")
    t.add_argument("--arrange-order", type=lambda t: tuple(int(v) for v in t.split(",")), help="object indices to keep, in order")
    t.add_argument("--tile", type=int, help="make a horizontally repeating strip of this width")
    t.add_argument("--tile-max", type=int, help="also consider widths up to this; the best-rhyming one wins")
    t.add_argument("--tile-mode", choices=["cut", "blend", "mirror"], default="cut")
    t.add_argument("--tile-overlap", type=int, default=16)
    t.add_argument("--tile-on-edges", action="store_true", help="cut only at strong vertical edges (between buildings)")
    p.add_argument("--print-palette", action="store_true")
    return p


def steps_from_args(args: argparse.Namespace) -> Steps:
    values: Dict[str, Any] = {
        "crop": args.crop,
        "trim": args.trim,
        "source_alpha_threshold": args.source_alpha_threshold,
        "key": args.key,
        "key_tolerance": args.key_tolerance,
        "key_fringe": args.key_fringe,
        "width": args.size[0] if args.size else args.width,
        "height": args.size[1] if args.size else args.height,
        "factor": args.factor,
        "then_nearest": args.then_nearest,
        "saturation": args.saturation,
        "brightness": args.brightness,
        "contrast": args.contrast,
        "tint": args.tint,
        "tint_amount": args.tint_amount,
        "sharpen": args.sharpen,
        "arrange_width": args.arrange,
        "arrange_order": args.arrange_order,
        "tile_width": args.tile,
        "tile_width_max": args.tile_max,
        "tile_mode": args.tile_mode,
        "tile_overlap": args.tile_overlap,
        "tile_on_edges": args.tile_on_edges,
        "drop_fragments": args.drop_fragments,
        "outline": args.outline,
        "outline_color": args.outline_color,
        "colors": args.colors,
        "palette": args.palette,
        "dither": args.dither,
        "dither_strength": args.dither_strength,
        "despeckle": args.despeckle,
        "pad": args.pad,
        "anchor": args.anchor,
    }
    return Steps(**values)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    with Image.open(args.source) as source:
        result = run(source, steps_from_args(args))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    result.image.save(args.out, optimize=True)
    print(f"{args.out}: {result.image.width}x{result.image.height}, {len(result.palette)} colours")
    for note in result.notes:
        print(f"  {note}")
    if args.print_palette:
        print(" ".join(to_hex(c) for c in result.palette))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
