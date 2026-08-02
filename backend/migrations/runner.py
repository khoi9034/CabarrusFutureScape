from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Column, DateTime, MetaData, String, Table, inspect, select
from sqlalchemy.engine import Engine

from app.product.models import PRODUCT_TABLES
from migrations.versions import v0001_product_v1

VERSION_TABLE_NAME = "cfs_product_schema_version"
version_metadata = MetaData()
version_table = Table(
    VERSION_TABLE_NAME,
    version_metadata,
    Column("version", String(80), primary_key=True),
    Column("applied_at", DateTime(timezone=True), nullable=False),
)
MIGRATIONS = (v0001_product_v1,)


class MigrationError(RuntimeError):
    pass


def status(engine: Engine) -> dict[str, Any]:
    with engine.connect() as connection:
        applied = _applied_versions(connection) if inspect(connection).has_table(VERSION_TABLE_NAME) else []
    known = [migration.revision for migration in MIGRATIONS]
    return {
        "current": applied[-1] if applied else None,
        "applied": applied,
        "pending": [revision for revision in known if revision not in applied],
        "known": known,
    }


def check(engine: Engine) -> dict[str, Any]:
    state = status(engine)
    unknown = sorted(set(state["applied"]) - set(state["known"]))
    problems = [f"Unknown applied migration: {revision}" for revision in unknown]
    if state["applied"] and state["applied"] != state["known"][: len(state["applied"])]:
        problems.append("Applied migrations are not a valid ordered prefix.")
    if not state["pending"]:
        inspector = inspect(engine)
        for name, table in PRODUCT_TABLES.items():
            if not inspector.has_table(name):
                problems.append(f"Missing Product V1 table: {name}")
                continue
            actual = {column["name"] for column in inspector.get_columns(name)}
            missing = sorted(set(table.c.keys()) - actual)
            if missing:
                problems.append(f"Table {name} is missing columns: {', '.join(missing)}")
    return {**state, "ok": not problems and not state["pending"], "problems": problems}


def upgrade(engine: Engine) -> dict[str, Any]:
    with engine.begin() as connection:
        inspector = inspect(connection)
        version_exists = inspector.has_table(VERSION_TABLE_NAME)
        applied = set(_applied_versions(connection)) if version_exists else set()
        for migration in MIGRATIONS:
            if migration.revision in applied:
                continue
            if migration.down_revision and migration.down_revision not in applied:
                raise MigrationError(f"Missing parent migration {migration.down_revision}.")
            if not applied:
                existing = sorted(name for name in PRODUCT_TABLES if inspector.has_table(name))
                if existing:
                    raise MigrationError(
                        "Product V1 migration cannot adopt pre-existing managed tables: "
                        + ", ".join(existing)
                        + ". Reconcile or explicitly baseline them first."
                    )
            if not version_exists:
                version_metadata.create_all(connection, checkfirst=True)
                version_exists = True
            migration.upgrade(connection)
            problems = _schema_problems(connection)
            if problems:
                raise MigrationError(
                    "Migration schema verification failed: " + "; ".join(problems)
                )
            connection.execute(
                version_table.insert().values(
                    version=migration.revision,
                    applied_at=datetime.now(UTC),
                )
            )
            applied.add(migration.revision)
    result = check(engine)
    if not result["ok"]:
        raise MigrationError("Migration completed with schema problems: " + "; ".join(result["problems"]))
    return result


def _schema_problems(connection) -> list[str]:
    inspector = inspect(connection)
    problems: list[str] = []
    for name, table in PRODUCT_TABLES.items():
        if not inspector.has_table(name):
            problems.append(f"Missing Product V1 table: {name}")
            continue
        actual = {column["name"] for column in inspector.get_columns(name)}
        missing = sorted(set(table.c.keys()) - actual)
        if missing:
            problems.append(f"Table {name} is missing columns: {', '.join(missing)}")
    return problems


def rollback_one(engine: Engine, *, allow_cfs_dev: bool = False) -> dict[str, Any]:
    database_name = (engine.url.database or "").lower()
    explicitly_allowed = allow_cfs_dev or os.getenv("CFS_ALLOW_CFS_DEV_ROLLBACK") == "true"
    if database_name == "cfs_dev" and not explicitly_allowed:
        raise MigrationError(
            "Refusing to roll back cfs_dev. Pass --allow-cfs-dev-rollback only after an explicit review."
        )
    with engine.begin() as connection:
        if not inspect(connection).has_table(VERSION_TABLE_NAME):
            raise MigrationError("No Product V1 migration version table exists.")
        applied = _applied_versions(connection)
        if not applied:
            raise MigrationError("No Product V1 migration is available to roll back.")
        current = applied[-1]
        migration = next((item for item in MIGRATIONS if item.revision == current), None)
        if migration is None:
            raise MigrationError(f"Refusing to roll back unknown migration {current}.")
        migration.downgrade(connection)
        connection.execute(version_table.delete().where(version_table.c.version == current))
    return status(engine)


def _applied_versions(connection) -> list[str]:
    rows = connection.execute(
        select(version_table.c.version).order_by(version_table.c.applied_at, version_table.c.version)
    )
    return [str(row[0]) for row in rows]
