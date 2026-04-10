from collections import defaultdict

import structlog
from fastapi import APIRouter, HTTPException

from backend.core.contracts.run import RunState
from backend.database import get_supabase_client

logger = structlog.get_logger()

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("/stats")
async def get_token_stats():
    """Aggregate token usage from ALL sources: workflow runs + chat messages."""
    client = get_supabase_client()

    by_provider: dict[str, dict[str, int]] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "total": 0})
    by_model: dict[str, dict[str, int]] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "total": 0})
    total_tokens = 0

    # 1. Count from workflow runs
    try:
        result = client.table("runs").select("state_json").execute()
        for row in result.data:
            try:
                run = RunState.model_validate_json(row["state_json"])
                for step in run.steps:
                    tokens = step.tokens_used or 0
                    if tokens == 0:
                        continue
                    provider = step.provider or "anthropic"
                    model = step.model or "unknown"
                    inp = step.input_tokens or 0
                    out = step.output_tokens or 0

                    by_provider[provider]["input_tokens"] += inp
                    by_provider[provider]["output_tokens"] += out
                    by_provider[provider]["total"] += tokens
                    by_model[model]["input_tokens"] += inp
                    by_model[model]["output_tokens"] += out
                    by_model[model]["total"] += tokens
                    total_tokens += tokens
            except Exception:
                continue
    except Exception as e:
        logger.warning("stats_runs_error", error=str(e))

    # 2. Count from chat messages
    try:
        import json as _json
        result = client.table("messages").select("metadata").eq("role", "assistant").execute()
        for row in result.data:
            meta = row.get("metadata")
            if not meta:
                continue
            if isinstance(meta, str):
                try:
                    meta = _json.loads(meta)
                except Exception:
                    continue
            if not isinstance(meta, dict):
                continue

            tokens = meta.get("tokens_used", 0)
            if not tokens:
                continue
            provider = meta.get("provider", "anthropic")
            model = meta.get("model", "unknown")
            inp = meta.get("input_tokens", 0)
            out = meta.get("output_tokens", 0)

            by_provider[provider]["input_tokens"] += inp
            by_provider[provider]["output_tokens"] += out
            by_provider[provider]["total"] += tokens
            by_model[model]["input_tokens"] += inp
            by_model[model]["output_tokens"] += out
            by_model[model]["total"] += tokens
            total_tokens += tokens
    except Exception as e:
        logger.warning("stats_messages_error", error=str(e))

    return {
        "by_provider": dict(by_provider),
        "by_model": dict(by_model),
        "total_tokens": total_tokens,
    }


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
    try:
        result = (
            client.table("runs")
            .select("state_json")
            .eq("id", run_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail="Run not found") from e
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found")
    run_state = RunState.model_validate_json(result.data["state_json"])
    return run_state.model_dump()
