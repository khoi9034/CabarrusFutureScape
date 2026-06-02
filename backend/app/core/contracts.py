from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DOCS_ROOT = PROJECT_ROOT / "docs" / "backend"

PARCEL_INTELLIGENCE_CONTRACT = (
    BACKEND_DOCS_ROOT / "parcel_intelligence_api_contract.md"
)
PARCEL_SEARCH_SPECIFICATION = BACKEND_DOCS_ROOT / "parcel_search_specification.md"
PARCEL_FILTER_SPECIFICATION = BACKEND_DOCS_ROOT / "parcel_filter_specification.md"
DEVELOPMENT_ACTIVITY_CONTRACT = (
    BACKEND_DOCS_ROOT / "development_activity_api_contract.md"
)
DEVELOPMENT_TEMPORAL_QUERY_SPECIFICATION = (
    BACKEND_DOCS_ROOT / "development_activity_temporal_query_specification.md"
)

