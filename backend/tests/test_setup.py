import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app


def test_health_reports_liveness_without_claiming_data_is_ready():
    with TestClient(create_app(Settings())) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "windsight",
        "phase": "setup",
        "data_status": "not_ingested",
    }


def test_config_reflects_environment_and_january_decision_scope(monkeypatch):
    monkeypatch.setenv("WINDSIGHT_DECISION_CUTOFF_GMT", "10:15")
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/config")
    assert response.status_code == 200
    config = response.json()
    assert config["decision_cutoff_gmt"] == "10:15"
    assert config["cutoff_is_assumed"] is True
    assert config["decision_date_from"] == "2026-01-01"
    assert config["decision_date_to"] == "2026-01-31"
    assert config["delivery_date_from"] == "2026-01-02"
    assert config["delivery_date_to"] == "2026-02-01"


@pytest.mark.parametrize("cutoff", ["24:00", "09:60", "9:50", "09:50Z", "invalid"])
def test_invalid_cutoff_fails_configuration(cutoff):
    with pytest.raises(ValidationError, match="HH:MM"):
        Settings(decision_cutoff_gmt=cutoff)


def test_cors_allows_only_configured_local_origin():
    with TestClient(create_app(Settings(cors_origins=["http://localhost:5173"]))) as client:
        allowed = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
        other = client.get("/api/v1/health", headers={"Origin": "https://example.org"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in other.headers
