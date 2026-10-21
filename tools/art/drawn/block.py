"""The career-highlight "?" block, shared by every level so it reads as the
same collectible everywhere."""

from __future__ import annotations

from arttools.canvas import Canvas

from .glyphs import QUESTION_6X8

BLOCK_PALETTE = {
    "blk_ink": "#2a1408",
    "blk_hi": "#fff4b0",
    "blk_lit": "#ffd84a",
    "blk": "#f0a820",
    "blk_dk": "#b86a14",
    "blk_deep": "#6e3410",
    "blk_glint": "#ffffff",
    "used_hi": "#c89a6a",
    "used": "#94643e",
    "used_dk": "#5e3a24",
}


def _frame(c: Canvas, hi: str, body: str, dark: str) -> None:
    c.rect(1, 1, 14, 14, body)
    c.hline(1, 14, 0, "blk_ink")
    c.hline(1, 14, 15, "blk_ink")
    c.vline(0, 1, 14, "blk_ink")
    c.vline(15, 1, 14, "blk_ink")
    c.hline(1, 14, 1, hi)
    c.vline(1, 1, 14, hi)
    c.hline(2, 14, 14, dark)
    c.vline(14, 2, 14, dark)
    for x, y in ((3, 3), (12, 3), (3, 12), (12, 12)):
        c.set(x, y, dark)
        c.set(x - 1, y - 1, hi)


def highlight(c: Canvas) -> None:
    _frame(c, "blk_hi", "blk", "blk_dk")
    # A lit upper half gives the block the banded, bevelled read of Neo Geo UI.
    c.rect(2, 2, 12, 5, "blk_lit")
    c.sprite(6, 5, QUESTION_6X8, {"#": "blk_deep"})
    c.sprite(5, 4, QUESTION_6X8, {"#": "blk_hi"})


def highlight_shine(c: Canvas) -> None:
    highlight(c)
    # A diagonal glint sweeping across the face; alternated with ``highlight``
    # every few frames it makes the block twinkle without changing its shape.
    for i in range(4):
        c.set(9 + i, 2 + i, "blk_glint")
        c.set(10 + i, 2 + i, "blk_hi")
    c.sprite(5, 4, QUESTION_6X8, {"#": "blk_glint"})


def used(c: Canvas) -> None:
    _frame(c, "used_hi", "used", "used_dk")
    c.rect(5, 6, 6, 4, "used_dk")
    c.hline(5, 10, 6, "used_hi")
