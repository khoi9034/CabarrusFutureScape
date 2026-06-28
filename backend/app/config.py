from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["dev", "test", "prod"]
AiProviderName = Literal["none", "openai"]
BACKEND_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
ROOT_BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / "backend.env"
LOCAL_FRONTEND_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3003",
    "http://127.0.0.1:3003",
)


class Settings(BaseSettings):
    """Environment-driven API settings.

    `POSTGRES_PASSWORD` is preferred for backend deployments. The local CFS
    pipeline password variable remains supported so the first backend scaffold
    can connect to the existing development PostGIS database without copying
    secrets.
    """

    app_env: EnvironmentName = Field(
        default="dev",
        validation_alias=AliasChoices("APP_ENV", "CFS_API_ENV"),
    )
    postgres_host: str = Field(
        default="localhost",
        validation_alias=AliasChoices("POSTGRES_HOST"),
    )
    postgres_port: int = Field(
        default=5433,
        validation_alias=AliasChoices("POSTGRES_PORT"),
    )
    postgres_db: str = Field(
        default="cfs_dev",
        validation_alias=AliasChoices("POSTGRES_DB"),
    )
    postgres_user: str = Field(
        default="postgres",
        validation_alias=AliasChoices("POSTGRES_USER"),
    )
    postgres_password: str = Field(
        default="",
        validation_alias=AliasChoices("POSTGRES_PASSWORD", "CFS_POSTGRES_PASSWORD"),
    )
    database_url: str = Field(
        default="",
        validation_alias=AliasChoices("DATABASE_URL"),
    )
    database_connect_timeout_seconds: int = Field(
        default=5,
        validation_alias=AliasChoices(
            "DATABASE_CONNECT_TIMEOUT_SECONDS",
            "DB_CONNECT_TIMEOUT_SECONDS",
        ),
    )
    database_statement_timeout_ms: int = Field(
        default=3000,
        validation_alias=AliasChoices(
            "DATABASE_STATEMENT_TIMEOUT_MS",
            "DB_STATEMENT_TIMEOUT_MS",
        ),
    )
    sqlalchemy_echo: bool = Field(
        default=False,
        validation_alias=AliasChoices("SQLALCHEMY_ECHO"),
    )
    cors_allowed_origins: str = Field(
        default=",".join(LOCAL_FRONTEND_CORS_ORIGINS),
        validation_alias=AliasChoices("CORS_ALLOWED_ORIGINS", "CFS_CORS_ALLOWED_ORIGINS"),
    )
    cfs_ai_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("CFS_AI_ENABLED"),
    )
    cfs_ai_provider: AiProviderName = Field(
        default="none",
        validation_alias=AliasChoices("CFS_AI_PROVIDER"),
    )
    cfs_ai_model: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_AI_MODEL"),
    )
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY"),
    )
    model_config = SettingsConfigDict(
        env_file=(BACKEND_ENV_FILE, ROOT_BACKEND_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "prod"

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]

        if self.is_production:
            # Production deployments must opt into explicit origins; never carry
            # a permissive wildcard from a local/dev environment by accident.
            return [origin for origin in origins if origin != "*"]

        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
