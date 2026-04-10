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


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str | None = None) -> None:
        try:
            import openai
        except ImportError:
            raise ImportError("Install openai: pip install openai")
        key = api_key or get_api_key("openai")
        if not key:
            raise ValueError("OpenAI API key not configured. Go to Settings → OpenAI → Connect.")
        self.client = openai.AsyncOpenAI(api_key=key)

    async def complete(self, request: LLMRequest) -> LLMResponse:
        import openai

        start = time.monotonic()
        messages: list[dict[str, Any]] = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)

        kwargs: dict[str, Any] = {
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        if request.output_schema:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self.client.chat.completions.create(**kwargs)
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
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": json.loads(tc.function.arguments),
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
            await self.client.chat.completions.create(
                model=MODEL_MAP["fast"],
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
