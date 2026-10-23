"""Material ramps for the portrait look.

Every pixel of a frame is a (material, tone) pair; colours are resolved only
when a frame is written. Tone 0 is a material's darkest step (its coloured
outline), the last tone its highlight. Ramps are hue-shifted the way the
reference grid is painted: shadows drift cool and violet, highlights warm.

Keeping materials symbolic until the end is what makes the shading passes
work: a contact shadow is "one tone darker", an outline is "tone 0", and the
customer's calm-down is a material swap rather than a repaint.
"""

from __future__ import annotations

from typing import Dict, List, Mapping, Sequence, Tuple

RGB = Tuple[int, int, int]


def hex_to_rgb(value: str) -> RGB:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def rgb_to_hex(rgb: Sequence[int]) -> str:
    return "#%02x%02x%02x" % (rgb[0], rgb[1], rgb[2])


class Ramp:
    """An ordered dark-to-light list of colours for one material."""

    def __init__(self, name: str, colors: Sequence[str]) -> None:
        if len(colors) < 2:
            raise ValueError(f"ramp {name!r} needs at least two tones")
        self.name = name
        self.colors: List[RGB] = [hex_to_rgb(c) for c in colors]

    @property
    def top(self) -> int:
        return len(self.colors) - 1

    def clamp(self, tone: int) -> int:
        return max(0, min(self.top, tone))

    def rgb(self, tone: int) -> RGB:
        return self.colors[self.clamp(tone)]


Palette = Mapping[str, Ramp]


def palette(**ramps: Sequence[str]) -> Dict[str, Ramp]:
    return {name: Ramp(name, colors) for name, colors in ramps.items()}


# ── The captain ─────────────────────────────────────────────────────────────
# Hair: ash / dark blonde, light brown with sun-bleached highlights (CAST.md).
# Skin: light, warm and a little pink; the outline is a deep warm red-brown so
# the face never needs a black line.
ROEL = palette(
    hair=["#362c24", "#5a4a3b", "#84725e", "#a59276", "#c4b291", "#dccdab"],
    skin=["#74403a", "#c07c68", "#e3a68b", "#f3c6ab", "#fde3cf"],
    rim=["#17151d", "#2b2832", "#55515e", "#8d8996"],
    lens=["#7d8aa0", "#b4bfd0", "#dfe6ee", "#ffffff"],
    mouth=["#4a141c", "#8c3a3c", "#c66a62"],
    teeth=["#c8bfb4", "#f2ece2", "#fffdf6"],
    brow=["#7a6248", "#a08866"],
)


# ── Outfits ─────────────────────────────────────────────────────────────────
HACKERMAN = dict(
    ROEL,
    **palette(
        # A black hoodie painted in cool violet-blacks so folds still read.
        hoodie=["#0d0c13", "#1d1c26", "#2c2b38", "#3c3b4b", "#514f63", "#6c6a82"],
        string=["#6e6c7c", "#b9b7c4", "#e6e4ee"],
        tip=["#0f6a3a", "#2fd16e", "#a6ffc8"],
        jeans=["#0d1020", "#1a2036", "#262f4c", "#354165", "#4a5880"],
        sneaker=["#3a3846", "#8e8c9c", "#c9c7d3", "#eeedf4"],
        sole=["#2a2832", "#5a5866"],
        glow=["#4f5a86", "#6e79a8"],
        kbcase=["#0e0e16", "#1c1d29", "#2c2e3d", "#41445a"],
        keycap=["#565a6c", "#8a8ea2", "#c0c4d4", "#eceef6"],
        kbglow=["#0f6a3a", "#2fd16e", "#a6ffc8"],
    ),
)


_KNIT = ["#0d0c11", "#1b1a20", "#29282f", "#393840", "#4d4c54"]

ARTSY = dict(
    ROEL,
    **palette(
        # The washed charcoal cap is the sweater's black, one step lighter.
        cap=_KNIT[1:] + ["#62616c"],
        # Black knit tie-dyed with sage greys and cream (the cap photo's sweater).
        knit=_KNIT,
        dye=["#3c3e3a", "#5e6159", "#868a7e", "#b3b4a4", "#d6d4c2"],
        brown=["#1c120d", "#2f1f16", "#46301f", "#5d412b", "#77563a"],
        sneaker=_KNIT[:4],
        sole=["#c9c6bc", "#e6e3da"],
        glow=["#4f5a86", "#6e79a8"],
        strap=_KNIT[:2],
        cream=["#3e3529", "#a89a7c", "#d2c5a5", "#ebe1c6", "#faf4e2"],
        guard=["#6d8a76", "#b1cbb5", "#d2e5d3"],
        pickup=["#c9c6bc", "#fbfaf4"],
        chrome=["#4e5562", "#9aa3b0", "#e4eaf2"],
        rosewood=["#170e0a", "#2e1c14", "#47301f"],
        maple=["#6e461f", "#a77738", "#cf9f5e", "#e8c487"],
        pearl=["#c9c6bc", "#fbfaf4"],
    ),
)


STRATEGY = dict(
    ROEL,
    **palette(
        blazer=["#0b0e1a", "#161c30", "#212a45", "#2e3a5c", "#435178"],
        shirt=["#5b6175", "#9aa1b6", "#c9cedc", "#e9ecf3", "#ffffff"],
        trousers=["#101116", "#1d1f27", "#2b2e39", "#3b3f4c", "#4f5463"],
        leather=["#22120b", "#43250f", "#683a1a", "#8f5527", "#c08550"],
        sole=["#140b07", "#2a1a10"],
        belt=["#140c08", "#2c1a10"],
        buckle=["#8a8f99", "#d6dbe2"],
        glow=["#4f5a86", "#6e79a8"],
        note=["#7a5410", "#d39b1c", "#f6cf3a", "#ffe873", "#fff6b8"],
        ink=["#3b4a8c", "#5d6fb8"],
    ),
)


# ── The Unhappy Customer ────────────────────────────────────────────────────
_GREY = ["#3c3c46", "#6b6b76", "#9c9ca8", "#c9c9d2", "#ececf2"]
_SOCK = ["#6e6e7a", "#bdbdc8", "#ececf2"]

# One shared set of whites and greys: paper, socks, sneakers and steam are
# the same few tones, which keeps the sheet palette-limited.
_CUSTOMER_COMMON = dict(
    grey=_GREY,
    polo=["#3e2a06", "#7c5810", "#b5851a", "#dcab33", "#f3cf62"],
    khaki=["#352b1b", "#5f5136", "#8a7853", "#ad9a73", "#cdbd96"],
    belt=["#1a1009", "#3a2414"],
    buckle=[_GREY[2], _GREY[3]],
    sock=_SOCK,
    sneaker=[_GREY[0]] + _SOCK,
    sole=[_GREY[0], _GREY[1]],
    phone=["#0c0c12", "#20202a", "#34343f"],
    screen=["#2f6cc4", "#7fbcff", _SOCK[2]],
    paper=_SOCK,
    pink=["#7a2048", "#e0508c", "#ff9ccc"],
    nose=["#5c0f18", "#a3222e", "#d0404a", "#f07a7e"],
    mouth=["#3a0c10", "#7a1e22", "#c05a52"],
    teeth=["#bdb3a8", "#f2ece2"],
    eye=["#1a1014", "#f4efe8"],
    star=["#b06a08", "#ffcc3a", "#fff6c2"],
    steam=[_GREY[2], _SOCK[2], "#f4efe8"],
    glow=["#4f5a86", "#6e79a8"],
)

CUSTOMER = dict(
    palette(
        # Fuming: flushed brick-red skin.
        skin=["#55181a", "#9c3329", "#cb5a43", "#e5806a", "#f6aa8c"],
        **_CUSTOMER_COMMON,
    )
)

CUSTOMER_CALM = dict(
    palette(
        # Won over: back to an ordinary, slightly sunburnt tourist pink.
        skin=["#6a3a30", "#ad6b54", "#d69676", "#eebb98", "#fad9bc"],
        **_CUSTOMER_COMMON,
    )
)
