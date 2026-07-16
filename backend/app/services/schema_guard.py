from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings


def cloud_tables_exist(db: Session, table_names: list[str]) -> bool:
    if get_settings().database_auth_mode != "managed_identity":
        return False
    return all(db.execute(text("SELECT to_regclass(:table_name)"), {"table_name": table_name}).scalar() for table_name in table_names)
