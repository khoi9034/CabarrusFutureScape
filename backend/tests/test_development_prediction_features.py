import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import get_engine
from app.main import app


client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = REPO_ROOT / "config" / "development_prediction_features.json"
TRANSFORM_SCRIPT = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "transform"
    / "create_development_prediction_feature_matrix.py"
)
spec = importlib.util.spec_from_file_location(
    "create_development_prediction_feature_matrix",
    TRANSFORM_SCRIPT,
)
assert spec and spec.loader
feature_matrix = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = feature_matrix
spec.loader.exec_module(feature_matrix)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_development_prediction_feature_config_parses() -> None:
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    assert config["model_active"] is False
    assert config["prediction_probability_available"] is False
    assert "permit_history_features" in config["feature_groups"]
    assert "new_construction_history_features" in feature_matrix.feature_registry_groups()


@db_required
def test_development_prediction_features_summary_endpoint() -> None:
    response = client.get("/development/prediction/features/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["feature_matrix_available"] is True
    assert body["row_count"] == 1430221
    assert body["unique_parcel_count"] == 110017
    assert body["model_active"] is False
    assert body["prediction_probability_available"] is False
    assert "prediction_probability" not in body
    assert body["production_ready"] is False
    assert body["label_positive_rates"]
    assert body["leakage_caveats"]


@db_required
def test_development_prediction_feature_rows_match_labels() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_features)
                    AS feature_rows,
                  (SELECT COUNT(*) FROM public.parcel_development_prediction_labels)
                    AS label_rows
                """,
            ),
        ).mappings().one()

    assert row["feature_rows"] == row["label_rows"] == 1430221


@db_required
def test_development_prediction_prior_windows_do_not_go_negative() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE years_since_last_permit < 0)
                    AS negative_permit_age_rows,
                  COUNT(*) FILTER (WHERE years_since_last_new_construction < 0)
                    AS negative_new_construction_age_rows,
                  COUNT(*) FILTER (
                    WHERE permits_prior_1yr < 0
                       OR permits_prior_3yr < 0
                       OR permits_prior_5yr < 0
                       OR new_construction_permits_prior_1yr < 0
                       OR new_construction_permits_prior_3yr < 0
                       OR new_construction_permits_prior_5yr < 0
                  ) AS negative_count_rows
                FROM public.parcel_development_prediction_features
                """,
            ),
        ).mappings().one()

    assert row["negative_permit_age_rows"] == 0
    assert row["negative_new_construction_age_rows"] == 0
    assert row["negative_count_rows"] == 0


@db_required
def test_development_prediction_school_capacity_remains_inactive() -> None:
    with get_engine().connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE school_capacity_status <> 'not_available')
                    AS active_capacity_rows,
                  COUNT(*) FILTER (WHERE school_constraint_score IS NOT NULL)
                    AS scored_rows,
                  COUNT(*) FILTER (WHERE school_constraint_class <> 'not_scored')
                    AS classified_rows
                FROM public.parcel_development_prediction_features
                """,
            ),
        ).mappings().one()

    assert row["active_capacity_rows"] == 0
    assert row["scored_rows"] == 0
    assert row["classified_rows"] == 0


def test_development_prediction_features_endpoint_is_in_openapi() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/development/prediction/features/summary" in response.json()["paths"]
