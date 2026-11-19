from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Service liveness only; this does not check a database or model provider."""
    return HealthResponse()


@router.get("/ready", tags=["health"], responses={503: {"description": "Database unavailable"}})
def ready(request: Request) -> JSONResponse:
    """Check database connectivity without exposing connection details."""
    headers = {"Cache-Control": "no-store"}
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "not_ready"}, status_code=503, headers=headers)
    return JSONResponse({"status": "ready"}, headers=headers)
