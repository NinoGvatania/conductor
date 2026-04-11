from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    waiting_approval = "waiting_approval"


class StepResult(BaseModel):
    node_id: str
    status: StepStatus = StepStatus.pending
    agent_name: str | None = None
    provider: str | None = None
    model: str | None = None
    output: Any = None
    error: str | None = None
    tokens_used: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: float = 0.0
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    retries: int = 0
    guardrail_triggers: list[str] = Field(default_factory=list)


class RunStatus(str, Enum):
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"


class RunState(BaseModel):
    run_id: str
    workflow_id: str
    workflow_version: str = "1.0.0"
    status: RunStatus = RunStatus.running
    current_node: str | None = None
    input_data: dict[str, Any] = Field(default_factory=dict)
    steps: list[StepResult] = Field(default_factory=list)
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_steps: int = 0
    intermediate_results: dict[str, Any] = Field(default_factory=dict)
    pending_approval: dict[str, Any] | None = None

    def record_step(self, step: StepResult) -> None:
        existing = next((i for i, s in enumerate(self.steps) if s.node_id == step.node_id), None)
        if existing is not None:
            self.steps[existing] = step
        else:
            self.steps.append(step)
        self.total_tokens += step.tokens_used
        self.total_cost_usd += step.cost_usd
        self.total_steps = len(self.steps)
        if step.output is not None:
            self.intermediate_results[step.node_id] = step.output

    def get_step(self, node_id: str) -> StepResult | None:
        return next((s for s in self.steps if s.node_id == node_id), None)
