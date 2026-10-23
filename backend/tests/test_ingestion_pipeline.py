import json
import sqlite3
from datetime import date, timedelta

import httpx
import pytest

from app.ingestion.client import ElexonClient
from app.ingestion.models import IngestionError, Scope, utc_text
from app.ingestion.pipeline import acquire
from app.repositories.snapshot import read_quality_report, write_snapshot

SCOPE = Scope("09:50", date(2026, 1, 31), date(2026, 1, 31))


def source_records():
    forecasts, actuals = [], []
    for hour in SCOPE.target_hours():
        for publish in ["2026-01-31T09:50:00Z", "2026-01-31T11:30:00Z", "2026-02-02T02:30:00Z"]:
            forecasts.append(
                {
                    "dataset": "WINDFOR",
                    "publishTime": publish,
                    "startTime": utc_text(hour),
                    "generation": 100,
                }
            )
        for half in range(2):
            target = hour + timedelta(minutes=30 * half)
            actuals.append(
                {
                    "dataset": "FUELHH",
                    "fuelType": "WIND",
                    "startTime": utc_text(target),
                    "publishTime": utc_text(target + timedelta(minutes=30)),
                    "generation": 0,
                    "settlementDate": "2026-02-01",
                    "settlementPeriod": hour.hour * 2 + half + 1,
                }
            )
    return forecasts, actuals


def acquire_fixture(forecasts, actuals, scope=SCOPE):
    def handler(request):
        params = request.url.params
        if "WINDFOR" in request.url.path:
            assert set(params) == {"publishDateTimeFrom", "publishDateTimeTo"}
            rows = [
                row
                for row in forecasts
                if params["publishDateTimeFrom"]
                <= row["publishTime"]
                <= params["publishDateTimeTo"]
            ]
        else:
            assert set(params) == {"settlementDateFrom", "settlementDateTo", "fuelType"}
            assert params["settlementDateFrom"] == params["settlementDateTo"] == "2026-02-01"
            rows = actuals
        return httpx.Response(200, json=rows)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        return acquire(ElexonClient(http), scope)


def test_retains_revisions_and_verifies_january_31_coverage_with_real_zero_outturn():
    result = acquire_fixture(*source_records())
    forecasts, actuals, quality, batches = result
    assert len(forecasts) == 72
    assert len(actuals) == 48
    assert quality["complete"] is True
    assert quality["eligible_forecast_hours"] == 24
    assert quality["comparable_hours"] == 24
    assert quality["daily"][0]["decision_date"] == "2026-01-31"
    assert quality["daily"][0]["delivery_date"] == "2026-02-01"
    assert len(batches) == quality["request_count"] == 7
    assert batches[-1]["observed"]["validated_wind_rows"] == 48
    assert batches[-1]["observed"]["target_time_to"] == "2026-02-01T23:30:00Z"


def test_deduplicates_identical_rows_and_filters_non_wind():
    forecasts, actuals = source_records()
    forecasts.append(forecasts[0].copy())
    actuals.append(actuals[0].copy())
    actuals.append({**actuals[0], "fuelType": "GAS", "generation": 1000})
    _, _, quality, _ = acquire_fixture(forecasts, actuals)
    assert quality["forecast_identical_duplicates"] == 1
    assert quality["outturn_identical_duplicates"] == 1
    assert quality["non_wind_rows_filtered"] == 1
    assert quality["outturn_half_hours"] == 48


@pytest.mark.parametrize("dataset", ["forecast", "outturn"])
def test_conflicting_keys_fail_instead_of_overwriting(dataset):
    forecasts, actuals = source_records()
    rows = forecasts if dataset == "forecast" else actuals
    rows.append({**rows[0], "generation": 999})
    with pytest.raises(IngestionError, match="Conflicting"):
        acquire_fixture(forecasts, actuals)


def test_incomplete_half_hour_is_reported_and_never_imputed():
    forecasts, actuals = source_records()
    missing = actuals.pop(1)["startTime"]
    _, _, quality, _ = acquire_fixture(forecasts, actuals)
    assert quality["missing_outturn_half_hours"] == [missing]
    assert quality["complete_actual_hours"] == quality["comparable_hours"] == 23
    assert quality["complete"] is False


def test_after_cutoff_publications_cannot_satisfy_availability():
    forecasts, actuals = source_records()
    forecasts = [row for row in forecasts if row["publishTime"] != "2026-01-31T09:50:00Z"]
    _, _, quality, _ = acquire_fixture(forecasts, actuals)
    assert quality["forecast_target_hours"] == 24
    assert quality["eligible_forecast_hours"] == 0
    assert len(quality["missing_eligible_forecasts"]) == 24


def test_changed_cutoff_changes_eligibility_without_dropping_revision_history():
    forecasts, actuals = source_records()
    forecasts = [row for row in forecasts if row["publishTime"] != "2026-01-31T09:50:00Z"]
    _, _, quality, _ = acquire_fixture(
        forecasts, actuals, Scope("11:30", date(2026, 1, 31), date(2026, 1, 31))
    )
    assert quality["eligible_forecast_hours"] == 24
    assert quality["forecast_records"] == 48


def test_exact_publication_window_boundary_belongs_to_one_batch_only():
    forecasts, actuals = source_records()
    boundary = {**forecasts[0], "publishTime": "2026-02-01T00:00:00Z"}
    forecasts.append(boundary)
    rows, _, quality, _ = acquire_fixture(forecasts, actuals)
    assert len(rows) == 73
    assert quality["forecast_identical_duplicates"] == 0


def test_snapshot_rebuild_has_stable_content_identity_and_row_counts(tmp_path):
    records = acquire_fixture(*source_records())
    path = tmp_path / "snapshot.sqlite3"
    first = write_snapshot(path, *records)
    forecasts, actuals, quality, batches = records
    second = write_snapshot(
        path, list(reversed(forecasts)), list(reversed(actuals)), quality, batches
    )
    assert first["content_sha256"] == second["content_sha256"]
    assert read_quality_report(path) == second
    with sqlite3.connect(path) as database:
        assert database.execute("SELECT COUNT(*) FROM forecasts").fetchone()[0] == 72
        assert database.execute("SELECT COUNT(*) FROM outturn").fetchone()[0] == 48
        assert database.execute("SELECT COUNT(*) FROM source_requests").fetchone()[0] == 7
        detail = json.loads(
            database.execute("SELECT details FROM source_requests LIMIT 1").fetchone()[0]
        )
        assert detail["parameters"]["publishDateTimeFrom"].endswith("Z")
        assert database.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_incomplete_rebuild_preserves_previous_database(tmp_path):
    records = acquire_fixture(*source_records())
    path = tmp_path / "snapshot.sqlite3"
    write_snapshot(path, *records)
    original = path.read_bytes()
    forecasts, actuals = source_records()
    actuals.pop()
    incomplete = acquire_fixture(forecasts, actuals)
    with pytest.raises(IngestionError, match="Coverage is incomplete"):
        write_snapshot(path, *incomplete)
    assert path.read_bytes() == original
    report = write_snapshot(path, *incomplete, allow_incomplete=True)
    assert report["complete"] is False


def test_sqlite_failure_cannot_replace_previous_snapshot(tmp_path):
    records = acquire_fixture(*source_records())
    path = tmp_path / "snapshot.sqlite3"
    write_snapshot(path, *records)
    original = path.read_bytes()
    forecasts, actuals, quality, batches = records
    with pytest.raises(sqlite3.IntegrityError):
        write_snapshot(path, [*forecasts, forecasts[0]], actuals, quality, batches)
    assert path.read_bytes() == original
    assert not list(tmp_path.glob("*.tmp"))
