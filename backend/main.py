import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import agents, approvals, chat, runs, workflows
from backend.routes import projects, conversations, tools, llm_providers, files

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)

app = FastAPI(
    title="AgentFlow",
    description="AI Workforce Platform",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core routes
app.include_router(projects.router)
app.include_router(conversations.router)
app.include_router(agents.router)
app.include_router(tools.router)
app.include_router(workflows.router)
app.include_router(runs.router)
app.include_router(llm_providers.router)
app.include_router(files.router)
app.include_router(chat.router)
app.include_router(approvals.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.on_event("startup")
async def startup():
    logger = structlog.get_logger()
    logger.info("agentflow_v2_starting")
    try:
        from backend.database import get_supabase_client
        get_supabase_client()
        logger.info("supabase_connected")
    except Exception as e:
        logger.warning("supabase_connection_failed", error=str(e))
