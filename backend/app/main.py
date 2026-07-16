import hmac
import logging
import re

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import verify_database_connection
from app.routers import (
    ai_search_router,
    constraints_router,
    development_router,
    economics_router,
    indicators_router,
    investment_router,
    parcel_router,
    school_constraints_router,
    temporal_router,
    wsacc_router,
)
from app.telemetry import configure_telemetry

settings = get_settings()
configure_telemetry(settings)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cabarrus FutureScape API",
    version="0.1.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["DELETE", "GET", "OPTIONS", "PATCH", "POST"],
        allow_headers=[
            "Accept",
            "Authorization",
            "Content-Type",
            "X-CFS-Staging-Token",
            "X-Requested-With",
        ],
    )


_ANONYMOUS_PATHS = {"/health", "/health/ready", "/health/database"}


@app.middleware("http")
async def enforce_staging_access(request: Request, call_next):
    if (
        not settings.staging_protection_enabled
        or request.method == "OPTIONS"
        or request.url.path in _ANONYMOUS_PATHS
    ):
        return await call_next(request)

    expected = settings.cfs_staging_access_token
    supplied = request.headers.get("x-cfs-staging-token", "")
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()

    if expected and hmac.compare_digest(supplied, expected):
        return await call_next(request)
    if not expected:
        return JSONResponse({"detail": "Staging access is not configured."}, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    return JSONResponse({"detail": "Staging access required."}, status_code=status.HTTP_401_UNAUTHORIZED)


@app.get("/", tags=["Root"])
def root() -> dict[str, object]:
    return {
        "service": "Cabarrus FutureScape API",
        "status": "ok",
        "version": app.version,
        "docs": "/docs" if settings.docs_enabled else None,
        "health": "/health",
        "database_health": "/health/database",
        "api_groups": {
            "parcels": "/parcels",
            "development": "/development",
            "economics": "/economics",
            "constraints": "/constraints",
            "ai_search": "/ai/search",
            "indicators": "/indicators",
            "investment": "/investment",
            "wsacc": "/wsacc",
        },
    }


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["Health"])
def health_ready() -> dict[str, str]:
    return health_database() | {"status": "ready"}


@app.get("/health/database", tags=["Health"])
def health_database() -> dict[str, str]:
    try:
        verify_database_connection()
    except SQLAlchemyError as exc:
        error_summary = _safe_error_summary(exc)
        logger.warning("Database health check failed: %s", error_summary)
        print(f"Database health check failed: {error_summary}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed.",
        ) from exc

    return {"database": "connected"}


def _safe_error_summary(exc: BaseException) -> str:
    summary = str(exc).replace("\n", " ")[:1200]
    for secret in (
        settings.database_url,
        settings.postgres_password,
        settings.cfs_staging_access_token,
        settings.openai_api_key,
        settings.applicationinsights_connection_string,
    ):
        if secret:
            summary = summary.replace(secret, "<redacted>")
    return re.sub("(?i)(" + "password=" + r")[^\s]+", r"\1<redacted>", summary)


app.include_router(parcel_router.router)
app.include_router(development_router.router)
app.include_router(economics_router.router)
app.include_router(temporal_router.router)
app.include_router(constraints_router.router)
app.include_router(school_constraints_router.router)
app.include_router(indicators_router.router)
app.include_router(ai_search_router.router)
app.include_router(wsacc_router.router)
app.include_router(investment_router.router)
