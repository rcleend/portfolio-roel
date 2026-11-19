"""What the looks' generators share when they compare a fresh build with the checkout (their --check modes).

The game's art is committed as code: `pnpm build:art` turns every PNG under src/game into a `<name>.art.ts`
module holding the same pixels and removes the PNG (docs/ARCHITECTURE.md > Art in code). The JSON beside a sheet
stays a file. So a checkout has no PNG to compare with until `pnpm build:art --export src/game` writes them back,
and those are another encoder's files: a PNG is compared by its pixels, anything else byte for byte.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Iterable, Union

from PIL import Image

EXPORT_HINT = (
    "The art's PNGs are not on disk: the game's art is committed as *.art.ts modules. Run "
    "`pnpm build:art --export src/game` to write them back, check again, and run `pnpm build:art` when done "
    "(tools/art/README.md)."
)


def _rgba(source: Union[Path, bytes]) -> Image.Image:
    with Image.open(io.BytesIO(source) if isinstance(source, bytes) else source) as image:
        return image.convert("RGBA")


def same(committed: Path, fresh: Union[Path, bytes]) -> bool:
    """Whether the file in the checkout is what the generator writes: a PNG pixel for pixel, the rest byte for byte."""
    if not committed.exists():
        return False
    if committed.suffix != ".png":
        return committed.read_bytes() == (fresh if isinstance(fresh, bytes) else fresh.read_bytes())
    a, b = _rgba(committed), _rgba(fresh)
    return a.size == b.size and a.tobytes() == b.tobytes()


def exported(paths: Iterable[Path]) -> bool:
    """Whether any of these files' PNGs is on disk, i.e. the art has been exported to check or to edit."""
    return any(path.suffix == ".png" and path.exists() for path in paths)
