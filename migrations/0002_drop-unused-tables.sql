-- Retire the database-backed gallery: paintings, inquiries, view counters,
-- and site settings all live in git / email / Cloudflare Analytics now.
-- The one table that survives is push_subscriptions ("tell me about new
-- paintings" browser addresses) — everything else is dropped.
--
-- Apply after 0001_init.sql:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0002_drop-unused-tables.sql

DROP TABLE IF EXISTS paintings;
DROP TABLE IF EXISTS inquiries;
DROP TABLE IF EXISTS painting_views;
DROP TABLE IF EXISTS site_settings;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
