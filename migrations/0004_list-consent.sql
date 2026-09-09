-- Confirmed opt-in + one-click unsubscribe tokens. Rows that predate
-- this file never got a confirmation email, so grandfather them as
-- confirmed with a fresh token each.
--
-- Apply after 0003_email-collectors.sql:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0004_list-consent.sql

ALTER TABLE email_collectors ADD COLUMN token TEXT;
ALTER TABLE email_collectors ADD COLUMN confirmed_at TEXT;
ALTER TABLE email_collectors ADD COLUMN token_created_at TEXT;
UPDATE email_collectors
SET token = lower(hex(randomblob(16))),
  confirmed_at = created_at,
  token_created_at = created_at
WHERE token IS NULL;
