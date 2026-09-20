"""Configuração validada da aplicação web."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    app_env: Literal["development", "test", "production"] = "development"
    supabase_url: str
    supabase_jwt_issuer: str
    supabase_jwt_audience: str = "authenticated"
    supabase_allowed_user_ids: Annotated[frozenset[UUID], NoDecode]
    motor_build_sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    web_dist_dir: Path | None = None
    diagnostic_max_workers: int = Field(default=2, ge=1, le=4)
    diagnostic_max_jobs_per_user: int = Field(default=3, ge=1)
    diagnostic_max_jobs_global: int = Field(default=32, ge=1)
    diagnostic_retention_seconds: int = Field(default=86400, ge=1)

    @field_validator("supabase_allowed_user_ids", mode="before")
    @classmethod
    def parse_allowed_users(cls, value: object) -> object:
        if isinstance(value, str):
            return frozenset(item.strip() for item in value.split(",") if item.strip())
        return value

    @field_validator("supabase_url", "supabase_jwt_issuer")
    @classmethod
    def normalize_urls(cls, value: str) -> str:
        if not value.startswith("https://") or value != value.rstrip("/"):
            raise ValueError("URL deve usar https e não terminar com barra")
        return value

    @model_validator(mode="after")
    def validate_relationships(self) -> Settings:
        expected_issuer = f"{self.supabase_url}/auth/v1"
        if self.supabase_jwt_issuer != expected_issuer:
            raise ValueError(
                "SUPABASE_JWT_ISSUER deve ser SUPABASE_URL acrescida de /auth/v1"
            )
        if self.supabase_jwt_audience != "authenticated":
            raise ValueError("SUPABASE_JWT_AUDIENCE deve ser authenticated")
        if not self.supabase_allowed_user_ids:
            raise ValueError("SUPABASE_ALLOWED_USER_IDS não pode ser vazio")
        if self.app_env == "production" and self.web_dist_dir is None:
            raise ValueError("WEB_DIST_DIR é obrigatório em produção")
        return self

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_jwt_issuer}/.well-known/jwks.json"
