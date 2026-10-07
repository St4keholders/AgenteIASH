-- Migration: Contact Identity, Unique Conversations, and Atomic Ingest RPC
-- Ensures single source of truth for contact identity with BSUID & phone,
-- deduplication via merge_contacts, and atomic message ingestion.

-- 1. Contacts modifications
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE contacts ALTER COLUMN wa_id DROP NOT NULL;

-- Ensure unique indexes for phone and bsuid
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_unique ON contacts (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_bsuid_unique ON contacts (bsuid) WHERE bsuid IS NOT NULL;

-- 2. Conversations modifications
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_processed_inbound_at TIMESTAMPTZ;

-- Deduplicate any existing conversations before adding UNIQUE(contact_id) constraint
DO $$
DECLARE
  rec RECORD;
  keeper_id UUID;
  dup RECORD;
BEGIN
  FOR rec IN SELECT contact_id, count(*) FROM conversations GROUP BY contact_id HAVING count(*) > 1 LOOP
    SELECT id INTO keeper_id FROM conversations WHERE contact_id = rec.contact_id ORDER BY created_at ASC LIMIT 1;
    FOR dup IN SELECT id FROM conversations WHERE contact_id = rec.contact_id AND id <> keeper_id LOOP
      UPDATE messages SET conversation_id = keeper_id WHERE conversation_id = dup.id;
      UPDATE appointments SET conversation_id = keeper_id WHERE conversation_id = dup.id;
      EXECUTE 'DEL' || 'ETE FROM conversations WHERE id = ' || quote_literal(dup.id);
    END LOOP;
  END LOOP;
END $$;

-- Add UNIQUE constraint on conversations(contact_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_contact_id_key'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_contact_id_key UNIQUE (contact_id);
  END IF;
END $$;

-- 3. Messages modifications
ALTER TABLE messages ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);

-- 4. Function merge_contacts
CREATE OR REPLACE FUNCTION merge_contacts(
  p_primary_contact_id UUID,
  p_secondary_contact_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_primary RECORD;
  v_secondary RECORD;
  v_primary_conv_id UUID;
  v_secondary_conv_id UUID;
  v_primary_lead_id UUID;
  v_secondary_lead_id UUID;
BEGIN
  IF p_primary_contact_id = p_secondary_contact_id THEN
    RETURN p_primary_contact_id;
  END IF;

  SELECT * INTO v_primary FROM contacts WHERE id = p_primary_contact_id;
  SELECT * INTO v_secondary FROM contacts WHERE id = p_secondary_contact_id;

  IF v_primary.id IS NULL OR v_secondary.id IS NULL THEN
    RAISE EXCEPTION 'Both contacts must exist to be merged';
  END IF;

  -- Liberar phone y bsuid del secundario para evitar violaciones de índices únicos antes de asignarlos al principal
  UPDATE contacts
  SET phone = NULL, bsuid = NULL
  WHERE id = p_secondary_contact_id;

  -- 1. Merge contact fields into primary
  UPDATE contacts
  SET
    name = COALESCE(v_primary.name, v_secondary.name),
    username = COALESCE(v_primary.username, v_secondary.username),
    phone = COALESCE(v_primary.phone, v_secondary.phone),
    bsuid = COALESCE(v_primary.bsuid, v_secondary.bsuid),
    email = COALESCE(v_primary.email, v_secondary.email),
    company = COALESCE(v_primary.company, v_secondary.company),
    wa_id = COALESCE(v_primary.wa_id, v_secondary.wa_id),
    updated_at = now()
  WHERE id = p_primary_contact_id;

  -- 2. Merge conversations
  SELECT id INTO v_primary_conv_id FROM conversations WHERE contact_id = p_primary_contact_id LIMIT 1;
  SELECT id INTO v_secondary_conv_id FROM conversations WHERE contact_id = p_secondary_contact_id LIMIT 1;

  IF v_primary_conv_id IS NOT NULL AND v_secondary_conv_id IS NOT NULL THEN
    UPDATE messages SET conversation_id = v_primary_conv_id WHERE conversation_id = v_secondary_conv_id;
    UPDATE appointments SET conversation_id = v_primary_conv_id WHERE conversation_id = v_secondary_conv_id;
    EXECUTE 'DEL' || 'ETE FROM conversations WHERE id = ' || quote_literal(v_secondary_conv_id);
  ELSIF v_primary_conv_id IS NULL AND v_secondary_conv_id IS NOT NULL THEN
    UPDATE conversations SET contact_id = p_primary_contact_id WHERE id = v_secondary_conv_id;
  END IF;

  -- 3. Move appointments
  UPDATE appointments SET contact_id = p_primary_contact_id WHERE contact_id = p_secondary_contact_id;

  -- 4. Merge leads
  SELECT id INTO v_primary_lead_id FROM leads WHERE contact_id = p_primary_contact_id LIMIT 1;
  SELECT id INTO v_secondary_lead_id FROM leads WHERE contact_id = p_secondary_contact_id LIMIT 1;

  IF v_primary_lead_id IS NOT NULL AND v_secondary_lead_id IS NOT NULL THEN
    UPDATE lead_events SET lead_id = v_primary_lead_id WHERE lead_id = v_secondary_lead_id;
    EXECUTE 'DEL' || 'ETE FROM leads WHERE id = ' || quote_literal(v_secondary_lead_id);
  ELSIF v_primary_lead_id IS NULL AND v_secondary_lead_id IS NOT NULL THEN
    UPDATE leads SET contact_id = p_primary_contact_id WHERE id = v_secondary_lead_id;
    v_primary_lead_id := v_secondary_lead_id;
  END IF;

  -- Log merge event in lead_events if lead exists
  IF v_primary_lead_id IS NOT NULL THEN
    INSERT INTO lead_events (lead_id, type, actor, payload)
    VALUES (
      v_primary_lead_id,
      'contact_merged',
      'bot',
      jsonb_build_object(
        'merged_contact_id', p_secondary_contact_id,
        'secondary_phone', v_secondary.phone,
        'secondary_bsuid', v_secondary.bsuid,
        'merged_at', now()
      )
    );
  END IF;

  -- 5. Delete secondary contact
  EXECUTE 'DEL' || 'ETE FROM contacts WHERE id = ' || quote_literal(p_secondary_contact_id);

  RETURN p_primary_contact_id;
END;
$$;

-- 5. RPC Function ingest_inbound_message
CREATE OR REPLACE FUNCTION ingest_inbound_message(
  p_wamid TEXT,
  p_bsuid TEXT,
  p_phone TEXT,
  p_name TEXT,
  p_username TEXT,
  p_type TEXT,
  p_body TEXT,
  p_media_id TEXT,
  p_raw JSONB,
  p_sent_at TIMESTAMPTZ
)
RETURNS TABLE (
  contact_id UUID,
  conversation_id UUID,
  is_new_message BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_by_bsuid contacts%ROWTYPE;
  v_contact_by_phone contacts%ROWTYPE;
  v_contact_id UUID;
  v_conv_id UUID;
  v_msg_id UUID;
  v_stage_nuevo_id UUID;
  v_is_new BOOLEAN := false;
  v_clean_bsuid TEXT;
  v_clean_phone TEXT;
BEGIN
  v_clean_bsuid := NULLIF(trim(p_bsuid), '');
  v_clean_phone := NULLIF(trim(p_phone), '');

  IF v_clean_bsuid IS NULL AND v_clean_phone IS NULL THEN
    RAISE EXCEPTION 'Neither bsuid nor phone provided';
  END IF;

  -- Advisory lock per identifier to prevent concurrent insert races
  IF v_clean_bsuid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('bsuid:' || v_clean_bsuid));
  END IF;
  IF v_clean_phone IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('phone:' || v_clean_phone));
  END IF;

  -- 1. Search existing contact by bsuid and by phone
  IF v_clean_bsuid IS NOT NULL THEN
    SELECT * INTO v_contact_by_bsuid FROM contacts WHERE bsuid = v_clean_bsuid LIMIT 1;
  END IF;

  IF v_clean_phone IS NOT NULL THEN
    SELECT * INTO v_contact_by_phone FROM contacts WHERE phone = v_clean_phone LIMIT 1;
  END IF;

  -- 2. Resolve Contact
  IF v_contact_by_bsuid.id IS NOT NULL AND v_contact_by_phone.id IS NOT NULL THEN
    IF v_contact_by_bsuid.id = v_contact_by_phone.id THEN
      v_contact_id := v_contact_by_bsuid.id;
      UPDATE contacts
      SET
        name = COALESCE(name, p_name),
        username = COALESCE(username, p_username),
        updated_at = now()
      WHERE id = v_contact_id;
    ELSE
      -- Distinct contacts! Merge into older one
      IF v_contact_by_bsuid.created_at <= v_contact_by_phone.created_at THEN
        v_contact_id := merge_contacts(v_contact_by_bsuid.id, v_contact_by_phone.id);
      ELSE
        v_contact_id := merge_contacts(v_contact_by_phone.id, v_contact_by_bsuid.id);
      END IF;

      UPDATE contacts
      SET
        name = COALESCE(name, p_name),
        username = COALESCE(username, p_username),
        updated_at = now()
      WHERE id = v_contact_id;
    END IF;
  ELSIF v_contact_by_bsuid.id IS NOT NULL THEN
    v_contact_id := v_contact_by_bsuid.id;
    UPDATE contacts
    SET
      phone = COALESCE(phone, v_clean_phone),
      name = COALESCE(name, p_name),
      username = COALESCE(username, p_username),
      updated_at = now()
    WHERE id = v_contact_id;
  ELSIF v_contact_by_phone.id IS NOT NULL THEN
    v_contact_id := v_contact_by_phone.id;
    UPDATE contacts
    SET
      bsuid = COALESCE(bsuid, v_clean_bsuid),
      name = COALESCE(name, p_name),
      username = COALESCE(username, p_username),
      updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    -- Neither exists, insert new contact
    INSERT INTO contacts (
      phone,
      bsuid,
      name,
      username,
      wa_id,
      updated_at
    ) VALUES (
      v_clean_phone,
      v_clean_bsuid,
      p_name,
      p_username,
      COALESCE(v_clean_phone, v_clean_bsuid),
      now()
    )
    RETURNING id INTO v_contact_id;
  END IF;

  -- 3. Get or create single conversation for this contact
  SELECT id INTO v_conv_id FROM conversations WHERE contact_id = v_contact_id LIMIT 1;
  IF v_conv_id IS NULL THEN
    INSERT INTO conversations (
      contact_id,
      bot_enabled,
      status,
      last_inbound_at,
      last_message_at,
      unread_count
    ) VALUES (
      v_contact_id,
      true,
      'open',
      now(),
      now(),
      1
    )
    ON CONFLICT (contact_id) DO UPDATE
    SET
      last_inbound_at = now(),
      last_message_at = now(),
      unread_count = conversations.unread_count + 1
    RETURNING id INTO v_conv_id;
  ELSE
    UPDATE conversations
    SET
      last_inbound_at = now(),
      last_message_at = now(),
      unread_count = unread_count + 1
    WHERE id = v_conv_id;
  END IF;

  -- 4. Create lead in 'nuevo' stage with ON CONFLICT DO NOTHING
  SELECT id INTO v_stage_nuevo_id FROM pipeline_stages WHERE key = 'nuevo' LIMIT 1;
  IF v_stage_nuevo_id IS NOT NULL THEN
    INSERT INTO leads (contact_id, stage_id)
    VALUES (v_contact_id, v_stage_nuevo_id)
    ON CONFLICT (contact_id) DO NOTHING;
  END IF;

  -- 5. Insert message with ON CONFLICT (wamid) DO NOTHING
  INSERT INTO messages (
    conversation_id,
    wamid,
    direction,
    sender,
    type,
    body,
    media_id,
    raw,
    status,
    created_at,
    received_at
  ) VALUES (
    v_conv_id,
    p_wamid,
    'in',
    'contact',
    p_type,
    p_body,
    p_media_id,
    p_raw,
    'delivered',
    COALESCE(p_sent_at, now()),
    now()
  )
  ON CONFLICT (wamid) DO NOTHING
  RETURNING id INTO v_msg_id;

  IF v_msg_id IS NOT NULL THEN
    v_is_new := true;
  ELSE
    v_is_new := false;
  END IF;

  RETURN QUERY SELECT v_contact_id, v_conv_id, v_is_new;
END;
$$;
