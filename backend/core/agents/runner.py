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

def _infer_provider_from_model(model_id: str) -> str:
    """Guess the provider from a model id string.

    Used by the agent runner when agent.model is set explicitly (no tier)
    so we can pick the right provider class without a separate provider
    field round-trip. Falls back to 'anthropic' if nothing matches.
    """
    m = model_id.lower()
    if m.startswith(("claude-", "claude.")) or "claude" in m:
        return "anthropic"
    if m.startswith(("gpt-", "o1", "o3", "o4", "chatgpt")):
        return "openai"
    if m.startswith("gemini"):
        return "gemini"
    if m.startswith("mistral"):
        return "mistral"
    if "gigachat" in m:
        return "gigachat"
    if "yandexgpt" in m or m.startswith("gpt://") or "foundationModels" in m:
        return "yandexgpt"
    return "anthropic"


GROUNDING_JUDGE_SYSTEM_PROMPT = (
    "You are a hallucination detector for AI agent outputs. "
    "Given INPUT (what the agent was given) and OUTPUT (what the agent produced), "
    "check for hallucinations: specific factual claims in the output that are NOT present "
    "or derivable from the input.\n\n"
    "Rules:\n"
    "- Focus ONLY on concrete facts: numbers, names, dates, identifiers, monetary amounts.\n"
    "- Do NOT flag reasoning, structure choices, summaries, or inferences.\n"
    "- Be strict but reasonable — only flag clear fabrications.\n\n"
    "Respond with ONLY valid JSON, no markdown:\n"
    '{"hallucinated": true|false, "issues": ["fabricated fact 1", ...]}\n'
    'If nothing is hallucinated: {"hallucinated": false, "issues": []}'
)

_UNCERTAINTY_PHRASES = (
    "i'm not sure", "i am not sure", "i don't know", "i cannot determine",
    "i cannot be certain", "unclear", "unable to determine", "not enough information",
    "insufficient data", "cannot be determined", "not specified", "i cannot",
    "i'm unable", "i am unable",
)


def _detect_uncertainty(text: str) -> bool:
    """Return True if the raw LLM response expresses uncertainty."""
    lower = text.lower()
    return any(phrase in lower for phrase in _UNCERTAINTY_PHRASES)


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
        extra_feedback: str = "",
    ) -> StepResult:
        context = context or {}
        tools = tools or []

        # Resolve effective model + provider for this run. If the agent has an
        # explicit `model` field set, it takes priority — we infer the right
        # provider from the model id (claude-* → anthropic, gpt-*/o3 → openai,
        # etc) and instantiate a provider for this run. Legacy agents without
        # an explicit model fall back to tier-based resolution on whatever
        # default provider this runner was constructed with.
        if agent_contract.model:
            model = agent_contract.model
            inferred_provider_name = _infer_provider_from_model(model)
            run_provider: LLMProvider = ModelRouter.get_provider(inferred_provider_name)
            run_provider_name = inferred_provider_name
        else:
            model = self.model_router.resolve(agent_contract.model_tier)
            run_provider = self.provider
            run_provider_name = self.model_router.provider_name

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
        if context:
            system_parts.append(
                "\n\n## GROUNDING REQUIREMENT (critical):\n"
                "Every factual claim, number, name, date, or identifier in your output MUST be "
                "traceable to the input data or previous step results provided to you.\n"
                "- DO NOT invent, assume, or extrapolate values not present in the data.\n"
                "- If a required field is absent from the input, set it to null and note it in "
                "  missing_fields or warnings — do not fabricate a plausible-sounding value.\n"
                "- If you are uncertain whether a value is correct, express uncertainty explicitly "
                "  rather than guessing confidently."
            )
        full_system_prompt = "".join(system_parts)

        MAX_TOOL_ROUNDS = 10

        while retries <= agent_contract.max_retries:
            start = time.monotonic()
            try:
                user_content = task
                if extra_feedback:
                    user_content += f"\n\nVerification feedback (must be addressed): {extra_feedback}"
                if feedback:
                    user_content += f"\n\nFeedback from previous attempt: {feedback}"
                messages: list[dict[str, Any]] = [
                    {"role": "user", "content": user_content}
                ]

                total_input_tokens = 0
                total_output_tokens = 0
                all_executed_tools: list[dict[str, Any]] = []
                last_response = None
                output: Any = None

                # Agentic tool-use loop: feed results back to LLM until it returns
                # a final text response with no more tool calls.
                for round_num in range(MAX_TOOL_ROUNDS):
                    request = LLMRequest(
                        model=model,
                        system_prompt=full_system_prompt,
                        messages=messages,
                        temperature=agent_contract.temperature,
                        max_tokens=agent_contract.max_tokens,
                        tools=claude_tools if tool_configs else [],
                    )
                    if agent_contract.output_schema:
                        request.output_schema = agent_contract.output_schema

                    last_response = await asyncio.wait_for(
                        run_provider.complete(request),
                        timeout=agent_contract.timeout_seconds,
                    )

                    total_input_tokens += last_response.input_tokens
                    total_output_tokens += last_response.output_tokens

                    if not last_response.tool_calls:
                        # Final text-only response — exit loop
                        output = last_response.structured_output or last_response.content
                        break

                    # Build assistant message with tool_use content blocks
                    assistant_content: list[dict[str, Any]] = []
                    if last_response.content:
                        assistant_content.append({"type": "text", "text": last_response.content})
                    for tc in last_response.tool_calls:
                        assistant_content.append({
                            "type": "tool_use",
                            "id": tc["id"],
                            "name": tc["name"],
                            "input": tc.get("input", {}),
                        })
                    messages.append({"role": "assistant", "content": assistant_content})

                    # Execute each tool call and collect tool_result blocks
                    tool_results_content: list[dict[str, Any]] = []
                    for tc in last_response.tool_calls:
                        tool_name = tc.get("name", "")
                        tool_args = tc.get("input", {})
                        tool_id = tc.get("id", "")
                        config = tool_configs.get(tool_name)
                        if config and config.get("url"):
                            logger.info("executing_tool", tool=tool_name, agent=agent_contract.name, args=tool_args, round=round_num)
                            result = await execute_api_tool(config, tool_args)
                            logger.info("tool_executed", tool=tool_name, success=result.get("success"), status=result.get("status_code"))
                            all_executed_tools.append({"name": tool_name, "args": tool_args, "result": result})
                            result_str = json.dumps(result, ensure_ascii=False, default=str)
                        else:
                            logger.warning("tool_not_found", tool=tool_name, agent=agent_contract.name)
                            err = {"error": f"Tool '{tool_name}' not found in library or has no URL. Remove it from the agent and add a fresh one from the library."}
                            all_executed_tools.append({"name": tool_name, "args": tool_args, "result": err})
                            result_str = json.dumps(err)
                        tool_results_content.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": result_str,
                        })

                    # Feed tool results back to LLM for next round
                    messages.append({"role": "user", "content": tool_results_content})
                    logger.info("tool_round_complete", agent=agent_contract.name, round=round_num, tools_called=len(last_response.tool_calls))
                else:
                    logger.warning("agent_max_tool_rounds_reached", agent=agent_contract.name, rounds=MAX_TOOL_ROUNDS)
                    output = last_response.structured_output or last_response.content if last_response else None

                # Handle empty responses gracefully
                if not output or (isinstance(output, str) and not output.strip()):
                    output = {"result": "no_output", "reason": "empty_response"}

                if agent_contract.output_schema and isinstance(output, str):
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
                        raise CorrectableError(
                            f"Output does not match required schema: {e.message}",
                            feedback=(
                                f"Your response failed schema validation: {e.message}\n"
                                f"You MUST return valid JSON matching this schema:\n"
                                f"{json.dumps(agent_contract.output_schema, indent=2)}\n"
                                "Return ONLY the JSON object, no markdown, no explanation."
                            ),
                        ) from e

                # Uncertainty detection: if raw LLM text expresses uncertainty, escalate
                raw_text = last_response.content if last_response else ""
                if raw_text and _detect_uncertainty(raw_text):
                    if getattr(agent_contract, "escalation_policy", "") == "pause_and_notify":
                        raise EscalatableError(
                            "Agent expressed uncertainty in its response",
                            context={
                                "agent": agent_contract.name,
                                "raw_excerpt": raw_text[:500],
                                "reason": "uncertainty_detected",
                            },
                        )

                if getattr(agent_contract, "constraints", ""):
                    await self._validate_constraints(
                        agent_name=agent_contract.name,
                        constraints=agent_contract.constraints,
                        output=output,
                        provider=run_provider,
                    )

                if getattr(agent_contract, "grounding_check", False):
                    await self._check_grounding(
                        agent_name=agent_contract.name,
                        task=task,
                        output=output,
                        provider=run_provider,
                    )

                latency_ms = (time.monotonic() - start) * 1000
                cost = self.model_router.estimate_cost(
                    agent_contract.model_tier,
                    total_input_tokens,
                    total_output_tokens,
                )

                final_output = output
                if all_executed_tools:
                    final_output = {
                        "agent_response": output,
                        "tool_results": all_executed_tools,
                    }

                return StepResult(
                    node_id="",
                    status=StepStatus.completed,
                    agent_name=agent_contract.name,
                    provider=run_provider_name,
                    model=last_response.model or model if last_response else model,
                    output=final_output,
                    tokens_used=total_input_tokens + total_output_tokens,
                    input_tokens=total_input_tokens,
                    output_tokens=total_output_tokens,
                    cost_usd=cost,
                    latency_ms=latency_ms,
                    tool_calls=all_executed_tools,
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
        provider: LLMProvider | None = None,
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
                (provider or self.provider).complete(judge_request),
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

    async def _check_grounding(
        self,
        agent_name: str,
        task: str,
        output: Any,
        provider: LLMProvider | None = None,
    ) -> None:
        """LLM-as-judge hallucination check.

        Raises CorrectableError if the output contains specific factual claims
        that cannot be traced to the provided task/input data.
        On judge infrastructure failures, this is lenient — logs and returns.
        """
        if isinstance(output, (dict, list)):
            output_text = json.dumps(output, ensure_ascii=False)
        else:
            output_text = str(output)

        judge_task = (
            f"INPUT:\n{task[:4000]}\n\n"
            f"OUTPUT:\n{output_text}\n\n"
            "Check for hallucinations."
        )
        judge_request = LLMRequest(
            model=self.model_router.resolve(ModelTier.fast),
            system_prompt=GROUNDING_JUDGE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": judge_task}],
            temperature=0.0,
            max_tokens=512,
        )

        try:
            judge_response = await asyncio.wait_for(
                (provider or self.provider).complete(judge_request),
                timeout=30,
            )
        except Exception as e:
            logger.warning("grounding_judge_unavailable", agent=agent_name, error=str(e))
            return

        judge_text = (judge_response.content or "").strip()
        if not judge_text:
            return

        json_start = judge_text.find("{")
        json_end = judge_text.rfind("}")
        if json_start < 0 or json_end <= json_start:
            logger.warning("grounding_judge_non_json", agent=agent_name, text=judge_text[:200])
            return
        try:
            verdict = json.loads(judge_text[json_start:json_end + 1])
        except json.JSONDecodeError:
            logger.warning("grounding_judge_invalid_json", agent=agent_name, text=judge_text[:200])
            return

        if not isinstance(verdict, dict) or not verdict.get("hallucinated"):
            return

        issues = [str(i) for i in (verdict.get("issues") or []) if i] or ["unspecified hallucination"]
        issue_text = "\n".join(f"- {i}" for i in issues)
        logger.info("grounding_violation_detected", agent=agent_name, issues=issues)
        raise CorrectableError(
            f"Output contains hallucinated facts: {'; '.join(issues)}",
            feedback=(
                "Your previous response contained facts not present in the input data:\n"
                f"{issue_text}\n\n"
                "Revise your response to only include facts explicitly present in the provided data. "
                "Set any missing fields to null rather than inventing plausible values."
            ),
        )
