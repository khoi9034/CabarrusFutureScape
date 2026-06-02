from fastapi import FastAPI, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from app.database import verify_database_connection
from app.routers import development_router, parcel_router, temporal_router

app = FastAPI(
    title="Cabarrus FutureScape API",
    version="0.1.0",
)


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

