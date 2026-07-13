"""Small connector primitives.

Connectors are deliberately boring: they fetch public aggregate data for
controlled refresh jobs and never log credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ConnectorResult:
    rows: list[dict[str, Any]]
    source: str
    dataset: str
    year: int
    geography_type: str
    missing_variables: list[str] = field(default_factory=list)

