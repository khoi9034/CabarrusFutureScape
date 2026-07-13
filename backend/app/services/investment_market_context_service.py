"""ACS market-area context for internal Investment Panel candidates."""

from __future__ import annotations

from datetime import UTC, datetime
from statistics import median
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.connectors.census_acs import CensusAcsConnector, configured_acs_year

ACS_TABLE = "investment_acs_market_context"
TRACT_GEOMETRY_TABLE = "investment_acs_tract_geometry"
PARCEL_GEO_TABLE = "investment_parcel_acs_geography"
SAFE_LIMITATION = "Census market-area context is aggregate and does not establish property demand, feasibility, value, or future investment performance."
ACS_UNCERTAINTY_NOTE = "ACS values are area-level estimates and may include sampling uncertainty. They do not represent parcel-level demand, value, or future performance."
UNAVAILABLE_CONTEXT = {
    "band": "Insufficient Information",
    "summary": "Market geography unavailable",
}


def acs_status(db: Session) -> dict[str, Any]:
    _ensure_tables(db)
    connector = CensusAcsConnector(timeout_seconds=1)
    latest = db.execute(
        text(
            f"""
            SELECT acs_year, geography_type, COUNT(*)::int AS row_count, MAX(retrieved_at) AS last_refreshed
            FROM {ACS_TABLE}
            GROUP BY acs_year, geography_type
            ORDER BY acs_year DESC
            LIMIT 1
            """
        )
    ).mappings().first()
    return {
        "source": "U.S. Census Bureau ACS API",
        "dataset": "ACS 5-year",
        "default_acs_year": configured_acs_year(),
        "geography": "tract",
        "api_key_configured": connector.api_key_configured,
        "enabled": True,
        "status": "loaded" if latest else "not_loaded",
        "row_count": int(latest["row_count"]) if latest else 0,
        "last_refreshed": latest["last_refreshed"].isoformat() if latest and latest["last_refreshed"] else None,
        "parcel_assignment": parcel_assignment_status(db, year=int(latest["acs_year"]) if latest else None),
        "limitations": [SAFE_LIMITATION, ACS_UNCERTAINTY_NOTE],
    }


def refresh_acs_market_context(db: Session, *, year: int | None = None) -> dict[str, Any]:
    _ensure_tables(db)
    year = year or configured_acs_year()
    connector = CensusAcsConnector()
    result = connector.fetch_cabarrus_tracts(year=year)
    geometries = connector.fetch_cabarrus_tract_geometries(year=year)
    if not result.rows:
        raise RuntimeError("Census ACS returned no Cabarrus tract rows; last good data was preserved.")
    _upsert_acs_rows(db, result.rows)
    _upsert_tract_geometries(db, geometries)
    assignment = assign_parcels_to_acs_tracts(db, year=year)
    return {
        "source": result.source,
        "dataset": result.dataset,
        "geography": result.geography_type,
        "rows_loaded": len(result.rows),
        "tract_geometries_loaded": len(geometries),
        "parcel_assignment": assignment,
        "missing_variables": result.missing_variables,
        "api_key_configured": connector.api_key_configured,
        "last_refreshed": datetime.now(UTC).isoformat(),
    }


def parcel_assignment_status(db: Session, *, year: int | None = None) -> dict[str, Any]:
    _ensure_tables(db)
    valid_parcels = db.execute(
        text(
            """
            SELECT COUNT(*)::int
            FROM parcels_enriched
            WHERE official_parcel_id IS NOT NULL
              AND geometry IS NOT NULL
              AND NOT ST_IsEmpty(geometry)
            """
        )
    ).scalar() or 0
    assigned = db.execute(
        text(
            f"""
            SELECT
              COUNT(*)::int AS assigned_count,
              COUNT(DISTINCT tract_geoid)::int AS unique_tracts,
              COUNT(*) FILTER (WHERE tract_geoid !~ '^37025[0-9]{{6}}$')::int AS invalid_tract_geoids,
              COUNT(*) FILTER (WHERE tract_geoid IS NOT NULL AND tract_geoid NOT LIKE '37025%')::int AS outside_count
            FROM {PARCEL_GEO_TABLE}
            {"" if year is None else f"WHERE acs_year = {int(year)}"}
            """
        )
    ).mappings().first() or {}
    assigned_count = int(assigned.get("assigned_count") or 0)
    return {
        "total_valid_parcels": int(valid_parcels),
        "assigned_parcels": assigned_count,
        "unmatched_parcels": max(int(valid_parcels) - assigned_count, 0),
        "coverage_percent": round((assigned_count / valid_parcels) * 100, 2) if valid_parcels else 0,
        "unique_tracts": int(assigned.get("unique_tracts") or 0),
        "duplicate_parcel_assignments": 0,
        "invalid_tract_geoids": int(assigned.get("invalid_tract_geoids") or 0),
        "outside_cabarrus_count": int(assigned.get("outside_count") or 0),
    }


def assign_parcels_to_acs_tracts(db: Session, *, year: int | None = None) -> dict[str, Any]:
    _ensure_tables(db)
    year = year or configured_acs_year()
    db.execute(
        text(
            f"""
            INSERT INTO {PARCEL_GEO_TABLE} (parcel_id, tract_geoid, acs_year, source, resolved_at)
            SELECT p.official_parcel_id, g.geoid, :year, 'postgis_tract_overlay', now()
            FROM (
              SELECT official_parcel_id,
                     CASE
                       WHEN ST_SRID(geometry) = 4326 THEN ST_PointOnSurface(geometry)
                       ELSE ST_Transform(ST_PointOnSurface(geometry), 4326)
                     END AS point_geom
              FROM parcels_enriched
              WHERE official_parcel_id IS NOT NULL
                AND geometry IS NOT NULL
                AND NOT ST_IsEmpty(geometry)
            ) p
            JOIN {TRACT_GEOMETRY_TABLE} g
              ON g.acs_year = :year
             AND ST_Intersects(g.geometry, p.point_geom)
            ON CONFLICT (parcel_id) DO UPDATE SET
              tract_geoid = EXCLUDED.tract_geoid,
              acs_year = EXCLUDED.acs_year,
              source = EXCLUDED.source,
              resolved_at = now()
            """
        ),
        {"year": year},
    )
    return parcel_assignment_status(db, year=year)


def candidate_market_context(db: Session, parcel_id: str | None) -> dict[str, Any]:
    _ensure_tables(db)
    if not parcel_id:
        return _unavailable("No parcel identifier was provided.")
    latest_year = db.execute(text(f"SELECT MAX(acs_year) FROM {ACS_TABLE} WHERE geography_type = 'tract'")).scalar()
    if latest_year is None:
        return _unavailable("ACS market context has not been refreshed locally.")
    geoid = _resolve_parcel_tract_geoid(db, parcel_id)
    if not geoid:
        return _unavailable("Market geography unavailable for this parcel.")
    record = db.execute(
        text(f"SELECT * FROM {ACS_TABLE} WHERE geoid = :geoid AND acs_year = :year AND geography_type = 'tract'"),
        {"geoid": geoid, "year": latest_year},
    ).mappings().first()
    county_rows = list(
        db.execute(
            text(f"SELECT * FROM {ACS_TABLE} WHERE acs_year = :year AND geography_type = 'tract'"),
            {"year": latest_year},
        ).mappings()
    )
    if not record:
        return _unavailable("ACS tract record was not found for the resolved market geography.", geoid=geoid)
    return build_market_context(dict(record), [dict(row) for row in county_rows])


def build_market_context(record: dict[str, Any], county_rows: list[dict[str, Any]]) -> dict[str, Any]:
    occupancy_rate = _ratio(record.get("occupied_housing_units"), record.get("total_housing_units"))
    owner_share = _ratio(record.get("owner_occupied_units"), record.get("total_households"))
    renter_share = _ratio(record.get("renter_occupied_units"), record.get("total_households"))
    total_households = _num(record.get("total_households"))
    housing_units = _num(record.get("total_housing_units"))
    return {
        "source": "U.S. Census Bureau ACS API",
        "acs_year": int(record.get("acs_year") or configured_acs_year()),
        "geography_type": record.get("geography_type") or "tract",
        "geoid": record.get("geoid"),
        "population_context": _context("population", record.get("total_population"), county_rows, "total_population"),
        "household_context": _context("households", total_households, county_rows, "total_households"),
        "income_context": _context("median household income", record.get("median_household_income"), county_rows, "median_household_income"),
        "housing_context": {
            "occupancy_band": _context("housing occupancy", occupancy_rate, _derived_rows(county_rows, "occupancy_rate"), "occupancy_rate")["band"],
            "tenure_band": "Owner-leaning context" if owner_share and owner_share >= 0.6 else "Renter-leaning or mixed context" if renter_share and renter_share >= 0.45 else "Mixed Context",
            "housing_unit_context_band": _context("housing units", housing_units, county_rows, "total_housing_units")["band"],
            "summary": f"Occupancy context is {_context('housing occupancy', occupancy_rate, _derived_rows(county_rows, 'occupancy_rate'), 'occupancy_rate')['band'].lower()}; tenure is aggregate area context only.",
        },
        "growth_context": {
            "band": "Insufficient Information",
            "summary": "Multi-vintage ACS comparisons are not enabled in this phase because overlapping ACS five-year estimates require careful interpretation.",
        },
        "data_confidence": _acs_confidence(record),
        "uncertainty_note": ACS_UNCERTAINTY_NOTE,
        "source_attribution": "U.S. Census Bureau, ACS 5-year estimates.",
        "last_refreshed": record.get("retrieved_at").isoformat() if hasattr(record.get("retrieved_at"), "isoformat") else record.get("retrieved_at"),
        "limitations": [
            SAFE_LIMITATION,
            ACS_UNCERTAINTY_NOTE,
            "County-relative bands compare Cabarrus tract records loaded in the local ACS cache.",
        ],
    }


def _ensure_tables(db: Session) -> None:
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {ACS_TABLE} (
                geoid text NOT NULL,
                geography_type text NOT NULL,
                acs_year integer NOT NULL,
                state_fips text NOT NULL,
                county_fips text NOT NULL,
                total_population double precision,
                total_households double precision,
                average_household_size double precision,
                median_household_income double precision,
                per_capita_income double precision,
                total_housing_units double precision,
                occupied_housing_units double precision,
                vacant_housing_units double precision,
                owner_occupied_units double precision,
                renter_occupied_units double precision,
                median_home_value double precision,
                median_gross_rent double precision,
                mean_travel_time double precision,
                no_vehicle_households double precision,
                source_name text NOT NULL,
                source_dataset text NOT NULL,
                retrieved_at timestamptz NOT NULL,
                PRIMARY KEY (geoid, geography_type, acs_year)
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{ACS_TABLE}_geoid ON {ACS_TABLE}(geoid)"))
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{ACS_TABLE}_year_type ON {ACS_TABLE}(acs_year, geography_type)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {TRACT_GEOMETRY_TABLE} (
                geoid text NOT NULL,
                acs_year integer NOT NULL,
                state_fips text NOT NULL,
                county_fips text NOT NULL,
                tract_name text,
                source_name text NOT NULL,
                source_dataset text NOT NULL,
                retrieved_at timestamptz NOT NULL,
                geometry geometry(MultiPolygon, 4326) NOT NULL,
                PRIMARY KEY (geoid, acs_year)
            )
            """
        )
    )
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{TRACT_GEOMETRY_TABLE}_geoid ON {TRACT_GEOMETRY_TABLE}(geoid)"))
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{TRACT_GEOMETRY_TABLE}_geometry ON {TRACT_GEOMETRY_TABLE} USING GIST (geometry)"))
    db.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {PARCEL_GEO_TABLE} (
                parcel_id text PRIMARY KEY,
                tract_geoid text,
                acs_year integer,
                source text NOT NULL,
                resolved_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    )
    db.execute(text(f"ALTER TABLE {PARCEL_GEO_TABLE} ADD COLUMN IF NOT EXISTS acs_year integer"))
    db.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{PARCEL_GEO_TABLE}_tract_geoid ON {PARCEL_GEO_TABLE}(tract_geoid)"))


def _upsert_acs_rows(db: Session, rows: list[dict[str, Any]]) -> None:
    for row in rows:
        db.execute(
            text(
                f"""
                INSERT INTO {ACS_TABLE} (
                    geoid, geography_type, acs_year, state_fips, county_fips,
                    total_population, total_households, average_household_size,
                    median_household_income, per_capita_income, total_housing_units,
                    occupied_housing_units, vacant_housing_units, owner_occupied_units,
                    renter_occupied_units, median_home_value, median_gross_rent,
                    mean_travel_time, no_vehicle_households, source_name, source_dataset, retrieved_at
                ) VALUES (
                    :geoid, :geography_type, :acs_year, :state_fips, :county_fips,
                    :total_population, :total_households, :average_household_size,
                    :median_household_income, :per_capita_income, :total_housing_units,
                    :occupied_housing_units, :vacant_housing_units, :owner_occupied_units,
                    :renter_occupied_units, :median_home_value, :median_gross_rent,
                    :mean_travel_time, :no_vehicle_households, :source_name, :source_dataset, :retrieved_at
                )
                ON CONFLICT (geoid, geography_type, acs_year) DO UPDATE SET
                    total_population = EXCLUDED.total_population,
                    total_households = EXCLUDED.total_households,
                    average_household_size = EXCLUDED.average_household_size,
                    median_household_income = EXCLUDED.median_household_income,
                    per_capita_income = EXCLUDED.per_capita_income,
                    total_housing_units = EXCLUDED.total_housing_units,
                    occupied_housing_units = EXCLUDED.occupied_housing_units,
                    vacant_housing_units = EXCLUDED.vacant_housing_units,
                    owner_occupied_units = EXCLUDED.owner_occupied_units,
                    renter_occupied_units = EXCLUDED.renter_occupied_units,
                    median_home_value = EXCLUDED.median_home_value,
                    median_gross_rent = EXCLUDED.median_gross_rent,
                    mean_travel_time = EXCLUDED.mean_travel_time,
                    no_vehicle_households = EXCLUDED.no_vehicle_households,
                    source_name = EXCLUDED.source_name,
                    source_dataset = EXCLUDED.source_dataset,
                    retrieved_at = EXCLUDED.retrieved_at
                """
            ),
            {**row, "mean_travel_time": row.get("mean_travel_time")},
        )


def _upsert_tract_geometries(db: Session, rows: list[dict[str, Any]]) -> None:
    for row in rows:
        db.execute(
            text(
                f"""
                INSERT INTO {TRACT_GEOMETRY_TABLE} (
                    geoid, acs_year, state_fips, county_fips, tract_name,
                    source_name, source_dataset, retrieved_at, geometry
                ) VALUES (
                    :geoid, :acs_year, :state_fips, :county_fips, :tract_name,
                    :source_name, :source_dataset, :retrieved_at,
                    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geometry_geojson), 4326))
                )
                ON CONFLICT (geoid, acs_year) DO UPDATE SET
                    tract_name = EXCLUDED.tract_name,
                    source_name = EXCLUDED.source_name,
                    source_dataset = EXCLUDED.source_dataset,
                    retrieved_at = EXCLUDED.retrieved_at,
                    geometry = EXCLUDED.geometry
                """
            ),
            row,
        )


def _resolve_parcel_tract_geoid(db: Session, parcel_id: str) -> str | None:
    cached = db.execute(text(f"SELECT tract_geoid FROM {PARCEL_GEO_TABLE} WHERE parcel_id = :parcel_id"), {"parcel_id": parcel_id}).scalar()
    if cached:
        return str(cached)
    year = db.execute(text(f"SELECT MAX(acs_year) FROM {TRACT_GEOMETRY_TABLE}")).scalar()
    if year is None:
        return None
    row = db.execute(
        text(
            f"""
            SELECT g.geoid
            FROM parcels_enriched p
            JOIN {TRACT_GEOMETRY_TABLE} g
              ON g.acs_year = :year
             AND ST_Intersects(
                  g.geometry,
                  CASE
                    WHEN ST_SRID(p.geometry) = 4326 THEN ST_PointOnSurface(p.geometry)
                    ELSE ST_Transform(ST_PointOnSurface(p.geometry), 4326)
                  END
                )
            WHERE p.official_parcel_id = :parcel_id
              AND p.geometry IS NOT NULL
              AND NOT ST_IsEmpty(p.geometry)
            LIMIT 1
            """
        ),
        {"parcel_id": parcel_id, "year": year},
    ).mappings().first()
    if not row:
        return None
    geoid = str(row["geoid"])
    if geoid:
        db.execute(
            text(
                f"""
                INSERT INTO {PARCEL_GEO_TABLE} (parcel_id, tract_geoid, acs_year, source, resolved_at)
                VALUES (:parcel_id, :tract_geoid, :year, 'postgis_tract_overlay', now())
                ON CONFLICT (parcel_id) DO UPDATE SET tract_geoid = EXCLUDED.tract_geoid, acs_year = EXCLUDED.acs_year, source = EXCLUDED.source, resolved_at = now()
                """
            ),
            {"parcel_id": parcel_id, "tract_geoid": geoid, "year": year},
        )
    return geoid


def _context(label: str, value: Any, rows: list[dict[str, Any]], field: str) -> dict[str, str]:
    number = _num(value)
    values = sorted(_num(row.get(field)) for row in rows if _num(row.get(field)) is not None)
    if number is None or len(values) < 3:
        return {"band": "Insufficient Information", "summary": f"{label.title()} context is unavailable."}
    med = median(values)
    low = values[max(0, len(values) // 4 - 1)]
    high = values[min(len(values) - 1, (len(values) * 3) // 4)]
    if number >= high:
        band = "Elevated Local Context"
    elif number >= med:
        band = "Moderate Local Context"
    elif number >= low:
        band = "Typical Local Context"
    else:
        band = "Limited Local Context"
    return {"band": band, "summary": f"The surrounding Census tract has {band.lower()} for {label} relative to loaded Cabarrus tracts."}


def _derived_rows(rows: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    if field != "occupancy_rate":
        return rows
    return [{"occupancy_rate": _ratio(row.get("occupied_housing_units"), row.get("total_housing_units"))} for row in rows]


def _ratio(numerator: Any, denominator: Any) -> float | None:
    top = _num(numerator)
    bottom = _num(denominator)
    return top / bottom if top is not None and bottom and bottom > 0 else None


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _acs_confidence(record: dict[str, Any]) -> str:
    critical = ("total_population", "total_households", "median_household_income", "total_housing_units", "occupied_housing_units")
    return "Limited" if any(record.get(key) is None for key in critical) else "Medium"


def _unavailable(reason: str, *, geoid: str | None = None) -> dict[str, Any]:
    return {
        "source": "U.S. Census Bureau ACS API",
        "acs_year": None,
        "geography_type": "tract",
        "geoid": geoid,
        "population_context": UNAVAILABLE_CONTEXT,
        "household_context": UNAVAILABLE_CONTEXT,
        "income_context": UNAVAILABLE_CONTEXT,
        "housing_context": {"occupancy_band": "Insufficient Information", "tenure_band": "Insufficient Information", "housing_unit_context_band": "Insufficient Information", "summary": reason},
        "growth_context": UNAVAILABLE_CONTEXT,
        "data_confidence": "Data Needed",
        "uncertainty_note": ACS_UNCERTAINTY_NOTE,
        "source_attribution": "U.S. Census Bureau ACS 5-year estimates.",
        "last_refreshed": None,
        "limitations": [SAFE_LIMITATION, ACS_UNCERTAINTY_NOTE, reason],
    }
