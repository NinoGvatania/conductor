from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db
from backend.routes import (
    agents,
    auth,
    builders,
    connections,
    conversations,
    files,
    llm_providers,
    projects,
    runs,
    tools,
    workflows,
)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("agentflow_starting")
    try:
        await init_db()
        logger.info("database_initialized")
    except Exception as e:
        logger.warning("db_init_failed", error=str(e))
    yield


app = FastAPI(
    title="AgentFlow",
    description="AI Workforce Platform",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(conversations.router)
app.include_router(builders.router)
app.include_router(agents.router)
app.include_router(connections.router)
app.include_router(tools.router)
app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(llm_providers.router)
app.include_router(files.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.3.0"}
