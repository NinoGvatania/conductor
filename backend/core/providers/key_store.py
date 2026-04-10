import structlog
from sqlalchemy import select

from backend.database import async_session_factory
from backend.models import LLMProvider

logger = structlog.get_logger()

_key_cache: dict[str, str] = {}
_url_cache: dict[str, str] = {}


async def get_api_key(provider: str) -> str | None:
    """Async fetch of API key from DB, with cache."""
    if provider in _key_cache:
        return _key_cache[provider]
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(LLMProvider)
                .where(LLMProvider.provider == provider)
                .where(LLMProvider.is_active == True)  # noqa: E712
            )
            p = result.scalar_one_or_none()
            if p and p.api_key:
                _key_cache[provider] = p.api_key
                if p.base_url:
                    _url_cache[provider] = p.base_url
                return p.api_key
    except Exception as e:
        logger.warning("key_store_error", provider=provider, error=str(e))
    return None


async def get_base_url(provider: str) -> str | None:
    if provider in _url_cache:
        return _url_cache[provider]
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(LLMProvider)
                .where(LLMProvider.provider == provider)
                .where(LLMProvider.is_active == True)  # noqa: E712
            )
            p = result.scalar_one_or_none()
            if p and p.base_url:
                _url_cache[provider] = p.base_url
                return p.base_url
    except Exception:
        pass
    return None


def clear_cache():
    _key_cache.clear()
    _url_cache.clear()
