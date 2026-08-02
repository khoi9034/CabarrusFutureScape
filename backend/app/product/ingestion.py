from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.product.audit import append_event
from app.product.models import data_quality_results, ingestion_runs, new_id, utc_now
from app.product.principal import Permission, ProductPrincipal, authorize_object
from app.product.quality import evaluate_domain_rows
from app.product.service import ProductValidationError
from app.product.source_registry import get_source


class IngestionAdapter(Protocol):
    def read(self) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class RowsAdapter:
    rows: list[dict[str, Any]]

    def read(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.rows]


@dataclass(frozen=True)
class StagedDataset:
    rows: tuple[dict[str, Any], ...]
    checksum: str
    schema_version: str
    staged_key: str | None = None


def stage(adapter: IngestionAdapter, *, schema_version: str, staged_key: str | None = None) -> StagedDataset:
    rows = tuple(adapter.read())
    serialized = json.dumps(rows, sort_keys=True, separators=(",", ":"), default=str).encode()
    return StagedDataset(
        rows=rows,
        checksum=hashlib.sha256(serialized).hexdigest(),
        schema_version=schema_version,
        staged_key=staged_key,
    )


def validate(
    staged: StagedDataset,
    *,
    domain: str,
    required_fields: tuple[str, ...] = (),
    unique_key: str | None = None,
    expected_srid: int | None = None,
    expected_rows: int | None = None,
    max_null_rate: float = 1.0,
    source_date: datetime | None = None,
    freshness_days: int | None = None,
) -> list[dict[str, Any]]:
    rows = list(staged.rows)
    results = evaluate_domain_rows(domain, rows)
    if required_fields:
        missing = sum(
            1 for row in rows if any(row.get(field) in (None, "") for field in required_fields)
        )
        results.append(_result("schema.required_fields", missing == 0, "missing_rows", 0, missing))
    if unique_key:
        values = [row.get(unique_key) for row in rows if row.get(unique_key) not in (None, "")]
        duplicates = len(values) - len(set(values))
        results.append(_result("schema.duplicates", duplicates == 0, "duplicate_rows", 0, duplicates))
    if expected_srid is not None:
        invalid_srid = sum(1 for row in rows if row.get("geometry") and row.get("srid") != expected_srid)
        results.append(_result("geometry.srid", invalid_srid == 0, "invalid_srid_rows", 0, invalid_srid))
    invalid_geometry = sum(1 for row in rows if not _valid_geometry(row.get("geometry")))
    results.append(_result("geometry.validity", invalid_geometry == 0, "invalid_geometry_rows", 0, invalid_geometry))
    if rows and required_fields:
        cells = len(rows) * len(required_fields)
        null_cells = sum(row.get(field) in (None, "") for row in rows for field in required_fields)
        null_rate = null_cells / cells
        results.append(
            _result("schema.null_rate", null_rate <= max_null_rate, "null_rate", max_null_rate, round(null_rate, 6))
        )
    if expected_rows is not None:
        results.append(_result("rows.reconciliation", len(rows) == expected_rows, "row_count", expected_rows, len(rows)))
    if source_date and freshness_days is not None:
        age = (datetime.now(UTC) - _aware(source_date)).days
        results.append(_result("source.freshness", age <= freshness_days, "age_days", freshness_days, age))
    return results


def run_ingestion(
    session: Session,
    principal: ProductPrincipal,
    *,
    source_id: str,
    domain: str,
    staged: StagedDataset,
    apply: bool,
    validation_options: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    source = get_source(session, principal, source_id)
    permission = Permission.INGESTION_APPLY if apply else Permission.INGESTION_DRY_RUN
    authorize_object(
        principal,
        permission,
        organization_id=source.get("organization_id"),
    )
    if domain != source["domain"]:
        raise ProductValidationError("Ingestion domain does not match the registered source.")
    if staged.schema_version != source["schema_version"]:
        raise ProductValidationError(
            "Ingestion schema version does not match the registered source."
        )
    results = validate(staged, domain=domain, **(validation_options or {}))
    failures = [result for result in results if result["status"] == "failed"]
    apply_unavailable = apply and not failures
    run_id = new_id()
    now = utc_now()
    run = {
        "id": run_id,
        "organization_id": principal.organization_id,
        "source_id": source_id,
        "mode": "apply" if apply else "dry_run",
        "status": "Validation failed" if failures else ("Apply unavailable" if apply_unavailable else "Validated"),
        "checksum": staged.checksum,
        "schema_version": staged.schema_version,
        "staged_key": staged.staged_key,
        "input_rows": len(staged.rows),
        "accepted_rows": 0 if failures or apply_unavailable else len(staged.rows),
        "rejected_rows": len(staged.rows) if failures else 0,
        "validation_summary": {
            "checks": len(results),
            "failures": len(failures),
            "canonical_tables_mutated": False,
            "apply_contract": (
                "no canonical apply adapter is configured"
                if apply_unavailable
                else "validation-only immutable run"
            ),
        },
        "created_by": principal.user_id,
        "started_at": now,
        "completed_at": now,
        "created_at": now,
    }
    session.execute(ingestion_runs.insert().values(**run))
    for result in results:
        session.execute(
            data_quality_results.insert().values(
                id=new_id(),
                organization_id=principal.organization_id,
                ingestion_run_id=run_id,
                source_id=source_id,
                domain=domain,
                created_at=now,
                **result,
            )
        )
    append_event(
        session,
        principal=principal,
        action="ingestion_apply" if apply else "ingestion_dry_run",
        object_type="ingestion_runs",
        object_id=run_id,
        outcome="failed" if failures or apply_unavailable else "success",
        details={
            "checksum": staged.checksum,
            "row_count": len(staged.rows),
            "validation_failures": len(failures),
            "canonical_tables_mutated": False,
        },
        request_id=request_id,
    )
    return run


def _valid_geometry(value: Any) -> bool:
    if value is None:
        return True
    return isinstance(value, dict) and value.get("type") in {
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
        "Polygon",
        "MultiPolygon",
    } and isinstance(value.get("coordinates"), list)


def _result(rule_id: str, passed: bool, metric: str, expected: Any, actual: Any) -> dict[str, Any]:
    return {
        "rule_id": rule_id,
        "severity": "error",
        "status": "passed" if passed else "failed",
        "metric_name": metric,
        "expected_value": str(expected),
        "actual_value": str(actual),
        "details": {"fake_values_created": False},
    }


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)
