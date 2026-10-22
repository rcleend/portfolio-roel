"""The arcade look's colours: one hue-shifted ramp per material.

Every ramp runs highlight -> light -> mid -> shadow, plus `line`: the colour an
outline takes where the material meets another part inside the silhouette.
Highlights lean warm and shadows lean cool, the way SNK's artists painted
light. The light comes from the top left; `RIM` is the cool TV glow from the
right, used sparingly on edges.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

RGBA = Tuple[int, int, int, int]

# The near-black silhouette outline every sprite of the look shares.
OUTLINE = "#150e1c"
WHITE = "#ffffff"
RIM = "#9fb4ff"
# Rim tones per dark material: the TV glow tinted by the cloth it lands on.
RIM_HOODIE = "#606a96"
RIM_BLAZER = "#6c7fc0"
RIM_SLACKS = "#56638f"
RIM_SWEATER = "#8c93b3"
RIM_JEANS = "#7d97d6"


def rgba(color: str) -> RGBA:
    value = color.lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Expected #rrggbb, got {color!r}")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), 255)


@dataclass(frozen=True)
class Ramp:
    """Four cel tones of one material plus its inner-line colour."""

    hi: str
    light: str
    mid: str
    shadow: str
    line: str

    def tones(self) -> Tuple[str, str, str, str]:
        return (self.hi, self.light, self.mid, self.shadow)


# ── Roel ────────────────────────────────────────────────────────────────────

SKIN = Ramp(hi="#ffe2c6", light="#f5bf9b", mid="#df9877", shadow="#b0675e", line="#6b3139")
# Ash blonde: light brown with sun-bleached highlights, never yellow.
HAIR = Ramp(hi="#e8dcc0", light="#c2a986", mid="#917a5f", shadow="#5a4a3c", line="#33281f")
CAP = Ramp(hi="#9a9aa4", light="#73737f", mid="#53535f", shadow="#383844", line="#1d1c25")

GLASSES_RIM = "#1b1520"
GLASSES_LOW = "#867884"
LENS = "#fbe3d4"
EYE = "#2a2236"
TEETH = "#fffaf0"
MOUTH = "#5c1d2c"
TONGUE = "#c84f5c"

# ── Hackerman ───────────────────────────────────────────────────────────────

HOODIE = Ramp(hi="#666384", light="#45425c", mid="#2e2c3f", shadow="#1f1d2c", line="#0d0b14")
# The near sleeve sits one step closer to the light, so it reads against the chest it crosses.
HOODIE_NEAR = Ramp(hi="#8481a6", light="#5c5979", mid="#3f3c55", shadow="#2a2839", line="#0d0b14")
JEANS = Ramp(hi="#7590cc", light="#5068a6", mid="#37497f", shadow="#25305a", line="#121731")
SNEAKER_WHITE = Ramp(hi="#ffffff", light="#e6eaf0", mid="#b9c1ce", shadow="#7f8799", line="#3a3f52")
TERMINAL_GREEN = "#3dff86"
TERMINAL_GREEN_DARK = "#14a659"

KEYBOARD_CASE = Ramp(hi="#5d5f73", light="#3f4153", mid="#2b2c3a", shadow="#1c1c27", line="#0b0b12")
KEYCAP = Ramp(hi="#f4f6fb", light="#cfd4df", mid="#a3aabb", shadow="#6f7689", line="#2e3140")
KEY_ACCENT = "#ff8a3d"

# ── Artsy ───────────────────────────────────────────────────────────────────

SWEATER = Ramp(hi="#b9b8c0", light="#8a8992", mid="#4c4b55", shadow="#2c2b33", line="#121117")
TROUSERS_BROWN = Ramp(hi="#9f7c5d", light="#7b5b43", mid="#5a4131", shadow="#3d2b22", line="#1f1511")
SNEAKER_DARK = Ramp(hi="#8d8e9c", light="#5e5f6d", mid="#41424f", shadow="#2b2b36", line="#121219")

STRAT_BODY = Ramp(hi="#fffbec", light="#f5eacb", mid="#dccaa0", shadow="#ad9a73", line="#4d4234")
PICKGUARD = Ramp(hi="#d9f2e4", light="#a9dcc2", mid="#82bca1", shadow="#5e937c", line="#3f5648")
ROSEWOOD = "#43291f"
ROSEWOOD_DARK = "#2a1813"
MAPLE = Ramp(hi="#f6dba4", light="#e2b878", mid="#c08f51", shadow="#8c6235", line="#47301b")
CHROME = Ramp(hi="#ffffff", light="#d9dee7", mid="#9aa3b4", shadow="#636b7e", line="#2c303c")

# ── Strategy ────────────────────────────────────────────────────────────────

SHIRT_WHITE = Ramp(hi="#ffffff", light="#eef0f6", mid="#c9cfde", shadow="#959db6", line="#3b4057")
BLAZER = Ramp(hi="#5d6ea2", light="#3f4d7c", mid="#2d385d", shadow="#1f2742", line="#0d1122")
SLACKS = Ramp(hi="#5b6177", light="#3f4459", mid="#2c3043", shadow="#1d202f", line="#0c0d16")
LEATHER = Ramp(hi="#d99a5e", light="#a8693a", mid="#7c4a29", shadow="#53301c", line="#25140c")
BELT = "#3a2416"
BUCKLE = "#e9c66a"
STICKY = Ramp(hi="#fff7a8", light="#ffe45a", mid="#f2bf2e", shadow="#c48a1c", line="#5e3d0d")

# ── The Unhappy Customer ────────────────────────────────────────────────────

FURIOUS_SKIN = Ramp(hi="#ffb39a", light="#f4806a", mid="#d9534f", shadow="#a12f3f", line="#5a1526")
CALM_SKIN = Ramp(hi="#ffe6cf", light="#f6c7a3", mid="#e0a07e", shadow="#b46f60", line="#6b3139")
GREY_HAIR = Ramp(hi="#ffffff", light="#d9dae3", mid="#a9abbb", shadow="#767a8f", line="#3a3d4f")
CUSTOMER_SHIRT = Ramp(hi="#e9f4ff", light="#b9d6f2", mid="#86a9d2", shadow="#5a77a6", line="#26334f")
TIE = Ramp(hi="#ff8bd0", light="#e2468e", mid="#a92766", shadow="#6d1745", line="#33081f")
KHAKI = Ramp(hi="#d8c59a", light="#b39c70", mid="#8c7552", shadow="#5f4c37", line="#2c2219")
LOAFER = Ramp(hi="#a8765a", light="#7c4e36", mid="#5a3423", shadow="#3a2016", line="#1a0d08")
PHONE = Ramp(hi="#8cf2ff", light="#41b8e6", mid="#2b3b55", shadow="#1a2234", line="#0a0f1a")

SHARED_KEYS: Dict[str, str] = {
    "O": OUTLINE,
}
