-- Migration: Support BSUID and Phone dual-resolution on contacts
-- 1. Ensure phone and bsuid columns are nullable
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE contacts ALTER COLUMN bsuid DROP NOT NULL;

-- 2. Partial unique indexes to prevent duplicate phone numbers and duplicate BSUIDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_unique ON contacts (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_bsuid_unique ON contacts (bsuid) WHERE bsuid IS NOT NULL;
