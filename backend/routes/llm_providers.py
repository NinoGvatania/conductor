import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.database import get_supabase_client

router = APIRouter(prefix="/api/llm-providers", tags=["llm-providers"])

# All supported providers with their models
PROVIDER_CATALOG = [
    {
        "id": "anthropic",
        "name": "Anthropic",
        "description": "Claude models — best for reasoning and analysis",
        "models": [
            {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku", "tier": "fast"},
            {"id": "claude-sonnet-4-6", "name": "Claude Sonnet", "tier": "balanced"},
            {"id": "claude-opus-4-6", "name": "Claude Opus", "tier": "powerful"},
        ],
        "auth_type": "api_key",
        "auth_placeholder": "sk-ant-...",
    },
    {
        "id": "openai",
        "name": "OpenAI",
        "description": "GPT and o-series models",
        "models": [
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "tier": "fast"},
            {"id": "gpt-4o", "name": "GPT-4o", "tier": "balanced"},
            {"id": "o3", "name": "o3", "tier": "powerful"},
        ],
        "auth_type": "api_key",
        "auth_placeholder": "sk-...",
    },
    {
        "id": "gemini",
        "name": "Google Gemini",
        "description": "Gemini models from Google",
        "models": [
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "tier": "fast"},
            {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "tier": "balanced"},
        ],
        "auth_type": "api_key",
        "auth_placeholder": "AIza...",
    },
    {
        "id": "yandexgpt",
        "name": "YandexGPT",
        "description": "YandexGPT models — Russian language optimized",
        "models": [
            {"id": "yandexgpt-lite", "name": "YandexGPT Lite", "tier": "fast"},
            {"id": "yandexgpt", "name": "YandexGPT", "tier": "balanced"},
        ],
        "auth_type": "api_key",
        "auth_placeholder": "AQVN...",
    },
    {
        "id": "gigachat",
        "name": "GigaChat",
        "description": "GigaChat from Sber — Russian language",
        "models": [
            {"id": "gigachat-lite", "name": "GigaChat Lite", "tier": "fast"},
            {"id": "gigachat-pro", "name": "GigaChat Pro", "tier": "balanced"},
        ],
        "auth_type": "api_key",
        "auth_placeholder": "Bearer ...",
    },
    {
        "id": "mistral",
        "name": "Mistral",
        "description": "Mistral AI models — fast and efficient",
        "models": [
            {"id": "mistral-small-latest", "name": "Mistral Small", "tier": "fast"},
            {"id": "mistral-large-latest", "name": "Mistral Large", "tier": "balanced"},
        ],
        "auth_type": "api_key",
        "auth_placeholder": "...",
    },
    {
        "id": "custom",
        "name": "Custom (OpenAI-compatible)",
        "description": "Any OpenAI-compatible API endpoint",
        "models": [],
        "auth_type": "api_key_and_url",
        "auth_placeholder": "sk-...",
    },
]


class ProviderConnect(BaseModel):
    provider: str
    api_key: str
    base_url: str = ""
    project_id: str | None = None


@router.get("/catalog")
async def get_catalog():
    return PROVIDER_CATALOG


@router.get("")
async def list_connected(project_id: str | None = None):
    client = get_supabase_client()
    query = client.table("llm_providers").select("id, provider, is_active, base_url, created_at")
    if project_id:
        query = query.eq("project_id", project_id)
    result = query.execute()
    return result.data


@router.post("/connect")
async def connect_provider(data: ProviderConnect):
    client = get_supabase_client()
    # Check if already exists
    existing = client.table("llm_providers").select("id").eq("provider", data.provider)
    if data.project_id:
        existing = existing.eq("project_id", data.project_id)
    existing = existing.execute()

    row: dict[str, Any] = {
        "provider": data.provider,
        "api_key": data.api_key,
        "base_url": data.base_url,
        "is_active": True,
    }
    if data.project_id:
        row["project_id"] = data.project_id

    if existing.data:
        client.table("llm_providers").update(row).eq("id", existing.data[0]["id"]).execute()
        return {"status": "updated", "provider": data.provider}
    else:
        row["id"] = str(uuid.uuid4())
        client.table("llm_providers").insert(row).execute()
        return {"status": "connected", "provider": data.provider}


@router.post("/{provider_id}/disconnect")
async def disconnect_provider(provider_id: str):
    client = get_supabase_client()
    client.table("llm_providers").update({"is_active": False}).eq("id", provider_id).execute()
    return {"status": "disconnected"}
