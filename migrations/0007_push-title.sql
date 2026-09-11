-- Custom ping title the next tickle shows. Stored beside the custom
-- line; an empty title means the standard title ("Something new in the
-- gallery"). One row, ever.
--
-- Apply after 0006_push-cooldown.sql:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0007_push-title.sql

ALTER TABLE push_message ADD COLUMN title TEXT NOT NULL DEFAULT '';
