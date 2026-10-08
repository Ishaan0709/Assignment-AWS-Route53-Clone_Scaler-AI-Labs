from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


def import_models() -> None:
    """Import every model module so that ``Base.metadata`` knows all tables."""
    from app import models  # noqa: F401
