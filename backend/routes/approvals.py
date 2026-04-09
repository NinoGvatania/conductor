from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.engine.orchestrator import OrchestrationEngine
from backend.database import get_supabase_client

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


class ApprovalDecision(BaseModel):
    decision: str  # "approve" or "reject"
    comment: str = ""


@router.get("")
async def list_pending_approvals():
    client = get_supabase_client()
    result = (
        client.table("runs")
        .select("id, workflow_id, state_json, created_at")
        .eq("status", "paused")
        .execute()
    )
    approvals = []
    for row in result.data:
        approvals.append({
            "run_id": row["id"],
            "workflow_id": row["workflow_id"],
            "created_at": row.get("created_at"),
        })
    return approvals


@router.post("/{run_id}/resolve")
async def resolve_approval(run_id: str, decision: ApprovalDecision):
    if decision.decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Decision must be 'approve' or 'reject'")
    engine = OrchestrationEngine()
    try:
        run_state = await engine.resume(
            run_id,
            {"decision": decision.decision, "comment": decision.comment},
        )
        return run_state.model_dump()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
