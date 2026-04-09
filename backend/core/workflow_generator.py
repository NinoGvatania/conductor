import json
import uuid

import structlog

from backend.core.contracts.workflow import WorkflowDefinition
from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter

logger = structlog.get_logger()

SYSTEM_PROMPT = """You are a workflow architect. Given a user's description of a business process,
generate a valid WorkflowDefinition as JSON.

The workflow must use these node types:
- "deterministic": runs a fixed function (e.g., intake, merge)
- "agent": runs an AI agent (classifier, extractor, validator, risk_scorer, decision_maker, draft_writer)
- "router": uses LLM to classify and route to different branches
- "parallel": runs multiple sub-nodes concurrently
- "human": pauses for human review/approval
- "evaluator": validates output of a previous step

Output ONLY valid JSON matching this schema:
{
  "id": "string (uuid)",
  "name": "string",
  "version": "1.0.0",
  "entry_node": "string (id of first node)",
  "nodes": [
    {
      "id": "string",
      "type": "deterministic|agent|router|parallel|human|evaluator",
      "agent_name": "string or null",
      "next_nodes": ["string"],
      "condition": "string or null",
      "parallel_nodes": ["string"] or [],
      "timeout_seconds": number,
      "config": {}
    }
  ],
  "max_total_cost_usd": 2.0,
  "max_total_steps": 50
}

Available built-in agents: classifier, extractor, validator, risk_scorer, decision_maker, draft_writer.
Each node must have a unique id. Connect nodes via next_nodes. The last node should have empty next_nodes."""


class WorkflowGenerator:
    def __init__(self) -> None:
        self.provider = AnthropicProvider()
        self.model_router = ModelRouter()

    async def generate(self, user_description: str) -> WorkflowDefinition:
        model = self.model_router.resolve("powerful")

        request = LLMRequest(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Generate a workflow for this process:\n\n{user_description}",
                }
            ],
            temperature=0.0,
            max_tokens=4096,
        )

        response = await self.provider.complete(request)

        try:
            workflow_data = json.loads(response.content)
        except json.JSONDecodeError:
            content = response.content
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                workflow_data = json.loads(content[start:end])
            else:
                raise ValueError("Could not parse workflow JSON from LLM response")

        if "id" not in workflow_data:
            workflow_data["id"] = str(uuid.uuid4())

        workflow = WorkflowDefinition.model_validate(workflow_data)
        logger.info(
            "workflow_generated",
            workflow_id=workflow.id,
            num_nodes=len(workflow.nodes),
        )
        return workflow
