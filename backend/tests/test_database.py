from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel

from app.core.config import Settings
from app.core.database import build_engine, migrate, migration_config, verify_schema
from app.main import create_app
from app.models.entities import Participant


def test_migration_roundtrip_and_model_agreement(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path}/migration.db")
    try:
        with pytest.raises(RuntimeError, match="migrations required"):
            verify_schema(engine)
        migrate(engine)
        migrate(engine)
        verify_schema(engine)
        assert set(inspect(engine).get_table_names()) == {
            "alembic_version",
            "rooms",
            "identities",
            "participants",
            "rules",
            "claims",
            "finalized_snapshots",
            "operations",
        }
        with engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), SQLModel.metadata) == []
        with Session(engine) as session:
            session.add(
                Participant(
                    room_id="nonexistent",
                    identity_id="nonexistent",
                    nickname="test",
                )
            )
            with pytest.raises(IntegrityError):
                session.commit()
        config = migration_config()
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "base")
        assert inspect(engine).get_table_names() == ["alembic_version"]
        migrate(engine)
        verify_schema(engine)
    finally:
        engine.dispose()


def test_production_requires_migration_and_sets_secure_cookie(tmp_path):
    settings = Settings(
        _env_file=None,
        app_env="production",
        cors_origins=["https://app.example"],
        database_url=f"sqlite:///{tmp_path}/production.db",
    )
    assert not settings.auto_migrate
    with pytest.raises(RuntimeError, match="migrations required"):
        with TestClient(create_app(settings)):
            pass
    engine = build_engine(settings.database_url)
    migrate(engine)
    engine.dispose()
    with TestClient(create_app(settings), base_url="https://app.example") as client:
        blocked = client.post(
            "/api/rooms",
            json={"space_type": "club_room"},
            headers={
                "X-CSRF-Protection": "1",
                "Origin": "https://unlisted.example",
                "Host": "unlisted.example",
            },
        )
        assert blocked.status_code == 403
        assert blocked.json()["detail"]["code"] == "origin_forbidden"
        response = client.post(
            "/api/rooms",
            json={"space_type": "club_room"},
            headers={
                "X-CSRF-Protection": "1",
                "Origin": "https://app.example",
            },
        )
        assert response.status_code == 201, response.text
        assert "Secure" in response.headers["set-cookie"]
        assert response.headers["access-control-allow-credentials"] == "true"
        assert datetime.fromisoformat(response.json()["created_at"]).tzinfo == UTC
