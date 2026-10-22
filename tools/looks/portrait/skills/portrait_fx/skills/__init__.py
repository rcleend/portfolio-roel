"""One module per skill. Each exposes `strips()`: every Strip that skill ships, the icon first."""

from __future__ import annotations

from types import ModuleType
from typing import Dict

from . import agent_summon, churn_shield, full_stack_attack, north_star, power_chord, ux_elixir

#: Skill id (src/content) -> the module that draws it.
SKILLS: Dict[str, ModuleType] = {
    "full-stack-attack": full_stack_attack,
    "agent-summon": agent_summon,
    "ux-elixir": ux_elixir,
    "power-chord": power_chord,
    "north-star": north_star,
    "churn-shield": churn_shield,
}
