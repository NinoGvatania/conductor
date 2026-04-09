from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ModelTier(str, Enum):
    fast = "fast"
    balanced = "balanced"
    powerful = "powerful"


class AgentContract(BaseModel):
    name: str
    description: str
    purpose: str
    model_tier: ModelTier = ModelTier.balanced
    system_prompt: str
    allowed_tools: list[str] = Field(default_factory=list)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    max_tokens: int = 4096
    temperature: float = 0.0
    timeout_seconds: int = 120
    max_retries: int = 3
    retry_on: list[str] = Field(
        default_factory=lambda: ["timeout", "rate_limit", "schema_validation"]
    )
    can_write: bool = False
    escalation_policy: str = "pause_and_notify"
    version: str = "1.0.0"
    status: str = "active"
