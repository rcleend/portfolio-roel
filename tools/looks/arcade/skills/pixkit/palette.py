"""The arcade skill palette: one shared ink and light, one energy ramp per skill.

Every ramp runs deep -> dark -> mid -> light -> pale and is hue-shifted the
Neo Geo way: shadows lean cool and violet, highlights lean warm, so even a
four-tone cluster reads as lit rather than merely darker or lighter. Energy
(beams, rings, flashes) always resolves to the shared white core; solid
objects (drone, potion, star, notes) carry the shared near-black ink rim.
"""

from __future__ import annotations

from typing import NamedTuple

INK = "#120e24"
WHITE = "#ffffff"


class Ramp(NamedTuple):
    deep: str
    dark: str
    mid: str
    light: str
    pale: str


#: FULL-STACK ATTACK's front-end layer and every AI/agent light (drone eyes, drone shots).
CYAN = Ramp("#1b1f5e", "#1d5fb8", "#22a8f0", "#6fe8ff", "#d4fff8")
#: FULL-STACK ATTACK's back-end layer.
VIOLET = Ramp("#2a0f4f", "#6123a8", "#a24ee8", "#d79bff", "#f7ddff")
#: FULL-STACK ATTACK's database layer and the NORTH STAR.
GOLD = Ramp("#5a1f0a", "#b5470c", "#f08c14", "#ffd23a", "#fff6b8")
#: UX ELIXIR.
PINK = Ramp("#4a0c3c", "#a3156a", "#e8379a", "#ff86c8", "#ffd9ef")
#: CHURN SHIELD's bubble.
TEAL = Ramp("#0c2f4a", "#12769a", "#2fc4d8", "#8ff4ec", "#e2fff8")
#: POWER CHORD's sound.
LAVENDER = Ramp("#2a1f6a", "#5a48c8", "#a99cf0", "#dcd4ff", "#f4f0ff")
#: Retention hearts.
HEART = Ramp("#4a0a24", "#a8163e", "#f03a5c", "#ff8aa2", "#ffd6de")

#: The drone's white shell.
SHELL = Ramp("#262a4a", "#5e6688", "#a4adc8", "#e2e8f6", "#ffffff")
#: Glass: the potion bottle.
GLASS = Ramp("#25305c", "#4f73a8", "#8fbfe6", "#d2f0ff", "#ffffff")
#: Cork and natural wood.
WOOD = Ramp("#3a1e10", "#7a4422", "#b8763c", "#e2ac6a", "#f6d6a0")
#: Metal Slug fire: dark red rim to white-hot core.
FIRE = Ramp("#5c0d0a", "#c02a10", "#f2701a", "#ffc23a", "#fff59a")
#: Smoke puffs, cool and violet so they sit in both levels' night and dusk.
SMOKE = Ramp("#2e2638", "#574b60", "#8d8094", "#c4bac8", "#ece6ee")
#: Chrome hardware.
CHROME = Ramp("#2c3048", "#4e5470", "#9aa4bc", "#d6dcea", "#f6f8ff")

#: The Olympic White Stratocaster (refs/room-stratocaster-olympic-white.png).
STRAT_BODY = Ramp("#5c4a34", "#b0975f", "#dcc58f", "#f3e5bf", "#fff8e6")
#: Mint pickguard: shadow edge, fill, lit fill. Cooler than the cream body so its shape reads at 1x.
STRAT_GUARD = ("#7fa592", "#bfe2cf", "#e9fbf1")
ROSEWOOD = ("#2a140c", "#4a2616")
MAPLE = ("#7a4a1e", "#c48a3e", "#f0c27a")
