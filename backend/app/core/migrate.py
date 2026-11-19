from app.core.config import Settings
from app.core.database import build_engine, migrate


def main() -> None:
    engine = build_engine(Settings().database_url)
    try:
        migrate(engine)
        print("Database upgraded to head.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
