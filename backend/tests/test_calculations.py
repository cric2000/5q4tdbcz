import math
from datetime import UTC, datetime, timedelta

import pytest

from app.ingestion.models import Forecast, Outturn
from app.services.calculations import (
    compare_hours,
    coverage,
    error_histogram,
    latest_eligible,
    metrics,
    percentile,
)

TARGET = datetime(2026, 1, 2, tzinfo=UTC)
CUTOFF = datetime(2026, 1, 1, 9, 50, tzinfo=UTC)


def actuals(first, second):
    return [
        Outturn(
            TARGET + timedelta(minutes=30 * i),
            TARGET + timedelta(minutes=30 * (i + 1)),
            value,
            TARGET.date(),
            i + 1,
        )
        for i, value in enumerate([first, second])
    ]


@pytest.mark.parametrize("seconds, expected", [(-1, 120), (0, 120), (1, None)])
def test_publication_before_at_and_after_cutoff(seconds, expected):
    row = Forecast(TARGET, CUTOFF + timedelta(seconds=seconds), 120)
    chosen = latest_eligible([row], TARGET, CUTOFF)
    assert (chosen.generation_mw if chosen else None) == expected


def test_selection_is_per_exact_target_and_uses_maximum_eligible_publication():
    earlier = Forecast(TARGET, CUTOFF - timedelta(minutes=30), 100)
    chosen = Forecast(TARGET, CUTOFF, 120)
    later = Forecast(TARGET, CUTOFF + timedelta(seconds=1), 999)
    another_target = Forecast(TARGET + timedelta(hours=1), CUTOFF, 9999)
    assert latest_eligible([later, another_target, chosen, earlier], TARGET, CUTOFF) == chosen
    assert latest_eligible([], TARGET, CUTOFF) is None


def test_two_half_hours_are_averaged_and_error_sign_is_forecast_minus_actual():
    rows = compare_hours([TARGET], CUTOFF, [Forecast(TARGET, CUTOFF, 120)], actuals(100, 120))
    assert rows[0].actual_mw == 110
    assert rows[0].error_mw == 10
    assert rows[0].absolute_error_mw == 10
    assert rows[0].forecast_age_hours_at_cutoff == 0
    assert rows[0].actual_half_hours_mw == (100, 120)


def test_missing_actual_period_is_not_zero_or_an_instantaneous_comparison():
    hour = compare_hours([TARGET], CUTOFF, [Forecast(TARGET, CUTOFF, 120)], actuals(100, 120)[:1])[
        0
    ]
    assert hour.actual_mw is None
    assert hour.error_mw is None
    assert hour.missing_reasons == ["missing_actual_second_half"]


def test_missing_first_half_and_missing_eligible_forecast_have_explicit_reasons():
    late = Forecast(TARGET, CUTOFF + timedelta(seconds=1), 120)
    hour = compare_hours([TARGET], CUTOFF, [late], actuals(100, 120)[1:])[0]
    assert hour.missing_reasons == ["no_eligible_forecast", "missing_actual_first_half"]
    assert hour.forecast_published_at is None


def test_zero_generation_and_exact_error_are_valid_values():
    hour = compare_hours([TARGET], CUTOFF, [Forecast(TARGET, CUTOFF, 0)], actuals(0, 0))[0]
    assert hour.status == "matched"
    assert hour.actual_mw == hour.error_mw == 0
    result = metrics([hour])
    assert result.coverage.coverage_percent == 100
    assert result.mae_mw == result.rmse_mw == result.bias_mw == 0
    assert result.exact_percent == 100


def test_known_numeric_fixture_and_percentile_interpolation():
    rows = []
    for error in [10, -20, 0]:
        rows.extend(
            compare_hours(
                [TARGET], CUTOFF, [Forecast(TARGET, CUTOFF, 100 + error)], actuals(90, 110)
            )
        )
    rows.extend(compare_hours([TARGET], CUTOFF, [], []))
    result = metrics(rows)
    assert result.coverage.expected_hours == 4
    assert result.coverage.matched_hours == 3
    assert result.coverage.coverage_percent == 75
    assert result.mae_mw == 10
    assert result.rmse_mw == pytest.approx(math.sqrt(500 / 3))
    assert result.bias_mw == pytest.approx(-10 / 3)
    assert result.p50_absolute_error_mw == 10
    assert result.p90_absolute_error_mw == 18
    assert result.max_absolute_error_mw == 20
    assert result.overforecast_percent == result.underforecast_percent == result.exact_percent
    assert result.overforecast_hours == result.underforecast_hours == result.exact_hours == 1


@pytest.mark.parametrize(
    "values, q, expected",
    [
        ([], 0.9, None),
        ([7], 0.9, 7),
        ([0, 10, 20], 0.9, 18),
        ([10, 0], 0.5, 5),
        ([20, 0, 10], 0, 0),
        ([0, 10, 20], 1, 20),
    ],
)
def test_percentile_definition(values, q, expected):
    assert percentile(values, q) == expected


def test_empty_and_unmatched_samples_have_null_metrics():
    for hours in [[], compare_hours([TARGET], CUTOFF, [], [])]:
        result = metrics(hours)
        assert result.mae_mw is result.bias_mw is result.rmse_mw is None
        assert result.overforecast_percent is None
        assert result.coverage.matched_hours == 0
    assert coverage([]).coverage_percent is None


def test_histogram_includes_extreme_values_and_exact_zeros():
    rows = []
    for error in [-20, 0, 20]:
        rows.extend(
            compare_hours(
                [TARGET], CUTOFF, [Forecast(TARGET, CUTOFF, 100 + error)], actuals(100, 100)
            )
        )
    bins = error_histogram(rows)
    assert sum(bin.count for bin in bins) == 3
    assert bins[0].count == bins[-1].count == 1
    assert bins[-1].upper_inclusive is True
    assert bins[-1].upper_mw == 20
    assert error_histogram([]) == []
    exact = compare_hours([TARGET], CUTOFF, [Forecast(TARGET, CUTOFF, 100)], actuals(100, 100))
    assert error_histogram(exact)[0].count == 1
