from datetime import UTC, datetime


def utcnow() -> datetime:
    """Naive UTC timestamp. SQLite stores DATETIME as text without an offset, so the
    whole application works with naive UTC values to keep comparisons consistent."""
    return datetime.now(UTC).replace(tzinfo=None)
