import asyncio
import json
import time
from typing import Any

import anthropic
import structlog

from backend.core.contracts.errors import RetriableError
from backend.core.providers.base import LLMProvider, LLMRequest, LLMResponse
from backend.core.providers.key_store import get_api_key

logger = structlog.get_logger()

MODEL_MAP: dict[str, str] = {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-6",
    "powerful": "claude-opus-4-6",
}

# Maximum output tokens per model family. Used when LLMRequest.max_tokens is
# None ("use the model's default cap"). All recent Claude 4.x models accept
# 32000 output tokens; older ones are lower. If the model isn't listed we
# fall back to 32000 which the API will reject if too high.
ANTHROPIC_MODEL_MAX_OUTPUT: dict[str, int] = {
    "claude-haiku-4-5-20251001": 32000,
    "claude-sonnet-4-6": 32000,
    "claude-opus-4-6": 32000,
    "claude-sonnet-4-5-20250929": 32000,
    "claude-sonnet-4-20250514": 32000,
    "claude-opus-4-1-20250805": 32000,
    "claude-opus-4-5-20251101": 32000,
    "claude-haiku-3-5": 8192,
    "claude-3-5-sonnet-20241022": 8192,
    "claude-3-5-haiku-20241022": 8192,
    "claude-3-opus-20240229": 4096,
}


def _default_max_tokens(model: str) -> int:
    return ANTHROPIC_MODEL_MAX_OUTPUT.get(model, 32000)


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str | None = None) -> None:
        # Lazy init — key will be loaded on first complete() call
        self._api_key = api_key
        self._client: anthropic.AsyncAnthropic | None = None

    async def _get_client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            key = self._api_key
            if not key:
                key = await get_api_key("anthropic")
            if not key:
                raise ValueError("Anthropic API key not configured. Go to Settings → Anthropic → Connect.")
            self._client = anthropic.AsyncAnthropic(api_key=key)
        return self._client

    async def complete(self, request: LLMRequest) -> LLMResponse:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                return await self._do_complete(request)
            except anthropic.RateLimitError as e:
                if attempt == max_retries - 1:
                    raise RetriableError(str(e), reason="rate_limit") from e
                wait = 2 ** (attempt + 1)
                logger.warning("rate_limited", attempt=attempt, wait_seconds=wait)
                await asyncio.sleep(wait)
            except anthropic.APITimeoutError as e:
                if attempt == max_retries - 1:
                    raise RetriableError(str(e), reason="timeout") from e
                wait = 2 ** (attempt + 1)
                logger.warning("timeout", attempt=attempt, wait_seconds=wait)
                await asyncio.sleep(wait)
        raise RetriableError("Max retries exceeded", reason="timeout")

    async def _do_complete(self, request: LLMRequest) -> LLMResponse:
        start = time.monotonic()

        # If caller didn't specify max_tokens, use the model's natural cap
        effective_max_tokens = request.max_tokens or _default_max_tokens(request.model)

        kwargs: dict[str, Any] = {
            "model": request.model,
            "max_tokens": effective_max_tokens,
            "temperature": request.temperature,
            "messages": request.messages,
        }
        if request.system_prompt:
            kwargs["system"] = request.system_prompt
        if request.tools:
            kwargs["tools"] = request.tools
            if request.tool_choice:
                if request.tool_choice in ("auto", "any"):
                    kwargs["tool_choice"] = {"type": request.tool_choice}
                else:
                    kwargs["tool_choice"] = {"type": "tool", "name": request.tool_choice}

        client = await self._get_client()

        # Use streaming — the Anthropic SDK requires it for requests whose
        # worst-case runtime can exceed 10 minutes (which is anything with
        # a large max_tokens like 32000). `.stream()` collects chunks and
        # gives us a final assembled message equivalent to non-streaming.
        async with client.messages.stream(**kwargs) as stream:
            final_message = await stream.get_final_message()

        latency_ms = (time.monotonic() - start) * 1000

        content = ""
        tool_calls: list[dict[str, Any]] = []
        structured_output: dict[str, Any] | None = None

        for block in final_message.content:
            if block.type == "text":
                content += block.text
            elif block.type == "tool_use":
                tool_calls.append(
                    {"id": block.id, "name": block.name, "input": block.input}
                )

        if request.output_schema and content:
            try:
                structured_output = json.loads(content)
            except json.JSONDecodeError:
                pass

        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            structured_output=structured_output,
            input_tokens=final_message.usage.input_tokens,
            output_tokens=final_message.usage.output_tokens,
            model=final_message.model,
            latency_ms=latency_ms,
        )

    async def health_check(self) -> bool:
        try:
            client = await self._get_client()
            await client.messages.create(
                model=MODEL_MAP["fast"],
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
