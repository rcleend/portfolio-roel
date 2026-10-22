"""One module per skill; each exposes ``sheets()`` (icon first, then effect strips)."""

from __future__ import annotations

from types import ModuleType
from typing import Dict

from . import agent_summon, churn_shield, full_stack_attack, north_star, power_chord, ux_elixir

SKILLS: Dict[str, ModuleType] = {
    "full-stack-attack": full_stack_attack,
    "agent-summon": agent_summon,
    "ux-elixir": ux_elixir,
    "power-chord": power_chord,
    "north-star": north_star,
    "churn-shield": churn_shield,
}
