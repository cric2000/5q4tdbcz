from fastapi import APIRouter, Request

from app.core.config import N2EX_REFERENCE_URL
from app.schemas import HealthResponse, PilotConfigResponse

router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthResponse, tags=["Operations"])
def health() -> HealthResponse:
    """Service liveness only; no historical dataset has been loaded in Phase 0."""
    return HealthResponse()


@router.get("/config", response_model=PilotConfigResponse, tags=["Pilot configuration"])
def pilot_config(request: Request) -> PilotConfigResponse:
    """Expose the configured reference assumption without duplicating it in the client."""
    return PilotConfigResponse(
        decision_cutoff_gmt=request.app.state.settings.decision_cutoff_gmt,
        cutoff_reference_url=N2EX_REFERENCE_URL,
    )
