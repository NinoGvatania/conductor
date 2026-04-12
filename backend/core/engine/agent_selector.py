"""Agent selector — determines the most appropriate agent for a workflow node.

Uses keyword-based capability scoring (no LLM calls) to:
1. Validate that the specified agent_name is suitable for the node's task.
2. Suggest a better builtin agent if the specified one is a poor fit.
3. Fall back gracefully when no strong match exists.
"""

from dataclasses import dataclass, field
from typing import Any

import structlog

from backend.core.contracts.run import RunState
from backend.core.contracts.workflow import NodeDefinition

logger = structlog.get_logger()


@dataclass
class AgentMatch:
    agent_name: str
    score: float           # 0.0 – 1.0; higher = better match
    reason: str
    is_fallback: bool = False


class AgentSelector:
    """Selects the best agent for a node using synchronous keyword scoring."""

    # Minimum score to consider an explicitly specified agent a valid match
    # (one keyword hit = 0.15 is already a positive signal)
    FIT_THRESHOLD = 0.15
    # Minimum score to override/replace the specified agent with a better builtin
    OVERRIDE_THRESHOLD = 0.3

    def __init__(self, builtin_agents: dict[str, dict[str, Any]]) -> None:
        self._builtins = builtin_agents

    def select(self, node: NodeDefinition, run_state: RunState) -> AgentMatch:  # noqa: ARG002
        """Return the best AgentMatch for the given node.

        Priority:
        1. If node.agent_name is set and is a builtin with good fit → use it.
        2. If node.agent_name points to a non-builtin (DB agent) → use it as-is
           unless fit score is extremely poor (< 0.1), in which case log a warning.
        3. If no name, or builtin fit is poor → find best builtin.
        4. If no builtin scores above OVERRIDE_THRESHOLD → return original with is_fallback=True.
        """
        description = self._node_description(node)
        agent_name = node.agent_name or node.id

        # Check if the specified agent is a builtin
        if agent_name in self._builtins:
            score = self._score_agent(self._builtins[agent_name], description)
            if score >= self.FIT_THRESHOLD:
                return AgentMatch(
                    agent_name=agent_name,
                    score=score,
                    reason=f"Specified builtin '{agent_name}' has good fit (score={score:.2f})",
                )
            # Poor fit for specified builtin — try to find a better one
            best = self._find_best_builtin(description, exclude=agent_name)
            if best and best.score > score:
                logger.info(
                    "agent_selector_override",
                    node=node.id,
                    original=agent_name,
                    selected=best.agent_name,
                    original_score=score,
                    new_score=best.score,
                )
                return best
            # No better option — use original with fallback flag
            return AgentMatch(
                agent_name=agent_name,
                score=score,
                reason=f"Specified builtin '{agent_name}' has low fit (score={score:.2f}) but no better option found",
                is_fallback=True,
            )

        # Non-builtin (DB agent) — validate loosely
        if node.agent_name:
            # We can't score a DB agent without capability metadata, so accept it
            # unless the description strongly suggests a different builtin
            best = self._find_best_builtin(description)
            if best and best.score >= self.FIT_THRESHOLD + 0.2:
                # A builtin is a strong match — prefer it only if agent_name looks generic
                # (i.e., the node description contains the builtin's name)
                if best.agent_name.lower() in description.lower():
                    logger.info(
                        "agent_selector_prefer_builtin",
                        node=node.id,
                        original=agent_name,
                        selected=best.agent_name,
                        score=best.score,
                    )
                    return best
            return AgentMatch(
                agent_name=agent_name,
                score=0.5,  # neutral — we trust DB agents
                reason=f"DB agent '{agent_name}' accepted as-is",
            )

        # No agent name set — find best builtin
        best = self._find_best_builtin(description)
        if best:
            return best

        # Nothing found — fall back to original name
        return AgentMatch(
            agent_name=agent_name,
            score=0.0,
            reason="No suitable agent found; using node id as fallback",
            is_fallback=True,
        )

    def validate_agent_fit(self, agent_name: str, node: NodeDefinition) -> tuple[bool, str]:
        """Return (is_appropriate, reason). Only checks builtin agents."""
        if agent_name not in self._builtins:
            return True, f"'{agent_name}' is a DB agent — fit validation skipped"
        description = self._node_description(node)
        score = self._score_agent(self._builtins[agent_name], description)
        if score >= self.FIT_THRESHOLD:
            return True, f"Agent '{agent_name}' is appropriate (score={score:.2f})"
        return False, f"Agent '{agent_name}' has low fit score ({score:.2f}) for this task"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _node_description(self, node: NodeDefinition) -> str:
        parts = [node.description or "", node.id]
        if node.config:
            parts.append(node.config.get("description", ""))
        return " ".join(p for p in parts if p).lower()

    def _find_best_builtin(
        self, description: str, exclude: str | None = None
    ) -> AgentMatch | None:
        best_score = self.OVERRIDE_THRESHOLD
        best_name: str | None = None
        for name, agent_dict in self._builtins.items():
            if name == exclude:
                continue
            score = self._score_agent(agent_dict, description)
            if score > best_score:
                best_score = score
                best_name = name
        if best_name is None:
            return None
        return AgentMatch(
            agent_name=best_name,
            score=best_score,
            reason=f"Best matching builtin '{best_name}' (score={best_score:.2f})",
        )

    def _score_agent(self, agent_dict: dict[str, Any], description: str) -> float:
        """Score how well an agent matches the node description (0.0–1.0)."""
        caps: dict[str, Any] = agent_dict.get("capabilities", {})
        if not caps:
            # No capability metadata — give a neutral score
            return 0.25

        score = 0.0

        # Positive keywords
        task_keywords: list[str] = caps.get("task_keywords", [])
        hits = sum(1 for kw in task_keywords if kw.lower() in description)
        score += min(hits * 0.15, 0.6)

        # Negative keywords (penalise)
        negative: list[str] = caps.get("not_suitable_for", [])
        neg_hits = sum(1 for kw in negative if kw.lower() in description)
        score -= neg_hits * 0.3

        # Exact agent name in description is a strong signal
        agent_name: str = agent_dict.get("name", "")
        if agent_name and agent_name.lower() in description:
            score += 0.4

        return max(0.0, min(1.0, score))
