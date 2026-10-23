"""Historical decision replay and accuracy orchestration over read-only source records."""

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta

from app.analysis_schemas import (
    AccuracyResponse,
    AnalysisContext,
    AnalysisReference,
    DailyAccuracyResponse,
    DailyMetric,
    DataQualityResponse,
    DecisionResponse,
    EvolutionResponse,
    ForecastPublication,
    HourlyComparison,
    IngestionQuality,
    SnapshotDescription,
    SourceDescription,
)
from app.core.config import N2EX_REFERENCE_URL
from app.ingestion.models import Scope
from app.repositories.analysis import AnalysisRepository
from app.services.calculations import compare_hours, coverage, error_histogram, metrics
from app.services.errors import InvalidAnalysisRequest


class AnalysisService:
    def __init__(self, repository: AnalysisRepository, scope: Scope):
        self.repository = repository
        self.scope = scope
        self.context = AnalysisContext(
            decision_date_from=scope.decision_start,
            decision_date_to=scope.decision_end,
            delivery_date_from=scope.delivery_start.date(),
            delivery_date_to=(scope.delivery_end - timedelta(days=1)).date(),
            decision_cutoff_gmt=scope.cutoff_gmt,
            cutoff_reference_url=N2EX_REFERENCE_URL,
            snapshot=SnapshotDescription.model_validate(repository.quality),
            sources=[
                SourceDescription(
                    dataset="WINDFOR",
                    documentation_url="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
                    native_resolution="Hourly forecast targets in the acquired snapshot",
                ),
                SourceDescription(
                    dataset="FUELHH WIND",
                    documentation_url="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
                    native_resolution="30-minute average MW",
                ),
            ],
            limitations=[
                "The cutoff is an N2EX reference assumption, not a confirmed client deadline.",
                "WINDFOR and FUELHH may cover different populations; errors compare the series.",
                "Actuals are retrospective and were not available at the buying cutoff.",
                "No purchase quantities, financial losses or predictive guarantees are inferred.",
                "Revision history is limited to the stated acquisition publication window.",
                "Unchanged republications do not establish a new forecasting model run.",
            ],
        )
        self.meta = AnalysisReference(
            snapshot_id=self.context.snapshot.content_sha256,
            decision_cutoff_gmt=scope.cutoff_gmt,
        )

    def validate_range(self, start: date, end: date) -> None:
        if start > end:
            raise InvalidAnalysisRequest("The decision-date start must be on or before the end.")
        if start < self.scope.decision_start or end > self.scope.decision_end:
            raise InvalidAnalysisRequest("Decision dates must be within January 1–31, 2026.")

    def comparisons(self, start: date, end: date) -> list[HourlyComparison]:
        self.validate_range(start, end)
        first = datetime.combine(start + timedelta(days=1), time(), UTC)
        last = datetime.combine(end + timedelta(days=2), time(), UTC)
        forecasts_by_day = defaultdict(list)
        actuals_by_day = defaultdict(list)
        for row in self.repository.forecasts(first, last):
            forecasts_by_day[row.target_time.date()].append(row)
        for row in self.repository.outturn(first, last):
            actuals_by_day[row.target_time.date()].append(row)
        result = []
        day = start
        while day <= end:
            delivery = day + timedelta(days=1)
            targets = [datetime.combine(delivery, time(hour=hour), UTC) for hour in range(24)]
            result.extend(
                compare_hours(
                    targets,
                    self.scope.cutoff(day),
                    forecasts_by_day[delivery],
                    actuals_by_day[delivery],
                )
            )
            day += timedelta(days=1)
        return result

    def decision(self, decision_date: date) -> DecisionResponse:
        hours = self.comparisons(decision_date, decision_date)
        return DecisionResponse(
            meta=self.meta,
            decision_date=decision_date,
            delivery_date=decision_date + timedelta(days=1),
            cutoff=self.scope.cutoff(decision_date),
            hours=hours,
            metrics=metrics(hours),
        )

    def accuracy(self, start: date, end: date) -> AccuracyResponse:
        hours = self.comparisons(start, end)
        matched = [hour for hour in hours if hour.absolute_error_mw is not None]
        worst = sorted(matched, key=lambda h: (-h.absolute_error_mw, h.target_time))[:10]
        return AccuracyResponse(
            meta=self.meta,
            decision_date_from=start,
            decision_date_to=end,
            metrics=metrics(hours),
            error_histogram=error_histogram(hours),
            worst_hours=worst,
        )

    def daily(self, start: date, end: date) -> DailyAccuracyResponse:
        hours = self.comparisons(start, end)
        days = []
        for offset in range((end - start).days + 1):
            decision = start + timedelta(days=offset)
            days.append(
                DailyMetric(
                    decision_date=decision,
                    delivery_date=decision + timedelta(days=1),
                    cutoff=self.scope.cutoff(decision),
                    metrics=metrics(hours[offset * 24 : (offset + 1) * 24]),
                )
            )
        return DailyAccuracyResponse(
            meta=self.meta, decision_date_from=start, decision_date_to=end, days=days
        )

    def evolution(self, target_time: datetime) -> EvolutionResponse:
        target = target_time.astimezone(UTC)
        if target.minute or target.second or target.microsecond:
            raise InvalidAnalysisRequest("The target must be an exact UTC delivery hour.")
        if not self.scope.delivery_start <= target < self.scope.delivery_end:
            raise InvalidAnalysisRequest(
                "Delivery hours must be within January 2–February 1, 2026."
            )
        decision = target.date() - timedelta(days=1)
        cutoff = self.scope.cutoff(decision)
        end = target + timedelta(hours=1)
        history = self.repository.forecasts(target, end)
        comparison = compare_hours([target], cutoff, history, self.repository.outturn(target, end))[
            0
        ]
        publications = []
        for index, row in enumerate(history):
            publications.append(
                ForecastPublication(
                    publish_time=row.publish_time,
                    generation_mw=row.generation_mw,
                    available_at_cutoff=row.publish_time <= cutoff,
                    selected_as_of=row.publish_time == comparison.forecast_published_at,
                    value_changed_from_previous=row.generation_mw
                    != history[index - 1].generation_mw
                    if index
                    else None,
                )
            )
        return EvolutionResponse(
            meta=self.meta,
            decision_date=decision,
            delivery_date=target.date(),
            cutoff=cutoff,
            comparison=comparison,
            publications=publications,
        )

    def quality(self) -> DataQualityResponse:
        hours = self.comparisons(self.scope.decision_start, self.scope.decision_end)
        return DataQualityResponse(
            meta=self.meta,
            current_coverage=coverage(hours),
            missing_hours=[hour for hour in hours if hour.missing_reasons],
            ingestion=IngestionQuality.model_validate(self.repository.quality),
        )
