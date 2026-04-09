import structlog

from backend.database import get_supabase_client
from backend.core.contracts.run import RunState

logger = structlog.get_logger()


class CheckpointStore:
    def __init__(self) -> None:
        self.client = get_supabase_client()

    async def save(self, run_state: RunState) -> None:
        data = {
            "id": run_state.run_id,
            "workflow_id": run_state.workflow_id,
            "status": run_state.status.value,
            "state_json": run_state.model_dump_json(),
            "total_tokens": run_state.total_tokens,
            "total_cost_usd": run_state.total_cost_usd,
            "total_steps": run_state.total_steps,
        }
        self.client.table("runs").upsert(data).execute()
        logger.info(
            "checkpoint_saved",
            run_id=run_state.run_id,
            status=run_state.status.value,
        )

    async def load(self, run_id: str) -> RunState:
        result = (
            self.client.table("runs")
            .select("state_json")
            .eq("id", run_id)
            .single()
            .execute()
        )
        return RunState.model_validate_json(result.data["state_json"])
