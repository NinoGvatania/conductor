import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import LLMProvider

router = APIRouter(prefix="/api/llm-providers", tags=["llm-providers"])

PROVIDER_CATALOG = [
    {"id": "anthropic", "name": "Anthropic", "description": "Claude models — best for reasoning", "models": [], "auth_type": "api_key", "auth_placeholder": "sk-ant-..."},
    {"id": "openai", "name": "OpenAI", "description": "GPT and o-series models", "models": [], "auth_type": "api_key", "auth_placeholder": "sk-..."},
    {"id": "gemini", "name": "Google Gemini", "description": "Gemini models", "models": [], "auth_type": "api_key", "auth_placeholder": "AIza..."},
    {"id": "yandexgpt", "name": "YandexGPT", "description": "Russian language optimized", "models": [], "auth_type": "api_key", "auth_placeholder": "AQVN..."},
    {"id": "gigachat", "name": "GigaChat", "description": "GigaChat from Sber", "models": [], "auth_type": "api_key", "auth_placeholder": "Bearer ..."},
    {"id": "mistral", "name": "Mistral", "description": "Mistral AI models", "models": [], "auth_type": "api_key", "auth_placeholder": "..."},
]


class ProviderConnect(BaseModel):
    provider: str
    api_key: str
    base_url: str = ""
    project_id: str | None = None


@router.get("/catalog")
async def get_catalog():
    return PROVIDER_CATALOG


@router.get("/{provider_name}/models")
async def get_provider_models(provider_name: str, refresh: bool = False):
    from backend.core.providers.model_fetcher import fetch_models
    return await fetch_models(provider_name, force_refresh=refresh)


@router.get("")
async def list_connected(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(LLMProvider)
    if project_id:
        query = query.where(LLMProvider.project_id == uuid.UUID(project_id))
    result = await db.execute(query)
    return [
        {
            "id": str(p.id),
            "provider": p.provider,
            "is_active": p.is_active,
            "base_url": p.base_url,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in result.scalars().all()
    ]


@router.post("/connect")
async def connect_provider(data: ProviderConnect, db: AsyncSession = Depends(get_db)):
    # Check existing
    query = select(LLMProvider).where(LLMProvider.provider == data.provider)
    if data.project_id:
        query = query.where(LLMProvider.project_id == uuid.UUID(data.project_id))
    result = await db.execute(query)
    existing = result.scalar_one_or_none()

    from backend.core.providers.key_store import clear_cache
    from backend.core.providers.model_fetcher import clear_models_cache

    if existing:
        existing.api_key = data.api_key
        existing.base_url = data.base_url
        existing.is_active = True
        status = "updated"
    else:
        p = LLMProvider(
            provider=data.provider,
            api_key=data.api_key,
            base_url=data.base_url,
            is_active=True,
            project_id=uuid.UUID(data.project_id) if data.project_id else None,
        )
        db.add(p)
        status = "connected"

    await db.commit()
    clear_cache()
    clear_models_cache(data.provider)
    return {"status": status, "provider": data.provider}


@router.post("/{provider_id}/disconnect")
async def disconnect_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    from backend.core.providers.key_store import clear_cache

    await db.execute(
        update(LLMProvider)
        .where(LLMProvider.id == uuid.UUID(provider_id))
        .values(is_active=False)
    )
    await db.commit()
    clear_cache()
    return {"status": "disconnected"}
