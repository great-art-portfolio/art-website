# Decisions

## Paintings live in git, not a database

One artist, a few uploads a month, sub-second builds. Saving in `/admin`
commits a `.md` + photo (+ AR models) straight to the repo through a
Worker-held `GITHUB_TOKEN`, and Pages rebuilds on push — live in a few
minutes. (The repo is git-connected in the Pages dashboard; GitHub
Actions only runs checks, never deploys.)
No database for content, no R2, one URL scheme (`/paintings/<title-slug>`).

The database-backed gallery (D1 paintings + R2 photos + a second `/art`
page template) was removed Sep 2026: it duplicated every page, bypassed
`astro:image` responsive optimization for R2 URLs, and added moving parts
for upload volume that never needed them.

## Images

Git photos get the full build pipeline: browser Canvas prep on her phone
(crop/rotate/downscale) + sharp responsive srcsets at build time. No
Rust/WASM, no ffmpeg — there is no video in this pipeline.

## Inquiries: email, no inbox

Buyer notes POST to `/api/inquiries` and go straight to the artist via
Resend (free 100/day), reply-to set to the buyer — nothing is stored, so
there is no inbox UI and nothing to delete. Spam: honeypot first,
Cloudflare Turnstile when configured. Her address never appears on the
site; Resend sends from the gallery address (requires a verified sending
domain) to her private inbox.

## The one table: push subscriptions

"Notify me" collector alerts inherently store something, so D1 survives
with exactly one table: `push_subscriptions` (endpoint + keys, deleted
on unsubscribe). This is disclosed on `/privacy` — it is the only
personal information the site keeps. Views moved to Cloudflare Web
Analytics (free, hosted, per-page); statuses moved to markdown
(`sold: true`); the homepage banner is `src/content/announcement.txt`
in git, editable from `/admin` (commits like a painting). One banner at a
time, usually with an end date (1/3/7/14 days, default 7) — an optional
`expires:` first line, hidden automatically past that date (at build, plus
a tiny client-side check for expiry between deploys), so a forgotten
banner doesn't linger.

## Authentication

Single artist → Cloudflare Access (email OTP) on `/admin/*`. No passwords
to store, no OAuth app to maintain. `ADMIN_API_TOKEN` remains as
defense-in-depth for API calls. The GitHub token is a Worker secret —
her phone only ever talks to our own admin endpoint.

## Email + push

Workers can't run an SMTP server, so mail goes through Resend, split
across its two free tiers: one-to-one mail (inquiries, confirmations,
goodbyes) goes transactional (3,000/month, 100/day); new-painting
broadcasts go to a Resend segment via the Broadcasts API (free
marketing tier: 1,000 contacts, unlimited sends). Setup: create the
segment once in the Resend dashboard, set `RESEND_SEGMENT_ID`, and the
site mirrors the confirmed list into it (confirm adds, unsubscribe
deletes). D1 stays the source of truth — a failed sync only logs.
Without a segment configured, broadcasts fall back to one
transactional email each. Caveat: if a buyer unsubscribes through
Resend's own link instead of ours, D1 still shows them confirmed —
re-confirming re-adds them, so check the Resend dashboard when counts
look off. Collector push is Web Push (VAPID) fanned out from `/admin`;
the service worker shows a generic tickle and the gallery does the
talking. ntfy stays as the free phone ping for _inquiry_ alerts
(optional second channel alongside email), Pushover optional.

## Checkout + shipping (disabled until needed)

Stripe checkout was removed with the D1 gallery (it looked paintings up
by id); re-adding it means a title+price POST, no database. Shippo
labels and Ayrshare auto-post stay implemented behind `ENABLE_SHIPPO` /
`ENABLE_SOCIAL_POST` (501 + instructions until switched on). Day to day
she ships via Chit Chats / Pirate Ship links in `/admin` — cheapest
from Calgary.

## Social

The share kit is gone (the "Tell social media" card was removed in favour
of publish-time subscriber alerts). Automatic posting needs a business /
creator IG account + approved Facebook app, so it stays behind
`ENABLE_SOCIAL_POST` (Ayrshare) until she wants it.

## Toolchain (Sep 2026)

Astro 7 + React 19 + Zod v4 via `astro/zod` (the old `astro:content` `z`
re-export is deprecated). TypeScript stays on 5.9: the TS 7 native port
doesn't ship the programmatic API `astro check` needs yet — revisit when
the Astro language server supports it.

## Analytics & privacy law

Canada has no EU-style cookie-banner law. PIPEDA + Alberta PIPA require
meaningful consent for _personal information_ — push subscriptions are
opt-in by tapping the button (consent) and deletable with the same
button, which is what the commissioners actually look for. Everything
else (aggregate stats, emailed inquiries) collects or keeps nothing, so
no banner. The short `/privacy` page discloses the rest.
