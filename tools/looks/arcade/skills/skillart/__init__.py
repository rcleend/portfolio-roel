"""The arcade look of the six skills: one module per skill, each building its icon and effect strips."""

from __future__ import annotations

from typing import Callable, Dict

from pixkit.sheet import Strip

from . import agent_summon, churn_shield, full_stack_attack, north_star, power_chord, ux_elixir

#: skill id -> builder returning {asset name: strip}, e.g. {"icon": ..., "fx-beam": ...}.
SKILLS: Dict[str, Callable[[], Dict[str, Strip]]] = {
    "full-stack-attack": full_stack_attack.build,
    "agent-summon": agent_summon.build,
    "ux-elixir": ux_elixir.build,
    "power-chord": power_chord.build,
    "north-star": north_star.build,
    "churn-shield": churn_shield.build,
}
