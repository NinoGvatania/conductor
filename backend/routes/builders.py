"""Builder chats — for designing agents and workflows via conversation.

Unlike the orchestrator chat, these use a tool-use architecture focused on
creating and editing the entity the user is looking at: agent_builder context
gets create_agent/update_agent tools, workflow_builder gets create_workflow.
The LLM calls the tool directly once it has enough info, and the backend
executes it against the same DB session. The created entity is returned in
the response so the frontend can refresh its list without a page reload.
"""
import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

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
    model: str | None = None


AGENT_BUILDER_PROMPT = """You design AI agents for the user. Your goal is to CREATE or UPDATE agents directly by calling tools — not to suggest configurations for manual entry.

When the user describes what they need:
1. If you have enough info (purpose + a system prompt + a model tier is enough), CALL the `create_agent` tool immediately. Pick reasonable defaults for the rest: `provider="anthropic"`, `model_tier="fast"` for simple Q&A agents, `"balanced"` for reasoning, `"powerful"` for complex analysis.
2. If you are editing an existing agent (context_id is set — shown in the context block), use `update_agent` instead. Pass only the fields you want to change.
3. Ask clarifying questions ONLY when critical info is missing (e.g., the user said "make me an agent" with no domain). Otherwise proceed with sensible defaults and mention them in a short confirmation message after the tool call.
4. Always write `constraints` as checkable rules, one per line — they are enforced by automatic post-validation, so vague rules will not work.
5. Respond in the user's language after the tool call. The tool call itself uses English field names.

Example flow:
User: "Сделай агента поддержки клиентов на русском"
You: (call create_agent with name=customer_support, description="...", system_prompt="Ты — дружелюбный агент поддержки...", constraints="- Отвечать только на русском\\n- Не обещать того что не гарантировано\\n- Ответ ≤ 300 слов", model_tier="fast", provider="anthropic")
Then: "✓ Готово, создал агента customer_support. Можете открыть его в списке слева и настроить детали."
"""


WORKFLOW_BUILDER_PROMPT = """You design workflows for the user. Your goal is to CREATE or UPDATE workflows directly by calling tools — not to suggest structures for manual drawing.

When the user describes a process:
1. If they clearly describe a pipeline (classify → extract → validate → decide, etc.), call `create_workflow` with a concise `user_description` field capturing the whole pipeline. The backend will convert it into a valid workflow definition using the WorkflowGenerator.
2. If they are editing an existing workflow (context_id is set), use `update_workflow`.
3. Ask clarifying questions ONLY when you don't know what the pipeline should do. Otherwise proceed.
4. After the tool call, briefly confirm in the user's language: "✓ Workflow created: ..."

Tool call uses English field names; your chat response should be in the user's language."""


# -------- Tool schemas --------

_AGENT_FIELDS: dict[str, Any] = {
    "name": {"type": "string", "description": "snake_case identifier, unique across user's agents"},
    "description": {"type": "string", "description": "one-sentence summary of what the agent does"},
    "purpose": {"type": "string", "description": "why this agent exists (1-2 sentences)"},
    "system_prompt": {"type": "string", "description": "detailed role/instructions — the positive framing of what the agent should do"},
    "constraints": {"type": "string", "description": "hard rules, one per line. Each line will be checked against the agent's output by an LLM judge; violations force a retry."},
    "clarification_rules": {"type": "string", "description": "when the agent should ask the user for clarification instead of guessing"},
    "model_tier": {"type": "string", "enum": ["fast", "balanced", "powerful"], "description": "fast for simple Q&A, balanced for reasoning, powerful for deep analysis"},
    "provider": {"type": "string", "enum": ["anthropic", "openai", "gemini", "mistral", "yandexgpt", "gigachat"], "description": "LLM provider, default anthropic"},
    "tags": {"type": "array", "items": {"type": "string"}, "description": "short tags for search and filtering"},
}


CREATE_AGENT_TOOL: dict[str, Any] = {
    "name": "create_agent",
    "description": "Create a new AI agent in the user's workspace. Call this as soon as you have enough info — do NOT ask the user to copy-paste anything manually. Returns the new agent id.",
    "input_schema": {
        "type": "object",
        "required": ["name", "description", "system_prompt", "model_tier"],
        "properties": _AGENT_FIELDS,
    },
}


UPDATE_AGENT_TOOL: dict[str, Any] = {
    "name": "update_agent",
    "description": "Update an existing agent. Use this when the user is editing a specific agent (shown in the context block). Pass only the fields you want to change.",
    "input_schema": {
        "type": "object",
        "required": ["id"],
        "properties": {"id": {"type": "string", "description": "agent UUID"}, **_AGENT_FIELDS},
    },
}


CREATE_WORKFLOW_TOOL: dict[str, Any] = {
    "name": "create_workflow",
    "description": "Create a new workflow pipeline. You provide a name and a natural-language description; the backend converts it into a valid workflow definition using the WorkflowGenerator.",
    "input_schema": {
        "type": "object",
        "required": ["name", "user_description"],
        "properties": {
            "name": {"type": "string", "description": "short human-readable name"},
            "description": {"type": "string", "description": "one-sentence summary"},
            "user_description": {
                "type": "string",
                "description": "detailed pipeline description — which steps in what order, what each step does, and why the edges exist. The WorkflowGenerator will read this to build the graph.",
            },
        },
    },
}


UPDATE_WORKFLOW_TOOL: dict[str, Any] = {
    "name": "update_workflow",
    "description": "Regenerate and overwrite an existing workflow with a new user_description.",
    "input_schema": {
        "type": "object",
        "required": ["id", "user_description"],
        "properties": {
            "id": {"type": "string"},
            "name": {"type": "string"},
            "user_description": {"type": "string"},
        },
    },
}


def _tools_for_context(context_type: str, context_id: str | None) -> list[dict[str, Any]]:
    if context_type == "agent_builder":
        tools: list[dict[str, Any]] = [CREATE_AGENT_TOOL]
        if context_id:
            tools.append(UPDATE_AGENT_TOOL)
        return tools
    if context_type == "workflow_builder":
        tools = [CREATE_WORKFLOW_TOOL]
        if context_id:
            tools.append(UPDATE_WORKFLOW_TOOL)
        return tools
    return []


def _get_prompt(context_type: str) -> str:
    if context_type == "agent_builder":
        return AGENT_BUILDER_PROMPT
    if context_type == "workflow_builder":
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
            return (
                f"\n\nCurrent agent being edited (id={a.id}):\n"
                f"- Name: {a.name}\n"
                f"- Description: {a.description or '(empty)'}\n"
                f"- System Prompt: {a.system_prompt or '(empty)'}\n"
                f"- Constraints: {a.constraints or '(empty)'}\n"
                f"- Clarification Rules: {a.clarification_rules or '(empty)'}\n"
                f"- Model Tier: {a.model_tier}\n"
                f"Use update_agent with id={a.id} to modify this agent."
            )
    elif context_type == "workflow_builder":
        result = await db.execute(select(Workflow).where(Workflow.id == cid))
        w = result.scalar_one_or_none()
        if w:
            return (
                f"\n\nCurrent workflow being edited (id={w.id}):\n"
                f"- Name: {w.name}\n"
                f"- Definition: {w.definition_json}\n"
                f"Use update_workflow with id={w.id} to regenerate this workflow."
            )

    return ""


# -------- Tool execution --------


async def _exec_create_agent(
    tool_input: dict[str, Any], db: AsyncSession, project_id: uuid.UUID | None
) -> dict[str, Any]:
    name = tool_input.get("name", "").strip()
    if not name:
        return {"error": "name is required"}

    # Reject duplicates
    existing = await db.execute(select(AgentConfig).where(AgentConfig.name == name))
    if existing.scalar_one_or_none():
        return {"error": f"Agent '{name}' already exists. Pick a different name or use update_agent."}

    a = AgentConfig(
        name=name,
        description=tool_input.get("description", "") or "",
        purpose=tool_input.get("purpose", "") or "",
        system_prompt=tool_input.get("system_prompt", "") or "",
        constraints=tool_input.get("constraints", "") or "",
        clarification_rules=tool_input.get("clarification_rules", "") or "",
        model_tier=tool_input.get("model_tier", "balanced"),
        provider=tool_input.get("provider", "anthropic"),
        tags=tool_input.get("tags", []) or [],
        project_id=project_id,
    )
    db.add(a)
    await db.flush()
    logger.info("builder_created_agent", agent_id=str(a.id), name=a.name)
    return {
        "ok": True,
        "entity": {"type": "agent", "id": str(a.id), "name": a.name},
    }


async def _exec_update_agent(
    tool_input: dict[str, Any], db: AsyncSession
) -> dict[str, Any]:
    raw_id = tool_input.get("id", "")
    try:
        agent_id = uuid.UUID(raw_id)
    except (ValueError, TypeError):
        return {"error": f"invalid agent id: {raw_id}"}

    # Pick only fields the LLM actually passed (ignore id itself)
    fields = {
        k: v
        for k, v in tool_input.items()
        if k != "id" and v is not None and k in _AGENT_FIELDS
    }
    if not fields:
        return {"error": "no fields to update"}

    await db.execute(update(AgentConfig).where(AgentConfig.id == agent_id).values(**fields))
    await db.flush()
    logger.info("builder_updated_agent", agent_id=str(agent_id), fields=list(fields.keys()))
    return {
        "ok": True,
        "entity": {"type": "agent", "id": str(agent_id), "updated": list(fields.keys())},
    }


async def _exec_create_workflow(
    tool_input: dict[str, Any], db: AsyncSession, project_id: uuid.UUID | None
) -> dict[str, Any]:
    from backend.core.workflow_generator import WorkflowGenerator

    user_description = tool_input.get("user_description", "").strip()
    name = tool_input.get("name", "").strip() or "Untitled workflow"
    if not user_description:
        return {"error": "user_description is required"}

    try:
        generator = WorkflowGenerator()
        workflow_def = await generator.generate(user_description)
        workflow_def.name = name  # prefer the name the LLM chose for the tool call
    except Exception as e:
        logger.error("builder_workflow_generate_error", error=str(e))
        return {"error": f"WorkflowGenerator failed: {e}"}

    w = Workflow(
        name=workflow_def.name,
        version=workflow_def.version,
        definition_json=workflow_def.model_dump_json(),
        project_id=project_id,
    )
    db.add(w)
    await db.flush()
    logger.info("builder_created_workflow", workflow_id=str(w.id), name=w.name)
    return {
        "ok": True,
        "entity": {"type": "workflow", "id": str(w.id), "name": w.name},
    }


async def _exec_update_workflow(
    tool_input: dict[str, Any], db: AsyncSession
) -> dict[str, Any]:
    from backend.core.workflow_generator import WorkflowGenerator

    raw_id = tool_input.get("id", "")
    try:
        wf_id = uuid.UUID(raw_id)
    except (ValueError, TypeError):
        return {"error": f"invalid workflow id: {raw_id}"}

    user_description = tool_input.get("user_description", "").strip()
    if not user_description:
        return {"error": "user_description is required"}

    try:
        generator = WorkflowGenerator()
        workflow_def = await generator.generate(user_description)
        if "name" in tool_input and tool_input["name"]:
            workflow_def.name = tool_input["name"]
    except Exception as e:
        return {"error": f"WorkflowGenerator failed: {e}"}

    await db.execute(
        update(Workflow)
        .where(Workflow.id == wf_id)
        .values(
            name=workflow_def.name,
            version=workflow_def.version,
            definition_json=workflow_def.model_dump_json(),
        )
    )
    await db.flush()
    logger.info("builder_updated_workflow", workflow_id=str(wf_id))
    return {
        "ok": True,
        "entity": {"type": "workflow", "id": str(wf_id), "name": workflow_def.name},
    }


async def _execute_builder_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    db: AsyncSession,
    project_id: uuid.UUID | None,
) -> dict[str, Any]:
    try:
        if tool_name == "create_agent":
            return await _exec_create_agent(tool_input, db, project_id)
        if tool_name == "update_agent":
            return await _exec_update_agent(tool_input, db)
        if tool_name == "create_workflow":
            return await _exec_create_workflow(tool_input, db, project_id)
        if tool_name == "update_workflow":
            return await _exec_update_workflow(tool_input, db)
        return {"error": f"unknown tool: {tool_name}"}
    except Exception as e:
        logger.error("builder_tool_error", tool=tool_name, error=str(e))
        return {"error": str(e)}


# -------- Routes --------


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

    # Resolve provider by model prefix (same pattern as /api/conversations/send)
    selected_model = msg.model or ""
    if selected_model.startswith(("gpt", "o3", "o1")):
        provider = ModelRouter.get_provider("openai")
        provider_name = "openai"
    else:
        provider = ModelRouter.get_provider("anthropic")
        provider_name = "anthropic"
    model_router = ModelRouter()

    tools = _tools_for_context(msg.context_type, msg.context_id)

    request = LLMRequest(
        model=msg.model or model_router.resolve("balanced"),
        system_prompt=system_prompt,
        messages=messages,
        tools=tools,
        temperature=0.4,
        max_tokens=32000,
    )

    assistant_content = ""
    created_entities: list[dict[str, Any]] = []
    token_metadata: dict[str, Any] = {}
    project_uuid = uuid.UUID(msg.project_id) if msg.project_id else None

    try:
        response = await provider.complete(request)
        initial_text = response.content or ""

        # Execute any tool calls the LLM requested
        tool_results: list[dict[str, Any]] = []
        if response.tool_calls:
            for tc in response.tool_calls:
                result = await _execute_builder_tool(
                    tc["name"], tc.get("input", {}) or {}, db, project_uuid
                )
                tool_results.append({"tool": tc["name"], "result": result})
                entity = result.get("entity") if isinstance(result, dict) else None
                if result.get("ok") and entity and "id" in entity:
                    created_entities.append(entity)

        # Build the assistant message:
        # - LLM's own prose (if any) describing what it did
        # - followed by a compact confirmation line per created/updated entity
        summary_lines: list[str] = []
        for tr in tool_results:
            res = tr["result"]
            if res.get("ok") and res.get("entity"):
                entity = res["entity"]
                if tr["tool"].startswith("create_"):
                    summary_lines.append(f"✓ Created {entity['type']} '{entity.get('name', entity['id'])}'")
                elif tr["tool"].startswith("update_"):
                    summary_lines.append(f"✓ Updated {entity['type']} '{entity.get('name', entity['id'])}'")
            elif res.get("error"):
                summary_lines.append(f"⚠ {tr['tool']} failed: {res['error']}")

        parts: list[str] = []
        if initial_text.strip():
            parts.append(initial_text.strip())
        if summary_lines:
            parts.append("\n".join(summary_lines))
        if not parts:
            parts.append("(no response)")
        assistant_content = "\n\n".join(parts)

        token_metadata = {
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "tokens_used": response.input_tokens + response.output_tokens,
            "model": response.model or (msg.model or ""),
            "provider": provider_name,
            "created_entities": created_entities,
        }
    except Exception as e:
        logger.error("builder_chat_error", error=str(e))
        assistant_content = f"Error: {e}"

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
        "created_entities": created_entities,
    }
