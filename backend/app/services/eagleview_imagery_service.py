import hashlib
import hmac
import math
import time
from dataclasses import dataclass
from typing import Literal, Protocol
from urllib.parse import quote, urlsplit

import httpx

ImageryDirection = Literal["north", "south", "east", "west"]
DIRECTIONS: tuple[ImageryDirection, ...] = ("north", "south", "east", "west")
GATEWAY_URL = "https://pol.pictometry.com/Gateway/v1"
ALLOWED_IMAGE_HOST_SUFFIX = ".pictometry.com"
EXPECTED_IMAGE_MEDIA_TYPE = "image/jpeg"


class ImageryProvider(Protocol):
    def search(self, latitude: float, longitude: float) -> list["ImageryRecord"]: ...

    def fetch_image(
        self,
        record: "ImageryRecord",
        *,
        width: int,
        height: int,
    ) -> "ImageryBytes": ...


class ImageryNotConfigured(RuntimeError):
    pass


class ImageryProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ImageryRecord:
    direction: ImageryDirection
    capture_date: str | None
    resource: str


@dataclass(frozen=True)
class ImageryBytes:
    content: bytes
    media_type: str


def build_auth_signature(api_key: str, secret_key: str, timestamp: int) -> str:
    message = f"{api_key}{timestamp}".encode("utf-8")
    # MD5 is required by the EagleView Gateway contract, not chosen for storage.
    return hmac.new(secret_key.encode("utf-8"), message, hashlib.md5).hexdigest()


class EagleViewImageryProvider:
    def __init__(
        self,
        *,
        api_key: str,
        secret_key: str,
        timeout_seconds: float = 10.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.secret_key = secret_key.strip()
        self.timeout_seconds = timeout_seconds
        self.client = client

    def search(self, latitude: float, longitude: float) -> list[ImageryRecord]:
        self._require_configuration()
        _validate_coordinates(latitude, longitude)
        payload = self._get_json(
            f"{GATEWAY_URL}/search/{latitude},{longitude}/{quote(self.api_key, safe='')}"
        )
        images = _response_body(payload).get("images")
        if not isinstance(images, dict):
            return []

        records: list[ImageryRecord] = []
        for direction in DIRECTIONS:
            candidates = images.get(direction)
            if not isinstance(candidates, list) or not candidates:
                continue
            candidate = candidates[0]
            if not isinstance(candidate, dict):
                continue
            resource = candidate.get("imageResource")
            if not isinstance(resource, str) or not _is_allowed_image_resource(resource):
                continue
            capture_date = candidate.get("date")
            records.append(
                ImageryRecord(
                    direction=direction,
                    capture_date=capture_date if isinstance(capture_date, str) else None,
                    resource=resource.rstrip("/"),
                )
            )
        return records

    def fetch_image(
        self,
        record: ImageryRecord,
        *,
        width: int,
        height: int,
    ) -> ImageryBytes:
        if not _is_allowed_image_resource(record.resource):
            raise ImageryProviderUnavailable("EagleView returned an invalid image resource.")
        token = self._authenticate()
        url = (
            f"{record.resource}/{quote(token, safe='')}"
            f"/width:{width};height:{height};imageFormat:jpg"
        )
        response = self._get(url)
        media_type = response.headers.get("content-type", "").split(
            ";",
            1,
        )[0].strip().lower()
        if media_type != EXPECTED_IMAGE_MEDIA_TYPE or not response.content:
            raise ImageryProviderUnavailable(
                "EagleView returned an invalid image response."
            )
        return ImageryBytes(content=response.content, media_type=media_type)

    def _authenticate(self) -> str:
        self._require_configuration()
        timestamp = int(time.time())
        signature = build_auth_signature(
            self.api_key,
            self.secret_key,
            timestamp,
        )
        payload = self._get_json(
            f"{GATEWAY_URL}/authenticate/{quote(self.api_key, safe='')}/"
            f"{timestamp}/{signature}"
        )
        token = _response_body(payload).get("token")
        if not isinstance(token, str) or not token.strip():
            raise ImageryProviderUnavailable(
                "EagleView authentication did not return a token."
            )
        # ponytail: token lifetime is not in the provider contract supplied to CFS;
        # authenticate per image until an explicit expiry can support safe reuse.
        return token.strip()

    def _get_json(self, url: str) -> dict[str, object]:
        response = self._get(url)
        try:
            payload = response.json()
        except ValueError as exc:
            raise ImageryProviderUnavailable("EagleView returned malformed JSON.") from exc
        if not isinstance(payload, dict):
            raise ImageryProviderUnavailable("EagleView returned an invalid response.")
        return payload

    def _get(self, url: str) -> httpx.Response:
        try:
            if self.client is not None:
                response = self.client.get(url, timeout=self.timeout_seconds)
            else:
                response = httpx.get(
                    url,
                    follow_redirects=False,
                    timeout=self.timeout_seconds,
                )
            response.raise_for_status()
            return response
        except httpx.HTTPError as exc:
            raise ImageryProviderUnavailable(
                "EagleView imagery is temporarily unavailable."
            ) from exc

    def _require_configuration(self) -> None:
        if not self.api_key or not self.secret_key:
            raise ImageryNotConfigured("EagleView imagery is not configured.")


def _response_body(payload: dict[str, object]) -> dict[str, object]:
    nested = payload.get("response")
    if not isinstance(nested, dict):
        raise ImageryProviderUnavailable("EagleView returned an invalid response.")
    return nested


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
    ):
        raise ImageryProviderUnavailable("Parcel coordinates are invalid.")


def _is_allowed_image_resource(resource: str) -> bool:
    try:
        parsed = urlsplit(resource)
        hostname = (parsed.hostname or "").lower()
        return (
            parsed.scheme.lower() == "https"
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
            and not parsed.query
            and not parsed.fragment
            and (
                hostname == ALLOWED_IMAGE_HOST_SUFFIX.removeprefix(".")
                or hostname.endswith(ALLOWED_IMAGE_HOST_SUFFIX)
            )
        )
    except ValueError:
        return False
