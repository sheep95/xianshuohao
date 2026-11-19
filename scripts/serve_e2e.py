"""Run the real API with an isolated database for browser acceptance."""
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

if __name__ == "__main__":
    folder = ROOT / ".cache" / "e2e-databases"
    folder.mkdir(parents=True, exist_ok=True)
    database = folder / f"browser-{uuid.uuid4().hex}.db"
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=f"sqlite:///{database.as_posix()}",
        cors_origins=["http://127.0.0.1:3100"],
        write_limit_per_minute=10000,
        auto_migrate=True,
        llm_api_key=None,
    )
    uvicorn.run(create_app(settings), host="127.0.0.1", port=8000, log_level="warning")
