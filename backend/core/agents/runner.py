import asyncio
import json
import time
from typing import Any

import jsonschema
import structlog

from backend.core.contracts.agent import AgentContract
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

        while retries <= agent_contract.max_retries:
            start = time.monotonic()
            try:
                messages: list[dict[str, Any]] = [
                    {"role": "user", "content": task + (f"\n\nFeedback from previous attempt: {feedback}" if feedback else "")}
                ]

                request = LLMRequest(
                    model=model,
                    system_prompt=agent_contract.system_prompt,
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
                            executed_tools.append({"name": tool_name, "args": tool_args, "result": {"skipped": True}})

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
