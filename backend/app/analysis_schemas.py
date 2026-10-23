"""Typed, unit-explicit analytical API contracts."""

from datetime import date
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field


class SourceDescription(BaseModel):
    dataset: str
    documentation_url: str
    native_resolution: str
    unit: Literal["MW"] = "MW"


class SnapshotDescription(BaseModel):
    schema_version: int
    content_sha256: str
    retrieved_at: AwareDatetime
    snapshot_created_at: AwareDatetime
    publication_start: AwareDatetime
    publication_end_exclusive: AwareDatetime
    forecast_records: int
    forecast_target_hours: int
    outturn_half_hours: int


class AnalysisContext(BaseModel):
    decision_date_from: date
    decision_date_to: date
    delivery_date_from: date
    delivery_date_to: date
    decision_cutoff_gmt: str
    cutoff_is_assumed: bool = True
    cutoff_reference_url: str
    timezone: Literal["UTC"] = "UTC"
    power_unit: Literal["MW"] = "MW"
    comparison_resolution_minutes: Literal[60] = 60
    actuals_are_retrospective: bool = True
    actual_aggregation: str = "Mean of both corresponding half-hour average MW readings"
    error_definition: str = "Forecast MW minus hourly-average actual MW; positive is overforecast"
    percentile_method: str = "Linear interpolation at (n - 1) * quantile"
    sources: list[SourceDescription]
    snapshot: SnapshotDescription
    limitations: list[str]


class AnalysisReference(BaseModel):
    snapshot_id: str = Field(
        description="Source-content SHA-256; matches /metadata snapshot.content_sha256."
    )
    decision_cutoff_gmt: str = Field(
        description="Configured HH:MM GMT cutoff used for this response and result comparisons."
    )


MissingReason = Literal[
    "missing_forecast",
    "no_eligible_forecast",
    "missing_actual_first_half",
    "missing_actual_second_half",
]


class HourlyComparison(BaseModel):
    target_time: AwareDatetime
    forecast_mw: float | None
    forecast_published_at: AwareDatetime | None
    forecast_age_hours_at_cutoff: float | None
    actual_half_hours_mw: tuple[float | None, float | None]
    actual_mw: float | None
    error_mw: float | None
    absolute_error_mw: float | None
    status: Literal["matched", "missing_data"]
    missing_reasons: list[MissingReason]


class CoverageSummary(BaseModel):
    expected_hours: int
    matched_hours: int
    coverage_percent: float | None
    missing_forecast_hours: int
    no_eligible_forecast_hours: int
    incomplete_actual_hours: int


class MetricSummary(BaseModel):
    coverage: CoverageSummary
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p50_absolute_error_mw: float | None
    p90_absolute_error_mw: float | None
    max_absolute_error_mw: float | None
    overforecast_hours: int
    underforecast_hours: int
    exact_hours: int
    overforecast_percent: float | None
    underforecast_percent: float | None
    exact_percent: float | None


class DecisionResponse(BaseModel):
    meta: AnalysisReference
    decision_date: date
    delivery_date: date
    cutoff: AwareDatetime
    hours: list[HourlyComparison]
    metrics: MetricSummary


class DailyMetric(BaseModel):
    decision_date: date
    delivery_date: date
    cutoff: AwareDatetime
    metrics: MetricSummary


class HistogramBin(BaseModel):
    lower_mw: float
    upper_mw: float
    count: int
    upper_inclusive: bool


class AccuracyResponse(BaseModel):
    meta: AnalysisReference
    decision_date_from: date
    decision_date_to: date
    metrics: MetricSummary
    error_histogram: list[HistogramBin]
    worst_hours: list[HourlyComparison]


class DailyAccuracyResponse(BaseModel):
    meta: AnalysisReference
    decision_date_from: date
    decision_date_to: date
    days: list[DailyMetric]


class ForecastPublication(BaseModel):
    publish_time: AwareDatetime
    generation_mw: float
    available_at_cutoff: bool
    selected_as_of: bool
    value_changed_from_previous: bool | None


class EvolutionResponse(BaseModel):
    meta: AnalysisReference
    decision_date: date
    delivery_date: date
    cutoff: AwareDatetime
    comparison: HourlyComparison
    publications: list[ForecastPublication]


class IngestionDayCoverage(BaseModel):
    decision_date: date
    delivery_date: date
    expected_hours: int
    eligible_forecast_hours: int
    outturn_half_hours: int
    complete_actual_hours: int
    comparable_hours: int


class IngestionQuality(BaseModel):
    decision_cutoff_gmt: str
    expected_hours: int
    expected_outturn_half_hours: int
    eligible_forecast_hours: int
    complete_actual_hours: int
    comparable_hours: int
    missing_forecast_targets: list[AwareDatetime]
    missing_eligible_forecasts: list[AwareDatetime]
    missing_outturn_half_hours: list[AwareDatetime]
    complete: bool
    conflicts: int
    forecast_identical_duplicates: int
    outturn_identical_duplicates: int
    forecast_rows_outside_delivery_scope: int
    non_wind_rows_filtered: int
    request_count: int
    daily: list[IngestionDayCoverage]
    notes: list[str]


class DataQualityResponse(BaseModel):
    meta: AnalysisReference
    current_coverage: CoverageSummary
    missing_hours: list[HourlyComparison]
    ingestion: IngestionQuality


class ValidationIssue(BaseModel):
    location: list[str | int]
    message: str
    type: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    issues: list[ValidationIssue] = []


class ErrorResponse(BaseModel):
    error: ErrorDetail
