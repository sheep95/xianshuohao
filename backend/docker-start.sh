#!/bin/sh
set -eu

python -m app.core.migrate
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
