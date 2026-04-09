import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import get_supabase_client

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


class ToolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    method: str | None = None
    headers: dict[str, Any] | None = None
    parameters: dict[str, Any] | None = None
    body_template: dict[str, Any] | None = None
    is_public: bool | None = None


@router.get("")
async def list_tools(project_id: str | None = None):
    client = get_supabase_client()
    query = client.table("tools").select("*").order("created_at", desc=True)
    if project_id:
        query = query.eq("project_id", project_id)
    result = query.execute()
    return result.data


@router.post("")
async def create_tool(tool: ToolCreate):
    client = get_supabase_client()
    tool_id = str(uuid.uuid4())
    data = {"id": tool_id, **tool.model_dump()}
    try:
        client.table("tools").insert(data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return data


@router.get("/{tool_id}")
async def get_tool(tool_id: str):
    client = get_supabase_client()
    result = client.table("tools").select("*").eq("id", tool_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tool not found")
    return result.data


@router.put("/{tool_id}")
async def update_tool(tool_id: str, update: ToolUpdate):
    client = get_supabase_client()
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    client.table("tools").update(data).eq("id", tool_id).execute()
    return {"status": "updated"}


@router.delete("/{tool_id}")
async def delete_tool(tool_id: str):
    client = get_supabase_client()
    client.table("tools").delete().eq("id", tool_id).execute()
    return {"status": "deleted"}
