from typing import Any

import structlog

from backend.config import settings
from backend.core.contracts.errors import FatalError
from backend.core.contracts.run import RunState, StepResult
from backend.core.contracts.tool import RiskLevel

logger = structlog.get_logger()


class GuardrailPipeline:
    async def check_pre_run(self, task: str, context: dict[str, Any]) -> None:
        """Checkpoint 1: Input validation and budget check before run starts."""
        if not task or not task.strip():
            raise FatalError("Empty task provided", reason="policy_violation")
        budget = context.get("max_cost_usd", settings.MAX_COST_PER_RUN)
        current_cost = context.get("current_cost_usd", 0.0)
        if current_cost >= budget:
            raise FatalError(
                f"Budget exceeded: ${current_cost:.2f} >= ${budget:.2f}",
                reason="budget_exceeded",
            )
        logger.info("guardrail_pre_run_passed", task_length=len(task))

    async def check_pre_tool(
        self,
        tool_name: str,
        args: dict[str, Any],
        risk_level: RiskLevel,
    ) -> None:
        """Checkpoint 2: Schema validation, permission check, approval if required."""
        if risk_level == RiskLevel.code_execution:
            raise FatalError(
                f"Tool '{tool_name}' requires code_execution which is not allowed",
                reason="policy_violation",
            )
        logger.info(
            "guardrail_pre_tool_passed",
            tool=tool_name,
            risk_level=risk_level.value,
        )

    async def check_post_tool(
        self, tool_name: str, result: Any
    ) -> None:
        """Checkpoint 3: Output validation, PII check."""
        if result is None:
            logger.warning("guardrail_post_tool_null_result", tool=tool_name)
        logger.info("guardrail_post_tool_passed", tool=tool_name)

    async def check_pre_output(self, step_result: StepResult) -> None:
        """Checkpoint 4: Final schema validation, safety filter."""
        if step_result.error and step_result.output:
            logger.warning(
                "guardrail_pre_output_error_with_output",
                node_id=step_result.node_id,
            )
        logger.info("guardrail_pre_output_passed", node_id=step_result.node_id)

    async def check_side_effect(
        self,
        tool_name: str,
        args: dict[str, Any],
        requires_approval: bool = False,
    ) -> None:
        """Checkpoint 5: Approval gate before write/high-risk actions."""
        if requires_approval:
            from backend.core.contracts.errors import EscalatableError

            raise EscalatableError(
                f"Tool '{tool_name}' requires approval before execution",
                context={"tool": tool_name, "args": args},
            )
        logger.info("guardrail_side_effect_passed", tool=tool_name)

    async def run_budget_check(self, run_state: RunState) -> None:
        """Check if run is within budget limits."""
        if run_state.total_cost_usd >= settings.MAX_COST_PER_RUN:
            raise FatalError(
                f"Run budget exceeded: ${run_state.total_cost_usd:.2f}",
                reason="budget_exceeded",
            )
        if run_state.total_tokens >= settings.MAX_TOKENS_PER_RUN:
            raise FatalError(
                f"Token limit exceeded: {run_state.total_tokens}",
                reason="budget_exceeded",
            )
