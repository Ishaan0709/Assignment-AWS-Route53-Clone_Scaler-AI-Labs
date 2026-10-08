"""Small helpers shared by the list endpoints (sorting whitelist + pagination)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class Page:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def resolve_sort(
    sort: str | None, order: str | None, allowed: Mapping[str, Any], default: str
) -> tuple[Any, bool]:
    """Return ``(column, descending)`` or raise 400 for an unknown field/order."""
    field = (sort or default).strip()
    if field not in allowed:
        raise BadRequestError(
            f"Unknown sort field '{field}'. Allowed: {', '.join(allowed)}.",
            fields={"sort": "Unknown sort field."},
            code="InvalidSort",
        )
    direction = (order or "asc").strip().lower()
    if direction not in ("asc", "desc"):
        raise BadRequestError(
            "Order must be 'asc' or 'desc'.",
            fields={"order": "Must be asc or desc."},
            code="InvalidSort",
        )
    return allowed[field], direction == "desc"


def count_rows(db: Session, stmt: Select[Any]) -> int:
    return int(db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0)


def paginate(db: Session, stmt: Select[Any], page: Page) -> tuple[Sequence[Any], int]:
    total = count_rows(db, stmt)
    rows = db.execute(stmt.offset(page.offset).limit(page.page_size)).all()
    return rows, total
