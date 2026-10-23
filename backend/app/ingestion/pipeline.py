"""Acquire daily windows, validate all records, deduplicate and report coverage."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from app.core.scope import Scope
from app.ingestion.client import ElexonClient
from app.ingestion.models import (
    Forecast,
    IngestionError,
    Outturn,
    parse_forecast,
    parse_outturn,
    utc_text,
)
from app.ingestion.quality import coverage_report


def record_observed_ranges(batch: dict[str, Any], rows: list[Forecast] | list[Outturn]) -> None:
    batch["observed"] = {
        "validated_wind_rows": len(rows),
        "target_time_from": utc_text(min(row.target_time for row in rows)) if rows else None,
        "target_time_to": utc_text(max(row.target_time for row in rows)) if rows else None,
        "publish_time_from": utc_text(min(row.publish_time for row in rows)) if rows else None,
        "publish_time_to": utc_text(max(row.publish_time for row in rows)) if rows else None,
    }


def acquire(
    client: ElexonClient,
    scope: Scope,
    progress: Callable[[str], None] = lambda message: None,
) -> tuple[list[Forecast], list[Outturn], dict[str, Any], list[dict[str, Any]]]:
    forecasts: dict[tuple, Forecast] = {}
    actuals: dict[Any, Outturn] = {}
    batches = []
    duplicate_forecasts = duplicate_actuals = filtered_forecasts = filtered_actuals = 0
    window = scope.publication_start
    while window < scope.publication_end:
        end = min(window + timedelta(days=1), scope.publication_end)
        params = {"publishDateTimeFrom": utc_text(window), "publishDateTimeTo": utc_text(end)}
        rows, batch = client.fetch("WINDFOR", params)
        progress(f"WINDFOR {window.date()}: {len(rows)} source rows")
        batches.append(batch)
        validated_forecasts = []
        for index, source in enumerate(rows):
            try:
                row = parse_forecast(source)
                validated_forecasts.append(row)
                # Elexon may include the upper endpoint. Validate it, then assign
                # exact boundaries to the following half-open request window.
                if not window <= row.publish_time <= end:
                    raise IngestionError("Publication falls outside requested window")
                if row.publish_time == end:
                    continue
                if not scope.delivery_start <= row.target_time < scope.delivery_end:
                    filtered_forecasts += 1
                    continue
                key = (row.target_time, row.publish_time)
                previous = forecasts.get(key)
                if previous is not None:
                    if previous != row:
                        raise IngestionError(f"Conflicting forecast duplicate: {key}")
                    duplicate_forecasts += 1
                else:
                    forecasts[key] = row
            except IngestionError as exc:
                raise IngestionError(f"WINDFOR {window.date()} row {index}: {exc}") from exc
        record_observed_ranges(batch, validated_forecasts)
        window = end

    day = scope.delivery_start.date()
    while day < scope.delivery_end.date():
        params = {
            "settlementDateFrom": day.isoformat(),
            "settlementDateTo": day.isoformat(),
            "fuelType": "WIND",
        }
        rows, batch = client.fetch("FUELHH", params)
        progress(f"FUELHH {day}: {len(rows)} source rows")
        batches.append(batch)
        validated_outturn = []
        for index, source in enumerate(rows):
            try:
                if source.get("dataset") != "FUELHH" or not isinstance(source.get("fuelType"), str):
                    raise IngestionError("Expected FUELHH record with fuelType")
                if source.get("fuelType") != "WIND":
                    filtered_actuals += 1
                    continue
                row = parse_outturn(source)
                validated_outturn.append(row)
                if row.settlement_date != day:
                    raise IngestionError("Outturn falls outside requested settlement date")
                previous = actuals.get(row.target_time)
                if previous is not None:
                    if previous.generation_mw != row.generation_mw:
                        raise IngestionError(f"Conflicting outturn duplicate: {row.target_time}")
                    # Preserve the latest provenance if an identical value is republished.
                    actuals[row.target_time] = max(previous, row, key=lambda r: r.publish_time)
                    duplicate_actuals += 1
                else:
                    actuals[row.target_time] = row
            except IngestionError as exc:
                raise IngestionError(f"FUELHH {day} row {index}: {exc}") from exc
        record_observed_ranges(batch, validated_outturn)
        day += timedelta(days=1)

    forecast_rows = sorted(forecasts.values(), key=lambda r: (r.target_time, r.publish_time))
    outturn_rows = sorted(actuals.values(), key=lambda r: r.target_time)
    report = coverage_report(scope, forecast_rows, outturn_rows)
    report.update(
        {
            "conflicts": 0,
            "forecast_identical_duplicates": duplicate_forecasts,
            "outturn_identical_duplicates": duplicate_actuals,
            "forecast_rows_outside_delivery_scope": filtered_forecasts,
            "non_wind_rows_filtered": filtered_actuals,
            "request_count": len(batches),
        }
    )
    return forecast_rows, outturn_rows, report, batches
