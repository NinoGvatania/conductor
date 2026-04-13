import time as _time
import uuid
from collections import defaultdict

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.contracts.run import RunState
from backend.database import get_db
from backend.models import Conversation, Message, Run

logger = structlog.get_logger()

router = APIRouter(prefix="/api/runs", tags=["runs"])

_stats_cache: dict[str, tuple[float, dict]] = {}
STATS_CACHE_TTL = 60


@router.get("/stats")
async def get_token_stats(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    """Aggregate token usage from runs + chat messages."""
    cache_key = f"stats_{project_id or 'all'}"
    if cache_key in _stats_cache:
        cached_at, data = _stats_cache[cache_key]
        if _time.time() - cached_at < STATS_CACHE_TTL:
            return data

    by_provider: dict[str, dict[str, int]] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "total": 0})
    by_model: dict[str, dict[str, int]] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "total": 0})
    total_tokens = 0

    # From runs
    try:
        query = select(Run)
        if project_id:
            query = query.where(Run.project_id == uuid.UUID(project_id))
        result = await db.execute(query)
        for run in result.scalars().all():
            try:
                rs = RunState.model_validate_json(run.state_json)
                for step in rs.steps:
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

    # From chat messages
    try:
        msg_query = select(Message).where(Message.role == "assistant")
        if project_id:
            msg_query = msg_query.join(Conversation, Message.conversation_id == Conversation.id).where(
                Conversation.project_id == uuid.UUID(project_id)
            )
        result = await db.execute(msg_query)
        for msg in result.scalars().all():
            meta = msg.message_metadata or {}
            tokens = meta.get("tokens_used", 0) if isinstance(meta, dict) else 0
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

    result_data = {
        "by_provider": dict(by_provider),
        "by_model": dict(by_model),
        "total_tokens": total_tokens,
    }
    _stats_cache[cache_key] = (_time.time(), result_data)
    return result_data


@router.get("")
async def list_runs(status: str | None = None, project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Run).order_by(Run.created_at.desc())
    if status:
        query = query.where(Run.status == status)
    if project_id:
        query = query.where(Run.project_id == uuid.UUID(project_id))
    result = await db.execute(query)
    return [
        {
            "id": str(r.id),
            "workflow_id": str(r.workflow_id) if r.workflow_id else None,
            "status": r.status,
            "total_tokens": r.total_tokens,
            "total_cost_usd": r.total_cost_usd,
            "total_steps": r.total_steps,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in result.scalars().all()
    ]


@router.get("/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Run).where(Run.id == uuid.UUID(run_id)))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    rs = RunState.model_validate_json(run.state_json)
    return rs.model_dump()
