"""Service layer for constraint intelligence."""

from __future__ import annotations

from typing import Any

from app.repositories.constraints_repository import (
    ConstraintsRepository,
    FloodConstraintBucket as RepositoryBucket,
    FloodConstraintFilters,
    FloodConstraintRecord,
    FloodConstraintStatistics,
    FloodZoneFilters,
    FloodZoneRecord,
)
from app.schemas.constraints import (
    FloodConstraintBucket,
    FloodConstraintDetailResponse,
    FloodConstraintFilterResponse,
    FloodConstraintStatisticsResponse,
    FloodConstraintSummaryResponse,
    FloodZoneGeometryResponse,
    FloodZonePageResponse,
    FloodZoneResponse,
    SpatialReferenceResponse,
)


class ConstraintsService:
    """Application logic for parcel constraint APIs."""

    MAX_LIMIT = 100
    MAX_FLOOD_ZONE_LIMIT = 1000

    def __init__(self, repository: ConstraintsRepository) -> None:
        self._repository = repository

    def get_flood_constraint_detail(
        self, official_parcel_id: str
    ) -> FloodConstraintDetailResponse | None:
        record = self._repository.get_flood_constraint_by_parcel(
            official_parcel_id.strip()
        )
        return self._record_to_schema(record) if record else None

    def get_flood_statistics(
        self, filters: FloodConstraintFilters | None = None
    ) -> FloodConstraintStatisticsResponse:
        filters = self._normalize_filters(filters)
        stats = self._repository.get_flood_statistics(filters)
        return self._statistics_to_schema(stats, self._filters_applied(filters))

    def filter_flood_constraints(
        self,
        filters: FloodConstraintFilters | None = None,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> FloodConstraintFilterResponse:
        filters = self._normalize_filters(filters)
        limit = self._clamp_limit(limit)
        offset = max(offset, 0)
        page = self._repository.filter_flood_constraints(
            filters,
            limit=limit,
            offset=offset,
        )
        return FloodConstraintFilterResponse(
            filters_applied=self._filters_applied(filters),
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            results=[self._record_to_schema(record) for record in page.records],
        )

    def get_high_review_flood_constraints(
        self,
        filters: FloodConstraintFilters | None = None,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> FloodConstraintFilterResponse:
        filters = self._normalize_filters(filters)
        limit = self._clamp_limit(limit)
        offset = max(offset, 0)
        page = self._repository.filter_flood_constraints(
            filters,
            limit=limit,
            offset=offset,
            high_review_only=True,
        )
        applied = self._filters_applied(filters)
        applied["flood_review_required"] = True
        return FloodConstraintFilterResponse(
            filters_applied=applied,
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            results=[self._record_to_schema(record) for record in page.records],
        )

    def get_flood_summary(
        self, filters: FloodConstraintFilters | None = None
    ) -> FloodConstraintSummaryResponse:
        filters = self._normalize_filters(filters)
        summary = self._repository.get_flood_summary(filters)
        stats = summary.statistics
        return FloodConstraintSummaryResponse(
            filters_applied=self._filters_applied(filters),
            total_parcels=stats.total_parcels,
            floodplain_parcels=stats.floodplain_parcels,
            floodway_parcels=stats.floodway_parcels,
            sfha_parcels=stats.sfha_parcels,
            review_required_parcels=stats.review_required_parcels,
            high_severe_buildability_parcels=stats.high_severe_buildability_parcels,
            average_percent_constrained=summary.average_percent_constrained,
            max_percent_constrained=summary.max_percent_constrained,
            severity_distribution=self._buckets_to_schema(stats.severity_distribution),
            buildability_impact_distribution=self._buckets_to_schema(
                stats.buildability_impact_distribution
            ),
            dominant_zone_distribution=self._buckets_to_schema(
                stats.dominant_zone_distribution
            ),
            caveats=[
                "Flood constraints use FEMA NFHL Layer 28 regulatory flood zones.",
                "Scores are parcel overlay indicators, not development approvals.",
                "Full production use should include local review of SFHA and floodway cases.",
            ],
        )

    def get_flood_zones(
        self,
        filters: FloodZoneFilters | None = None,
        *,
        limit: int = 500,
        offset: int = 0,
    ) -> FloodZonePageResponse:
        filters = self._normalize_zone_filters(filters)
        limit = self._clamp_zone_limit(limit, filters)
        offset = max(offset, 0)
        page = self._repository.get_flood_zones(
            filters,
            limit=limit,
            offset=offset,
        )

        return FloodZonePageResponse(
            filters_applied=self._zone_filters_applied(filters),
            limit=limit,
            offset=offset,
            total_count=page.total_count,
            zones=[self._zone_to_schema(zone) for zone in page.zones],
        )

    def _normalize_filters(
        self, filters: FloodConstraintFilters | None
    ) -> FloodConstraintFilters:
        filters = filters or FloodConstraintFilters()
        if (
            filters.percent_constrained_min is not None
            and filters.percent_constrained_max is not None
            and filters.percent_constrained_min > filters.percent_constrained_max
        ):
            raise ValueError(
                "percent_constrained_min cannot be greater than percent_constrained_max"
            )

        return FloodConstraintFilters(
            floodplain_present=filters.floodplain_present,
            floodway_present=filters.floodway_present,
            sfha_present=filters.sfha_present,
            moderate_flood_present=filters.moderate_flood_present,
            flood_review_required=filters.flood_review_required,
            buildability_impact=self._normalize_string(filters.buildability_impact),
            flood_severity_class=self._normalize_string(filters.flood_severity_class),
            dominant_flood_zone=self._normalize_string(filters.dominant_flood_zone),
            percent_constrained_min=filters.percent_constrained_min,
            percent_constrained_max=filters.percent_constrained_max,
        )

    def _normalize_zone_filters(
        self, filters: FloodZoneFilters | None
    ) -> FloodZoneFilters:
        filters = filters or FloodZoneFilters()
        extent = filters.extent

        if extent:
            xmin, ymin, xmax, ymax = extent
            if xmin >= xmax or ymin >= ymax:
                raise ValueError("extent must be xmin,ymin,xmax,ymax with min < max")
            if not (-180 <= xmin <= 180 and -180 <= xmax <= 180):
                raise ValueError("extent longitude values must be between -180 and 180")
            if not (-90 <= ymin <= 90 and -90 <= ymax <= 90):
                raise ValueError("extent latitude values must be between -90 and 90")

        return FloodZoneFilters(
            extent=extent,
            flood_constraint_type=self._normalize_string(
                filters.flood_constraint_type
            ),
            flood_severity_class=self._normalize_string(
                filters.flood_severity_class
            ),
        )

    def _filters_applied(self, filters: FloodConstraintFilters | None) -> dict[str, Any]:
        if not filters:
            return {}
        applied: dict[str, Any] = {}
        for field in (
            "floodplain_present",
            "floodway_present",
            "sfha_present",
            "moderate_flood_present",
            "flood_review_required",
            "buildability_impact",
            "flood_severity_class",
            "dominant_flood_zone",
            "percent_constrained_min",
            "percent_constrained_max",
        ):
            value = getattr(filters, field)
            if value is not None:
                applied[field] = value
        return applied

    def _zone_filters_applied(self, filters: FloodZoneFilters | None) -> dict[str, Any]:
        if not filters:
            return {}
        applied: dict[str, Any] = {}
        for field in ("flood_constraint_type", "flood_severity_class"):
            value = getattr(filters, field)
            if value is not None:
                applied[field] = value
        if filters.extent is not None:
            applied["extent"] = ",".join(str(value) for value in filters.extent)
        return applied

    def _record_to_schema(
        self, record: FloodConstraintRecord
    ) -> FloodConstraintDetailResponse:
        return FloodConstraintDetailResponse(
            official_parcel_id=record.official_parcel_id,
            pin14=record.pin14,
            dominant_flood_zone=record.dominant_flood_zone,
            flood_zone_codes=record.flood_zone_codes,
            floodplain_present=record.floodplain_present,
            floodway_present=record.floodway_present,
            sfha_present=record.sfha_present,
            moderate_flood_present=record.moderate_flood_present,
            minimal_flood_present=record.minimal_flood_present,
            parcel_area_acres=record.parcel_area_acres,
            flood_constrained_area_acres=record.flood_constrained_area_acres,
            floodway_area_acres=record.floodway_area_acres,
            sfha_area_acres=record.sfha_area_acres,
            percent_parcel_constrained=record.percent_parcel_constrained,
            percent_parcel_floodway=record.percent_parcel_floodway,
            percent_parcel_sfha=record.percent_parcel_sfha,
            flood_review_required=record.flood_review_required,
            buildability_impact=record.buildability_impact,
            flood_constraint_score=record.flood_constraint_score,
            flood_severity_class=record.flood_severity_class,
            overlay_confidence=record.overlay_confidence,
        )

    def _zone_to_schema(self, zone: FloodZoneRecord) -> FloodZoneResponse:
        return FloodZoneResponse(
            flood_constraint_type=zone.flood_constraint_type,
            flood_severity_class=zone.flood_severity_class,
            flood_zone_code=zone.flood_zone_code,
            flood_zone_internal_id=zone.flood_zone_internal_id,
            fld_ar_id=zone.fld_ar_id,
            geometry=FloodZoneGeometryResponse(
                coordinates=zone.geometry.get("coordinates", []),
                spatial_reference=SpatialReferenceResponse(wkid=4326),
                type=str(zone.geometry.get("type", "MultiPolygon")),
            ),
            gfid=zone.gfid,
            globalid=zone.globalid,
            source_layer=zone.source_layer,
            source_objectid=zone.source_objectid,
        )

    def _statistics_to_schema(
        self,
        stats: FloodConstraintStatistics,
        filters_applied: dict[str, Any],
    ) -> FloodConstraintStatisticsResponse:
        return FloodConstraintStatisticsResponse(
            total_parcels=stats.total_parcels,
            floodplain_parcels=stats.floodplain_parcels,
            floodway_parcels=stats.floodway_parcels,
            sfha_parcels=stats.sfha_parcels,
            review_required_parcels=stats.review_required_parcels,
            high_severe_buildability_parcels=stats.high_severe_buildability_parcels,
            severity_distribution=self._buckets_to_schema(stats.severity_distribution),
            buildability_impact_distribution=self._buckets_to_schema(
                stats.buildability_impact_distribution
            ),
            dominant_zone_distribution=self._buckets_to_schema(
                stats.dominant_zone_distribution
            ),
            filters_applied=filters_applied,
        )

    def _buckets_to_schema(
        self, buckets: list[RepositoryBucket]
    ) -> list[FloodConstraintBucket]:
        return [
            FloodConstraintBucket(
                value=bucket.value,
                parcel_count=bucket.parcel_count,
                percentage=bucket.percentage,
            )
            for bucket in buckets
        ]

    def _clamp_limit(self, limit: int) -> int:
        return max(1, min(limit, self.MAX_LIMIT))

    def _clamp_zone_limit(
        self, limit: int, filters: FloodZoneFilters
    ) -> int | None:
        if limit == 0 and filters.extent is not None:
            return None
        return max(1, min(limit, self.MAX_FLOOD_ZONE_LIMIT))

    def _normalize_string(self, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
