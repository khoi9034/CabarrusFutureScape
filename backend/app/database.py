from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings


def build_database_url(settings: Settings) -> URL:
    if settings.database_url.strip():
        return make_url(settings.database_url.strip())

    return URL.create(
        drivername="postgresql+psycopg",
        username=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
    )


settings = get_settings()
engine = create_engine(
    build_database_url(settings),
    echo=settings.sqlalchemy_echo,
    connect_args={"connect_timeout": settings.database_connect_timeout_seconds},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=Session,
)


def get_engine() -> Engine:
    return engine


def verify_database_connection() -> None:
    """Run a read-only connection check against PostGIS-backed PostgreSQL."""

    try:
        statement_timeout_ms = max(settings.database_statement_timeout_ms, 1)
        with engine.connect() as connection:
            with connection.begin():
                connection.execute(text(f"SET LOCAL statement_timeout = {statement_timeout_ms}"))
                connection.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError:
        raise
