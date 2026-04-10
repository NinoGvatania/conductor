-- Connections (integrations) — group tools by external app
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    base_url TEXT DEFAULT '',
    auth_type TEXT DEFAULT 'api_key',
    credentials JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Link tools to connections
ALTER TABLE tools ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES connections(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tools_connection ON tools(connection_id);
