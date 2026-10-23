from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.core.scope import (
    DECISION_DATE_FROM,
    DECISION_DATE_TO,
    DELIVERY_DATE_FROM,
    DELIVERY_DATE_TO,
)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["windsight"] = "windsight"
    phase: Literal["ingestion"] = "ingestion"
    data_status: Literal[
        "not_ingested", "snapshot_ready", "snapshot_incomplete", "snapshot_invalid"
    ] = "not_ingested"


class PilotConfigResponse(BaseModel):
    decision_cutoff_gmt: str
    cutoff_reference_url: str
    cutoff_is_assumed: bool = True
    decision_date_from: date = DECISION_DATE_FROM
    decision_date_to: date = DECISION_DATE_TO
    delivery_date_from: date = DELIVERY_DATE_FROM
    delivery_date_to: date = DELIVERY_DATE_TO
