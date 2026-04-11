"""Builder chats — for designing agents and workflows via conversation.

Unlike the orchestrator chat, these don't use tools to execute things.
They're pure conversation helpers that guide the user through configuration.
"""
import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter
from backend.database import get_db
from backend.models import AgentConfig, Conversation, Message, Workflow

logger = structlog.get_logger()

router = APIRouter(prefix="/api/builders", tags=["builders"])


class BuilderMessage(BaseModel):
    content: str
    context_type: str  # "agent_builder" | "workflow_builder"
    context_id: str | None = None  # agent_id or workflow_id being edited
    conversation_id: str | None = None
    project_id: str | None = None


AGENT_BUILDER_PROMPT = """You help the user design an AI agent. You do NOT execute anything — you ONLY suggest configuration.

When the user describes what they need, suggest concrete values for:
- name (snake_case)
- description (1 sentence)
- purpose (why this agent exists)
- system_prompt (detailed instructions)
- negative_prompt (what NOT to do, forbidden behaviors)
- constraints (hard limits the agent must follow)
- clarification_rules (when the agent should ask for clarification instead of guessing)
- model_tier (fast/balanced/powerful)
- tools needed (describe, not create)

Respond in the user's language. Be concrete and actionable. Suggest fields inline with clear labels like:

**Name:** sales_manager
**System Prompt:** You are a sales manager...
**Negative Prompt:** Never promise discounts above 20%...
**Constraints:** Maximum response length 500 words...
**Clarification Rules:** Ask when customer's budget is unclear...

The user will copy these values into the form manually."""


WORKFLOW_BUILDER_PROMPT = """You help the user design a workflow — a pipeline of AI agents working together.

You do NOT execute anything. You suggest the structure:
- Which agents to use (classifier, extractor, validator, risk_scorer, decision_maker, draft_writer, or user's custom agents)
- In what order (sequential, parallel, or with routing)
- Why each connection exists (what data flows between steps)

Output a clear plan with:
1. List of nodes (id, type, purpose)
2. Connections between nodes with explanation of WHY each connection exists
3. Suggested workflow name and description

Respond in the user's language. Be concrete. The user will build the workflow in the visual editor using your plan."""


def _get_prompt(context_type: str) -> str:
    if context_type == "agent_builder":
        return AGENT_BUILDER_PROMPT
    elif context_type == "workflow_builder":
        return WORKFLOW_BUILDER_PROMPT
    return "You are a helpful assistant."


async def _load_entity_context(context_type: str, context_id: str | None, db: AsyncSession) -> str:
    """Load current state of the entity being edited."""
    if not context_id:
        return ""
    try:
        cid = uuid.UUID(context_id)
    except ValueError:
        return ""

    if context_type == "agent_builder":
        result = await db.execute(select(AgentConfig).where(AgentConfig.id == cid))
        a = result.scalar_one_or_none()
        if a:
            return f"\n\nCurrent agent configuration:\n- Name: {a.name}\n- System Prompt: {a.system_prompt or '(empty)'}\n- Negative Prompt: {a.negative_prompt or '(empty)'}\n- Constraints: {a.constraints or '(empty)'}\n- Clarification Rules: {a.clarification_rules or '(empty)'}"

    elif context_type == "workflow_builder":
        result = await db.execute(select(Workflow).where(Workflow.id == cid))
        w = result.scalar_one_or_none()
        if w:
            return f"\n\nCurrent workflow: {w.name}\nDefinition: {w.definition_json[:1000]}"

    return ""


@router.get("/conversations")
async def list_builder_conversations(
    context_type: str | None = None,
    context_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Conversation).where(Conversation.context_type != "orchestrator")
    if context_type:
        query = query.where(Conversation.context_type == context_type)
    if context_id:
        try:
            query = query.where(Conversation.context_id == uuid.UUID(context_id))
        except ValueError:
            pass
    query = query.order_by(Conversation.updated_at.desc())
    result = await db.execute(query)
    return [
        {
            "id": str(c.id),
            "title": c.title,
            "context_type": c.context_type,
            "context_id": str(c.context_id) if c.context_id else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in result.scalars().all()
    ]


@router.get("/conversations/{conversation_id}/messages")
async def get_builder_messages(conversation_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == uuid.UUID(conversation_id))
        .order_by(Message.created_at)
    )
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in result.scalars().all()
    ]


@router.post("/send")
async def send_builder_message(msg: BuilderMessage, db: AsyncSession = Depends(get_db)):
    if msg.context_type not in ("agent_builder", "workflow_builder"):
        raise HTTPException(status_code=400, detail="Invalid context_type")

    # Create or load conversation
    if msg.conversation_id:
        conv_id = uuid.UUID(msg.conversation_id)
    else:
        conv = Conversation(
            title=msg.content[:50],
            initiated_by="user",
            context_type=msg.context_type,
            context_id=uuid.UUID(msg.context_id) if msg.context_id else None,
            project_id=uuid.UUID(msg.project_id) if msg.project_id else None,
        )
        db.add(conv)
        await db.flush()
        conv_id = conv.id

    # Save user message
    user_msg = Message(conversation_id=conv_id, role="user", content=msg.content)
    db.add(user_msg)
    await db.flush()

    # Load history
    history_result = await db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at)
    )
    messages = [
        {"role": "user" if m.role == "user" else "assistant", "content": m.content}
        for m in history_result.scalars().all()
    ]

    # Load entity context if editing
    entity_context = await _load_entity_context(msg.context_type, msg.context_id, db)
    system_prompt = _get_prompt(msg.context_type) + entity_context

    # Call LLM (NO tools — just pure conversation)
    provider = AnthropicProvider()
    model_router = ModelRouter()
    request = LLMRequest(
        model=model_router.resolve("balanced"),
        system_prompt=system_prompt,
        messages=messages,
        temperature=0.5,
        max_tokens=4096,
    )

    try:
        response = await provider.complete(request)
        assistant_content = response.content
        token_metadata = {
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "tokens_used": response.input_tokens + response.output_tokens,
            "model": response.model,
            "provider": "anthropic",
        }
    except Exception as e:
        logger.error("builder_chat_error", error=str(e))
        assistant_content = f"Error: {e}"
        token_metadata = {}

    assistant_msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content=assistant_content,
        message_metadata=token_metadata,
    )
    db.add(assistant_msg)

    if len(messages) <= 1:
        await db.execute(
            update(Conversation).where(Conversation.id == conv_id).values(title=msg.content[:50])
        )

    msg_id = assistant_msg.id
    await db.commit()

    return {
        "conversation_id": str(conv_id),
        "message": {
            "id": str(msg_id),
            "role": "assistant",
            "content": assistant_content,
        },
    }
