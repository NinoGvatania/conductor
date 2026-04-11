import uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/api/files", tags=["files"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    agent_id: str = Form(default=""),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    file_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "txt"
    safe_filename = f"{file_id}.{ext}"
    workspace = agent_id or "general"

    storage_dir = Path(settings.STORAGE_DIR) / workspace
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / safe_filename

    try:
        file_path.write_bytes(content)

        text_content = ""
        try:
            text_content = content.decode("utf-8")
        except UnicodeDecodeError:
            text_content = f"[Binary file: {file.filename}, {len(content)} bytes]"

        return {
            "file_id": file_id,
            "filename": file.filename,
            "size": len(content),
            "url": f"/files/{workspace}/{safe_filename}",
            "storage_path": str(file_path),
            "text_content": text_content,
        }
    except Exception as e:
        logger.error("file_upload_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/{workspace}/{filename}")
async def delete_file(workspace: str, filename: str):
    path = Path(settings.STORAGE_DIR) / workspace / filename
    if path.exists():
        path.unlink()
    return {"status": "deleted"}
