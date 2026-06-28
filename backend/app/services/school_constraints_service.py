"""Service layer for school constraint intelligence."""

from __future__ import annotations

from typing import Any

from app.repositories.school_constraints_repository import (
    SchoolConstraintFilters,
    SchoolConstraintsRepository,
    normalize_school_row,
)
from app.schemas.school_constraints import (
    ParcelSchoolUtilizationSeedLevelResponse,
    ParcelSchoolUtilizationSeedResponse,
    SchoolConstraintBucket,
    SchoolConstraintDetailResponse,
    SchoolConstraintFilterResponse,
    SchoolConstraintFilterResult,
    SchoolConstraintStatisticsResponse,
    SchoolDistrictSummaryResponse,
    SchoolDistrictSummaryRow,
    SchoolLeaPupilContextResponse,
    SchoolLeaPupilContextRow,
    SchoolLeaPupilContextSummaryResponse,
    SchoolLeaPupilGradeValue,
    SchoolLeaPupilMeasureTotal,
    SchoolLevelAssignmentResponse,
    SchoolPressureFeatureResponse,
    SchoolPressurePropertiesResponse,
    SchoolPressureResponse,
    SchoolPressureSummaryResponse,
    SchoolQaIssueResponse,
    SchoolQaSummaryResponse,
    SchoolUtilizationSeedPageResponse,
    SchoolUtilizationSeedResponse,
    SchoolUtilizationZonePageResponse,
    SchoolUtilizationZoneResponse,
)


class SchoolConstraintsService:
    """Application logic for read-only school constraint APIs."""

    MAX_LIMIT = 100
    _CAVEATS = [
        "School assignments use attendance-zone polygon overlap; school point distance is not used.",
        "CFS V1 includes public CCS elementary, middle, and high schools only.",
        "KCS, private, magnet, Other, and non-level records are preserved for QA/future work but excluded from V1 assignment.",
        "School capacity and enrollment data are not available yet; capacity status remains not_scored.",
    ]
    _UTILIZATION_SEED_CAVEATS = [
        "Utilization values are manually read from CCS capital planning presentation maps.",
        "Presentation-derived values need verification against official enrollment and capacity files.",
        "The seed does not include enrollment counts, functional capacity, available seats, grade-level enrollment, or projections.",
        "The seed does not populate public.school_capacity and does not enable final school capacity scoring.",
    ]
    _SCHOOL_PRESSURE_CAVEATS = [
        "Preliminary school capacity watch based on current utilization context and observed permit activity inside attendance areas.",
        "Permit activity is not the same as student generation.",
        "Student-level demographic data is not included.",
        "This is not an official enrollment forecast.",
    ]
    _LEA_PUPIL_CONTEXT_CAVEATS = [
        "LEA pupil context is district-level only and is not school-level capacity data.",
        "Counts are not joined to parcels and do not populate public.school_capacity.",
        "Verified school-level enrollment and capacity data is needed before capacity status can be finalized.",
    ]

    def __init__(self, repository: SchoolConstraintsRepository) -> None:
        self._repository = repository

    def get_school_constraint_detail(
        self, official_parcel_id: str
    ) -> SchoolConstraintDetailResponse | None:
        row = self._repository.get_school_constraint_by_parcel(
            official_parcel_id.strip()
        )
        return self._detail_to_schema(row) if row else None

    def get_statistics(
        self, filters: SchoolConstraintFilters | None = None
    ) -> SchoolConstraintStatisticsResponse:
        filters = self._normalize_filters(filters)
        stats = self._repository.get_statistics(filters)
        return SchoolConstraintStatisticsResponse(
            total_parcels=int(stats["total_parcels"] or 0),
            elementary_assigned_parcels=int(
                stats["elementary_assigned_parcels"] or 0
            ),
            middle_assigned_parcels=int(stats["middle_assigned_parcels"] or 0),
            high_assigned_parcels=int(stats["high_assigned_parcels"] or 0),
            missing_elementary_assignment_parcels=int(
                stats["missing_elementary_assignment_parcels"] or 0
            ),
            missing_middle_assignment_parcels=int(
                stats["missing_middle_assignment_parcels"] or 0
            ),
            missing_high_assignment_parcels=int(
                stats["missing_high_assignment_parcels"] or 0
            ),
            assignment_review_required_parcels=int(
                stats["assignment_review_required_parcels"] or 0
            ),
            capacity_data_available_parcels=int(
                stats["capacity_data_available_parcels"] or 0
            ),
            capacity_not_available_parcels=int(
                stats["capacity_not_available_parcels"] or 0
            ),
            school_constraint_score_non_null_parcels=int(
                stats["school_constraint_score_non_null_parcels"] or 0
            ),
            school_reference_count=int(stats["school_reference_count"] or 0),
            included_public_ccs_reference_count=int(
                stats["included_public_ccs_reference_count"] or 0
            ),
            school_zone_count=int(stats["school_zone_count"] or 0),
            included_cfs_v1_zone_count=int(stats["included_cfs_v1_zone_count"] or 0),
            safe_for_api_exposure=True,
            assignment_confidence_distribution=self._buckets(
                stats["assignment_confidence_distribution"]
            ),
            summary_status_distribution=self._buckets(
                stats["summary_status_distribution"]
            ),
            constraint_class_distribution=self._buckets(
                stats["constraint_class_distribution"]
            ),
            reference_exclusion_distribution=self._buckets(
                stats["reference_exclusion_distribution"]
            ),
            zone_level_distribution=self._buckets(stats["zone_level_distribution"]),
            filters_applied=self._filters_applied(filters),
            caveats=self._CAVEATS,
        )

    def filter_school_constraints(
        self,
        filters: SchoolConstraintFilters | None = None,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> SchoolConstraintFilterResponse:
        filters = self._normalize_filters(filters)
        limit = self._clamp_limit(limit)
        offset = max(offset, 0)
        page = self._repository.filter_school_constraints(
            filters,
            limit=limit,
            offset=offset,
        )
        return SchoolConstraintFilterResponse(
            filters_applied=self._filters_applied(filters),
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            results=[
                self._filter_result_to_schema(normalize_school_row(record))
                for record in page.records
            ],
        )

    def get_district_summary(
        self,
        *,
        school_level: str | None = None,
        school_name: str | None = None,
    ) -> SchoolDistrictSummaryResponse:
        level = self._normalize_string(school_level)
        if level and level not in {"elementary", "middle", "high"}:
            raise ValueError("school_level must be elementary, middle, or high")

        name = self._normalize_string(school_name)
        rows = self._repository.get_district_summary(
            school_level=level,
            school_name=name,
        )
        filters_applied: dict[str, Any] = {}
        if level:
            filters_applied["school_level"] = level
        if name:
            filters_applied["school_name"] = name

        return SchoolDistrictSummaryResponse(
            filters_applied=filters_applied,
            total_rows=len(rows),
            districts=[
                SchoolDistrictSummaryRow(
                    school_level=str(row["school_level"]),
                    zone_id=row["zone_id"],
                    school_name=row["school_name"],
                    school_name_normalized=row["school_name_normalized"],
                    match_confidence=row["match_confidence"],
                    parcel_count=int(row["parcel_count"] or 0),
                    review_required_count=int(row["review_required_count"] or 0),
                    capacity_data_available_count=int(
                        row["capacity_data_available_count"] or 0
                    ),
                    capacity_status=row["capacity_status"] or "not_available",
                )
                for row in rows
            ],
            caveats=self._CAVEATS,
        )

    def get_qa_summary(self) -> SchoolQaSummaryResponse:
        qa = self._repository.get_qa_summary()
        stats = qa["statistics"]
        multi_zone = qa["multi_zone_overlap_counts"]
        return SchoolQaSummaryResponse(
            school_reference_count=int(stats["school_reference_count"] or 0),
            included_public_ccs_count=int(
                stats["included_public_ccs_reference_count"] or 0
            ),
            excluded_count_by_reason=[
                bucket
                for bucket in self._buckets(stats["reference_exclusion_distribution"])
                if bucket.value != "included"
            ],
            school_zones_count_by_level=self._buckets(stats["zone_level_distribution"]),
            unmatched_zone_names=[
                self._unmatched_issue(row) for row in qa["unmatched_zone_names"]
            ],
            duplicate_normalized_names=[
                SchoolQaIssueResponse(
                    issue_type="duplicate_normalized_school_name",
                    severity="review",
                    school_level=row["school_level"],
                    school_name=row["school_name_normalized"],
                    detail=f"Duplicate normalized reference name appears {row['duplicate_count']} times.",
                    recommended_action="Review school reference dictionary before API/UI production use.",
                )
                for row in qa["duplicate_normalized_names"]
            ],
            parcel_assignment_count=int(stats["total_parcels"] or 0),
            missing_elementary_assignment_count=int(
                stats["missing_elementary_assignment_parcels"] or 0
            ),
            missing_middle_assignment_count=int(
                stats["missing_middle_assignment_parcels"] or 0
            ),
            missing_high_assignment_count=int(
                stats["missing_high_assignment_parcels"] or 0
            ),
            multi_zone_overlap_counts={
                key: int(value or 0) for key, value in multi_zone.items()
            },
            parcels_assigned_to_unmatched_school_zones=int(
                multi_zone["unmatched_reference"] or 0
            ),
            capacity_available=bool(qa["capacity_available"]),
            safe_for_api_exposure=True,
            caveats=self._CAVEATS
            + [
                "Safe for read-only assignment/QA API exposure, not for final school capacity scoring.",
                "Included unmatched CCS zone names remain review-required rather than force-matched.",
            ],
        )

    def get_utilization_seed_rows(
        self,
        *,
        school_level: str | None = None,
        utilization_class: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> SchoolUtilizationSeedPageResponse:
        level = self._normalize_string(school_level)
        if level and level not in {"elementary", "middle", "high"}:
            raise ValueError("school_level must be elementary, middle, or high")
        utilization = self._normalize_utilization_class(utilization_class)

        limit = max(1, min(limit, 500))
        offset = max(offset, 0)
        page = self._repository.get_utilization_seed_rows(
            school_level=level,
            utilization_class=utilization,
            limit=limit,
            offset=offset,
        )
        filters_applied: dict[str, Any] = {}
        if level:
            filters_applied["school_level"] = level
        if utilization:
            filters_applied["utilization_class"] = utilization
        return SchoolUtilizationSeedPageResponse(
            filters_applied=filters_applied,
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            rows=[self._seed_row_to_schema(record) for record in page.records],
            caveats=self._UTILIZATION_SEED_CAVEATS,
        )

    def get_parcel_utilization_seed(
        self, official_parcel_id: str
    ) -> ParcelSchoolUtilizationSeedResponse | None:
        row = self._repository.get_parcel_utilization_seed(
            official_parcel_id.strip()
        )
        if row is None:
            return None
        return ParcelSchoolUtilizationSeedResponse(
            official_parcel_id=str(row["official_parcel_id"]),
            pin14=row["pin14"],
            elementary=self._parcel_seed_level(row, "elementary"),
            middle=self._parcel_seed_level(row, "middle"),
            high=self._parcel_seed_level(row, "high"),
            source_confidence="presentation_derived",
            needs_verification=True,
            school_constraint_score=None,
            school_constraint_class="not_scored",
            final_capacity_scoring_enabled=False,
            caveats=self._UTILIZATION_SEED_CAVEATS,
        )

    def get_utilization_zones(
        self,
        *,
        school_level: str = "all",
        utilization_class: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> SchoolUtilizationZonePageResponse:
        level = self._normalize_string(school_level) or "all"
        if level not in {"all", "elementary", "middle", "high"}:
            raise ValueError("level must be all, elementary, middle, or high")
        utilization = self._normalize_utilization_class(utilization_class)

        limit = max(1, min(limit, 500))
        offset = max(offset, 0)
        page = self._repository.get_utilization_zones(
            school_level=None if level == "all" else level,
            utilization_class=utilization,
            limit=limit,
            offset=offset,
        )
        filters_applied: dict[str, Any] = {"level": level}
        if utilization:
            filters_applied["utilization_class"] = utilization
        return SchoolUtilizationZonePageResponse(
            filters_applied=filters_applied,
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            zones=[self._seed_zone_to_schema(record) for record in page.records],
            caveats=self._UTILIZATION_SEED_CAVEATS,
        )

    def get_school_pressure(
        self,
        *,
        school_level: str = "all",
        limit: int = 100,
        offset: int = 0,
    ) -> SchoolPressureResponse:
        level = self._normalize_string(school_level) or "all"
        if level not in {"all", "elementary", "middle", "high"}:
            raise ValueError("level must be all, elementary, middle, or high")

        limit = max(1, min(limit, 500))
        offset = max(offset, 0)
        page = self._repository.get_school_pressure_areas(
            school_level=None if level == "all" else level,
            limit=limit,
            offset=offset,
        )
        features = [
            self._school_pressure_feature(row, page.permit_data_available)
            for row in page.records
        ]
        properties = [feature.properties for feature in features]
        return SchoolPressureResponse(
            as_of=None,
            caveats=self._SCHOOL_PRESSURE_CAVEATS,
            data_coverage_notes=[
                "Observed permit activity joined by parcel assignment to school attendance areas."
                if page.permit_data_available
                else "Permit activity table or school assignment join is not available; permit pressure fields are data needed.",
                "Official school enrollment/capacity verification is still needed.",
            ],
            features=features,
            limit=limit,
            mode="live",
            offset=offset,
            summary=SchoolPressureSummaryResponse(
                areas_analyzed=len(features),
                areas_with_recent_permits=sum(
                    1 for item in properties if (item.permit_count_recent or 0) > 0
                ),
                areas_with_utilization=sum(
                    1 for item in properties if item.utilization_pct is not None
                ),
                data_needed_count=sum(
                    1
                    for item in properties
                    if item.school_pressure_watch_band == "data needed"
                ),
                elevated_review_count=sum(
                    1
                    for item in properties
                    if item.school_pressure_watch_band == "elevated review"
                ),
                recent_residential_permits_in_watched_areas=sum(
                    item.residential_permit_count_recent or 0
                    for item in properties
                    if item.school_pressure_watch_band
                    in {"review", "elevated review"}
                ),
            ),
            total_count=page.total_count,
        )

    def get_lea_pupil_context_rows(
        self,
        *,
        school_year: int | None = None,
        measure_type: str | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> SchoolLeaPupilContextResponse:
        measure = self._normalize_measure_type(measure_type)
        limit = max(1, min(limit, 1000))
        offset = max(offset, 0)
        page = self._repository.get_lea_pupil_context_rows(
            school_year=school_year,
            measure_type=measure,
            limit=limit,
            offset=offset,
        )
        filters_applied: dict[str, Any] = {}
        if school_year is not None:
            filters_applied["school_year"] = school_year
        if measure:
            filters_applied["measure_type"] = measure
        return SchoolLeaPupilContextResponse(
            filters_applied=filters_applied,
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            rows=[
                SchoolLeaPupilContextRow(
                    school_year=int(row["school_year"]),
                    lea=str(row["lea"]),
                    lea_name=row["lea_name"],
                    month=row["month"],
                    measure_type=row["measure_type"],
                    grade_level=row["grade_level"],
                    pupil_count=row["pupil_count"],
                    source_file=row["source_file"],
                    source_confidence=row["source_confidence"]
                    or "uploaded_lea_pupil_file",
                    notes=row["notes"],
                )
                for row in page.records
            ],
            caveats=self._LEA_PUPIL_CONTEXT_CAVEATS,
        )

    def get_lea_pupil_context_summary(
        self,
        *,
        school_year: int | None = None,
    ) -> SchoolLeaPupilContextSummaryResponse:
        summary = self._repository.get_lea_pupil_context_summary(
            school_year=school_year,
        )
        metadata = summary["metadata"] or {}
        return SchoolLeaPupilContextSummaryResponse(
            school_year=summary["school_year"],
            lea=metadata.get("lea"),
            lea_name=metadata.get("lea_name"),
            source_confidence=metadata.get("source_confidence")
            or "uploaded_lea_pupil_file",
            total_rows=int(summary["total_rows"] or 0),
            totals_by_measure=[
                SchoolLeaPupilMeasureTotal(
                    measure_type=row["measure_type"],
                    pupil_count=row["pupil_count"],
                )
                for row in summary["totals_by_measure"]
            ],
            enrollment_by_grade=[
                SchoolLeaPupilGradeValue(
                    grade_level=row["grade_level"],
                    pupil_count=row["pupil_count"],
                )
                for row in summary["enrollment_by_grade"]
            ],
            caveats=self._LEA_PUPIL_CONTEXT_CAVEATS,
        )

    def _normalize_filters(
        self, filters: SchoolConstraintFilters | None
    ) -> SchoolConstraintFilters:
        filters = filters or SchoolConstraintFilters()
        return SchoolConstraintFilters(
            school_assignment_confidence=self._normalize_string(
                filters.school_assignment_confidence
            ),
            school_assignment_review_required=filters.school_assignment_review_required,
            school_summary_status=self._normalize_string(filters.school_summary_status),
            recommended_action=self._normalize_string(filters.recommended_action),
            elementary_school_name=self._normalize_string(filters.elementary_school_name),
            middle_school_name=self._normalize_string(filters.middle_school_name),
            high_school_name=self._normalize_string(filters.high_school_name),
            has_elementary_assignment=filters.has_elementary_assignment,
            has_middle_assignment=filters.has_middle_assignment,
            has_high_assignment=filters.has_high_assignment,
            capacity_data_available=filters.capacity_data_available,
        )

    def _detail_to_schema(self, row: dict[str, Any]) -> SchoolConstraintDetailResponse:
        record = normalize_school_row(row)
        return SchoolConstraintDetailResponse(
            official_parcel_id=str(record["official_parcel_id"]),
            pin14=record["pin14"],
            objectid_1=record["objectid_1"],
            elementary=self._level_assignment(record, "elementary"),
            middle=self._level_assignment(record, "middle"),
            high=self._level_assignment(record, "high"),
            school_assignment_confidence=record["school_assignment_confidence"],
            school_assignment_review_required=bool(
                record["school_assignment_review_required"]
            ),
            assignment_method=record["assignment_method"],
            school_capacity_data_available=bool(
                record["school_capacity_data_available"]
            ),
            school_capacity_review_required=bool(
                record["school_capacity_review_required"]
            ),
            school_capacity_score=record["school_capacity_score"],
            school_constraint_score=record["school_constraint_score"],
            school_constraint_class=record["school_constraint_class"] or "not_scored",
            school_summary_status=record["school_summary_status"],
            recommended_action=record["recommended_action"],
            data_quality_flags=record["data_quality_flags"],
            caveats=self._CAVEATS,
        )

    def _level_assignment(
        self, record: dict[str, Any], level: str
    ) -> SchoolLevelAssignmentResponse:
        return SchoolLevelAssignmentResponse(
            zone_id=record[f"{level}_zone_id"],
            school_name=record[f"{level}_school_name"],
            school_name_normalized=record[f"{level}_school_name_normalized"],
            has_assignment=bool(record[f"has_{level}_assignment"]),
            overlap_area_acres=record.get(f"{level}_overlap_area_acres"),
            overlap_percent=record.get(f"{level}_overlap_percent"),
            match_confidence=record.get(f"{level}_match_confidence"),
            capacity_status=record.get(f"{level}_capacity_status") or "not_available",
            utilization_percent=record.get(f"{level}_utilization_percent"),
            available_seats=record.get(f"{level}_available_seats"),
        )

    def _filter_result_to_schema(
        self, record: dict[str, Any]
    ) -> SchoolConstraintFilterResult:
        return SchoolConstraintFilterResult(
            official_parcel_id=str(record["official_parcel_id"]),
            pin14=record["pin14"],
            elementary_school_name=record["elementary_school_name"],
            middle_school_name=record["middle_school_name"],
            high_school_name=record["high_school_name"],
            has_elementary_assignment=bool(record["has_elementary_assignment"]),
            has_middle_assignment=bool(record["has_middle_assignment"]),
            has_high_assignment=bool(record["has_high_assignment"]),
            school_assignment_confidence=record["school_assignment_confidence"],
            school_assignment_review_required=bool(
                record["school_assignment_review_required"]
            ),
            school_capacity_data_available=bool(
                record["school_capacity_data_available"]
            ),
            school_constraint_class=record["school_constraint_class"] or "not_scored",
            school_summary_status=record["school_summary_status"],
            recommended_action=record["recommended_action"],
            data_quality_flags=record["data_quality_flags"],
        )

    def _unmatched_issue(self, row: dict[str, Any]) -> SchoolQaIssueResponse:
        included = bool(row["include_in_cfs_v1"])
        severity = "review" if included else "info"
        if included:
            detail = (
                "Included CCS attendance zone has no matching school reference point record. "
                "Keep assignment by attendance-zone polygon but review the reference dictionary."
            )
            action = "Review source reference layer or add governed reference alias if approved."
        else:
            detail = (
                "Excluded/non-CCS attendance zone is preserved for QA and future policy expansion."
            )
            action = "No CFS V1 action required unless scope expands."

        return SchoolQaIssueResponse(
            issue_type="unmatched_zone_reference",
            severity=severity,
            school_level=row["school_level"],
            school_name=row["school_name_raw"],
            detail=detail,
            recommended_action=action,
        )

    def _seed_row_to_schema(
        self, row: dict[str, Any]
    ) -> SchoolUtilizationSeedResponse:
        return SchoolUtilizationSeedResponse(
            school_name=row["school_name"],
            school_name_normalized=row["school_name_normalized"],
            school_level=row["school_level"],
            school_year=row["school_year"],
            utilization_pct=row["utilization_pct"],
            utilization_class=row["utilization_class"],
            source_confidence=row["source_confidence"] or "presentation_derived",
            needs_verification=bool(row["needs_verification"]),
            matched_school_reference_id=row["matched_school_reference_id"],
            match_confidence=row["match_confidence"],
        )

    def _parcel_seed_level(
        self, row: dict[str, Any], level: str
    ) -> ParcelSchoolUtilizationSeedLevelResponse:
        seed = None
        if row.get(f"{level}_utilization_pct") is not None:
            seed = SchoolUtilizationSeedResponse(
                school_name=row.get(f"{level}_school_name"),
                school_name_normalized=row.get(f"{level}_school_name_normalized"),
                school_level=level,
                school_year=row.get(f"{level}_school_year"),
                utilization_pct=row.get(f"{level}_utilization_pct"),
                utilization_class=row.get(f"{level}_utilization_class"),
                source_confidence=row.get(f"{level}_source_confidence")
                or "presentation_derived",
                needs_verification=bool(
                    row.get(f"{level}_needs_verification")
                    if row.get(f"{level}_needs_verification") is not None
                    else True
                ),
                matched_school_reference_id=row.get(
                    f"{level}_matched_school_reference_id"
                ),
                match_confidence=row.get(f"{level}_seed_match_confidence"),
            )
        return ParcelSchoolUtilizationSeedLevelResponse(
            school_name=row.get(f"{level}_school_name"),
            school_name_normalized=row.get(f"{level}_school_name_normalized"),
            has_assignment=bool(row.get(f"has_{level}_assignment")),
            utilization_seed=seed,
        )

    def _seed_zone_to_schema(
        self, row: dict[str, Any]
    ) -> SchoolUtilizationZoneResponse:
        return SchoolUtilizationZoneResponse(
            zone_id=str(row["zone_id"]),
            school_name=row["school_name"],
            school_name_normalized=row["school_name_normalized"],
            school_level=row["school_level"],
            school_system=row["school_system"],
            school_year=row["school_year"],
            utilization_pct=row["utilization_pct"],
            utilization_class=row["utilization_class"],
            source_confidence=row["source_confidence"] or "presentation_derived",
            needs_verification=bool(row["needs_verification"]),
            matched_school_reference_id=row["matched_school_reference_id"],
            match_confidence=row["match_confidence"],
            zone_match_confidence=row["zone_match_confidence"],
            source_layer=row["source_layer"],
            source_objectid=row["source_objectid"],
            geometry=row["geometry"],
        )

    def _school_pressure_feature(
        self,
        row: dict[str, Any],
        permit_data_available: bool,
    ) -> SchoolPressureFeatureResponse:
        utilization_pct = _float_or_none(row.get("utilization_pct"))
        utilization_status = row.get("utilization_class") or _utilization_status(
            utilization_pct,
        )
        recent = _int_or_none(row.get("permit_count_recent"))
        previous = _int_or_none(row.get("permit_count_previous"))
        delta = (
            recent - previous
            if recent is not None and previous is not None
            else None
        )
        growth_pct = (
            round((delta / previous) * 100, 1)
            if delta is not None and previous and previous > 0
            else None
        )
        growth_band = _growth_pressure_band(recent)
        watch_band = _school_pressure_watch_band(
            permit_data_available=permit_data_available,
            recent=recent,
            utilization_status=utilization_status,
            utilization_pct=utilization_pct,
        )
        top_reasons = _school_pressure_reasons(
            permit_data_available=permit_data_available,
            recent=recent,
            utilization_status=utilization_status,
            utilization_pct=utilization_pct,
        )
        caveats = list(self._SCHOOL_PRESSURE_CAVEATS)
        if row.get("needs_verification", True):
            caveats.append("Utilization context needs official verification.")

        return SchoolPressureFeatureResponse(
            geometry=row.get("geometry"),
            properties=SchoolPressurePropertiesResponse(
                attendance_area_id=row.get("zone_id"),
                caveats=caveats,
                enrollment_year=row.get("school_year"),
                major_development_permit_count_recent=_int_or_none(
                    row.get("major_development_permit_count_recent"),
                ),
                multifamily_permit_count_recent=_int_or_none(
                    row.get("multifamily_permit_count_recent"),
                ),
                observed_growth_pressure_band=growth_band,
                permit_count_previous=previous,
                permit_count_recent=recent,
                permit_growth_delta=delta,
                permit_growth_pct=growth_pct,
                recommended_followup=_school_pressure_followup(watch_band),
                residential_permit_count_recent=_int_or_none(
                    row.get("residential_permit_count_recent"),
                ),
                school_level=row.get("school_level"),
                school_name=row.get("school_name"),
                school_pressure_watch_band=watch_band,
                top_reasons=top_reasons,
                utilization_pct=utilization_pct,
                utilization_status=utilization_status,
            ),
        )

    def _buckets(self, rows: list[dict[str, Any]]) -> list[SchoolConstraintBucket]:
        return [
            SchoolConstraintBucket(
                value=str(row["value"]),
                count=int(row["count"] or 0),
                percentage=row.get("percentage"),
            )
            for row in rows
        ]

    def _filters_applied(
        self, filters: SchoolConstraintFilters | None
    ) -> dict[str, Any]:
        if not filters:
            return {}
        applied: dict[str, Any] = {}
        for field in (
            "school_assignment_confidence",
            "school_assignment_review_required",
            "school_summary_status",
            "recommended_action",
            "elementary_school_name",
            "middle_school_name",
            "high_school_name",
            "has_elementary_assignment",
            "has_middle_assignment",
            "has_high_assignment",
            "capacity_data_available",
        ):
            value = getattr(filters, field)
            if value is not None:
                applied[field] = value
        return applied

    def _clamp_limit(self, limit: int) -> int:
        return max(1, min(limit, self.MAX_LIMIT))

    def _normalize_string(self, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    def _normalize_measure_type(self, value: str | None) -> str | None:
        measure = self._normalize_string(value)
        if not measure:
            return None
        normalized = measure.lower()
        aliases = {
            "enrollment": "Enrollment",
            "adm": "ADM",
            "ada": "ADA",
            "mld": "MLD",
        }
        if normalized not in aliases:
            raise ValueError("measure_type must be Enrollment, ADM, ADA, or MLD")
        return aliases[normalized]

    def _normalize_utilization_class(self, value: str | None) -> str | None:
        utilization = self._normalize_string(value)
        if not utilization:
            return None
        aliases = {
            "under_capacity": "under_capacity",
            "approaching_capacity": "approaching_capacity",
            "near_capacity": "approaching_capacity",
            "over_capacity": "over_capacity",
            "severely_over_capacity": "severely_over_capacity",
        }
        normalized = aliases.get(utilization)
        if not normalized:
            raise ValueError(
                "utilization_class must be under_capacity, approaching_capacity, over_capacity, or severely_over_capacity"
            )
        return normalized


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _utilization_status(utilization_pct: float | None) -> str | None:
    if utilization_pct is None:
        return None
    if utilization_pct >= 110:
        return "severely_over_capacity"
    if utilization_pct >= 100:
        return "over_capacity"
    if utilization_pct >= 90:
        return "near_capacity"
    if utilization_pct >= 80:
        return "approaching_capacity"
    return "under_capacity"


def _growth_pressure_band(recent: int | None) -> str:
    if recent is None:
        return "unknown"
    if recent >= 40:
        return "high"
    if recent >= 15:
        return "elevated"
    if recent >= 5:
        return "moderate"
    return "low"


def _school_pressure_watch_band(
    *,
    permit_data_available: bool,
    recent: int | None,
    utilization_pct: float | None,
    utilization_status: str | None,
) -> str:
    if utilization_pct is None or not permit_data_available or recent is None:
        return "data needed"

    high_utilization = utilization_status in {
        "near_capacity",
        "over_capacity",
        "severely_over_capacity",
    }
    high_growth = recent >= 15
    moderate_growth = recent >= 5

    if high_utilization and high_growth:
        return "elevated review"
    if high_utilization or moderate_growth:
        return "review"
    return "monitor"


def _school_pressure_reasons(
    *,
    permit_data_available: bool,
    recent: int | None,
    utilization_pct: float | None,
    utilization_status: str | None,
) -> list[str]:
    reasons: list[str] = []
    if utilization_pct is None:
        reasons.append("Utilization context is not available from the current source.")
    elif utilization_status in {
        "near_capacity",
        "over_capacity",
        "severely_over_capacity",
    }:
        reasons.append("Current utilization context is near or above local review thresholds.")
    else:
        reasons.append("Current utilization context is below local review thresholds.")

    if not permit_data_available or recent is None:
        reasons.append("Observed permit activity by attendance area is data needed.")
    elif recent >= 15:
        reasons.append("Recent observed permit activity is elevated inside the attendance area.")
    elif recent > 0:
        reasons.append("Observed permit activity exists inside the attendance area.")
    else:
        reasons.append("No recent observed permit activity was joined to this attendance area.")
    return reasons


def _school_pressure_followup(watch_band: str) -> str:
    if watch_band == "data needed":
        return "Request official enrollment/capacity data and confirm permit-to-attendance-area coverage."
    if watch_band == "elevated review":
        return "Review enrollment trends, approved subdivisions, and school capacity assumptions."
    if watch_band == "review":
        return "Review school utilization context with recent residential permit activity."
    return "Monitor as part of regular planning review."
