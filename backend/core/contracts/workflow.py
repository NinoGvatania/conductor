from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    deterministic = "deterministic"
    agent = "agent"
    router = "router"
    parallel = "parallel"
    human = "human"
    evaluator = "evaluator"


class NodeDefinition(BaseModel):
    id: str
    type: NodeType
    agent_name: str | None = None
    next_nodes: list[str] = Field(default_factory=list)
    condition: str | None = None
    parallel_nodes: list[str] = Field(default_factory=list)
    timeout_seconds: int = 300
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowDefinition(BaseModel):
    id: str
    name: str
    version: str = "1.0.0"
    entry_node: str
    nodes: list[NodeDefinition]
    max_total_cost_usd: float = 2.0
    max_total_steps: int = 50
