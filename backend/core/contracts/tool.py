from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    read_only = "read_only"
    write = "write"
    high_risk = "high_risk"
    code_execution = "code_execution"


class ToolContract(BaseModel):
    name: str
    description: str
    parameters_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    risk_level: RiskLevel = RiskLevel.read_only
    side_effecting: bool = False
    requires_approval: bool = False
    timeout_seconds: int = 30
    idempotent: bool = True
