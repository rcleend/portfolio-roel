#!/usr/bin/env python3
"""Rebuild a level's art from its recipe.

  build.py luna                    # all layers, props and the tileset
  build.py scripe --only mid,near  # just some generated layers
  build.py luna --sources ~/art    # where the raw generated PNGs live
                                   # (default: $ARCADE_ART_SOURCES or ../.arcade-art-sources)

Raw 1536 px generations are not committed (they are large and only inputs);
``recipes/<level>.json`` records exactly how each was cropped, graded and
quantised, and ``prompts/<level>.md`` how each was generated, so any layer can
be re-rolled and rebuilt. Programmatic art (tiles, small props) is drawn by
``drawn/<level>.py`` and needs no sources.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from arttools.color import parse_hex, to_hex  # noqa: E402
from arttools.pipeline import Steps, run  # noqa: E402
from drawn.tileset import TILE, tile_positions  # noqa: E402

REPO = HERE.parent.parent
# Raw generations live next to the checkout, never inside it.
DEFAULT_SOURCES = Path(os.environ.get("ARCADE_ART_SOURCES", str(REPO.parent / ".arcade-art-sources")))
NATIVE_SIZE = (320, 240)
GROUND_Y = 200


def art_dir(level_id: str) -> Path:
    return REPO / "src" / "game" / "levels" / level_id / "art"


def load_recipe(level_id: str) -> Dict[str, Any]:
    return json.loads((HERE / "recipes" / f"{level_id}.json").read_text())


def compose_sources(entries: Sequence[Mapping[str, Any]], source_dir: Path) -> Image.Image:
    """Load each source (optionally cropped) and join them left to right.

    Joining at source resolution lets a strip be longer than one generation:
    an image and its outpainted continuation become one painting before any
    downsampling, so their seam is processed like any other column.
    """
    parts: List[Image.Image] = []
    for entry in entries:
        with Image.open(source_dir / entry["file"]) as raw:
            image = raw.convert("RGBA")
        if "crop" in entry:
            image = image.crop(tuple(entry["crop"]))
        parts.append(image)
    height = parts[0].height
    if any(p.height != height for p in parts):
        raise ValueError("joined sources must share a height; crop them to match")
    joined = Image.new("RGBA", (sum(p.width for p in parts), height))
    x = 0
    for part in parts:
        joined.paste(part, (x, 0))
        x += part.width
    return joined


def process(entry: Mapping[str, Any], source_dir: Path) -> Image.Image:
    source = compose_sources(entry["sources"], source_dir)
    result = run(source, Steps.from_mapping(entry.get("steps", {}), HERE))
    for note in result.notes:
        print(f"    {note}")
    return result.image


def build(level_id: str, source_dir: Path, only: Optional[set]) -> None:
    recipe = load_recipe(level_id)
    drawn = importlib.import_module(f"drawn.{level_id}")
    out = art_dir(level_id)
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "layers.json"

    layers: List[Dict[str, Any]] = []
    for entry in recipe["layers"]:
        layer_id = entry["id"]
        file_name = f"{layer_id}.png"
        if only is None or layer_id in only:
            print(f"  layer {layer_id}")
            image = process(entry, source_dir)
            image.save(out / file_name, optimize=True)
        else:
            with Image.open(out / file_name) as existing:
                image = existing.copy()
        y = entry["y"] if "y" in entry else entry["bottom"] - image.height
        layers.append(
            {
                "id": layer_id,
                "file": file_name,
                "factor": entry["factor"],
                "y": y,
                "width": image.width,
                "height": image.height,
                "repeatX": entry["repeatX"],
                "opaque": entry.get("opaque", False),
                "foreground": entry.get("foreground", False),
            }
        )

    props: Dict[str, Dict[str, Any]] = {}
    for name, entry in recipe["props"].items():
        file_name = entry["file"]
        if "drawn" in entry:
            image = getattr(drawn, entry["drawn"])()
            if only is None or name in only:
                image.save(out / file_name, optimize=True)
        elif only is None or name in only:
            print(f"  prop {name}")
            image = process(entry, source_dir)
            image.save(out / file_name, optimize=True)
        else:
            with Image.open(out / file_name) as existing:
                image = existing.copy()
        frames = entry.get("frames", 1)
        if image.width % frames:
            raise ValueError(f"{name}: width {image.width} is not divisible into {frames} frames")
        props[name] = {"file": file_name, "w": image.width // frames, "h": image.height, "frames": frames}

    tileset = drawn.tileset()
    tileset.save(out / "tileset.png", optimize=True)

    manifest = {
        "levelId": level_id,
        "nativeSize": list(NATIVE_SIZE),
        "groundY": GROUND_Y,
        "layers": layers,
        "tileset": {
            "file": "tileset.png",
            "tileSize": TILE,
            "tiles": {name: [col, row] for name, (col, row) in tile_positions().items()},
        },
        "props": props,
        "palette": sorted({to_hex(parse_hex(v)) for v in drawn.PALETTE.values()}),
    }
    manifest_path.write_text(dump_json(manifest))
    print(f"  wrote {manifest_path.relative_to(REPO)}")


def dump_json(data: Any) -> str:
    """Two-space JSON with short scalar arrays kept on one line ([3, 1])."""
    text = json.dumps(data, indent=2)
    text = re.sub(r"\[\s*([^\[\]{}]*?)\s*\]", lambda m: "[" + ", ".join(v.strip() for v in m.group(1).split(",")) + "]" if len(m.group(0)) < 400 and "\n" in m.group(0) and m.group(1).count(",") < 6 else m.group(0), text)
    return text + "\n"


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("levels", nargs="+")
    parser.add_argument("--sources", type=Path, default=DEFAULT_SOURCES)
    parser.add_argument("--only", help="comma-separated layer or prop ids")
    args = parser.parse_args(argv)
    only = set(args.only.split(",")) if args.only else None
    for level_id in args.levels:
        print(level_id)
        build(level_id, args.sources, only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
