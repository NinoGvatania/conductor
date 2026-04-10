import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Connection, Tool

logger = structlog.get_logger()
router = APIRouter(prefix="/api/connections", tags=["connections"])


class ConnectionCreate(BaseModel):
    name: str
    description: str = ""
    base_url: str = ""
    auth_type: str = "api_key"
    credentials: dict[str, Any] = Field(default_factory=dict)
    project_id: str | None = None


class ConnectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    base_url: str | None = None
    auth_type: str | None = None
    credentials: dict[str, Any] | None = None


def _serialize(c: Connection, mask: bool = True) -> dict:
    creds = c.credentials or {}
    if mask:
        creds = {k: "***" for k in creds}
    return {
        "id": str(c.id),
        "name": c.name,
        "description": c.description,
        "base_url": c.base_url,
        "auth_type": c.auth_type,
        "credentials": creds,
        "has_credentials": bool(c.credentials),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("")
async def list_connections(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Connection).order_by(Connection.created_at.desc())
    if project_id:
        query = query.where(Connection.project_id == uuid.UUID(project_id))
    result = await db.execute(query)
    return [_serialize(c) for c in result.scalars().all()]


@router.post("")
async def create_connection(conn: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    c = Connection(
        name=conn.name,
        description=conn.description,
        base_url=conn.base_url,
        auth_type=conn.auth_type,
        credentials=conn.credentials,
        project_id=uuid.UUID(conn.project_id) if conn.project_id else None,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": str(c.id), "name": c.name}


@router.get("/{connection_id}")
async def get_connection(connection_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).where(Connection.id == uuid.UUID(connection_id)))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Connection not found")
    return _serialize(c)


@router.put("/{connection_id}")
async def update_connection(connection_id: str, payload: ConnectionUpdate, db: AsyncSession = Depends(get_db)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if data:
        await db.execute(update(Connection).where(Connection.id == uuid.UUID(connection_id)).values(**data))
        await db.commit()
    return {"status": "updated"}


@router.delete("/{connection_id}")
async def delete_connection(connection_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Connection).where(Connection.id == uuid.UUID(connection_id)))
    await db.commit()
    return {"status": "deleted"}


@router.get("/{connection_id}/tools")
async def list_connection_tools(connection_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tool).where(Tool.connection_id == uuid.UUID(connection_id))
    )
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "url": t.url,
            "method": t.method,
        }
        for t in result.scalars().all()
    ]
