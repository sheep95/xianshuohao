from pathlib import Path

from pydantic import ValidationError

from app.core.config import BACKEND_DIR
from app.schemas.library import RuleLibrary

RULE_LIBRARY_PATH = BACKEND_DIR / "app" / "data" / "rule_library.json"


def load_rule_library(path: Path | None = None) -> RuleLibrary:
    """Load reviewed rules and fail loudly if the data is missing or inconsistent."""
    source_path = path if path is not None else RULE_LIBRARY_PATH
    try:
        content = source_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise RuntimeError(f"Cannot read rule library at {source_path}") from exc
    try:
        return RuleLibrary.model_validate_json(content)
    except ValidationError as exc:
        raise RuntimeError(f"Rule library failed validation at {source_path}: {exc}") from exc
