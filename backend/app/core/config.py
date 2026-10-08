from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Route 53 Clone API"
    database_url: str = "sqlite:///./route53.db"
    secret_key: str = "change-me-in-production"
    cookie_name: str = "session"
    cookie_secure: bool = False
    session_ttl_days: int = 7
    allowed_origins: list[str] = ["http://localhost:3000"]
    seed_on_startup: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
