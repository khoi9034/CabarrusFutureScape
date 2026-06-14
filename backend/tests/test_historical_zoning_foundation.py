import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = ROOT / "config" / "historical_zoning_sources.json"
FEATURE_CONFIG_FILE = ROOT / "config" / "development_prediction_features.json"
INGEST_SCRIPT = ROOT / "cfs-data-pipelines" / "ingest" / "ingest_historical_zoning_layers.py"
SNAPSHOT_SCRIPT = (
    ROOT / "cfs-data-pipelines" / "transform" / "create_parcel_zoning_snapshot_year.py"
)
EVENT_SCRIPT = (
    ROOT / "cfs-data-pipelines" / "transform" / "create_parcel_zoning_change_events.py"
)


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


ingest = load_module(INGEST_SCRIPT, "historical_zoning_ingest_for_tests")
snapshot = load_module(SNAPSHOT_SCRIPT, "historical_zoning_snapshot_for_tests")
events = load_module(EVENT_SCRIPT, "historical_zoning_events_for_tests")


def test_historical_zoning_source_config_parses_and_uses_historical_root() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    assert config["source_type"] == "historical_zoning"
    assert config["service_root_url"].endswith("/opendata/MapServer")
    assert len(config["sources"]) == 47
    assert all(source["source_year"] <= 2015 for source in config["sources"])
    assert "Cabarrus_County_Zoning" not in config["service_root_url"]
    assert "Zoning_By_Municipalities" not in config["service_root_url"]


def test_service_url_construction_appends_layer_id() -> None:
    assert (
        ingest.construct_layer_url("https://example.test/MapServer", 147)
        == "https://example.test/MapServer/147"
    )
    assert (
        ingest.construct_layer_url("https://example.test/MapServer/", 52)
        == "https://example.test/MapServer/52"
    )


def test_config_excludes_known_non_zoning_layers() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    excluded_tokens = {
        "parcelanno",
        "easementanno",
        "streets",
        "addresses",
        "parcels",
        "parceltaxview",
        "permits",
        "school districts",
        "water supply watershed",
        "schools",
        "recreation facilities",
    }
    source_names = " ".join(source["source_name"].lower() for source in config["sources"])

    assert not any(token in source_names for token in excluded_tokens)


def test_source_year_for_snapshot_never_uses_future_source() -> None:
    source_years = [2005, 2007, 2015]

    assert snapshot.source_year_for_snapshot(2004, source_years) is None
    assert snapshot.source_year_for_snapshot(2005, source_years) == 2005
    assert snapshot.source_year_for_snapshot(2006, source_years) == 2005
    assert snapshot.source_year_for_snapshot(2026, source_years) == 2015


def test_zoning_source_age_years_calculation() -> None:
    assert snapshot.calculate_source_age(2015, 2015) == 0
    assert snapshot.calculate_source_age(2026, 2015) == 11


def test_zoning_source_age_rejects_future_source_year() -> None:
    try:
        snapshot.calculate_source_age(2014, 2015)
    except ValueError as error:
        assert "source_year" in str(error)
    else:  # pragma: no cover - assertion path
        raise AssertionError("Future source year should not be accepted.")


def test_zoning_change_event_detection_on_sample_rows() -> None:
    previous = {
        "zoning_code": "AO",
        "zoning_general_category": "agricultural_or_rural",
        "zoning_jurisdiction": "Cabarrus County / Unincorporated",
    }
    current = {
        "zoning_code": "RMX",
        "zoning_general_category": "mixed_use_or_planned",
        "zoning_jurisdiction": "Cabarrus County / Unincorporated",
    }

    assert events.detect_zoning_change_event(previous, current) == "code_and_category_changed"
    assert (
        events.classify_intensity_change(
            previous["zoning_general_category"],
            current["zoning_general_category"],
        )
        == "increased"
    )


def test_development_prediction_feature_registry_includes_historical_zoning_candidates() -> None:
    config = json.loads(FEATURE_CONFIG_FILE.read_text(encoding="utf-8"))
    names = {feature["feature_name"] for feature in config["features"]}

    expected = {
        "zoning_history_available_flag",
        "zoning_source_age_years",
        "zoning_changed_prior_1yr",
        "zoning_changed_prior_3yr",
        "zoning_changed_prior_5yr",
        "zoning_change_count_prior_5yr",
        "years_since_last_zoning_change",
        "latest_zoning_change_type",
        "zoning_intensity_increased_prior_5yr",
        "rezoned_to_growth_supportive_prior_5yr",
        "zoning_change_confidence",
        "zoning_temporal_status",
    }

    assert expected <= names
    for feature in config["features"]:
        if feature["feature_name"] in expected:
            assert feature["include_in_future_model"] is True
            assert feature["include_in_strict_baseline"] is False
