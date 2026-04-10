from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    DEFAULT_PROVIDER: str = "anthropic"
    DEFAULT_MODEL_TIER: str = "balanced"
    MAX_TOKENS_PER_RUN: int = 100_000

    model_config = {
        "env_file": ("backend/.env", ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()
