import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.contracts.workflow import WorkflowDefinition
from backend.database import get_db
from backend.models import Workflow

logger = structlog.get_logger()

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


def _serialize(w: Workflow) -> dict:
    return {
        "id": str(w.id),
        "name": w.name,
        "version": w.version,
        "definition_json": w.definition_json,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


@router.get("/library")
async def get_workflow_library():
    from backend.templates.workflow_library import WORKFLOW_TEMPLATES
    return WORKFLOW_TEMPLATES


@router.get("")
async def list_workflows(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow).order_by(Workflow.created_at.desc()))
    return [_serialize(w) for w in result.scalars().all()]


@router.post("")
async def create_workflow(workflow: WorkflowDefinition, db: AsyncSession = Depends(get_db)):
    w = Workflow(
        name=workflow.name,
        version=workflow.version,
        definition_json=workflow.model_dump_json(),
    )
    db.add(w)
    await db.commit()
    await db.refresh(w)
    return {"id": str(w.id), "name": w.name, "status": "created"}


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow).where(Workflow.id == uuid.UUID(workflow_id)))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _serialize(w)


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, workflow: WorkflowDefinition, db: AsyncSession = Depends(get_db)):
    await db.execute(update(Workflow).where(Workflow.id == uuid.UUID(workflow_id)).values(
        name=workflow.name,
        version=workflow.version,
        definition_json=workflow.model_dump_json(),
    ))
    await db.commit()
    return {"status": "updated"}


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Workflow).where(Workflow.id == uuid.UUID(workflow_id)))
    await db.commit()
    return {"status": "deleted"}


@router.post("/{workflow_id}/run")
async def start_run(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workflow).where(Workflow.id == uuid.UUID(workflow_id)))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = WorkflowDefinition.model_validate_json(w.definition_json)

    from backend.core.engine.orchestrator import OrchestrationEngine
    engine = OrchestrationEngine()
    try:
        run_state = await engine.start(workflow, input_data={}, run_id=str(uuid.uuid4()))
        return run_state.model_dump()
    except Exception as e:
        logger.error("workflow_run_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Run failed: {e}") from e
