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


class ApprovalResponse(BaseModel):
    decision: str  # "approve" or "reject"
    comment: str = ""


ORCHESTRATOR_PROMPT = """You are AgentFlow orchestrator. The user gives you tasks.

You have these agents available:
- classifier: classifies documents/requests (fast)
- extractor: extracts structured data from text (balanced)
- validator: checks data completeness (balanced)
- risk_scorer: assesses risk (powerful)
- decision_maker: approve/reject/escalate decisions (powerful)
- draft_writer: writes professional text (balanced)

Also check if the user has custom agents and tools configured.

When the user gives you a task:
1. Analyze what needs to be done
2. Propose a plan: which agents/tools to use and in what order
3. Ask for approval: "Shall I proceed with this plan?"
4. After approval, execute step by step

Always respond in the user's language.
Format your plan clearly with numbered steps.
If you need clarification, ask."""


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
        client.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("/send")
async def send_message(msg: MessageSend):
    client = get_supabase_client()

    # Create conversation if needed
    conv_id = msg.conversation_id
    if not conv_id:
        conv_id = str(uuid.uuid4())
        conv_data: dict[str, Any] = {
            "id": conv_id,
            "title": msg.content[:50],
            "initiated_by": "user",
        }
        if msg.project_id:
            conv_data["project_id"] = msg.project_id
        client.table("conversations").insert(conv_data).execute()

    # Save user message
    user_msg_id = str(uuid.uuid4())
    client.table("messages").insert({
        "id": user_msg_id,
        "conversation_id": conv_id,
        "role": "user",
        "content": msg.content,
    }).execute()

    # Load conversation history
    history = client.table("messages").select("role, content").eq(
        "conversation_id", conv_id
    ).order("created_at").execute()

    messages = []
    for m in history.data:
        role = "user" if m["role"] == "user" else "assistant"
        messages.append({"role": role, "content": m["content"]})

    # Call LLM
    from backend.core.providers.anthropic import AnthropicProvider
    from backend.core.providers.base import LLMRequest

    provider = AnthropicProvider()
    model_router = ModelRouter()

    request = LLMRequest(
        model=model_router.resolve("balanced"),
        system_prompt=ORCHESTRATOR_PROMPT,
        messages=messages,
        temperature=0.3,
        max_tokens=2048,
    )

    try:
        response = await provider.complete(request)
        assistant_content = response.content
    except Exception as e:
        logger.error("chat_error", error=str(e))
        assistant_content = f"Error: {e}"

    # Save assistant message
    assistant_msg_id = str(uuid.uuid4())
    client.table("messages").insert({
        "id": assistant_msg_id,
        "conversation_id": conv_id,
        "role": "assistant",
        "content": assistant_content,
        "metadata": json.dumps({
            "tokens": getattr(response, "input_tokens", 0) + getattr(response, "output_tokens", 0),
            "model": getattr(response, "model", ""),
        }),
    }).execute()

    # Update conversation title if first message
    if len(history.data) <= 1:
        client.table("conversations").update(
            {"title": msg.content[:50], "updated_at": "now()"}
        ).eq("id", conv_id).execute()

    return {
        "conversation_id": conv_id,
        "message": {
            "id": assistant_msg_id,
            "role": "assistant",
            "content": assistant_content,
        },
    }


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    client = get_supabase_client()
    client.table("messages").delete().eq("conversation_id", conversation_id).execute()
    client.table("conversations").delete().eq("id", conversation_id).execute()
    return {"status": "deleted"}
