"""Shared test setup: make ``arttools`` and ``drawn`` importable."""

from __future__ import annotations

import sys
from pathlib import Path

ART_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ART_ROOT.parent.parent
if str(ART_ROOT) not in sys.path:
    sys.path.insert(0, str(ART_ROOT))
