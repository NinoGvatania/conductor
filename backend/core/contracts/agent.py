from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ModelTier(str, Enum):
    fast = "fast"
    balanced = "balanced"
    powerful = "powerful"


class AgentContract(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    description: str = ""
    purpose: str = ""
    model_tier: ModelTier = ModelTier.balanced
    # Optional explicit model id (e.g. "claude-sonnet-4-6", "gpt-4o"). If set
    # takes priority over model_tier; otherwise ModelRouter resolves tier →
    # model using the provider's catalog.
    model: str | None = None
    provider: str = "anthropic"
    system_prompt: str = ""
    constraints: str = ""
    clarification_rules: str = ""
    allowed_tools: list[str] = Field(default_factory=list)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    # None means "let the provider pick its model's maximum output tokens".
    # Users can set a specific limit for cost control.
    max_tokens: int | None = None
    temperature: float = 0.0
    timeout_seconds: int = 120
    max_retries: int = 3
    retry_on: list[str] = Field(
        default_factory=lambda: ["timeout", "rate_limit", "schema_validation"]
    )
    can_write: bool = False
    escalation_policy: str = "pause_and_notify"
    grounding_check: bool = False
    version: str = "1.0.0"
    status: str = "active"
