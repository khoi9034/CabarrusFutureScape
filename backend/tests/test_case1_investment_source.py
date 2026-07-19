from app.routers import investment_router
from app.services.investment_screening_service import candidate_detail


def test_case1_investment_source_uses_cloud_safe_tables() -> None:
    sql = investment_router._DB_INVESTMENT_ROWS_SQL.lower()

    for table in (
        "parcels_enriched",
        "parcel_development_screening_output",
        "parcel_wsacc_utility_features",
        "investment_parcel_environmental_context",
        "parcel_zoning_overlay_v2",
        "parcel_transportation_accessibility_features",
        "development_activity_parcel_summary",
    ):
        assert table in sql


def test_case1_investment_source_does_not_select_restricted_fields() -> None:
    sql = investment_router._DB_INVESTMENT_ROWS_SQL.lower()

    for term in (
        "acctname",
        "mailaddr",
        "legaldesc",
        "grantor",
        "grantee",
        "raw_score",
        "prediction_probability",
        "exact_probability",
        "nearest_sewer_pipe_id",
        "wsacc_notes",
    ):
        assert term not in sql


def test_case1_required_large_parcel_can_render_investment_detail() -> None:
    detail = candidate_detail(
        [
            {
                "parcel_id": "CFS-PARCEL-0149758869",
                "acreage": 489.43,
                "land_opportunity_class": "Large-acreage development-land review candidate",
                "development_readiness_band": "Strong infrastructure readiness signal",
                "growth_pressure_band": "Elevated permit pressure",
                "economic_opportunity_band": "Opportunity signal present",
                "sewer_proxy_class": "Adjacent to sewer infrastructure",
                "utility_readiness_proxy_class": "Strong sewer-proximity signal",
                "zoning_support_band": "Zoning overlay available",
                "transportation_access_band": "Road-proximity evidence available",
                "overall_environmental_constraint_band": "Moderate Mapped Constraint",
                "wetland_context_band": "Mapped Wetland Review Needed",
                "terrain_context_band": "Moderate Terrain",
                "soil_limitation_band": "Material Soil Review Need",
                "usable_area_screening_proxy": "Moderate Usable-Area Limitations",
                "value_per_acre_band": "Moderate assessed value-per-acre context",
                "data_confidence": "High",
            }
        ],
        "CFS-PARCEL-0149758869",
        strategy="development_land",
    )

    assert detail["candidate_band"] != "Insufficient Information"
    assert detail["safe_display_fields"]["sewer_proxy_class"] == "Adjacent to sewer infrastructure"
    assert "raw_score" not in detail
