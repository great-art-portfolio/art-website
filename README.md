# [Art Portfolio](https://github.com/great-art-portfolio/art-website)

https://art-website-cm4.pages.dev/

[Cloudflare](https://dash.cloudflare.com/ee6937662d7aeda01d2a6f1f49a1168a/pages/view/art-website)

## Stack (all free tier)

Astro 5 (static gallery) + Cloudflare Pages Functions (API) + D1 (paintings,
inquiries) + R2 (photos). Admin at `/admin`, protected by Cloudflare Access
(email OTP). Buyer inquiries email via Resend + iOS push via ntfy.

## Setup

```sh
pnpm install
pnpm dev            # gallery
pnpm check          # astro check
pnpm build
```

First-time Cloudflare provisioning:

```sh
pnpm wrangler d1 create art-gallery-db   # paste id into wrangler.toml
pnpm wrangler d1 execute art-gallery-db --file=./migrations/0001_init.sql
pnpm wrangler r2 bucket create art-gallery-images
pnpm db:seed > /tmp/seed.sql            # migrate legacy paintings into D1
pnpm wrangler d1 execute art-gallery-db --file=/tmp/seed.sql
```

Secrets (dashboard, never committed): `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`,
`NOTIFY_EMAIL_TO`, `ADMIN_API_TOKEN`, optional `PUSHOVER_*`, and later
`STRIPE_SECRET_KEY` / `SHIPPO_API_TOKEN` / `AYRSHARE_API_KEY` with their
`ENABLE_*` flags.

Apply the schema once (`migrations/0001_init.sql` has all three tables).

## Analytics & offline

- Aggregate stats: Cloudflare Web Analytics. Dashboard → Web Analytics →
  Add site, then build with `PUBLIC_CF_BEACON_TOKEN=<token> pnpm build`.
  Cookieless, so no banner (see `/privacy`).
- Per-painting views: first-party counter (`/api/views`, shown in `/admin`).
- Offline: `public/sw.js` caches the shell + artwork and replays queued
  views/inquiries via Background Sync. Install the site to the iPhone/iPad
  home screen for the app icon + inbox badge.
- AR: upload with "view on your wall" checked generates GLB + USDZ models
  (three.js, on-device) stored in R2; `/art` pages render them with
  `<model-viewer>` (Scene Viewer on Android, Quick Look on iOS).
- Collector push: `node scripts/gen-vapid.mjs`, set `VAPID_PUBLIC_KEY` /
  `VAPID_CONTACT` vars + `VAPID_PRIVATE_JWK` secret; homepage bell subscribes,
  "Notify collectors" in `/admin` fans out.
- Spam: Security > Turnstile > Add site (managed widget), set
  `TURNSTILE_SITE_KEY` var + `TURNSTILE_SECRET_KEY` secret. Until then the
  honeypot guards the form.

## Docs

- [docs/DECISIONS.md](docs/DECISIONS.md) — why Access, D1/R2, Resend, ntfy
- [docs/LEARNED.md](docs/LEARNED.md) — notes from building this
- [docs/RESOURCES.md](docs/RESOURCES.md) — inspiration links
