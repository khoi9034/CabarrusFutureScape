import importlib.util
from pathlib import Path

import pandas as pd
import pytest


def _worker():
    path = Path(__file__).resolve().parents[2] / "cfs-data-pipelines" / "refresh_permit_intelligence.py"
    spec = importlib.util.spec_from_file_location("permit_refresh_worker", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_permit_refresh_validation_is_idempotent_and_rejects_duplicate_or_shrunk_sources():
    worker = _worker()
    rows = pd.DataFrame({
        "permitid": ["A", "B"],
        "permitdate": ["2026-01-01", "2026-02-01"],
        "parcelnumber": ["1", "2"],
    })
    first = worker.validate_frame(rows, prior_count=2)
    assert worker.validate_frame(rows, prior_count=2)["checksum"] == first["checksum"]
    with pytest.raises(worker.RefreshValidationError, match="duplicate"):
        worker.validate_frame(pd.concat([rows, rows.iloc[[0]]], ignore_index=True), prior_count=2)
    with pytest.raises(worker.RefreshValidationError, match="dropped"):
        worker.validate_frame(rows.iloc[:1], prior_count=10)
