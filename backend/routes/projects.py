import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Project, ProjectMember

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class MemberInvite(BaseModel):
    email: str
    role: str = "member"


def _serialize(p: Project) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return [_serialize(p) for p in result.scalars().all()]


@router.post("")
async def create_project(project: ProjectCreate, db: AsyncSession = Depends(get_db)):
    p = Project(name=project.name, description=project.description)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _serialize(p)


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == uuid.UUID(project_id)))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return _serialize(p)


@router.put("/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if data:
        await db.execute(update(Project).where(Project.id == uuid.UUID(project_id)).values(**data))
        await db.commit()
    return {"status": "updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Project).where(Project.id == uuid.UUID(project_id)))
    await db.commit()
    return {"status": "deleted"}


@router.get("/{project_id}/members")
async def list_members(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == uuid.UUID(project_id))
    )
    return [
        {
            "id": str(m.id),
            "email": m.email,
            "role": m.role,
            "accepted": m.accepted,
            "invited_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in result.scalars().all()
    ]


@router.post("/{project_id}/members")
async def invite_member(project_id: str, invite: MemberInvite, db: AsyncSession = Depends(get_db)):
    if invite.role not in ("admin", "member", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    m = ProjectMember(
        project_id=uuid.UUID(project_id),
        email=invite.email,
        role=invite.role,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return {"id": str(m.id), "email": m.email, "role": m.role}


@router.put("/{project_id}/members/{member_id}")
async def update_member_role(project_id: str, member_id: str, invite: MemberInvite, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(ProjectMember).where(ProjectMember.id == uuid.UUID(member_id)).values(role=invite.role)
    )
    await db.commit()
    return {"status": "updated"}


@router.delete("/{project_id}/members/{member_id}")
async def remove_member(project_id: str, member_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ProjectMember).where(ProjectMember.id == uuid.UUID(member_id)))
    await db.commit()
    return {"status": "removed"}
