"""The portrait skills palette: one ramp per material, dark to light.

Ramps are hue-shifted the way the reference grid paints: shadows lean cool
and towards violet, highlights lean warm, and mid-tones stay a little muted
so the effects sit in the slightly desaturated portrait look. Only the cores
of light-emitting effects reach near-white.

Light comes from the top-left; a cool rim from the right (the TV's glow) is
allowed, which is why most ramps keep a pale, slightly blue top step.
"""

from __future__ import annotations

from typing import Tuple


class Ramp(Tuple[str, ...]):
    """Colours ordered dark to light; `ramp[0]` is the outline-grade shade."""

    def __new__(cls, *colors: str) -> "Ramp":
        return super().__new__(cls, tuple(c.lower() for c in colors))  # type: ignore[arg-type]

    @property
    def darkest(self) -> str:
        return self[0]

    @property
    def lightest(self) -> str:
        return self[-1]


# ── Shared ────────────────────────────────────────────────────────────────

INK = "#0d0b1a"  # the deepest outline, an indigo near-black
WHITE = "#ffffff"  # specular glints only, never a fill

# ── FULL-STACK ATTACK: front-end / back-end / database ───────────────────

CYAN = Ramp("#0e3442", "#17596e", "#2c93ae", "#62cde2", "#b6f0f6")
VIOLET = Ramp("#221a4a", "#3c2e86", "#6650c0", "#9d8bea", "#d4ccfa")
AMBER = Ramp("#3a1e08", "#76400e", "#bd7a1c", "#eeb444", "#ffe39a")

# ── AGENT SUMMON: porcelain drone, smoked visor, cyan eye ────────────────

SHELL = Ramp("#151a2c", "#3a4058", "#7c829e", "#b9bfd2", "#e7eaf2")
VISOR = Ramp("#0a0f1e", "#18233c", "#2b3d5e")
EYE = Ramp("#17596e", "#2c93ae", "#62cde2", "#b6f0f6", "#effdff")
LED = Ramp("#5a1a22", "#c43c3c", "#ff7a66")

# ── UX ELIXIR: glass flask, rose elixir, cork ────────────────────────────

GLASS = Ramp("#251c3a", "#535c80", "#8f9cc0", "#cad6ee", "#f1f6ff")
ROSE = Ramp("#40102f", "#80205e", "#c23f88", "#ea74ad", "#ffc0dc", "#ffe6f1")
CORK = Ramp("#3e2416", "#7a4e2c", "#b07e4e", "#d8ac78")
LILAC = Ramp("#2a2060", "#4c3c9e", "#8676dc", "#bdb2f6", "#ebe7ff")

# ── POWER CHORD: the Olympic White Strat ─────────────────────────────────

STRAT_BODY = Ramp("#2a2830", "#8a8474", "#c6bfa8", "#e9e3cf", "#fbf8ec")
PICKGUARD = Ramp("#7f9a8e", "#aac4b6", "#d8e8de")
ROSEWOOD = Ramp("#1e110c", "#3d2418", "#5c3826")
MAPLE = Ramp("#5a3412", "#8f5c24", "#c9944e", "#ecc584")
CHROME = Ramp("#4a4f60", "#8a90a2", "#c8cdd8", "#eef1f6")
SOUND = LILAC

# ── NORTH STAR: gold ─────────────────────────────────────────────────────

GOLD = Ramp("#3a2006", "#83500e", "#cf8d1e", "#f4c44a", "#ffe895", "#fff8dc")

# ── CHURN SHIELD: aqua bubble, iridescence, coral heart ──────────────────

AQUA = Ramp("#0b2a33", "#16566a", "#2b93a8", "#68d0de", "#b6f1f5", "#e9fdff")
IRIS = Ramp("#a99aec", "#ec9fcb", "#f2dc9a")  # thin-film accents: lilac, pink, pale gold
CORAL = Ramp("#5c1428", "#b8344f", "#ee6a7e", "#ffb4bc")
