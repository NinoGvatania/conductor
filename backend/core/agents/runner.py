import asyncio
import json
import time
from typing import Any

import jsonschema
import structlog

from backend.core.contracts.agent import AgentContract, ModelTier
from backend.core.contracts.errors import (
    CorrectableError,
    EscalatableError,
    FatalError,
    RetriableError,
)
from backend.core.contracts.run import StepResult, StepStatus
from backend.core.providers.base import LLMProvider, LLMRequest
from backend.core.providers.model_router import ModelRouter
from backend.core.tools.executor import execute_api_tool, tools_to_claude_format

logger = structlog.get_logger()

CONSTRAINT_JUDGE_SYSTEM_PROMPT = (
    "You are a strict compliance checker for AI agent outputs. "
    "Given a set of CONSTRAINTS (hard rules the agent must follow) and an OUTPUT "
    "(the agent's response), determine whether the output violates ANY constraint.\n\n"
    "Rules:\n"
    "- Be strict but reasonable. Flag real violations, not minor stylistic choices.\n"
    "- A constraint is violated ONLY if the output clearly breaks it.\n"
    "- If a constraint is about format/length/language, check it precisely.\n"
    "- If a constraint is about forbidden content, check that the content is absent.\n\n"
    "Respond with ONLY valid JSON, no markdown, no prose:\n"
    '{"violated": true|false, "violations": ["specific violation 1", "specific violation 2"]}\n'
    'If nothing is violated, return {"violated": false, "violations": []}.'
)


class AgentRunner:
    def __init__(self, provider: LLMProvider, model_router: ModelRouter) -> None:
        self.provider = provider
        self.model_router = model_router

    async def run(
        self,
        agent_contract: AgentContract,
        task: str,
        context: dict[str, Any] | None = None,
        tools: list[dict[str, Any]] | None = None,
    ) -> StepResult:
        context = context or {}
        tools = tools or []
        model = self.model_router.resolve(agent_contract.model_tier)
        retries = 0
        last_error: str | None = None
        feedback: str = ""

        # Convert tools to Claude format
        claude_tools = tools_to_claude_format(tools) if tools else []
        # Build a lookup for tool configs (for execution)
        tool_configs = {t["name"]: t for t in tools}

        # Build enriched system prompt with constraints
        system_parts = [agent_contract.system_prompt or ""]
        if getattr(agent_contract, "constraints", ""):
            system_parts.append(
                f"\n\n## HARD CONSTRAINTS (must follow — your response will be automatically checked against these):\n"
                f"{agent_contract.constraints}\n\n"
                "If your response violates ANY constraint above, it will be rejected and you will be asked to retry. "
                "Treat these as absolute rules, not suggestions."
            )
        if getattr(agent_contract, "clarification_rules", ""):
            system_parts.append(
                f"\n\n## When to ask for clarification:\n{agent_contract.clarification_rules}\n\n"
                "If any of these conditions apply, respond with a clarification question instead of guessing."
            )
        full_system_prompt = "".join(system_parts)

        while retries <= agent_contract.max_retries:
            start = time.monotonic()
            try:
                messages: list[dict[str, Any]] = [
                    {"role": "user", "content": task + (f"\n\nFeedback from previous attempt: {feedback}" if feedback else "")}
                ]

                request = LLMRequest(
                    model=model,
                    system_prompt=full_system_prompt,
                    messages=messages,
                    temperature=agent_contract.temperature,
                    max_tokens=agent_contract.max_tokens,
                    tools=claude_tools,
                )
                if agent_contract.output_schema:
                    request.output_schema = agent_contract.output_schema

                response = await asyncio.wait_for(
                    self.provider.complete(request),
                    timeout=agent_contract.timeout_seconds,
                )

                latency_ms = (time.monotonic() - start) * 1000
                output = response.structured_output or response.content

                # Handle empty responses gracefully
                if not output or (isinstance(output, str) and not output.strip()):
                    output = {"result": "no_output", "reason": "empty_response"}

                if agent_contract.output_schema and isinstance(output, str):
                    # Try to extract JSON from text response
                    text = output.strip()
                    json_start = text.find("{")
                    json_end = text.rfind("}")
                    if json_start >= 0 and json_end > json_start:
                        text = text[json_start:json_end + 1]
                    try:
                        output = json.loads(text)
                    except json.JSONDecodeError as e:
                        raise CorrectableError(
                            f"Output is not valid JSON: {e}",
                            feedback=f"Return ONLY valid JSON matching this schema: {json.dumps(agent_contract.output_schema)}. No markdown, no explanation.",
                        ) from e

                if agent_contract.output_schema and isinstance(output, dict):
                    try:
                        jsonschema.validate(output, agent_contract.output_schema)
                    except jsonschema.ValidationError as e:
                        # Log but don't fail — continue with whatever output we have
                        logger.warning("agent_schema_mismatch", agent=agent_contract.name, error=e.message)

                # Hard constraint post-validation — checks output against agent's declared constraints.
                # Raises CorrectableError on violation, which triggers retry with feedback.
                if getattr(agent_contract, "constraints", ""):
                    await self._validate_constraints(
                        agent_name=agent_contract.name,
                        constraints=agent_contract.constraints,
                        output=output,
                    )

                # Execute any tool calls the LLM requested
                executed_tools: list[dict[str, Any]] = []
                if response.tool_calls and tool_configs:
                    for tc in response.tool_calls:
                        tool_name = tc.get("name", "")
                        tool_args = tc.get("input", {})
                        config = tool_configs.get(tool_name)
                        if config and config.get("url"):
                            logger.info("executing_tool", tool=tool_name, agent=agent_contract.name)
                            result = await execute_api_tool(config, tool_args)
                            executed_tools.append({"name": tool_name, "args": tool_args, "result": result})
                        else:
                            executed_tools.append({"name": tool_name, "args": tool_args, "result": {"error": f"Tool '{tool_name}' not found in library or has no URL. Remove it from the agent and add a fresh one from the library."}})

                cost = self.model_router.estimate_cost(
                    agent_contract.model_tier,
                    response.input_tokens,
                    response.output_tokens,
                )

                final_output = output
                if executed_tools:
                    final_output = {
                        "agent_response": output,
                        "tool_results": executed_tools,
                    }

                return StepResult(
                    node_id="",
                    status=StepStatus.completed,
                    agent_name=agent_contract.name,
                    provider=self.model_router.provider_name,
                    model=response.model or model,
                    output=final_output,
                    tokens_used=response.input_tokens + response.output_tokens,
                    input_tokens=response.input_tokens,
                    output_tokens=response.output_tokens,
                    cost_usd=cost,
                    latency_ms=latency_ms,
                    tool_calls=response.tool_calls,
                    retries=retries,
                )

            except asyncio.TimeoutError:
                last_error = f"Timeout after {agent_contract.timeout_seconds}s"
                if "timeout" not in agent_contract.retry_on:
                    break
                retries += 1
                logger.warning("agent_timeout", agent=agent_contract.name, attempt=retries)

            except RetriableError as e:
                last_error = str(e)
                if e.reason not in agent_contract.retry_on:
                    break
                retries += 1
                logger.warning("agent_retriable_error", agent=agent_contract.name, reason=e.reason, attempt=retries)

            except CorrectableError as e:
                last_error = str(e)
                if "schema_validation" not in agent_contract.retry_on:
                    break
                feedback = e.feedback
                retries += 1
                logger.warning("agent_correctable_error", agent=agent_contract.name, attempt=retries)

            except EscalatableError as e:
                logger.info("agent_escalated", agent=agent_contract.name, context=e.context)
                return StepResult(
                    node_id="",
                    status=StepStatus.waiting_approval,
                    agent_name=agent_contract.name,
                    error=str(e),
                    latency_ms=(time.monotonic() - start) * 1000,
                    retries=retries,
                )

            except FatalError as e:
                logger.error("agent_fatal_error", agent=agent_contract.name, reason=e.reason)
                return StepResult(
                    node_id="",
                    status=StepStatus.failed,
                    agent_name=agent_contract.name,
                    error=str(e),
                    latency_ms=(time.monotonic() - start) * 1000,
                    retries=retries,
                )

        return StepResult(
            node_id="",
            status=StepStatus.failed,
            agent_name=agent_contract.name,
            error=last_error or "Max retries exceeded",
            retries=retries,
        )

    async def _validate_constraints(
        self,
        agent_name: str,
        constraints: str,
        output: Any,
    ) -> None:
        """LLM-as-judge post-validation of agent output against declared constraints.

        Raises CorrectableError (which is retryable by default via retry_on=["schema_validation"])
        if any constraint is violated, feeding the violation back to the agent for correction.
        On judge failures (timeout, invalid JSON, etc.) this is lenient — logs and returns,
        rather than blocking a valid agent response on judge infrastructure issues.
        """
        if not constraints.strip():
            return

        # Serialize output for the judge — full text, no artificial truncation.
        # Judge uses fast-tier model with 200k context; if the agent somehow
        # produced output longer than that, the Anthropic API will surface it.
        if isinstance(output, (dict, list)):
            output_text = json.dumps(output, ensure_ascii=False)
        else:
            output_text = str(output)

        judge_task = (
            f"CONSTRAINTS:\n{constraints}\n\n"
            f"OUTPUT TO CHECK:\n{output_text}\n\n"
            "Return compliance JSON only."
        )
        judge_request = LLMRequest(
            model=self.model_router.resolve(ModelTier.fast),
            system_prompt=CONSTRAINT_JUDGE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": judge_task}],
            temperature=0.0,
            max_tokens=512,
        )

        try:
            judge_response = await asyncio.wait_for(
                self.provider.complete(judge_request),
                timeout=30,
            )
        except Exception as e:
            # Don't block agent on judge infrastructure failure
            logger.warning("constraint_judge_unavailable", agent=agent_name, error=str(e))
            return

        judge_text = (judge_response.content or "").strip()
        if not judge_text:
            return

        # Extract JSON (tolerate markdown fencing or extra prose)
        json_start = judge_text.find("{")
        json_end = judge_text.rfind("}")
        if json_start < 0 or json_end <= json_start:
            logger.warning("constraint_judge_non_json", agent=agent_name, text=judge_text[:200])
            return
        try:
            verdict = json.loads(judge_text[json_start : json_end + 1])
        except json.JSONDecodeError:
            logger.warning("constraint_judge_invalid_json", agent=agent_name, text=judge_text[:200])
            return

        if not isinstance(verdict, dict) or not verdict.get("violated"):
            return

        raw_violations = verdict.get("violations") or []
        violations = [str(v) for v in raw_violations if v] or ["constraints not met"]
        violation_text = "\n".join(f"- {v}" for v in violations)

        logger.info(
            "constraint_violation_detected",
            agent=agent_name,
            violations=violations,
        )
        raise CorrectableError(
            f"Output violates constraints: {'; '.join(violations)}",
            feedback=(
                "Your previous response violated these hard constraints:\n"
                f"{violation_text}\n\n"
                "Full constraint list (you MUST comply with ALL of them):\n"
                f"{constraints}\n\n"
                "Revise your response so that every constraint is satisfied."
            ),
        )
