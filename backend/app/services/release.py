"""Offline release validation; no external requests or runtime database writes."""

import hashlib
import json
from pathlib import Path
from typing import Any

from app.core.scope import Scope
from app.ingestion.models import IngestionError
from app.ingestion.quality import coverage_report
from app.repositories.analysis import open_analysis_repository
from app.repositories.snapshot import content_sha256


def validate_snapshot(path: Path, manifest_path: Path | None = None) -> dict[str, Any]:
    with open_analysis_repository(path) as repository:
        if repository.database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise IngestionError("Snapshot failed SQLite integrity validation")
        quality = repository.quality
        scope = Scope(quality["decision_cutoff_gmt"])
        forecasts = repository.forecasts(scope.delivery_start, scope.delivery_end)
        outturn = repository.outturn(scope.delivery_start, scope.delivery_end)
    computed = coverage_report(scope, forecasts, outturn)
    for key, value in computed.items():
        if key != "notes" and quality.get(key) != value:
            raise IngestionError(f"Snapshot coverage/provenance mismatch: {key}")
    if not computed["complete"] or quality["conflicts"] != 0:
        raise IngestionError("Release requires complete coverage and zero conflicts")
    if any(
        not scope.publication_start <= row.publish_time < scope.publication_end for row in forecasts
    ):
        raise IngestionError("A forecast lies outside the recorded publication window")
    digest = content_sha256(forecasts, outturn, quality)
    if digest != quality["content_sha256"]:
        raise IngestionError("Snapshot source-content fingerprint does not match its records")
    manifest = {
        "format_version": 1,
        "snapshot_file": path.name,
        "file_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "content_sha256": digest,
        "schema_version": quality["schema_version"],
        "decision_date_from": computed["decision_date_from"],
        "decision_date_to": computed["decision_date_to"],
        "decision_cutoff_gmt": computed["decision_cutoff_gmt"],
        "forecast_records": len(forecasts),
        "outturn_half_hours": len(outturn),
        "matched_hours": computed["comparable_hours"],
        "retrieved_at": quality["retrieved_at"],
    }
    if manifest_path is not None and json.loads(manifest_path.read_text()) != manifest:
        raise IngestionError("Release manifest does not match the packaged snapshot")
    return manifest
