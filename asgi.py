"""Vercel Python entrypoint: exposes the FastAPI app defined under backend/."""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402, F401
