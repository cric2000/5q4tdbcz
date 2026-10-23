"""Strict source validation, canonical UTC records and historical scope."""

import math
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo


class IngestionError(ValueError):
    """A source response cannot safely be included in a historical snapshot."""


def utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise IngestionError(f"{field} must be an ISO timestamp with a timezone")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise IngestionError(f"Invalid {field}: {value!r}") from exc
    if result.tzinfo is None or result.utcoffset() is None:
        raise IngestionError(f"{field} must include a timezone: {value!r}")
    result = result.astimezone(UTC)
    if result.microsecond:
        raise IngestionError(f"{field} must have whole-second precision")
    return result


def parse_generation(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise IngestionError("generation must be a numeric MW value")
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise IngestionError("WIND generation must be finite and non-negative")
    return result


@dataclass(frozen=True)
class Forecast:
    target_time: datetime
    publish_time: datetime
    generation_mw: float


@dataclass(frozen=True)
class Outturn:
    target_time: datetime
    publish_time: datetime
    generation_mw: float
    settlement_date: date
    settlement_period: int


def parse_forecast(row: dict[str, Any]) -> Forecast:
    if row.get("dataset") != "WINDFOR":
        raise IngestionError("Expected WINDFOR dataset")
    target = parse_timestamp(row.get("startTime"), "startTime")
    if target.minute or target.second:
        raise IngestionError(f"WINDFOR target is not hourly: {utc_text(target)}")
    return Forecast(
        target,
        parse_timestamp(row.get("publishTime"), "publishTime"),
        parse_generation(row.get("generation")),
    )


def parse_outturn(row: dict[str, Any]) -> Outturn:
    if row.get("dataset") != "FUELHH" or row.get("fuelType") != "WIND":
        raise IngestionError("Expected FUELHH WIND record")
    target = parse_timestamp(row.get("startTime"), "startTime")
    if target.minute not in (0, 30) or target.second:
        raise IngestionError(f"FUELHH target is not half-hourly: {utc_text(target)}")
    try:
        settlement_date = date.fromisoformat(row["settlementDate"])
    except (KeyError, ValueError, TypeError) as exc:
        raise IngestionError("Invalid settlementDate") from exc
    period = row.get("settlementPeriod")
    local = target.astimezone(ZoneInfo("Europe/London"))
    midnight = datetime.combine(settlement_date, time(), ZoneInfo("Europe/London"))
    expected_period = int((target - midnight.astimezone(UTC)).total_seconds() // 1800) + 1
    if type(period) is not int or local.date() != settlement_date or period != expected_period:
        raise IngestionError("Settlement date/period does not match startTime")
    return Outturn(
        target,
        parse_timestamp(row.get("publishTime"), "publishTime"),
        parse_generation(row.get("generation")),
        settlement_date,
        period,
    )


@dataclass(frozen=True)
class Scope:
    """Fixed January decision scope; publication acquisition also captures later revisions."""

    cutoff_gmt: str
    decision_start: date = date(2026, 1, 1)
    decision_end: date = date(2026, 1, 31)

    @property
    def delivery_start(self) -> datetime:
        return datetime.combine(self.decision_start + timedelta(days=1), time(), UTC)

    @property
    def delivery_end(self) -> datetime:
        """Exclusive upper delivery bound."""
        return datetime.combine(self.decision_end + timedelta(days=2), time(), UTC)

    @property
    def publication_start(self) -> datetime:
        return datetime.combine(self.decision_start - timedelta(days=3), time(), UTC)

    @property
    def publication_end(self) -> datetime:
        return self.delivery_end + timedelta(days=1)

    def cutoff(self, decision: date) -> datetime:
        return datetime.combine(decision, time.fromisoformat(self.cutoff_gmt), UTC)

    def target_hours(self) -> list[datetime]:
        count = int((self.delivery_end - self.delivery_start).total_seconds() // 3600)
        return [self.delivery_start + timedelta(hours=i) for i in range(count)]


def canonical_records(forecasts: list[Forecast], outturn: list[Outturn]) -> dict[str, Any]:
    """Stable content identity independent of retrieval time and incoming row order."""
    return {
        "forecasts": [
            {
                **asdict(row),
                "generation_mw": float(row.generation_mw),
                "target_time": utc_text(row.target_time),
                "publish_time": utc_text(row.publish_time),
            }
            for row in sorted(forecasts, key=lambda row: (row.target_time, row.publish_time))
        ],
        "outturn": [
            {
                **asdict(row),
                "generation_mw": float(row.generation_mw),
                "target_time": utc_text(row.target_time),
                "publish_time": utc_text(row.publish_time),
                "settlement_date": row.settlement_date.isoformat(),
            }
            for row in sorted(outturn, key=lambda row: row.target_time)
        ],
    }
