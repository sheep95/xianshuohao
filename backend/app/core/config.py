from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Read process environment and backend/.env without changing either."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = Field(
        default=f"sqlite:///{(BACKEND_DIR / 'data' / 'app.db').as_posix()}",
        repr=False,
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    llm_api_key: SecretStr | None = Field(default=None, repr=False)
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = ""
    auto_migrate: bool = True
    cookie_name: str = "constitution_session"
    session_days: int = Field(default=180, ge=1, le=365)
    write_limit_per_minute: int = Field(default=60, ge=1, le=10000)

    @field_validator("llm_api_key", mode="before")
    @classmethod
    def empty_api_key_is_unconfigured(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("llm_base_url")
    @classmethod
    def validate_llm_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.port == 0
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or any(c.isspace() for c in value)
        ):
            raise ValueError("LLM_BASE_URL requires HTTP(S), without credentials or query")
        if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Remote LLM_BASE_URL must use HTTPS")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, origins: list[str]) -> list[str]:
        normalized: list[str] = []
        for raw_origin in origins:
            origin = raw_origin.strip().rstrip("/")
            if origin != "*":
                parsed = urlsplit(origin)
                if (
                    parsed.scheme not in {"http", "https"}
                    or not parsed.netloc
                    or parsed.username is not None
                    or parsed.password is not None
                    or parsed.path
                    or parsed.query
                    or parsed.fragment
                    or "*" in origin
                ):
                    raise ValueError("CORS origins must be complete HTTP(S) origins without paths")
            if origin not in normalized:
                normalized.append(origin)
        return normalized

    @model_validator(mode="after")
    def production_requires_explicit_origins(self) -> Self:
        if self.app_env == "production" and not self.llm_base_url.startswith("https://"):
            raise ValueError("Production LLM_BASE_URL must use HTTPS")
        if self.app_env == "production" and "*" in self.cors_origins:
            raise ValueError("Production CORS origins cannot contain '*'")
        if self.app_env == "production" and (
            "cors_origins" not in self.model_fields_set or not self.cors_origins
        ):
            raise ValueError("Production CORS origins must be explicitly configured and non-empty")
        if self.app_env == "production" and self.auto_migrate:
            self.auto_migrate = False
        if "*" in self.cors_origins:
            raise ValueError("Credentialed CORS requires explicit origins")
        return self
