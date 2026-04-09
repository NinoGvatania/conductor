from fastapi import APIRouter, HTTPException

from backend.core.contracts.run import RunState
from backend.database import get_supabase_client

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("")
async def list_runs(status: str | None = None):
    client = get_supabase_client()
    query = client.table("runs").select("id, workflow_id, status, total_cost_usd, total_tokens, total_steps, created_at")
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.get("/{run_id}")
async def get_run(run_id: str):
    client = get_supabase_client()
    result = (
        client.table("runs")
        .select("state_json")
        .eq("id", run_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found")
    run_state = RunState.model_validate_json(result.data["state_json"])
    return run_state.model_dump()
