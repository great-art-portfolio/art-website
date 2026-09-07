-- Collector email list ("tell me about new paintings" addresses).
-- Joins push_subscriptions as the one table's second resident: browsers
-- that can't do Web Push (notably iPhone Safari) still get one email
-- per new painting, broadcast from /admin alongside the push tickle.
--
-- Apply after 0002_drop-unused-tables.sql:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0003_email-collectors.sql

CREATE TABLE IF NOT EXISTS email_collectors (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
