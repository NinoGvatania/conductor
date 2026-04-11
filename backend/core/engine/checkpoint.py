import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from backend.core.contracts.run import RunState
from backend.database import async_session_factory
from backend.models import Run, Step

logger = structlog.get_logger()


class CheckpointStore:
    async def save(self, run_state: RunState) -> None:
        async with async_session_factory() as db:
            try:
                run_id = uuid.UUID(run_state.run_id) if isinstance(run_state.run_id, str) else run_state.run_id
                workflow_id = None
                try:
                    workflow_id = uuid.UUID(run_state.workflow_id) if run_state.workflow_id else None
                except (ValueError, TypeError):
                    workflow_id = None

                data = {
                    "id": run_id,
                    "workflow_id": workflow_id,
                    "status": run_state.status.value if hasattr(run_state.status, "value") else run_state.status,
                    "state_json": run_state.model_dump_json(),
                    "total_tokens": run_state.total_tokens,
                    "total_cost_usd": run_state.total_cost_usd,
                    "total_steps": run_state.total_steps,
                }

                stmt = insert(Run).values(**data)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "status": stmt.excluded.status,
                        "state_json": stmt.excluded.state_json,
                        "total_tokens": stmt.excluded.total_tokens,
                        "total_cost_usd": stmt.excluded.total_cost_usd,
                        "total_steps": stmt.excluded.total_steps,
                    },
                )
                await db.execute(stmt)
                await db.commit()
                logger.info("checkpoint_saved", run_id=str(run_id), status=data["status"])
            except Exception as e:
                await db.rollback()
                logger.error("checkpoint_save_error", error=str(e))
                raise

    async def load(self, run_id: str) -> RunState:
        async with async_session_factory() as db:
            rid = uuid.UUID(run_id) if isinstance(run_id, str) else run_id
            result = await db.execute(select(Run).where(Run.id == rid))
            run = result.scalar_one_or_none()
            if not run:
                raise ValueError(f"Run {run_id} not found")
            return RunState.model_validate_json(run.state_json)
