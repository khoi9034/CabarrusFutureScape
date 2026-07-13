"""U.S. Census ACS connector for Cabarrus investment market context."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from typing import Any

from app.connectors.base import ConnectorResult

DEFAULT_ACS_YEAR = 2024
ACS_DATASET = "acs/acs5"
CABARRUS_STATE_FIPS = "37"
CABARRUS_COUNTY_FIPS = "025"
CENSUS_API_BASE = "https://api.census.gov/data"
CENSUS_GEOCODER_BASE = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
CENSUS_TIGERWEB_BASE = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer"
CENSUS_TRACT_LAYER_BY_YEAR = {2024: 7}

ACS_VARIABLES: dict[str, str] = {
    "B01003_001E": "total_population",
    "B11001_001E": "total_households",
    "B25010_001E": "average_household_size",
    "B19013_001E": "median_household_income",
    "B19301_001E": "per_capita_income",
    "B25001_001E": "total_housing_units",
    "B25002_002E": "occupied_housing_units",
    "B25002_003E": "vacant_housing_units",
    "B25003_002E": "owner_occupied_units",
    "B25003_003E": "renter_occupied_units",
    "B25077_001E": "median_home_value",
    "B25064_001E": "median_gross_rent",
    "B08201_002E": "no_vehicle_households",
}


class CensusAcsConnector:
    source_name = "U.S. Census Bureau ACS API"

    def __init__(self, *, api_key: str | None = None, timeout_seconds: float = 20.0) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("CENSUS_API_KEY")
        self.timeout_seconds = timeout_seconds

    @property
    def api_key_configured(self) -> bool:
        return bool(self.api_key)

    def fetch_cabarrus_tracts(self, *, year: int | None = None) -> ConnectorResult:
        year = validate_acs_year(year or configured_acs_year())
        fields = ["NAME", *ACS_VARIABLES]
        params = {
            "get": ",".join(fields),
            "for": "tract:*",
            "in": f"state:{CABARRUS_STATE_FIPS} county:{CABARRUS_COUNTY_FIPS}",
        }
        if self.api_key:
            params["key"] = self.api_key
        data = _read_json(f"{CENSUS_API_BASE}/{year}/{ACS_DATASET}?{urllib.parse.urlencode(params)}", self.timeout_seconds)
        if not isinstance(data, list) or not data:
            raise ValueError("Census ACS returned an empty response.")
        headers = [str(value) for value in data[0]]
        missing = [variable for variable in ACS_VARIABLES if variable not in headers]
        rows = [_normalize_acs_row(headers, values, year) for values in data[1:]]
        return ConnectorResult(
            rows=rows,
            source=self.source_name,
            dataset=f"{year}/{ACS_DATASET}",
            year=year,
            geography_type="tract",
            missing_variables=missing,
        )

    def fetch_cabarrus_tract_geometries(self, *, year: int | None = None) -> list[dict[str, Any]]:
        year = validate_acs_year(year or configured_acs_year())
        layer = CENSUS_TRACT_LAYER_BY_YEAR.get(year, 0)
        params = urllib.parse.urlencode(
            {
                "where": f"STATE='{CABARRUS_STATE_FIPS}' AND COUNTY='{CABARRUS_COUNTY_FIPS}'",
                "outFields": "GEOID,STATE,COUNTY,TRACT,BASENAME",
                "outSR": "4326",
                "f": "geojson",
            }
        )
        data = _read_json(f"{CENSUS_TIGERWEB_BASE}/{layer}/query?{params}", self.timeout_seconds)
        features = data.get("features") if isinstance(data, dict) else None
        if not features:
            raise RuntimeError("Census TIGERweb returned no Cabarrus tract geometry.")
        rows: list[dict[str, Any]] = []
        retrieved_at = datetime.now(UTC)
        for feature in features:
            props = feature.get("properties") or {}
            geoid = str(props.get("GEOID") or "")
            if not geoid.startswith(f"{CABARRUS_STATE_FIPS}{CABARRUS_COUNTY_FIPS}") or len(geoid) != 11:
                continue
            rows.append(
                {
                    "geoid": geoid,
                    "acs_year": year,
                    "state_fips": str(props.get("STATE") or CABARRUS_STATE_FIPS),
                    "county_fips": str(props.get("COUNTY") or CABARRUS_COUNTY_FIPS),
                    "tract_name": str(props.get("BASENAME") or props.get("TRACT") or geoid),
                    "geometry_geojson": json.dumps(feature.get("geometry") or {}),
                    "source_name": "U.S. Census Bureau TIGERweb",
                    "source_dataset": f"TIGERweb tract geometry for ACS {year}",
                    "retrieved_at": retrieved_at,
                }
            )
        return rows

    def tract_geoid_for_point(self, longitude: float, latitude: float) -> str | None:
        params = urllib.parse.urlencode(
            {
                "x": longitude,
                "y": latitude,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "layers": "Census Tracts",
                "format": "json",
            }
        )
        data = _read_json(f"{CENSUS_GEOCODER_BASE}?{params}", self.timeout_seconds)
        tracts = (((data or {}).get("result") or {}).get("geographies") or {}).get("Census Tracts") or []
        return str(tracts[0].get("GEOID")) if tracts and tracts[0].get("GEOID") else None


def _normalize_acs_row(headers: list[str], values: list[Any], year: int) -> dict[str, Any]:
    raw = dict(zip(headers, values, strict=False))
    state = str(raw.get("state") or CABARRUS_STATE_FIPS)
    county = str(raw.get("county") or CABARRUS_COUNTY_FIPS)
    tract = str(raw.get("tract") or "")
    row: dict[str, Any] = {
        "geoid": f"{state}{county}{tract}",
        "geography_type": "tract",
        "acs_year": year,
        "state_fips": state,
        "county_fips": county,
        "source_name": "U.S. Census Bureau ACS API",
        "source_dataset": f"{year}/{ACS_DATASET}",
        "retrieved_at": datetime.now(UTC),
    }
    for variable, field in ACS_VARIABLES.items():
        row[field] = _number_or_none(raw.get(variable))
    return row


def _number_or_none(value: Any) -> float | None:
    if value in (None, "", "null", "-666666666", "-222222222", "-999999999"):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def configured_acs_year() -> int:
    return validate_acs_year(os.getenv("CENSUS_ACS_YEAR") or DEFAULT_ACS_YEAR)


def validate_acs_year(value: Any) -> int:
    try:
        year = int(value)
    except (TypeError, ValueError):
        raise ValueError("CENSUS_ACS_YEAR must be a four-digit year.") from None
    if year < 2020 or year > 2030:
        raise ValueError("CENSUS_ACS_YEAR must be between 2020 and 2030.")
    return year


def _read_json(url: str, timeout_seconds: float) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": "CabarrusFutureScape/ACSMarketContext"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Census ACS request failed with HTTP {exc.code}.") from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        if "Missing Key" in body:
            raise RuntimeError("Census ACS API key is required by the current API response; set CENSUS_API_KEY.") from exc
        raise RuntimeError("Census ACS returned a non-JSON response.") from exc
