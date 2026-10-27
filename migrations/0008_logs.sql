-- Errors and notable events for agents to read (`pnpm logs`), and every
-- buyer inquiry, so a failed email never loses one.
--
-- Apply after 0007_push-title.sql:
--   pnpm wrangler d1 execute art-gallery-db --remote --file=./migrations/0008_logs.sql

-- One row per event. `event` is a stable dotted key (inquiry.email_failed,
-- http.5xx, client.error) to filter on; `detail` is JSON context (status,
-- provider answer, stack, slug), never secrets.
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  route TEXT NOT NULL DEFAULT '',
  ray TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS logs_at ON logs (at);
CREATE INDEX IF NOT EXISTS logs_event ON logs (event);

-- Every inquiry as it arrived, with whether it reached her. A row stuck at
-- 'failed' is one she hasn't seen: an agent resends it.
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  slug TEXT NOT NULL,
  painting_title TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  message TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS inquiries_at ON inquiries (at);
