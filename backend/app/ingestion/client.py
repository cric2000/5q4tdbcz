"""Bounded, retrying HTTP access. Stream endpoints return a JSON array, not pages."""

import hashlib
import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx

from app.ingestion.models import IngestionError, utc_text

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_RESPONSE_ROWS = 50_000


class ElexonClient:
    def __init__(
        self,
        http: httpx.Client,
        *,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        attempts: int = 3,
    ):
        self.http = http
        self.sleep = sleep
        self.now = now
        self.attempts = attempts

    def fetch(
        self, dataset: str, params: dict[str, str]
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if dataset not in {"WINDFOR", "FUELHH"}:
            raise IngestionError("Unsupported dataset")
        url = f"{BASE_URL}/datasets/{dataset}/stream"
        for attempt in range(self.attempts):
            try:
                with self.http.stream("GET", url, params=params) as response:
                    if response.status_code == 429 or response.status_code >= 500:
                        if attempt + 1 == self.attempts:
                            response.raise_for_status()
                        retry_after = response.headers.get("Retry-After", "")
                        delay = min(float(retry_after), 30) if retry_after.isdigit() else 2**attempt
                        self.sleep(delay)
                        continue
                    response.raise_for_status()
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > MAX_RESPONSE_BYTES:
                            raise IngestionError(f"{dataset} response exceeds byte limit")
                break
            except httpx.TransportError as exc:
                if attempt + 1 == self.attempts:
                    raise IngestionError(f"{dataset} request failed after retries: {exc}") from exc
                self.sleep(2**attempt)
            except httpx.HTTPStatusError as exc:
                raise IngestionError(
                    f"{dataset} HTTP {exc.response.status_code}: {exc.request.url}"
                ) from exc
        else:
            raise IngestionError(f"{dataset} retry budget exhausted")
        try:
            rows = json.loads(content)
        except (ValueError, UnicodeDecodeError) as exc:
            raise IngestionError(f"{dataset} returned invalid JSON") from exc
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise IngestionError(f"{dataset} stream must return a JSON array of objects")
        if len(rows) > MAX_RESPONSE_ROWS:
            raise IngestionError(f"{dataset} response exceeds row limit; narrow the request window")
        return rows, {
            "dataset": dataset,
            "url": str(httpx.URL(url, params=params)),
            "parameters": params,
            "retrieved_at": utc_text(self.now()),
            "response_sha256": hashlib.sha256(content).hexdigest(),
            "response_bytes": len(content),
            "response_rows": len(rows),
            "attempts": attempt + 1,
        }
