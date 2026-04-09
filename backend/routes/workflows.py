import uuid

from fastapi import APIRouter, HTTPException

from backend.core.contracts.workflow import WorkflowDefinition
from backend.core.engine.orchestrator import OrchestrationEngine
from backend.database import get_supabase_client

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("")
async def list_workflows():
    client = get_supabase_client()
    result = client.table("workflows").select("*").execute()
    return result.data


@router.post("")
async def create_workflow(workflow: WorkflowDefinition):
    client = get_supabase_client()
    data = {
        "id": workflow.id,
        "name": workflow.name,
        "version": workflow.version,
        "definition_json": workflow.model_dump_json(),
    }
    result = client.table("workflows").insert(data).execute()
    return result.data


@router.post("/{workflow_id}/run")
async def start_run(workflow_id: str):
    client = get_supabase_client()
    result = (
        client.table("workflows")
        .select("definition_json")
        .eq("id", workflow_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = WorkflowDefinition.model_validate_json(result.data["definition_json"])
    engine = OrchestrationEngine()
    run_id = str(uuid.uuid4())
    run_state = await engine.start(workflow, input_data={}, run_id=run_id)
    return run_state.model_dump()
