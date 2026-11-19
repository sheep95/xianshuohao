from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import BACKEND_DIR, Settings


def test_production_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError, match="Production CORS origins cannot"):
        Settings(_env_file=None, app_env="production", cors_origins=["*"])


def test_production_rejects_implicit_localhost_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with pytest.raises(ValidationError, match="explicitly configured and non-empty"):
        Settings(_env_file=None, app_env="production")


def test_production_rejects_empty_origins() -> None:
    with pytest.raises(ValidationError, match="explicitly configured and non-empty"):
        Settings(_env_file=None, app_env="production", cors_origins=[])


def test_production_accepts_explicit_origins() -> None:
    settings = Settings(
        _env_file=None, app_env="production", cors_origins=["https://constitution.example"]
    )
    assert settings.cors_origins == ["https://constitution.example"]


def test_production_accepts_origins_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", '["https://constitution.example"]')
    settings = Settings(_env_file=None, app_env="production")
    assert settings.cors_origins == ["https://constitution.example"]


def test_development_retains_default_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    settings = Settings(_env_file=None, app_env="development")
    assert settings.cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]


@pytest.mark.parametrize(
    "origin",
    ["not-a-url", "https://example.com/path", "https://*.example.com", ""],
)
def test_cors_rejects_invalid_origin(origin: str) -> None:
    with pytest.raises(ValidationError, match="complete HTTP"):
        Settings(_env_file=None, cors_origins=[origin])


def test_settings_reads_explicit_env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ["APP_ENV", "CORS_ORIGINS", "LLM_API_KEY"]:
        monkeypatch.delenv(name, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        'APP_ENV=test\nCORS_ORIGINS=["https://example.com"]\nLLM_API_KEY=\n',
        encoding="utf-8",
    )
    settings = Settings(_env_file=env_file)
    assert settings.app_env == "test"
    assert settings.cors_origins == ["https://example.com"]
    assert settings.llm_api_key is None


def test_default_database_path_is_backend_relative(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings(_env_file=None)
    assert settings.database_url == f"sqlite:///{(BACKEND_DIR / 'data' / 'app.db').as_posix()}"


def test_settings_repr_hides_credentials() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql://demo:private-password@example.com/demo",
        llm_api_key="private-api-key",
    )
    assert "private-password" not in repr(settings)
    assert "private-api-key" not in repr(settings)
