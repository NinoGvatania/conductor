import json
import re
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


async def _get_connection_credentials(connection_id: str) -> dict[str, Any]:
    """Fetch credentials for a connection from DB (async)."""
    try:
        import uuid as _uuid

        from sqlalchemy import select

        from backend.database import async_session_factory
        from backend.models import Connection

        async with async_session_factory() as db:
            result = await db.execute(select(Connection).where(Connection.id == _uuid.UUID(connection_id)))
            conn = result.scalar_one_or_none()
            if conn:
                return {
                    "credentials": conn.credentials or {},
                    "base_url": conn.base_url or "",
                    "auth_type": conn.auth_type or "api_key",
                }
    except Exception as e:
        logger.warning("connection_fetch_error", error=str(e))
    return {"credentials": {}, "base_url": "", "auth_type": "api_key"}


def _inject_credentials(template: Any, credentials: dict[str, Any]) -> Any:
    """Replace {placeholder} tokens in strings with credential values."""
    if isinstance(template, str):
        def replace(match: re.Match) -> str:
            key = match.group(1)
            return str(credentials.get(key, match.group(0)))
        return re.sub(r"\{(\w+)\}", replace, template)
    elif isinstance(template, dict):
        return {k: _inject_credentials(v, credentials) for k, v in template.items()}
    elif isinstance(template, list):
        return [_inject_credentials(item, credentials) for item in template]
    return template


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
        - connection_id: str (optional, for credential injection)
    """
    # Load connection credentials if linked
    credentials: dict[str, Any] = {}
    conn_base_url = ""
    connection_id = tool_config.get("connection_id")
    if connection_id:
        conn_data = await _get_connection_credentials(connection_id)
        credentials = conn_data["credentials"]
        conn_base_url = conn_data["base_url"]

    url = tool_config.get("url", "")
    method = tool_config.get("method", "POST").upper()
    headers = tool_config.get("headers", {})
    body_template = tool_config.get("body_template")

    # Inject credentials into URL and headers
    url = _inject_credentials(url, credentials)
    headers = _inject_credentials(headers, credentials)
    if body_template:
        body_template = _inject_credentials(body_template, credentials)

    # Prepend base_url if url is relative
    if conn_base_url and not url.startswith("http"):
        url = conn_base_url.rstrip("/") + "/" + url.lstrip("/")

    # Flatten arguments (if LLM wrapped them in "data")
    if isinstance(arguments, dict) and "data" in arguments and len(arguments) == 1 and isinstance(arguments["data"], dict):
        arguments = arguments["data"]

    # Inject credentials into ALL string arguments (LLM may pass "{api_key}" literally)
    arguments = {k: _inject_credentials(v, credentials) for k, v in arguments.items()}

    # Apply credential defaults from parameter schema (e.g. appid={api_key})
    # Auto-fill missing params that have credential defaults
    params_schema = tool_config.get("parameters", {})
    if isinstance(params_schema, dict):
        props = params_schema.get("properties", {}) or {}
        for key, spec in props.items():
            if not isinstance(spec, dict):
                continue
            default = spec.get("default")
            if isinstance(default, str) and "{" in default:
                # Always inject, overwriting any placeholder the LLM passed
                injected = _inject_credentials(default, credentials)
                if injected != default:
                    arguments[key] = injected

    # Replace {placeholder} in URL path with arguments (e.g. /users/{id})
    for key, value in list(arguments.items()):
        placeholder = f"{{{key}}}"
        if placeholder in url:
            url = url.replace(placeholder, str(value))

    # Build request body / query params
    body = None
    query_params: dict[str, Any] = {}

    if method in ("POST", "PUT", "PATCH"):
        if body_template:
            body = {**body_template}
            for key, value in arguments.items():
                body[key] = value
        else:
            body = arguments
    else:
        # GET/DELETE: put args as query params
        for key, value in arguments.items():
            if f"{{{key}}}" not in tool_config.get("url", ""):
                query_params[key] = value

    logger.info("tool_api_call", method=method, url=url, query=list(query_params.keys()), has_body=body is not None)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=query_params if query_params else None,
                json=body if body else None,
            )
            try:
                result = response.json()
            except json.JSONDecodeError:
                result = {"text": response.text}

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
