from fastapi import APIRouter, HTTPException

from backend.core.agents.builtin.classifier import CLASSIFIER_AGENT
from backend.core.agents.builtin.decision_maker import DECISION_MAKER_AGENT
from backend.core.agents.builtin.draft_writer import DRAFT_WRITER_AGENT
from backend.core.agents.builtin.extractor import EXTRACTOR_AGENT
from backend.core.agents.builtin.risk_scorer import RISK_SCORER_AGENT
from backend.core.agents.builtin.validator import VALIDATOR_AGENT

router = APIRouter(prefix="/api/agents", tags=["agents"])

AGENTS_REGISTRY: dict[str, dict] = {
    "classifier": CLASSIFIER_AGENT,
    "extractor": EXTRACTOR_AGENT,
    "validator": VALIDATOR_AGENT,
    "risk_scorer": RISK_SCORER_AGENT,
    "decision_maker": DECISION_MAKER_AGENT,
    "draft_writer": DRAFT_WRITER_AGENT,
}


@router.get("")
async def list_agents():
    return [
        {
            "name": a["name"],
            "description": a["description"],
            "purpose": a["purpose"],
            "model_tier": a["model_tier"],
        }
        for a in AGENTS_REGISTRY.values()
    ]


@router.get("/{agent_name}")
async def get_agent(agent_name: str):
    agent = AGENTS_REGISTRY.get(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return agent
