"""The three Unhappy Customer concepts, by id, and the key poses each is drawn in."""
from __future__ import annotations

from types import ModuleType
from typing import Dict

from . import on_the_phone_concept, one_star, the_receipt

# By the ids the game's catalogue knows them by (art/looks/terraria/customer-concepts/concepts.ts), in its order.
CONCEPTS: Dict[str, ModuleType] = {
    'on-the-phone': on_the_phone_concept,
    'the-receipt': the_receipt,
    'one-star': one_star,
}

# The two ends of a customer, named after the customer animations they will open (docs/LOOKS.md): shouting,
# and won over.
KEY_POSES = ('shout', 'happy')
