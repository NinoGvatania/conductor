from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEFAULT_MODEL_TIER: str = "balanced"
    MAX_COST_PER_RUN: float = 2.0
    MAX_TOKENS_PER_RUN: int = 100_000

    model_config = {
        "env_file": ("backend/.env", ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()
