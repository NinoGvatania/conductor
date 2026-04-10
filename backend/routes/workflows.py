import uuid

import structlog
from fastapi import APIRouter, HTTPException

from backend.core.contracts.workflow import WorkflowDefinition
from backend.database import get_supabase_client

logger = structlog.get_logger()

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("")
async def list_workflows():
    try:
        client = get_supabase_client()
        result = client.table("workflows").select("*").order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.warning("workflows_list_error", error=str(e))
        return []


@router.post("")
async def create_workflow(workflow: WorkflowDefinition):
    client = get_supabase_client()
    workflow_id = str(uuid.uuid4())
    data = {
        "id": workflow_id,
        "name": workflow.name,
        "version": workflow.version,
        "definition_json": workflow.model_dump_json(),
    }
    try:
        client.table("workflows").insert(data).execute()
    except Exception as e:
        logger.error("workflow_create_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to save workflow: {e}") from e
    return {"id": workflow_id, "name": workflow.name, "status": "created"}


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    client = get_supabase_client()
    try:
        result = client.table("workflows").select("*").eq("id", workflow_id).single().execute()
    except Exception as e:
        raise HTTPException(status_code=404, detail="Workflow not found") from e
    return result.data


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, workflow: WorkflowDefinition):
    client = get_supabase_client()
    data = {
        "name": workflow.name,
        "version": workflow.version,
        "definition_json": workflow.model_dump_json(),
    }
    try:
        client.table("workflows").update(data).eq("id", workflow_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"id": workflow_id, "status": "updated"}


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str):
    client = get_supabase_client()
    try:
        client.table("workflows").delete().eq("id", workflow_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"id": workflow_id, "status": "deleted"}


@router.post("/{workflow_id}/run")
async def start_run(workflow_id: str):
    client = get_supabase_client()
    try:
        result = (
            client.table("workflows")
            .select("definition_json")
            .eq("id", workflow_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail="Workflow not found") from e

    if not result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = WorkflowDefinition.model_validate_json(result.data["definition_json"])

    from backend.core.engine.orchestrator import OrchestrationEngine
    engine = OrchestrationEngine()
    run_id = str(uuid.uuid4())
    try:
        run_state = await engine.start(workflow, input_data={}, run_id=run_id)
        return run_state.model_dump()
    except Exception as e:
        logger.error("workflow_run_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Run failed: {e}") from e
