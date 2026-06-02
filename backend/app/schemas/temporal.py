from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

TemporalMode = Literal[
    "single_year",
    "month",
    "date_range",
    "rolling_12",
    "rolling_36",
    "year_over_year",
]


class TemporalQuery(BaseModel):
    mode: TemporalMode = "date_range"
    year: int | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    start_date: date | None = None
    end_date: date | None = None
    permit_type: str | None = None
    work_type: str | None = None
    zoning_jurisdiction: str | None = None
    zoning_code: str | None = None
    activity_class: str | None = None
    permit_status: str | None = None

