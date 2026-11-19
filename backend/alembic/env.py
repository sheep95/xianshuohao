from alembic import context
from sqlmodel import SQLModel

from app.core.config import Settings
from app.core.database import build_engine
from app.models import entities  # noqa: F401

config = context.config


def run(connection):
    context.configure(connection=connection, target_metadata=SQLModel.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=Settings().database_url, target_metadata=SQLModel.metadata, literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
elif config.attributes.get("connection") is not None:
    run(config.attributes["connection"])
else:
    engine = build_engine(Settings().database_url)
    try:
        with engine.connect() as connection:
            run(connection)
    finally:
        engine.dispose()
