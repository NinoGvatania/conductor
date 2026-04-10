import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter
from backend.database import get_db
from backend.models import Tool

logger = structlog.get_logger()
router = APIRouter(prefix="/api/tools", tags=["tools"])


class ToolCreate(BaseModel):
    name: str
    description: str = ""
    url: str = ""
    method: str = "POST"
    headers: dict[str, Any] = Field(default_factory=dict)
    parameters: dict[str, Any] = Field(default_factory=dict)
    body_template: dict[str, Any] = Field(default_factory=dict)
    is_public: bool = False
    project_id: str | None = None
    connection_id: str | None = None


class ToolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    method: str | None = None
    headers: dict[str, Any] | None = None
    parameters: dict[str, Any] | None = None
    body_template: dict[str, Any] | None = None
    is_public: bool | None = None


class ToolWizardRequest(BaseModel):
    api_docs: str
    description: str = ""


def _serialize(t: Tool) -> dict:
    return {
        "id": str(t.id),
        "project_id": str(t.project_id) if t.project_id else None,
        "connection_id": str(t.connection_id) if t.connection_id else None,
        "name": t.name,
        "description": t.description,
        "url": t.url,
        "method": t.method,
        "headers": t.headers,
        "parameters": t.parameters,
        "body_template": t.body_template,
        "is_public": t.is_public,
    }


WIZARD_PROMPT = """You are an API tool configuration generator. Output JSON with app_name, base_url, credential_keys, and tools array.

Max 5-8 tools. Each tool: name (snake_case), description, url, method, headers, parameters schema.
Use {api_key}, {token}, {username} placeholders for secrets.

Schema:
{
  "app_name": "string",
  "description": "string",
  "base_url": "https://api.example.com",
  "auth_type": "api_key|bearer|basic|none",
  "credential_keys": ["api_key"],
  "tools": [{"name": "...", "description": "...", "url": "...", "method": "GET|POST|PUT|DELETE", "headers": {}, "parameters": {"type":"object","properties":{}}}]
}

Output ONLY valid JSON, no markdown."""


@router.post("/wizard")
async def tool_wizard(request: ToolWizardRequest):
    provider = AnthropicProvider()
    model_router = ModelRouter()

    llm_request = LLMRequest(
        model=model_router.resolve("balanced"),
        system_prompt=WIZARD_PROMPT,
        messages=[{"role": "user", "content": f"Generate tool configs from:\n\n{request.api_docs[:5000]}\n\n{f'Focus: {request.description}' if request.description else ''}"}],
        temperature=0.0,
        max_tokens=8192,
    )

    content = ""
    try:
        response = await provider.complete(llm_request)
        content = response.content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            content = content[start:end + 1]
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            last = content.rfind("},")
            if last > 0:
                content = content[:last + 1] + "]}"
                parsed = json.loads(content)
            else:
                raise
        if isinstance(parsed, list):
            parsed = {"app_name": "Custom", "tools": parsed, "credential_keys": ["api_key"], "base_url": "", "auth_type": "api_key"}
        return {
            "app_name": parsed.get("app_name", "Integration"),
            "description": parsed.get("description", ""),
            "base_url": parsed.get("base_url", ""),
            "auth_type": parsed.get("auth_type", "api_key"),
            "credential_keys": parsed.get("credential_keys", ["api_key"]),
            "tools": parsed.get("tools", []),
            "count": len(parsed.get("tools", [])),
        }
    except Exception as e:
        logger.error("wizard_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("")
async def list_tools(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Tool).order_by(Tool.created_at.desc())
    if project_id:
        query = query.where(Tool.project_id == uuid.UUID(project_id))
    result = await db.execute(query)
    return [_serialize(t) for t in result.scalars().all()]


@router.post("")
async def create_tool(tool: ToolCreate, db: AsyncSession = Depends(get_db)):
    t = Tool(
        name=tool.name,
        description=tool.description,
        url=tool.url,
        method=tool.method,
        headers=tool.headers,
        parameters=tool.parameters,
        body_template=tool.body_template,
        is_public=tool.is_public,
        project_id=uuid.UUID(tool.project_id) if tool.project_id else None,
        connection_id=uuid.UUID(tool.connection_id) if tool.connection_id else None,
    )
    db.add(t)
    await db.commit()
    return _serialize(t)


@router.get("/{tool_id}")
async def get_tool(tool_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tool).where(Tool.id == uuid.UUID(tool_id)))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tool not found")
    return _serialize(t)


@router.put("/{tool_id}")
async def update_tool(tool_id: str, payload: ToolUpdate, db: AsyncSession = Depends(get_db)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if data:
        await db.execute(update(Tool).where(Tool.id == uuid.UUID(tool_id)).values(**data))
        await db.commit()
    return {"status": "updated"}


@router.delete("/{tool_id}")
async def delete_tool(tool_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Tool).where(Tool.id == uuid.UUID(tool_id)))
    await db.commit()
    return {"status": "deleted"}
