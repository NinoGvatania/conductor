-- Drop workspace FK constraints that block inserts
-- (workspaces aren't used yet in V1)
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_workspace_id_fkey;
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_workspace_id_fkey;
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_workflow_id_fkey;
