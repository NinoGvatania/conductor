import json
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


async def execute_api_tool(
    tool_config: dict[str, Any],
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Execute an API call based on tool configuration.

    tool_config expects:
        - url: str (API endpoint, can contain {placeholders})
        - method: str (GET/POST/PUT/DELETE)
        - headers: dict (including auth headers)
        - body_template: dict or None (request body template)
    """
    url = tool_config.get("url", "")
    method = tool_config.get("method", "POST").upper()
    headers = tool_config.get("headers", {})
    body_template = tool_config.get("body_template")

    # Replace placeholders in URL with arguments
    for key, value in arguments.items():
        url = url.replace(f"{{{key}}}", str(value))

    # Build request body: merge template with LLM arguments
    body = None
    if method in ("POST", "PUT", "PATCH"):
        if body_template:
            body = {**body_template}
            # Merge LLM-provided arguments into body
            for key, value in arguments.items():
                body[key] = value
        else:
            body = arguments

    logger.info("tool_api_call", method=method, url=url, has_body=body is not None)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=body if body else None,
            )
            try:
                result = response.json()
            except json.JSONDecodeError:
                result = {"text": response.text[:2000]}

            return {
                "status_code": response.status_code,
                "success": 200 <= response.status_code < 300,
                "data": result,
            }
    except httpx.TimeoutException:
        return {"success": False, "error": "Request timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def tools_to_claude_format(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert our tool configs to Claude's tool_use format."""
    claude_tools = []
    for tool in tools:
        if not tool.get("name"):
            continue
        # Build input schema from parameters or use a generic one
        params = tool.get("parameters", {})
        if not params:
            params = {
                "type": "object",
                "properties": {
                    "data": {
                        "type": "object",
                        "description": "Data to send with the API call",
                    }
                },
            }
        claude_tools.append({
            "name": tool["name"],
            "description": tool.get("description", f"Call {tool['name']} API"),
            "input_schema": params,
        })
    return claude_tools
