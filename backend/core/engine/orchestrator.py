import asyncio
import json
import uuid
from typing import Any

import structlog

from backend.core.agents.runner import AgentRunner
from backend.core.contracts.agent import AgentContract
from backend.core.contracts.errors import FatalError
from backend.core.contracts.run import RunState, RunStatus, StepResult, StepStatus
from backend.core.contracts.workflow import NodeDefinition, NodeType, WorkflowDefinition
from backend.core.engine.checkpoint import CheckpointStore
from backend.core.guardrails.pipeline import GuardrailPipeline
from backend.database import async_session_factory
from backend.core.providers.anthropic import AnthropicProvider
from backend.core.providers.base import LLMRequest
from backend.core.providers.model_router import ModelRouter

logger = structlog.get_logger()

BUILTIN_AGENTS: dict[str, dict[str, Any]] = {}


def _load_builtin_agents() -> None:
    from backend.core.agents.builtin.classifier import CLASSIFIER_AGENT
    from backend.core.agents.builtin.extractor import EXTRACTOR_AGENT
    from backend.core.agents.builtin.validator import VALIDATOR_AGENT
    from backend.core.agents.builtin.risk_scorer import RISK_SCORER_AGENT
    from backend.core.agents.builtin.decision_maker import DECISION_MAKER_AGENT
    from backend.core.agents.builtin.draft_writer import DRAFT_WRITER_AGENT

    for agent_dict in [
        CLASSIFIER_AGENT,
        EXTRACTOR_AGENT,
        VALIDATOR_AGENT,
        RISK_SCORER_AGENT,
        DECISION_MAKER_AGENT,
        DRAFT_WRITER_AGENT,
    ]:
        BUILTIN_AGENTS[agent_dict["name"]] = agent_dict


class OrchestrationEngine:
    def __init__(self) -> None:
        self.provider = AnthropicProvider()
        self.model_router = ModelRouter()
        self.agent_runner = AgentRunner(self.provider, self.model_router)
        self.checkpoint = CheckpointStore()
        self.guardrails = GuardrailPipeline()
        if not BUILTIN_AGENTS:
            _load_builtin_agents()

    async def start(
        self,
        workflow: WorkflowDefinition,
        input_data: dict[str, Any],
        run_id: str | None = None,
    ) -> RunState:
        run_state = RunState(
            run_id=run_id or str(uuid.uuid4()),
            workflow_id=workflow.id,
            workflow_version=workflow.version,
            status=RunStatus.running,
            current_node=workflow.entry_node,
            input_data=input_data,
        )
        await self.checkpoint.save(run_state)
        return await self._run_loop(workflow, run_state)

    async def resume(
        self,
        run_id: str,
        approval_result: dict[str, Any],
    ) -> RunState:
        run_state = await self.checkpoint.load(run_id)
        if run_state.status != RunStatus.paused:
            raise ValueError(f"Run {run_id} is not paused, status={run_state.status}")

        run_state.status = RunStatus.running
        run_state.pending_approval = None

        if run_state.current_node and approval_result.get("decision") == "reject":
            step = StepResult(
                node_id=run_state.current_node,
                status=StepStatus.failed,
                error="Rejected by human reviewer",
            )
            run_state.record_step(step)
            run_state.status = RunStatus.failed
            await self.checkpoint.save(run_state)
            return run_state

        # Find workflow definition from DB (simplified: use input_data)
        # In production, load from DB. For now, advance to next node.
        await self.checkpoint.save(run_state)
        return run_state

    async def _run_loop(
        self,
        workflow: WorkflowDefinition,
        run_state: RunState,
    ) -> RunState:
        nodes_map: dict[str, NodeDefinition] = {n.id: n for n in workflow.nodes}

        while run_state.current_node and run_state.status == RunStatus.running:
            node = nodes_map.get(run_state.current_node)
            if not node:
                run_state.status = RunStatus.failed
                logger.error("node_not_found", node_id=run_state.current_node)
                break

            try:
                await self.guardrails.run_budget_check(run_state)
            except FatalError as e:
                run_state.status = RunStatus.failed
                step = StepResult(
                    node_id=node.id,
                    status=StepStatus.failed,
                    error=str(e),
                )
                run_state.record_step(step)
                await self.checkpoint.save(run_state)
                break

            logger.info("executing_node", node_id=node.id, node_type=node.type.value)

            if node.type == NodeType.agent:
                step = await self._execute_agent_node(node, run_state, workflow)
                # If agent needs approval, create a chat conversation
                if step.status == StepStatus.waiting_approval:
                    await self._notify_user_via_chat(node, step, run_state)
                    run_state.record_step(step)
                    run_state.status = RunStatus.paused
                    run_state.pending_approval = {"node_id": node.id, "agent_name": node.agent_name}
                    await self.checkpoint.save(run_state)
                    return run_state
            elif node.type == NodeType.human:
                step = await self._execute_human_node(node, run_state)
                if step.status == StepStatus.waiting_approval:
                    run_state.record_step(step)
                    run_state.status = RunStatus.paused
                    run_state.pending_approval = {
                        "node_id": node.id,
                        "agent_name": node.agent_name,
                    }
                    await self.checkpoint.save(run_state)
                    return run_state
            elif node.type == NodeType.router:
                step = await self._execute_router_node(node, run_state)
            elif node.type == NodeType.parallel:
                step = await self._execute_parallel_node(node, run_state, nodes_map)
            elif node.type == NodeType.deterministic:
                step = await self._execute_deterministic_node(node, run_state)
            elif node.type == NodeType.evaluator:
                step = await self._execute_evaluator_node(node, run_state)
            else:
                step = StepResult(
                    node_id=node.id,
                    status=StepStatus.failed,
                    error=f"Unknown node type: {node.type}",
                )

            run_state.record_step(step)
            await self.checkpoint.save(run_state)

            if step.status == StepStatus.failed:
                run_state.status = RunStatus.failed
                break

            # Determine next node
            if node.type == NodeType.router and isinstance(step.output, dict):
                next_node_id = step.output.get("next_node")
                if next_node_id:
                    run_state.current_node = next_node_id
                    continue

            if node.next_nodes:
                run_state.current_node = node.next_nodes[0]
            else:
                run_state.current_node = None
                run_state.status = RunStatus.completed

        await self.checkpoint.save(run_state)
        return run_state

    async def _execute_agent_node(
        self, node: NodeDefinition, run_state: RunState, workflow: WorkflowDefinition | None = None
    ) -> StepResult:
        agent_name = node.agent_name or node.id
        agent_dict = BUILTIN_AGENTS.get(agent_name)
        agent_tools: list[dict] = []

        # Check builtin agents first, then DB
        if not agent_dict:
            try:
                from sqlalchemy import select as _select
                from backend.models import AgentConfig, Tool

                async with async_session_factory() as db:
                    result = await db.execute(_select(AgentConfig).where(AgentConfig.name == agent_name))
                    a = result.scalar_one_or_none()
                    if a:
                        agent_dict = {
                            "name": a.name,
                            "description": a.description,
                            "purpose": a.purpose,
                            "model_tier": a.model_tier,
                            "system_prompt": a.system_prompt,
                            "output_schema": a.output_schema or {},
                            "temperature": float(a.temperature or 0),
                            "timeout_seconds": a.timeout_seconds,
                            "max_retries": a.max_retries,
                            "max_tokens": a.max_tokens,
                        }
                        for t in a.tools or []:
                            tool_name = t.get("name") if isinstance(t, dict) else None
                            if tool_name:
                                tr = await db.execute(_select(Tool).where(Tool.name == tool_name))
                                tool = tr.scalar_one_or_none()
                                if tool:
                                    agent_tools.append({
                                        "id": str(tool.id),
                                        "name": tool.name,
                                        "description": tool.description,
                                        "url": tool.url,
                                        "method": tool.method,
                                        "headers": tool.headers,
                                        "parameters": tool.parameters,
                                        "body_template": tool.body_template,
                                        "connection_id": str(tool.connection_id) if tool.connection_id else None,
                                    })
            except Exception as e:
                logger.warning("agent_db_lookup_failed", agent=agent_name, error=str(e))

        if not agent_dict:
            return StepResult(
                node_id=node.id,
                status=StepStatus.failed,
                agent_name=agent_name,
                error=f"Agent '{agent_name}' not found",
            )

        agent_contract = AgentContract(**agent_dict)
        task = self._build_task(node, run_state, workflow)
        step = await self.agent_runner.run(
            agent_contract, task, run_state.intermediate_results, tools=agent_tools
        )
        step.node_id = node.id
        return step

    async def _execute_human_node(
        self, node: NodeDefinition, run_state: RunState
    ) -> StepResult:
        return StepResult(
            node_id=node.id,
            status=StepStatus.waiting_approval,
            agent_name="human",
            output={"message": "Awaiting human review"},
        )

    async def _execute_router_node(
        self, node: NodeDefinition, run_state: RunState
    ) -> StepResult:
        context = run_state.intermediate_results
        condition = node.condition or "Route to the appropriate next step"

        request = LLMRequest(
            model=self.model_router.resolve("fast"),
            system_prompt=(
                "You are a routing agent. Based on the context and condition, "
                "determine which node to route to. Return JSON with 'next_node' "
                "(string, one of the available next nodes) and 'reasoning' (string)."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Condition: {condition}\n"
                        f"Available next nodes: {node.next_nodes}\n"
                        f"Context: {context}"
                    ),
                }
            ],
            temperature=0.0,
            max_tokens=256,
        )

        try:
            response = await self.provider.complete(request)
            import json

            output = json.loads(response.content)
            cost = self.model_router.estimate_cost(
                "fast", response.input_tokens, response.output_tokens
            )
            return StepResult(
                node_id=node.id,
                status=StepStatus.completed,
                agent_name="router",
                output=output,
                tokens_used=response.input_tokens + response.output_tokens,
                cost_usd=cost,
                latency_ms=response.latency_ms,
            )
        except Exception as e:
            return StepResult(
                node_id=node.id,
                status=StepStatus.failed,
                agent_name="router",
                error=str(e),
            )

    async def _execute_parallel_node(
        self,
        node: NodeDefinition,
        run_state: RunState,
        nodes_map: dict[str, NodeDefinition],
    ) -> StepResult:
        sub_node_ids = node.parallel_nodes or []
        tasks = []
        for sub_id in sub_node_ids:
            sub_node = nodes_map.get(sub_id)
            if sub_node and sub_node.type == NodeType.agent:
                tasks.append(self._execute_agent_node(sub_node, run_state))

        if not tasks:
            return StepResult(
                node_id=node.id,
                status=StepStatus.completed,
                output={"parallel_results": []},
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)
        parallel_results = []
        total_tokens = 0
        total_cost = 0.0

        for r in results:
            if isinstance(r, Exception):
                parallel_results.append({"error": str(r)})
            else:
                parallel_results.append(r.model_dump())
                run_state.record_step(r)
                total_tokens += r.tokens_used
                total_cost += r.cost_usd

        return StepResult(
            node_id=node.id,
            status=StepStatus.completed,
            output={"parallel_results": parallel_results},
            tokens_used=total_tokens,
            cost_usd=total_cost,
        )

    async def _execute_deterministic_node(
        self, node: NodeDefinition, run_state: RunState
    ) -> StepResult:
        func_name = node.config.get("function", "passthrough")
        output: Any

        if func_name == "passthrough":
            output = run_state.input_data
        elif func_name == "merge":
            output = run_state.intermediate_results
        else:
            output = {"function": func_name, "input": run_state.input_data}

        return StepResult(
            node_id=node.id,
            status=StepStatus.completed,
            output=output,
        )

    async def _execute_evaluator_node(
        self, node: NodeDefinition, run_state: RunState
    ) -> StepResult:
        target_node = node.config.get("evaluate_node")
        if not target_node:
            return StepResult(
                node_id=node.id,
                status=StepStatus.failed,
                error="Evaluator node missing 'evaluate_node' config",
            )

        target_step = run_state.get_step(target_node)
        if not target_step or target_step.output is None:
            return StepResult(
                node_id=node.id,
                status=StepStatus.failed,
                error=f"No output found for node '{target_node}'",
            )

        return StepResult(
            node_id=node.id,
            status=StepStatus.completed,
            output={"evaluated_node": target_node, "valid": True},
        )

    def _build_task(self, node: NodeDefinition, run_state: RunState, workflow: WorkflowDefinition | None = None) -> str:
        parts = []

        # Workflow-level context
        if workflow and workflow.description:
            parts.append(f"You are part of workflow '{workflow.name}': {workflow.description}")

        # Node-level description (purpose in the workflow)
        node_desc = getattr(node, "description", "") or node.config.get("description", "")
        if node_desc:
            parts.append(f"Your role in this step: {node_desc}")
        else:
            parts.append(f"Process data for step '{node.id}'.")

        # Incoming edge context — why previous step passes data to this one
        if workflow and workflow.edge_descriptions:
            incoming = []
            for other in workflow.nodes:
                if node.id in (other.next_nodes or []):
                    edge_key = f"{other.id}->{node.id}"
                    edge_desc = workflow.edge_descriptions.get(edge_key)
                    if edge_desc:
                        incoming.append(f"- From '{other.id}': {edge_desc}")
            if incoming:
                parts.append("Why you received data from previous steps:\n" + "\n".join(incoming))

        # Outgoing edge context — what comes next
        if workflow and workflow.edge_descriptions and node.next_nodes:
            outgoing = []
            for next_id in node.next_nodes:
                edge_key = f"{node.id}->{next_id}"
                edge_desc = workflow.edge_descriptions.get(edge_key)
                if edge_desc:
                    outgoing.append(f"- To '{next_id}': {edge_desc}")
            if outgoing:
                parts.append("Your output will be used for:\n" + "\n".join(outgoing))

        if run_state.input_data:
            parts.append(f"Input data: {json.dumps(run_state.input_data, ensure_ascii=False, default=str)}")
        else:
            parts.append("Input data: (no specific input provided — use your best judgment based on the task description)")

        if run_state.intermediate_results:
            parts.append(f"Results from previous steps: {json.dumps(run_state.intermediate_results, ensure_ascii=False, default=str)}")

        if node.config:
            config_info = {k: v for k, v in node.config.items() if k != "description"}
            if config_info:
                parts.append(f"Configuration: {json.dumps(config_info, ensure_ascii=False, default=str)}")

        return "\n\n".join(parts)

    async def _notify_user_via_chat(
        self, node: NodeDefinition, step: StepResult, run_state: RunState
    ) -> None:
        """Agent creates a conversation to ask the user for approval."""
        try:
            from backend.models import Conversation, Message

            agent_name = step.agent_name or node.agent_name or node.id
            msg_content = (
                f"Hi, I'm the **{agent_name}** agent working on run `{run_state.run_id[:8]}`.\n\n"
                f"I need your input on step **{node.id}**.\n\n"
            )
            if step.error:
                msg_content += f"**Issue:** {step.error}\n\n"
            msg_content += "Please reply with your decision — approve, reject, or give me guidance."

            async with async_session_factory() as db:
                conv = Conversation(
                    title=f"{agent_name}: needs approval",
                    initiated_by="agent",
                    agent_name=agent_name,
                )
                db.add(conv)
                await db.flush()

                msg = Message(
                    conversation_id=conv.id,
                    role="agent",
                    content=msg_content,
                    message_metadata={
                        "agent_name": agent_name,
                        "run_id": str(run_state.run_id),
                        "node_id": node.id,
                        "type": "approval_request",
                    },
                )
                db.add(msg)
                await db.commit()

            logger.info("agent_chat_created", agent=agent_name)
        except Exception as e:
            logger.warning("agent_chat_failed", error=str(e))
