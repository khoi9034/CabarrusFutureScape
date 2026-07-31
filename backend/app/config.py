from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["dev", "test", "prod"]
AiProviderName = Literal["none", "openai"]
DatabaseAuthMode = Literal["password", "managed_identity"]
ApiAuthMode = Literal["off", "entra"]
RuntimeMode = Literal["local", "enterprise"]
DataProviderName = Literal["local_postgis", "enterprise_service"]
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
    cfs_runtime_mode: RuntimeMode = Field(
        default="local",
        validation_alias=AliasChoices("CFS_RUNTIME_MODE"),
    )
    cfs_data_provider: DataProviderName = Field(
        default="local_postgis",
        validation_alias=AliasChoices("CFS_DATA_PROVIDER"),
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
    database_auth_mode: DatabaseAuthMode = Field(
        default="password",
        validation_alias=AliasChoices("CFS_DATABASE_AUTH_MODE"),
    )
    azure_postgres_host: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_AZURE_POSTGRES_HOST"),
    )
    azure_postgres_database: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_AZURE_POSTGRES_DATABASE"),
    )
    azure_postgres_port: int = Field(
        default=5432,
        validation_alias=AliasChoices("CFS_AZURE_POSTGRES_PORT"),
    )
    azure_postgres_user: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_AZURE_POSTGRES_USER"),
    )
    azure_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("AZURE_CLIENT_ID", "CFS_AZURE_CLIENT_ID"),
    )
    database_connect_timeout_seconds: int = Field(
        default=5,
        validation_alias=AliasChoices(
            "DATABASE_CONNECT_TIMEOUT_SECONDS",
            "DB_CONNECT_TIMEOUT_SECONDS",
        ),
    )
    database_pool_size: int = Field(
        default=2,
        ge=1,
        le=10,
        validation_alias=AliasChoices("CFS_DATABASE_POOL_SIZE", "SQLALCHEMY_POOL_SIZE"),
    )
    database_max_overflow: int = Field(
        default=1,
        ge=0,
        le=10,
        validation_alias=AliasChoices("CFS_DATABASE_MAX_OVERFLOW", "SQLALCHEMY_MAX_OVERFLOW"),
    )
    database_pool_timeout_seconds: int = Field(
        default=10,
        ge=1,
        le=30,
        validation_alias=AliasChoices("CFS_DATABASE_POOL_TIMEOUT_SECONDS", "SQLALCHEMY_POOL_TIMEOUT_SECONDS"),
    )
    database_pool_recycle_seconds: int = Field(
        default=2700,
        ge=300,
        le=3300,
        validation_alias=AliasChoices("CFS_DATABASE_POOL_RECYCLE_SECONDS", "SQLALCHEMY_POOL_RECYCLE_SECONDS"),
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
    cfs_enable_docs: bool = Field(
        default=True,
        validation_alias=AliasChoices("CFS_ENABLE_DOCS"),
    )
    cfs_staging_protect_api: bool = Field(
        default=False,
        validation_alias=AliasChoices("CFS_STAGING_PROTECT_API"),
    )
    cfs_staging_access_token: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_STAGING_ACCESS_TOKEN"),
    )
    cfs_api_auth_mode: ApiAuthMode = Field(
        default="off",
        validation_alias=AliasChoices("CFS_API_AUTH_MODE"),
    )
    cfs_entra_tenant_id: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_ENTRA_TENANT_ID"),
    )
    cfs_entra_api_audience: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_ENTRA_API_AUDIENCE"),
    )
    cfs_entra_required_scope: str = Field(
        default="CFS.Access",
        validation_alias=AliasChoices("CFS_ENTRA_REQUIRED_SCOPE"),
    )
    cfs_entra_write_role: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_ENTRA_WRITE_ROLE"),
    )
    cfs_entra_admin_role: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_ENTRA_ADMIN_ROLE"),
    )
    cfs_entra_allowed_object_ids: str = Field(
        default="",
        validation_alias=AliasChoices("CFS_ENTRA_ALLOWED_OBJECT_IDS"),
    )
    cfs_model_lab_summary_cache_ttl_seconds: int = Field(
        default=21600,
        ge=0,
        le=86400,
        validation_alias=AliasChoices("CFS_MODEL_LAB_SUMMARY_CACHE_TTL_SECONDS"),
    )
    cfs_telemetry_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("CFS_TELEMETRY_ENABLED"),
    )
    applicationinsights_connection_string: str = Field(
        default="",
        validation_alias=AliasChoices("APPLICATIONINSIGHTS_CONNECTION_STRING"),
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
    cfs_ai_provider_timeout_seconds: float = Field(
        default=6.0,
        gt=0,
        le=20,
        validation_alias=AliasChoices("CFS_AI_PROVIDER_TIMEOUT_SECONDS"),
    )
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY"),
    )
    county_tax_rate_per_100: float = Field(
        default=0.57,
        validation_alias=AliasChoices("CFS_COUNTY_TAX_RATE_PER_100"),
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

    @property
    def docs_enabled(self) -> bool:
        return self.cfs_enable_docs

    @property
    def staging_protection_enabled(self) -> bool:
        return self.cfs_staging_protect_api or bool(self.cfs_staging_access_token)

    @property
    def entra_auth_enabled(self) -> bool:
        return self.cfs_api_auth_mode == "entra"

    @property
    def entra_allowed_object_id_set(self) -> set[str]:
        return {
            value.strip().lower()
            for value in self.cfs_entra_allowed_object_ids.split(",")
            if value.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
