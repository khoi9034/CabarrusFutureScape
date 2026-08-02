from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class QualityRule:
    rule_id: str
    required_fields: tuple[str, ...]
    severity: str = "error"


DOMAIN_RULES = {
    "parcels": QualityRule("parcels.required_identity", ("official_parcel_id",)),
    "permits": QualityRule("permits.required_identity", ("permit_id", "activity_date")),
    "development": QualityRule("development.required_identity", ("permit_id",)),
    "flood": QualityRule("flood.required_zone", ("zone", "geometry")),
    "schools": QualityRule("schools.required_source", ("school_name", "source_confidence")),
    "economics": QualityRule("economics.required_provenance", ("provenance",)),
    "wsacc": QualityRule("wsacc.required_limitations", ("source", "limitations")),
    "investments": QualityRule("investments.required_source", ("source_name", "status")),
}


def evaluate_domain_rows(domain: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rule = DOMAIN_RULES.get(domain.lower())
    if rule is None:
        return [
            {
                "rule_id": f"{domain}.registered_rule",
                "severity": "warning",
                "status": "not_configured",
                "metric_name": "row_count",
                "expected_value": "domain rule registered",
                "actual_value": str(len(rows)),
                "details": {"fake_values_created": False},
            }
        ]
    missing = sum(
        1
        for row in rows
        if any(row.get(field) in (None, "") for field in rule.required_fields)
    )
    return [
        {
            "rule_id": rule.rule_id,
            "severity": rule.severity,
            "status": "passed" if missing == 0 else "failed",
            "metric_name": "rows_missing_required_fields",
            "expected_value": "0",
            "actual_value": str(missing),
            "details": {
                "required_fields": list(rule.required_fields),
                "row_count": len(rows),
                "fake_values_created": False,
            },
        }
    ]
