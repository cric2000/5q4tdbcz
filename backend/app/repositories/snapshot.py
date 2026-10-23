"""Atomic SQLite snapshot publishing and read-only inspection."""

import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.ingestion.models import Forecast, IngestionError, Outturn, canonical_records, utc_text

SCHEMA_VERSION = 1
SCHEMA = """
CREATE TABLE forecasts (
    target_time TEXT NOT NULL,
    publish_time TEXT NOT NULL,
    generation_mw REAL NOT NULL CHECK(generation_mw >= 0),
    PRIMARY KEY (target_time, publish_time)
) WITHOUT ROWID;
CREATE INDEX forecasts_publication ON forecasts(publish_time);
CREATE TABLE outturn (
    target_time TEXT PRIMARY KEY,
    publish_time TEXT NOT NULL,
    generation_mw REAL NOT NULL CHECK(generation_mw >= 0),
    settlement_date TEXT NOT NULL,
    settlement_period INTEGER NOT NULL CHECK(settlement_period BETWEEN 1 AND 48)
);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE source_requests (id INTEGER PRIMARY KEY, dataset TEXT NOT NULL, details TEXT NOT NULL);
"""


def write_snapshot(
    destination: Path,
    forecasts: list[Forecast],
    outturn: list[Outturn],
    quality: dict[str, Any],
    batches: list[dict[str, Any]],
    *,
    allow_incomplete: bool = False,
) -> dict[str, Any]:
    if not quality["complete"] and not allow_incomplete:
        raise IngestionError("Coverage is incomplete; existing snapshot was not changed")
    records = canonical_records(forecasts, outturn)
    identity = {
        "schema_version": SCHEMA_VERSION,
        "records": records,
        "scope": {
            key: quality[key]
            for key in (
                "decision_date_from",
                "decision_date_to",
                "decision_cutoff_gmt",
                "publication_start",
                "publication_end_exclusive",
            )
        },
    }
    digest = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    report = {
        **quality,
        "schema_version": SCHEMA_VERSION,
        "content_sha256": digest,
        "retrieved_at": max((batch["retrieved_at"] for batch in batches), default=None),
        "snapshot_created_at": utc_text(datetime.now(UTC)),
        "source": "Elexon Insights WINDFOR and FUELHH WIND",
        "source_documentation": [
            "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
            "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
        ],
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with closing(sqlite3.connect(temporary)) as database:
            database.executescript(SCHEMA)
            database.executemany(
                "INSERT INTO forecasts VALUES (?, ?, ?)",
                [
                    (utc_text(r.target_time), utc_text(r.publish_time), r.generation_mw)
                    for r in forecasts
                ],
            )
            database.executemany(
                "INSERT INTO outturn VALUES (?, ?, ?, ?, ?)",
                [
                    (
                        utc_text(r.target_time),
                        utc_text(r.publish_time),
                        r.generation_mw,
                        r.settlement_date.isoformat(),
                        r.settlement_period,
                    )
                    for r in outturn
                ],
            )
            database.execute(
                "INSERT INTO metadata VALUES ('quality_report', ?)",
                (json.dumps(report, sort_keys=True),),
            )
            database.executemany(
                "INSERT INTO source_requests(dataset, details) VALUES (?, ?)",
                [(batch["dataset"], json.dumps(batch, sort_keys=True)) for batch in batches],
            )
            database.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            database.commit()
            if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise IngestionError("SQLite integrity check failed")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return report


def read_quality_report(path: Path) -> dict[str, Any]:
    uri = path.resolve().as_uri() + "?mode=ro"
    database = sqlite3.connect(uri, uri=True)
    try:
        if database.execute("PRAGMA user_version").fetchone()[0] != SCHEMA_VERSION:
            raise IngestionError("Unsupported snapshot schema version")
        row = database.execute("SELECT value FROM metadata WHERE key='quality_report'").fetchone()
        if row is None:
            raise IngestionError("Snapshot quality metadata is missing")
        return json.loads(row[0])
    finally:
        database.close()
