import re
from collections.abc import Iterator
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import AwareDatetime, BeforeValidator

from app.analysis_schemas import (
    AccuracyResponse,
    AnalysisContext,
    DailyAccuracyResponse,
    DataQualityResponse,
    DecisionResponse,
    ErrorResponse,
    EvolutionResponse,
    PriorAccuracyResponse,
)
from app.ingestion.models import Scope
from app.repositories.analysis import open_analysis_repository
from app.services.analysis import AnalysisService


def require_date_string(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Use a decision date in YYYY-MM-DD format")
    return value


DecisionDate = Annotated[date, BeforeValidator(require_date_string)]


def analysis_service(request: Request) -> Iterator[AnalysisService]:
    settings = request.app.state.settings
    with open_analysis_repository(settings.database_path) as repository:
        yield AnalysisService(repository, Scope(settings.decision_cutoff_gmt))


Service = Annotated[AnalysisService, Depends(analysis_service)]
FromDate = Annotated[
    DecisionDate | None,
    Query(alias="from", description="Inclusive decision-date start; defaults to 2026-01-01."),
]
ToDate = Annotated[
    DecisionDate | None,
    Query(alias="to", description="Inclusive decision-date end; defaults to 2026-01-31."),
]
router = APIRouter(
    prefix="/api/v1",
    tags=["Historical analysis"],
    responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)


@router.get("/metadata", response_model=AnalysisContext)
def metadata(service: Service) -> AnalysisContext:
    """Shared methodology, scope and snapshot provenance. Fetch once for the dashboard.

    Result meta.snapshot_id matches snapshot.content_sha256 here. Refresh this metadata
    if a result's snapshot ID or configured cutoff differs from the cached values.
    """
    return service.context


@router.get("/decisions/{decision_date}", response_model=DecisionResponse)
def decision(decision_date: DecisionDate, service: Service) -> DecisionResponse:
    """Replay one January decision using only forecasts published at or before its cutoff.

    Returns 24 next-day delivery hours, missing-data reasons and matched-pair metrics.
    Shared sources and methodology are available from /api/v1/metadata.
    """
    return service.decision(decision_date)


@router.get("/accuracy", response_model=AccuracyResponse)
def accuracy(
    service: Service, date_from: FromDate = None, date_to: ToDate = None
) -> AccuracyResponse:
    """Aggregate matched-hour errors, signed-error bins and up to ten worst hours.

    The optional from/to parameters are inclusive January decision dates.
    """
    return service.accuracy(
        date_from or service.scope.decision_start, date_to or service.scope.decision_end
    )


@router.get("/decisions/{decision_date}/prior-accuracy", response_model=PriorAccuracyResponse)
def prior_accuracy(decision_date: DecisionDate, service: Service) -> PriorAccuracyResponse:
    """Accuracy evidence available by this decision's configured buying cutoff.

    Includes only earlier completed delivery hours. Both stored actual half-hours must
    have been published at or before cutoff. Forecasts retain their original buying-day
    deadline. Missing or not-yet-published actuals never become zero-valued comparisons.
    """
    return service.prior_accuracy(decision_date)


@router.get("/accuracy/daily", response_model=DailyAccuracyResponse)
def daily(
    service: Service, date_from: FromDate = None, date_to: ToDate = None
) -> DailyAccuracyResponse:
    """One metric summary per decision day in the inclusive January range."""
    return service.daily(
        date_from or service.scope.decision_start, date_to or service.scope.decision_end
    )


@router.get("/evolution", response_model=EvolutionResponse)
def evolution(
    service: Service,
    target_time: Annotated[
        AwareDatetime,
        Query(description="Required timezone-aware exact delivery hour; normalized to UTC."),
    ],
) -> EvolutionResponse:
    """Show acquired revisions for one delivery hour and mark the cutoff-selected record.

    Later publications are visible as history but never used in the replay comparison.
    """
    return service.evolution(target_time)


@router.get("/data-quality", response_model=DataQualityResponse)
def data_quality(service: Service) -> DataQualityResponse:
    """Full-scope coverage under the current cutoff plus the stored ingestion audit.

    The ingestion cutoff can differ from meta.decision_cutoff_gmt after configuration changes.
    """
    return service.quality()
