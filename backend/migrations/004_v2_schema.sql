-- AgentFlow v2 schema

-- Projects (workspaces)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chat conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Chat',
    initiated_by TEXT DEFAULT 'user',  -- 'user' or 'agent'
    agent_name TEXT,  -- if initiated by agent
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- 'user', 'assistant', 'agent', 'system'
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',  -- agent_name, tool_calls, approval_request, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tools as standalone entities
CREATE TABLE IF NOT EXISTS tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    url TEXT DEFAULT '',
    method TEXT DEFAULT 'POST',
    headers JSONB DEFAULT '{}',
    parameters JSONB DEFAULT '{}',
    body_template JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- LLM provider configs
CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,  -- anthropic, openai, gemini, yandexgpt, gigachat, mistral, custom
    api_key TEXT DEFAULT '',
    base_url TEXT DEFAULT '',  -- for custom providers
    is_active BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Workflow templates library
CREATE TABLE IF NOT EXISTS workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    definition_json TEXT NOT NULL,
    is_public BOOLEAN DEFAULT false,
    author TEXT DEFAULT '',
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);
