"""Fetch available models from LLM provider APIs dynamically."""
import time

import structlog
import httpx

from backend.core.providers.key_store import get_api_key, get_base_url

logger = structlog.get_logger()

CACHE_TTL = 86400  # 24 hours
_models_cache: dict[str, tuple[float, list[dict]]] = {}


async def fetch_models(provider: str, force_refresh: bool = False) -> list[dict[str, str]]:
    """Fetch available models from a provider's API. Returns list of {id, name}."""
    if not force_refresh and provider in _models_cache:
        cached_at, models = _models_cache[provider]
        if time.time() - cached_at < CACHE_TTL:
            return models

    api_key = get_api_key(provider)
    if not api_key:
        return []

    try:
        models = await _fetch_from_provider(provider, api_key)
        if models:
            _models_cache[provider] = (time.time(), models)
        return models
    except Exception as e:
        logger.warning("model_fetch_error", provider=provider, error=str(e))
        return []


async def _fetch_from_provider(provider: str, api_key: str) -> list[dict[str, str]]:
    async with httpx.AsyncClient(timeout=15.0) as client:

        if provider == "anthropic":
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("data", []):
                model_id = m.get("id", "")
                models.append({"id": model_id, "name": _pretty_name(model_id), "provider": "anthropic"})
            return sorted(models, key=lambda x: x["name"])

        elif provider == "openai":
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("data", []):
                model_id = m.get("id", "")
                # Filter to chat models only
                if any(k in model_id for k in ["gpt-4", "gpt-3.5", "o1", "o3", "chatgpt"]):
                    models.append({"id": model_id, "name": _pretty_name(model_id), "provider": "openai"})
            return sorted(models, key=lambda x: x["name"])

        elif provider == "gemini":
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1/models?key={api_key}",
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("models", []):
                model_id = m.get("name", "").replace("models/", "")
                display = m.get("displayName", model_id)
                if "gemini" in model_id.lower():
                    models.append({"id": model_id, "name": display, "provider": "gemini"})
            return sorted(models, key=lambda x: x["name"])

        elif provider == "mistral":
            resp = await client.get(
                "https://api.mistral.ai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("data", []):
                model_id = m.get("id", "")
                models.append({"id": model_id, "name": _pretty_name(model_id), "provider": "mistral"})
            return sorted(models, key=lambda x: x["name"])

        elif provider == "gigachat":
            resp = await client.get(
                "https://gigachat.devices.sberbank.ru/api/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("data", []):
                model_id = m.get("id", "")
                models.append({"id": model_id, "name": _pretty_name(model_id), "provider": "gigachat"})
            return models

        elif provider == "yandexgpt":
            resp = await client.get(
                "https://llm.api.cloud.yandex.net/foundationModels/v1/models",
                headers={"Authorization": f"Api-Key {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("models", data.get("result", [])):
                model_id = m.get("uri", m.get("id", ""))
                name = m.get("name", model_id)
                models.append({"id": model_id, "name": name, "provider": "yandexgpt"})
            return models

        elif provider == "custom":
            base_url = get_base_url("custom")
            if not base_url:
                return []
            resp = await client.get(
                f"{base_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("data", []):
                model_id = m.get("id", "")
                models.append({"id": model_id, "name": model_id, "provider": "custom"})
            return models

    return []


FRIENDLY_NAMES: dict[str, str] = {
    # Anthropic
    "claude-haiku-4-5-20251001": "Claude 4.5 Haiku",
    "claude-sonnet-4-5-20250929": "Claude 4.5 Sonnet",
    "claude-sonnet-4-20250514": "Claude Sonnet 4",
    "claude-opus-4-1-20250805": "Claude Opus 4.1",
    "claude-opus-4-5-20251101": "Claude 4.5 Opus",
    "claude-opus-4-6": "Claude 4.6 Opus",
    "claude-sonnet-4-6": "Claude 4.6 Sonnet",
    # OpenAI
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
    "o1": "o1",
    "o1-mini": "o1 Mini",
    "o3": "o3",
    "o3-mini": "o3 Mini",
    # Mistral
    "mistral-small-latest": "Mistral Small",
    "mistral-large-latest": "Mistral Large",
    "mistral-medium-latest": "Mistral Medium",
}


def _pretty_name(model_id: str) -> str:
    """Convert model ID to a readable name."""
    if model_id in FRIENDLY_NAMES:
        return FRIENDLY_NAMES[model_id]
    # Auto-format: capitalize words, keep version numbers
    parts = model_id.replace("-", " ").replace("_", " ").split()
    result = []
    for p in parts:
        if p.isdigit() and len(p) == 8:
            continue  # Skip date stamps like 20250514
        result.append(p.capitalize() if len(p) > 2 else p.upper())
    return " ".join(result) if result else model_id


def clear_models_cache(provider: str | None = None):
    if provider:
        _models_cache.pop(provider, None)
    else:
        _models_cache.clear()
