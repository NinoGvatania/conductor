# AGENTS.md

## Project: AgentFlow — Managed AI Workforce Platform

### What this is
B2B SaaS platform for automating document-heavy business processes using orchestrated AI agents.
User describes a process in natural language → platform generates a pipeline of specialized agents → executes it step by step with full traceability, human approvals, and cost control.

### Architecture (from final spec v2)

**5 core entities:** Workspace, Agent, Tool, Workflow, Evaluation
**6 node types:** Deterministic, Agent, Router, Parallel, Human, Evaluator
**Key principle:** LLM does NOT control flow. Engine controls flow. LLM makes decisions within typed contracts at each step.

### Tech Stack
- Backend: FastAPI (Python 3.12), async everywhere
- Frontend: Next.js 15, React, shadcn/ui, Tailwind CSS
- DB + Auth + Storage: Supabase (PostgreSQL + Auth + S3)
- LLM: Anthropic Claude API (anthropic Python SDK)
- Deploy: Railway (backend), Vercel (frontend)
- No Redis, no Temporal, no Docker in V1

### Project Structure
```
agentflow/
├── backend/
│   ├── main.py                    # FastAPI app entry
│   ├── config.py                  # Settings via pydantic-settings
│   ├── database.py                # Supabase client init
│   ├── routes/
│   │   ├── agents.py              # CRUD agents
│   │   ├── workflows.py           # CRUD workflows + start run
│   │   ├── runs.py                # List runs, get run detail, resume
│   │   ├── approvals.py           # List pending, approve/reject
│   │   ├── chat.py                # Chat endpoint (describe process → generate workflow)
│   │   └── ws.py                  # WebSocket for live trace streaming
│   ├── core/
│   │   ├── contracts/
│   │   │   ├── agent.py           # AgentContract (Pydantic)
│   │   │   ├── tool.py            # ToolContract (Pydantic)
│   │   │   ├── workflow.py        # WorkflowDefinition, NodeDefinition (Pydantic)
│   │   │   ├── run.py             # RunState, StepResult (Pydantic)
│   │   │   └── errors.py          # RetriableError, CorrectableError, FatalError
│   │   ├── engine/
│   │   │   ├── orchestrator.py    # Main orchestration loop
│   │   │   ├── node_executor.py   # Dispatches by node type
│   │   │   ├── checkpoint.py      # Save/load RunState to Supabase
│   │   │   └── budget.py          # Cost/token limits per run
│   │   ├── agents/
│   │   │   ├── runner.py          # AgentRunner (retry, timeout, schema validation)
│   │   │   ├── registry.py        # Agent registry
│   │   │   └── builtin/           # Pre-built agent configs
│   │   │       ├── classifier.py
│   │   │       ├── extractor.py
│   │   │       ├── validator.py
│   │   │       ├── risk_scorer.py
│   │   │       ├── decision_maker.py
│   │   │       └── draft_writer.py
│   │   ├── providers/
│   │   │   ├── base.py            # LLMProvider ABC
│   │   │   ├── anthropic.py       # Claude implementation
│   │   │   └── model_router.py    # Haiku/Sonnet/Opus selection by tier
│   │   ├── guardrails/
│   │   │   ├── pipeline.py        # 5-point guardrail chain
│   │   │   ├── schema_validator.py
│   │   │   └── budget_guard.py
│   │   └── workflow_generator.py  # LLM generates WorkflowDefinition from natural language
│   └── templates/
│       └── claims_processing.json # Pre-built template
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Dashboard
│   │   │   ├── chat/page.tsx      # Chat interface (describe process)
│   │   │   ├── agents/page.tsx    # Agent registry
│   │   │   ├── workflows/page.tsx # Workflow list
│   │   │   ├── runs/page.tsx      # Run list
│   │   │   ├── runs/[id]/page.tsx # Run detail (trace viewer)
│   │   │   ├── approvals/page.tsx # Approval inbox
│   │   │   └── settings/page.tsx  # API keys, budget limits
│   │   ├── components/
│   │   │   ├── chat/              # Chat UI components
│   │   │   ├── runs/              # Trace viewer components
│   │   │   ├── approvals/         # Approval cards
│   │   │   └── ui/               # shadcn/ui re-exports
│   │   ├── lib/
│   │   │   ├── api.ts            # Backend API client
│   │   │   ├── supabase.ts       # Supabase client
│   │   │   └── utils.ts
│   │   └── hooks/
│   │       ├── useRun.ts
│   │       └── useWebSocket.ts
│   ├── package.json
│   └── next.config.js
│
├── AGENTS.md                      # This file
├── README.md
└── pyproject.toml
```

### Code Style Rules
- ALL data models are Pydantic v2 BaseModel. Never use raw dicts for structured data.
- Type hints on every function.
- async/await for all I/O (DB, LLM, HTTP).
- No global mutable state.
- Errors: raise HTTPException with clear messages, proper status codes.
- Logging: use structlog with JSON output.
- Retry only on: timeout, rate_limit, schema_validation. NEVER retry on "low confidence".
- Frontend: use shadcn/ui components, Tailwind CSS, no custom CSS unless necessary.

### Key Contracts (reference for all code)

**AgentContract fields:** name, description, purpose, model_tier (fast/balanced/powerful), system_prompt, allowed_tools, output_schema, max_tokens, temperature, timeout_seconds, max_retries, retry_on, can_write, escalation_policy, version, status

**ToolContract fields:** name, description, parameters_schema, output_schema, risk_level (read_only/write/high_risk/code_execution), side_effecting, requires_approval, timeout_seconds, idempotent

**WorkflowDefinition fields:** id, name, version, entry_node, nodes (list of NodeDefinition), max_total_cost_usd, max_total_steps

**NodeDefinition fields:** id, type (deterministic/agent/router/parallel/human/evaluator), agent_name, next_nodes, condition, parallel_nodes, timeout_seconds, config

**RunState fields:** run_id, workflow_id, workflow_version, status (running/completed/failed/paused), current_node, input_data, steps (list of StepResult), total_tokens, total_cost_usd, total_steps, intermediate_results, pending_approval

**StepResult fields:** node_id, status (pending/running/completed/failed/waiting_approval), agent_name, output, error, tokens_used, cost_usd, latency_ms, tool_calls, retries, guardrail_triggers

### Model Tiers
- fast → claude-haiku-4-5-20251001 (routing, classification, simple tasks)
- balanced → claude-sonnet-4-6 (extraction, writing, research)
- powerful → claude-opus-4-6 (decisions, compliance, complex reasoning)

### Guardrails Pipeline (5 points)
1. pre_run — input validation, budget check
2. pre_tool — schema validation, permission check, approval if required
3. post_tool — output validation, PII check
4. pre_output — final schema validation, safety filter
5. side_effect — approval gate before write/high-risk actions

### Error Taxonomy
- RetriableError: timeout, rate_limit, transient network → auto retry with backoff
- CorrectableError: invalid schema, malformed output → retry with feedback
- EscalatableError: agent uncertain, missing data → pause for human
- FatalError: budget exceeded, policy violation → stop workflow

### What NOT to do
- No dict[str, Any] for structured data — use Pydantic models
- No LLM controlling the workflow flow — engine controls
- No retry on low confidence without changing strategy
- No guardrails only on input/output — use all 5 points
- No deploying agents without eval test cases
- No single LLM provider without fallback strategy
