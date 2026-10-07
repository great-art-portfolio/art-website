# Roadmap — future ideas, roughly ranked by payoff

## Launch (do first)

- [ ] Provision D1 (`art-gallery-db`), apply `0001_init.sql` + `0002_drop-unused-tables.sql` (push table only)
- [ ] Set secrets: `RESEND_API_KEY`, `ARTIST_SENDER` (verified domain), `ARTIST_INBOX`, `ADMIN_API_TOKEN`, `GITHUB_TOKEN` + `GITHUB_REPO`
- [ ] Put Cloudflare Access (email OTP) on `/admin/*`
- [x] Painting measurements confirmed with the artist (Oct 2026)
- [ ] Custom domain + verify it in Resend (free on Cloudflare); set `PUBLIC_CF_BEACON_TOKEN` at build time
- [ ] Turnstile: site key in `wrangler.toml`, `TURNSTILE_SECRET_KEY` secret set (Oct 2026). Confirmed live 2026-10-06: `/api/status` serves the site key and the check renders above "Send inquiry" on painting pages (phone and desktop). Still to do: one real test inquiry reaching her inbox (owner, since it emails her)

## Sell more

- [ ] Card checkout via Stripe: **built and passing in test mode (2026-10-07)**, off in production until live keys go in. Decided 2026-10-07 (cz decision `aea8f654`): card checkout incl. Apple/Google Pay, charged at purchase, e-transfer kept as the no-fee option. Owner added Stripe Tax (decision `dcf48aa0`).
  - How it works: the painting page's "Buy now · $140 CAD" POSTs `{ slug, title, priceCents }` to `/api/checkout`, which checks them against the built `/catalog.json` (and the live .md in git, for the minutes before a rebuild) and opens Stripe's hosted Checkout (CAD, ships to CA/US, phone collected, 30-minute link). `/api/stripe-webhook` verifies the signature, commits `sold: true` ("Sold online: <title>"), and emails her the buyer and shipping address. Success lands on `/thanks`. The buy box only shows when `/api/status` says `stripe: true`; e-transfer stays as a line under it.
  - Tested 2026-10-07 in the "Straka sandbox" test account: 4242 card paid $147.00 for "Night Reeds" ($140 + $7 GST), shipping address and painting metadata on the session. The webhook (sold commit + email) is covered by unit tests with stubbed GitHub/Resend; its live run with `stripe listen` still needs the CLI's webhook secret in `.dev.vars`.
  - Sandbox tax setup (test mode only): head office Calgary AB, one Canada GST registration so tax shows. Line items use `txcd_99999999` (general tangible goods), tax added on top (`exclusive`).
  - Go-live checklist (owner): Barbara's bank + ID on the Stripe account; decide whether she's GST-registered (under $30k/yr sales she needn't be; then add no registration and Stripe Tax collects nothing) and set the live head office; in Cloudflare Pages set `ENABLE_STRIPE=true`, `STRIPE_TAX=true`, secrets `STRIPE_SECRET_KEY` (live) and `STRIPE_WEBHOOK_SECRET`; add a webhook endpoint `https://barbart.ca/api/stripe-webhook` for `checkout.session.completed` + `checkout.session.async_payment_succeeded`; check `GITHUB_TOKEN`/`RESEND_API_KEY`/`ARTIST_INBOX` are set (sold commit + sale email); turn off Klarna/Affirm in the dashboard if unwanted (they show by default); update the "Getting paid" paragraph in `/admin/guide`.
  - Fees (Canada, checked Oct 2026): 2.9% + $0.30 per domestic card, Apple/Google Pay the same; +0.8% international cards, +2% if currency converts; $15 per dispute (chargeback) plus $15 to contest, refunded if won. A $150 painting nets about $145.35. Stripe Tax adds 0.5% per transaction where she is registered to collect.
  - Stripe is not escrow: money settles to her bank on a schedule (first payout ~7 days, then ~3 business days), whether or not she has shipped. The buyer's protection is the chargeback. A manual-capture hold only lasts ~7 days (Visa ~5), too short to wait on shipping, so charge at checkout and ship promptly with tracking.
  - Keep Interac e-transfer as the no-fee option for people she knows: free, money is final once deposited (no chargebacks), but no buyer protection and fully manual.
- [ ] Enable Shippo (`ENABLE_SHIPPO` + token) when label volume justifies it; until then Chit Chats / Pirate Ship links in `/admin`
- [ ] QR price tags for in-person markets (print stylesheet from the collection list)
- [ ] "Recently sold" section + a few words from buyers (social proof for new visitors)
  - Sold paintings already carry `sold: true`; the gallery groups them. Needs a buyer-quote field she can fill in from the painting room, shown with permission only.

## Wow (impress visitors)

- [x] **AR "view on your wall"**: photo → true-scale framed GLB (Android)
  - USDZ (iOS, wall-anchored) generated on her phone at upload time via
    three.js, committed to `public/models`; buyers launch it from the
    painting page with `<model-viewer>`.

## Growth

- [ ] One-click auto-posting (`ENABLE_SOCIAL_POST` + Ayrshare) if manual sharing gets tedious
- [ ] Email list for collectors (free tier: Buttondown / Resend broadcast) + "new painting" alerts
- [ ] Alerts for scheduled paintings: the nightly `Publish scheduled paintings` workflow (and the studio's own on-load check) publish due drafts silently — the room's "On publish, also tell" boxes only fire on a manual publish. Remember those choices in the frontmatter at scheduling time and send them when the painting goes live. The workflow has no admin token, so it would need its own way to call `/api/notify` (e.g. a repo secret).
- [ ] Sitemap + richer JSON-LD for Google image search

## Tech hygiene

- [ ] Revisit TypeScript 7 once `astro check` supports it
- [ ] Rotate `ADMIN_API_TOKEN` + `GITHUB_TOKEN` yearly (least-privilege: Contents read+write on this repo only)
- [ ] Delete the `art-gallery-images` R2 bucket in the dashboard (unbound, unused)
