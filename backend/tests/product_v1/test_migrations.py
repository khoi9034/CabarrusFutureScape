from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.product.models import LEGACY_INVESTMENT_EQUIVALENTS, PRODUCT_TABLES
from migrations.versions.v0001_product_v1 import IMMUTABLE_FUNCTION
from migrations.runner import MigrationError, rollback_one, status, upgrade


def test_cli_upgrade_status_rollback_and_reupgrade_are_isolated(tmp_path: Path) -> None:
    database = tmp_path / "product-v1.sqlite"
    database_url = f"sqlite:///{database.as_posix()}"
    manage = Path(__file__).resolve().parents[2] / "migrations" / "manage.py"

    first_status = _manage(manage, "status", database_url)
    assert first_status["current"] is None
    assert first_status["pending"] == ["0001_product_v1"]

    upgraded = _manage(manage, "upgrade", database_url)
    assert upgraded["ok"] is True
    assert _manage(manage, "status", database_url)["current"] == "0001_product_v1"

    rolled_back = _manage(manage, "rollback-one", database_url)
    assert rolled_back["current"] is None
    assert rolled_back["pending"] == ["0001_product_v1"]

    reupgraded = _manage(manage, "upgrade", database_url)
    assert reupgraded["ok"] is True
    assert set(PRODUCT_TABLES).issubset(inspect(create_engine(database_url)).get_table_names())


def test_preexisting_managed_table_is_not_adopted_or_versioned() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE projects (id text PRIMARY KEY)"))

    with pytest.raises(MigrationError, match="cannot adopt pre-existing"):
        upgrade(engine)

    assert status(engine)["applied"] == []
    assert {column["name"] for column in inspect(engine).get_columns("projects")} == {"id"}


def test_migration_preserves_legacy_investment_equivalents_without_duplicates(product_engine) -> None:
    physical_tables = set(inspect(product_engine).get_table_names())
    assert {"saved_searches", "opportunities", "shortlist_items", "underwriting_scenarios"}.isdisjoint(
        physical_tables
    )
    assert LEGACY_INVESTMENT_EQUIVALENTS == {
        "investment_projects": "investment_engagement",
        "saved_searches": "investment_saved_search",
        "opportunities": "investment_candidate_intake",
        "shortlist_items": "investment_saved_item / investment_engagement.shortlist_json",
        "underwriting_scenarios": "investment_underwriting_scenario",
    }


def test_isolated_product_engine_rolls_back_and_reupgrades(product_engine) -> None:
    rolled_back = rollback_one(product_engine, allow_cfs_dev=True)
    assert rolled_back["current"] is None
    assert set(PRODUCT_TABLES).isdisjoint(inspect(product_engine).get_table_names())

    reupgraded = upgrade(product_engine)
    assert reupgraded["ok"] is True
    assert set(PRODUCT_TABLES).issubset(inspect(product_engine).get_table_names())


def test_cfs_dev_rollback_requires_explicit_opt_in() -> None:
    class GuardEngine:
        url = make_url("postgresql+psycopg://user:pass@localhost/cfs_dev")

    with pytest.raises(MigrationError, match="Refusing to roll back cfs_dev"):
        rollback_one(GuardEngine())  # type: ignore[arg-type]


def test_immutable_trigger_helper_is_revision_owned_and_not_cascade_dropped() -> None:
    migration = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "v0001_product_v1.py"
    source = migration.read_text(encoding="utf-8")
    assert IMMUTABLE_FUNCTION == "cfs_product_v1_0001_reject_immutable_mutation"
    assert "DROP FUNCTION IF EXISTS {IMMUTABLE_FUNCTION}()" in source
    assert "CASCADE" not in source


def _manage(manage: Path, command: str, database_url: str) -> dict:
    result = subprocess.run(
        [sys.executable, str(manage), command, "--database-url", database_url],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)
