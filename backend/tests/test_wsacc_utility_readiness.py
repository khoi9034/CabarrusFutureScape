from fastapi.testclient import TestClient

from app.main import app
from app.services.wsacc_service import build_wsacc_inventory, build_wsacc_statistics


client = TestClient(app)


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


def test_wsacc_endpoints_return_safe_payloads() -> None:
    assert client.get("/wsacc/inventory").status_code == 200
    stats = client.get("/wsacc/statistics")
    parcel = client.get("/wsacc/parcel/123")
    filtered = client.get("/wsacc/filter?near_sewer_line=true")

    assert stats.status_code == 200
    assert parcel.status_code == 200
    assert filtered.status_code == 200
    assert parcel.json()["utility_readiness_class"] == "Data needed"
    assert filtered.json()["status"] == "data_needed"


def test_indicator_center_uses_wsacc_inventory_for_utility_signal() -> None:
    payload = client.get("/indicators/intelligence").json()
    utility = next(signal for signal in payload["signals"] if signal["id"] == "utility_readiness")

    assert utility["value"] == "Sewer proxy available"
    assert utility["status_band"] == "review"
    assert "WSACC sewer pipe segments" in " ".join(utility["evidence"])


def test_economics_powerbi_export_includes_safe_utility_fields() -> None:
    payload = client.get("/economics/powerbi-export").json()
    csv_header = client.get("/economics/powerbi-export/csv/parcel_economic_signal_fact").text.splitlines()[0]
    fields = csv_header.split(",")
    table_rows = payload["tables"]["parcel_economic_signal_fact"]

    for field in {
        "utility_readiness_class",
        "utility_constraint_flag",
        "planned_extension_nearby_flag",
        "sewer_basin_label",
        "utility_confidence",
    }:
        assert field in fields
        if table_rows:
            assert field in table_rows[0]

    unsafe = str(payload).lower()
    assert "owner" not in unsafe
    assert "mailing" not in unsafe
    assert "raw_score" not in unsafe
