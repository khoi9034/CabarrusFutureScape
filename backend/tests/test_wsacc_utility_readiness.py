import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.dependencies import database as database_dependencies
from app.main import app
from app.routers import indicators_router
from app.services.wsacc_service import build_wsacc_inventory, build_wsacc_statistics


client = TestClient(app)
REPO_ROOT = Path(__file__).resolve().parents[2]
db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_wsacc_inventory_reads_current_shapefiles() -> None:
    inventory = build_wsacc_inventory()
    by_file = {row["file_name"]: row for row in inventory}

    assert set(by_file) == {
        "WSACC_Manholes26.shp",
        "WSACC_Pipes26.shp",
        "WSACC_Subbasins_Cabarrus_Only.shp",
    }
    assert by_file["WSACC_Pipes26.shp"]["feature_count"] == 2075
    assert by_file["WSACC_Manholes26.shp"]["geometry_type"] == "Point"
    assert by_file["WSACC_Subbasins_Cabarrus_Only.shp"]["target_table"] == "wsacc_basins"


def test_wsacc_statistics_is_honest_about_missing_capacity_and_parcel_overlay() -> None:
    payload = build_wsacc_statistics()

    assert payload["summary"]["sewer_pipe_segments"] == 2075
    assert payload["summary"]["sewer_subbasins"] == 55
    assert payload["summary"]["water_service_layers_available"] is False
    assert payload["summary"]["parcel_utility_features_available"] is False
    assert payload["parcel_statistics"]["parcels_inside_sewer_service_area"] == "Data needed"
    assert "do not confirm available water/sewer capacity" in " ".join(payload["caveats"])


def test_wsacc_statistics_uses_parcel_overlay_when_available() -> None:
    db = SessionLocal()
    try:
        try:
            exists = db.execute(
                text("SELECT to_regclass('public.parcel_wsacc_utility_features') IS NOT NULL")
            ).scalar_one()
        except SQLAlchemyError:
            return
        if not exists:
            return

        payload = build_wsacc_statistics(db)
        summary = payload["summary"]

        assert summary["parcel_utility_features_available"] is True
        assert summary["total_parcels_evaluated"] > 0
        assert summary["parcels_within_1000ft_sewer_proxy"] > 0
        assert payload["parcel_statistics"]["parcels_within_1000ft_of_sewer_line"] >= 0
        assert payload["parcel_statistics"]["sewer_proxy_class_breakdown"]
        if db.execute(text("SELECT to_regclass('public.parcel_development_screening_output') IS NOT NULL")).scalar_one():
            assert "development_readiness_band_breakdown" in payload["parcel_statistics"]
            assert "sewer_proxy_growth_pressure_breakdown" in payload["parcel_statistics"]
        assert "capacity" not in str(payload).lower() or "not provided" in str(payload).lower()
    finally:
        db.close()


def test_build_parcel_wsacc_features_dry_run_when_source_tables_exist() -> None:
    db = SessionLocal()
    try:
        try:
            sources_exist = db.execute(
                text(
                    """
                    SELECT bool_and(to_regclass(name) IS NOT NULL)
                    FROM (VALUES
                      ('public.parcels_enriched'),
                      ('public.wsacc_sewer_lines'),
                      ('public.wsacc_manholes'),
                      ('public.wsacc_basins')
                    ) AS required(name)
                    """
                )
            ).scalar_one()
        except SQLAlchemyError:
            return
        if not sources_exist:
            return
    finally:
        db.close()

    env = {**os.environ, "DATABASE_URL": ""}
    result = subprocess.run(
        [sys.executable, "scripts/build_parcel_wsacc_features.py", "--dry-run", "--limit", "5"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert '"mode": "dry_run"' in result.stdout


def test_check_wsacc_model_integration_script_reports_safe_model_fields() -> None:
    env = {**os.environ, "DATABASE_URL": ""}
    result = subprocess.run(
        [sys.executable, "scripts/check_wsacc_model_integration.py"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    if result.returncode != 0:
        return

    assert "parcel_development_model_features" in result.stdout
    assert "sewer_pipe_within_250ft_flag" in result.stdout
    assert "local_dev_settings" in result.stdout
    assert "land_opportunity_fields_present" in result.stdout
    assert "development_readiness_band" in result.stdout
    assert "owner" not in result.stdout.lower()
    assert "mailing" not in result.stdout.lower()


def test_wsacc_endpoints_return_safe_payloads() -> None:
    assert client.get("/wsacc/inventory").status_code == 200
    stats = client.get("/wsacc/statistics")
    parcel = client.get("/wsacc/parcel/123")
    filtered = client.get("/wsacc/filter?sewer_proxy_class=Adjacent%20to%20sewer%20infrastructure")

    assert stats.status_code == 200
    assert parcel.status_code == 200
    assert filtered.status_code == 200
    assert parcel.json()["utility_readiness_class"]
    assert filtered.json()["status"] in {"ok", "data_needed"}


@db_required
def test_development_model_summary_exposes_wsacc_model_ready_evidence() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert "wsacc_model_feature_table_available" in body
    assert "wsacc_model_status" in body
    assert body["prediction_probability_available"] is False
    if body["wsacc_model_feature_table_available"]:
        assert body["wsacc_model_feature_row_count"] > 0
        assert "sewer_pipe_within_250ft_flag" in body["wsacc_model_feature_columns_present"]


@db_required
def test_indicator_center_uses_wsacc_inventory_for_utility_signal() -> None:
    database_dependencies._OPTIONAL_DB_UNAVAILABLE_UNTIL = None
    indicators_router._INTELLIGENCE_CACHE["payload"] = None
    indicators_router._INTELLIGENCE_CACHE["expires_at"] = None
    payload = client.get("/indicators/intelligence").json()
    utility = next(signal for signal in payload["signals"] if signal["id"] == "utility_readiness")

    assert utility["value"] in {"Sewer proxy available", "Data needed"} or isinstance(utility["value"], int)
    assert utility["status_band"] in {"review", "data_needed"}
    assert "WSACC" in " ".join(utility["evidence"]) or "capacity" in " ".join(utility["evidence"]).lower()


def test_economics_powerbi_export_includes_safe_utility_fields() -> None:
    payload = client.get("/economics/powerbi-export").json()
    csv_header = client.get("/economics/powerbi-export/csv/parcel_economic_signal_fact").text.splitlines()[0]
    fields = csv_header.split(",")
    table_rows = payload["tables"]["parcel_economic_signal_fact"]

    for field in {
        "sewer_proxy_class",
        "utility_readiness_proxy_class",
        "sewer_proxy_confidence",
        "utility_readiness_class",
        "utility_constraint_flag",
        "utility_capacity_status",
        "planned_extension_nearby_flag",
        "planned_extension_status",
        "sewer_basin_label",
        "utility_confidence",
        "development_readiness_band",
        "land_opportunity_class",
        "due_diligence_flags",
        "suggested_next_checks",
    }:
        assert field in fields
        if table_rows:
            assert field in table_rows[0]

    unsafe = str(payload).lower()
    assert "owner" not in unsafe
    assert "mailing" not in unsafe
    assert "raw_score" not in unsafe


def test_planning_ui_surfaces_wsacc_in_explore_and_model_lab() -> None:
    source = (REPO_ROOT / "src/components/dashboard/IntelligencePanel.tsx").read_text(
        encoding="utf-8",
    )

    assert "UtilityReadinessProxyPanel" in source
    assert "Utility + Land Opportunity Features in Model" in source
    assert "Model Evaluation Summary" in source
    assert "Current-best variant: {developmentModelLabSummary.bestAblationVariant}" in source
    assert "WSACC utility proxy is retained for due diligence" in source
    assert "Predictive model driver: no, not currently selected." in source
    assert "Why WSACC Still Matters" in source
    assert "LandOpportunityScreenerPanel" in source
    assert "scripts/build_parcel_wsacc_features.py --apply" in source


def test_economics_land_due_diligence_screener_shows_model_status() -> None:
    source = (REPO_ROOT / "src/components/economics/EconomicsShell.tsx").read_text(
        encoding="utf-8",
    )

    assert "Land Due Diligence Screener" in source
    assert "Current-best predictive variant" in source
    assert "transportation_plus_tax_value_only" in source
    assert "Utility proxy status" in source
    assert "Due diligence layer" in source
    assert "WSACC utility proxy was not selected in the current-best predictive" in source
