"""Knowledge Base CRUD + file upload.

MVP version: a KB is a named bucket with a list of files stored inline as
JSONB `[{filename, text, size, uploaded_at}]`. When we're ready for vector
search this becomes a wrapper around KnowledgeChunk rows, but right now the
agent runner just concatenates the stored texts into the system prompt.
"""
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import KnowledgeBase

logger = structlog.get_logger()

router = APIRouter(prefix="/api/knowledge-bases", tags=["knowledge-bases"])


class KnowledgeBaseCreate(BaseModel):
    name: str
    description: str = ""
    project_id: str | None = None


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


def _serialize(kb: KnowledgeBase) -> dict[str, Any]:
    files = kb.files or []
    return {
        "id": str(kb.id),
        "name": kb.name,
        "description": kb.description,
        "project_id": str(kb.project_id) if kb.project_id else None,
        "files": files,
        "file_count": len(files),
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
    }


@router.get("")
async def list_knowledge_bases(
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())
    if project_id:
        query = query.where(KnowledgeBase.project_id == uuid.UUID(project_id))
    result = await db.execute(query)
    return [_serialize(kb) for kb in result.scalars().all()]


@router.post("")
async def create_knowledge_base(payload: KnowledgeBaseCreate, db: AsyncSession = Depends(get_db)):
    kb = KnowledgeBase(
        name=payload.name,
        description=payload.description,
        project_id=uuid.UUID(payload.project_id) if payload.project_id else None,
        files=[],
    )
    db.add(kb)
    await db.commit()
    return _serialize(kb)


@router.get("/{kb_id}")
async def get_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == uuid.UUID(kb_id)))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return _serialize(kb)


@router.put("/{kb_id}")
async def update_knowledge_base(
    kb_id: str, payload: KnowledgeBaseUpdate, db: AsyncSession = Depends(get_db)
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.execute(update(KnowledgeBase).where(KnowledgeBase.id == uuid.UUID(kb_id)).values(**data))
    await db.commit()
    return {"status": "updated"}


@router.delete("/{kb_id}")
async def delete_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(KnowledgeBase).where(KnowledgeBase.id == uuid.UUID(kb_id)))
    await db.commit()
    return {"status": "deleted"}


@router.post("/{kb_id}/upload")
async def upload_file_to_kb(
    kb_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a text file into a knowledge base.

    Reads the raw bytes, decodes as UTF-8 (falling back to latin-1 for odd
    encodings), and appends a file record to kb.files. No chunking yet —
    agents will inline the full text into their system prompt.
    """
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == uuid.UUID(kb_id)))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    entry = {
        "filename": file.filename or "unnamed",
        "size": len(raw),
        "text": text,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    existing_files = list(kb.files or [])
    existing_files.append(entry)

    await db.execute(
        update(KnowledgeBase)
        .where(KnowledgeBase.id == uuid.UUID(kb_id))
        .values(files=existing_files)
    )
    await db.commit()
    logger.info("kb_file_uploaded", kb_id=kb_id, filename=entry["filename"], size=entry["size"])
    return {"status": "uploaded", "file": {k: v for k, v in entry.items() if k != "text"}}


@router.delete("/{kb_id}/files/{filename}")
async def remove_file_from_kb(kb_id: str, filename: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == uuid.UUID(kb_id)))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    existing_files = [f for f in (kb.files or []) if f.get("filename") != filename]
    await db.execute(
        update(KnowledgeBase)
        .where(KnowledgeBase.id == uuid.UUID(kb_id))
        .values(files=existing_files)
    )
    await db.commit()
    return {"status": "removed"}
