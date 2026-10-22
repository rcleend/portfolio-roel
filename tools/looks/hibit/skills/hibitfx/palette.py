"""The hibit skills palette: one hue-shifted ramp per material.

Every ramp runs dark to light over six tones. Shadows lean towards blue and
violet, highlights towards warm yellow-white, which is what makes hi-bit
pixel art glow without a single blended pixel. Tone 0 doubles as the
material's coloured outline and tone 1 as its outline where the edge catches
the key light (top-left): outlines lighten on lit edges.

Shared rules for all six skills:
- Key light from the top-left; a cool cyan rim (``RIM``) from the right, the
  television's glow.
- Effects are stepped bands from a white core out to a dark keyline (tone 0),
  so they read on Berlin's night and on San Francisco's golden hour alike.
- ``INK`` is the one near-black, used where an effect must cut out from
  anything behind it.
"""

from __future__ import annotations

from typing import Dict, List, Sequence

INK = "#0d0a1a"
WHITE = "#ffffff"
RIM = "#a8f6ff"


class Ramp:
    """Six tones, dark to light; ``ramp[0]`` is the outline, ``ramp[5]`` the hottest highlight."""

    def __init__(self, name: str, tones: Sequence[str]) -> None:
        if len(tones) != 6:
            raise ValueError(f"ramp {name} needs 6 tones")
        self.name = name
        self.tones: List[str] = list(tones)

    def __getitem__(self, index: int) -> str:
        return self.tones[index]

    def __iter__(self):
        return iter(self.tones)

    @property
    def outline(self) -> str:
        return self.tones[0]

    @property
    def lit_outline(self) -> str:
        return self.tones[1]


# FULL-STACK ATTACK: front-end, back-end, database.
CYAN = Ramp("cyan", ["#0f1f4a", "#14497c", "#1b86b8", "#34c4e8", "#86f2ff", "#dcfdff"])
VIOLET = Ramp("violet", ["#1d1142", "#3c2484", "#653fc6", "#9670f2", "#c8acff", "#f0e6ff"])
AMBER = Ramp("amber", ["#3b1208", "#7c2e0c", "#c66414", "#f4a226", "#ffd65c", "#fff4bc"])

# AGENT SUMMON: pearl chassis, dark visor, cyan optics, amber status light.
PEARL = Ramp("pearl", ["#1b1d3a", "#464c72", "#7c84aa", "#b6bcd6", "#e4e8f4", "#ffffff"])
VISOR = Ramp("visor", ["#07091a", "#0d1230", "#172048", "#24346a", "#33508e", "#4a74b4"])

# UX ELIXIR: magenta potion, pale glass, cork; calm pastels.
POTION = Ramp("potion", ["#37082f", "#701556", "#b22684", "#ea47a0", "#ff8ac4", "#ffd8ee"])
GLASS = Ramp("glass", ["#1b2647", "#47618c", "#8bb0d2", "#c6e2f4", "#e9f7ff", "#ffffff"])
CORK = Ramp("cork", ["#3a1c10", "#6e3c20", "#a86c40", "#d49e66", "#f0c894", "#fff0d4"])
CALM = Ramp("calm", ["#2c1a4c", "#5a3c8c", "#9a78d0", "#d0a8f0", "#ffd0f0", "#fff4fc"])
MINT = Ramp("mint", ["#0c3a3a", "#167060", "#2eae8a", "#68e0b0", "#b4f8d8", "#eefff8"])

# POWER CHORD: the Olympic White Strat, rosewood and maple, chrome; violet sound.
STRAT = Ramp("strat", ["#2b2740", "#6f6a86", "#aca6bc", "#ddd6c6", "#f3eee0", "#fffdf6"])
GUARD = Ramp("guard", ["#22403c", "#4e8478", "#86baa8", "#bce0d0", "#e0f6ec", "#f8fffc"])
ROSEWOOD = Ramp("rosewood", ["#1c0c08", "#3a1c12", "#5a2e1c", "#7a4228", "#9a5a36", "#bc7a4c"])
MAPLE = Ramp("maple", ["#3c1e0c", "#7a4a20", "#b47c3c", "#dcaa62", "#f2d08e", "#fff0c4"])
CHROME = Ramp("chrome", ["#202638", "#545e78", "#8c96ae", "#bcc6d8", "#e6ecf6", "#ffffff"])
SOUND = Ramp("sound", ["#1a0f3e", "#3a2490", "#6a4ad8", "#a690ff", "#d8ccff", "#ffffff"])

# NORTH STAR: gold, hotter than any other effect on screen.
GOLD = Ramp("gold", ["#4a1608", "#9a3a0c", "#e07418", "#ffae2a", "#ffe066", "#fffad0"])
NIGHT = Ramp("night", ["#0c0e2a", "#16205a", "#22388e", "#3c5cc0", "#6c90e8", "#b0ccff"])

# CHURN SHIELD: teal bubble with an iridescent film, a retention heart.
BUBBLE = Ramp("bubble", ["#0b2840", "#125876", "#2499bc", "#58d6ee", "#b6f6ff", "#ffffff"])
HEART = Ramp("heart", ["#4a0822", "#9e1638", "#e2304e", "#ff6a80", "#ffb6c4", "#fff0f2"])
FILM = ["#ff92cc", "#c8a4ff", "#90ffcc", "#fff2a0"]  # pink, lilac, mint, butter: soap-film iridescence

RAMPS: Dict[str, Ramp] = {
    r.name: r
    for r in (CYAN, VIOLET, AMBER, PEARL, VISOR, POTION, GLASS, CORK, CALM, MINT, STRAT, GUARD, ROSEWOOD, MAPLE, CHROME, SOUND, GOLD, NIGHT, BUBBLE, HEART)
}


def ramp_of(color: str) -> Ramp:
    """The ramp a colour belongs to (first match)."""
    for ramp in RAMPS.values():
        if color in ramp.tones:
            return ramp
    raise KeyError(color)
