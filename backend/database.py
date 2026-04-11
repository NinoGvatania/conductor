from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.base import Base

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables on startup. Use Alembic for production.

    Applies idempotent in-place schema upgrades for columns that were added
    after the initial schema was deployed. `Base.metadata.create_all` does NOT
    alter existing tables, so any new column / constraint change needs a
    matching `ALTER TABLE` here (or a real Alembic migration).
    """
    from sqlalchemy import text

    async with engine.begin() as conn:
        # Enable pgvector extension
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            pass  # Extension may not be available
        await conn.run_sync(Base.metadata.create_all)

        # Incremental schema upgrades — idempotent ALTERs, safe to re-run.
        # agents.model (nullable text) — explicit model id overrides tier
        try:
            await conn.execute(
                text("ALTER TABLE agents ADD COLUMN IF NOT EXISTS model VARCHAR(255)")
            )
        except Exception:
            pass
        # agents.max_tokens — make nullable so "None" means "use model max"
        try:
            await conn.execute(
                text("ALTER TABLE agents ALTER COLUMN max_tokens DROP NOT NULL")
            )
        except Exception:
            pass
