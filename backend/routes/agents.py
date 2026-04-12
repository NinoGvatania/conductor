import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.agents.builtin.classifier import CLASSIFIER_AGENT
from backend.core.agents.builtin.decision_maker import DECISION_MAKER_AGENT
from backend.core.agents.builtin.draft_writer import DRAFT_WRITER_AGENT
from backend.core.agents.builtin.extractor import EXTRACTOR_AGENT
from backend.core.agents.builtin.risk_scorer import RISK_SCORER_AGENT
from backend.core.agents.builtin.validator import VALIDATOR_AGENT
from backend.core.providers.model_router import ModelRouter
from backend.database import get_db
from backend.models import AgentConfig, Tool

logger = structlog.get_logger()

router = APIRouter(prefix="/api/agents", tags=["agents"])

BUILTIN_AGENTS: dict[str, dict] = {
    "classifier": CLASSIFIER_AGENT,
    "extractor": EXTRACTOR_AGENT,
    "validator": VALIDATOR_AGENT,
    "risk_scorer": RISK_SCORER_AGENT,
    "decision_maker": DECISION_MAKER_AGENT,
    "draft_writer": DRAFT_WRITER_AGENT,
}


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    purpose: str = ""
    model_tier: str = "balanced"
    model: str | None = None
    provider: str = "anthropic"
    system_prompt: str = ""
    constraints: str = ""
    clarification_rules: str = ""
    output_schema: dict[str, Any] = Field(default_factory=dict)
    temperature: float = 0.0
    timeout_seconds: int = 120
    max_retries: int = 3
    max_tokens: int | None = None
    tools: list[dict[str, Any]] = Field(default_factory=list)
    knowledge_bases: list[dict[str, Any]] = Field(default_factory=list)
    is_public: bool = False
    tags: list[str] = Field(default_factory=list)
    project_id: str | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    purpose: str | None = None
    model_tier: str | None = None
    model: str | None = None
    provider: str | None = None
    system_prompt: str | None = None
    constraints: str | None = None
    clarification_rules: str | None = None
    output_schema: dict[str, Any] | None = None
    temperature: float | None = None
    timeout_seconds: int | None = None
    max_retries: int | None = None
    max_tokens: int | None = None
    tools: list[dict[str, Any]] | None = None
    knowledge_bases: list[dict[str, Any]] | None = None
    is_public: bool | None = None
    tags: list[str] | None = None


def _serialize(a: AgentConfig) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "description": a.description,
        "purpose": a.purpose,
        "model_tier": a.model_tier,
        "model": a.model,
        "provider": a.provider,
        "system_prompt": a.system_prompt,
        "constraints": a.constraints or "",
        "clarification_rules": a.clarification_rules or "",
        "output_schema": a.output_schema,
        "temperature": a.temperature,
        "timeout_seconds": a.timeout_seconds,
        "max_retries": a.max_retries,
        "max_tokens": a.max_tokens,
        "tools": a.tools,
        "knowledge_bases": a.knowledge_bases,
        "is_public": a.is_public,
        "tags": a.tags,
        "is_builtin": False,
        "status": a.status,
    }


@router.get("/providers")
async def list_providers():
    return ModelRouter.list_providers()


@router.get("")
async def list_agents(include_builtin: bool = False, project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    agents = []
    if include_builtin:
        for a in BUILTIN_AGENTS.values():
            agents.append({
                **a,
                "id": f"builtin_{a['name']}",
                "is_builtin": True,
                "is_public": True,
                "provider": "anthropic",
                "tools": [],
                "knowledge_bases": [],
                "tags": ["builtin"],
            })
    try:
        query = select(AgentConfig).order_by(AgentConfig.created_at.desc())
        if project_id:
            query = query.where(AgentConfig.project_id == uuid.UUID(project_id))
        query = query.where(or_(AgentConfig.status == "active", AgentConfig.status.is_(None)))
        result = await db.execute(query)
        for a in result.scalars().all():
            agents.append(_serialize(a))
    except Exception as e:
        logger.warning("agents_list_error", error=str(e))
    return agents


@router.post("")
async def create_agent(agent: AgentCreate, db: AsyncSession = Depends(get_db)):
    a = AgentConfig(
        name=agent.name,
        description=agent.description,
        purpose=agent.purpose,
        model_tier=agent.model_tier,
        model=agent.model,
        provider=agent.provider,
        system_prompt=agent.system_prompt,
        constraints=agent.constraints,
        clarification_rules=agent.clarification_rules,
        output_schema=agent.output_schema,
        temperature=agent.temperature,
        timeout_seconds=agent.timeout_seconds,
        max_retries=agent.max_retries,
        max_tokens=agent.max_tokens,
        tools=agent.tools,
        knowledge_bases=agent.knowledge_bases,
        is_public=agent.is_public,
        tags=agent.tags,
        project_id=uuid.UUID(agent.project_id) if agent.project_id else None,
    )
    db.add(a)
    await db.commit()
    return _serialize(a)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    if agent_id.startswith("builtin_"):
        name = agent_id.replace("builtin_", "")
        agent = BUILTIN_AGENTS.get(name)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        return {**agent, "id": agent_id, "is_builtin": True, "provider": "anthropic", "tools": [], "knowledge_bases": []}

    if agent_id in BUILTIN_AGENTS:
        agent = BUILTIN_AGENTS[agent_id]
        return {**agent, "id": f"builtin_{agent_id}", "is_builtin": True, "provider": "anthropic", "tools": [], "knowledge_bases": []}

    result = await db.execute(select(AgentConfig).where(AgentConfig.id == uuid.UUID(agent_id)))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Agent not found")

    data = _serialize(a)
    # Resolve tool references against library
    fresh_tools = []
    for t in data["tools"] or []:
        name = t.get("name") if isinstance(t, dict) else None
        if name:
            tr = await db.execute(select(Tool).where(Tool.name == name))
            tool = tr.scalar_one_or_none()
            if tool:
                fresh_tools.append({
                    "id": str(tool.id),
                    "name": tool.name,
                    "description": tool.description,
                    "url": tool.url,
                    "method": tool.method,
                })
    data["tools"] = fresh_tools
    return data


@router.put("/{agent_id}")
async def update_agent(agent_id: str, payload: AgentUpdate, db: AsyncSession = Depends(get_db)):
    if agent_id.startswith("builtin_"):
        raise HTTPException(status_code=400, detail="Cannot edit built-in agents")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Clean tool references
    if "tools" in data and isinstance(data["tools"], list):
        clean = []
        for t in data["tools"]:
            if isinstance(t, dict) and t.get("name"):
                tr = await db.execute(select(Tool).where(Tool.name == t["name"]))
                if tr.scalar_one_or_none():
                    clean.append({"name": t["name"], "description": t.get("description", "")})
        data["tools"] = clean

    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.execute(update(AgentConfig).where(AgentConfig.id == uuid.UUID(agent_id)).values(**data))
    await db.commit()
    return {"status": "updated"}


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    if agent_id.startswith("builtin_"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in agents")
    await db.execute(delete(AgentConfig).where(AgentConfig.id == uuid.UUID(agent_id)))
    await db.commit()
    return {"status": "deleted"}


@router.post("/{agent_id}/clone")
async def clone_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    source = await get_agent(agent_id, db)
    new = AgentConfig(
        name=f"{source.get('name', 'Agent')} (copy)",
        description=source.get("description", ""),
        purpose=source.get("purpose", ""),
        model_tier=source.get("model_tier", "balanced"),
        provider=source.get("provider", "anthropic"),
        system_prompt=source.get("system_prompt", ""),
        output_schema=source.get("output_schema", {}),
        tools=source.get("tools", []),
        knowledge_bases=source.get("knowledge_bases", []),
    )
    db.add(new)
    await db.commit()
    return {"id": str(new.id), "name": new.name}


@router.post("/{agent_id}/share")
async def share_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    if agent_id.startswith("builtin_"):
        raise HTTPException(status_code=400, detail="Built-in agents are always public")
    await db.execute(update(AgentConfig).where(AgentConfig.id == uuid.UUID(agent_id)).values(is_public=True))
    await db.commit()
    return {"status": "shared"}
