"""Read-only queries scoped to a single immutable snapshot per request."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from app.analysis_schemas import IngestionQuality, SnapshotDescription
from app.ingestion.models import (
    Forecast,
    IngestionError,
    Outturn,
    parse_forecast,
    parse_outturn,
    utc_text,
)
from app.repositories.snapshot import SCHEMA_VERSION
from app.services.errors import SnapshotUnavailable


class AnalysisRepository:
    def __init__(self, database: sqlite3.Connection):
        self.database = database
        if database.execute("PRAGMA user_version").fetchone()[0] != SCHEMA_VERSION:
            raise SnapshotUnavailable(
                "snapshot_invalid", "The historical snapshot schema is unsupported."
            )
        row = database.execute("SELECT value FROM metadata WHERE key='quality_report'").fetchone()
        if row is None:
            raise SnapshotUnavailable(
                "snapshot_invalid", "The historical snapshot lacks provenance."
            )
        self.quality: dict[str, Any] = json.loads(row[0])
        if not isinstance(self.quality, dict):
            raise SnapshotUnavailable("snapshot_invalid", "The snapshot provenance is invalid.")
        SnapshotDescription.model_validate(self.quality)
        IngestionQuality.model_validate(self.quality)
        for table, key in [("forecasts", "forecast_records"), ("outturn", "outturn_half_hours")]:
            count = database.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            if count != self.quality[key]:
                raise SnapshotUnavailable(
                    "snapshot_invalid", "Snapshot counts differ from its provenance."
                )

    def forecasts(self, start: datetime, end: datetime) -> list[Forecast]:
        rows = self.database.execute(
            "SELECT target_time, publish_time, generation_mw FROM forecasts "
            "WHERE target_time >= ? AND target_time < ? ORDER BY target_time, publish_time",
            (utc_text(start), utc_text(end)),
        )
        return [
            parse_forecast(
                {"dataset": "WINDFOR", "startTime": r[0], "publishTime": r[1], "generation": r[2]}
            )
            for r in rows
        ]

    def outturn(self, start: datetime, end: datetime) -> list[Outturn]:
        rows = self.database.execute(
            "SELECT target_time, publish_time, generation_mw, settlement_date, settlement_period "
            "FROM outturn WHERE target_time >= ? AND target_time < ? ORDER BY target_time",
            (utc_text(start), utc_text(end)),
        )
        return [
            parse_outturn(
                {
                    "dataset": "FUELHH",
                    "fuelType": "WIND",
                    "startTime": r[0],
                    "publishTime": r[1],
                    "generation": r[2],
                    "settlementDate": r[3],
                    "settlementPeriod": r[4],
                }
            )
            for r in rows
        ]


@contextmanager
def open_analysis_repository(path: Path) -> Iterator[AnalysisRepository]:
    if not path.is_file():
        raise SnapshotUnavailable(
            "snapshot_missing",
            "The historical snapshot is missing. Run the ingestion command first.",
        )
    database = None
    try:
        # FastAPI can run dependency setup, a sync route and teardown on different
        # workers. This connection is confined to one request and is read-only.
        database = sqlite3.connect(
            path.resolve().as_uri() + "?mode=ro", uri=True, check_same_thread=False
        )
        database.execute("PRAGMA query_only=ON")
        repository = AnalysisRepository(database)
    except (sqlite3.Error, ValueError, KeyError, TypeError) as exc:
        if database is not None:
            database.close()
        raise SnapshotUnavailable(
            "snapshot_invalid",
            "The historical snapshot could not be read. Rebuild and validate it.",
        ) from exc
    except BaseException:
        if database is not None:
            database.close()
        raise
    try:
        yield repository
    except (sqlite3.Error, IngestionError) as exc:
        raise SnapshotUnavailable(
            "snapshot_invalid",
            "The historical snapshot contains unreadable records. Rebuild and validate it.",
        ) from exc
    finally:
        database.close()
