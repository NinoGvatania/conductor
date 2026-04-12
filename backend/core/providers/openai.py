"""OpenAI provider with full tool-use support.

Handles the format differences between Anthropic and OpenAI APIs:
- Tool schemas: Anthropic uses `input_schema`, OpenAI uses `parameters` inside `function`
- Messages: Anthropic uses content blocks [{type: "tool_use"}], OpenAI uses `.tool_calls` on assistant + role="tool" messages
- Tool results: Anthropic uses `tool_result` content blocks, OpenAI uses separate messages with role="tool"
"""
import json
import time
from typing import Any

import structlog

from backend.core.contracts.errors import RetriableError
from backend.core.providers.base import LLMProvider, LLMRequest, LLMResponse
from backend.core.providers.key_store import get_api_key

logger = structlog.get_logger()

MODEL_MAP: dict[str, str] = {
    "fast": "gpt-4o-mini",
    "balanced": "gpt-4o",
    "powerful": "o3",
}


def _convert_tools_to_openai(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Anthropic-style tool schemas to OpenAI function-calling format.

    Anthropic: {name, description, input_schema: {type: "object", properties: ...}}
    OpenAI:    {type: "function", function: {name, description, parameters: {type: "object", properties: ...}}}
    """
    result = []
    for tool in tools:
        result.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", tool.get("parameters", {"type": "object", "properties": {}})),
            },
        })
    return result


def _convert_messages_for_openai(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Anthropic-style messages (with tool_use/tool_result content blocks)
    to OpenAI format (assistant.tool_calls + role=tool messages).

    Anthropic assistant message:
      {role: "assistant", content: [{type: "text", text: "..."}, {type: "tool_use", id, name, input}]}

    OpenAI assistant message:
      {role: "assistant", content: "...", tool_calls: [{id, type: "function", function: {name, arguments: JSON}}]}

    Anthropic tool result:
      {role: "user", content: [{type: "tool_result", tool_use_id, content: "..."}]}

    OpenAI tool result:
      {role: "tool", tool_call_id: "...", content: "..."}
    """
    result: list[dict[str, Any]] = []

    for msg in messages:
        content = msg.get("content")

        # Simple string content — pass through
        if isinstance(content, str):
            result.append(msg)
            continue

        # Content is a list of blocks — need conversion
        if isinstance(content, list):
            role = msg.get("role", "user")

            if role == "assistant":
                # Extract text + tool_use blocks
                text_parts: list[str] = []
                tool_calls: list[dict[str, Any]] = []
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                        elif block.get("type") == "tool_use":
                            tool_calls.append({
                                "id": block.get("id", ""),
                                "type": "function",
                                "function": {
                                    "name": block.get("name", ""),
                                    "arguments": json.dumps(block.get("input", {})),
                                },
                            })

                assistant_msg: dict[str, Any] = {
                    "role": "assistant",
                    "content": "\n".join(text_parts) if text_parts else None,
                }
                if tool_calls:
                    assistant_msg["tool_calls"] = tool_calls
                result.append(assistant_msg)

            elif role == "user":
                # Check if this is a tool_result message
                has_tool_results = any(
                    isinstance(b, dict) and b.get("type") == "tool_result"
                    for b in content
                )
                if has_tool_results:
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            result.append({
                                "role": "tool",
                                "tool_call_id": block.get("tool_use_id", ""),
                                "content": block.get("content", ""),
                            })
                else:
                    # Regular user message with content blocks — concatenate text
                    texts = [
                        b.get("text", "") if isinstance(b, dict) else str(b)
                        for b in content
                    ]
                    result.append({"role": "user", "content": "\n".join(texts)})
            else:
                result.append(msg)
        else:
            result.append(msg)

    return result


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key
        self._client = None

    async def _get_client(self):
        if self._client is None:
            try:
                import openai
            except ImportError:
                raise ImportError("Install openai: pip install openai")
            key = self._api_key
            if not key:
                key = await get_api_key("openai")
            if not key:
                raise ValueError("OpenAI API key not configured. Go to Settings → OpenAI → Connect.")
            self._client = openai.AsyncOpenAI(api_key=key)
        return self._client

    async def complete(self, request: LLMRequest) -> LLMResponse:
        import openai

        start = time.monotonic()

        # Convert messages from Anthropic format to OpenAI format
        messages: list[dict[str, Any]] = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(_convert_messages_for_openai(request.messages))

        # OpenAI chat models cap output at ~16k tokens (gpt-4o: 16384).
        effective_max_tokens = min(request.max_tokens or 16384, 16384)

        kwargs: dict[str, Any] = {
            "model": request.model,
            "messages": messages,
            "max_tokens": effective_max_tokens,
            "temperature": request.temperature,
        }

        # Convert and pass tools if provided
        if request.tools:
            kwargs["tools"] = _convert_tools_to_openai(request.tools)
            if request.tool_choice:
                if request.tool_choice == "any":
                    kwargs["tool_choice"] = "required"
                elif request.tool_choice == "auto":
                    kwargs["tool_choice"] = "auto"
                else:
                    kwargs["tool_choice"] = {
                        "type": "function",
                        "function": {"name": request.tool_choice},
                    }

        if request.output_schema and not request.tools:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            client = await self._get_client()
            response = await client.chat.completions.create(**kwargs)
        except openai.RateLimitError as e:
            raise RetriableError(str(e), reason="rate_limit") from e
        except openai.APITimeoutError as e:
            raise RetriableError(str(e), reason="timeout") from e

        latency_ms = (time.monotonic() - start) * 1000
        choice = response.choices[0]
        content = choice.message.content or ""
        tool_calls: list[dict[str, Any]] = []

        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": args,
                })

        structured_output = None
        if request.output_schema and content:
            try:
                structured_output = json.loads(content)
            except json.JSONDecodeError:
                pass

        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            structured_output=structured_output,
            input_tokens=response.usage.prompt_tokens if response.usage else 0,
            output_tokens=response.usage.completion_tokens if response.usage else 0,
            model=response.model,
            latency_ms=latency_ms,
        )

    async def health_check(self) -> bool:
        try:
            client = await self._get_client()
            await client.chat.completions.create(
                model=MODEL_MAP["fast"],
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
