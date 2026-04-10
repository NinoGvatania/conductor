import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import get_supabase_client

logger = structlog.get_logger()

router = APIRouter(prefix="/api/connections", tags=["connections"])


class ConnectionCreate(BaseModel):
    name: str
    description: str = ""
    base_url: str = ""
    auth_type: str = "api_key"  # api_key, bearer, basic, oauth
    credentials: dict[str, Any] = Field(default_factory=dict)
    project_id: str | None = None


class ConnectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    base_url: str | None = None
    auth_type: str | None = None
    credentials: dict[str, Any] | None = None


@router.get("")
async def list_connections(project_id: str | None = None):
    client = get_supabase_client()
    query = client.table("connections").select("*").order("created_at", desc=True)
    if project_id:
        query = query.eq("project_id", project_id)
    try:
        result = query.execute()
        # Don't return raw credentials in list view
        for c in result.data:
            if c.get("credentials"):
                c["has_credentials"] = bool(c["credentials"])
                c["credentials"] = {k: "***" for k in c.get("credentials", {})}
        return result.data
    except Exception as e:
        logger.warning("connections_list_error", error=str(e))
        return []


@router.post("")
async def create_connection(conn: ConnectionCreate):
    client = get_supabase_client()
    conn_id = str(uuid.uuid4())
    data = {"id": conn_id, **conn.model_dump()}
    try:
        client.table("connections").insert(data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"id": conn_id, "name": conn.name}


@router.get("/{connection_id}")
async def get_connection(connection_id: str):
    client = get_supabase_client()
    result = client.table("connections").select("*").eq("id", connection_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Connection not found")
    # Mask credentials
    if result.data.get("credentials"):
        result.data["credentials"] = {k: "***" for k in result.data["credentials"]}
    return result.data


@router.put("/{connection_id}")
async def update_connection(connection_id: str, update: ConnectionUpdate):
    client = get_supabase_client()
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    try:
        client.table("connections").update(data).eq("id", connection_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"status": "updated"}


@router.delete("/{connection_id}")
async def delete_connection(connection_id: str):
    client = get_supabase_client()
    client.table("connections").delete().eq("id", connection_id).execute()
    return {"status": "deleted"}


@router.get("/{connection_id}/tools")
async def list_connection_tools(connection_id: str):
    client = get_supabase_client()
    result = client.table("tools").select("*").eq("connection_id", connection_id).execute()
    return result.data
