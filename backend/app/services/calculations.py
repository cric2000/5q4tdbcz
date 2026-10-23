"""Pure as-of selection, temporal alignment and explicitly defined error statistics."""

import math
from collections import defaultdict
from datetime import datetime, timedelta

from app.analysis_schemas import (
    CoverageSummary,
    HistogramBin,
    HourlyComparison,
    MetricSummary,
    MissingReason,
)
from app.ingestion.models import Forecast, Outturn


def latest_eligible(records: list[Forecast], target: datetime, cutoff: datetime) -> Forecast | None:
    return max(
        (row for row in records if row.target_time == target and row.publish_time <= cutoff),
        key=lambda row: row.publish_time,
        default=None,
    )


def compare_hours(
    targets: list[datetime],
    cutoff: datetime,
    forecasts: list[Forecast],
    outturn: list[Outturn],
) -> list[HourlyComparison]:
    history: dict[datetime, list[Forecast]] = defaultdict(list)
    for forecast in forecasts:
        history[forecast.target_time].append(forecast)
    actuals = {row.target_time: row.generation_mw for row in outturn}
    result = []
    for target in targets:
        records = history.get(target, [])
        chosen = latest_eligible(records, target, cutoff)
        first, second = actuals.get(target), actuals.get(target + timedelta(minutes=30))
        reasons: list[MissingReason] = []
        if chosen is None:
            reasons.append("no_eligible_forecast" if records else "missing_forecast")
        if first is None:
            reasons.append("missing_actual_first_half")
        if second is None:
            reasons.append("missing_actual_second_half")
        actual = (first + second) / 2 if first is not None and second is not None else None
        error = chosen.generation_mw - actual if chosen is not None and actual is not None else None
        result.append(
            HourlyComparison(
                target_time=target,
                forecast_mw=chosen.generation_mw if chosen is not None else None,
                forecast_published_at=chosen.publish_time if chosen is not None else None,
                forecast_age_hours_at_cutoff=(cutoff - chosen.publish_time).total_seconds() / 3600
                if chosen is not None
                else None,
                actual_half_hours_mw=(first, second),
                actual_mw=actual,
                error_mw=error,
                absolute_error_mw=abs(error) if error is not None else None,
                status="matched" if error is not None else "missing_data",
                missing_reasons=reasons,
            )
        )
    return result


def coverage(hours: list[HourlyComparison]) -> CoverageSummary:
    matched = sum(hour.error_mw is not None for hour in hours)
    return CoverageSummary(
        expected_hours=len(hours),
        matched_hours=matched,
        coverage_percent=100 * matched / len(hours) if hours else None,
        missing_forecast_hours=sum("missing_forecast" in h.missing_reasons for h in hours),
        no_eligible_forecast_hours=sum("no_eligible_forecast" in h.missing_reasons for h in hours),
        incomplete_actual_hours=sum(h.actual_mw is None for h in hours),
    )


def percentile(values: list[float], quantile: float) -> float | None:
    if not 0 <= quantile <= 1:
        raise ValueError("Quantile must be between zero and one")
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * quantile
    lower = math.floor(index)
    upper = math.ceil(index)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def metrics(hours: list[HourlyComparison]) -> MetricSummary:
    errors = [hour.error_mw for hour in hours if hour.error_mw is not None]
    absolute = [abs(error) for error in errors]
    n = len(errors)
    over = sum(error > 0 for error in errors)
    under = sum(error < 0 for error in errors)
    exact = n - over - under
    return MetricSummary(
        coverage=coverage(hours),
        mae_mw=math.fsum(absolute) / n if n else None,
        rmse_mw=math.sqrt(math.fsum(error * error for error in errors) / n) if n else None,
        bias_mw=math.fsum(errors) / n if n else None,
        p50_absolute_error_mw=percentile(absolute, 0.5),
        p90_absolute_error_mw=percentile(absolute, 0.9),
        max_absolute_error_mw=max(absolute) if n else None,
        overforecast_hours=over,
        underforecast_hours=under,
        exact_hours=exact,
        overforecast_percent=100 * over / n if n else None,
        underforecast_percent=100 * under / n if n else None,
        exact_percent=100 * exact / n if n else None,
    )


def error_histogram(hours: list[HourlyComparison], bins: int = 20) -> list[HistogramBin]:
    errors = [hour.error_mw for hour in hours if hour.error_mw is not None]
    if not errors:
        return []
    limit = max(abs(error) for error in errors)
    if limit == 0:
        return [HistogramBin(lower_mw=-0.5, upper_mw=0.5, count=len(errors), upper_inclusive=True)]
    width = 2 * limit / bins
    counts = [0] * bins
    for error in errors:
        counts[min(int((error + limit) / width), bins - 1)] += 1
    return [
        HistogramBin(
            lower_mw=-limit + i * width,
            upper_mw=-limit + (i + 1) * width,
            count=count,
            upper_inclusive=i == bins - 1,
        )
        for i, count in enumerate(counts)
    ]
