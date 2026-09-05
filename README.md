# [Art Portfolio](https://github.com/great-art-portfolio/art-website)

https://art-website-cm4.pages.dev/

[Cloudflare](https://dash.cloudflare.com/ee6937662d7aeda01d2a6f1f49a1168a/pages/view/art-website)

## Stack (all free tier)

Astro 7 (static gallery — paintings are markdown + photos in git) +
Cloudflare Pages Functions (inquiry emails, git publishing, push fan-out)
+ D1 (one table: push subscriptions). Admin at `/admin`, protected by
Cloudflare Access (email OTP). Saving publishes to git; the git-connected
Pages project rebuilds (live in a few minutes). Buyer inquiries email via
Resend, nothing stored.

## Setup

```sh
pnpm install
pnpm dev            # gallery
pnpm check          # astro check
pnpm build
pnpm check:inline   # no raw TS/imports in inline page scripts (see below)
pnpm test:e2e       # Playwright smoke suite (needs dist built)
```

Page scripts (`.astro` `<script>` blocks) ship to the browser as classic
scripts — a static `import` or any TypeScript syntax kills the whole
handler with no error surfaced in CI. So: plain JavaScript plus dynamic
`import()` in page scripts only (shared logic lives in `src/lib/*.ts`,
imported dynamically), page data via `data-*` attributes instead of
`define:vars` (which disables bundling), and `check:inline` fails the
build if raw syntax slips into `dist/`. The smoke suite covers the
reveal toggle, inquiry validation, and admin graceful fallbacks against
the real Pages runtime; live-secret delivery stays a manual checklist
(see the warning at the top of `tests/smoke.spec.ts`).

First-time Cloudflare provisioning:

```sh
pnpm wrangler d1 create art-gallery-db   # paste id into wrangler.toml
pnpm wrangler d1 execute art-gallery-db --file=./migrations/0001_init.sql
pnpm wrangler d1 execute art-gallery-db --file=./migrations/0002_drop-unused-tables.sql
```

Git publishing (so `/admin` can save paintings + banner):

```sh
# Dashboard vars/secrets, never committed:
GITHUB_TOKEN    # classic PAT, Contents: read+write on this repo
GITHUB_REPO     # e.g. great-art-portfolio/art-website
GITHUB_BRANCH   # main (optional, defaults to main)
```

Secrets (dashboard, never committed): `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`
(requires a verified sending domain), `NOTIFY_EMAIL_TO` (her private inbox,
never shown on the site), `ADMIN_API_TOKEN`, `GITHUB_TOKEN` (+ repo/branch),
optional `PUSHOVER_*`, and later `SHIPPO_API_TOKEN` / `AYRSHARE_API_KEY`
with their `ENABLE_*` flags.

## Analytics & offline

- Aggregate stats: Cloudflare Web Analytics. Dashboard → Web Analytics →
  Add site, then build with `PUBLIC_CF_BEACON_TOKEN=<token> pnpm build`.
  Cookieless, so no banner (see `/privacy`). Per-painting views come from
  the same dashboard (per-page stats) — no counter code.
- Offline: `public/sw.js` caches the shell + artwork and replays queued
  inquiries via Background Sync. Install the site to the iPhone/iPad
  home screen for the app icon.
- AR: upload with "view on your wall" checked generates GLB + USDZ models
  (three.js, on-device) committed to `public/models`; painting pages render
  them with `<model-viewer>` (Scene Viewer on Android, Quick Look on iOS).
- Collector push: `node scripts/gen-vapid.mjs`, set `VAPID_PUBLIC_KEY` /
  `VAPID_CONTACT` vars + `VAPID_PRIVATE_JWK` secret; homepage bell subscribes,
  "Notify collectors" in `/admin` fans out. The subscription table is the
  only database the site keeps (disclosed on `/privacy`).
- Spam: Security > Turnstile > Add site (managed widget), set
  `TURNSTILE_SITE_KEY` var + `TURNSTILE_SECRET_KEY` secret. Until then the
  honeypot guards the form.

## Docs

- [docs/DECISIONS.md](docs/DECISIONS.md) — why Access, D1/R2, Resend, ntfy
- [docs/LEARNED.md](docs/LEARNED.md) — notes from building this
- [docs/RESOURCES.md](docs/RESOURCES.md) — inspiration links
