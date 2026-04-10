import asyncio

import structlog
from sqlalchemy import select

from backend.database import async_session_factory
from backend.models import LLMProvider

logger = structlog.get_logger()

_key_cache: dict[str, str] = {}
_url_cache: dict[str, str] = {}


async def _fetch_provider(provider: str) -> LLMProvider | None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(LLMProvider)
            .where(LLMProvider.provider == provider)
            .where(LLMProvider.is_active == True)  # noqa: E712
        )
        return result.scalar_one_or_none()


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context — use a thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


def get_api_key(provider: str) -> str | None:
    if provider in _key_cache:
        return _key_cache[provider]
    try:
        p = _run_async(_fetch_provider(provider))
        if p and p.api_key:
            _key_cache[provider] = p.api_key
            if p.base_url:
                _url_cache[provider] = p.base_url
            return p.api_key
    except Exception as e:
        logger.warning("key_store_error", provider=provider, error=str(e))
    return None


def get_base_url(provider: str) -> str | None:
    if provider in _url_cache:
        return _url_cache[provider]
    try:
        p = _run_async(_fetch_provider(provider))
        if p and p.base_url:
            _url_cache[provider] = p.base_url
            return p.base_url
    except Exception:
        pass
    return None


def clear_cache():
    _key_cache.clear()
    _url_cache.clear()
