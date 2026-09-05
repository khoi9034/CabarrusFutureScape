from dataclasses import dataclass

import httpx
import pytest
from fastapi.testclient import TestClient

from app.dependencies.database import get_read_only_db
from app.auth import classify_route
from app.main import app
from app.routers import imagery_router
from app.services.eagleview_imagery_service import (
    EagleViewImageryProvider,
    ImageryBytes,
    ImageryNotConfigured,
    ImageryProviderUnavailable,
    ImageryRecord,
    build_auth_signature,
)


class FakeHttpClient:
    def __init__(self, responses: list[httpx.Response | httpx.HTTPError]) -> None:
        self.responses = responses
        self.urls: list[str] = []

    def get(self, url: str, **_kwargs: object) -> httpx.Response:
        self.urls.append(url)
        result = self.responses.pop(0)
        if isinstance(result, httpx.HTTPError):
            raise result
        return result


def response(status: int, *, json: object | None = None, content: bytes = b""):
    request = httpx.Request("GET", "https://provider.example/test")
    if json is not None:
        return httpx.Response(status, request=request, json=json)
    return httpx.Response(status, request=request, content=content)


def test_auth_signature_matches_hmac_md5_contract() -> None:
    assert build_auth_signature("api", "secret", 1_700_000_000) == (
        "e8679edad15240d907f23df804b9ea87"
    )


def test_search_normalizes_available_directions_only() -> None:
    client = FakeHttpClient(
        [
            response(
                200,
                json={
                    "response": {
                        "images": {
                            "north": [
                                {
                                    "date": "2026-08-14",
                                    "imageResource": "https://images.pictometry.com/north",
                                }
                            ],
                            "south": [],
                            "east": [
                                {
                                    "date": "2026-07-02",
                                    "imageResource": "https://images.pictometry.com/east",
                                }
                            ],
                        }
                    }
                },
            )
        ]
    )
    provider = EagleViewImageryProvider(
        api_key="api key",
        secret_key="secret",
        client=client,  # type: ignore[arg-type]
    )

    records = provider.search(35.4, -80.6)

    assert [(item.direction, item.capture_date) for item in records] == [
        ("north", "2026-08-14"),
        ("east", "2026-07-02"),
    ]
    assert client.urls == [
        "https://pol.pictometry.com/Gateway/v1/search/35.4,-80.6/api%20key"
    ]


def test_image_authentication_and_proxy_url(monkeypatch) -> None:
    client = FakeHttpClient(
        [
            response(200, json={"response": {"token": "short-lived-token"}}),
            httpx.Response(
                200,
                request=httpx.Request("GET", "https://images.pictometry.com/test"),
                content=b"jpeg-bytes",
                headers={"content-type": "image/jpeg"},
            ),
        ]
    )
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=client,  # type: ignore[arg-type]
    )
    monkeypatch.setattr("app.services.eagleview_imagery_service.time.time", lambda: 1_700_000_000)

    image = provider.fetch_image(
        ImageryRecord("west", "2026-08-14", "https://images.pictometry.com/west"),
        width=800,
        height=600,
    )

    assert image == ImageryBytes(content=b"jpeg-bytes", media_type="image/jpeg")
    assert client.urls[0].endswith(
        "/authenticate/api/1700000000/e8679edad15240d907f23df804b9ea87"
    )
    assert client.urls[1] == (
        "https://images.pictometry.com/west/short-lived-token/"
        "width:800;height:600;imageFormat:jpg"
    )


def test_invalid_token_and_missing_configuration_are_safe() -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, json={"response": {}})]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="did not return a token"):
        provider.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )

    with pytest.raises(ImageryNotConfigured, match="not configured"):
        EagleViewImageryProvider(api_key="", secret_key="").search(35.4, -80.6)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"response": {}},
        {"response": {"token": ""}},
        {"response": {"token": "   "}},
    ],
)
def test_authentication_rejects_missing_or_empty_token(payload: object) -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, json=payload)]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable):
        provider.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )


def test_malformed_json_and_network_failure_become_provider_unavailable() -> None:
    malformed = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, content=b"not-json")]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="malformed JSON"):
        malformed.search(35.4, -80.6)

    unavailable_response = httpx.Response(
        503,
        request=httpx.Request("GET", "https://provider.example/test"),
    )
    unavailable = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([unavailable_response]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="temporarily unavailable"):
        unavailable.search(35.4, -80.6)

    timeout = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([httpx.ReadTimeout("timed out")]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="temporarily unavailable"):
        timeout.search(35.4, -80.6)

    malformed_auth = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, content=b"not-json")]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="malformed JSON"):
        malformed_auth.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )


def test_provider_requires_nested_response_and_valid_coordinates() -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, json={"token": "wrong-level"})]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="invalid response"):
        provider.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )

    search_provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, json={"images": {}})]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="invalid response"):
        search_provider.search(35.4, -80.6)

    for latitude, longitude in [(float("nan"), -80.6), (91, -80.6), (35.4, 181)]:
        with pytest.raises(ImageryProviderUnavailable, match="coordinates are invalid"):
            provider.search(latitude, longitude)


def test_search_supports_four_directions_and_ignores_unsafe_resources() -> None:
    images = {
        direction: [
            {
                "date": None,
                "imageResource": f"https://images.pictometry.com/{direction}",
            }
        ]
        for direction in ("north", "south", "east", "west")
    }
    images["north"].append(
        {"imageResource": "https://127.0.0.1/internal", "date": "2026-01-01"}
    )
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(200, json={"response": {"images": images}})]),  # type: ignore[arg-type]
    )

    assert [item.direction for item in provider.search(35.4, -80.6)] == [
        "north",
        "south",
        "east",
        "west",
    ]


@pytest.mark.parametrize(
    "images",
    [
        None,
        {},
        {"north": []},
        {"north": [{}]},
        {"north": [{"imageResource": "https://images.pictometry.com/north"}]},
    ],
)
def test_search_handles_missing_optional_fields(images: object) -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient(
            [response(200, json={"response": {"images": images}})]
        ),  # type: ignore[arg-type]
    )

    records = provider.search(35.4, -80.6)
    if images == {"north": [{"imageResource": "https://images.pictometry.com/north"}]}:
        assert records == [
            ImageryRecord("north", None, "https://images.pictometry.com/north")
        ]
    else:
        assert records == []


@pytest.mark.parametrize(
    "resource",
    [
        "http://images.pictometry.com/north",
        "https://pictometry.com.evil.example/north",
        "https://user:password@images.pictometry.com/north",
        "https://images.pictometry.com:8443/north",
        "https://images.pictometry.com/north?url=https://127.0.0.1",
        "https://images.pictometry.com/north#fragment",
    ],
)
def test_image_fetch_rejects_unsafe_provider_resource(resource: str) -> None:
    provider = EagleViewImageryProvider(api_key="api", secret_key="secret")
    with pytest.raises(ImageryProviderUnavailable, match="invalid image resource"):
        provider.fetch_image(
            ImageryRecord("north", None, resource),
            width=800,
            height=600,
        )


@pytest.mark.parametrize(
    ("content_type", "content"),
    [("text/html", b"not-an-image"), ("image/png", b"png"), ("image/jpeg", b"")],
)
def test_image_fetch_requires_nonempty_jpeg(content_type: str, content: bytes) -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient(
            [
                response(200, json={"response": {"token": "token"}}),
                httpx.Response(
                    200,
                    request=httpx.Request("GET", "https://images.pictometry.com/test"),
                    content=content,
                    headers={"content-type": content_type},
                ),
            ]
        ),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="invalid image response"):
        provider.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )


@pytest.mark.parametrize("status_code", [302, 401, 403, 404, 429, 500])
def test_provider_http_failures_are_safe(status_code: int) -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([response(status_code)]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="temporarily unavailable"):
        provider.search(35.4, -80.6)


@pytest.mark.parametrize(
    "failure",
    [response(401), response(403), response(429), response(500), httpx.ReadTimeout("timed out")],
)
def test_authentication_http_failures_are_safe(
    failure: httpx.Response | httpx.HTTPError,
) -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient([failure]),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="temporarily unavailable"):
        provider.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )


@pytest.mark.parametrize(
    "failure",
    [
        response(302),
        response(401),
        response(403),
        response(404),
        response(429),
        response(500),
        httpx.ReadTimeout("timed out"),
    ],
)
def test_image_retrieval_failures_are_safe(
    failure: httpx.Response | httpx.HTTPError,
) -> None:
    provider = EagleViewImageryProvider(
        api_key="api",
        secret_key="secret",
        client=FakeHttpClient(
            [response(200, json={"response": {"token": "token"}}), failure]
        ),  # type: ignore[arg-type]
    )
    with pytest.raises(ImageryProviderUnavailable, match="temporarily unavailable"):
        provider.fetch_image(
            ImageryRecord("north", None, "https://images.pictometry.com/north"),
            width=800,
            height=600,
        )


@dataclass
class FakeParcel:
    centroid_latitude: float | None = 35.41
    centroid_longitude: float | None = -80.58


class FakeRepository:
    def __init__(self, _db: object) -> None:
        pass

    def get_by_official_parcel_id(self, parcel_id: str) -> FakeParcel | None:
        return None if parcel_id == "missing" else FakeParcel()


class FakeProvider:
    def __init__(self, failure: Exception | None = None) -> None:
        self.failure = failure
        self.search_calls: list[tuple[float, float]] = []
        self.image_sizes: list[tuple[int, int]] = []

    def search(self, latitude: float, longitude: float) -> list[ImageryRecord]:
        self.search_calls.append((latitude, longitude))
        if self.failure:
            raise self.failure
        return [
            ImageryRecord("north", "2026-08-14", "https://images.pictometry.com/north"),
            ImageryRecord("west", None, "https://images.pictometry.com/west"),
        ]

    def fetch_image(
        self,
        _record: ImageryRecord,
        *,
        width: int,
        height: int,
    ) -> ImageryBytes:
        self.image_sizes.append((width, height))
        return ImageryBytes(b"image", "image/jpeg")


@pytest.fixture
def imagery_client(monkeypatch):
    provider = FakeProvider()
    monkeypatch.setattr(imagery_router, "ParcelRepository", FakeRepository)
    app.dependency_overrides[get_read_only_db] = lambda: object()
    app.dependency_overrides[imagery_router.get_imagery_provider] = lambda: provider
    try:
        yield TestClient(app), provider
    finally:
        app.dependency_overrides.clear()


def test_metadata_endpoint_uses_parcel_wgs84_location(imagery_client) -> None:
    client, provider = imagery_client
    response_value = client.get("/imagery/eagleview/parcel/CFS-PARCEL-1")

    assert response_value.status_code == 200
    assert response_value.json() == {
        "parcel_id": "CFS-PARCEL-1",
        "location": {"latitude": 35.41, "longitude": -80.58},
        "images": [
            {"direction": "north", "capture_date": "2026-08-14"},
            {"direction": "west", "capture_date": None},
        ],
        "provider": "EagleView/Pictometry",
    }
    assert provider.search_calls == [(35.41, -80.58)]
    assert "imageResource" not in response_value.text


def test_image_proxy_bounds_dimensions_and_allowlists_direction(imagery_client) -> None:
    client, provider = imagery_client
    image = client.get(
        "/imagery/eagleview/parcel/CFS-PARCEL-1/image/north?width=1600&height=1200"
    )
    assert image.status_code == 200
    assert image.content == b"image"
    assert provider.image_sizes == [(1600, 1200)]
    assert image.headers["cache-control"] == "private, no-store"
    assert image.headers["x-content-type-options"] == "nosniff"

    assert client.get(
        "/imagery/eagleview/parcel/CFS-PARCEL-1/image/north?width=1601"
    ).status_code == 422
    assert client.get(
        "/imagery/eagleview/parcel/CFS-PARCEL-1/image/up"
    ).status_code == 422
    assert client.get(
        "/imagery/eagleview/parcel/invalid%20id"
    ).status_code == 422


def test_endpoint_failure_messages_never_expose_provider_details(
    imagery_client,
) -> None:
    client, provider = imagery_client
    provider.failure = ImageryProviderUnavailable(
        "secret https://pol.pictometry.com/Gateway/v1 token=abc"
    )
    failed = client.get("/imagery/eagleview/parcel/CFS-PARCEL-1")
    assert failed.status_code == 503
    assert failed.json() == {"detail": "Imagery service is temporarily unavailable."}
    assert "token" not in failed.text
    assert "pictometry.com" not in failed.text

    provider.failure = ImageryNotConfigured("EagleView imagery is not configured.")
    missing = client.get("/imagery/eagleview/parcel/CFS-PARCEL-1")
    assert missing.status_code == 503
    assert missing.json() == {"detail": "EagleView imagery is not configured."}


def test_missing_parcel_and_direction_return_404(imagery_client) -> None:
    client, _provider = imagery_client
    assert client.get("/imagery/eagleview/parcel/missing").status_code == 404
    assert client.get(
        "/imagery/eagleview/parcel/CFS-PARCEL-1/image/east"
    ).status_code == 404


def test_missing_geometry_and_existing_auth_policy_fail_safely(
    imagery_client,
    monkeypatch,
) -> None:
    client, _provider = imagery_client

    class MissingGeometryRepository(FakeRepository):
        def get_by_official_parcel_id(self, _parcel_id: str) -> FakeParcel:
            return FakeParcel(centroid_latitude=None, centroid_longitude=None)

    monkeypatch.setattr(imagery_router, "ParcelRepository", MissingGeometryRepository)
    assert client.get("/imagery/eagleview/parcel/CFS-PARCEL-1").status_code == 404
    assert classify_route("/imagery/eagleview/parcel/CFS-PARCEL-1", "GET") == "read"
    assert classify_route("/api/v1/imagery/eagleview/parcel/CFS-PARCEL-1", "GET") == "read"
