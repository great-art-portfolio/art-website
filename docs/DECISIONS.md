# Decisions

## Paintings live in git, not a database

One artist, a few uploads a month, sub-second builds. Saving in `/admin`
commits a `.md` + photo (+ AR models) straight to the repo through a
GitHub App (Oct 2026; it replaced a personal token that expired), and
Pages rebuilds on push — live in a few
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

## No database in production

Browser push and the Ping page were removed (Oct 2026, owner: email only),
so the site keeps no personal information of its own: the email list is a
Resend segment, and D1 only backs the local mock list in dev (its old push
tables are unused). Views moved to Cloudflare Web
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
defense-in-depth for API calls. The GitHub App key is a Pages secret —
her phone only ever talks to our own admin endpoint. Because the Access
cookie rides along on requests other sites start, cookie-authorized
changes must come from the site's own pages (Oct 2026).

## Email

Mail goes through Resend: one-to-one mail is transactional, broadcasts go
to the `BarbartSubs` segment (`RESEND_SEGMENT_ID`) via the Broadcasts API.
The segment is the list — nothing list-related lives in D1, and the pending
proof travels in the links as HMAC tokens. She manages the list on the
studio's Email page (paged, addresses blurred until tapped). Inquiry
alerts reach the artist by email, Pushover optional. The new-painting
email shows the painting and is held (Resend `scheduled_at`) until its page
is live. Visitor emails come in the language they read the site in. Her
address on the outside is `artist@barbart.ca` (Cloudflare Email Routing to
her Gmail), so her personal address stays private.

## Languages

English plus the languages she ticks (Oct 2026: twelve). Interface words
are hand-written per language in `src/i18n/`; her painting and banner
words are machine-translated by Muse when she saves and marked as
translated on the page. A painting whose English changed shows English
until it's re-translated, never a stale translation. The studio stays
English.

## Checkout + shipping (disabled until needed)

Stripe Checkout is back without a database: the page POSTs slug, title,
and price, and `/api/checkout` checks them against `/catalog.json`, which
the build writes from the paintings collection, so the browser never sets
the price. A paid session's webhook commits `sold: true` like a studio
save. Hosted Checkout, not Payment Links or Elements: one session per
buyer, card data never on the site, Apple/Google Pay included. Stripe Tax
is on (owner, 2026-10-07), tax added on top of the listed price. Decided 2026-10-07: card
checkout (Apple/Google Pay included) charges at purchase — card holds
expire in ~5-7 days, too short to wait on shipping — and a paid order
marks the painting sold. Interac e-transfer stays as the no-fee option
for people she knows: no 2.9% + $0.30 cut, no chargebacks. Shippo
labels and Ayrshare auto-post stay implemented behind `ENABLE_SHIPPO` /
`ENABLE_SOCIAL_POST` (501 + instructions until switched on). Day to day
she ships via Chit Chats / Pirate Ship links in `/admin` — cheapest
from Calgary.

GST (owner, 2026-10-21): she isn't registered and is far below the
$30,000-a-year small-supplier line, so live checkout goes in with
`STRIPE_TAX` off and no registration: buyers pay the listed price. The
studio guide tells her to say so if sales get close.

## Social

Manual sharing lives in the painting room ("Tell social media"): the
words come prefilled from the fields and stay editable, then Share hands
the photo + words to the phone's share sheet — Save photo / Copy words
cover browsers without one. No accounts anywhere on this path. A buyer share glyph (the phone's
sheet with the page link, else a copy tick) is built but parked behind
`SHOW_PAGE_SHARE` — top-row and meta-line placements both floated too
far from anything; her caption words never leave the studio either way.
Automatic posting needs a business / creator IG account + approved
Facebook app, so it stays behind `ENABLE_SOCIAL_POST` (Ayrshare) until
she wants it.

## Toolchain (Sep 2026)

Astro 7 + Zod v4 via `astro/zod` (the old `astro:content` `z`
re-export is deprecated). No frontend framework: static markup + small
client scripts, shared logic in `src/lib/`. TypeScript 6.

## Analytics & privacy law

Canada has no EU-style cookie-banner law. PIPEDA + Alberta PIPA require
meaningful consent for _personal information_ — the email list is
double opt-in (the confirm link) and every email carries an unsubscribe
link, which is what the commissioners actually look for. Everything
else (aggregate stats, emailed inquiries) collects or keeps nothing, so
no banner. The short `/privacy` page discloses the rest.
