"""Enterprise-style export payloads for CFS Economics."""

from __future__ import annotations

from typing import Any

PLANNING_DIMENSIONS = [
    "Geography",
    "Parcel",
    "Jurisdiction",
    "Land Use / Zoning",
    "Time",
    "Scenario",
    "Constraint Domain",
]

PLANNING_MEASURES = [
    "Assessed Value",
    "Land Value",
    "Improvement Value",
    "Value per Acre",
    "Estimated County Tax",
    "Tax-Base Lift Band",
    "Revenue per Acre Band",
    "Public Cost Risk Band",
    "Data Confidence",
]


def build_enterprise_export_payload(
    economics: dict[str, Any],
    *,
    mode: str | None = None,
) -> dict[str, Any]:
    summary = _dict(economics.get("summary"))
    kpis = [_dict(row) for row in economics.get("kpis") or []]
    signals = [_dict(row) for row in economics.get("signals") or []]
    watchlist = [_dict(row) for row in economics.get("watchlist") or []]
    scenarios = [_dict(row) for row in economics.get("scenario_templates") or []]
    readiness = [_dict(row) for row in economics.get("data_readiness") or []]
    output_mode = mode or str(economics.get("mode") or summary.get("source_mode") or "live")

    return {
        "as_of": economics.get("as_of") or summary.get("as_of"),
        "caveats": [
            "Connector-ready export only; no external platform account is connected.",
            "CFS Economics is screening-level context, not a formal appraisal or tax bill.",
            "Facts and dimensions exclude contact fields and credential fields.",
        ],
        "exports": {
            "power_bi": {
                "dimensions": {
                    "domain_readiness": _readiness_dimension(readiness),
                    "geography": _geography_dimension(signals),
                    "time": _time_dimension(economics.get("as_of") or summary.get("as_of")),
                },
                "kpi_fact": _kpi_fact(kpis),
                "scenario_fact": _scenario_fact(scenarios),
                "signal_fact": _signal_fact(signals),
                "watchlist_fact": _signal_fact(watchlist),
            },
            "planning_model": {
                "cells": _planning_cells(summary, scenarios),
                "dimensions": _planning_dimensions(signals, scenarios, readiness),
                "measures": PLANNING_MEASURES,
                "scenarios": [row.get("title") for row in scenarios if row.get("title")],
            },
            "decision_pack": {
                "assumptions": [
                    "Scenario values depend on local assumptions.",
                    "Utility, school, and transportation burden can be incomplete.",
                    "Opportunity classes are review bands, not recommendations.",
                ],
                "caveats": economics.get("caveats") or [],
                "evidence_pack": _decision_evidence(kpis, watchlist, readiness),
                "executive_takeaway": "CFS Economics connects parcel value, growth pressure, constraints, and service burden into a screening-level decision pack.",
                "recommended_next_diligence": [
                    "Verify parcel value and acreage fields.",
                    "Compare opportunity bands with floodplain, school, utility, and transportation context.",
                    "Document scenario assumptions before using tax-base lift bands.",
                ],
                "risk_flags": _risk_flags(readiness, watchlist),
            },
        },
        "mode": output_mode,
    }


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _kpi_fact(kpis: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "kpi_id": row.get("id"),
            "label": row.get("label"),
            "status_band": row.get("status_band"),
            "unit": row.get("unit"),
            "value": row.get("value"),
        }
        for row in kpis
    ]


def _signal_fact(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "economic_status_band": row.get("economic_status_band"),
            "estimated_county_tax": row.get("estimated_county_tax"),
            "geography_label": row.get("geography_label"),
            "opportunity_class": row.get("opportunity_class"),
            "parcel_id": row.get("parcel_id"),
            "recommended_followup": row.get("recommended_followup"),
            "value_per_acre": row.get("value_per_acre"),
        }
        for row in signals
    ]


def _scenario_fact(scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "data_confidence": row.get("data_confidence"),
            "scenario_id": row.get("id"),
            "title": row.get("title"),
            "what_it_tests": row.get("what_it_tests"),
        }
        for row in scenarios
    ]


def _readiness_dimension(readiness: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "current_use": row.get("current_use"),
            "data_status": row.get("data_status"),
            "domain": row.get("domain"),
            "gap_or_next_need": row.get("gap_or_next_need"),
        }
        for row in readiness
    ]


def _geography_dimension(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    labels = sorted(
        {
            str(row.get("geography_label"))
            for row in signals
            if row.get("geography_label")
        }
    )
    return [{"geography_label": label} for label in labels[:50]]


def _time_dimension(as_of: Any) -> list[dict[str, Any]]:
    return [{"as_of": as_of, "period_type": "extract"}]


def _planning_dimensions(
    signals: list[dict[str, Any]],
    scenarios: list[dict[str, Any]],
    readiness: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {"name": "Geography", "members": [row["geography_label"] for row in _geography_dimension(signals)]},
        {"name": "Parcel", "members": [row.get("parcel_id") for row in signals[:50] if row.get("parcel_id")]},
        {"name": "Jurisdiction", "members": ["Data needed"]},
        {"name": "Land Use / Zoning", "members": ["Data needed"]},
        {"name": "Time", "members": ["Current extract"]},
        {"name": "Scenario", "members": [row.get("title") for row in scenarios if row.get("title")]},
        {"name": "Constraint Domain", "members": [row.get("domain") for row in readiness if row.get("domain")]},
    ]


def _planning_cells(
    summary: dict[str, Any],
    scenarios: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    scenario_names = [row.get("title") for row in scenarios if row.get("title")] or ["Current Conditions"]
    return [
        {
            "measure": "Assessed Value",
            "scenario": scenario_names[0],
            "value": summary.get("total_assessed_value"),
        },
        {
            "measure": "Value per Acre",
            "scenario": scenario_names[0],
            "value": summary.get("median_value_per_acre"),
        },
        {
            "measure": "Data Confidence",
            "scenario": scenario_names[0],
            "value": "screening",
        },
    ]


def _decision_evidence(
    kpis: list[dict[str, Any]],
    watchlist: list[dict[str, Any]],
    readiness: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {"section": "kpis", "items": _kpi_fact(kpis)},
        {"section": "watchlist", "items": _signal_fact(watchlist[:10])},
        {"section": "data_readiness", "items": _readiness_dimension(readiness)},
    ]


def _risk_flags(
    readiness: list[dict[str, Any]],
    watchlist: list[dict[str, Any]],
) -> list[str]:
    flags = [
        f"{row.get('domain')}: {row.get('gap_or_next_need')}"
        for row in readiness
        if row.get("data_status") != "available"
    ]
    if any(row.get("economic_status_band") == "infrastructure_constrained" for row in watchlist):
        flags.append("Infrastructure-constrained opportunity appears in the watchlist.")
    return flags or ["No elevated export risk flags in the current summary."]
