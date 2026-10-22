"""Hue-shifted material ramps for the hibit cast.

Every material is a short ramp from its outline colour to its highlight. Shadows lean
cool (towards violet/blue), lights lean warm (towards yellow), and each ramp carries a
`rim` tone for the cool TV glow that catches right-facing edges. Ramps share colours
where they can (outlines, greys, the maple neck and the hair) so a sheet stays within a
few dozen colours.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class Ramp:
    name: str
    #: Dark to light. tones[0] is the outline colour; the rest are shading bands.
    tones: Tuple[str, ...]
    #: Brightness (0..1) at which each band from tones[1] upwards starts.
    thresholds: Tuple[float, ...]
    #: Cool rim light on right-facing silhouette edges (the TV glow); None disables it.
    rim: Optional[str] = None
    #: Outline used where the silhouette faces the key light (top-left); defaults to tones[1].
    lit_outline: Optional[str] = None
    #: Brightness above which a glossy highlight (the last tone) appears; None = matte.
    gloss: Optional[float] = None

    def tone(self, brightness: float, offset: int = 0) -> str:
        index = 1
        for i, threshold in enumerate(self.thresholds):
            if brightness >= threshold:
                index = i + 1
        index = max(1, min(len(self.tones) - 1, index + offset))
        return self.tones[index]

    @property
    def outline(self) -> str:
        return self.tones[0]

    @property
    def outline_lit(self) -> str:
        return self.lit_outline or self.tones[1]


# Shared outline/near-black so dark materials don't each need their own.
INK = "#160f1c"
INK_WARM = "#2a1416"

# Shared families, so a sheet stays within a few dozen colours: each hero's materials
# borrow tones from these instead of each carrying its own near-duplicates.
_HOODIE = (INK, "#1e1a2a", "#2c2840", "#403a58", "#5a5476")
_CHARCOAL = (INK, "#1c1a22", "#2a2832", "#3a3844", "#4c4a58")
_ASH = ("#2a2434", "#5c5a64", "#7e7c88", "#a4a2ac", "#c8c6ce")
_GREYS = ("#2a2434", "#8c8aa0", "#c4c4d4", "#ececf4", "#ffffff")
_GREEN = ("#0e4a2a", "#1f9a58", "#3dff8a", "#9dffc4")
_NAVY = ("#0c0e1a", "#1a1e32", "#262c48", "#343c60", "#48527a")
_LEATHER = ("#1c0e0a", "#3e1e14", "#5e2e1c", "#844428", "#c08060")
_BROWN = ("#1a100e", "#33221c", "#4a3228", "#634636", "#7e5c46")

RAMPS: Dict[str, Ramp] = {
    # Light skin with a warm pinkish tone; shadows towards rose, lights towards peach.
    "skin": Ramp("skin", ("#5a2a2e", "#a65a56", "#d8876f", "#efb08e", "#fcd3b0"), (0.0, 0.34, 0.55, 0.80),
                 rim="#b07c86", lit_outline="#8a4446"),
    # Black hoodie: violet-black shadows, slate lights so folds stay readable at night.
    "hoodie": Ramp("hoodie", _HOODIE, (0.0, 0.40, 0.62, 0.86), rim="#3a4466", lit_outline="#2a2438"),
    # Ribbed cuffs and hem: the same yarn, a band darker.
    "hoodie_rib": Ramp("hoodie_rib", _HOODIE, (0.0, 0.55, 0.80, 0.97), rim="#3a4466"),
    "jeans": Ramp("jeans", ("#0e1220", "#1c2640", "#2a3a5e", "#3c5280", "#566fa0"), (0.0, 0.38, 0.60, 0.84),
                  rim="#3e5482"),
    "sneaker": Ramp("sneaker", ("#2a2434", "#8c8aa0", "#c4c4d4", "#ececf4", "#ffffff"), (0.0, 0.36, 0.58, 0.84),
                    rim="#c4c4d4"),
    "sole": Ramp("sole", ("#2a2434", "#5a5476", "#8c8aa0", "#c4c4d4"), (0.0, 0.45, 0.75)),
    "string": Ramp("string", _GREYS[:4], (0.0, 0.45, 0.75)),
    "neon": Ramp("neon", _GREEN, (0.0, 0.40, 0.70)),
    # Washed charcoal: the cap, the tie-dye knit's dark yarn, dark sneakers and the strap.
    "cap": Ramp("cap", _CHARCOAL, (0.0, 0.38, 0.60, 0.84), rim="#3a4462"),
    "knit_dark": Ramp("knit_dark", _CHARCOAL, (0.0, 0.40, 0.62, 0.86), rim="#3a4462"),
    "knit_light": Ramp("knit_light", _ASH, (0.0, 0.40, 0.62, 0.86), rim="#7e7c88"),
    "trousers_brown": Ramp("trousers_brown", _BROWN, (0.0, 0.38, 0.60, 0.84), rim="#4c4a58"),
    "shoe_dark": Ramp("shoe_dark", _CHARCOAL[:4] + ("#a4a2ac",), (0.0, 0.40, 0.65, 0.93), rim="#3a4462", gloss=0.93),
    "strap": Ramp("strap", _CHARCOAL[:4], (0.0, 0.45, 0.75), rim="#3a4462"),
    # A crisp white shirt: blue-violet shadows, warm white light.
    "shirt": Ramp("shirt", ("#3a3a5a", "#9a9cc0", "#c4c8e0", "#e6e8f4", "#ffffff"), (0.0, 0.34, 0.56, 0.80),
                  rim="#c4c8e0"),
    # Navy blazer and matching trousers.
    "blazer": Ramp("blazer", _NAVY, (0.0, 0.40, 0.62, 0.86), rim="#3a4c78"),
    "trousers_dark": Ramp("trousers_dark", _NAVY, (0.0, 0.42, 0.66, 0.90), rim="#3a4c78"),
    "leather": Ramp("leather", _LEATHER, (0.0, 0.40, 0.66, 0.93), rim="#5e2e1c", gloss=0.93),
    "belt": Ramp("belt", _LEATHER[:4], (0.0, 0.45, 0.75)),
    # The Unhappy Customer: a short-sleeved pale-blue dress shirt, a loud tie, khakis.
    "shirt_blue": Ramp("shirt_blue", ("#2e3a5a", "#6a86b4", "#8eacd6", "#b6cfee", "#e2eefc"), (0.0, 0.34, 0.56, 0.80),
                       rim="#b6cfee"),
    "tie": Ramp("tie", ("#4a1018", "#9a2a30", "#e0563e", "#ffb24a"), (0.0, 0.40, 0.70)),
    "khaki": Ramp("khaki", ("#3a2a1a", "#7a6448", "#a48a62", "#c8b084", "#e6d4a8"), (0.0, 0.38, 0.60, 0.84),
                  rim="#a48a62"),
}


def ramp(name: str) -> Ramp:
    return RAMPS[name]
