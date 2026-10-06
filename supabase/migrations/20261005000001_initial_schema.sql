-- 01: Initial Schema for Stakeholders AI WhatsApp Agent & Dashboard

-- 1. Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id TEXT UNIQUE NOT NULL,
  phone TEXT,
  bsuid TEXT,
  name TEXT,
  email TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  bot_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_inbound_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INT NOT NULL DEFAULT 0,
  needs_human BOOLEAN NOT NULL DEFAULT false,
  processing_lock_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wamid TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  sender TEXT NOT NULL CHECK (sender IN ('contact', 'bot', 'human', 'system')),
  type TEXT NOT NULL CHECK (type IN ('text', 'audio', 'image', 'document', 'other')),
  body TEXT,
  transcript TEXT,
  media_id TEXT,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  google_event_id TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('virtual', 'presencial')),
  service TEXT NOT NULL,
  meet_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'rescheduled', 'cancelled', 'attended', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Pipeline stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  position INT NOT NULL,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false
);

-- 6. Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID UNIQUE NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  service_interest TEXT,
  temperature TEXT CHECK (temperature IN ('caliente', 'tibio', 'frío')),
  invoices_per_month INT,
  suggested_plan TEXT,
  summary TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Lead events
CREATE TABLE IF NOT EXISTS lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  actor TEXT NOT NULL CHECK (actor IN ('bot', 'human')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Agent configs
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  data JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- 9. Agent runs
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  config_version INT,
  input JSONB,
  output TEXT,
  tool_calls JSONB,
  tokens_in INT,
  tokens_out INT,
  latency_ms INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_wa_id ON contacts(wa_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_wamid ON messages(wamid);
CREATE INDEX IF NOT EXISTS idx_appointments_start_at ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON leads(stage_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_single_published ON agent_configs(status) WHERE status = 'published';

-- RPC Functions for Atomic Locking
CREATE OR REPLACE FUNCTION acquire_conversation_lock(p_conversation_id UUID, p_lock_duration_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
  SET processing_lock_until = now() + (p_lock_duration_seconds || ' seconds')::interval
  WHERE id = p_conversation_id
    AND (processing_lock_until IS NULL OR processing_lock_until < now());
  
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION release_conversation_lock(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
  SET processing_lock_until = NULL
  WHERE id = p_conversation_id;
END;
$$;

-- RLS: Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policies for Authenticated Users (Dashboard)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'authenticated_all_contacts') THEN
    CREATE POLICY authenticated_all_contacts ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'authenticated_all_conversations') THEN
    CREATE POLICY authenticated_all_conversations ON conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'authenticated_all_messages') THEN
    CREATE POLICY authenticated_all_messages ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'authenticated_all_appointments') THEN
    CREATE POLICY authenticated_all_appointments ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_stages' AND policyname = 'authenticated_all_pipeline_stages') THEN
    CREATE POLICY authenticated_all_pipeline_stages ON pipeline_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'authenticated_all_leads') THEN
    CREATE POLICY authenticated_all_leads ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_events' AND policyname = 'authenticated_all_lead_events') THEN
    CREATE POLICY authenticated_all_lead_events ON lead_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_configs' AND policyname = 'authenticated_all_agent_configs') THEN
    CREATE POLICY authenticated_all_agent_configs ON agent_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_runs' AND policyname = 'authenticated_all_agent_runs') THEN
    CREATE POLICY authenticated_all_agent_runs ON agent_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'authenticated_all_settings') THEN
    CREATE POLICY authenticated_all_settings ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Storage Bucket for Media
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for Authenticated Users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'authenticated_media_access') THEN
    CREATE POLICY authenticated_media_access ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'media') WITH CHECK (bucket_id = 'media');
  END IF;
END $$;

-- Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages, conversations, leads;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
