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
        messages: list[dict[str, Any]] = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.extend(request.messages)

        # OpenAI chat models cap output at ~16k tokens (gpt-4o: 16384). Passing
        # higher values raises an API error. Silently clip so the caller's
        # 32k default doesn't break things if the user picks a gpt-* model.
        effective_max_tokens = min(request.max_tokens, 16384)

        kwargs: dict[str, Any] = {
            "model": request.model,
            "messages": messages,
            "max_tokens": effective_max_tokens,
            "temperature": request.temperature,
        }

        if request.output_schema:
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
            client = await self._get_client()
            await client.chat.completions.create(
                model=MODEL_MAP["fast"],
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except Exception:
            return False
