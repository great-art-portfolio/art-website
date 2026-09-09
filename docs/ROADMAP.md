# Roadmap — future ideas, roughly ranked by payoff

## Launch (do first)

- [ ] Provision D1 (`art-gallery-db`), apply `0001_init.sql` + `0002_drop-unused-tables.sql` (push table only)
- [ ] Set secrets: `RESEND_API_KEY`, `ARTIST_SENDER` (verified domain), `ARTIST_INBOX`, `ADMIN_API_TOKEN`, `GITHUB_TOKEN` + `GITHUB_REPO`
- [ ] Put Cloudflare Access (email OTP) on `/admin/*`
- [ ] Verify the 5 painting measurements with a tape (frontmatter is flagged GUESSED)
- [ ] Custom domain + verify it in Resend (free on Cloudflare); set `PUBLIC_CF_BEACON_TOKEN` at build time
- [ ] Turnstile deferred: Security > Turnstile > Add site (managed), then `TURNSTILE_SITE_KEY` var + `TURNSTILE_SECRET_KEY` secret — honeypot covers the form until then

## Sell more

- [ ] Enable Stripe checkout (`ENABLE_STRIPE` + key) — Apple Pay / Google Pay come free with it, which covers Android buyers too
- [ ] Enable Shippo (`ENABLE_SHIPPO` + token) when label volume justifies it; until then Chit Chats / Pirate Ship links in `/admin`
- [ ] QR price tags for in-person markets (print stylesheet from the collection list)
- [ ] Sold archive + testimonials page (social proof)

## Wow (impress visitors)

- [x] **AR "view on your wall"**: photo → true-scale framed GLB (Android)
  - USDZ (iOS, wall-anchored) generated on her phone at upload time via
    three.js, committed to `public/models`; buyers launch it from the
    painting page with `<model-viewer>`.

## Growth

- [ ] One-click auto-posting (`ENABLE_SOCIAL_POST` + Ayrshare) if manual sharing gets tedious
- [ ] Email list for collectors (free tier: Buttondown / Resend broadcast) + "new painting" alerts
- [ ] Sitemap + richer JSON-LD for Google image search

## Tech hygiene

- [ ] Revisit TypeScript 7 once `astro check` supports it
- [ ] Rotate `ADMIN_API_TOKEN` + `GITHUB_TOKEN` yearly (least-privilege: Contents read+write on this repo only)
- [ ] Delete the `art-gallery-images` R2 bucket in the dashboard (unbound, unused)
