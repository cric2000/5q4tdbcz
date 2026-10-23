from datetime import UTC, datetime, timedelta

import pytest

from app.ingestion.models import Forecast, Outturn, Scope
from app.ingestion.quality import coverage_report
from app.repositories.snapshot import write_snapshot


def instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@pytest.fixture
def analytics_snapshot(tmp_path):
    """Small, deliberately incomplete data with hand-computable Jan 1 errors: +10, -20, 0."""
    forecasts, actuals = [], []

    def forecast(target, publish, value):
        forecasts.append(Forecast(instant(target), instant(publish), value))

    def actual(target, value):
        start = instant(target)
        actuals.append(
            Outturn(
                start,
                start + timedelta(minutes=30),
                value,
                start.date(),
                start.hour * 2 + start.minute // 30 + 1,
            )
        )

    hour = "2026-01-02T00:00:00Z"
    for publish, value in [
        ("2025-12-31T23:30:00Z", 99),
        ("2026-01-01T09:30:00Z", 100),
        ("2026-01-01T09:50:00Z", 120),
        ("2026-01-01T09:50:01Z", 999),
        ("2026-01-02T00:10:00Z", 9999),
    ]:
        forecast(hour, publish, value)
    actual(hour, 100)
    actual("2026-01-02T00:30:00Z", 120)

    for publish in ["2026-01-01T09:30:00Z", "2026-01-01T09:40:00Z"]:
        forecast("2026-01-02T01:00:00Z", publish, 200)
    actual("2026-01-02T01:00:00Z", 210)
    actual("2026-01-02T01:30:00Z", 230)
    forecast("2026-01-02T02:00:00Z", "2026-01-01T09:30:00Z", 0)
    actual("2026-01-02T02:00:00Z", 0)
    actual("2026-01-02T02:30:00Z", 0)
    forecast("2026-01-02T03:00:00Z", "2026-01-01T08:00:00Z", 300)
    actual("2026-01-02T03:00:00Z", 50)
    for half in ["2026-01-02T04:00:00Z", "2026-01-02T04:30:00Z"]:
        actual(half, 100)
    forecast("2026-01-02T05:00:00Z", "2026-01-01T10:00:00Z", 200)
    for half in ["2026-01-02T05:00:00Z", "2026-01-02T05:30:00Z"]:
        actual(half, 200)

    # Jan 2 decisions: a full next day with exact forecasts, distinct from Jan 1 errors.
    for hour in range(24):
        target = datetime(2026, 1, 3, hour, tzinfo=UTC)
        forecast(target.isoformat(), "2026-01-02T09:30:00Z", 100 + hour)
        actual(target.isoformat(), 90 + hour)
        actual((target + timedelta(minutes=30)).isoformat(), 110 + hour)

    forecast("2026-02-01T23:00:00Z", "2026-01-31T09:30:00Z", 500)
    actual("2026-02-01T23:00:00Z", 400)
    actual("2026-02-01T23:30:00Z", 600)

    quality = coverage_report(Scope("09:50"), forecasts, actuals)
    quality.update(
        {
            "conflicts": 0,
            "forecast_identical_duplicates": 0,
            "outturn_identical_duplicates": 0,
            "forecast_rows_outside_delivery_scope": 0,
            "non_wind_rows_filtered": 0,
            "request_count": 1,
        }
    )
    path = tmp_path / "analytical-fixture.sqlite3"
    write_snapshot(
        path,
        forecasts,
        actuals,
        quality,
        [
            {
                "dataset": "WINDFOR",
                "retrieved_at": "2026-02-03T00:00:00Z",
                "url": "https://example.test/synthetic-test-fixture",
            }
        ],
        allow_incomplete=True,
    )
    return path
