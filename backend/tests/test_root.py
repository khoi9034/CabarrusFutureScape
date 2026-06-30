from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_root_endpoint_returns_api_status() -> None:
    response = client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "Cabarrus FutureScape API"
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert body["docs"] == "/docs"
    assert body["health"] == "/health"
    assert body["database_health"] == "/health/database"
    assert body["api_groups"] == {
        "ai_search": "/ai/search",
        "constraints": "/constraints",
        "development": "/development",
        "economics": "/economics",
        "indicators": "/indicators",
        "parcels": "/parcels",
    }
