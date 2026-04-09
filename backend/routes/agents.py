import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core.agents.builtin.classifier import CLASSIFIER_AGENT
from backend.core.agents.builtin.decision_maker import DECISION_MAKER_AGENT
from backend.core.agents.builtin.draft_writer import DRAFT_WRITER_AGENT
from backend.core.agents.builtin.extractor import EXTRACTOR_AGENT
from backend.core.agents.builtin.risk_scorer import RISK_SCORER_AGENT
from backend.core.agents.builtin.validator import VALIDATOR_AGENT
from backend.core.providers.model_router import ModelRouter
from backend.database import get_supabase_client

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
    provider: str = "anthropic"
    system_prompt: str = ""
    output_schema: dict[str, Any] = Field(default_factory=dict)
    temperature: float = 0.0
    timeout_seconds: int = 120
    max_retries: int = 3
    max_tokens: int = 4096
    tools: list[dict[str, Any]] = Field(default_factory=list)
    knowledge_bases: list[dict[str, Any]] = Field(default_factory=list)
    is_public: bool = False
    tags: list[str] = Field(default_factory=list)


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    purpose: str | None = None
    model_tier: str | None = None
    provider: str | None = None
    system_prompt: str | None = None
    output_schema: dict[str, Any] | None = None
    temperature: float | None = None
    timeout_seconds: int | None = None
    max_retries: int | None = None
    max_tokens: int | None = None
    tools: list[dict[str, Any]] | None = None
    knowledge_bases: list[dict[str, Any]] | None = None
    is_public: bool | None = None
    tags: list[str] | None = None


@router.get("")
async def list_agents(include_builtin: bool = True):
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
        client = get_supabase_client()
        result = client.table("agents").select("*").execute()
        for row in result.data:
            agents.append({
                "id": row["id"],
                "name": row["name"],
                "description": row.get("description", ""),
                "purpose": row.get("purpose", ""),
                "model_tier": row.get("model_tier", "balanced"),
                "provider": row.get("provider", "anthropic"),
                "system_prompt": row.get("system_prompt", ""),
                "output_schema": row.get("output_schema", {}),
                "temperature": row.get("temperature", 0.0),
                "timeout_seconds": row.get("timeout_seconds", 120),
                "max_retries": row.get("max_retries", 3),
                "max_tokens": row.get("max_tokens", 4096),
                "tools": row.get("tools", []),
                "knowledge_bases": row.get("knowledge_bases", []),
                "is_builtin": False,
                "is_public": row.get("is_public", False),
                "tags": row.get("tags", []),
                "status": row.get("status", "active"),
            })
    except Exception:
        pass
    return agents


@router.get("/providers")
async def list_providers():
    return ModelRouter.list_providers()


@router.post("")
async def create_agent(agent: AgentCreate):
    client = get_supabase_client()
    agent_id = str(uuid.uuid4())
    data = {
        "id": agent_id,
        "name": agent.name,
        "description": agent.description,
        "purpose": agent.purpose,
        "model_tier": agent.model_tier,
        "provider": agent.provider,
        "system_prompt": agent.system_prompt,
        "output_schema": agent.output_schema,
        "config": {
            "temperature": agent.temperature,
            "timeout_seconds": agent.timeout_seconds,
            "max_retries": agent.max_retries,
            "max_tokens": agent.max_tokens,
            "tools": agent.tools,
            "knowledge_bases": agent.knowledge_bases,
            "tags": agent.tags,
        },
        "is_public": agent.is_public,
        "status": "active",
    }
    result = client.table("agents").insert(data).execute()
    return {"id": agent_id, **agent.model_dump()}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    if agent_id.startswith("builtin_"):
        name = agent_id.replace("builtin_", "")
        agent = BUILTIN_AGENTS.get(name)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
        return {**agent, "id": agent_id, "is_builtin": True, "provider": "anthropic", "tools": [], "knowledge_bases": []}
    # Also check by name for backward compatibility
    if agent_id in BUILTIN_AGENTS:
        agent = BUILTIN_AGENTS[agent_id]
        return {**agent, "id": f"builtin_{agent_id}", "is_builtin": True, "provider": "anthropic", "tools": [], "knowledge_bases": []}
    client = get_supabase_client()
    result = client.table("agents").select("*").eq("id", agent_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result.data


@router.put("/{agent_id}")
async def update_agent(agent_id: str, update: AgentUpdate):
    if agent_id.startswith("builtin_"):
        raise HTTPException(status_code=400, detail="Cannot edit built-in agents")
    client = get_supabase_client()
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = client.table("agents").update(data).eq("id", agent_id).execute()
    return {"status": "updated", "id": agent_id}


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    if agent_id.startswith("builtin_"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in agents")
    client = get_supabase_client()
    client.table("agents").delete().eq("id", agent_id).execute()
    return {"status": "deleted", "id": agent_id}


@router.post("/{agent_id}/share")
async def share_agent(agent_id: str):
    if agent_id.startswith("builtin_"):
        raise HTTPException(status_code=400, detail="Built-in agents are already public")
    client = get_supabase_client()
    client.table("agents").update({"is_public": True}).eq("id", agent_id).execute()
    return {"status": "shared", "id": agent_id}


@router.post("/{agent_id}/clone")
async def clone_agent(agent_id: str):
    """Clone a public agent to create your own copy."""
    source = await get_agent(agent_id)
    new_id = str(uuid.uuid4())
    client = get_supabase_client()
    data = {
        "id": new_id,
        "name": f"{source.get('name', 'Agent')} (copy)",
        "description": source.get("description", ""),
        "purpose": source.get("purpose", ""),
        "model_tier": source.get("model_tier", "balanced"),
        "provider": source.get("provider", "anthropic"),
        "system_prompt": source.get("system_prompt", ""),
        "output_schema": source.get("output_schema", {}),
        "config": {
            "temperature": source.get("temperature", 0.0),
            "tools": source.get("tools", []),
            "knowledge_bases": source.get("knowledge_bases", []),
        },
        "is_public": False,
        "status": "active",
    }
    client.table("agents").insert(data).execute()
    return {"id": new_id, "name": data["name"]}
