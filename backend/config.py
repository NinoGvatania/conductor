from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/agentflow"

    # Auth
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION: int = 86400  # 24 hours

    # LLM
    DEFAULT_PROVIDER: str = "anthropic"
    DEFAULT_MODEL_TIER: str = "balanced"

    # Limits
    MAX_COST_PER_RUN: float = 2.0
    MAX_TOKENS_PER_RUN: int = 100_000

    # Storage
    STORAGE_DIR: str = "./storage"

    model_config = SettingsConfigDict(
        env_file=("backend/.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
