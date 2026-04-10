import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter
from backend.database import get_supabase_client

logger = structlog.get_logger()
router = APIRouter(prefix="/api/tools", tags=["tools"])


class ToolCreate(BaseModel):
    name: str
    description: str = ""
    url: str = ""
    method: str = "POST"
    headers: dict[str, Any] = Field(default_factory=dict)
    parameters: dict[str, Any] = Field(default_factory=dict)
    body_template: dict[str, Any] = Field(default_factory=dict)
    is_public: bool = False
    project_id: str | None = None


class ToolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    method: str | None = None
    headers: dict[str, Any] | None = None
    parameters: dict[str, Any] | None = None
    body_template: dict[str, Any] | None = None
    is_public: bool | None = None


class ToolWizardRequest(BaseModel):
    api_docs: str  # paste API documentation or URL
    description: str = ""  # optional hint about what the tool should do


WIZARD_PROMPT = """You are an API tool configuration generator. Given API documentation or a URL,
generate a CONCISE JSON array of tool configurations. Extract only the most important endpoints.

Rules:
- Generate MAX 5-8 most important endpoints (not all)
- Keep descriptions short (1 sentence)
- Output ONLY valid JSON array, no markdown
- Use {api_key} or {token} placeholders in auth headers

Schema for each tool:
{
  "name": "snake_case_name",
  "description": "Short description",
  "url": "https://api.example.com/endpoint",
  "method": "GET|POST|PUT|DELETE",
  "headers": {"Authorization": "Bearer {api_key}"},
  "parameters": {
    "type": "object",
    "properties": {"param": {"type": "string"}},
    "required": ["param"]
  }
}"""


@router.post("/wizard")
async def tool_wizard(request: ToolWizardRequest):
    """AI parses API documentation and generates tool configs."""
    provider = AnthropicProvider()
    model_router = ModelRouter()

    llm_request = LLMRequest(
        model=model_router.resolve("balanced"),
        system_prompt=WIZARD_PROMPT,
        messages=[{"role": "user", "content": f"Generate tool configs from:\n\n{request.api_docs[:5000]}\n\n{f'Focus: {request.description}' if request.description else ''}"}],
        temperature=0.0,
        max_tokens=8192,
    )

    try:
        response = await provider.complete(llm_request)
        content = response.content.strip()

        # Strip markdown code fences
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        # Extract JSON array
        start = content.find("[")
        end = content.rfind("]")
        if start >= 0 and end > start:
            content = content[start:end + 1]

        try:
            tools = json.loads(content)
        except json.JSONDecodeError:
            # Try to repair incomplete JSON by removing last incomplete object
            last_comma = content.rfind("},")
            if last_comma > 0:
                content = content[:last_comma + 1] + "]"
                tools = json.loads(content)
            else:
                raise

        if not isinstance(tools, list):
            tools = [tools]

        return {"tools": tools, "count": len(tools)}
    except json.JSONDecodeError as e:
        logger.error("wizard_json_error", error=str(e), content_preview=content[:500] if content else "")
        raise HTTPException(status_code=422, detail=f"AI returned invalid JSON. Try providing a shorter documentation or more specific focus.") from e
    except Exception as e:
        logger.error("wizard_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("")
async def list_tools(project_id: str | None = None):
    client = get_supabase_client()
    query = client.table("tools").select("*").order("created_at", desc=True)
    if project_id:
        query = query.eq("project_id", project_id)
    result = query.execute()
    return result.data


@router.post("")
async def create_tool(tool: ToolCreate):
    client = get_supabase_client()
    tool_id = str(uuid.uuid4())
    data = {"id": tool_id, **tool.model_dump()}
    try:
        client.table("tools").insert(data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return data


@router.get("/{tool_id}")
async def get_tool(tool_id: str):
    client = get_supabase_client()
    result = client.table("tools").select("*").eq("id", tool_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tool not found")
    return result.data


@router.put("/{tool_id}")
async def update_tool(tool_id: str, update: ToolUpdate):
    client = get_supabase_client()
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    client.table("tools").update(data).eq("id", tool_id).execute()
    return {"status": "updated"}


@router.delete("/{tool_id}")
async def delete_tool(tool_id: str):
    client = get_supabase_client()
    client.table("tools").delete().eq("id", tool_id).execute()
    return {"status": "deleted"}
