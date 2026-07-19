from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


CaseStudyStatus = Literal[
    "Draft",
    "Screening",
    "Candidate Review",
    "Deep Analysis",
    "Underwriting",
    "Recommendation Review",
    "Final",
    "Archived",
]


def reject_case_study_sensitive_text(value: Any) -> Any:
    text = str(value or "").lower()
    blocked = (
        "mailing",
        "grantor",
        "grantee",
        "api_key",
        "database_url",
        "connection string",
        "access token",
        "password",
    )
    if any(term in text for term in blocked) or "owner name" in text:
        raise ValueError("Do not enter restricted identity or credential information.")
    return value


class InvestmentCaseStudyPatch(BaseModel):
    active_parcel_id: str | None = Field(default=None, max_length=80)
    analyst_note: str | None = Field(default=None, max_length=4000)
    current_stage: str | None = Field(default=None, max_length=180)
    status: CaseStudyStatus | None = None

    _safe_text = field_validator("analyst_note", "current_stage", mode="before")(reject_case_study_sensitive_text)
