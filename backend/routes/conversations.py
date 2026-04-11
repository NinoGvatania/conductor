import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.providers.model_router import ModelRouter
from backend.database import get_db
from backend.models import AgentConfig, Conversation, Message, Tool, Workflow

logger = structlog.get_logger()

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class MessageSend(BaseModel):
    content: str
    conversation_id: str | None = None
    project_id: str | None = None
    model: str | None = None


class AgentMessage(BaseModel):
    agent_name: str
    content: str
    project_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


def _build_orchestrator_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": "run_agent",
            "description": "Run a specific AI agent with a task",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string"},
                    "task": {"type": "string"},
                },
                "required": ["agent_name", "task"],
            },
        },
        {
            "name": "run_tool",
            "description": "Execute an API tool directly",
            "input_schema": {
                "type": "object",
                "properties": {
                    "tool_name": {"type": "string"},
                    "arguments": {"type": "object"},
                },
                "required": ["tool_name", "arguments"],
            },
        },
        {
            "name": "start_workflow",
            "description": "Start a saved workflow by name or ID",
            "input_schema": {
                "type": "object",
                "properties": {
                    "workflow_name": {"type": "string"},
                    "input_data": {"type": "object"},
                },
                "required": ["workflow_name"],
            },
        },
    ]


async def _build_system_prompt(db: AsyncSession) -> str:
    agents = (await db.execute(select(AgentConfig.name))).scalars().all()
    tools = (await db.execute(select(Tool.name))).scalars().all()
    workflows = (await db.execute(select(Workflow.name))).scalars().all()

    agent_list = ", ".join(agents) if agents else "classifier, extractor, validator, risk_scorer, decision_maker, draft_writer"
    tool_list = ", ".join(tools) if tools else "(no tools)"
    wf_list = ", ".join(workflows) if workflows else "(no workflows)"

    return f"""You are AgentFlow orchestrator. You manage AI agents, tools, and workflows.

Available agents: {agent_list}
Available tools: {tool_list}
Available workflows: {wf_list}

When the user gives you a task, use run_agent, run_tool, or start_workflow to execute.
Always respond in the user's language. Be concise."""


async def _execute_tool_call(tool_name: str, tool_input: dict[str, Any], db: AsyncSession) -> str:
    try:
        if tool_name == "run_agent":
            from backend.core.agents.runner import AgentRunner
            from backend.core.contracts.agent import AgentContract
            from backend.core.providers.anthropic import AnthropicProvider

            agent_name = tool_input["agent_name"]
            task = tool_input["task"]

            from backend.core.engine.orchestrator import BUILTIN_AGENTS, _load_builtin_agents
            if not BUILTIN_AGENTS:
                _load_builtin_agents()

            agent_dict = BUILTIN_AGENTS.get(agent_name)
            agent_tools: list[dict] = []

            if not agent_dict:
                result = await db.execute(select(AgentConfig).where(AgentConfig.name == agent_name))
                a = result.scalar_one_or_none()
                if a:
                    agent_dict = {
                        "name": a.name,
                        "description": a.description,
                        "purpose": a.purpose,
                        "model_tier": a.model_tier,
                        "system_prompt": a.system_prompt,
                        "output_schema": a.output_schema or {},
                        "temperature": float(a.temperature or 0),
                        "timeout_seconds": a.timeout_seconds,
                        "max_retries": a.max_retries,
                        "max_tokens": a.max_tokens,
                    }
                    for t in a.tools or []:
                        name = t.get("name") if isinstance(t, dict) else None
                        if name:
                            tr = await db.execute(select(Tool).where(Tool.name == name))
                            tool = tr.scalar_one_or_none()
                            if tool:
                                agent_tools.append({
                                    "id": str(tool.id),
                                    "name": tool.name,
                                    "description": tool.description,
                                    "url": tool.url,
                                    "method": tool.method,
                                    "headers": tool.headers,
                                    "parameters": tool.parameters,
                                    "body_template": tool.body_template,
                                    "connection_id": str(tool.connection_id) if tool.connection_id else None,
                                })

            if not agent_dict:
                return json.dumps({"error": f"Agent '{agent_name}' not found"})

            provider = AnthropicProvider()
            model_router = ModelRouter()
            runner = AgentRunner(provider, model_router)
            contract = AgentContract(**agent_dict)
            step = await runner.run(contract, task, tools=agent_tools)
            return json.dumps({"status": step.status, "output": step.output, "tokens": step.tokens_used}, default=str)

        elif tool_name == "run_tool":
            from backend.core.tools.executor import execute_api_tool

            t_name = tool_input["tool_name"]
            args = tool_input.get("arguments", {})

            result = await db.execute(select(Tool).where(Tool.name == t_name))
            tool = result.scalar_one_or_none()
            if not tool:
                return json.dumps({"error": f"Tool '{t_name}' not found"})

            tool_config = {
                "id": str(tool.id),
                "name": tool.name,
                "url": tool.url,
                "method": tool.method,
                "headers": tool.headers,
                "parameters": tool.parameters,
                "body_template": tool.body_template,
                "connection_id": str(tool.connection_id) if tool.connection_id else None,
            }
            api_result = await execute_api_tool(tool_config, args)
            return json.dumps(api_result, default=str)

        elif tool_name == "start_workflow":
            from backend.core.contracts.workflow import WorkflowDefinition
            from backend.core.engine.orchestrator import OrchestrationEngine

            wf_name = tool_input["workflow_name"]
            input_data = tool_input.get("input_data", {})

            result = await db.execute(select(Workflow).where(Workflow.name == wf_name))
            w = result.scalar_one_or_none()
            if not w:
                return json.dumps({"error": f"Workflow '{wf_name}' not found"})

            workflow = WorkflowDefinition.model_validate_json(w.definition_json)
            engine = OrchestrationEngine()
            run_state = await engine.start(workflow, input_data)
            return json.dumps({
                "run_id": run_state.run_id,
                "status": run_state.status,
                "steps_completed": run_state.total_steps,
                "tokens": run_state.total_tokens,
            }, default=str)

        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as e:
        logger.error("tool_execution_error", tool=tool_name, error=str(e))
        return json.dumps({"error": str(e)})


def _serialize_conv(c: Conversation) -> dict:
    return {
        "id": str(c.id),
        "title": c.title,
        "initiated_by": c.initiated_by,
        "agent_name": c.agent_name,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("")
async def list_conversations(project_id: str | None = None, db: AsyncSession = Depends(get_db)):
    # Only return orchestrator chats — builder chats are returned from /api/builders/conversations
    query = select(Conversation).where(Conversation.context_type == "orchestrator").order_by(Conversation.updated_at.desc())
    if project_id:
        query = query.where(Conversation.project_id == uuid.UUID(project_id))
    result = await db.execute(query)
    return [_serialize_conv(c) for c in result.scalars().all()]


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str, db: AsyncSession = Depends(get_db)):
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
async def send_message(msg: MessageSend, db: AsyncSession = Depends(get_db)):
    # Create or get conversation
    if msg.conversation_id:
        conv_id = uuid.UUID(msg.conversation_id)
    else:
        conv = Conversation(
            title=msg.content[:50],
            initiated_by="user",
            context_type="orchestrator",
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

    # Call LLM
    from backend.core.providers.base import LLMRequest

    selected_model = msg.model or ""
    if selected_model.startswith(("gpt", "o3", "o1")):
        provider = ModelRouter.get_provider("openai")
    else:
        provider = ModelRouter.get_provider("anthropic")
    model_router = ModelRouter()
    orchestrator_tools = _build_orchestrator_tools()

    request = LLMRequest(
        model=msg.model or model_router.resolve("balanced"),
        system_prompt=await _build_system_prompt(db),
        messages=messages,
        tools=orchestrator_tools,
        temperature=0.3,
        max_tokens=32000,
    )

    assistant_content = ""
    token_metadata: dict = {}
    try:
        response = await provider.complete(request)

        if response.tool_calls:
            tool_results = []
            for tc in response.tool_calls:
                result = await _execute_tool_call(tc["name"], tc["input"], db)
                tool_results.append({"tool": tc["name"], "result": json.loads(result)})

            initial_response = response.content or ""
            results_json = json.dumps(tool_results, ensure_ascii=False, default=str)
            summary_request = LLMRequest(
                model=msg.model or model_router.resolve("balanced"),
                system_prompt="Summarize tool results in natural language. Use the user's language. Be concise. Don't show raw JSON.",
                messages=[
                    *messages,
                    {"role": "assistant", "content": initial_response},
                    {"role": "user", "content": f"Tool execution results:\n{results_json}\n\nSummarize."},
                ],
                temperature=0.3,
                max_tokens=32000,
            )
            try:
                summary = await provider.complete(summary_request)
                assistant_content = (initial_response + "\n\n" + summary.content).strip() if initial_response else summary.content
            except Exception:
                assistant_content = initial_response or "Tools executed."
        else:
            assistant_content = response.content

        token_metadata = {
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "tokens_used": response.input_tokens + response.output_tokens,
            "model": response.model or (msg.model or ""),
            "provider": "openai" if (msg.model or "").startswith(("gpt", "o3", "o1")) else "anthropic",
        }
    except Exception as e:
        logger.error("chat_error", error=str(e))
        assistant_content = f"Error: {e}"

    # Save assistant message
    assistant_msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content=assistant_content,
        message_metadata=token_metadata,
    )
    db.add(assistant_msg)

    # Update conversation title if first message
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


@router.post("/agent-initiated")
async def agent_creates_conversation(msg: AgentMessage, db: AsyncSession = Depends(get_db)):
    conv = Conversation(
        title=f"{msg.agent_name}: {msg.content[:40]}",
        initiated_by="agent",
        agent_name=msg.agent_name,
        project_id=uuid.UUID(msg.project_id) if msg.project_id else None,
    )
    db.add(conv)
    await db.flush()

    message = Message(
        conversation_id=conv.id,
        role="agent",
        content=msg.content,
        message_metadata={"agent_name": msg.agent_name, **msg.metadata},
    )
    db.add(message)
    await db.commit()

    return {"conversation_id": str(conv.id), "agent_name": msg.agent_name}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Conversation).where(Conversation.id == uuid.UUID(conversation_id)))
    await db.commit()
    return {"status": "deleted"}
