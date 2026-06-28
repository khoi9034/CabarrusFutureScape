"""Repository layer for school constraint intelligence queries."""

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


def _as_int(value: Any) -> int:
    return int(value or 0)


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if isinstance(value, tuple):
        return [str(item) for item in value if item not in (None, "")]
    return [str(value)]


@dataclass(frozen=True)
class SchoolConstraintFilters:
    school_assignment_confidence: str | None = None
    school_assignment_review_required: bool | None = None
    school_summary_status: str | None = None
    recommended_action: str | None = None
    elementary_school_name: str | None = None
    middle_school_name: str | None = None
    high_school_name: str | None = None
    has_elementary_assignment: bool | None = None
    has_middle_assignment: bool | None = None
    has_high_assignment: bool | None = None
    capacity_data_available: bool | None = None


@dataclass(frozen=True)
class SchoolConstraintPage:
    total_count: int
    records: list[dict[str, Any]]


@dataclass(frozen=True)
class SchoolUtilizationSeedPage:
    total_count: int
    records: list[dict[str, Any]]


@dataclass(frozen=True)
class SchoolUtilizationZonePage:
    total_count: int
    records: list[dict[str, Any]]


@dataclass(frozen=True)
class SchoolPressurePage:
    permit_data_available: bool
    total_count: int
    records: list[dict[str, Any]]


@dataclass(frozen=True)
class SchoolLeaPupilContextPage:
    total_count: int
    records: list[dict[str, Any]]


class SchoolConstraintsRepository:
    """Read-only access to school assignment and QA tables."""

    _SUMMARY_TABLE = "public.parcel_school_summary"
    _ASSIGNMENT_TABLE = "public.parcel_school_assignment"
    _PARCEL_TABLE = "public.parcels_enriched"
    _REFERENCE_TABLE = "public.school_reference"
    _ZONES_TABLE = "public.school_zones"
    _CAPACITY_TABLE = "public.school_capacity"
    _UTILIZATION_SEED_VIEW = "public.school_utilization_seed_current"
    _PERMIT_TABLE = "public.real_property_permit_parcel_relationship"
    _LEA_PUPIL_CONTEXT_TABLE = "public.school_lea_pupil_context"
    _DETAIL_FIELDS = """
        parcel.official_parcel_id,
        COALESCE(summary.pin14, parcel.pin14) AS pin14,
        COALESCE(summary.objectid_1, parcel.objectid_1) AS objectid_1,
        summary.elementary_zone_id,
        summary.elementary_school_name,
        summary.elementary_school_name_normalized,
        assignment.elementary_overlap_area_acres,
        assignment.elementary_overlap_percent,
        assignment.elementary_match_confidence,
        summary.elementary_capacity_status,
        summary.elementary_utilization_percent,
        summary.elementary_available_seats,
        summary.middle_zone_id,
        summary.middle_school_name,
        summary.middle_school_name_normalized,
        assignment.middle_overlap_area_acres,
        assignment.middle_overlap_percent,
        assignment.middle_match_confidence,
        summary.middle_capacity_status,
        summary.middle_utilization_percent,
        summary.middle_available_seats,
        summary.high_zone_id,
        summary.high_school_name,
        summary.high_school_name_normalized,
        assignment.high_overlap_area_acres,
        assignment.high_overlap_percent,
        assignment.high_match_confidence,
        summary.high_capacity_status,
        summary.high_utilization_percent,
        summary.high_available_seats,
        COALESCE(summary.has_elementary_assignment, FALSE) AS has_elementary_assignment,
        COALESCE(summary.has_middle_assignment, FALSE) AS has_middle_assignment,
        COALESCE(summary.has_high_assignment, FALSE) AS has_high_assignment,
        COALESCE(summary.school_assignment_confidence, 'low') AS school_assignment_confidence,
        COALESCE(summary.school_assignment_review_required, TRUE) AS school_assignment_review_required,
        COALESCE(summary.assignment_method, 'no_attendance_zone_available') AS assignment_method,
        COALESCE(summary.school_capacity_data_available, FALSE) AS school_capacity_data_available,
        COALESCE(summary.school_capacity_review_required, FALSE) AS school_capacity_review_required,
        summary.school_capacity_score,
        summary.school_constraint_score,
        COALESCE(summary.school_constraint_class, 'not_scored') AS school_constraint_class,
        COALESCE(summary.school_summary_status, 'assignment_incomplete') AS school_summary_status,
        COALESCE(summary.recommended_action, 'capacity_data_needed') AS recommended_action,
        COALESCE(
            summary.data_quality_flags,
            ARRAY[
                'school_summary_missing',
                'attendance_assignment_incomplete',
                'capacity_not_available'
            ]::text[]
        ) AS data_quality_flags
    """
    _FILTER_FIELDS = """
        official_parcel_id,
        pin14,
        elementary_school_name,
        middle_school_name,
        high_school_name,
        has_elementary_assignment,
        has_middle_assignment,
        has_high_assignment,
        school_assignment_confidence,
        school_assignment_review_required,
        school_capacity_data_available,
        school_constraint_class,
        school_summary_status,
        recommended_action,
        data_quality_flags
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_school_constraint_by_parcel(
        self, official_parcel_id: str
    ) -> dict[str, Any] | None:
        row = self._db.execute(
            text(
                f"""
                SELECT {self._DETAIL_FIELDS}
                FROM {self._PARCEL_TABLE} AS parcel
                LEFT JOIN {self._SUMMARY_TABLE} AS summary
                  ON summary.official_parcel_id = parcel.official_parcel_id
                LEFT JOIN {self._ASSIGNMENT_TABLE} AS assignment
                  ON assignment.official_parcel_id = parcel.official_parcel_id
                WHERE parcel.official_parcel_id = :official_parcel_id
                LIMIT 1
                """
            ),
            {"official_parcel_id": official_parcel_id},
        ).mappings().first()
        return dict(row) if row else None

    def get_statistics(
        self, filters: SchoolConstraintFilters | None = None
    ) -> dict[str, Any]:
        where_sql, params = self._build_where(filters)
        row = self._db.execute(
            text(
                f"""
                SELECT
                    COUNT(*)::int AS total_parcels,
                    COUNT(*) FILTER (WHERE has_elementary_assignment)::int
                        AS elementary_assigned_parcels,
                    COUNT(*) FILTER (WHERE has_middle_assignment)::int
                        AS middle_assigned_parcels,
                    COUNT(*) FILTER (WHERE has_high_assignment)::int
                        AS high_assigned_parcels,
                    COUNT(*) FILTER (WHERE NOT has_elementary_assignment)::int
                        AS missing_elementary_assignment_parcels,
                    COUNT(*) FILTER (WHERE NOT has_middle_assignment)::int
                        AS missing_middle_assignment_parcels,
                    COUNT(*) FILTER (WHERE NOT has_high_assignment)::int
                        AS missing_high_assignment_parcels,
                    COUNT(*) FILTER (WHERE school_assignment_review_required)::int
                        AS assignment_review_required_parcels,
                    COUNT(*) FILTER (WHERE school_capacity_data_available)::int
                        AS capacity_data_available_parcels,
                    COUNT(*) FILTER (WHERE NOT school_capacity_data_available)::int
                        AS capacity_not_available_parcels,
                    COUNT(*) FILTER (WHERE school_constraint_score IS NOT NULL)::int
                        AS school_constraint_score_non_null_parcels
                FROM {self._SUMMARY_TABLE}
                {where_sql}
                """
            ),
            params,
        ).mappings().one()

        total = _as_int(row["total_parcels"])
        return {
            **dict(row),
            "school_reference_count": self._count_table(self._REFERENCE_TABLE),
            "included_public_ccs_reference_count": self._count_reference_included(),
            "school_zone_count": self._count_table(self._ZONES_TABLE),
            "included_cfs_v1_zone_count": self._count_zones_included(),
            "assignment_confidence_distribution": self._get_distribution(
                "school_assignment_confidence", where_sql, params, total
            ),
            "summary_status_distribution": self._get_distribution(
                "school_summary_status", where_sql, params, total
            ),
            "constraint_class_distribution": self._get_distribution(
                "school_constraint_class", where_sql, params, total
            ),
            "reference_exclusion_distribution": self._get_reference_exclusions(),
            "zone_level_distribution": self._get_zone_levels(),
        }

    def filter_school_constraints(
        self,
        filters: SchoolConstraintFilters | None = None,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> SchoolConstraintPage:
        where_sql, params = self._build_where(filters)
        query_params = {**params, "limit": limit, "offset": offset}
        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int AS total_count
                FROM {self._SUMMARY_TABLE}
                {where_sql}
                """
            ),
            params,
        ).scalar_one()

        rows = self._db.execute(
            text(
                f"""
                SELECT {self._FILTER_FIELDS}
                FROM {self._SUMMARY_TABLE}
                {where_sql}
                ORDER BY
                    school_assignment_review_required DESC,
                    school_assignment_confidence ASC,
                    official_parcel_id ASC
                LIMIT :limit OFFSET :offset
                """
            ),
            query_params,
        ).mappings().all()

        return SchoolConstraintPage(
            total_count=_as_int(total),
            records=[dict(row) for row in rows],
        )

    def get_district_summary(
        self,
        *,
        school_level: str | None = None,
        school_name: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        clauses: list[str] = []

        if school_level:
            clauses.append("school_level = :school_level")
            params["school_level"] = school_level
        if school_name:
            clauses.append("school_name ILIKE :school_name")
            params["school_name"] = f"%{school_name}%"

        where_sql = "WHERE " + " AND ".join(clauses) if clauses else ""

        rows = self._db.execute(
            text(
                f"""
                WITH level_rows AS (
                    SELECT
                        'elementary'::text AS school_level,
                        summary.elementary_zone_id AS zone_id,
                        summary.elementary_school_name AS school_name,
                        summary.elementary_school_name_normalized AS school_name_normalized,
                        assignment.elementary_match_confidence AS match_confidence,
                        summary.school_assignment_review_required,
                        summary.school_capacity_data_available
                    FROM {self._SUMMARY_TABLE} AS summary
                    LEFT JOIN {self._ASSIGNMENT_TABLE} AS assignment
                      ON assignment.official_parcel_id = summary.official_parcel_id
                    WHERE summary.elementary_zone_id IS NOT NULL
                    UNION ALL
                    SELECT
                        'middle',
                        summary.middle_zone_id,
                        summary.middle_school_name,
                        summary.middle_school_name_normalized,
                        assignment.middle_match_confidence,
                        summary.school_assignment_review_required,
                        summary.school_capacity_data_available
                    FROM {self._SUMMARY_TABLE} AS summary
                    LEFT JOIN {self._ASSIGNMENT_TABLE} AS assignment
                      ON assignment.official_parcel_id = summary.official_parcel_id
                    WHERE summary.middle_zone_id IS NOT NULL
                    UNION ALL
                    SELECT
                        'high',
                        summary.high_zone_id,
                        summary.high_school_name,
                        summary.high_school_name_normalized,
                        assignment.high_match_confidence,
                        summary.school_assignment_review_required,
                        summary.school_capacity_data_available
                    FROM {self._SUMMARY_TABLE} AS summary
                    LEFT JOIN {self._ASSIGNMENT_TABLE} AS assignment
                      ON assignment.official_parcel_id = summary.official_parcel_id
                    WHERE summary.high_zone_id IS NOT NULL
                )
                SELECT
                    school_level,
                    zone_id,
                    school_name,
                    school_name_normalized,
                    match_confidence,
                    COUNT(*)::int AS parcel_count,
                    COUNT(*) FILTER (WHERE school_assignment_review_required)::int
                        AS review_required_count,
                    COUNT(*) FILTER (WHERE school_capacity_data_available)::int
                        AS capacity_data_available_count,
                    'not_available'::text AS capacity_status
                FROM level_rows
                {where_sql}
                GROUP BY
                    school_level,
                    zone_id,
                    school_name,
                    school_name_normalized,
                    match_confidence
                ORDER BY school_level, parcel_count DESC, school_name ASC
                """
            ),
            params,
        ).mappings().all()

        return [dict(row) for row in rows]

    def get_qa_summary(self) -> dict[str, Any]:
        assignment = self.get_statistics()
        unmatched_rows = self._db.execute(
            text(
                f"""
                SELECT
                    school_level,
                    school_name_raw,
                    school_name_normalized,
                    include_in_cfs_v1,
                    exclusion_reason,
                    match_confidence
                FROM {self._ZONES_TABLE}
                WHERE match_confidence = 'unmatched_reference_review'
                ORDER BY include_in_cfs_v1 DESC, school_level, school_name_raw
                """
            )
        ).mappings().all()

        duplicate_rows = self._db.execute(
            text(
                f"""
                SELECT
                    school_level,
                    school_name_normalized,
                    COUNT(*)::int AS duplicate_count
                FROM {self._REFERENCE_TABLE}
                GROUP BY school_level, school_name_normalized
                HAVING COUNT(*) > 1
                ORDER BY duplicate_count DESC, school_level, school_name_normalized
                """
            )
        ).mappings().all()

        multi_zone = self._db.execute(
            text(
                f"""
                SELECT
                    COUNT(*) FILTER (WHERE multiple_elementary_zone_overlap)::int
                        AS elementary,
                    COUNT(*) FILTER (WHERE multiple_middle_zone_overlap)::int
                        AS middle,
                    COUNT(*) FILTER (WHERE multiple_high_zone_overlap)::int
                        AS high,
                    COUNT(*) FILTER (
                        WHERE multiple_elementary_zone_overlap
                           OR multiple_middle_zone_overlap
                           OR multiple_high_zone_overlap
                    )::int AS any_level,
                    COUNT(*) FILTER (WHERE any_unmatched_school_reference)::int
                        AS unmatched_reference
                FROM {self._ASSIGNMENT_TABLE}
                """
            )
        ).mappings().one()

        return {
            "statistics": assignment,
            "unmatched_zone_names": [dict(row) for row in unmatched_rows],
            "duplicate_normalized_names": [dict(row) for row in duplicate_rows],
            "multi_zone_overlap_counts": dict(multi_zone),
            "capacity_available": self._count_table(self._CAPACITY_TABLE) > 0,
        }

    def get_utilization_seed_rows(
        self,
        *,
        school_level: str | None = None,
        utilization_class: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> SchoolUtilizationSeedPage:
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if school_level:
            clauses.append("school_level = :school_level")
            params["school_level"] = school_level
        if utilization_class:
            clauses.append("utilization_class = :utilization_class")
            params["utilization_class"] = utilization_class

        where_sql = "WHERE " + " AND ".join(clauses) if clauses else ""
        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int
                FROM {self._UTILIZATION_SEED_VIEW}
                {where_sql}
                """
            ),
            {key: value for key, value in params.items() if key not in {"limit", "offset"}},
        ).scalar_one()
        rows = self._db.execute(
            text(
                f"""
                SELECT
                    school_name,
                    school_name_normalized,
                    school_level,
                    school_year,
                    utilization_pct,
                    utilization_class,
                    source_confidence,
                    needs_verification,
                    matched_school_reference_id,
                    match_confidence
                FROM {self._UTILIZATION_SEED_VIEW}
                {where_sql}
                ORDER BY school_level, utilization_pct DESC NULLS LAST, school_name
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        ).mappings().all()
        return SchoolUtilizationSeedPage(
            total_count=_as_int(total),
            records=[dict(row) for row in rows],
        )

    def get_parcel_utilization_seed(
        self, official_parcel_id: str
    ) -> dict[str, Any] | None:
        row = self._db.execute(
            text(
                f"""
                SELECT
                    parcel.official_parcel_id,
                    COALESCE(summary.pin14, parcel.pin14) AS pin14,
                    COALESCE(summary.has_elementary_assignment, FALSE)
                        AS has_elementary_assignment,
                    summary.elementary_school_name,
                    summary.elementary_school_name_normalized,
                    elementary_seed.school_year AS elementary_school_year,
                    elementary_seed.utilization_pct AS elementary_utilization_pct,
                    elementary_seed.utilization_class AS elementary_utilization_class,
                    elementary_seed.source_confidence AS elementary_source_confidence,
                    elementary_seed.needs_verification AS elementary_needs_verification,
                    elementary_seed.matched_school_reference_id
                        AS elementary_matched_school_reference_id,
                    elementary_seed.match_confidence AS elementary_seed_match_confidence,
                    COALESCE(summary.has_middle_assignment, FALSE)
                        AS has_middle_assignment,
                    summary.middle_school_name,
                    summary.middle_school_name_normalized,
                    middle_seed.school_year AS middle_school_year,
                    middle_seed.utilization_pct AS middle_utilization_pct,
                    middle_seed.utilization_class AS middle_utilization_class,
                    middle_seed.source_confidence AS middle_source_confidence,
                    middle_seed.needs_verification AS middle_needs_verification,
                    middle_seed.matched_school_reference_id
                        AS middle_matched_school_reference_id,
                    middle_seed.match_confidence AS middle_seed_match_confidence,
                    COALESCE(summary.has_high_assignment, FALSE)
                        AS has_high_assignment,
                    summary.high_school_name,
                    summary.high_school_name_normalized,
                    high_seed.school_year AS high_school_year,
                    high_seed.utilization_pct AS high_utilization_pct,
                    high_seed.utilization_class AS high_utilization_class,
                    high_seed.source_confidence AS high_source_confidence,
                    high_seed.needs_verification AS high_needs_verification,
                    high_seed.matched_school_reference_id
                        AS high_matched_school_reference_id,
                    high_seed.match_confidence AS high_seed_match_confidence
                FROM {self._PARCEL_TABLE} AS parcel
                LEFT JOIN {self._SUMMARY_TABLE} AS summary
                  ON summary.official_parcel_id = parcel.official_parcel_id
                LEFT JOIN {self._UTILIZATION_SEED_VIEW} AS elementary_seed
                  ON elementary_seed.school_name_normalized =
                    summary.elementary_school_name_normalized
                 AND elementary_seed.school_level = 'elementary'
                LEFT JOIN {self._UTILIZATION_SEED_VIEW} AS middle_seed
                  ON middle_seed.school_name_normalized =
                    summary.middle_school_name_normalized
                 AND middle_seed.school_level = 'middle'
                LEFT JOIN {self._UTILIZATION_SEED_VIEW} AS high_seed
                  ON high_seed.school_name_normalized =
                    summary.high_school_name_normalized
                 AND high_seed.school_level = 'high'
                WHERE parcel.official_parcel_id = :official_parcel_id
                LIMIT 1
                """
            ),
            {"official_parcel_id": official_parcel_id},
        ).mappings().first()
        return dict(row) if row else None

    def get_utilization_zones(
        self,
        *,
        school_level: str | None = None,
        utilization_class: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> SchoolUtilizationZonePage:
        clauses = [
            "zone.include_in_cfs_v1 = TRUE",
            "zone.geometry IS NOT NULL",
        ]
        params: dict[str, Any] = {
            "limit": limit,
            "offset": offset,
        }

        if school_level:
            clauses.append("zone.school_level = :school_level")
            params["school_level"] = school_level

        if utilization_class:
            clauses.append("seed.utilization_class = :utilization_class")
            params["utilization_class"] = utilization_class

        where_sql = "WHERE " + " AND ".join(clauses)
        count_params = {
            key: value for key, value in params.items() if key not in {"limit", "offset"}
        }
        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int
                FROM {self._ZONES_TABLE} AS zone
                JOIN {self._UTILIZATION_SEED_VIEW} AS seed
                  ON seed.school_name_normalized = zone.school_name_normalized
                 AND seed.school_level = zone.school_level
                {where_sql}
                """
            ),
            count_params,
        ).scalar_one()
        rows = self._db.execute(
            text(
                f"""
                SELECT
                    zone.zone_id,
                    zone.school_name_raw AS school_name,
                    zone.school_name_normalized,
                    zone.school_level,
                    zone.school_system,
                    zone.matched_school_reference_id AS zone_matched_school_reference_id,
                    zone.match_confidence AS zone_match_confidence,
                    zone.source_layer,
                    zone.source_objectid,
                    seed.school_year,
                    seed.utilization_pct,
                    seed.utilization_class,
                    seed.source_confidence,
                    seed.needs_verification,
                    seed.matched_school_reference_id,
                    seed.match_confidence,
                    ST_AsGeoJSON(
                        ST_SimplifyPreserveTopology(zone.geometry, 0.000025),
                        6
                    )::json AS geometry
                FROM {self._ZONES_TABLE} AS zone
                JOIN {self._UTILIZATION_SEED_VIEW} AS seed
                  ON seed.school_name_normalized = zone.school_name_normalized
                 AND seed.school_level = zone.school_level
                {where_sql}
                ORDER BY
                    seed.utilization_pct DESC NULLS LAST,
                    zone.school_name_raw,
                    zone.zone_id
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        ).mappings().all()
        return SchoolUtilizationZonePage(
            total_count=_as_int(total),
            records=[dict(row) for row in rows],
        )

    def get_school_pressure_areas(
        self,
        *,
        school_level: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> SchoolPressurePage:
        if not self._relation_exists(self._ZONES_TABLE):
            return SchoolPressurePage(
                permit_data_available=False,
                total_count=0,
                records=[],
            )

        permit_data_available = self._relation_exists(
            self._PERMIT_TABLE,
        ) and self._relation_exists(self._SUMMARY_TABLE)
        clauses = [
            "zone.include_in_cfs_v1 = TRUE",
            "zone.geometry IS NOT NULL",
        ]
        params: dict[str, Any] = {
            "limit": limit,
            "offset": offset,
        }

        if school_level:
            clauses.append("zone.school_level = :school_level")
            params["school_level"] = school_level

        where_sql = "WHERE " + " AND ".join(clauses)
        count_params = {
            key: value for key, value in params.items() if key not in {"limit", "offset"}
        }
        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int
                FROM {self._ZONES_TABLE} AS zone
                {where_sql}
                """
            ),
            count_params,
        ).scalar_one()

        rows = self._db.execute(
            text(
                self._school_pressure_sql(
                    permit_data_available=permit_data_available,
                    where_sql=where_sql,
                )
            ),
            params,
        ).mappings().all()
        return SchoolPressurePage(
            permit_data_available=permit_data_available,
            total_count=_as_int(total),
            records=[dict(row) for row in rows],
        )

    def get_lea_pupil_context_rows(
        self,
        *,
        school_year: int | None = None,
        measure_type: str | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> SchoolLeaPupilContextPage:
        clauses: list[str] = []
        params: dict[str, Any] = {
            "limit": limit,
            "offset": offset,
        }
        if school_year is not None:
            clauses.append("school_year = :school_year")
            params["school_year"] = school_year
        if measure_type:
            clauses.append("LOWER(measure_type) = LOWER(:measure_type)")
            params["measure_type"] = measure_type

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        count_params = {
            key: value for key, value in params.items() if key not in {"limit", "offset"}
        }
        total = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                {where_sql}
                """
            ),
            count_params,
        ).scalar_one()
        rows = self._db.execute(
            text(
                f"""
                SELECT
                    school_year,
                    lea,
                    lea_name,
                    month,
                    measure_type,
                    grade_level,
                    pupil_count,
                    source_file,
                    source_confidence,
                    notes
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                {where_sql}
                ORDER BY
                    school_year DESC,
                    measure_type,
                    CASE grade_level
                      WHEN 'kindergarten' THEN 0
                      WHEN 'grade_1' THEN 1
                      WHEN 'grade_2' THEN 2
                      WHEN 'grade_3' THEN 3
                      WHEN 'grade_4' THEN 4
                      WHEN 'grade_5' THEN 5
                      WHEN 'grade_6' THEN 6
                      WHEN 'grade_7' THEN 7
                      WHEN 'grade_8' THEN 8
                      WHEN 'grade_9' THEN 9
                      WHEN 'grade_10' THEN 10
                      WHEN 'grade_11' THEN 11
                      WHEN 'grade_12' THEN 12
                      WHEN 'grade_13' THEN 13
                      WHEN 'total' THEN 99
                      ELSE 100
                    END
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        ).mappings().all()
        return SchoolLeaPupilContextPage(
            total_count=_as_int(total),
            records=[dict(row) for row in rows],
        )

    def get_lea_pupil_context_summary(
        self,
        *,
        school_year: int | None = None,
    ) -> dict[str, Any]:
        year = school_year or self._db.execute(
            text(
                f"""
                SELECT MAX(school_year)::int
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                """
            )
        ).scalar_one()
        if year is None:
            return {
                "school_year": None,
                "metadata": None,
                "total_rows": 0,
                "totals_by_measure": [],
                "enrollment_by_grade": [],
            }

        params = {"school_year": year}
        metadata = self._db.execute(
            text(
                f"""
                SELECT school_year, lea, lea_name, source_confidence
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                WHERE school_year = :school_year
                ORDER BY lea
                LIMIT 1
                """
            ),
            params,
        ).mappings().first()
        total_rows = self._db.execute(
            text(
                f"""
                SELECT COUNT(*)::int
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                WHERE school_year = :school_year
                """
            ),
            params,
        ).scalar_one()
        totals_by_measure = self._db.execute(
            text(
                f"""
                SELECT measure_type, pupil_count
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                WHERE school_year = :school_year
                  AND grade_level = 'total'
                ORDER BY measure_type
                """
            ),
            params,
        ).mappings().all()
        enrollment_by_grade = self._db.execute(
            text(
                f"""
                SELECT grade_level, pupil_count
                FROM {self._LEA_PUPIL_CONTEXT_TABLE}
                WHERE school_year = :school_year
                  AND measure_type = 'Enrollment'
                ORDER BY
                    CASE grade_level
                      WHEN 'kindergarten' THEN 0
                      WHEN 'grade_1' THEN 1
                      WHEN 'grade_2' THEN 2
                      WHEN 'grade_3' THEN 3
                      WHEN 'grade_4' THEN 4
                      WHEN 'grade_5' THEN 5
                      WHEN 'grade_6' THEN 6
                      WHEN 'grade_7' THEN 7
                      WHEN 'grade_8' THEN 8
                      WHEN 'grade_9' THEN 9
                      WHEN 'grade_10' THEN 10
                      WHEN 'grade_11' THEN 11
                      WHEN 'grade_12' THEN 12
                      WHEN 'grade_13' THEN 13
                      WHEN 'total' THEN 99
                      ELSE 100
                    END
                """
            ),
            params,
        ).mappings().all()
        return {
            "school_year": year,
            "metadata": dict(metadata) if metadata else None,
            "total_rows": _as_int(total_rows),
            "totals_by_measure": [dict(row) for row in totals_by_measure],
            "enrollment_by_grade": [dict(row) for row in enrollment_by_grade],
        }

    def _count_table(self, table_name: str) -> int:
        return _as_int(
            self._db.execute(text(f"SELECT COUNT(*)::int FROM {table_name}")).scalar_one()
        )

    def _count_reference_included(self) -> int:
        return _as_int(
            self._db.execute(
                text(
                    f"""
                    SELECT COUNT(*)::int
                    FROM {self._REFERENCE_TABLE}
                    WHERE include_in_cfs_v1
                      AND school_system = 'CCS'
                    """
                )
            ).scalar_one()
        )

    def _count_zones_included(self) -> int:
        return _as_int(
            self._db.execute(
                text(
                    f"""
                    SELECT COUNT(*)::int
                    FROM {self._ZONES_TABLE}
                    WHERE include_in_cfs_v1
                    """
                )
            ).scalar_one()
        )

    def _get_reference_exclusions(self) -> list[dict[str, Any]]:
        rows = self._db.execute(
            text(
                f"""
                SELECT
                    COALESCE(exclusion_reason, 'included') AS value,
                    COUNT(*)::int AS count
                FROM {self._REFERENCE_TABLE}
                GROUP BY COALESCE(exclusion_reason, 'included')
                ORDER BY count DESC, value ASC
                """
            )
        ).mappings().all()
        return [dict(row) for row in rows]

    def _get_zone_levels(self) -> list[dict[str, Any]]:
        rows = self._db.execute(
            text(
                f"""
                SELECT
                    school_level AS value,
                    COUNT(*)::int AS count
                FROM {self._ZONES_TABLE}
                GROUP BY school_level
                ORDER BY school_level
                """
            )
        ).mappings().all()
        return [dict(row) for row in rows]

    def _relation_exists(self, relation_name: str) -> bool:
        return bool(
            self._db.execute(
                text("SELECT to_regclass(:relation_name) IS NOT NULL"),
                {"relation_name": relation_name},
            ).scalar_one()
        )

    def _school_pressure_sql(self, *, permit_data_available: bool, where_sql: str) -> str:
        utilization_join = (
            f"""
            LEFT JOIN {self._UTILIZATION_SEED_VIEW} AS seed
              ON seed.school_name_normalized = zone.school_name_normalized
             AND seed.school_level = zone.school_level
            """
            if self._relation_exists(self._UTILIZATION_SEED_VIEW)
            else ""
        )
        seed_fields = (
            """
            seed.school_year,
            seed.utilization_pct,
            seed.utilization_class,
            seed.source_confidence,
            seed.needs_verification,
            """
            if utilization_join
            else """
            NULL::text AS school_year,
            NULL::float8 AS utilization_pct,
            NULL::text AS utilization_class,
            'not_available'::text AS source_confidence,
            TRUE AS needs_verification,
            """
        )
        permit_cte = (
            f"""
            , latest_permit_year AS (
                SELECT MAX(activity_year)::int AS max_year
                FROM {self._PERMIT_TABLE}
                WHERE activity_year BETWEEN 1990 AND 2100
            ),
            zone_parcels AS (
                SELECT 'elementary'::text AS school_level,
                       elementary_zone_id AS zone_id,
                       official_parcel_id
                FROM {self._SUMMARY_TABLE}
                WHERE elementary_zone_id IS NOT NULL
                UNION ALL
                SELECT 'middle'::text, middle_zone_id, official_parcel_id
                FROM {self._SUMMARY_TABLE}
                WHERE middle_zone_id IS NOT NULL
                UNION ALL
                SELECT 'high'::text, high_zone_id, official_parcel_id
                FROM {self._SUMMARY_TABLE}
                WHERE high_zone_id IS NOT NULL
            ),
            permit_counts AS (
                SELECT
                    parcels.school_level,
                    parcels.zone_id,
                    COUNT(permit.official_parcel_id) FILTER (
                        WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                    )::int AS permit_count_recent,
                    COUNT(permit.official_parcel_id) FILTER (
                        WHERE permit.activity_year BETWEEN latest.max_year - 5 AND latest.max_year - 3
                    )::int AS permit_count_previous,
                    COUNT(permit.official_parcel_id) FILTER (
                        WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                          AND (
                            permit.permit_type ILIKE '%residential%'
                            OR permit.work_type ILIKE '%residential%'
                            OR permit.work_type ILIKE '%single%'
                            OR permit.work_type ILIKE '%multi%'
                          )
                    )::int AS residential_permit_count_recent,
                    COUNT(permit.official_parcel_id) FILTER (
                        WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                          AND permit.work_type ILIKE '%multi%'
                    )::int AS multifamily_permit_count_recent,
                    COUNT(permit.official_parcel_id) FILTER (
                        WHERE permit.activity_year BETWEEN latest.max_year - 2 AND latest.max_year
                          AND COALESCE(permit.permit_amount, 0) >= 1000000
                    )::int AS major_development_permit_count_recent
                FROM zone_parcels AS parcels
                CROSS JOIN latest_permit_year AS latest
                LEFT JOIN {self._PERMIT_TABLE} AS permit
                  ON permit.official_parcel_id = parcels.official_parcel_id
                GROUP BY parcels.school_level, parcels.zone_id
            )
            """
            if permit_data_available
            else """
            , permit_counts AS (
                SELECT
                    NULL::text AS school_level,
                    NULL::text AS zone_id,
                    NULL::int AS permit_count_recent,
                    NULL::int AS permit_count_previous,
                    NULL::int AS residential_permit_count_recent,
                    NULL::int AS multifamily_permit_count_recent,
                    NULL::int AS major_development_permit_count_recent
                WHERE FALSE
            )
            """
        )
        return f"""
            WITH pressure_zones AS (
                SELECT
                    zone.zone_id,
                    zone.school_name_raw AS school_name,
                    zone.school_name_normalized,
                    zone.school_level,
                    zone.school_system,
                    {seed_fields}
                    ST_AsGeoJSON(
                        ST_SimplifyPreserveTopology(zone.geometry, 0.000025),
                        6
                    )::json AS geometry
                FROM {self._ZONES_TABLE} AS zone
                {utilization_join}
                {where_sql}
            )
            {permit_cte}
            SELECT
                pressure_zones.*,
                permit_counts.permit_count_recent,
                permit_counts.permit_count_previous,
                permit_counts.residential_permit_count_recent,
                permit_counts.multifamily_permit_count_recent,
                permit_counts.major_development_permit_count_recent
            FROM pressure_zones
            LEFT JOIN permit_counts
              ON permit_counts.zone_id = pressure_zones.zone_id
             AND permit_counts.school_level = pressure_zones.school_level
            ORDER BY
                pressure_zones.utilization_pct DESC NULLS LAST,
                COALESCE(permit_counts.permit_count_recent, 0) DESC,
                pressure_zones.school_level,
                pressure_zones.school_name
            LIMIT :limit OFFSET :offset
        """

    def _get_distribution(
        self,
        column_name: str,
        where_sql: str,
        params: dict[str, Any],
        total_count: int,
    ) -> list[dict[str, Any]]:
        allowed_columns = {
            "school_assignment_confidence",
            "school_summary_status",
            "school_constraint_class",
        }
        if column_name not in allowed_columns:
            raise ValueError(f"Unsupported distribution column: {column_name}")

        rows = self._db.execute(
            text(
                f"""
                SELECT
                    COALESCE(NULLIF({column_name}::text, ''), 'unknown') AS value,
                    COUNT(*)::int AS count,
                    CASE
                        WHEN :total_count = 0 THEN NULL
                        ELSE ROUND((COUNT(*) * 100.0 / :total_count)::numeric, 4)
                    END AS percentage
                FROM {self._SUMMARY_TABLE}
                {where_sql}
                GROUP BY COALESCE(NULLIF({column_name}::text, ''), 'unknown')
                ORDER BY count DESC, value ASC
                """
            ),
            {**params, "total_count": total_count},
        ).mappings().all()
        return [dict(row) for row in rows]

    def _build_where(
        self, filters: SchoolConstraintFilters | None
    ) -> tuple[str, dict[str, Any]]:
        if not filters:
            return "", {}

        clauses: list[str] = []
        params: dict[str, Any] = {}
        string_fields = (
            "school_assignment_confidence",
            "school_summary_status",
            "recommended_action",
        )
        for field in string_fields:
            value = getattr(filters, field)
            if value:
                clauses.append(f"LOWER({field}) = LOWER(:{field})")
                params[field] = value

        boolean_map = {
            "school_assignment_review_required": "school_assignment_review_required",
            "has_elementary_assignment": "has_elementary_assignment",
            "has_middle_assignment": "has_middle_assignment",
            "has_high_assignment": "has_high_assignment",
            "capacity_data_available": "school_capacity_data_available",
        }
        for filter_field, column_name in boolean_map.items():
            value = getattr(filters, filter_field)
            if value is not None:
                clauses.append(f"{column_name} = :{filter_field}")
                params[filter_field] = value

        name_fields = (
            "elementary_school_name",
            "middle_school_name",
            "high_school_name",
        )
        for field in name_fields:
            value = getattr(filters, field)
            if value:
                clauses.append(f"{field} ILIKE :{field}")
                params[field] = f"%{value}%"

        if not clauses:
            return "", {}
        return "WHERE " + " AND ".join(clauses), params


def normalize_school_row(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize DB values that need JSON-safe representation."""

    normalized = dict(row)
    for key, value in list(normalized.items()):
        if isinstance(value, Decimal):
            normalized[key] = _as_float(value)
        elif key == "data_quality_flags":
            normalized[key] = _as_list(value)
    return normalized

