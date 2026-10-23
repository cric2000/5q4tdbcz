"""Shared pilot scope and date boundaries for configuration, ingestion and analysis."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

DEFAULT_DECISION_CUTOFF_GMT = "09:50"
DECISION_DATE_FROM = date(2026, 1, 1)
DECISION_DATE_TO = date(2026, 1, 31)
DELIVERY_DATE_FROM = DECISION_DATE_FROM + timedelta(days=1)
DELIVERY_DATE_TO = DECISION_DATE_TO + timedelta(days=1)


def date_range_label(start: date, end: date) -> str:
    """Describe scope errors using the same dates as selection and response contracts."""
    first = f"{start:%B} {start.day}"
    if start.year != end.year:
        first += f", {start.year}"
    last = (
        str(end.day)
        if (start.year, start.month) == (end.year, end.month)
        else f"{end:%B} {end.day}"
    )
    return f"{first}–{last}, {end.year}"


@dataclass(frozen=True)
class Scope:
    """Fixed January decision scope; publication acquisition also captures later revisions."""

    cutoff_gmt: str
    decision_start: date = DECISION_DATE_FROM
    decision_end: date = DECISION_DATE_TO

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
