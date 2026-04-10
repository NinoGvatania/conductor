import structlog

from backend.database import get_supabase_client

logger = structlog.get_logger()

_key_cache: dict[str, str] = {}


def get_api_key(provider: str) -> str | None:
    """Load API key for a provider from Supabase llm_providers table."""
    if provider in _key_cache:
        return _key_cache[provider]

    try:
        client = get_supabase_client()
        result = (
            client.table("llm_providers")
            .select("api_key")
            .eq("provider", provider)
            .eq("is_active", True)
            .execute()
        )
        if result.data and result.data[0].get("api_key"):
            key = result.data[0]["api_key"]
            _key_cache[provider] = key
            return key
    except Exception as e:
        logger.warning("key_store_error", provider=provider, error=str(e))

    return None


def get_base_url(provider: str) -> str | None:
    """Load base URL for custom providers."""
    try:
        client = get_supabase_client()
        result = (
            client.table("llm_providers")
            .select("base_url")
            .eq("provider", provider)
            .eq("is_active", True)
            .execute()
        )
        if result.data and result.data[0].get("base_url"):
            return result.data[0]["base_url"]
    except Exception:
        pass
    return None


def clear_cache():
    """Clear cached keys (call after connecting/disconnecting a provider)."""
    _key_cache.clear()
