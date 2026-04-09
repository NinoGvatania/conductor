import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.database import get_supabase_client

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


@router.get("")
async def list_projects():
    client = get_supabase_client()
    result = client.table("projects").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("")
async def create_project(project: ProjectCreate):
    client = get_supabase_client()
    data = {"id": str(uuid.uuid4()), "name": project.name, "description": project.description}
    client.table("projects").insert(data).execute()
    return data


@router.get("/{project_id}")
async def get_project(project_id: str):
    client = get_supabase_client()
    result = client.table("projects").select("*").eq("id", project_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data


@router.put("/{project_id}")
async def update_project(project_id: str, update: ProjectUpdate):
    client = get_supabase_client()
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    client.table("projects").update(data).eq("id", project_id).execute()
    return {"status": "updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    client = get_supabase_client()
    client.table("projects").delete().eq("id", project_id).execute()
    return {"status": "deleted"}
