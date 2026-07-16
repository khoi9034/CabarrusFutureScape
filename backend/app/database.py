from sqlalchemy import URL, create_engine, event, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings

POSTGRES_ENTRA_SCOPE = "https://ossrdbms-aad.database.windows.net/.default"


def build_database_url(settings: Settings) -> URL:
    if settings.database_auth_mode == "managed_identity":
        return URL.create(
            drivername="postgresql+psycopg",
            username=settings.azure_postgres_user or settings.postgres_user,
            host=settings.azure_postgres_host or settings.postgres_host,
            port=settings.azure_postgres_port,
            database=settings.azure_postgres_database or settings.postgres_db,
            query={"sslmode": "require"},
        )

    if settings.database_url.strip():
        database_url = make_url(settings.database_url.strip())
        if database_url.drivername == "postgresql":
            database_url = database_url.set(drivername="postgresql+psycopg")

        if (
            database_url.host
            and database_url.host not in {"127.0.0.1", "localhost"}
            and "sslmode" not in database_url.query
        ):
            database_url = database_url.update_query_dict({"sslmode": "require"})

        return database_url

    return URL.create(
        drivername="postgresql+psycopg",
        username=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
    )


def install_managed_identity_auth(engine: Engine, settings: Settings) -> None:
    if settings.database_auth_mode != "managed_identity":
        return

    from azure.identity import ManagedIdentityCredential

    credential = ManagedIdentityCredential(client_id=settings.azure_client_id or None)

    @event.listens_for(engine, "do_connect")
    def add_entra_token(_dialect, _conn_rec, _cargs, cparams) -> None:
        cparams["password"] = credential.get_token(POSTGRES_ENTRA_SCOPE).token


settings = get_settings()
engine = create_engine(
    build_database_url(settings),
    echo=settings.sqlalchemy_echo,
    connect_args={"connect_timeout": settings.database_connect_timeout_seconds},
    pool_pre_ping=True,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_timeout=settings.database_pool_timeout_seconds,
    pool_recycle=settings.database_pool_recycle_seconds,
)
install_managed_identity_auth(engine, settings)
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
