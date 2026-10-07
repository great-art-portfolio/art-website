# Roadmap — future ideas, roughly ranked by payoff

## Launch (do first)

- [ ] Provision D1 (`art-gallery-db`), apply `0001_init.sql` + `0002_drop-unused-tables.sql` (push table only)
- [ ] Set secrets: `RESEND_API_KEY`, `ARTIST_SENDER` (verified domain), `ARTIST_INBOX`, `ADMIN_API_TOKEN`, `GITHUB_TOKEN` + `GITHUB_REPO`
- [ ] Put Cloudflare Access (email OTP) on `/admin/*`
- [x] Painting measurements confirmed with the artist (Oct 2026)
- [ ] Custom domain + verify it in Resend (free on Cloudflare); set `PUBLIC_CF_BEACON_TOKEN` at build time
- [ ] Turnstile: site key in `wrangler.toml`, `TURNSTILE_SECRET_KEY` secret set (Oct 2026). Confirmed live 2026-10-06: `/api/status` serves the site key and the check renders above "Send inquiry" on painting pages (phone and desktop). Still to do: one real test inquiry reaching her inbox (owner, since it emails her)

## Sell more

- [ ] Card checkout via Stripe (`ENABLE_STRIPE` + key) — Apple Pay / Google Pay come free with it, which covers Android buyers too. No monthly fee, only a cut per sale. Decided 2026-10-07 (cz decision `aea8f654`): Stripe card checkout incl. Apple/Google Pay, charged at purchase, with e-transfer kept as the no-fee option. Waiting on a Stripe account in the artist's name (bank + ID); no code ships until its test key is in `.dev.vars` (`STRIPE_SECRET_KEY=sk_test_…`) and checkout passes in test mode.
  - Fees (Canada, checked Oct 2026): 2.9% + $0.30 per domestic card, Apple/Google Pay the same; +0.8% international cards, +2% if currency converts; $15 per dispute (chargeback) plus $15 to contest, refunded if won. A $150 painting nets about $145.35.
  - Stripe is not escrow: money settles to her bank on a schedule (first payout ~7 days, then ~3 business days), whether or not she has shipped. The buyer's protection is the chargeback. A manual-capture hold only lasts ~7 days (Visa ~5), too short to wait on shipping, so charge at checkout and ship promptly with tracking.
  - Keep Interac e-transfer as the no-fee option for people she knows: free, money is final once deposited (no chargebacks), but no buyer protection and fully manual.
  - The old checkout was removed with the D1 gallery (it looked paintings up by id). Re-adding it means a title + price POST from the painting page, with the price checked against the built content, not trusted from the browser (see DECISIONS → Checkout).
  - A paid order should mark the painting `sold: true` (a commit like any studio save) so it can't sell twice.
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
