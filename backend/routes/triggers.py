"""Workflow triggers — Telegram bot + generic webhook.

A trigger binds a workflow to an external event source. When the event fires
(Telegram message, webhook POST), the backend runs the workflow with the
event payload as `input_data` and optionally sends the output back to the
source (Telegram reply).
"""
import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.contracts.workflow import WorkflowDefinition
from backend.core.engine.orchestrator import OrchestrationEngine
from backend.database import get_db
from backend.models import Workflow, WorkflowTrigger

logger = structlog.get_logger()

router = APIRouter(tags=["triggers"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TriggerCreate(BaseModel):
    trigger_type: str  # "telegram" | "webhook"
    name: str = ""
    config: dict[str, Any] = {}  # {bot_token: "..."} for telegram
    enabled: bool = True


class TriggerUpdate(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    enabled: bool | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(t: WorkflowTrigger) -> dict[str, Any]:
    # Mask bot_token in config for the API response
    config_safe = dict(t.config or {})
    if "bot_token" in config_safe:
        token = config_safe["bot_token"]
        config_safe["bot_token"] = token[:8] + "..." if len(token) > 8 else "***"
    return {
        "id": str(t.id),
        "workflow_id": str(t.workflow_id),
        "trigger_type": t.trigger_type,
        "name": t.name,
        "config": config_safe,
        "enabled": t.enabled,
        "webhook_secret": t.webhook_secret,
        "webhook_url": f"/api/triggers/webhook/{t.id}" if t.trigger_type == "webhook" else None,
        "telegram_url": f"/api/triggers/telegram/{t.id}" if t.trigger_type == "telegram" else None,
        "last_triggered_at": t.last_triggered_at.isoformat() if t.last_triggered_at else None,
    }


async def _run_workflow(
    workflow_id: uuid.UUID,
    input_data: dict[str, Any],
    db: AsyncSession,
) -> dict[str, Any]:
    """Load a workflow from DB and run it, returning structured result."""
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow = WorkflowDefinition.model_validate_json(w.definition_json)
    workflow.id = str(w.id)  # normalize to DB row id (FK constraint)

    engine = OrchestrationEngine()
    run_state = await engine.start(workflow, input_data, run_id=str(uuid.uuid4()))

    # Extract final output from the last completed step
    output: Any = None
    for step in reversed(run_state.steps):
        if step.output is not None:
            output = step.output
            break

    return {
        "run_id": run_state.run_id,
        "status": run_state.status.value if hasattr(run_state.status, "value") else str(run_state.status),
        "steps_completed": run_state.total_steps,
        "tokens_used": run_state.total_tokens,
        "output": output,
    }


def _extract_text_output(output: Any) -> str:
    """Best-effort extraction of a plain text string from the workflow output
    (which can be a string, dict, or nested structure). Used for Telegram replies.
    """
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        # agent_response + tool_results pattern
        if "agent_response" in output:
            return _extract_text_output(output["agent_response"])
        # {result: "..."} pattern
        if "result" in output:
            return str(output["result"])
        return json.dumps(output, ensure_ascii=False, indent=2)
    return str(output) if output is not None else "(no output)"


# ---------------------------------------------------------------------------
# CRUD endpoints (nested under /api/workflows/{workflow_id}/triggers)
# ---------------------------------------------------------------------------

@router.get("/api/workflows/{workflow_id}/triggers")
async def list_triggers(workflow_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkflowTrigger)
        .where(WorkflowTrigger.workflow_id == uuid.UUID(workflow_id))
        .order_by(WorkflowTrigger.created_at.desc())
    )
    return [_serialize(t) for t in result.scalars().all()]


@router.post("/api/workflows/{workflow_id}/triggers")
async def create_trigger(
    workflow_id: str,
    payload: TriggerCreate,
    db: AsyncSession = Depends(get_db),
):
    if payload.trigger_type not in ("telegram", "webhook"):
        raise HTTPException(status_code=400, detail="trigger_type must be 'telegram' or 'webhook'")

    # Validate workflow exists
    wf_result = await db.execute(select(Workflow).where(Workflow.id == uuid.UUID(workflow_id)))
    if not wf_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workflow not found")

    trigger = WorkflowTrigger(
        workflow_id=uuid.UUID(workflow_id),
        trigger_type=payload.trigger_type,
        name=payload.name or f"{payload.trigger_type.capitalize()} trigger",
        config=payload.config,
        enabled=payload.enabled,
        webhook_secret=secrets.token_urlsafe(32) if payload.trigger_type == "webhook" else None,
    )
    db.add(trigger)
    await db.flush()

    # For Telegram triggers, try to register the webhook with Telegram
    if payload.trigger_type == "telegram" and payload.config.get("bot_token"):
        bot_token = payload.config["bot_token"]
        public_url = payload.config.get("public_url", "")
        if public_url:
            webhook_url = f"{public_url.rstrip('/')}/api/triggers/telegram/{trigger.id}"
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"https://api.telegram.org/bot{bot_token}/setWebhook",
                        json={"url": webhook_url},
                    )
                    tg_result = resp.json()
                    logger.info(
                        "telegram_webhook_registered",
                        trigger_id=str(trigger.id),
                        ok=tg_result.get("ok"),
                        description=tg_result.get("description"),
                    )
            except Exception as e:
                logger.warning("telegram_webhook_registration_failed", error=str(e))

    await db.commit()
    return _serialize(trigger)


@router.put("/api/triggers/{trigger_id}")
async def update_trigger(
    trigger_id: str,
    payload: TriggerUpdate,
    db: AsyncSession = Depends(get_db),
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.execute(
        update(WorkflowTrigger)
        .where(WorkflowTrigger.id == uuid.UUID(trigger_id))
        .values(**data)
    )
    await db.commit()
    return {"status": "updated"}


@router.delete("/api/triggers/{trigger_id}")
async def delete_trigger(trigger_id: str, db: AsyncSession = Depends(get_db)):
    # If it's a telegram trigger, try to remove the webhook
    result = await db.execute(
        select(WorkflowTrigger).where(WorkflowTrigger.id == uuid.UUID(trigger_id))
    )
    trigger = result.scalar_one_or_none()
    if trigger and trigger.trigger_type == "telegram":
        bot_token = (trigger.config or {}).get("bot_token")
        if bot_token:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"https://api.telegram.org/bot{bot_token}/deleteWebhook"
                    )
            except Exception:
                pass

    await db.execute(delete(WorkflowTrigger).where(WorkflowTrigger.id == uuid.UUID(trigger_id)))
    await db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Webhook execution endpoint
# ---------------------------------------------------------------------------

@router.post("/api/triggers/webhook/{trigger_id}")
async def handle_webhook(trigger_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Generic webhook handler. Validates secret, runs workflow, returns output."""
    result = await db.execute(
        select(WorkflowTrigger).where(WorkflowTrigger.id == uuid.UUID(trigger_id))
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    if not trigger.enabled:
        raise HTTPException(status_code=403, detail="Trigger is disabled")

    # Validate webhook secret
    secret = request.headers.get("X-Webhook-Secret", "")
    if trigger.webhook_secret and secret != trigger.webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    # Parse body
    try:
        body = await request.json()
    except Exception:
        body = {"raw": (await request.body()).decode("utf-8", errors="replace")}

    # Update last_triggered_at
    await db.execute(
        update(WorkflowTrigger)
        .where(WorkflowTrigger.id == trigger.id)
        .values(last_triggered_at=datetime.now(timezone.utc))
    )

    logger.info("webhook_trigger_fired", trigger_id=str(trigger.id), workflow_id=str(trigger.workflow_id))

    try:
        run_result = await _run_workflow(trigger.workflow_id, body, db)
        await db.commit()
        return run_result
    except Exception as e:
        await db.commit()  # still commit the last_triggered_at update
        logger.error("webhook_trigger_error", trigger_id=str(trigger.id), error=str(e))
        raise HTTPException(status_code=500, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Telegram execution endpoint
# ---------------------------------------------------------------------------

@router.post("/api/triggers/telegram/{trigger_id}")
async def handle_telegram(trigger_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Telegram webhook handler. Receives Update JSON, runs workflow, replies."""
    result = await db.execute(
        select(WorkflowTrigger).where(WorkflowTrigger.id == uuid.UUID(trigger_id))
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    if not trigger.enabled:
        return {"ok": True}  # Telegram expects 200 even on skip
    if trigger.trigger_type != "telegram":
        raise HTTPException(status_code=400, detail="Not a Telegram trigger")

    bot_token = (trigger.config or {}).get("bot_token")
    if not bot_token:
        return {"ok": True, "error": "No bot_token configured"}

    # Parse Telegram Update
    try:
        update_data = await request.json()
    except Exception:
        return {"ok": True}

    message = update_data.get("message") or update_data.get("edited_message") or {}
    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")
    username = message.get("from", {}).get("username", "")

    if not text or not chat_id:
        return {"ok": True}  # Ignore non-text messages

    # Update last_triggered_at
    await db.execute(
        update(WorkflowTrigger)
        .where(WorkflowTrigger.id == trigger.id)
        .values(last_triggered_at=datetime.now(timezone.utc))
    )

    logger.info(
        "telegram_trigger_fired",
        trigger_id=str(trigger.id),
        chat_id=chat_id,
        username=username,
        text=text[:100],
    )

    # Build input_data for the workflow
    input_data = {
        "message": text,
        "chat_id": chat_id,
        "username": username,
        "telegram_update": update_data,
    }

    try:
        run_result = await _run_workflow(trigger.workflow_id, input_data, db)
        output_text = _extract_text_output(run_result.get("output"))

        # Send reply back to Telegram
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": output_text[:4096],  # Telegram max message length
                    "parse_mode": "Markdown",
                },
            )
        await db.commit()
    except Exception as e:
        await db.commit()
        logger.error("telegram_trigger_error", trigger_id=str(trigger.id), error=str(e))
        # Try to send error message back to user
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": f"Workflow error: {e}",
                    },
                )
        except Exception:
            pass

    return {"ok": True}
