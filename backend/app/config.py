"""
Configuration settings loaded from environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    # Telegram
    telegram_api_id: int
    telegram_api_hash: str
    telegram_bot_token: str
    
    # Use string field to avoid JSON parsing issues with comma-separated env var
    telegram_helper_bot_tokens_str: str = Field("", alias="TELEGRAM_HELPER_BOT_TOKENS")
    
    # Authorized Users (optional - comma separated IDs)
    auth_users_str: str = Field("", alias="AUTH_USERS")
    
    @property
    def auth_users(self) -> list[int]:
        v = self.auth_users_str
        if not v:
            return []
        try:
            return [int(u.strip()) for u in v.split(",") if u.strip()]
        except ValueError:
            return []
    
    @property
    def telegram_helper_bot_tokens(self) -> list[str]:
        v = self.telegram_helper_bot_tokens_str
        if not v:
            return []
        return [t.strip() for t in v.split(",") if t.strip()]
    
    @property
    def all_bot_tokens(self) -> list[str]:
        return [self.telegram_bot_token] + self.telegram_helper_bot_tokens
    
    telegram_storage_channel_id: int
    
    # Database — Neon PostgreSQL (no more SQLite)
    database_url: str = Field("postgresql://localhost/yaaritube", alias="DATABASE_URL")
    
    # Neon Auth — JWKS-based JWT verification
    neon_auth_url: str = Field("", alias="NEON_AUTH_URL")
    
    @property
    def neon_auth_jwks_url(self) -> str:
        """JWKS endpoint for verifying Neon Auth JWTs."""
        base = self.neon_auth_url.rstrip("/")
        return f"{base}/.well-known/jwks.json"
    
    # Server
    server_host: str = "0.0.0.0"
    server_port: int = Field(8000, alias="PORT")
    
    # Concurrency
    telegram_client_concurrency: int = 3
    
    # Web
    web_base_url: str = "http://localhost:3000"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        populate_by_name = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
