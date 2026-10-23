from datetime import UTC, datetime

import pytest

from app.core.scope import Scope
from app.ingestion.models import (
    IngestionError,
    parse_forecast,
    parse_generation,
    parse_outturn,
    parse_timestamp,
)


def forecast_row(**changes):
    return {
        "dataset": "WINDFOR",
        "startTime": "2026-02-01T00:00:00Z",
        "publishTime": "2026-01-31T09:30:00Z",
        "generation": 100,
        **changes,
    }


def outturn_row(**changes):
    return {
        "dataset": "FUELHH",
        "fuelType": "WIND",
        "startTime": "2026-02-01T00:00:00Z",
        "publishTime": "2026-02-01T00:30:00Z",
        "generation": 0,
        "settlementDate": "2026-02-01",
        "settlementPeriod": 1,
        **changes,
    }


def test_forecast_normalizes_offset_to_utc_without_dropping_publication():
    row = parse_forecast(forecast_row(startTime="2026-02-01T01:00:00+01:00"))
    assert row.target_time == datetime(2026, 2, 1, tzinfo=UTC)
    assert row.publish_time == datetime(2026, 1, 31, 9, 30, tzinfo=UTC)
    assert row.generation_mw == 100


@pytest.mark.parametrize("value", [None, 42, "bad", "2026-01-01T00:00:00", "2026-99-01T00:00:00Z"])
def test_rejects_missing_bad_or_naive_timestamps(value):
    with pytest.raises(IngestionError):
        parse_timestamp(value, "startTime")


@pytest.mark.parametrize("value", [None, "100", True, -1, float("nan"), float("inf")])
def test_rejects_invalid_wind_generation(value):
    with pytest.raises(IngestionError):
        parse_generation(value)


@pytest.mark.parametrize(
    "changes",
    [
        {"dataset": "FUELHH"},
        {"startTime": "2026-02-01T00:30:00Z"},
        {"publishTime": None},
        {"generation": None},
    ],
)
def test_rejects_wrong_or_malformed_forecast(changes):
    with pytest.raises(IngestionError):
        parse_forecast(forecast_row(**changes))


def test_outturn_zero_is_a_valid_observation():
    assert parse_outturn(outturn_row()).generation_mw == 0


@pytest.mark.parametrize(
    "changes",
    [
        {"fuelType": "GAS"},
        {"dataset": "FUELINST"},
        {"settlementDate": "2026-01-31"},
        {"settlementPeriod": 2},
        {"settlementPeriod": True},
        {"settlementDate": None},
        {"startTime": "2026-02-01T00:15:00Z"},
    ],
)
def test_rejects_outturn_with_wrong_category_or_settlement_alignment(changes):
    with pytest.raises(IngestionError):
        parse_outturn(outturn_row(**changes))


def test_scope_covers_all_january_decisions_including_february_first():
    scope = Scope("10:15")
    hours = scope.target_hours()
    assert len(hours) == 744
    assert hours[0] == datetime(2026, 1, 2, tzinfo=UTC)
    assert hours[-1] == datetime(2026, 2, 1, 23, tzinfo=UTC)
    assert scope.cutoff(scope.decision_end) == datetime(2026, 1, 31, 10, 15, tzinfo=UTC)
