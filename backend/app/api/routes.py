import sqlite3

from fastapi import APIRouter, Request

from app.core.config import N2EX_REFERENCE_URL
from app.ingestion.models import IngestionError
from app.repositories.snapshot import read_quality_report
from app.schemas import HealthResponse, PilotConfigResponse

router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthResponse, tags=["Operations"])
def health(request: Request) -> HealthResponse:
    """Service liveness plus snapshot availability; no accuracy metrics are computed."""
    path = request.app.state.settings.database_path
    if not path.is_file():
        return HealthResponse()
    try:
        quality = read_quality_report(path)
        if type(quality.get("complete")) is not bool:
            raise IngestionError("Invalid snapshot coverage metadata")
    except (IngestionError, sqlite3.Error, ValueError, OSError, AttributeError):
        return HealthResponse(data_status="snapshot_invalid")
    return HealthResponse(
        data_status="snapshot_ready" if quality["complete"] else "snapshot_incomplete"
    )


@router.get("/config", response_model=PilotConfigResponse, tags=["Pilot configuration"])
def pilot_config(request: Request) -> PilotConfigResponse:
    """Expose the configured reference assumption without duplicating it in the client."""
    return PilotConfigResponse(
        decision_cutoff_gmt=request.app.state.settings.decision_cutoff_gmt,
        cutoff_reference_url=N2EX_REFERENCE_URL,
    )
