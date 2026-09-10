-- When the last browser ping went out. The notify endpoint refuses a new
-- push fan-out within the cooldown so a repeated tap can't spam
-- subscribers; an empty value means no ping has gone out yet.
--
-- Apply after 0005_push-message.sql:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0006_push-cooldown.sql

ALTER TABLE push_message ADD COLUMN pushed_at TEXT NOT NULL DEFAULT '';
