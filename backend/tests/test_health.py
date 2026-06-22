import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import build_database_url
from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_health_when_configured() -> None:
    if not (os.getenv("POSTGRES_PASSWORD") or os.getenv("CFS_POSTGRES_PASSWORD")):
        pytest.skip("Database password environment variable is not configured.")

    response = client.get("/health/database")

    assert response.status_code == 200
    assert response.json() == {"database": "connected"}


def test_database_url_setting_builds_cloud_database_url() -> None:
    settings = Settings(
        DATABASE_URL="postgresql+psycopg://cloud_user:example-password@db.example.com:6543/postgres",
        POSTGRES_HOST="localhost",
        POSTGRES_PORT=5433,
        POSTGRES_DB="local_dev",
        POSTGRES_USER="postgres",
        POSTGRES_PASSWORD="local-password",
    )

    database_url = build_database_url(settings)

    assert database_url.drivername == "postgresql+psycopg"
    assert database_url.username == "cloud_user"
    assert database_url.host == "db.example.com"
    assert database_url.port == 6543
    assert database_url.database == "postgres"


def test_database_url_setting_normalizes_plain_postgresql_driver() -> None:
    settings = Settings(
        DATABASE_URL="postgresql://cloud_user:example-password@db.example.com:6543/postgres",
    )

    database_url = build_database_url(settings)

    assert database_url.drivername == "postgresql+psycopg"
    assert database_url.username == "cloud_user"
    assert database_url.host == "db.example.com"


def test_database_health_timeout_settings_accept_cloud_aliases() -> None:
    settings = Settings(
        DATABASE_CONNECT_TIMEOUT_SECONDS=7,
        DATABASE_STATEMENT_TIMEOUT_MS=1500,
    )

    assert settings.database_connect_timeout_seconds == 7
    assert settings.database_statement_timeout_ms == 1500
