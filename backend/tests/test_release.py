import importlib.util
import json
import sqlite3
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.ingestion.models import Forecast, IngestionError, Outturn, Scope, utc_text
from app.ingestion.quality import coverage_report
from app.main import create_app
from app.repositories.snapshot import write_snapshot
from app.services.release import validate_snapshot
from scripts.package_snapshot import package_snapshot


@pytest.fixture
def complete_snapshot(tmp_path):
    scope = Scope("09:50")
    forecasts, actuals = [], []
    for target in scope.target_hours():
        forecasts.append(Forecast(target, scope.cutoff(target.date() - timedelta(days=1)), 100))
        for minute, value in [(0, 90), (30, 110)]:
            half = target + timedelta(minutes=minute)
            actuals.append(
                Outturn(
                    half,
                    half + timedelta(minutes=30),
                    value,
                    half.date(),
                    half.hour * 2 + minute // 30 + 1,
                )
            )
    quality = coverage_report(scope, forecasts, actuals)
    quality.update(
        conflicts=0,
        forecast_identical_duplicates=0,
        outturn_identical_duplicates=0,
        forecast_rows_outside_delivery_scope=0,
        non_wind_rows_filtered=0,
        request_count=1,
    )
    path = tmp_path / "source.sqlite3"
    write_snapshot(
        path,
        forecasts,
        actuals,
        quality,
        [{"dataset": "WINDFOR", "retrieved_at": utc_text(scope.publication_end)}],
    )
    return path


def change_quality(path, mutate):
    with sqlite3.connect(path) as database:
        quality = json.loads(database.execute("SELECT value FROM metadata").fetchone()[0])
        mutate(quality)
        database.execute(
            "UPDATE metadata SET value=? WHERE key='quality_report'", (json.dumps(quality),)
        )


def test_release_copy_preserves_source_identity_and_is_read_only(complete_snapshot, tmp_path):
    original = complete_snapshot.read_bytes()
    destination = tmp_path / "release/windsight.db"
    manifest = package_snapshot(complete_snapshot, destination)
    assert validate_snapshot(destination, destination.parent / "manifest.json") == manifest
    assert manifest["matched_hours"] == 744
    assert manifest["forecast_records"] == 744
    assert manifest["outturn_half_hours"] == 1488
    assert not destination.stat().st_mode & 0o222
    assert complete_snapshot.read_bytes() == original


def test_tampered_generation_is_rejected_even_when_counts_and_coverage_match(complete_snapshot):
    with sqlite3.connect(complete_snapshot) as database:
        database.execute("UPDATE forecasts SET generation_mw=101")
    with pytest.raises(IngestionError, match="fingerprint"):
        validate_snapshot(complete_snapshot)


def test_tampered_manifest_is_rejected(complete_snapshot, tmp_path):
    destination = tmp_path / "release/windsight.db"
    manifest = package_snapshot(complete_snapshot, destination)
    manifest["file_sha256"] = "0" * 64
    manifest_path = destination.parent / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(IngestionError, match="manifest"):
        validate_snapshot(destination, manifest_path)


def test_incomplete_snapshot_cannot_replace_a_release(
    analytics_snapshot, complete_snapshot, tmp_path
):
    destination = tmp_path / "release/windsight.db"
    package_snapshot(complete_snapshot, destination)
    before = destination.read_bytes()
    manifest = (destination.parent / "manifest.json").read_bytes()
    with pytest.raises(IngestionError, match="complete coverage"):
        package_snapshot(analytics_snapshot, destination)
    assert destination.read_bytes() == before
    assert (destination.parent / "manifest.json").read_bytes() == manifest


@pytest.mark.parametrize(
    "field,value",
    [("conflicts", 1), ("comparable_hours", 743), ("decision_date_from", "2026-01-02")],
)
def test_release_rejects_conflicts_and_false_provenance(complete_snapshot, field, value):
    change_quality(complete_snapshot, lambda quality: quality.update({field: value}))
    with pytest.raises(IngestionError):
        validate_snapshot(complete_snapshot)


def test_release_destination_cannot_overwrite_development_snapshot(complete_snapshot):
    with pytest.raises(IngestionError, match="must differ"):
        package_snapshot(complete_snapshot, complete_snapshot)


def test_compiled_frontend_preserves_api_docs_errors_and_asset_isolation(
    complete_snapshot, tmp_path
):
    frontend = tmp_path / "dist"
    frontend.mkdir()
    (frontend / "index.html").write_text('<html><div id="root">WindSight</div></html>')
    (frontend / "assets").mkdir()
    (frontend / "assets/app.js").write_text("// compiled fixture")
    with TestClient(
        create_app(Settings(database_path=complete_snapshot), frontend_directory=frontend)
    ) as client:
        assert 'id="root"' in client.get("/").text
        assert client.get("/assets/app.js").status_code == 200
        assert "Welcome to the WindSight API" in client.get("/api").text
        assert client.get("/api/v1/metadata").json()["timezone"] == "UTC"
        assert client.get("/openapi.json").json()["info"]["title"] == "WindSight API"
        assert client.get("/docs").status_code == 200
        assert client.get("/api/v1/decisions/2026-02-01").status_code == 422
        for path in [
            "/api/v1/missing",
            "/assets/missing.js",
            "/backend/snapshot/windsight.db",
            "/../source.sqlite3",
        ]:
            assert client.get(path).status_code == 404
        assert client.post("/api/v1/health").status_code == 405


def test_real_versioned_asset_is_complete_and_served_read_only():
    root = Path(__file__).resolve().parents[2]
    snapshot = root / "backend/snapshot/windsight.db"
    before = snapshot.read_bytes()
    manifest = validate_snapshot(snapshot, snapshot.parent / "manifest.json")
    with TestClient(create_app(Settings(database_path=snapshot))) as client:
        assert client.get("/api/v1/health").json()["data_status"] == "snapshot_ready"
        metadata = client.get("/api/v1/metadata").json()
        assert metadata["snapshot"]["content_sha256"] == manifest["content_sha256"]
        result = client.get("/api/v1/accuracy").json()
        assert result["metrics"]["coverage"]["matched_hours"] == 744
    assert snapshot.read_bytes() == before


def test_deployment_entrypoint_uses_versioned_snapshot(monkeypatch, tmp_path):
    root = Path(__file__).resolve().parents[2]
    monkeypatch.setenv("WINDSIGHT_DATABASE_PATH", str(tmp_path / "unrelated.db"))
    spec = importlib.util.spec_from_file_location("windsight_entrypoint", root / "index.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.app.state.settings.database_path == root / "backend/snapshot/windsight.db"


def test_fresh_checkout_reads_release_asset_without_creating_local_data(monkeypatch, tmp_path):
    from app.core import config

    local = tmp_path / "not-ingested.sqlite3"
    bundled = Path(__file__).resolve().parents[1] / "snapshot/windsight.db"
    monkeypatch.setattr(config, "DEVELOPMENT_DATABASE", local)
    monkeypatch.setattr(config, "RELEASE_DATABASE", bundled)
    assert Settings().database_path == bundled
    assert not local.exists()
    local.touch()
    assert Settings().database_path == local
    monkeypatch.setenv("WINDSIGHT_DATABASE_PATH", str(tmp_path / "explicit.sqlite3"))
    assert Settings().database_path == tmp_path / "explicit.sqlite3"
