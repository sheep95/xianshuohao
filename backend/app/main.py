from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.health import router as health_router
from app.api.rooms import router as rooms_router
from app.core.config import Settings
from app.core.database import build_engine, migrate, verify_schema
from app.core.security import WriteLimiter
from app.services.rule_library import RULE_LIBRARY_PATH, load_rule_library


def create_app(
    settings: Settings | None = None,
    *,
    library_path: Path = RULE_LIBRARY_PATH,
) -> FastAPI:
    configuration = settings if settings is not None else Settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.rule_library = load_rule_library(library_path)
        engine = build_engine(configuration.database_url)
        application.state.engine = engine
        try:
            if configuration.auto_migrate:
                migrate(engine)
            else:
                verify_schema(engine)
            yield
        finally:
            engine.dispose()

    application = FastAPI(
        title="临时宪法 API",
        description="匿名立宪、约束式幽默改写、3 秒模型预算与模板回退、认领及定稿。",
        version="0.6.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-CSRF-Protection", "Idempotency-Key"],
    )
    application.state.settings = configuration
    application.state.write_limiter = WriteLimiter(configuration.write_limit_per_minute)

    @application.middleware("http")
    async def no_private_cache(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @application.exception_handler(IntegrityError)
    async def conflict(_request: Request, _exc: IntegrityError):
        return JSONResponse(
            status_code=409,
            content={
                "detail": {
                    "code": "write_conflict",
                    "message": "操作发生冲突，请刷新后重试",
                }
            },
        )

    @application.exception_handler(OperationalError)
    async def unavailable(_request: Request, _exc: OperationalError):
        return JSONResponse(
            status_code=503,
            content={
                "detail": {
                    "code": "database_unavailable",
                    "message": "暂时无法保存，请稍后重试",
                }
            },
        )

    application.include_router(health_router)
    application.include_router(rooms_router)
    return application


app = create_app()
