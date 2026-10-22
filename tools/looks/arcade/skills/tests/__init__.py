"""Tests for the arcade skill art.

Run from the repo root:
``python3 -m unittest discover -s tools/looks/arcade/skills -t tools/looks/arcade/skills``.
The generator's own folder goes on the import path first, as ``build.py`` does, so tests import
``pixkit``, ``skillart`` and ``build`` exactly as the tool does.
"""

from __future__ import annotations

import sys
from pathlib import Path

SKILLS_TOOL = Path(__file__).resolve().parent.parent
if str(SKILLS_TOOL) not in sys.path:
    sys.path.insert(0, str(SKILLS_TOOL))
