import json
import uuid

import structlog

from backend.core.contracts.workflow import WorkflowDefinition
from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter

logger = structlog.get_logger()

SYSTEM_PROMPT = """You are a workflow architect. Given a user's description of a business process,
generate a valid JSON workflow. Keep it CONCISE — use 5-8 nodes max.

Output ONLY valid JSON (no markdown, no explanation). Schema:
{
  "name": "string",
  "entry_node": "first_node_id",
  "nodes": [
    {
      "id": "string",
      "type": "deterministic|agent|router|human",
      "agent_name": "classifier|extractor|validator|risk_scorer|decision_maker|draft_writer|null",
      "next_nodes": ["next_node_id"],
      "config": {}
    }
  ]
}

Rules:
- 5-8 nodes maximum
- Keep node IDs short (e.g. "intake", "classify", "extract")
- Only use these agent_name values: classifier, extractor, validator, risk_scorer, decision_maker, draft_writer
- The last node must have "next_nodes": []
- For deterministic nodes: agent_name is null
- For agent nodes: agent_name is required
- Output ONLY the JSON object, nothing else"""


class WorkflowGenerator:
    def __init__(self) -> None:
        self.provider = AnthropicProvider()
        self.model_router = ModelRouter()

    async def generate(self, user_description: str) -> WorkflowDefinition:
        model = self.model_router.resolve("balanced")

        request = LLMRequest(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Generate a compact workflow for: {user_description}",
                }
            ],
            temperature=0.0,
            max_tokens=2048,
        )

        response = await self.provider.complete(request)
        content = response.content.strip()

        # Extract JSON from response
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            content = content[start:end + 1]

        try:
            workflow_data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error("workflow_json_parse_error", error=str(e), content_length=len(content))
            raise ValueError(f"Claude returned invalid JSON: {e}") from e

        # Ensure required fields
        workflow_data.setdefault("id", str(uuid.uuid4()))
        workflow_data.setdefault("version", "1.0.0")
        workflow_data.setdefault("max_total_cost_usd", 2.0)
        workflow_data.setdefault("max_total_steps", 50)

        # Ensure each node has required fields
        for node in workflow_data.get("nodes", []):
            node.setdefault("next_nodes", [])
            node.setdefault("condition", None)
            node.setdefault("parallel_nodes", [])
            node.setdefault("timeout_seconds", 120)
            node.setdefault("config", {})

        workflow = WorkflowDefinition.model_validate(workflow_data)
        logger.info("workflow_generated", name=workflow.name, nodes=len(workflow.nodes))
        return workflow
