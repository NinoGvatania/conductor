import uuid

import structlog
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from backend.database import get_supabase_client

logger = structlog.get_logger()
router = APIRouter(prefix="/api/files", tags=["files"])

BUCKET_NAME = "knowledge-base"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    agent_id: str = Form(default=""),
):
    """Upload a file for agent knowledge base."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    file_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "txt"
    storage_path = f"{agent_id or 'general'}/{file_id}.{ext}"

    client = get_supabase_client()

    try:
        # Upload to Supabase Storage
        client.storage.from_(BUCKET_NAME).upload(
            storage_path, content,
            {"content-type": file.content_type or "application/octet-stream"},
        )

        # Get public URL
        public_url = client.storage.from_(BUCKET_NAME).get_public_url(storage_path)

        return {
            "file_id": file_id,
            "filename": file.filename,
            "size": len(content),
            "url": public_url,
            "storage_path": storage_path,
        }
    except Exception as e:
        logger.error("file_upload_error", error=str(e))
        # Fallback: store content as text if storage fails
        text_content = ""
        try:
            text_content = content.decode("utf-8")[:50000]
        except UnicodeDecodeError:
            text_content = f"[Binary file: {file.filename}, {len(content)} bytes]"

        return {
            "file_id": file_id,
            "filename": file.filename,
            "size": len(content),
            "url": None,
            "text_content": text_content,
            "storage_error": str(e),
        }


@router.delete("/{file_path:path}")
async def delete_file(file_path: str):
    client = get_supabase_client()
    try:
        client.storage.from_(BUCKET_NAME).remove([file_path])
    except Exception as e:
        logger.warning("file_delete_error", error=str(e))
    return {"status": "deleted"}
