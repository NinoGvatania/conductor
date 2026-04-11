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
from backend.models import AgentConfig, Conversation, Message, Tool, Workflow

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

## Tools / Integrations — STRICT RULES

1. You can ONLY attach tools whose names appear verbatim in the "Available tools in the user's library" section of the context block. That list is the single source of truth.
2. If that list is EMPTY, or if it does not contain what the user is asking for, you MUST NOT pass a `tools` field at all. Instead, reply in the user's language: "В библиотеке нет подходящих тулов. Создайте их во вкладке Integrations (укажите name, URL, method), а потом вернитесь сюда — я их подключу." / "No matching tools in your library. Create them under the Integrations tab first, then come back."
3. NEVER fabricate tool names. Do not invent names like `send_telegram_message`, `bot_api`, `http_request`, etc. unless you see that exact string in the available tools list.
4. When you DO attach tools, use EXACT case-sensitive names from the list.
5. If the backend returns a tool error ("Requested tool names don't exist..."), DO NOT retry with similar made-up names. Read the error, tell the user which names are missing and how to create them, and stop.
6. If the user says "add tools on your own" / "добавь инструменты на свой вкус" and the available list is empty, this is the SAME situation — refuse to fabricate and explain rule #2.

Example:
User: "Сделай агента поддержки клиентов на русском"
You: (call create_agent with name=customer_support, description="...", system_prompt="Ты — дружелюбный агент поддержки...", constraints="- Отвечать только на русском\\n- Не обещать того что не гарантировано\\n- Ответ ≤ 300 слов", model_tier="fast", provider="anthropic")
Then: "✓ Готово, создал агента customer_support."

User: "Добавь ему интеграцию с телеграм"
You: (check the Available tools list. If `send_telegram_message` is THERE verbatim → call update_agent with id=<current> and tools=["send_telegram_message"]. If NOT → reply "В библиотеке нет тула для Telegram. Создайте его во вкладке Integrations и вернитесь.")
"""


WORKFLOW_BUILDER_PROMPT = """You design workflows for the user. Your goal is to CREATE or UPDATE workflows directly by calling tools — not to suggest structures for manual drawing.

When the user describes a process:
1. If they clearly describe a pipeline (classify → extract → validate → decide, etc.), call `create_workflow` with a concise `user_description` field capturing the whole pipeline. The backend will convert it into a valid workflow definition using the WorkflowGenerator.
2. If they are editing an existing workflow (context_id is set), use `update_workflow`.
3. Ask clarifying questions ONLY when you don't know what the pipeline should do. Otherwise proceed.
4. After the tool call, briefly confirm in the user's language: "✓ Workflow created: ..."

## Available agents as building blocks

Workflows are built from agents. You have access to BOTH the builtin agents (classifier, extractor, validator, risk_scorer, decision_maker, draft_writer) AND the user's custom agents. The full list is shown in the context block under "Available agents" — always reference those exact names in your `user_description` when describing which agent runs at which step. For example, if the user has a custom agent `sales_manager`, say "step 2: run sales_manager agent to qualify the lead" so the workflow generator picks that agent instead of a builtin.

Tool call uses English field names; your chat response should be in the user's language."""


# -------- Tool schemas --------

_AGENT_FIELDS: dict[str, Any] = {
    "name": {"type": "string", "description": "snake_case identifier, unique across user's agents"},
    "description": {"type": "string", "description": "one-sentence summary of what the agent does"},
    "purpose": {"type": "string", "description": "why this agent exists (1-2 sentences)"},
    "system_prompt": {"type": "string", "description": "detailed role/instructions — the positive framing of what the agent should do"},
    "constraints": {"type": "string", "description": "hard rules, one per line. Each line will be checked against the agent's output by an LLM judge; violations force a retry."},
    "clarification_rules": {"type": "string", "description": "when the agent should ask the user for clarification instead of guessing"},
    "model_tier": {"type": "string", "enum": ["fast", "balanced", "powerful"], "description": "legacy abstraction: fast/balanced/powerful. Prefer the explicit `model` field when you know which model id to use; tier is kept as a fallback."},
    "model": {"type": "string", "description": "explicit model id like 'claude-sonnet-4-6' or 'gpt-4o'. Takes priority over model_tier. If omitted, the runner falls back to tier-based resolution via the provider's catalog."},
    "provider": {"type": "string", "enum": ["anthropic", "openai", "gemini", "mistral", "yandexgpt", "gigachat"], "description": "LLM provider, default anthropic"},
    "max_tokens": {"type": "integer", "description": "optional cap on agent output tokens. If omitted, uses the model's natural max (recommended)."},
    "tags": {"type": "array", "items": {"type": "string"}, "description": "short tags for search and filtering"},
    "tools": {
        "type": "array",
        "items": {"type": "string"},
        "description": "list of tool names to attach to this agent. Must match existing entries in the user's tool library — see 'Available tools' in the context block. Pass an empty array to remove all tools.",
    },
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


async def _load_available_resources(context_type: str, db: AsyncSession) -> str:
    """Return a context block listing resources the LLM can reference.

    For agent_builder: list of tools in the user's library (so the LLM knows
    which integrations are valid to attach via the tools field).
    For workflow_builder: list of agents (builtin + custom) that can be used as
    workflow building blocks.
    """
    parts: list[str] = []

    if context_type == "agent_builder":
        result = await db.execute(select(Tool.name, Tool.description))
        rows = result.all()
        if rows:
            tool_lines = "\n".join(f"- {name}: {desc or '(no description)'}" for name, desc in rows)
            parts.append(
                "\n\n## Available tools in the user's library\n"
                "You can attach these to an agent by passing their names in the `tools` array:\n"
                f"{tool_lines}"
            )
        else:
            parts.append(
                "\n\n## Available tools\n"
                "(none — user has not created any tools yet. If they ask to add an integration, tell them to go to the Integrations tab first.)"
            )

    elif context_type == "workflow_builder":
        # Builtins
        builtin_names = [
            "classifier (fast tier — classifies input into categories)",
            "extractor (balanced — pulls structured data from documents)",
            "validator (balanced — checks completeness and consistency)",
            "risk_scorer (powerful — risk assessment with 0-100 score)",
            "decision_maker (powerful — approve/reject/escalate decisions)",
            "draft_writer (balanced — generates response text)",
        ]
        # Custom agents
        result = await db.execute(select(AgentConfig.name, AgentConfig.description))
        custom = result.all()
        custom_lines = "\n".join(f"- {name}: {desc or '(no description)'}" for name, desc in custom)
        builtin_lines = "\n".join(f"- {line}" for line in builtin_names)
        parts.append(
            "\n\n## Available agents (use these as workflow building blocks)\n"
            "**Builtin agents:**\n"
            f"{builtin_lines}\n\n"
            "**User's custom agents:**\n"
            f"{custom_lines if custom_lines else '(none yet)'}\n\n"
            "Reference any of these by their exact name in your user_description field."
        )

    return "".join(parts)


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


async def _resolve_tool_names(tool_names: list[str], db: AsyncSession) -> tuple[list[dict[str, Any]], list[str]]:
    """Given a list of tool names from the LLM, resolve each against the Tool
    library. Returns (resolved_tools, unknown_names). Each resolved entry is a
    small dict with name+description — the shape agents.tools expects.
    """
    if not tool_names:
        return [], []
    clean_names = [n.strip() for n in tool_names if isinstance(n, str) and n.strip()]
    if not clean_names:
        return [], []
    result = await db.execute(select(Tool).where(Tool.name.in_(clean_names)))
    found = {t.name: t for t in result.scalars().all()}
    resolved: list[dict[str, Any]] = []
    unknown: list[str] = []
    for name in clean_names:
        tool = found.get(name)
        if tool is None:
            unknown.append(name)
        else:
            resolved.append({"name": tool.name, "description": tool.description or ""})
    return resolved, unknown


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

    # Resolve tool names against the Tool library. For create_agent, if ALL
    # requested tool names are unknown we still create the agent (with no tools)
    # and return a warning so the LLM can tell the user what to do.
    requested_tools = tool_input.get("tools") or []
    resolved_tools, unknown_tools = await _resolve_tool_names(requested_tools, db)

    a = AgentConfig(
        name=name,
        description=tool_input.get("description", "") or "",
        purpose=tool_input.get("purpose", "") or "",
        system_prompt=tool_input.get("system_prompt", "") or "",
        constraints=tool_input.get("constraints", "") or "",
        clarification_rules=tool_input.get("clarification_rules", "") or "",
        model_tier=tool_input.get("model_tier", "balanced"),
        model=tool_input.get("model"),
        provider=tool_input.get("provider", "anthropic"),
        max_tokens=tool_input.get("max_tokens"),
        tags=tool_input.get("tags", []) or [],
        tools=resolved_tools,
        project_id=project_id,
    )
    db.add(a)
    await db.flush()
    logger.info(
        "builder_created_agent",
        agent_id=str(a.id),
        name=a.name,
        tools_attached=[t["name"] for t in resolved_tools],
        unknown_tools=unknown_tools,
    )
    result: dict[str, Any] = {
        "ok": True,
        "entity": {"type": "agent", "id": str(a.id), "name": a.name},
    }
    if unknown_tools:
        result["warning"] = (
            f"Agent created, but these tool names were not found in the library "
            f"and were skipped: {', '.join(unknown_tools)}. Create them under the "
            f"Integrations tab first, then call update_agent to attach them."
        )
    return result


async def _exec_update_agent(
    tool_input: dict[str, Any], db: AsyncSession
) -> dict[str, Any]:
    raw_id = tool_input.get("id", "")
    try:
        agent_id = uuid.UUID(raw_id)
    except (ValueError, TypeError):
        return {"error": f"invalid agent id: {raw_id}"}

    # Pick only fields the LLM actually passed (ignore id itself)
    fields: dict[str, Any] = {
        k: v
        for k, v in tool_input.items()
        if k != "id" and v is not None and k in _AGENT_FIELDS
    }
    if not fields:
        return {"error": "no fields to update"}

    # Strict handling for `tools`:
    # - if the LLM passed an empty list explicitly, allow it (user wants to remove all)
    # - if ALL requested names are unknown, DROP the field entirely to avoid
    #   destructively overwriting the agent's existing tools with []
    # - if some found, apply those and warn about the rest
    unknown_tools: list[str] = []
    tool_field_error: str | None = None
    if "tools" in fields:
        requested = fields.get("tools") or []
        if requested:  # non-empty request -> resolve
            resolved_tools, unknown_tools = await _resolve_tool_names(requested, db)
            if not resolved_tools:
                # All hallucinated — don't overwrite the existing tools column
                del fields["tools"]
                tool_field_error = (
                    f"Requested tool names don't exist in the library: "
                    f"{', '.join(unknown_tools)}. Create them in the "
                    f"Integrations tab first, then ask me to attach them."
                )
            else:
                fields["tools"] = resolved_tools
        else:
            # explicit empty list — user wants to remove all tools
            fields["tools"] = []

    if not fields:
        # Everything was stripped (tools rejected and it was the only field)
        return {"error": tool_field_error or "no fields to update"}

    await db.execute(update(AgentConfig).where(AgentConfig.id == agent_id).values(**fields))
    await db.flush()
    logger.info(
        "builder_updated_agent",
        agent_id=str(agent_id),
        fields=list(fields.keys()),
        unknown_tools=unknown_tools,
    )
    result: dict[str, Any] = {
        "ok": True,
        "entity": {"type": "agent", "id": str(agent_id), "updated": list(fields.keys())},
    }
    if tool_field_error:
        # We applied the other fields but rejected tools wholesale
        result["warning"] = tool_field_error
    elif unknown_tools:
        result["warning"] = (
            f"Agent updated, but these tool names were not found in the library "
            f"and were skipped: {', '.join(unknown_tools)}. Create them under the "
            f"Integrations tab first."
        )
    return result


async def _collect_available_agents(db: AsyncSession) -> list[dict[str, str]]:
    """Load all agents (builtin name hints + custom) for the workflow generator."""
    result = await db.execute(select(AgentConfig.name, AgentConfig.description, AgentConfig.purpose))
    custom = [
        {"name": name, "description": desc or "", "purpose": purpose or ""}
        for name, desc, purpose in result.all()
    ]
    return custom


async def _exec_create_workflow(
    tool_input: dict[str, Any], db: AsyncSession, project_id: uuid.UUID | None
) -> dict[str, Any]:
    from backend.core.workflow_generator import WorkflowGenerator

    user_description = tool_input.get("user_description", "").strip()
    name = tool_input.get("name", "").strip() or "Untitled workflow"
    if not user_description:
        return {"error": "user_description is required"}

    available_agents = await _collect_available_agents(db)

    try:
        generator = WorkflowGenerator()
        workflow_def = await generator.generate(user_description, available_agents=available_agents)
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

    available_agents = await _collect_available_agents(db)

    try:
        generator = WorkflowGenerator()
        workflow_def = await generator.generate(user_description, available_agents=available_agents)
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
    history_rows = history_result.scalars().all()
    is_first_turn = len(history_rows) <= 1  # only the user message we just saved
    messages_for_llm: list[dict[str, Any]] = [
        {"role": "user" if m.role == "user" else "assistant", "content": m.content}
        for m in history_rows
    ]

    # Load entity context if editing + list of resources the LLM can reference
    entity_context = await _load_entity_context(msg.context_type, msg.context_id, db)
    resources_context = await _load_available_resources(msg.context_type, db)
    system_prompt = _get_prompt(msg.context_type) + resources_context + entity_context

    # Resolve provider by model prefix (same pattern as /api/conversations/send)
    selected_model = msg.model or ""
    if selected_model.startswith(("gpt", "o3", "o1")):
        provider = ModelRouter.get_provider("openai")
        provider_name = "openai"
    else:
        provider = ModelRouter.get_provider("anthropic")
        provider_name = "anthropic"
    model_router = ModelRouter()
    model_to_use = msg.model or model_router.resolve("balanced")

    tools = _tools_for_context(msg.context_type, msg.context_id)

    assistant_content = ""
    created_entities: list[dict[str, Any]] = []
    token_metadata: dict[str, Any] = {}
    project_uuid = uuid.UUID(msg.project_id) if msg.project_id else None

    # Multi-round tool-use loop. Each round:
    # 1. ask the LLM (with accumulated history + tool_result blocks from last round)
    # 2. if it replies with text only, we're done
    # 3. otherwise execute each tool_use block, append assistant message + user
    #    message with tool_result blocks, and loop again
    MAX_TOOL_ROUNDS = 5
    tool_results_log: list[dict[str, Any]] = []
    final_text = ""
    total_input_tokens = 0
    total_output_tokens = 0
    last_model_name = ""

    try:
        for _round in range(MAX_TOOL_ROUNDS):
            request = LLMRequest(
                model=model_to_use,
                system_prompt=system_prompt,
                messages=messages_for_llm,
                tools=tools,
                temperature=0.4,
                max_tokens=32000,
            )
            response = await provider.complete(request)
            total_input_tokens += response.input_tokens
            total_output_tokens += response.output_tokens
            last_model_name = response.model or last_model_name

            if not response.tool_calls:
                final_text = response.content or ""
                break

            # Reconstruct assistant message with both text and tool_use blocks
            assistant_blocks: list[dict[str, Any]] = []
            if response.content:
                assistant_blocks.append({"type": "text", "text": response.content})
            for tc in response.tool_calls:
                assistant_blocks.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc.get("input") or {},
                })
            messages_for_llm.append({"role": "assistant", "content": assistant_blocks})

            # Execute each tool call and collect tool_result blocks
            tool_result_blocks: list[dict[str, Any]] = []
            for tc in response.tool_calls:
                result = await _execute_builder_tool(
                    tc["name"], tc.get("input", {}) or {}, db, project_uuid
                )
                tool_results_log.append({"tool": tc["name"], "result": result})
                entity = result.get("entity") if isinstance(result, dict) else None
                if result.get("ok") and entity and "id" in entity:
                    created_entities.append(entity)
                tool_result_blocks.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                    "is_error": bool(result.get("error")),
                })

            messages_for_llm.append({"role": "user", "content": tool_result_blocks})
        else:
            # Loop exhausted without a text-only reply
            final_text = (
                "Достиг лимита итераций тулов — попробуйте переформулировать запрос."
            )

        # Build the final assistant message:
        # - final prose from the LLM's last text-only turn
        # - compact confirmation/warning lines for each tool that ran
        summary_lines: list[str] = []
        for tr in tool_results_log:
            res = tr["result"]
            if res.get("ok") and res.get("entity"):
                entity = res["entity"]
                verb = "Created" if tr["tool"].startswith("create_") else "Updated"
                label = entity.get("name", entity.get("id", "?"))
                summary_lines.append(f"✓ {verb} {entity['type']} '{label}'")
            if res.get("warning"):
                summary_lines.append(f"⚠ {res['warning']}")
            if res.get("error"):
                summary_lines.append(f"⚠ {tr['tool']} failed: {res['error']}")

        parts: list[str] = []
        if final_text.strip():
            parts.append(final_text.strip())
        if summary_lines:
            parts.append("\n".join(summary_lines))
        if not parts:
            parts.append("(no response)")
        assistant_content = "\n\n".join(parts)

        token_metadata = {
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "tokens_used": total_input_tokens + total_output_tokens,
            "model": last_model_name or model_to_use,
            "provider": provider_name,
            "created_entities": created_entities,
        }
    except Exception as e:
        logger.error("builder_chat_error", error=str(e), exc_info=True)
        assistant_content = f"Error: {e}"

    assistant_msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content=assistant_content,
        message_metadata=token_metadata,
    )
    db.add(assistant_msg)

    if is_first_turn:
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
