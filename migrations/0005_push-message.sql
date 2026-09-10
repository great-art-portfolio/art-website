-- Custom ping line the next tickle shows. Tickles carry no payload (no
-- payload encryption), so the service worker fetches this when one
-- arrives; an empty body means the standard note. One row, ever.
--
-- Apply after 0004_list-consent.sql:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0005_push-message.sql

CREATE TABLE IF NOT EXISTS push_message (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL DEFAULT ''
);
