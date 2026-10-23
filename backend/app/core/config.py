"""One validated source for pilot assumptions and local runtime settings."""

import re
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

N2EX_REFERENCE_URL = (
    "https://support.nordpoolgroup.com/support/solutions/articles/"
    "8000088463-about-the-n2ex-day-ahead-auction"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WINDSIGHT_")

    decision_cutoff_gmt: str = "09:50"
    database_path: Path = Path(__file__).resolve().parents[2] / "data" / "windsight.sqlite3"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("decision_cutoff_gmt")
    @classmethod
    def validate_cutoff(cls, value: str) -> str:
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("Decision cutoff must be a GMT time in HH:MM format")
        return value
