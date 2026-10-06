-- Allow 'archived' status in agent_configs for version history
ALTER TABLE agent_configs DROP CONSTRAINT IF EXISTS agent_configs_status_check;
ALTER TABLE agent_configs ADD CONSTRAINT agent_configs_status_check CHECK (status IN ('draft', 'published', 'archived'));
