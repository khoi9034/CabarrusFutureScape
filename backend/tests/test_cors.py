from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_local_frontend_cors_preflight() -> None:
    response = client.options(
        "/parcels/CFS-PARCEL-0149726579",
        headers={
            "Access-Control-Request-Method": "GET",
            "Origin": "http://localhost:3000",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "GET" in response.headers["access-control-allow-methods"]

