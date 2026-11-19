import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.rule_library import RULE_LIBRARY_PATH


@pytest.fixture(autouse=True)
def no_live_model_in_tests(monkeypatch):
    for name in ("LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def library_payload() -> dict[str, Any]:
    return json.loads(RULE_LIBRARY_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        write_limit_per_minute=1000,
        cors_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
