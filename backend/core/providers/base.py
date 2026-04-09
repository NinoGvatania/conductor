from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class LLMRequest(BaseModel):
    model: str
    system_prompt: str = ""
    messages: list[dict[str, Any]] = Field(default_factory=list)
    tools: list[dict[str, Any]] = Field(default_factory=list)
    output_schema: dict[str, Any] | None = None
    temperature: float = 0.0
    max_tokens: int = 4096


class LLMResponse(BaseModel):
    content: str = ""
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    structured_output: dict[str, Any] | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    latency_ms: float = 0.0


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse:
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
