from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import verify_database_connection
from app.routers import (
    constraints_router,
    development_router,
    parcel_router,
    temporal_router,
)

settings = get_settings()

app = FastAPI(
    title="Cabarrus FutureScape API",
    version="0.1.0",
)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=[
            "Accept",
            "Authorization",
            "Content-Type",
            "X-Requested-With",
        ],
    )


@app.get("/", tags=["Root"])
def root() -> dict[str, object]:
    return {
        "service": "Cabarrus FutureScape API",
        "status": "ok",
        "version": app.version,
        "docs": "/docs",
        "health": "/health",
        "database_health": "/health/database",
        "api_groups": {
            "parcels": "/parcels",
            "development": "/development",
            "constraints": "/constraints",
        },
    }


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/database", tags=["Health"])
def health_database() -> dict[str, str]:
    try:
        verify_database_connection()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed.",
        ) from exc

    return {"database": "connected"}


app.include_router(parcel_router.router)
app.include_router(development_router.router)
app.include_router(temporal_router.router)
app.include_router(constraints_router.router)
