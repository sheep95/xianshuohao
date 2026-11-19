import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.main import create_app


def test_health_reports_liveness_only(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "temporary-constitution-api",
        "stage": 6,
    }


def test_readiness_reports_database_outage_without_leaking_details(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert client.get("/ready").json() == {"status": "ready"}

    def unavailable():
        raise OperationalError(None, None, RuntimeError("private connection detail"))

    monkeypatch.setattr(client.app.state.engine, "connect", unavailable)
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/health").status_code == 200


def test_openapi_exposes_room_api(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert {"/health", "/api/rooms", "/api/rooms/{code}/finalize"}.issubset(
        response.json()["paths"],
    )
    assert client.get("/docs").status_code == 200


def test_configured_frontend_origin_is_allowed(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_unlisted_origin_fails_preflight(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "https://unlisted.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_startup_fails_when_library_is_missing(tmp_path: Path) -> None:
    application = create_app(
        Settings(_env_file=None, app_env="test"),
        library_path=tmp_path / "missing-library.json",
    )
    with pytest.raises(RuntimeError, match="Cannot read rule library"):
        with TestClient(application):
            pass


def test_startup_fails_when_library_is_invalid(
    tmp_path: Path, library_payload: dict[str, Any]
) -> None:
    library_payload["schema_version"] = 99
    invalid_library = tmp_path / "invalid-library.json"
    invalid_library.write_text(json.dumps(library_payload), encoding="utf-8")
    application = create_app(
        Settings(_env_file=None, app_env="test"), library_path=invalid_library
    )
    with pytest.raises(RuntimeError, match="Rule library failed validation"):
        with TestClient(application):
            pass
