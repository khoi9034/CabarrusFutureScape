"""Enterprise-style export payloads for CFS Economics."""

from __future__ import annotations

import csv
from datetime import datetime
from io import StringIO
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

POWERBI_CSV_TABLES = {
    "economics_kpi_fact": {
        "description": "Economics KPI fact table.",
        "fields": ["kpi_id", "kpi_name", "value", "unit", "status_band", "source_mode", "as_of"],
        "primary_use": "KPI cards",
        "suggested_visual": "Executive Economic Dashboard KPI cards",
    },
    "parcel_economic_signal_fact": {
        "description": "Parcel and area economic signal fact table.",
        "fields": [
            "signal_id",
            "parcel_id",
            "geography_label",
            "opportunity_class",
            "value_per_acre_band",
            "improvement_to_land_ratio_band",
            "tax_base_opportunity_band",
            "constraint_burden_band",
            "data_confidence",
            "recommended_followup",
        ],
        "primary_use": "Parcel/site screening",
        "suggested_visual": "Opportunity class bars and underbuilt watchlist",
    },
    "scenario_output_fact": {
        "description": "Scenario output fact table.",
        "fields": [
            "scenario_id",
            "scenario_name",
            "intensity_band",
            "value_assumption_band",
            "tax_base_lift_band",
            "revenue_per_acre_band",
            "service_burden_band",
            "infrastructure_burden_band",
            "fiscal_attractiveness_band",
            "data_confidence",
        ],
        "primary_use": "Scenario planning model",
        "suggested_visual": "Scenario comparison matrix",
    },
    "domain_readiness_dim": {
        "description": "Data readiness dimension table.",
        "fields": ["domain_id", "domain_name", "data_status", "geometry_status", "temporal_status", "current_use", "next_data_need"],
        "primary_use": "Data confidence register",
        "suggested_visual": "Domain readiness matrix",
    },
    "geography_dim": {
        "description": "Geography lookup dimension table.",
        "fields": ["geography_id", "geography_label", "geography_type", "jurisdiction"],
        "primary_use": "Geography slicers",
        "suggested_visual": "Geography slicer",
    },
    "time_dim": {
        "description": "Current extract time dimension table.",
        "fields": ["year", "period_label", "data_available"],
        "primary_use": "Extract freshness context",
        "suggested_visual": "Data availability label",
    },
    "scenario_dim": {
        "description": "Scenario lookup dimension table.",
        "fields": ["scenario_id", "scenario_name", "scenario_family", "description", "caveat"],
        "primary_use": "Scenario slicers",
        "suggested_visual": "Scenario slicer",
    },
}

POWERBI_CSV_IMPORT_ORDER = list(POWERBI_CSV_TABLES)


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
    scenario_inputs = [_dict(row) for row in economics.get("scenario_inputs") or []]
    scenario_outputs = [_dict(row) for row in economics.get("scenario_outputs") or []]
    readiness = [_dict(row) for row in economics.get("data_readiness") or []]
    output_mode = mode or str(economics.get("mode") or summary.get("source_mode") or "live")
    scenario_facts = _scenario_fact(scenario_outputs or scenarios)

    return {
        "as_of": economics.get("as_of") or summary.get("as_of"),
        "caveats": [
            "Connector-ready export only; no external platform account is connected.",
            "CFS Economics is screening-level context, not a formal appraisal or tax bill.",
            "Facts and dimensions exclude contact fields and credential fields.",
        ],
        "decision_pack_template": _decision_pack_template(),
        "exports": {
            "power_bi": {
                "dimensions": {
                    "domain_readiness": _readiness_dimension(readiness),
                    "geography": _geography_dimension(signals),
                    "time": _time_dimension(economics.get("as_of") or summary.get("as_of")),
                },
                "kpi_fact": _kpi_fact(kpis),
                "scenario_fact": scenario_facts,
                "signal_fact": _signal_fact(signals),
                "watchlist_fact": _signal_fact(watchlist),
            },
            "planning_model": {
                "cells": _planning_cells(summary, scenario_outputs or scenarios),
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
        "planning_model_dimensions": PLANNING_DIMENSIONS,
        "planning_model_measures": PLANNING_MEASURES,
        "scenario_assumptions": scenario_inputs,
        "scenario_output_bands": scenario_facts,
        "scenario_templates": scenarios,
    }


def build_powerbi_export_payload(
    economics: dict[str, Any],
    *,
    mode: str | None = None,
) -> dict[str, Any]:
    summary = _dict(economics.get("summary"))
    kpis = [_dict(row) for row in economics.get("kpis") or []]
    signals = [_dict(row) for row in economics.get("signals") or economics.get("parcel_economic_signals") or []]
    scenarios = [_dict(row) for row in economics.get("scenario_templates") or []]
    scenario_outputs = [_dict(row) for row in economics.get("scenario_outputs") or []]
    readiness = [_dict(row) for row in economics.get("data_readiness") or []]
    as_of = economics.get("as_of") or summary.get("as_of")
    output_mode = mode or str(economics.get("mode") or summary.get("source_mode") or "live")

    geography_rows = _powerbi_geography_dim(signals)
    scenario_rows = _powerbi_scenario_dim(scenarios)
    return {
        "as_of": as_of,
        "caveats": [
            "Power BI Desktop practice export only; no embedded report or external credential is connected.",
            "CFS Economics is screening-level context, not a formal appraisal or billing determination.",
            "Tables exclude contact fields, credential fields, model internals, and probability-style outputs.",
        ],
        "mode": output_mode,
        "relationships": [
            {
                "from_column": "scenario_id",
                "from_table": "scenario_output_fact",
                "to_column": "scenario_id",
                "to_table": "scenario_dim",
            },
            {
                "from_column": "geography_label",
                "from_table": "parcel_economic_signal_fact",
                "to_column": "geography_label",
                "to_table": "geography_dim",
            },
        ],
        "report_builder_guide": _powerbi_report_builder_guide(),
        "suggested_visuals": _powerbi_suggested_visuals(),
        "tables": {
            "domain_readiness_dim": _powerbi_readiness_dim(readiness),
            "economics_kpi_fact": _powerbi_kpi_fact(kpis, output_mode, as_of),
            "geography_dim": geography_rows,
            "parcel_economic_signal_fact": _powerbi_signal_fact(signals),
            "scenario_dim": scenario_rows,
            "scenario_output_fact": _powerbi_scenario_fact(scenario_outputs or scenarios),
            "time_dim": _powerbi_time_dim(as_of),
        },
    }


def build_powerbi_csv_manifest(powerbi_payload: dict[str, Any]) -> dict[str, Any]:
    tables = _dict(powerbi_payload.get("tables"))
    return {
        "recommended_import_order": POWERBI_CSV_IMPORT_ORDER,
        "relationships": powerbi_payload.get("relationships") or [],
        "tables": [
            {
                "description": details["description"],
                "download_url": f"/economics/powerbi-export/csv/{table_name}",
                "primary_use": details["primary_use"],
                "row_count": len(tables.get(table_name) or []),
                "suggested_visual": details["suggested_visual"],
                "table_name": table_name,
            }
            for table_name, details in POWERBI_CSV_TABLES.items()
        ],
    }


def powerbi_table_to_csv(powerbi_payload: dict[str, Any], table_name: str) -> str:
    if table_name not in POWERBI_CSV_TABLES:
        raise KeyError(table_name)
    fields = POWERBI_CSV_TABLES[table_name]["fields"]
    rows = _dict(powerbi_payload.get("tables")).get(table_name) or []
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({field: _csv_value(_dict(row).get(field)) for field in fields})
    return output.getvalue()


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, str)):
        return value
    return str(value)


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
            "economic_data_confidence": row.get("economic_data_confidence"),
            "economic_status_band": row.get("economic_status_band"),
            "estimated_county_tax": row.get("estimated_county_tax_screening")
            or row.get("estimated_county_tax"),
            "geography_label": row.get("geography_label"),
            "improvement_to_land_ratio": row.get("improvement_to_land_ratio"),
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
            "estimated_tax_base_lift_band": row.get("estimated_tax_base_lift_band"),
            "infrastructure_burden_band": row.get("infrastructure_burden_band"),
            "recommended_next_diligence": row.get("recommended_next_diligence"),
            "revenue_per_acre_band": row.get("revenue_per_acre_band"),
            "scenario_id": row.get("scenario_id") or row.get("id"),
            "service_burden_band": row.get("service_burden_band"),
            "title": row.get("title"),
            "what_it_tests": row.get("what_it_tests") or row.get("recommended_next_diligence"),
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
    cells = [
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
    for row in scenarios:
        title = row.get("title")
        if not title:
            continue
        for measure, key in (
            ("Tax-Base Lift Band", "estimated_tax_base_lift_band"),
            ("Revenue per Acre Band", "revenue_per_acre_band"),
            ("Public Cost Risk Band", "service_burden_band"),
        ):
            if row.get(key):
                cells.append({"measure": measure, "scenario": title, "value": row.get(key)})
    return cells


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


def _decision_pack_template() -> dict[str, Any]:
    return {
        "sections": [
            "Executive takeaway",
            "Economic upside",
            "Public burden / constraint risk",
            "Data confidence",
            "Recommended next diligence",
            "Caveats",
        ],
        "required_caveats": [
            "Screening-level scenario, not a formal fiscal impact study.",
            "Not a formal appraisal or tax bill.",
            "Scenario output depends on assumptions.",
            "Utility, school, transportation, and environmental cost data can be incomplete.",
        ],
    }


def _powerbi_kpi_fact(
    kpis: list[dict[str, Any]],
    mode: str,
    as_of: Any,
) -> list[dict[str, Any]]:
    return [
        {
            "as_of": as_of,
            "kpi_id": row.get("id"),
            "kpi_name": row.get("label"),
            "source_mode": mode,
            "status_band": row.get("status_band"),
            "unit": row.get("unit"),
            "value": row.get("value"),
        }
        for row in kpis
    ]


def _powerbi_signal_fact(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "constraint_burden_band": _constraint_burden_band(row),
            "data_confidence": row.get("economic_data_confidence"),
            "geography_label": row.get("geography_label"),
            "improvement_to_land_ratio_band": _ratio_band(row.get("improvement_to_land_ratio")),
            "opportunity_class": row.get("opportunity_class"),
            "parcel_id": row.get("parcel_id"),
            "recommended_followup": row.get("recommended_followup"),
            "signal_id": row.get("parcel_id") or f"signal-{index + 1}",
            "tax_base_opportunity_band": _tax_base_opportunity_band(row),
            "value_per_acre_band": _value_per_acre_band(row.get("value_per_acre")),
        }
        for index, row in enumerate(signals)
    ]


def _powerbi_scenario_fact(scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "data_confidence": row.get("data_confidence"),
            "fiscal_attractiveness_band": _fiscal_attractiveness_band(row),
            "infrastructure_burden_band": row.get("infrastructure_burden_band"),
            "intensity_band": _scenario_intensity_band(row),
            "revenue_per_acre_band": row.get("revenue_per_acre_band"),
            "scenario_id": row.get("scenario_id") or row.get("id"),
            "scenario_name": row.get("title"),
            "service_burden_band": row.get("service_burden_band"),
            "tax_base_lift_band": row.get("estimated_tax_base_lift_band"),
            "value_assumption_band": _scenario_value_assumption_band(row),
        }
        for row in scenarios
    ]


def _powerbi_readiness_dim(readiness: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "current_use": row.get("current_use"),
            "data_status": row.get("data_status"),
            "domain_id": _slug(row.get("domain")),
            "domain_name": row.get("domain"),
            "geometry_status": "available" if row.get("data_status") == "available" else "data needed",
            "next_data_need": row.get("gap_or_next_need"),
            "temporal_status": "extract" if row.get("data_status") == "available" else "data needed",
        }
        for row in readiness
    ]


def _powerbi_geography_dim(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    labels = sorted({str(row.get("geography_label")) for row in signals if row.get("geography_label")})
    return [
        {
            "geography_id": _slug(label) or f"geography-{index + 1}",
            "geography_label": label,
            "geography_type": "screening area",
            "jurisdiction": None,
        }
        for index, label in enumerate(labels[:50])
    ]


def _powerbi_time_dim(as_of: Any) -> list[dict[str, Any]]:
    year = _year_from_as_of(as_of)
    return [
        {
            "data_available": bool(as_of),
            "period_label": "Current extract",
            "year": year,
        }
    ]


def _powerbi_scenario_dim(scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "caveat": "; ".join(str(item) for item in row.get("caveats") or []),
            "description": row.get("what_it_tests"),
            "scenario_family": _scenario_family(str(row.get("id") or row.get("scenario_id") or "")),
            "scenario_id": row.get("id") or row.get("scenario_id"),
            "scenario_name": row.get("title"),
        }
        for row in scenarios
    ]


def _powerbi_suggested_visuals() -> list[dict[str, Any]]:
    return [
        {
            "page": "Executive Economic Dashboard",
            "visuals": [
                "KPI cards: assessed value coverage, underbuilt candidates, opportunity signals, data confidence",
                "Bar chart: opportunity classes",
                "Table: underbuilt watchlist",
                "Slicer: geography / jurisdiction",
                "Slicer: scenario",
            ],
        },
        {
            "page": "Parcel Investment Screen",
            "visuals": [
                "Parcel table",
                "Value per acre band",
                "Improvement-to-land ratio band",
                "Constraint burden band",
                "Recommended follow-up",
            ],
        },
        {
            "page": "Scenario Planning Model",
            "visuals": [
                "Scenario comparison matrix",
                "Fiscal attractiveness by scenario",
                "Service burden vs tax-base lift",
                "Decision memo text box",
            ],
        },
        {
            "page": "Data Confidence Register",
            "visuals": [
                "Domain readiness matrix",
                "Missing data table",
                "Next data need list",
            ],
        },
    ]


def _powerbi_report_builder_guide() -> dict[str, Any]:
    relationships = [
        {
            "from_column": "scenario_id",
            "from_table": "scenario_output_fact",
            "guidance": "Use this first for Scenario Planning Model slicers and comparison visuals.",
            "to_column": "scenario_id",
            "to_table": "scenario_dim",
        },
        {
            "from_column": "geography_label",
            "from_table": "parcel_economic_signal_fact",
            "guidance": "Use this for geography slicers on parcel/site screening visuals.",
            "to_column": "geography_label",
            "to_table": "geography_dim",
        },
    ]
    return {
        "concepts": [
            {
                "description": "Event or measurement table, such as scenario_output_fact or parcel_economic_signal_fact.",
                "term": "Fact table",
            },
            {
                "description": "Descriptive lookup table, such as scenario_dim or geography_dim.",
                "term": "Dimension table",
            },
            {
                "description": "Connection between matching fields in two tables.",
                "term": "Relationship",
            },
            {"description": "Filter control for report users.", "term": "Slicer"},
            {"description": "Calculated value used by cards, charts, or matrices.", "term": "Measure"},
            {"description": "Pivot-table style visual.", "term": "Matrix"},
            {
                "description": "Reusable dataset, relationship, and measure layer behind a report.",
                "term": "Semantic model",
            },
        ],
        "import_steps": [
            "Beginner path: download the CSV files from CFS Economics -> Enterprise Tools.",
            "Open Power BI Desktop and choose Get Data -> Text/CSV for each fact and dimension table.",
            "Import economics_kpi_fact and parcel_economic_signal_fact first for Page 1.",
            "Import scenario_output_fact and scenario_dim for the Scenario Planning Model page.",
            "Create the two starter relationships listed in this guide.",
            "Build the four report pages with the suggested visuals.",
            "Use the JSON pack later for app-to-app integration or semantic-model automation.",
            "Add caveat text boxes so report viewers understand this is practice/export context.",
        ],
        "pages": [
            {
                "page": "Executive Economic Dashboard",
                "purpose": "High-level leadership view.",
                "visuals": [
                    {
                        "fields": ["kpi_name", "value", "unit", "status_band"],
                        "table": "economics_kpi_fact",
                        "title": "KPI cards",
                    },
                    {
                        "axis": "opportunity_class",
                        "table": "parcel_economic_signal_fact",
                        "title": "Opportunity class bar chart",
                        "value": "Count of signal_id",
                    },
                    {
                        "fields": [
                            "geography_label",
                            "opportunity_class",
                            "value_per_acre_band",
                            "improvement_to_land_ratio_band",
                            "recommended_followup",
                        ],
                        "table": "parcel_economic_signal_fact",
                        "title": "Underbuilt watchlist table",
                    },
                    {
                        "field": "geography_label or jurisdiction",
                        "table": "geography_dim",
                        "title": "Geography slicer",
                    },
                ],
            },
            {
                "page": "Parcel Investment Screen",
                "purpose": "Parcel/site screening.",
                "visuals": [
                    {
                        "fields": [
                            "signal_id",
                            "geography_label",
                            "opportunity_class",
                            "value_per_acre_band",
                            "improvement_to_land_ratio_band",
                            "tax_base_opportunity_band",
                            "constraint_burden_band",
                            "data_confidence",
                        ],
                        "table": "parcel_economic_signal_fact",
                        "title": "Parcel signal table",
                    },
                    {
                        "columns": "data_confidence",
                        "rows": "opportunity_class",
                        "table": "parcel_economic_signal_fact",
                        "title": "Opportunity by confidence matrix",
                        "values": "Count of signal_id",
                    },
                    {
                        "field": "recommended_followup",
                        "table": "parcel_economic_signal_fact",
                        "title": "Recommended follow-up card/table",
                    },
                ],
            },
            {
                "page": "Scenario Planning Model",
                "purpose": "Compare assumptions and scenario outputs.",
                "visuals": [
                    {
                        "fields": [
                            "scenario_name",
                            "intensity_band",
                            "value_assumption_band",
                            "tax_base_lift_band",
                            "revenue_per_acre_band",
                            "service_burden_band",
                            "infrastructure_burden_band",
                            "fiscal_attractiveness_band",
                            "data_confidence",
                        ],
                        "table": "scenario_output_fact",
                        "title": "Scenario comparison table",
                    },
                    {
                        "field": "scenario_name",
                        "table": "scenario_dim",
                        "title": "Scenario slicer",
                    },
                    {
                        "axis": "scenario_name",
                        "table": "scenario_output_fact",
                        "title": "Fiscal attractiveness chart",
                        "value": "Count or categorized display of fiscal_attractiveness_band",
                    },
                ],
            },
            {
                "page": "Data Confidence Register",
                "purpose": "Show what data is strong versus incomplete.",
                "visuals": [
                    {
                        "columns": "data_status, geometry_status, temporal_status",
                        "rows": "domain_name",
                        "table": "domain_readiness_dim",
                        "title": "Domain readiness matrix",
                    },
                    {
                        "fields": ["domain_name", "current_use", "next_data_need"],
                        "table": "domain_readiness_dim",
                        "title": "Next data need table",
                    },
                    {
                        "field": "data_confidence if available",
                        "table": "parcel_economic_signal_fact or scenario_output_fact",
                        "title": "Data confidence slicer",
                    },
                ],
            },
        ],
        "quality_checks": [
            "All 7 tables loaded.",
            "Scenario relationship created.",
            "Geography relationship created.",
            "No owner/mailing fields imported.",
            "No raw scores used.",
            "Report caveats visible.",
            "Slicers do not create misleading blanks.",
        ],
        "relationship_guidance": [
            "Start with the scenario and geography relationships.",
            "Keep remaining tables disconnected at first if needed.",
            "Use slicers carefully because some tables are summary-level rather than parcel-level.",
            "Do not force incorrect relationships just to connect everything.",
        ],
        "relationships": relationships,
        "suggested_measures": [
            {
                "expression": "Total Signals = COUNTROWS(parcel_economic_signal_fact)",
                "name": "Total Signals",
            },
            {
                "expression": 'Underbuilt Candidates = COUNTROWS(FILTER(parcel_economic_signal_fact, parcel_economic_signal_fact[opportunity_class] = "Underbuilt Redevelopment Candidate"))',
                "name": "Underbuilt Candidates",
            },
            {
                "expression": 'Data Needed Signals = COUNTROWS(FILTER(parcel_economic_signal_fact, parcel_economic_signal_fact[data_confidence] = "Data Needed"))',
                "name": "Data Needed Signals",
            },
            {
                "expression": "Scenario Count = COUNTROWS(scenario_output_fact)",
                "name": "Scenario Count",
            },
            {
                "expression": 'Strong Fiscal Scenarios = COUNTROWS(FILTER(scenario_output_fact, scenario_output_fact[fiscal_attractiveness_band] = "Strong"))',
                "name": "Strong Fiscal Scenarios",
            },
        ],
        "measure_caveat": "Field names may need small adjustments after import depending on how Power BI expands the JSON.",
    }


def _value_per_acre_band(value: Any) -> str:
    number = _number(value)
    if number is None:
        return "data_needed"
    if number >= 500_000:
        return "high"
    if number >= 150_000:
        return "moderate"
    return "lower"


def _ratio_band(value: Any) -> str:
    number = _number(value)
    if number is None:
        return "data_needed"
    if number < 0.5:
        return "low"
    if number < 1.5:
        return "moderate"
    return "high"


def _tax_base_opportunity_band(row: dict[str, Any]) -> str:
    status = str(row.get("economic_status_band") or "")
    opportunity = str(row.get("opportunity_class") or "").lower()
    if "data_needed" in status:
        return "data_needed"
    if "tax_base" in status or "opportunity" in opportunity:
        return "elevated_review"
    if "underbuilt" in status or "underbuilt" in opportunity:
        return "review"
    return "monitor"


def _constraint_burden_band(row: dict[str, Any]) -> str:
    text = " ".join(
        str(row.get(key) or "")
        for key in ("economic_status_band", "floodplain_context", "school_pressure_context", "utility_readiness_context", "transportation_context")
    ).lower()
    if "data" in text:
        return "data_needed"
    if "constrained" in text or "review" in text or "flood" in text:
        return "elevated_review"
    return "monitor"


def _fiscal_attractiveness_band(row: dict[str, Any]) -> str:
    lift = str(row.get("estimated_tax_base_lift_band") or "").lower()
    burden = str(row.get("service_burden_band") or row.get("infrastructure_burden_band") or "").lower()
    if "data" in lift or "data" in burden:
        return "data_needed"
    if "elevated" in lift or "higher" in lift:
        return "elevated_review" if "high" in burden else "strong"
    if "moderate" in lift:
        return "moderate"
    return "baseline"


def _scenario_intensity_band(row: dict[str, Any]) -> str:
    scenario_id = str(row.get("scenario_id") or row.get("id") or "").lower()
    if "current" in scenario_id:
        return "low"
    if "density" in scenario_id or "mixed" in scenario_id:
        return "high"
    if "industrial" in scenario_id or "investment" in scenario_id:
        return "medium"
    return "medium"


def _scenario_value_assumption_band(row: dict[str, Any]) -> str:
    revenue = str(row.get("revenue_per_acre_band") or "").lower()
    if "high" in revenue or "higher" in revenue:
        return "high"
    if "data" in revenue:
        return "data_needed"
    if "lower" in revenue:
        return "low"
    return "medium"


def _scenario_family(scenario_id: str) -> str:
    if "industrial" in scenario_id:
        return "employment"
    if "mixed" in scenario_id or "commercial" in scenario_id:
        return "corridor"
    if "infrastructure" in scenario_id or "investment" in scenario_id:
        return "infrastructure"
    if "residential" in scenario_id or "growth" in scenario_id:
        return "growth"
    return "baseline"


def _slug(value: Any) -> str:
    text = str(value or "").strip().lower()
    return "-".join(part for part in "".join(char if char.isalnum() else " " for char in text).split() if part)


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _year_from_as_of(as_of: Any) -> int | None:
    if not as_of:
        return None
    try:
        return datetime.fromisoformat(str(as_of).replace("Z", "+00:00")).year
    except ValueError:
        return None
