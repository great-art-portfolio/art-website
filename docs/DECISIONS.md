# Decisions

## Authentication

Single artist → Cloudflare Access (email OTP) on `/admin/*`. No passwords to
store, no OAuth app to maintain. The old GitHub OAuth flow was removed: it
only proved identity, needed a `client_secret` server leg, and broke CSRF-wise
on a static site. `ADMIN_API_TOKEN` remains as defense-in-depth for API calls.

## Data

Paintings and inquiries live in Cloudflare D1, images in R2 — both free tier.
The old "commit a .md + .jpg to git on every upload" flow is gone: it forced a
rebuild per painting and needed a GitHub token on her phone.

## Email + push

Workers can't run an SMTP server, so mail goes through Resend (free
100/day). iOS push defaults to ntfy (free, private topic in the ntfy app);
Pushover is an optional second channel, not required.

## Checkout + shipping (disabled until needed)

Stripe Payment Links and Shippo are implemented behind `ENABLE_STRIPE` /
`ENABLE_SHIPPO` flags (501 + instructions until switched on). Day to day she
ships via Chit Chats / Pirate Ship links in `/admin` — cheapest from Calgary.

## Social

The share kit (generated caption + native iOS share sheet) needs no Meta
setup. Automatic posting needs a business/creator IG account + approved
Facebook app, so it stays behind `ENABLE_SOCIAL_POST` (Ayrshare) until she
wants it.

## Images

Browser Canvas (crop/rotate/downscale) + sharp at build time. No Rust/WASM,
no ffmpeg — there is no video in this pipeline.

## Toolchain (Sep 2026)

Astro 7 + React 19 + Zod v4 via `astro/zod` (the old `astro:content` `z`
re-export is deprecated). TypeScript stays on 5.9: the TS 7 native port
doesn't ship the programmatic API `astro check` needs yet — revisit when
the Astro language server supports it.

## Analytics & privacy law

Canada has no EU-style cookie-banner law. PIPEDA + Alberta PIPA require
meaningful consent for *personal information* — cookieless aggregate stats
(Cloudflare Web Analytics) and anonymous per-painting counters collect none,
so no banner. A short `/privacy` page discloses the rest (inquiry emails)
and names a contact, which is what the commissioners actually look for.
