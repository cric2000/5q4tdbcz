"""Availability counts only: no forecast-error metrics or outturn interpolation."""

from datetime import timedelta
from typing import Any

from app.core.scope import Scope
from app.ingestion.models import Forecast, Outturn, utc_text


def coverage_report(
    scope: Scope,
    forecasts: list[Forecast],
    outturn: list[Outturn],
) -> dict[str, Any]:
    earliest_publication = {}
    for row in forecasts:
        previous = earliest_publication.get(row.target_time)
        if previous is None or row.publish_time < previous:
            earliest_publication[row.target_time] = row.publish_time
    actual_times = {row.target_time for row in outturn}
    daily: dict[str, Any] = {}
    missing_forecast, missing_eligible, missing_outturn = [], [], []
    comparable_hours = complete_actual_hours = eligible_hours = 0
    for target in scope.target_hours():
        decision = target.date() - timedelta(days=1)
        key = decision.isoformat()
        day = daily.setdefault(
            key,
            {
                "decision_date": key,
                "delivery_date": target.date().isoformat(),
                "expected_hours": 24,
                "eligible_forecast_hours": 0,
                "outturn_half_hours": 0,
                "complete_actual_hours": 0,
                "comparable_hours": 0,
            },
        )
        publication = earliest_publication.get(target)
        eligible = publication is not None and publication <= scope.cutoff(decision)
        if publication is None:
            missing_forecast.append(utc_text(target))
        if not eligible:
            missing_eligible.append(utc_text(target))
        samples = [target, target + timedelta(minutes=30)]
        present = sum(sample in actual_times for sample in samples)
        missing_outturn.extend(utc_text(sample) for sample in samples if sample not in actual_times)
        complete = present == 2
        matched = eligible and complete
        eligible_hours += int(eligible)
        complete_actual_hours += int(complete)
        comparable_hours += int(matched)
        day["eligible_forecast_hours"] += int(eligible)
        day["outturn_half_hours"] += present
        day["complete_actual_hours"] += int(complete)
        day["comparable_hours"] += int(matched)
    hours = len(scope.target_hours())
    return {
        "decision_date_from": scope.decision_start.isoformat(),
        "decision_date_to": scope.decision_end.isoformat(),
        "delivery_start": utc_text(scope.delivery_start),
        "delivery_end_exclusive": utc_text(scope.delivery_end),
        "decision_cutoff_gmt": scope.cutoff_gmt,
        "cutoff_is_assumed": True,
        "publication_start": utc_text(scope.publication_start),
        "publication_end_exclusive": utc_text(scope.publication_end),
        "forecast_records": len(forecasts),
        "forecast_target_hours": len(earliest_publication),
        "outturn_half_hours": len(outturn),
        "expected_hours": hours,
        "expected_outturn_half_hours": hours * 2,
        "eligible_forecast_hours": eligible_hours,
        "complete_actual_hours": complete_actual_hours,
        "comparable_hours": comparable_hours,
        "missing_forecast_targets": missing_forecast,
        "missing_eligible_forecasts": missing_eligible,
        "missing_outturn_half_hours": missing_outturn,
        "complete": comparable_hours == hours,
        "daily": list(daily.values()),
        "notes": [
            "Coverage describes source availability, not forecast accuracy.",
            "Forecast history is limited to the stated acquisition publication window.",
            "WINDFOR and FUELHH may cover different wind populations.",
        ],
    }
