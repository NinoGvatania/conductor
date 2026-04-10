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


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str | None = None) -> None:
        key = api_key or get_api_key("anthropic")
        if not key:
            raise ValueError("Anthropic API key not configured. Go to Settings → Anthropic → Connect.")
        self.client = anthropic.AsyncAnthropic(api_key=key)

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

        kwargs: dict[str, Any] = {
            "model": request.model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "messages": request.messages,
        }
        if request.system_prompt:
            kwargs["system"] = request.system_prompt
        if request.tools:
            kwargs["tools"] = request.tools

        response = await self.client.messages.create(**kwargs)
        latency_ms = (time.monotonic() - start) * 1000

        content = ""
        tool_calls: list[dict[str, Any]] = []
        structured_output: dict[str, Any] | None = None

        for block in response.content:
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
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            model=response.model,
            latency_ms=latency_ms,
        )

    async def health_check(self) -> bool:
        try:
            await self.client.messages.create(
                model=MODEL_MAP["fast"],
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
