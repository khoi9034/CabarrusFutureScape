from __future__ import annotations

import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from jwt import PyJWKClientError

from app.auth import AuthError, Principal, authenticate_bearer_token, classify_route
from app.config import Settings
from app.routers import investment_router
from app.schemas.development import DevelopmentPredictionFeaturesSummaryResponse
from app.services import development_service
from app.services.investment_screening_service import screen_candidates

ROOT = Path(__file__).resolve().parents[2]


def test_model_lab_summary_cache_reuses_deep_copied_payload() -> None:
    development_service.clear_model_lab_summary_cache()
    calls = {"count": 0}

    def build() -> DevelopmentPredictionFeaturesSummaryResponse:
        calls["count"] += 1
        return DevelopmentPredictionFeaturesSummaryResponse(
            feature_matrix_available=True,
            row_count=calls["count"],
            feature_groups=["cached"],
        )

    first = development_service._get_or_build_model_lab_summary(60, build)
    first.feature_groups.append("mutated")
    second = development_service._get_or_build_model_lab_summary(60, build)

    assert calls["count"] == 1
    assert second.row_count == 1
    assert second.feature_groups == ["cached"]
    development_service.clear_model_lab_summary_cache()


def test_model_lab_summary_cache_can_be_disabled() -> None:
    development_service.clear_model_lab_summary_cache()
    calls = {"count": 0}

    def build() -> DevelopmentPredictionFeaturesSummaryResponse:
        calls["count"] += 1
        return DevelopmentPredictionFeaturesSummaryResponse(
            feature_matrix_available=True,
            row_count=calls["count"],
        )

    assert development_service._get_or_build_model_lab_summary(0, build).row_count == 1
    assert development_service._get_or_build_model_lab_summary(0, build).row_count == 2


def test_route_security_matrix_classifies_public_read_write_and_admin() -> None:
    assert classify_route("/health", "GET") == "public"
    assert classify_route("/parcels/search", "GET") == "read"
    assert classify_route("/ai/search", "POST") == "read"
    assert classify_route("/investment/intake", "POST") == "write"
    assert classify_route("/economics/export-diagnostics", "GET") == "admin"


def test_investment_screen_supports_minimum_acreage_filter() -> None:
    result = screen_candidates(
        [
            {"parcel_id": "small", "acreage": 25, "data_confidence": "High"},
            {"parcel_id": "large", "acreage": 125, "data_confidence": "High"},
        ],
        filters={"minimum_acres": 100},
        strategy="development_land",
    )

    assert [candidate["parcel_id"] for candidate in result["candidates"]] == ["large"]


def test_investment_database_rows_release_transaction_before_scoring() -> None:
    class FakeResult:
        def mappings(self):
            return self

        def all(self):
            return [{"parcel_id": "large", "acreage": 125}]

    class FakeDb:
        rolled_back = False

        def execute(self, _statement):
            return FakeResult()

        def rollback(self):
            self.rolled_back = True

    db = FakeDb()

    rows = investment_router._investment_rows_from_database(db)

    assert rows == [{"parcel_id": "large", "acreage": 125}]
    assert db.rolled_back is True


def test_entra_validation_requires_allowed_user_scope_and_write_role(monkeypatch) -> None:
    class FakeKey:
        key = "public-key"

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token: str) -> FakeKey:
            return FakeKey()

    monkeypatch.setattr("app.auth._jwks_client", lambda _settings: FakeJwks())
    monkeypatch.setattr(
        "app.auth.jwt.decode",
        lambda *_args, **_kwargs: {
            "oid": "allowed-user",
            "roles": ["CFS.Write"],
            "scp": "CFS.Access",
        },
    )
    settings = Settings(
        CFS_API_AUTH_MODE="entra",
        CFS_ENTRA_TENANT_ID="tenant-id",
        CFS_ENTRA_API_AUDIENCE="api://cfs-api",
        CFS_ENTRA_ALLOWED_OBJECT_IDS="allowed-user",
        CFS_ENTRA_WRITE_ROLE="CFS.Write",
        _env_file=None,
    )

    principal = authenticate_bearer_token("jwt", settings, "write")

    assert principal == Principal(
        object_id="allowed-user",
        roles={"CFS.Write"},
        scopes={"CFS.Access"},
    )


def test_entra_validation_rejects_wrong_user(monkeypatch) -> None:
    class FakeKey:
        key = "public-key"

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token: str) -> FakeKey:
            return FakeKey()

    monkeypatch.setattr("app.auth._jwks_client", lambda _settings: FakeJwks())
    monkeypatch.setattr(
        "app.auth.jwt.decode",
        lambda *_args, **_kwargs: {"oid": "other-user", "roles": [], "scp": "CFS.Access"},
    )
    settings = Settings(
        CFS_API_AUTH_MODE="entra",
        CFS_ENTRA_TENANT_ID="tenant-id",
        CFS_ENTRA_API_AUDIENCE="api://cfs-api",
        CFS_ENTRA_ALLOWED_OBJECT_IDS="allowed-user",
        _env_file=None,
    )

    try:
        authenticate_bearer_token("jwt", settings, "read")
    except AuthError as exc:
        assert exc.status_code == 403
    else:
        raise AssertionError("wrong Entra object id should fail")


def test_entra_validation_rejects_jwks_lookup_errors(monkeypatch) -> None:
    class BrokenJwks:
        def get_signing_key_from_jwt(self, _token: str):
            raise PyJWKClientError("jwks unavailable")

    monkeypatch.setattr("app.auth._jwks_client", lambda _settings: BrokenJwks())
    settings = Settings(
        CFS_API_AUTH_MODE="entra",
        CFS_ENTRA_TENANT_ID="tenant-id",
        CFS_ENTRA_API_AUDIENCE="api://cfs-api",
        _env_file=None,
    )

    try:
        authenticate_bearer_token("jwt", settings, "read")
    except AuthError as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("JWKS lookup errors should fail as auth errors")


def test_entra_middleware_keeps_health_public_and_protects_root(monkeypatch) -> None:
    monkeypatch.setenv("CFS_API_AUTH_MODE", "entra")
    monkeypatch.setenv("CFS_ENTRA_TENANT_ID", "tenant-id")
    monkeypatch.setenv("CFS_ENTRA_API_AUDIENCE", "api://cfs-api")
    monkeypatch.setenv("CFS_ENTRA_ALLOWED_OBJECT_IDS", "allowed-user")
    import app.config

    app.config.get_settings.cache_clear()
    sys.modules.pop("app.main", None)
    app_main = importlib.import_module("app.main")

    def fake_auth(token: str, _settings: Settings, _policy: str) -> Principal:
        if token != "jwt":
            raise AuthError(401, "Authentication required.")
        return Principal(object_id="allowed-user", roles=set(), scopes={"CFS.Access"})

    monkeypatch.setattr(app_main, "authenticate_bearer_token", fake_auth)
    client = TestClient(app_main.app)

    assert client.get("/health").status_code == 200
    assert client.get("/").status_code == 401
    assert client.get("/", headers={"Authorization": "Bearer jwt"}).status_code == 200


def test_frontend_entra_gate_uses_msal_without_public_secrets() -> None:
    gate = (ROOT / "src" / "components" / "auth" / "EntraAuthGate.tsx").read_text(encoding="utf-8")
    config = (ROOT / "src" / "lib" / "auth" / "entra.ts").read_text(encoding="utf-8")
    package = (ROOT / "package.json").read_text(encoding="utf-8")

    assert "@azure/msal-browser" in package
    assert "loginPopup" in gate
    assert "acquireTokenSilent" in gate
    assert "forceRefresh" in gate
    assert "Authorization" in gate
    assert "localStorage" not in gate + config
    assert "NEXT_PUBLIC_CFS_ENTRA_CLIENT_ID" in config
    assert "NEXT_PUBLIC_CFS_ENTRA_API_SCOPE" in config
    assert "NEXT_PUBLIC_CFS_STAGING" not in config
    assert "SECRET" not in config.upper()
