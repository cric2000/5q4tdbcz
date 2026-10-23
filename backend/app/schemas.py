from datetime import date
from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["windsight"] = "windsight"
    phase: Literal["setup"] = "setup"
    data_status: Literal["not_ingested"] = "not_ingested"


class PilotConfigResponse(BaseModel):
    decision_cutoff_gmt: str
    cutoff_reference_url: str
    cutoff_is_assumed: bool = True
    decision_date_from: date = date(2026, 1, 1)
    decision_date_to: date = date(2026, 1, 31)
    delivery_date_from: date = date(2026, 1, 2)
    delivery_date_to: date = date(2026, 2, 1)
