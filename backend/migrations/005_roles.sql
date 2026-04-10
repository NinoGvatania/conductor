-- Project members with roles
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'member',  -- admin, member, viewer
    invited_at TIMESTAMPTZ DEFAULT now(),
    accepted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
