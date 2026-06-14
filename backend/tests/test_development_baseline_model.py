import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = (
    REPO_ROOT
    / "cfs-data-pipelines"
    / "modeling"
    / "train_development_baseline_model.py"
)
MODEL_CARD_PATH = (
    REPO_ROOT
    / "docs"
    / "modeling"
    / "development_prediction_baseline_model_card.md"
)
METRICS_PATH = (
    REPO_ROOT
    / "outputs"
    / "modeling"
    / "development_prediction"
    / "phase10c_model_metrics.json"
)

spec = importlib.util.spec_from_file_location(
    "train_development_baseline_model",
    SCRIPT_PATH,
)
assert spec and spec.loader
baseline_model = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = baseline_model
spec.loader.exec_module(baseline_model)

db_required = pytest.mark.skipif(
    not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")),
    reason="Database password environment variable is not configured.",
)


def test_phase10c_mature_label_year_filtering() -> None:
    years = baseline_model.mature_snapshot_years(date(2026, 6, 11), 3)

    assert years[-1] == 2022
    assert 2023 not in years


def test_phase10c_temporal_split_generation() -> None:
    split = baseline_model.build_temporal_split(list(range(2014, 2023)))

    assert split.train_years == [2014, 2015, 2016, 2017, 2018, 2019]
    assert split.validation_years == [2020, 2021]
    assert split.test_years == [2022]


def test_phase10c_target_leakage_exclusion() -> None:
    with pytest.raises(ValueError):
        baseline_model.assert_no_target_leakage(
            ["permits_prior_3yr", "new_construction_next_3yr"],
        )

    baseline_model.assert_no_target_leakage(
        baseline_model.feature_columns_for_set("strict_time_safe_baseline"),
    )


def test_phase10c_metrics_output_structure() -> None:
    metrics = baseline_model.metrics_for_predictions(
        np.array([0, 0, 1, 1]),
        np.array([0.1, 0.2, 0.8, 0.9]),
    )

    assert "average_precision_pr_auc" in metrics
    assert "precision_at_top_5_pct" in metrics
    assert "lift_at_top_5_pct" in metrics
    assert "confusion_matrix_threshold_0_5" in metrics


def test_phase10c_prediction_sample_is_internal_only() -> None:
    import pandas as pd

    rows = baseline_model.prediction_sample_rows(
        pd.DataFrame(
            [
                {
                    "official_parcel_id": "CFS-PARCEL-1",
                    "pin14": "1",
                    "snapshot_year": 2022,
                },
            ],
        ),
        pd.Series([True]),
        np.array([0.75]),
        "new_construction_next_3yr",
        "logistic_regression",
        "strict_time_safe_baseline",
        "test_experiment",
    )

    assert rows[0]["no_frontend_exposure"] is True
    assert rows[0]["production_ready"] is False
    assert rows[0]["caveat"] == "internal_experiment_not_for_public_decision"


@db_required
def test_phase10c_training_dry_run(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--dry-run",
            "--output-dir",
            str(tmp_path),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    summary = json.loads((tmp_path / "phase10c_temporal_split_summary.json").read_text())
    assert summary["target"] == "new_construction_next_3yr"
    assert summary["model_active"] is False
    assert summary["prediction_probability_available"] is False


def test_phase10c_model_card_exists_after_experiment() -> None:
    assert MODEL_CARD_PATH.exists()
    content = MODEL_CARD_PATH.read_text(encoding="utf-8")
    normalized = content.lower().replace("-", " ").replace("*", "")
    assert "not production ready" in normalized
    assert "frontend" in normalized


def test_phase10c_metrics_artifact_is_internal_only() -> None:
    assert METRICS_PATH.exists()
    payload = json.loads(METRICS_PATH.read_text(encoding="utf-8"))

    assert payload["model_active"] is False
    assert payload["prediction_probability_available"] is False
    assert payload["production_ready"] is False


def test_phase10c_no_frontend_prediction_exposure() -> None:
    frontend_files = [
        path
        for path in (REPO_ROOT / "src").rglob("*")
        if path.is_file()
        and path.suffix in {".ts", ".tsx", ".js", ".jsx"}
        and ".next" not in path.parts
    ]
    joined = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in frontend_files)

    allowed_aggregate_paths = {
        "/development/prediction/features/summary",
        "/development/prediction/ranking/summary",
        "/development/prediction/transportation-accessibility/summary",
        "/development/prediction/transportation-plan-traffic/summary",
    }
    referenced_prediction_paths = set(
        re.findall(r'["`](/development/prediction[^"`?]*)', joined),
    )

    assert "experimental_probability" not in joined
    joined_without_guardrail_flags = joined.replace("prediction_probability_available", "")
    assert "prediction_probability" not in joined_without_guardrail_flags
    assert referenced_prediction_paths <= allowed_aggregate_paths
    assert "{official_parcel_id}" not in "\n".join(referenced_prediction_paths)
