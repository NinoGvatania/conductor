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
    # Default output cap passed to LLM providers. Chosen to fit all current
    # Anthropic/OpenAI models (Sonnet 64k, Opus 32k, gpt-4o 16k — the provider
    # will clamp down if the model supports less). Not an artificial limit on
    # context — input windows are purely the model's capacity.
    DEFAULT_MAX_TOKENS: int = 32000

    # Safety rails — raised from tight defaults to effectively "no limit in
    # practice" while still catching runaway loops. Set env vars to lower if
    # you want tighter control.
    MAX_COST_PER_RUN: float = 10_000.0
    MAX_TOKENS_PER_RUN: int = 100_000_000

    # Storage
    STORAGE_DIR: str = "./storage"

    model_config = SettingsConfigDict(
        env_file=("backend/.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
