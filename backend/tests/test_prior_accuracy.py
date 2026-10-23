import hashlib
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.ingestion.models import Forecast, Outturn
from app.main import create_app
from app.repositories.analysis import AnalysisRepository


def test_first_buying_day_has_no_earlier_deliveries(analytics_snapshot):
    digest = hashlib.sha256(analytics_snapshot.read_bytes()).hexdigest()
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        data = client.get("/api/v1/decisions/2026-01-01/prior-accuracy").json()
        schema = client.get("/openapi.json").json()
    assert (
        "$ref"
        in schema["paths"]["/api/v1/decisions/{decision_date}/prior-accuracy"]["get"]["responses"][
            "200"
        ]["content"]["application/json"]["schema"]
    )
    assert hashlib.sha256(analytics_snapshot.read_bytes()).hexdigest() == digest
    assert data["delivery_start"] is None and data["delivery_end"] is None
    assert data["metrics"]["coverage"]["expected_hours"] == 0
    assert data["metrics"]["coverage"]["matched_hours"] == 0
    assert data["metrics"]["coverage"]["coverage_percent"] is None
    assert data["metrics"]["mae_mw"] is None


def test_uses_completed_hours_and_original_buying_forecasts(analytics_snapshot):
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        response = client.get("/api/v1/decisions/2026-01-02/prior-accuracy")
    assert response.status_code == 200
    data = response.json()
    assert data["decision_date"] == "2026-01-02"
    assert data["cutoff"] == "2026-01-02T09:50:00Z"
    assert data["delivery_start"] == "2026-01-02T00:00:00Z"
    assert data["delivery_end"] == "2026-01-02T09:00:00Z"
    # Only completed hours 00..08, never the rest of Jan 2 or Jan 3 outcomes.
    assert data["metrics"]["coverage"]["expected_hours"] == 9
    assert data["metrics"]["coverage"]["matched_hours"] == 3
    # Errors +10, -20 and a valid zero. The later 9999-MW revision must not enter.
    assert data["metrics"]["mae_mw"] == 10
    assert data["metrics"]["bias_mw"] == pytest.approx(-10 / 3)
    assert data["metrics"]["exact_hours"] == 1


@pytest.mark.parametrize("seconds, matched, mae", [(-1, 3, 10), (0, 3, 10), (1, 2, 15)])
def test_both_actual_publications_must_be_available_at_cutoff(
    analytics_snapshot, monkeypatch, seconds, matched, mae
):
    original = AnalysisRepository.outturn
    cutoff = datetime(2026, 1, 2, 9, 50, tzinfo=UTC)

    def with_delayed_reading(repository, start, end):
        return [
            replace(row, publish_time=cutoff + timedelta(seconds=seconds))
            if row.target_time == datetime(2026, 1, 2, 2, 30, tzinfo=UTC)
            else row
            for row in original(repository, start, end)
        ]

    monkeypatch.setattr(AnalysisRepository, "outturn", with_delayed_reading)
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        prior = client.get("/api/v1/decisions/2026-01-02/prior-accuracy").json()
        retrospective = client.get("/api/v1/decisions/2026-01-01").json()
    assert prior["metrics"]["coverage"]["matched_hours"] == matched
    assert prior["metrics"]["mae_mw"] == mae
    # Publication filtering is local to prior accuracy; retrospective review is unchanged.
    assert retrospective["metrics"]["coverage"]["matched_hours"] == 3


@pytest.mark.parametrize("cutoff, expected", [("00:00", 0), ("09:00", 9), ("10:15", 10)])
def test_completed_hour_boundary_uses_configured_deadline(analytics_snapshot, cutoff, expected):
    with TestClient(
        create_app(Settings(database_path=analytics_snapshot, decision_cutoff_gmt=cutoff))
    ) as client:
        data = client.get("/api/v1/decisions/2026-01-02/prior-accuracy").json()
    assert data["metrics"]["coverage"]["expected_hours"] == expected
    assert data["meta"]["decision_cutoff_gmt"] == cutoff
    if expected == 0:
        assert data["delivery_start"] is None and data["delivery_end"] is None


def test_unfinished_hour_is_excluded_even_if_readings_claim_early_publication(
    analytics_snapshot, monkeypatch
):
    target = datetime(2026, 1, 2, 9, tzinfo=UTC)
    original_forecasts, original_actuals = AnalysisRepository.forecasts, AnalysisRepository.outturn

    def forecasts(repository, start, end):
        return original_forecasts(repository, start, end) + [
            Forecast(target, datetime(2026, 1, 1, 9, 30, tzinfo=UTC), 100000)
        ]

    def actuals(repository, start, end):
        return original_actuals(repository, start, end) + [
            Outturn(
                target + timedelta(minutes=offset),
                datetime(2026, 1, 2, 9, 40, tzinfo=UTC),
                0,
                target.date(),
                19 + offset // 30,
            )
            for offset in [0, 30]
        ]

    monkeypatch.setattr(AnalysisRepository, "forecasts", forecasts)
    monkeypatch.setattr(AnalysisRepository, "outturn", actuals)
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        data = client.get("/api/v1/decisions/2026-01-02/prior-accuracy").json()
    assert data["metrics"]["coverage"]["expected_hours"] == 9
    assert data["metrics"]["coverage"]["matched_hours"] == 3
    assert data["metrics"]["mae_mw"] == 10


def test_last_buying_day_excludes_its_next_day_outcomes(analytics_snapshot):
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        data = client.get("/api/v1/decisions/2026-01-31/prior-accuracy").json()
    assert data["delivery_end"] == "2026-01-31T09:00:00Z"
    assert data["metrics"]["coverage"]["expected_hours"] == 29 * 24 + 9
    assert data["metrics"]["coverage"]["matched_hours"] == 27


@pytest.mark.parametrize("day", ["2025-12-31", "2026-02-01", "not-a-date"])
def test_prior_accuracy_rejects_out_of_scope_decisions(analytics_snapshot, day):
    with TestClient(create_app(Settings(database_path=analytics_snapshot))) as client:
        response = client.get(f"/api/v1/decisions/{day}/prior-accuracy")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
