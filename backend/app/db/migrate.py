"""Apply Alembic migrations on file databases.

In-memory databases used by tests stay on ``create_all``. A database that already has
tables from an older ``create_all`` startup is stamped at head instead of recreated.
"""

from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"


def _config(database_url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


def ensure_schema(database_url: str) -> None:
    engine = create_engine(database_url)
    try:
        names = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
    cfg = _config(database_url)
    if names and "alembic_version" not in names:
        command.stamp(cfg, "head")
        return
    command.upgrade(cfg, "head")
