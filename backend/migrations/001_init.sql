-- AgentFlow Database Schema

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    purpose TEXT,
    model_tier TEXT NOT NULL DEFAULT 'balanced',
    system_prompt TEXT NOT NULL,
    output_schema JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    version TEXT DEFAULT '1.0.0',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agents_workspace ON agents(workspace_id);
CREATE INDEX idx_agents_name ON agents(name);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    version TEXT DEFAULT '1.0.0',
    definition_json TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workflows_workspace ON workflows(workspace_id);

-- Runs
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    state_json TEXT NOT NULL,
    total_tokens INTEGER DEFAULT 0,
    total_cost_usd NUMERIC(10, 6) DEFAULT 0,
    total_steps INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_runs_workflow ON runs(workflow_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_workspace ON runs(workspace_id);

-- Steps
CREATE TABLE IF NOT EXISTS steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    agent_name TEXT,
    output JSONB,
    error TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0,
    latency_ms NUMERIC(10, 2) DEFAULT 0,
    tool_calls JSONB DEFAULT '[]',
    retries INTEGER DEFAULT 0,
    guardrail_triggers JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_steps_run ON steps(run_id);
CREATE INDEX idx_steps_node ON steps(node_id);

-- Approvals
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decision TEXT,
    comment TEXT,
    reviewer_id UUID REFERENCES auth.users(id),
    context JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_approvals_run ON approvals(run_id);
CREATE INDEX idx_approvals_status ON approvals(status);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_runs_updated_at BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_steps_updated_at BEFORE UPDATE ON steps FOR EACH ROW EXECUTE FUNCTION update_updated_at();
