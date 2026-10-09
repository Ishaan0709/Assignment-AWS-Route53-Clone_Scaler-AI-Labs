from sqlalchemy import create_engine, inspect

from app.db.base import Base, import_models
from app.db.migrate import ensure_schema


def test_upgrade_creates_every_table(tmp_path) -> None:
    url = f"sqlite:///{tmp_path / 'fresh.db'}"
    ensure_schema(url)
    engine = create_engine(url)
    names = set(inspect(engine).get_table_names())
    engine.dispose()
    assert {
        "users",
        "sessions",
        "hosted_zones",
        "tags",
        "dns_records",
        "record_values",
        "alembic_version",
    } <= names


def test_existing_create_all_database_is_stamped(tmp_path) -> None:
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    engine = create_engine(url)
    import_models()
    Base.metadata.create_all(engine)
    engine.dispose()

    ensure_schema(url)
    engine = create_engine(url)
    with engine.connect() as connection:
        version = connection.exec_driver_sql("select version_num from alembic_version").scalar()
    engine.dispose()
    assert version == "0001_initial"
