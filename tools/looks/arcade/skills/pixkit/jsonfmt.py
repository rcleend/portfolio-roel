"""JSON text laid out exactly the way the repo's Biome formatter lays it out.

The generated sheet manifests are committed and linted, so they must already
be in Biome's canonical shape: objects and arrays stay on one line while they
fit in 120 columns, an array of several multi-key objects always breaks one
object per line, a broken number array fills its lines, and anything else
that is too long breaks one item per line.
"""

from __future__ import annotations

import json
from typing import Any, List

LINE_WIDTH = 120
INDENT = "  "


def dumps(value: Any) -> str:
    """Formats a manifest; the top-level object is always expanded, like a hand-written file."""
    if not isinstance(value, dict):
        raise TypeError("a manifest is a JSON object")
    return _expanded_object(value, 0) + "\n"


def _inline(value: Any) -> str:
    if isinstance(value, dict):
        if not value:
            return "{}"
        return "{ " + ", ".join(f"{json.dumps(k)}: {_inline(v)}" for k, v in value.items()) + " }"
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_inline(item) for item in value) + "]"
    return json.dumps(value)


def _must_break(value: Any) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) > 1
        and all(isinstance(item, dict) and len(item) > 1 for item in value)
    )


def _value(value: Any, level: int, head: str, tail: str) -> str:
    """``value`` as it appears after ``head`` (e.g. a key) on a line indented ``level`` deep."""
    inline = _inline(value)
    fits = len(INDENT * level) + len(head) + len(inline) + len(tail) <= LINE_WIDTH
    if isinstance(value, dict):
        return inline if fits else _expanded_object(value, level)
    if isinstance(value, (list, tuple)):
        if fits and not _must_break(value):
            return inline
        return _expanded_array(value, level)
    return inline


def _expanded_object(value: dict, level: int) -> str:
    inner = INDENT * (level + 1)
    items = list(value.items())
    lines: List[str] = []
    for index, (key, item) in enumerate(items):
        tail = "," if index < len(items) - 1 else ""
        head = f"{json.dumps(key)}: "
        lines.append(f"{inner}{head}{_value(item, level + 1, head, tail)}{tail}")
    return "{\n" + "\n".join(lines) + "\n" + INDENT * level + "}"


def _expanded_array(value: Any, level: int) -> str:
    inner = INDENT * (level + 1)
    if value and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value):
        return "[\n" + "\n".join(_filled(value, inner)) + "\n" + INDENT * level + "]"
    lines = []
    for index, item in enumerate(value):
        tail = "," if index < len(value) - 1 else ""
        lines.append(f"{inner}{_value(item, level + 1, '', tail)}{tail}")
    return "[\n" + "\n".join(lines) + "\n" + INDENT * level + "]"


def _filled(numbers: Any, inner: str) -> List[str]:
    lines: List[str] = []
    current = ""
    for index, number in enumerate(numbers):
        token = json.dumps(number) + ("," if index < len(numbers) - 1 else "")
        candidate = f"{current} {token}" if current else token
        if current and len(inner) + len(candidate) > LINE_WIDTH:
            lines.append(inner + current)
            current = token
        else:
            current = candidate
    lines.append(inner + current)
    return lines
