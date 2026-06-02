from collections.abc import Generator

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal


def get_read_only_db() -> Generator[Session, None, None]:
    """Provide a read-only database session for future endpoint handlers."""

    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        yield db
        db.rollback()
    finally:
        db.close()

