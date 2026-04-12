import json
import uuid

import structlog

from backend.core.contracts.workflow import NodeType, WorkflowDefinition
from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter

logger = structlog.get_logger()

BUILTIN_AGENTS_HINT = [
    {"name": "classifier", "purpose": "Classify input into categories (fast tier)"},
    {"name": "extractor", "purpose": "Extract structured data from documents (balanced)"},
    {"name": "validator", "purpose": "Check completeness and consistency (balanced)"},
    {"name": "risk_scorer", "purpose": "Assess risk, return 0-100 score (powerful)"},
    {"name": "decision_maker", "purpose": "Approve / reject / escalate decisions (powerful)"},
    {"name": "draft_writer", "purpose": "Generate response text (balanced)"},
]


SYSTEM_PROMPT_TEMPLATE = """You are a workflow architect. Given a user's description of a business process,
generate a valid JSON workflow. Keep it CONCISE — use 5-8 nodes max.

Output ONLY valid JSON (no markdown, no explanation). Schema:
{{
  "name": "string",
  "description": "string — one sentence describing the entire workflow's purpose",
  "entry_node": "first_node_id",
  "nodes": [
    {{
      "id": "string",
      "type": "deterministic|agent|router|human",
      "agent_name": "<one of the available agents listed below, or null>",
      "description": "string — one sentence: what this node does and why it exists in this workflow",
      "next_nodes": ["next_node_id"],
      "config": {{}}
    }}
  ],
  "edge_descriptions": {{
    "source_node_id->target_node_id": "string — why data flows this direction / what condition triggers this route"
  }}
}}

## Available agents (use these exact names in `agent_name`)

{agent_list}

Rules:
- 5-8 nodes maximum
- Keep node IDs short (e.g. "intake", "classify", "extract")
- `agent_name` must be one of the names listed above, or null for non-agent nodes
- Every node MUST have a non-empty `description` field
- Every edge (A→B connection) MUST appear in `edge_descriptions` with a meaningful explanation
- For router nodes, edge descriptions must explain what condition causes routing to each destination
- Prefer the user's custom agents over builtins when their purpose matches the user's description — the user built them for a reason
- The last node must have "next_nodes": []
- For deterministic nodes: agent_name is null
- For agent nodes: agent_name is required
- Output ONLY the JSON object, nothing else"""


def _format_agent_list(available_agents: list[dict[str, str]] | None) -> str:
    lines: list[str] = ["**Builtin agents** (always available):"]
    for a in BUILTIN_AGENTS_HINT:
        lines.append(f"- `{a['name']}` — {a['purpose']}")
    if available_agents:
        lines.append("")
        lines.append("**User's custom agents** (prefer these when appropriate):")
        for a in available_agents:
            desc = a.get("description") or a.get("purpose") or "(no description)"
            lines.append(f"- `{a['name']}` — {desc}")
    else:
        lines.append("")
        lines.append("**User's custom agents:** (none yet)")
    return "\n".join(lines)


class WorkflowGenerator:
    def __init__(self) -> None:
        self.provider = AnthropicProvider()
        self.model_router = ModelRouter()

    async def generate(
        self,
        user_description: str,
        available_agents: list[dict[str, str]] | None = None,
    ) -> WorkflowDefinition:
        model = self.model_router.resolve("balanced")

        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            agent_list=_format_agent_list(available_agents)
        )

        request = LLMRequest(
            model=model,
            system_prompt=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": f"Generate a compact workflow for: {user_description}",
                }
            ],
            temperature=0.0,
            max_tokens=32000,
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
        workflow_data.setdefault("max_total_cost_usd", 10_000.0)
        workflow_data.setdefault("max_total_steps", 1000)

        # Ensure each node has required fields
        for node in workflow_data.get("nodes", []):
            node.setdefault("next_nodes", [])
            node.setdefault("condition", None)
            node.setdefault("parallel_nodes", [])
            node.setdefault("timeout_seconds", 120)
            node.setdefault("config", {})
            node.setdefault("description", f"Process step '{node.get('id', 'unknown')}'")

        workflow_data.setdefault("edge_descriptions", {})

        workflow = WorkflowDefinition.model_validate(workflow_data)

        # Validate that all agent_name references exist in known agents
        known_agent_names: set[str] = {a["name"] for a in BUILTIN_AGENTS_HINT}
        if available_agents:
            known_agent_names.update(a["name"] for a in available_agents)

        invalid_agents = [
            (n.id, n.agent_name)
            for n in workflow.nodes
            if n.type == NodeType.agent and n.agent_name and n.agent_name not in known_agent_names
        ]
        if invalid_agents:
            msg_lines = ["Workflow generator produced unknown agent_name(s):"]
            for node_id, agent_name in invalid_agents:
                msg_lines.append(f"  - node '{node_id}' references '{agent_name}' (not in available agents)")
            msg_lines.append(f"Available agents: {sorted(known_agent_names)}")
            logger.error("workflow_invalid_agent_names", invalid=invalid_agents)
            raise ValueError("\n".join(msg_lines))

        logger.info("workflow_generated", name=workflow.name, nodes=len(workflow.nodes))
        return workflow
