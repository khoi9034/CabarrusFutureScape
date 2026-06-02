import os

import pytest
from fastapi.testclient import TestClient

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

