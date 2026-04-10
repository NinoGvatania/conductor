import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core.providers.model_router import ModelRouter
from backend.database import get_supabase_client

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
    """Build tool definitions that let the orchestrator execute real actions."""
    return [
        {
            "name": "run_agent",
            "description": "Run a specific AI agent with a task. Use this when the user asks to classify, extract, validate, score risk, make decisions, or draft text.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Name of the agent: classifier, extractor, validator, risk_scorer, decision_maker, draft_writer, or any custom agent name"},
                    "task": {"type": "string", "description": "The task/input for the agent to process"},
                },
                "required": ["agent_name", "task"],
            },
        },
        {
            "name": "run_tool",
            "description": "Execute an API tool directly (send message, create record, etc). Use when user asks to interact with external services.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "tool_name": {"type": "string", "description": "Name of the tool to execute"},
                    "arguments": {"type": "object", "description": "Arguments to pass to the tool"},
                },
                "required": ["tool_name", "arguments"],
            },
        },
        {
            "name": "start_workflow",
            "description": "Start a saved workflow by name or ID. Use when user asks to run a full process/pipeline.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "workflow_name": {"type": "string", "description": "Name or ID of the workflow to run"},
                    "input_data": {"type": "object", "description": "Input data for the workflow"},
                },
                "required": ["workflow_name"],
            },
        },
    ]


def _build_system_prompt(agents: list[dict], tools: list[dict], workflows: list[dict]) -> str:
    agent_list = ", ".join(a.get("name", "") for a in agents) if agents else "classifier, extractor, validator, risk_scorer, decision_maker, draft_writer"
    tool_list = ", ".join(t.get("name", "") for t in tools) if tools else "(no tools configured)"
    wf_list = ", ".join(w.get("name", "") for w in workflows) if workflows else "(no workflows saved)"

    return f"""You are AgentFlow orchestrator. You manage AI agents, tools, and workflows.

Available agents: {agent_list}
Available tools: {tool_list}
Available workflows: {wf_list}

When the user gives you a task:
1. Decide which agents/tools/workflows to use
2. Propose a plan and ask for approval
3. After approval, USE THE TOOLS to execute (run_agent, run_tool, start_workflow)
4. Report results back to the user

Always respond in the user's language. Be concise and actionable.
When you need to execute something, ALWAYS use the provided tools — don't just describe what you would do."""


async def _execute_tool_call(tool_name: str, tool_input: dict[str, Any]) -> str:
    """Execute a tool call from the orchestrator and return the result as text."""
    try:
        if tool_name == "run_agent":
            from backend.core.agents.runner import AgentRunner
            from backend.core.contracts.agent import AgentContract
            from backend.core.providers.anthropic import AnthropicProvider

            agent_name = tool_input["agent_name"]
            task = tool_input["task"]

            # Load agent config
            from backend.core.engine.orchestrator import BUILTIN_AGENTS, _load_builtin_agents
            if not BUILTIN_AGENTS:
                _load_builtin_agents()

            agent_dict = BUILTIN_AGENTS.get(agent_name)
            agent_tools: list[dict] = []

            if not agent_dict:
                client = get_supabase_client()
                result = client.table("agents").select("*").eq("name", agent_name).execute()
                if result.data:
                    row = result.data[0]
                    agent_dict = {
                        "name": row["name"], "description": row.get("description", ""),
                        "purpose": row.get("purpose", ""), "model_tier": row.get("model_tier", "balanced"),
                        "system_prompt": row.get("system_prompt", ""), "output_schema": row.get("output_schema", {}),
                        "temperature": float(row.get("temperature", 0)),
                        "timeout_seconds": row.get("timeout_seconds", 120),
                        "max_retries": row.get("max_retries", 3), "max_tokens": row.get("max_tokens", 4096),
                    }
                    agent_tools = row.get("tools", []) or []

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

            client = get_supabase_client()
            result = client.table("tools").select("*").eq("name", t_name).execute()
            if not result.data:
                return json.dumps({"error": f"Tool '{t_name}' not found"})

            tool_config = result.data[0]
            api_result = await execute_api_tool(tool_config, args)
            return json.dumps(api_result, default=str)

        elif tool_name == "start_workflow":
            from backend.core.contracts.workflow import WorkflowDefinition
            from backend.core.engine.orchestrator import OrchestrationEngine

            wf_name = tool_input["workflow_name"]
            input_data = tool_input.get("input_data", {})

            client = get_supabase_client()
            result = client.table("workflows").select("definition_json").eq("name", wf_name).execute()
            if not result.data:
                result = client.table("workflows").select("definition_json").eq("id", wf_name).execute()
            if not result.data:
                return json.dumps({"error": f"Workflow '{wf_name}' not found"})

            workflow = WorkflowDefinition.model_validate_json(result.data[0]["definition_json"])
            engine = OrchestrationEngine()
            run_state = await engine.start(workflow, input_data)
            return json.dumps({
                "run_id": run_state.run_id, "status": run_state.status,
                "steps_completed": run_state.total_steps, "tokens": run_state.total_tokens,
            }, default=str)

        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as e:
        logger.error("tool_execution_error", tool=tool_name, error=str(e))
        return json.dumps({"error": str(e)})


@router.get("")
async def list_conversations(project_id: str | None = None):
    client = get_supabase_client()
    query = client.table("conversations").select("*").order("updated_at", desc=True)
    if project_id:
        query = query.eq("project_id", project_id)
    result = query.execute()
    return result.data


@router.post("")
async def create_conversation(project_id: str | None = None, title: str = "New Chat"):
    client = get_supabase_client()
    conv_id = str(uuid.uuid4())
    data: dict[str, Any] = {"id": conv_id, "title": title, "initiated_by": "user"}
    if project_id:
        data["project_id"] = project_id
    client.table("conversations").insert(data).execute()
    return data


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    client = get_supabase_client()
    result = (
        client.table("messages").select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at").execute()
    )
    return result.data


@router.post("/send")
async def send_message(msg: MessageSend):
    client = get_supabase_client()

    conv_id = msg.conversation_id
    if not conv_id:
        conv_id = str(uuid.uuid4())
        conv_data: dict[str, Any] = {"id": conv_id, "title": msg.content[:50], "initiated_by": "user"}
        if msg.project_id:
            conv_data["project_id"] = msg.project_id
        client.table("conversations").insert(conv_data).execute()

    # Save user message
    client.table("messages").insert({
        "id": str(uuid.uuid4()), "conversation_id": conv_id,
        "role": "user", "content": msg.content,
    }).execute()

    # Load context: agents, tools, workflows
    agents, tools, workflows = [], [], []
    try:
        agents = client.table("agents").select("name, description").execute().data or []
    except Exception:
        pass
    try:
        tools = client.table("tools").select("name, description").execute().data or []
    except Exception:
        pass
    try:
        workflows = client.table("workflows").select("id, name").execute().data or []
    except Exception:
        pass

    # Load conversation history
    history = client.table("messages").select("role, content").eq(
        "conversation_id", conv_id
    ).order("created_at").execute()

    messages = []
    for m in history.data:
        role = "user" if m["role"] == "user" else "assistant"
        messages.append({"role": role, "content": m["content"]})

    # Call LLM with tools — pick provider based on model
    from backend.core.providers.base import LLMRequest

    selected_model = msg.model or ""
    if selected_model.startswith("gpt") or selected_model.startswith("o3"):
        provider = ModelRouter.get_provider("openai")
    else:
        provider = ModelRouter.get_provider("anthropic")
    model_router = ModelRouter()
    orchestrator_tools = _build_orchestrator_tools()

    request = LLMRequest(
        model=msg.model or model_router.resolve("balanced"),
        system_prompt=_build_system_prompt(agents, tools, workflows),
        messages=messages,
        tools=orchestrator_tools,
        temperature=0.3,
        max_tokens=4096,
    )

    try:
        response = await provider.complete(request)

        # Handle tool calls
        if response.tool_calls:
            tool_results = []
            for tc in response.tool_calls:
                result = await _execute_tool_call(tc["name"], tc["input"])
                tool_results.append({"tool": tc["name"], "result": json.loads(result)})

            # Build response text
            assistant_content = response.content or ""
            if tool_results:
                assistant_content += "\n\n**Execution Results:**\n"
                for tr in tool_results:
                    tool_name = tr["tool"]
                    res = tr["result"]
                    if "error" in res:
                        assistant_content += f"\n- {tool_name}: Error — {res['error']}"
                    elif tool_name == "run_agent":
                        assistant_content += f"\n- Agent `{res.get('status', 'done')}` — {json.dumps(res.get('output', ''), ensure_ascii=False, default=str)[:500]}"
                    elif tool_name == "run_tool":
                        assistant_content += f"\n- Tool result: {json.dumps(res.get('data', res), ensure_ascii=False, default=str)[:300]}"
                    elif tool_name == "start_workflow":
                        assistant_content += f"\n- Workflow run `{res.get('run_id', '')[:8]}` — status: {res.get('status', 'unknown')}, steps: {res.get('steps_completed', 0)}"
        else:
            assistant_content = response.content

    except Exception as e:
        logger.error("chat_error", error=str(e))
        assistant_content = f"Error: {e}"

    # Save assistant message with token metadata
    assistant_msg_id = str(uuid.uuid4())
    token_metadata = {}
    try:
        token_metadata = {
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "tokens_used": response.input_tokens + response.output_tokens,
            "model": response.model or (msg.model or ""),
            "provider": "openai" if (msg.model or "").startswith(("gpt", "o3", "o1")) else "anthropic",
        }
    except Exception:
        pass

    client.table("messages").insert({
        "id": assistant_msg_id, "conversation_id": conv_id,
        "role": "assistant", "content": assistant_content,
        "metadata": json.dumps(token_metadata),
    }).execute()

    # Update title
    if len(history.data) <= 1:
        try:
            client.table("conversations").update({"title": msg.content[:50]}).eq("id", conv_id).execute()
        except Exception:
            pass

    return {
        "conversation_id": conv_id,
        "message": {"id": assistant_msg_id, "role": "assistant", "content": assistant_content},
    }


@router.post("/agent-initiated")
async def agent_creates_conversation(msg: AgentMessage):
    client = get_supabase_client()
    conv_id = str(uuid.uuid4())
    conv_data: dict[str, Any] = {
        "id": conv_id, "title": f"{msg.agent_name}: {msg.content[:40]}",
        "initiated_by": "agent", "agent_name": msg.agent_name,
    }
    if msg.project_id:
        conv_data["project_id"] = msg.project_id
    client.table("conversations").insert(conv_data).execute()

    client.table("messages").insert({
        "id": str(uuid.uuid4()), "conversation_id": conv_id,
        "role": "agent", "content": msg.content,
        "metadata": json.dumps({"agent_name": msg.agent_name, **msg.metadata}),
    }).execute()

    return {"conversation_id": conv_id, "agent_name": msg.agent_name}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    client = get_supabase_client()
    client.table("messages").delete().eq("conversation_id", conversation_id).execute()
    client.table("conversations").delete().eq("id", conversation_id).execute()
    return {"status": "deleted"}
