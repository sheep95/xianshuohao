from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import Request
from sqlalchemy import Engine, event, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, create_engine

from app.core.config import BACKEND_DIR


def build_engine(database_url: str) -> Engine:
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if url.get_backend_name() == "sqlite" and url.database not in {None, "", ":memory:"}:
        Path(url.database).resolve().parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False, "timeout": 10}
        if url.get_backend_name() == "sqlite"
        else {},
    )
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=10000")

    return engine


def migration_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def migrate(engine: Engine) -> None:
    config = migration_config()
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            # Overlapping deploys must not upgrade the same schema concurrently.
            connection.execute(text("SELECT pg_advisory_xact_lock(671130725)"))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def verify_schema(engine: Engine) -> None:
    head = ScriptDirectory.from_config(migration_config()).get_current_head()
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    if current != head:
        raise RuntimeError("Database migrations required: run python -m app.core.migrate")


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        try:
            if request.method == "POST" and request.app.state.engine.dialect.name == "sqlite":
                # Serialize SQLite writers before reading any state; PG uses row locks instead.
                session.execute(text("BEGIN IMMEDIATE"))
            elif request.app.state.engine.dialect.name == "sqlite":
                # A room response spans several SELECTs: give them one consistent snapshot.
                session.execute(text("BEGIN"))
            elif request.method == "GET":
                session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
            yield session
            if request.method == "POST":
                session.commit()
        except Exception:
            session.rollback()
            raise
