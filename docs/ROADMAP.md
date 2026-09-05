# Roadmap — future ideas, roughly ranked by payoff

## Launch (do first)

- [ ] Provision D1 (`art-gallery-db`) + R2 (`art-gallery-images`), apply `migrations/0001_init.sql`
- [ ] Set secrets: `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_TO`, `ADMIN_API_TOKEN`, `NTFY_TOPIC`
- [ ] Put Cloudflare Access (email OTP) on `/admin/*`
- [ ] Migrate the 5 legacy paintings (`pnpm db:seed`, re-upload photos via `/admin`)
- [ ] Custom domain later (free on Cloudflare); set `PUBLIC_CF_BEACON_TOKEN` at build time (Web Analytics can wait for this — per-painting views already work)
- [ ] Turnstile deferred: Security > Turnstile > Add site (managed), then `TURNSTILE_SITE_KEY` var + `TURNSTILE_SECRET_KEY` secret — honeypot covers the form until then

## Sell more

- [ ] Enable Stripe checkout (`ENABLE_STRIPE` + key) — Apple Pay / Google Pay come free with it, which covers Android buyers too
- [ ] Enable Shippo (`ENABLE_SHIPPO` + token) when label volume justifies it; until then Chit Chats / Pirate Ship links in `/admin`
- [ ] QR price tags for in-person markets (print stylesheet from the collection list)
- [ ] Sold archive + testimonials page (social proof)

## Wow (impress visitors)

- [x] **AR "view on your wall"**: photo → true-scale framed GLB (Android)
  + USDZ (iOS, wall-anchored) generated on her phone at upload time via
  three.js; buyers launch it from the painting page with `<model-viewer>`.
- [ ] True headset VR: skip — buyer audience doesn't own headsets.

## Growth

- [ ] One-click auto-posting (`ENABLE_SOCIAL_POST` + Ayrshare) if manual sharing gets tedious
- [ ] Email list for collectors (free tier: Buttondown / Resend broadcast) + "new painting" alerts
- [ ] Sitemap + richer JSON-LD for Google image search

## Tech hygiene

- [ ] Revisit TypeScript 7 once `astro check` supports it
- [ ] D1/R2 backup routine (Cloudflare PitR / versioning)
- [ ] Rotate `ADMIN_API_TOKEN` yearly
