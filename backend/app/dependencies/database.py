from collections.abc import Generator
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import SessionLocal

_OPTIONAL_DB_UNAVAILABLE_UNTIL: datetime | None = None
_OPTIONAL_DB_COOLDOWN = timedelta(minutes=1)


def get_read_only_db() -> Generator[Session, None, None]:
    """Provide a read-only database session for future endpoint handlers."""

    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        yield db
        db.rollback()
    finally:
        db.close()


def get_optional_read_only_db() -> Generator[Session | None, None, None]:
    """Provide a read-only session, or None so fallback-first routes can degrade cleanly."""

    global _OPTIONAL_DB_UNAVAILABLE_UNTIL
    if _OPTIONAL_DB_UNAVAILABLE_UNTIL and _OPTIONAL_DB_UNAVAILABLE_UNTIL > datetime.now(UTC):
        yield None
        return

    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        _OPTIONAL_DB_UNAVAILABLE_UNTIL = None
    except SQLAlchemyError:
        # ponytail: process-local cooldown prevents every fallback request paying a dead DB connect timeout.
        _OPTIONAL_DB_UNAVAILABLE_UNTIL = datetime.now(UTC) + _OPTIONAL_DB_COOLDOWN
        db.close()
        yield None
        return

    try:
        yield db
        db.rollback()
    finally:
        db.close()
