import hashlib
import json
import math
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.repositories.analysis import open_analysis_repository


@pytest.fixture
def client(analytics_snapshot):
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as session:
        yield session


def test_decision_contract_uses_exact_cutoff_and_hourly_actual_means(client):
    response = client.get("/api/v1/decisions/2026-01-01")
    assert response.status_code == 200
    data = response.json()
    assert data["decision_date"] == "2026-01-01"
    assert data["delivery_date"] == "2026-01-02"
    assert data["cutoff"] == "2026-01-01T09:50:00Z"
    assert len(data["hours"]) == 24
    first = data["hours"][0]
    assert first["forecast_mw"] == 120
    assert first["forecast_published_at"] == "2026-01-01T09:50:00Z"
    assert first["actual_mw"] == 110
    assert first["error_mw"] == 10
    assert data["hours"][1]["forecast_published_at"] == "2026-01-01T09:40:00Z"
    assert data["hours"][2]["actual_mw"] == 0
    assert data["hours"][3]["missing_reasons"] == ["missing_actual_second_half"]
    assert data["hours"][4]["missing_reasons"] == ["missing_forecast"]
    assert data["hours"][5]["missing_reasons"] == ["no_eligible_forecast"]
    assert data["metrics"]["coverage"]["matched_hours"] == 3
    assert data["metrics"]["mae_mw"] == 10
    assert data["metrics"]["rmse_mw"] == pytest.approx(math.sqrt(500 / 3))
    assert data["metrics"]["p90_absolute_error_mw"] == 18
    assert data["meta"]["decision_cutoff_gmt"] == "09:50"


def test_january_31_includes_february_first_last_half_hour(client):
    response = client.get("/api/v1/decisions/2026-01-31")
    assert response.status_code == 200
    data = response.json()
    assert data["delivery_date"] == "2026-02-01"
    assert data["cutoff"] == "2026-01-31T09:50:00Z"
    assert data["hours"][-1]["target_time"] == "2026-02-01T23:00:00Z"
    assert data["hours"][-1]["actual_half_hours_mw"] == [400, 600]
    assert data["hours"][-1]["actual_mw"] == 500


def test_configured_cutoff_changes_replay_evolution_and_quality_consistently(analytics_snapshot):
    with TestClient(
        create_app(Settings(database_path=analytics_snapshot, decision_cutoff_gmt="10:15"))
    ) as client:
        decision = client.get("/api/v1/decisions/2026-01-01").json()
        quality = client.get("/api/v1/data-quality").json()
        evolution = client.get(
            "/api/v1/evolution", params={"target_time": "2026-01-02T00:00:00Z"}
        ).json()
    assert decision["hours"][0]["forecast_mw"] == 999
    assert decision["metrics"]["coverage"]["matched_hours"] == 4
    assert quality["meta"]["decision_cutoff_gmt"] == "10:15"
    assert quality["ingestion"]["decision_cutoff_gmt"] == "09:50"
    assert quality["current_coverage"]["matched_hours"] == 29  # 4 + 24 + 1
    assert evolution["comparison"]["forecast_mw"] == 999
    assert evolution["cutoff"] == decision["cutoff"]


def test_accuracy_range_and_daily_results_agree(client):
    params = {"from": "2026-01-01", "to": "2026-01-02"}
    response = client.get("/api/v1/accuracy", params=params)
    assert response.status_code == 200
    overall = response.json()
    daily = client.get("/api/v1/accuracy/daily", params=params).json()
    result = overall["metrics"]
    assert result["coverage"]["expected_hours"] == 48
    assert result["coverage"]["matched_hours"] == 27
    assert result["mae_mw"] == pytest.approx(30 / 27)
    assert result["bias_mw"] == pytest.approx(-10 / 27)
    assert sum(day["metrics"]["coverage"]["matched_hours"] for day in daily["days"]) == 27
    assert [day["decision_date"] for day in daily["days"]] == ["2026-01-01", "2026-01-02"]
    assert sum(bin["count"] for bin in overall["error_histogram"]) == 27
    assert overall["worst_hours"][0]["error_mw"] == -20


def test_no_matched_data_has_null_metrics_without_json_nan(client):
    response = client.get("/api/v1/decisions/2026-01-10")
    assert response.status_code == 200
    data = response.json()
    assert data["metrics"]["mae_mw"] is None
    assert data["metrics"]["coverage"]["matched_hours"] == 0
    assert data["metrics"]["coverage"]["coverage_percent"] == 0
    assert len(data["hours"]) == 24
    assert "NaN" not in response.text


@pytest.mark.parametrize("target", ["2026-01-02T00:00:00Z", "2026-01-02T01:00:00Z"])
def test_evolution_is_chronological_and_marks_the_latest_eligible_publication(client, target):
    response = client.get("/api/v1/evolution", params={"target_time": target})
    assert response.status_code == 200
    data = response.json()
    publications = data["publications"]
    assert [row["publish_time"] for row in publications] == sorted(
        row["publish_time"] for row in publications
    )
    selected = [row for row in publications if row["selected_as_of"]]
    assert len(selected) == 1
    assert selected[0]["available_at_cutoff"] is True
    assert selected[0]["publish_time"] == data["comparison"]["forecast_published_at"]
    if target.endswith("01:00:00Z"):
        assert publications[-1]["value_changed_from_previous"] is False
    else:
        assert publications[-1]["available_at_cutoff"] is False


def test_quality_uses_current_policy_and_preserves_ingestion_provenance(client):
    response = client.get("/api/v1/data-quality")
    assert response.status_code == 200
    data = response.json()
    assert data["current_coverage"]["expected_hours"] == 744
    assert data["current_coverage"]["matched_hours"] == 28
    assert len(data["missing_hours"]) == 716
    assert data["ingestion"]["complete"] is False
    assert data["meta"]["snapshot_id"]


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/decisions/2026-01-01",
        "/api/v1/accuracy",
        "/api/v1/accuracy/daily",
        "/api/v1/evolution?target_time=2026-01-02T00:00:00Z",
        "/api/v1/data-quality",
    ],
)
def test_analytical_results_reference_shared_metadata_without_repeating_it(client, url):
    metadata = client.get("/api/v1/metadata").json()
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert "context" not in data
    assert data["meta"] == {
        "snapshot_id": metadata["snapshot"]["content_sha256"],
        "decision_cutoff_gmt": metadata["decision_cutoff_gmt"],
    }
    assert metadata["power_unit"] == "MW"
    assert metadata["actuals_are_retrospective"] is True
    assert metadata["sources"]
    assert metadata["limitations"]


def test_snapshot_identity_alone_does_not_identify_the_cutoff_policy(analytics_snapshot):
    results = []
    for cutoff in ["09:50", "10:15"]:
        with TestClient(
            create_app(Settings(database_path=analytics_snapshot, decision_cutoff_gmt=cutoff))
        ) as client:
            results.append(client.get("/api/v1/accuracy").json())
    first, second = results
    assert first["meta"]["snapshot_id"] == second["meta"]["snapshot_id"]
    assert first["meta"]["decision_cutoff_gmt"] != second["meta"]["decision_cutoff_gmt"]
    assert (
        first["metrics"]["coverage"]["matched_hours"]
        != second["metrics"]["coverage"]["matched_hours"]
    )


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/decisions/2025-12-31",
        "/api/v1/decisions/2026-02-01",
        "/api/v1/decisions/not-a-date",
        "/api/v1/decisions/2026-01-01T00:00:00Z",
        "/api/v1/accuracy?from=2026-01-10&to=2026-01-01",
        "/api/v1/accuracy/daily?from=2025-12-31",
        "/api/v1/accuracy?from=2026-02-30",
        "/api/v1/evolution?target_time=2026-01-01T00:00:00Z",
        "/api/v1/evolution?target_time=2026-02-02T00:00:00Z",
        "/api/v1/evolution?target_time=2026-01-02T00:30:00Z",
        "/api/v1/evolution?target_time=2026-01-02T00:00:00",
        "/api/v1/evolution",
    ],
)
def test_invalid_inputs_return_structured_422_not_snapshot_errors(client, url):
    response = client.get(url)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "invalid_request"
    assert response.json()["error"]["message"]


def test_offset_target_is_normalized_to_the_matching_utc_hour(client):
    response = client.get("/api/v1/evolution", params={"target_time": "2026-01-02T01:00:00+01:00"})
    assert response.status_code == 200
    assert response.json()["comparison"]["target_time"] == "2026-01-02T00:00:00Z"


@pytest.mark.parametrize(
    "kind, code", [("missing", "snapshot_missing"), ("invalid", "snapshot_invalid")]
)
def test_missing_or_invalid_database_returns_actionable_503_without_creating_data(
    tmp_path, kind, code
):
    path = tmp_path / "unavailable.sqlite3"
    if kind == "invalid":
        path.write_text("not a SQLite database")
    with TestClient(create_app(Settings(database_path=path))) as client:
        response = client.get("/api/v1/accuracy")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == code
    assert str(path) not in response.text
    if kind == "missing":
        assert not path.exists()


def test_endpoints_are_read_only_and_expose_typed_openapi_contracts(client, analytics_snapshot):
    digest = hashlib.sha256(analytics_snapshot.read_bytes()).hexdigest()
    for url in [
        "/api/v1/metadata",
        "/api/v1/accuracy",
        "/api/v1/accuracy/daily",
        "/api/v1/data-quality",
    ]:
        assert client.get(url).status_code == 200
    assert hashlib.sha256(analytics_snapshot.read_bytes()).hexdigest() == digest
    schema = client.get("/openapi.json").json()
    for path in ["/api/v1/accuracy", "/api/v1/decisions/{decision_date}", "/api/v1/data-quality"]:
        assert (
            "$ref"
            in schema["paths"][path]["get"]["responses"]["200"]["content"]["application/json"][
                "schema"
            ]
        )
    with closing(sqlite3.connect(analytics_snapshot)) as database, database:
        assert database.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_request_repository_allows_sequential_dependency_and_route_worker_handoff(
    analytics_snapshot,
):
    with open_analysis_repository(analytics_snapshot) as repository:
        with ThreadPoolExecutor(max_workers=1) as worker:
            rows = worker.submit(
                repository.forecasts,
                datetime(2026, 1, 2, tzinfo=UTC),
                datetime(2026, 1, 3, tzinfo=UTC),
            ).result()
    assert len(rows) == 10


def test_unrelated_programming_error_is_not_mislabeled_as_an_invalid_snapshot(analytics_snapshot):
    with pytest.raises(ValueError, match="unrelated programming error"):
        with open_analysis_repository(analytics_snapshot):
            raise ValueError("unrelated programming error")


@pytest.mark.parametrize("corruption", ["counts", "metadata", "source_value"])
def test_corrupt_snapshot_metadata_or_records_fail_with_structured_503(
    analytics_snapshot, corruption
):
    with closing(sqlite3.connect(analytics_snapshot)) as database, database:
        if corruption == "source_value":
            database.execute("UPDATE forecasts SET generation_mw='not-MW'")
        else:
            report = json.loads(database.execute("SELECT value FROM metadata").fetchone()[0])
            if corruption == "counts":
                report["forecast_records"] += 1
            else:
                report["retrieved_at"] = "not-a-timestamp"
            database.execute("UPDATE metadata SET value=?", (json.dumps(report),))
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        response = client.get("/api/v1/accuracy")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "snapshot_invalid"
