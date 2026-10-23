"""Hand-placed glyphs small enough to stay legible at native resolution."""

from __future__ import annotations

from typing import Dict, List

# 3x5 digits: the smallest size at which 4 and 9 stay distinct on a CRT.
DIGITS_3X5: Dict[str, List[str]] = {
    "0": ["###", "#.#", "#.#", "#.#", "###"],
    "1": [".#.", "##.", ".#.", ".#.", "###"],
    "2": ["###", "..#", "###", "#..", "###"],
    "3": ["###", "..#", ".##", "..#", "###"],
    "4": ["#.#", "#.#", "###", "..#", "..#"],
    "5": ["###", "#..", "###", "..#", "###"],
    "6": ["###", "#..", "###", "#.#", "###"],
    "7": ["###", "..#", ".#.", ".#.", ".#."],
    "8": ["###", "#.#", "###", "#.#", "###"],
    "9": ["###", "#.#", "###", "..#", "###"],
}

QUESTION_6X8 = [
    ".####.",
    "##..##",
    "....##",
    "...##.",
    "..##..",
    "..##..",
    "......",
    "..##..",
]


def text_rows(text: str, gap: int = 1) -> List[str]:
    """Compose 3x5 digits into sprite rows using ``#`` for ink."""
    rows = ["" for _ in range(5)]
    for i, ch in enumerate(text):
        glyph = DIGITS_3X5[ch]
        for r in range(5):
            rows[r] += glyph[r] + ("." * gap if i < len(text) - 1 else "")
    return rows
