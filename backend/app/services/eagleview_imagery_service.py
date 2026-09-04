import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Literal, Protocol
from urllib.parse import quote

import httpx

ImageryDirection = Literal["north", "south", "east", "west"]
DIRECTIONS: tuple[ImageryDirection, ...] = ("north", "south", "east", "west")
GATEWAY_URL = "https://pol.pictometry.com/Gateway/v1"


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
            if not isinstance(resource, str) or not resource.startswith("https://"):
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
        token = self._authenticate()
        url = (
            f"{record.resource}/{quote(token, safe='')}"
            f"/width:{width};height:{height};imageFormat:jpg"
        )
        response = self._get(url)
        media_type = response.headers.get("content-type", "image/jpeg").split(
            ";",
            1,
        )[0]
        if not media_type.startswith("image/"):
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
        return token

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
                    follow_redirects=True,
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
    return nested if isinstance(nested, dict) else payload
