"""Repository layer for constraint intelligence queries."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _as_codes(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if isinstance(value, tuple):
        return [str(item) for item in value if item not in (None, "")]
    return [str(value)]


@dataclass(frozen=True)
class FloodConstraintFilters:
    floodplain_present: bool | None = None
    floodway_present: bool | None = None
    sfha_present: bool | None = None
    moderate_flood_present: bool | None = None
    flood_review_required: bool | None = None
    buildability_impact: str | None = None
    flood_severity_class: str | None = None
    dominant_flood_zone: str | None = None
    percent_constrained_min: float | None = None
    percent_constrained_max: float | None = None


@dataclass(frozen=True)
class FloodConstraintRecord:
    official_parcel_id: str
    pin14: str | None
    dominant_flood_zone: str | None
    flood_zone_codes: list[str]
    floodplain_present: bool
    floodway_present: bool
    sfha_present: bool
    moderate_flood_present: bool
    minimal_flood_present: bool
    parcel_area_acres: float | None
    flood_constrained_area_acres: float | None
    floodway_area_acres: float | None
    sfha_area_acres: float | None
    percent_parcel_constrained: float | None
    percent_parcel_floodway: float | None
    percent_parcel_sfha: float | None
    flood_review_required: bool
    buildability_impact: str | None
    flood_constraint_score: float | None
    flood_severity_class: str | None
    overlay_confidence: str | None


@dataclass(frozen=True)
class FloodConstraintPage:
    total_count: int
    records: list[FloodConstraintRecord]


@dataclass(frozen=True)
class FloodConstraintBucket:
    value: str
    parcel_count: int
    percentage: float | None


@dataclass(frozen=True)
class FloodConstraintStatistics:
    total_parcels: int
    floodplain_parcels: int
    floodway_parcels: int
    sfha_parcels: int
    review_required_parcels: int
    high_severe_buildability_parcels: int
    severity_distribution: list[FloodConstraintBucket]
    buildability_impact_distribution: list[FloodConstraintBucket]
    dominant_zone_distribution: list[FloodConstraintBucket]


@dataclass(frozen=True)
class FloodConstraintSummary:
    statistics: FloodConstraintStatistics
    average_percent_constrained: float | None
    max_percent_constrained: float | None


@dataclass(frozen=True)
class FloodZoneFilters:
    flood_severity_class: str | None = None
    flood_constraint_type: str | None = None
    extent: tuple[float, float, float, float] | None = None


@dataclass(frozen=True)
class FloodZoneRecord:
    flood_zone_internal_id: int
    source_objectid: int | None
    fld_ar_id: str | None
    globalid: str | None
    gfid: str | None
    flood_zone_code: str | None
    flood_constraint_type: str | None
    flood_severity_class: str | None
    source_layer: str | None
    geometry: dict[str, Any]


@dataclass(frozen=True)
class FloodZonePage:
    filters: FloodZoneFilters
    limit: int | None
    offset: int
    total_count: int
    zones: list[FloodZoneRecord]


class ConstraintsRepository:
    """Read-only access to parcel constraint intelligence tables."""

    _TABLE = "public.parcel_flood_constraint_overlay"
    _FLOOD_ZONE_TABLE = "public.fema_nfhl_flood_zones_clean"
    _SELECT_FIELDS = """
        official_parcel_id,
        pin14,
        dominant_flood_zone,
        flood_zone_codes,
        floodplain_present,
        floodway_present,
        sfha_present,
        moderate_flood_present,
        minimal_flood_present,
        parcel_area_acres,
        flood_constrained_area_acres,
        floodway_area_acres,
        sfha_area_acres,
        percent_parcel_constrained,
        percent_parcel_floodway,
        percent_parcel_sfha,
        flood_review_required,
        buildability_impact,
        flood_constraint_score,
        flood_severity_class,
        overlay_confidence
    """
    _FLOOD_ZONE_SELECT_FIELDS = """
        flood_zone_internal_id,
        source_objectid,
        fld_ar_id,
        globalid,
        gfid,
        flood_zone_code,
        flood_constraint_type,
        flood_severity_class,
        source_layer,
        ST_AsGeoJSON(geometry, 6)::json AS geometry
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_flood_constraint_by_parcel(
        self, official_parcel_id: str
    ) -> FloodConstraintRecord | None:
        row = self._db.execute(
            text(
                f"""
                SELECT {self._SELECT_FIELDS}
                FROM {self._TABLE}
                WHERE official_parcel_id = :official_parcel_id
                LIMIT 1
                """
            ),
            {"official_parcel_id": official_parcel_id},
        ).mappings().first()
        return self._row_to_record(row) if row else None

    def get_flood_statistics(
        self, filters: FloodConstraintFilters | None = None
    ) -> FloodConstraintStatistics:
        where_sql, params = self._build_where(filters)
        metrics = self._db.execute(
            text(
                f"""
                SELECT
                    COUNT(*)::int AS total_parcels,
                    COUNT(*) FILTER (WHERE floodplain_present)::int AS floodplain_parcels,
                    COUNT(*) FILTER (WHERE floodway_present)::int AS floodway_parcels,
                    COUNT(*) FILTER (WHERE sfha_present)::int AS sfha_parcels,
                    COUNT(*) FILTER (WHERE flood_review_required)::int AS review_required_parcels,
                    COUNT(*) FILTER (
                        WHERE LOWER(COALESCE(buildability_impact, '')) IN ('high', 'severe')
                    )::int AS high_severe_buildability_parcels
                FROM {self._TABLE}
                {where_sql}
                """
            ),
            params,
        ).mappings().one()

        total = int(metrics["total_parcels"] or 0)
        return FloodConstraintStatistics(
            total_parcels=total,
            floodplain_parcels=int(metrics["floodplain_parcels"] or 0),
            floodway_parcels=int(metrics["floodway_parcels"] or 0),
            sfha_parcels=int(metrics["sfha_parcels"] or 0),
            review_required_parcels=int(metrics["review_required_parcels"] or 0),
            high_severe_buildability_parcels=int(
                metrics["high_severe_buildability_parcels"] or 0
            ),
            severity_distribution=self._get_distribution(
                "flood_severity_class", where_sql, params, total
            ),
            buildability_impact_distribution=self._get_distribution(
                "buildability_impact", where_sql, params, total
            ),
            dominant_zone_distribution=self._get_distribution(
                "dominant_flood_zone", where_sql, params, total
            ),
        )

    def filter_flood_constraints(
        self,
        filters: FloodConstraintFilters | None = None,
        *,
        limit: int = 20,
        offset: int = 0,
        high_review_only: bool = False,
    ) -> FloodConstraintPage:
        if high_review_only:
            filters = self._with_review_required(filters)
            order_sql = (
                "flood_constraint_score DESC NULLS LAST, "
                "percent_parcel_constrained DESC NULLS LAST, "
                "official_parcel_id ASC"
            )
        else:
            order_sql = "official_parcel_id ASC"

        where_sql, params = self._build_where(filters)
        params = {**params, "limit": limit, "offset": offset}

        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int AS total_count
                FROM {self._TABLE}
                {where_sql}
                """
            ),
            params,
        ).scalar_one()

        rows = self._db.execute(
            text(
                f"""
                SELECT {self._SELECT_FIELDS}
                FROM {self._TABLE}
                {where_sql}
                ORDER BY {order_sql}
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        ).mappings().all()

        return FloodConstraintPage(
            total_count=int(total or 0),
            records=[self._row_to_record(row) for row in rows],
        )

    def get_flood_summary(
        self, filters: FloodConstraintFilters | None = None
    ) -> FloodConstraintSummary:
        where_sql, params = self._build_where(filters)
        row = self._db.execute(
            text(
                f"""
                SELECT
                    ROUND(AVG(percent_parcel_constrained)::numeric, 4) AS average_percent_constrained,
                    ROUND(MAX(percent_parcel_constrained)::numeric, 4) AS max_percent_constrained
                FROM {self._TABLE}
                {where_sql}
                """
            ),
            params,
        ).mappings().one()

        return FloodConstraintSummary(
            statistics=self.get_flood_statistics(filters),
            average_percent_constrained=_as_float(row["average_percent_constrained"]),
            max_percent_constrained=_as_float(row["max_percent_constrained"]),
        )

    def get_flood_zones(
        self,
        filters: FloodZoneFilters | None = None,
        *,
        limit: int | None = 500,
        offset: int = 0,
    ) -> FloodZonePage:
        where_sql, params = self._build_flood_zone_where(filters)
        query_params = {**params, "offset": offset}
        limit_sql = ""

        if limit is not None:
            limit_sql = "LIMIT :limit"
            query_params["limit"] = limit

        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int AS total_count
                FROM {self._FLOOD_ZONE_TABLE}
                {where_sql}
                """
            ),
            params,
        ).scalar_one()

        rows = self._db.execute(
            text(
                f"""
                SELECT {self._FLOOD_ZONE_SELECT_FIELDS}
                FROM {self._FLOOD_ZONE_TABLE}
                {where_sql}
                ORDER BY
                    CASE LOWER(COALESCE(flood_severity_class, ''))
                        WHEN 'severe' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'moderate' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END,
                    flood_zone_internal_id ASC
                {limit_sql}
                OFFSET :offset
                """
            ),
            query_params,
        ).mappings().all()

        return FloodZonePage(
            filters=filters or FloodZoneFilters(),
            limit=limit,
            offset=offset,
            total_count=int(total or 0),
            zones=[self._row_to_flood_zone(row) for row in rows],
        )

    def _get_distribution(
        self,
        column_name: str,
        where_sql: str,
        params: dict[str, Any],
        total_count: int,
    ) -> list[FloodConstraintBucket]:
        allowed_columns = {
            "flood_severity_class",
            "buildability_impact",
            "dominant_flood_zone",
        }
        if column_name not in allowed_columns:
            raise ValueError(f"Unsupported distribution column: {column_name}")

        rows = self._db.execute(
            text(
                f"""
                SELECT
                    COALESCE(NULLIF({column_name}::text, ''), 'unknown') AS value,
                    COUNT(*)::int AS parcel_count,
                    CASE
                        WHEN :total_count = 0 THEN NULL
                        ELSE ROUND((COUNT(*) * 100.0 / :total_count)::numeric, 4)
                    END AS percentage
                FROM {self._TABLE}
                {where_sql}
                GROUP BY COALESCE(NULLIF({column_name}::text, ''), 'unknown')
                ORDER BY parcel_count DESC, value ASC
                """
            ),
            {**params, "total_count": total_count},
        ).mappings().all()

        return [
            FloodConstraintBucket(
                value=str(row["value"]),
                parcel_count=int(row["parcel_count"] or 0),
                percentage=_as_float(row["percentage"]),
            )
            for row in rows
        ]

    def _build_where(
        self, filters: FloodConstraintFilters | None
    ) -> tuple[str, dict[str, Any]]:
        if not filters:
            return "", {}

        clauses: list[str] = []
        params: dict[str, Any] = {}

        boolean_fields = (
            "floodplain_present",
            "floodway_present",
            "sfha_present",
            "moderate_flood_present",
            "flood_review_required",
        )
        for field in boolean_fields:
            value = getattr(filters, field)
            if value is not None:
                clauses.append(f"{field} = :{field}")
                params[field] = value

        string_fields = (
            "buildability_impact",
            "flood_severity_class",
            "dominant_flood_zone",
        )
        for field in string_fields:
            value = getattr(filters, field)
            if value:
                clauses.append(f"LOWER({field}) = LOWER(:{field})")
                params[field] = value

        if filters.percent_constrained_min is not None:
            clauses.append("percent_parcel_constrained >= :percent_constrained_min")
            params["percent_constrained_min"] = filters.percent_constrained_min
        if filters.percent_constrained_max is not None:
            clauses.append("percent_parcel_constrained <= :percent_constrained_max")
            params["percent_constrained_max"] = filters.percent_constrained_max

        if not clauses:
            return "", {}
        return "WHERE " + " AND ".join(clauses), params

    def _build_flood_zone_where(
        self, filters: FloodZoneFilters | None
    ) -> tuple[str, dict[str, Any]]:
        if not filters:
            return "", {}

        clauses: list[str] = []
        params: dict[str, Any] = {}

        if filters.flood_severity_class:
            clauses.append("LOWER(flood_severity_class) = LOWER(:flood_severity_class)")
            params["flood_severity_class"] = filters.flood_severity_class

        if filters.flood_constraint_type:
            clauses.append(
                "LOWER(flood_constraint_type) = LOWER(:flood_constraint_type)"
            )
            params["flood_constraint_type"] = filters.flood_constraint_type

        if filters.extent:
            xmin, ymin, xmax, ymax = filters.extent
            clauses.append(
                """
                ST_Intersects(
                    geometry,
                    ST_MakeEnvelope(:xmin, :ymin, :xmax, :ymax, 4326)
                )
                """
            )
            params.update({"xmax": xmax, "xmin": xmin, "ymax": ymax, "ymin": ymin})

        if not clauses:
            return "", {}
        return "WHERE " + " AND ".join(clauses), params

    def _with_review_required(
        self, filters: FloodConstraintFilters | None
    ) -> FloodConstraintFilters:
        if not filters:
            return FloodConstraintFilters(flood_review_required=True)
        return FloodConstraintFilters(
            floodplain_present=filters.floodplain_present,
            floodway_present=filters.floodway_present,
            sfha_present=filters.sfha_present,
            moderate_flood_present=filters.moderate_flood_present,
            flood_review_required=True,
            buildability_impact=filters.buildability_impact,
            flood_severity_class=filters.flood_severity_class,
            dominant_flood_zone=filters.dominant_flood_zone,
            percent_constrained_min=filters.percent_constrained_min,
            percent_constrained_max=filters.percent_constrained_max,
        )

    def _row_to_record(self, row: Any) -> FloodConstraintRecord:
        return FloodConstraintRecord(
            official_parcel_id=str(row["official_parcel_id"]),
            pin14=row["pin14"],
            dominant_flood_zone=row["dominant_flood_zone"],
            flood_zone_codes=_as_codes(row["flood_zone_codes"]),
            floodplain_present=bool(row["floodplain_present"]),
            floodway_present=bool(row["floodway_present"]),
            sfha_present=bool(row["sfha_present"]),
            moderate_flood_present=bool(row["moderate_flood_present"]),
            minimal_flood_present=bool(row["minimal_flood_present"]),
            parcel_area_acres=_as_float(row["parcel_area_acres"]),
            flood_constrained_area_acres=_as_float(row["flood_constrained_area_acres"]),
            floodway_area_acres=_as_float(row["floodway_area_acres"]),
            sfha_area_acres=_as_float(row["sfha_area_acres"]),
            percent_parcel_constrained=_as_float(row["percent_parcel_constrained"]),
            percent_parcel_floodway=_as_float(row["percent_parcel_floodway"]),
            percent_parcel_sfha=_as_float(row["percent_parcel_sfha"]),
            flood_review_required=bool(row["flood_review_required"]),
            buildability_impact=row["buildability_impact"],
            flood_constraint_score=_as_float(row["flood_constraint_score"]),
            flood_severity_class=row["flood_severity_class"],
            overlay_confidence=row["overlay_confidence"],
        )

    def _row_to_flood_zone(self, row: Any) -> FloodZoneRecord:
        return FloodZoneRecord(
            flood_zone_internal_id=int(row["flood_zone_internal_id"]),
            source_objectid=(
                int(row["source_objectid"])
                if row["source_objectid"] is not None
                else None
            ),
            fld_ar_id=row["fld_ar_id"],
            globalid=row["globalid"],
            gfid=row["gfid"],
            flood_zone_code=row["flood_zone_code"],
            flood_constraint_type=row["flood_constraint_type"],
            flood_severity_class=row["flood_severity_class"],
            source_layer=row["source_layer"],
            geometry=dict(row["geometry"] or {}),
        )
