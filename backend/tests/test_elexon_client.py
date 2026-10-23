import httpx
import pytest

from app.ingestion import client as client_module
from app.ingestion.client import ElexonClient
from app.ingestion.models import IngestionError


def test_bounded_request_records_parameters_and_response_provenance():
    def handler(request):
        assert request.url.params["fuelType"] == "WIND"
        assert "publishDateTimeFrom" not in request.url.params
        return httpx.Response(200, json=[])

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        rows, batch = ElexonClient(http).fetch("FUELHH", {"fuelType": "WIND"})
    assert rows == []
    assert batch["response_rows"] == 0
    assert len(batch["response_sha256"]) == 64
    assert batch["attempts"] == 1


def test_rate_limit_and_server_errors_retry_with_bounded_backoff():
    responses = iter(
        [
            httpx.Response(429, headers={"Retry-After": "60"}),
            httpx.Response(503),
            httpx.Response(200, json=[]),
        ]
    )
    delays = []
    with httpx.Client(transport=httpx.MockTransport(lambda request: next(responses))) as http:
        _, batch = ElexonClient(http, sleep=delays.append).fetch("WINDFOR", {})
    assert delays == [30, 2]
    assert batch["attempts"] == 3


def test_transport_failure_exhausts_retry_budget():
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("offline", request=request)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(IngestionError, match="after retries"):
            ElexonClient(http, sleep=lambda delay: None).fetch("WINDFOR", {})
    assert len(calls) == 3


def test_bad_query_fails_without_retry():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(IngestionError, match="HTTP 400"):
            ElexonClient(http).fetch("FUELHH", {})
    assert len(calls) == 1


@pytest.mark.parametrize("status", [429, 503])
def test_retryable_http_errors_eventually_fail(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(IngestionError, match=f"HTTP {status}"):
            ElexonClient(http, sleep=lambda delay: None).fetch("WINDFOR", {})
    assert len(calls) == 3


@pytest.mark.parametrize("payload", [b"not json", b'{"data": []}', b"[1]", b"null"])
def test_rejects_invalid_json_or_unexpected_stream_shape(payload):
    with httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=payload))
    ) as http:
        with pytest.raises(IngestionError):
            ElexonClient(http).fetch("WINDFOR", {})


def test_response_byte_limit_aborts_before_parsing(monkeypatch):
    monkeypatch.setattr(client_module, "MAX_RESPONSE_BYTES", 3)
    with httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"[{}, {}]"))
    ) as http:
        with pytest.raises(IngestionError, match="byte limit"):
            ElexonClient(http).fetch("WINDFOR", {})


def test_response_row_limit_never_silently_truncates(monkeypatch):
    monkeypatch.setattr(client_module, "MAX_RESPONSE_ROWS", 1)
    with httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[{}, {}]))
    ) as http:
        with pytest.raises(IngestionError, match="row limit"):
            ElexonClient(http).fetch("WINDFOR", {})
