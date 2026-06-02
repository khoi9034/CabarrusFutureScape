from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["dev", "test", "prod"]
BACKEND_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


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
    sqlalchemy_echo: bool = Field(
        default=False,
        validation_alias=AliasChoices("SQLALCHEMY_ECHO"),
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
