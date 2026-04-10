"""Fetch available models from LLM provider APIs dynamically."""
import structlog
import httpx

from backend.core.providers.key_store import get_api_key, get_base_url

logger = structlog.get_logger()

_models_cache: dict[str, list[dict]] = {}


async def fetch_models(provider: str) -> list[dict[str, str]]:
    """Fetch available models from a provider's API. Returns list of {id, name}."""
    if provider in _models_cache:
        return _models_cache[provider]

    api_key = get_api_key(provider)
    if not api_key:
        return []

    try:
        models = await _fetch_from_provider(provider, api_key)
        if models:
            _models_cache[provider] = models
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


def _pretty_name(model_id: str) -> str:
    """Convert model ID to a readable name."""
    name = model_id
    name = name.replace("-", " ").replace("_", " ")
    # Capitalize parts
    parts = name.split()
    return " ".join(p.capitalize() if len(p) > 2 else p.upper() for p in parts)


def clear_models_cache(provider: str | None = None):
    if provider:
        _models_cache.pop(provider, None)
    else:
        _models_cache.clear()
