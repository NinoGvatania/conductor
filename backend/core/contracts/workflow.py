from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NodeType(str, Enum):
    deterministic = "deterministic"
    agent = "agent"
    router = "router"
    parallel = "parallel"
    human = "human"
    evaluator = "evaluator"
    trigger = "trigger"


class NodeDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: NodeType
    agent_name: str | None = None
    next_nodes: list[str] = Field(default_factory=list)
    condition: str | None = None
    parallel_nodes: list[str] = Field(default_factory=list)
    timeout_seconds: int = 300
    config: dict[str, Any] = Field(default_factory=dict)
    # Purpose of this node in context of the whole workflow
    description: str = ""


class WorkflowDefinition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    description: str = ""
    version: str = "1.0.0"
    entry_node: str
    nodes: list[NodeDefinition]
    # Key format: "source_node_id->target_node_id" → explanation of the connection
    edge_descriptions: dict[str, str] = Field(default_factory=dict)
    max_total_cost_usd: float = 10_000.0
    max_total_steps: int = 1000
