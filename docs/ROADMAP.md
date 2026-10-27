# Roadmap — future ideas, roughly ranked by payoff

## Launched (Oct 2026)

- [x] barbart.ca on Pages, verified in Resend, Web Analytics on
- [x] Cloudflare Access on `/admin*`; GitHub App publishing; Turnstile live; inquiries reach her inbox
- [x] Twelve more languages, the painting email, Credits, security hardening (see DECISIONS and README "Security")

## Waiting on someone

- [x] Email forwarding (2026-10-26): `artist@barbart.ca` and `hello@barbart.ca` forward to her Gmail (Cloudflare Email Routing), and `ARTIST_INBOX` is `artist@barbart.ca`.
- [ ] Then, for Chris on her Gmail (web): Settings → Accounts → "Send mail as" → add `artist@barbart.ca` via SMTP `smtp.resend.com`, port 465, user `resend`, password a Resend key with sending access to barbart.ca; confirm the code that arrives; set "Reply from the same address the message was sent to".
- [ ] Card checkout: her Stripe sign-up (instructions sent), then the go-live steps below.

## Sell more

- [ ] Card checkout via Stripe: **built and passing in test mode (2026-10-07)**, off in production until live keys go in. Decided 2026-10-07 (cz decision `aea8f654`): card checkout incl. Apple/Google Pay, charged at purchase, e-transfer kept as the no-fee option. Owner added Stripe Tax (decision `dcf48aa0`).
  - How it works: the painting page's "Buy now · $140 CAD" POSTs `{ slug, title, priceCents }` to `/api/checkout`, which checks them against the built `/catalog.json` (and the live .md in git, for the minutes before a rebuild) and opens Stripe's hosted Checkout (CAD, ships to CA/US, phone collected, 30-minute link). `/api/stripe-webhook` verifies the signature, commits `sold: true` ("Sold online: <title>"), and emails her the buyer and shipping address. Success lands on `/thanks`. The buy box only shows when `/api/status` says `stripe: true`; e-transfer stays as a line under it.
  - Tested 2026-10-07 in the "Straka sandbox" test account: 4242 card paid $147.00 for "Night Reeds" ($140 + $7 GST), shipping address and painting metadata on the session. The webhook (sold commit + email) is covered by unit tests with stubbed GitHub/Resend; its live run with `stripe listen` still needs the CLI's webhook secret in `.dev.vars`.
  - Sandbox tax setup (test mode only): head office Calgary AB, one Canada GST registration so tax shows. Line items use `txcd_99999999` (general tangible goods), tax added on top (`exclusive`).
  - Go-live checklist (re-checked 2026-10-26; Barbara never handles keys):
    1. Barbara signs up at stripe.com (she is the owner), verifies her ID, SIN and bank (transit, institution, account number, in her name), sets the public business name, statement descriptor and support email, then in Settings → Team invites Chris as **Administrator** (Developer covers API keys; webhook creation isn't listed for it).
    2. Chris, in a sandbox: a restricted key with **Checkout Sessions: Write**, one test purchase, check the key's logs for 403s (inline `price_data` may also need Products/Prices write — the test settles it).
    3. Same key as `rk_live_`. Webhook at exactly `https://barbart.ca/api/stripe-webhook` (not behind Access) for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
    4. Cloudflare Pages, **Production only**: `ENABLE_STRIPE=true`, secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Previews get none, so a branch can't take money. Check `GITHUB_APP_ID`/`GITHUB_APP_KEY`/`GITHUB_REPO`, `RESEND_API_KEY`, `ARTIST_INBOX`, `ARTIST_SENDER`.
    5. In Stripe: customer receipt emails on, "successful payment" emails to Barbara on (a backup to the site's own sale email). Checkout asks for cards only (Apple/Google Pay included), so there are no pay-later methods to switch off.
    6. One small real purchase, then refund it (Stripe keeps its fee). Update "Getting paid" in `/admin/guide`.
  - Since 2026-10-26: a sale closes every other open checkout for the painting; a failed sale email answers 500 so Stripe retries and the retry resends it; an unreadable checkout event is retried, not dropped; the email says when the site couldn't mark it sold; checkout refuses a painting repriced, drafted or trashed since the last build. Open: no Stripe-Version pin (the webhook endpoint's version decides the payload shape; create it at the account default and keep it).
  - Fees (Canada, checked Oct 2026): 2.9% + $0.30 per domestic card, Apple/Google Pay the same; +0.8% international cards, +2% if currency converts; $15 per dispute (chargeback) plus $15 to contest, refunded if won. A $150 painting nets about $145.35. Stripe Tax adds 0.5% per transaction where she is registered to collect.
  - Stripe is not escrow: money settles to her bank on a schedule (first payout ~7 days, then ~3 business days), whether or not she has shipped. The buyer's protection is the chargeback. A manual-capture hold only lasts ~7 days (Visa ~5), too short to wait on shipping, so charge at checkout and ship promptly with tracking.
  - Keep Interac e-transfer as the no-fee option for people she knows: free, money is final once deposited (no chargebacks), but no buyer protection and fully manual.
- [ ] Enable Shippo (`ENABLE_SHIPPO` + token) when label volume justifies it; until then Chit Chats / Pirate Ship links in `/admin`
- [ ] Frames (2026-10-27): she printed mockups of one painting in floater frames painted Sherwin-Williams colours: Misty (SW 6232), In the Navy (SW 9178), Charcoal Blue (SW 2739), Web Gray (SW 7075), Gibraltar (SW 6257). Waiting on her: does a buyer choose the finish, which finishes, and the price per size (or framed price as one number)? Then the painting page gets finish swatches that recolour the frame around the photo, and the wall preview's frame follows the pick.
- [ ] Prints (2026-10-27): she is doing prints (owner confirmed), so the homepage's "Originals & prints" lines stay. Specifics still to come: who makes them (her or a print-on-demand shop), open or numbered editions, and whether they sit on the painting's page or in their own section. Prints need sizes with their own prices and never sell out, so new frontmatter, a size picker in the buy box, and checkout charging the chosen size. They'd join the `/paintings` filter as an "Originals / Prints" chip.
- [ ] QR price tags for in-person markets (print stylesheet from the collection list)
- [ ] "Recently sold" section + a few words from buyers (social proof for new visitors)
  - Sold paintings already carry `sold: true`; the gallery groups them. Needs a buyer-quote field she can fill in from the painting room, shown with permission only.

## Studio helpers

- [x] Writing helper in the painting room (2026-10-25): Muse Spark looks at the photo and suggests three titles, a description, and alt text. Go-live: set the `MUSE_API_KEY` Pages secret (Meta Model API key); the button stays hidden until then.
- [x] "Find a painting" search on the studio list past 12 paintings (2026-10-25).
- [x] Crop & adjust in the painting room (2026-10-27): four corner handles (auto-placed by "Find edges") straighten the photo and cut away the wall, plus brightness, warmth and contrast. Her measured width × height sets the crop's shape so the wall preview stays true to size. Works on the saved photo in the edit room too (`lib/photo-fix.ts`, `components/PhotoFix.ts`).

## When there are a lot of paintings

Tested 2026-10-25 with `pnpm seed:gallery 120`: the build stays fast (about 11 s locally with placeholders), but the homepage becomes very long (about 39,000 px on desktop, 55,000 px on a phone, 456 KB of HTML) because it shows every painting plus the whole sold archive. Plan, once she passes about 30 available paintings (a visual change, so show the owner options first):

- [ ] Homepage keeps the hero and her first 12 paintings, then "See all 87 paintings" to a `/paintings` page with the same stagger.
- [ ] `/paintings` gets plain filter chips (size: small / medium / large; price bands; shape: square / tall / wide) and a sort (her order, newest, price), all in the page with no server.
- [ ] The sold archive moves to `/sold`; the homepage shows the six most recent with a link.
- Limits that are far off: Pages allows 20,000 files per deploy (about 1,300 paintings at ~15 files each), and the repo grows about 1 MB per painting photo.

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
