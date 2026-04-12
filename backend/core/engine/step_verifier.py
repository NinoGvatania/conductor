"""Post-step verification layer.

Called by the orchestrator after every node execution (except deterministic).
Runs four sequential checks and returns a VerificationResult.
The orchestrator decides the retry/escalate/fail strategy.
"""

import asyncio
import json
from enum import Enum
from typing import Any

import jsonschema
import structlog
from pydantic import BaseModel, Field

from backend.core.contracts.agent import AgentContract, ModelTier
from backend.core.contracts.run import RunState, StepResult, StepStatus
from backend.core.contracts.workflow import NodeDefinition, NodeType
from backend.core.providers.base import LLMProvider, LLMRequest
from backend.core.providers.model_router import ModelRouter

logger = structlog.get_logger()

COHERENCE_JUDGE_SYSTEM_PROMPT = (
    "You are a grounding verifier for AI agent outputs. "
    "Given INPUT DATA (what the agent received) and AGENT OUTPUT (what the agent produced), "
    "determine whether the output facts are traceable to the input data.\n\n"
    "Rules:\n"
    "- Focus ONLY on concrete facts: specific numbers, names, dates, identifiers, amounts.\n"
    "- Do NOT flag reasoning, summaries, tone choices, or structure decisions.\n"
    "- Be lenient — flag only outputs that contain specific factual claims that are "
    "clearly absent from the input data (hallucinations).\n"
    "- If input data is empty or too short to judge, return grounded=true.\n\n"
    "Respond with ONLY valid JSON, no markdown, no prose:\n"
    '{"grounded": true|false, "issues": ["specific issue 1", ...], "score": 0.0}\n'
    'If fully grounded: {"grounded": true, "issues": [], "score": 1.0}'
)


class VerificationStatus(str, Enum):
    passed = "passed"
    failed_schema = "failed_schema"
    failed_completeness = "failed_completeness"
    failed_confidence = "failed_confidence"
    failed_coherence = "failed_coherence"
    skipped = "skipped"


class VerificationResult(BaseModel):
    status: VerificationStatus = VerificationStatus.passed
    passed: bool = True
    feedback: str = ""
    suggestions: list[str] = Field(default_factory=list)
    confidence_score: float | None = None
    checks_run: list[str] = Field(default_factory=list)


class StepVerifier:
    def __init__(self, provider: LLMProvider, model_router: ModelRouter) -> None:
        self.provider = provider
        self.model_router = model_router

    async def verify(
        self,
        step: StepResult,
        node: NodeDefinition,
        run_state: RunState,
        agent_contract: AgentContract | None = None,
    ) -> VerificationResult:
        """Run all applicable checks and return on first failure."""
        # Only verify successfully completed steps
        if step.status != StepStatus.completed:
            return VerificationResult(status=VerificationStatus.skipped, passed=True)

        # Skip deterministic nodes — no LLM output to verify
        if node.type == NodeType.deterministic:
            return VerificationResult(status=VerificationStatus.skipped, passed=True)

        checks_run: list[str] = []

        # 1. Schema compliance
        if agent_contract and agent_contract.output_schema:
            result = self._check_schema_compliance(step.output, agent_contract.output_schema)
            checks_run.append("schema")
            if result:
                result.checks_run = checks_run
                return result

        # 2. Completeness
        result = self._check_completeness(step.output, node, agent_contract)
        checks_run.append("completeness")
        if result:
            result.checks_run = checks_run
            return result

        # 3. Confidence threshold
        result = self._check_confidence(step.output, node)
        checks_run.append("confidence")
        if result:
            result.checks_run = checks_run
            return result

        # 4. Semantic coherence (LLM judge) — only for agent nodes with input data
        if (
            node.type == NodeType.agent
            and run_state.input_data
            and not step.tool_calls  # skip if tool results involved (harder to ground)
            and (step.output_tokens or 0) > 100  # skip trivially short outputs
        ):
            input_text = json.dumps(run_state.input_data, ensure_ascii=False, default=str)
            result = await self._check_semantic_coherence(step.output, input_text, node.description or node.id)
            checks_run.append("coherence")
            if result:
                result.checks_run = checks_run
                return result

        return VerificationResult(
            status=VerificationStatus.passed,
            passed=True,
            checks_run=checks_run,
        )

    def _check_schema_compliance(
        self,
        output: Any,
        output_schema: dict[str, Any],
    ) -> VerificationResult | None:
        if not output_schema or not isinstance(output, dict):
            return None
        try:
            jsonschema.validate(output, output_schema)
            return None
        except jsonschema.ValidationError as e:
            return VerificationResult(
                status=VerificationStatus.failed_schema,
                passed=False,
                feedback=f"Output does not match required schema: {e.message}",
                suggestions=[
                    f"Return valid JSON matching this schema: {json.dumps(output_schema, indent=2)}",
                    "Do not include extra keys or change required field types.",
                ],
            )

    def _check_completeness(
        self,
        output: Any,
        node: NodeDefinition,
        agent_contract: AgentContract | None,
    ) -> VerificationResult | None:
        # Check for sentinel empty output
        if output is None:
            return VerificationResult(
                status=VerificationStatus.failed_completeness,
                passed=False,
                feedback="Agent returned no output.",
                suggestions=["Provide a complete response matching the required output schema."],
            )
        if isinstance(output, dict) and output.get("result") == "no_output":
            return VerificationResult(
                status=VerificationStatus.failed_completeness,
                passed=False,
                feedback="Agent returned an empty response sentinel.",
                suggestions=["Process the input data and return a meaningful output."],
            )

        # Check null ratio on schema-defined fields
        if agent_contract and agent_contract.output_schema and isinstance(output, dict):
            props = agent_contract.output_schema.get("properties", {})
            if props:
                null_count = sum(1 for k in props if output.get(k) is None)
                total = len(props)
                if total > 0 and null_count / total > 0.5:
                    null_keys = [k for k in props if output.get(k) is None]
                    return VerificationResult(
                        status=VerificationStatus.failed_completeness,
                        passed=False,
                        feedback=f"More than 50% of required fields are null: {null_keys}",
                        suggestions=[
                            "Populate all required output fields.",
                            "If data is genuinely unavailable, set the field to null and explain in a 'notes' or 'missing_fields' field.",
                        ],
                    )
        return None

    def _check_confidence(
        self,
        output: Any,
        node: NodeDefinition,
    ) -> VerificationResult | None:
        if not isinstance(output, dict):
            return None
        confidence = output.get("confidence")
        if confidence is None:
            return None
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            return None

        min_confidence: float = node.config.get("min_confidence", 0.5) if node.config else 0.5
        if confidence < min_confidence:
            return VerificationResult(
                status=VerificationStatus.failed_confidence,
                passed=False,
                confidence_score=confidence,
                feedback=(
                    f"Agent confidence {confidence:.2f} is below required threshold {min_confidence:.2f}. "
                    "The result is too uncertain to proceed."
                ),
                suggestions=[
                    "Request more input data or context to improve confidence.",
                    "If data is genuinely ambiguous, escalate to human review.",
                ],
            )
        return None

    async def _check_semantic_coherence(
        self,
        output: Any,
        input_text: str,
        node_description: str,
    ) -> VerificationResult | None:
        if isinstance(output, (dict, list)):
            output_text = json.dumps(output, ensure_ascii=False, default=str)
        else:
            output_text = str(output)

        judge_task = (
            f"INPUT DATA:\n{input_text}\n\n"
            f"AGENT OUTPUT:\n{output_text}\n\n"
            "Check if all factual claims in the output are traceable to the input data."
        )
        request = LLMRequest(
            model=self.model_router.resolve(ModelTier.fast),
            system_prompt=COHERENCE_JUDGE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": judge_task}],
            temperature=0.0,
            max_tokens=512,
        )

        try:
            response = await asyncio.wait_for(
                self.provider.complete(request),
                timeout=30,
            )
        except Exception as e:
            logger.warning("coherence_judge_unavailable", error=str(e))
            return None

        raw = (response.content or "").strip()
        json_start = raw.find("{")
        json_end = raw.rfind("}")
        if json_start < 0 or json_end <= json_start:
            logger.warning("coherence_judge_non_json", text=raw[:200])
            return None

        try:
            verdict = json.loads(raw[json_start:json_end + 1])
        except json.JSONDecodeError:
            logger.warning("coherence_judge_invalid_json", text=raw[:200])
            return None

        if not isinstance(verdict, dict) or verdict.get("grounded", True):
            return None

        issues = [str(i) for i in (verdict.get("issues") or []) if i]
        if not issues:
            return None

        issue_text = "\n".join(f"- {i}" for i in issues)
        return VerificationResult(
            status=VerificationStatus.failed_coherence,
            passed=False,
            feedback=(
                f"Output contains facts not traceable to the input data (possible hallucination):\n{issue_text}"
            ),
            suggestions=[
                "Only use facts, numbers, and names that are explicitly present in the input data.",
                "If a value is inferred rather than stated, mark it as 'Inferred:' or set it to null.",
            ],
        )
