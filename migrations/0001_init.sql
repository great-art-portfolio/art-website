-- Full D1 schema for the gallery. Since nothing is provisioned yet, this is
-- the one and only file to apply:
--   pnpm wrangler d1 execute art-gallery-db --file=./migrations/0001_init.sql
-- Prices are stored as integer cents to avoid float rounding.
-- painting_views holds anonymous per-painting counters (no IP, no identity).

CREATE TABLE IF NOT EXISTS paintings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  alt TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  width_in REAL,
  height_in REAL,
  depth_in REAL,
  model_glb_url TEXT NOT NULL DEFAULT '',
  model_usdz_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'available', 'reserved', 'sold')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  painting_id TEXT NOT NULL REFERENCES paintings(id),
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'sold', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS painting_views (
  slug TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_paintings_status ON paintings(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_painting ON inquiries(painting_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
