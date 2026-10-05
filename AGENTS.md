# art-website — agent handbook

Barbara Straka's gallery + studio. Astro 7, Cloudflare Pages + Functions,
content collections for paintings. One artist, a few uploads a month.

## The loops

Fast loop (every change): `format:check` → `lint` → `astro check` →
`typecheck` → `test:unit` → `build` → `check:inline` (it scans `dist/`,
so the build comes first), then the touched spec file(s)
(`pnpm test:e2e tests/<name>.spec.ts` — the Playwright config boots the
Pages runtime on :4331 itself, so no manual server is needed). Full
`test:e2e` runs pre-commit. Gate order is also the CI order:
`format:check → lint → astro check → typecheck → test:unit → build →
check:inline → e2e`.

`format` before committing; `format:check` and `lint` must be clean.
Never commit with a red gate to "fix later".

## Port 4331 serves dist, not src

`pnpm dev:prod` is `astro build` + `wrangler pages dev dist`. The browser
always shows the last build — rebuild after every change or you will
chase stale CSS. (`dev:astro` is live src; `dev` is the studio loop below;
tests and review use 4331.)

## Studio dev loop (writable content without prod)

`pnpm dev:studio` runs astro dev on :4332 plus a localhost content API
on :4333 (`scripts/studio-dev-server.mjs`), which the dev-only Vite
proxy answers `/api/*` from. Same contract as the Pages Functions, but
backed by the working tree: banner, painting, photo, and model writes
land as uncommitted files. Push subscribe + Ping run a dev-only loop
instead (own VAPID key, in-memory subscribers, real push service — no
cooldown, no email). The email list runs the REAL collectors handler with
a file-backed mock table: the loop completes locally, and `*@resend.dev`
addresses additionally ride the true API when `.dev.vars` holds a key.
Never test publish flows in prod.
`pnpm studio:reset` restores gallery paths (`src/content`,
`public/models`) and deletes new studio outputs — nothing else is
touched. The sidecar never ships; the static build and 4331 are
unaffected, and with it stopped the client falls back to practice mode.

## Page scripts: plain JS discipline

Inline `<script>` blocks are plain JavaScript, no TypeScript, no
`define:vars` (it emits raw — dynamic `import()` becomes a 404ing
relative URL). Page data flows through `#main data-*` attributes; Vite
bundles the block and `import("../lib/x")` resolves.

- View Transitions keep modules alive across navigations: the script runs
  once per document. Read `dataset` live on every use — eval-time consts
  go stale and the next page inherits the previous one's data. Wire-up
  functions run immediately AND on `astro:page-load`, guarded so a
  double-fire on the same DOM wires nothing twice.
- `check:inline` parses these blocks — keep them parseable.

## TypeScript strictness: do not relax it

`astro/tsconfigs/strictest` plus `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`. You will hit three errors; the fixes are:

1. Optional props assignability — add `| undefined` to the receiving
   type, don't make the prop required.
2. Nullable DOM lookups — `getElementById` returns `T | null`; narrow
   before use. The `$()` helper in the islands throws on missing ids.
3. Bare `HTMLElement` has no `.alt` / `.reset` / `.focus` / `.value` —
   narrow with `instanceof` (`el instanceof HTMLInputElement ? el : null`),
   never a cast. JSDoc annotations do NOT survive `astro check` (comments
   are stripped when scripts are extracted) — structure the code so it
   typechecks annotation-free. Window-level browser globals live once in
   `src/client-globals.d.ts`.
4. `dataset["data-local-edit"]` is `undefined` — hyphenated data attrs
   read camelCase (`dataset.localEdit`).

Never let a lib module import something node can't load (move
API-dependent helpers to `lib/api.ts`).

## Where logic lives

- Shared logic in `src/lib/`, never duplicated between islands. There is
  exactly one editor (the studio rooms) and one painting presentation
  (`PaintingDetail.astro`, modes buy/edit/draft) — no parallel editors.
- No React, no islands framework: Astro static markup + small client
  scripts. Don't add one.
- Paintings are git content (`src/content/paintings/*.md`). `draft: true`
  hides a painting from gallery, buyer pages, and static paths until
  published. Saving commits .md + photo (+ AR models); Pages rebuilds —
  live in a few minutes.
- `/admin/*` is behind Cloudflare Access (email OTP) in production;
  `ADMIN_API_TOKEN` is local backup, remembered per browser.
- Dev practice: on localhost without a token, studio saves go to a
  localStorage overlay the dashboard merges — never git. A stored token
  means the commit, even on localhost. Live hosts never practice.
  Exception: under `pnpm dev:studio` the local content API is the backend,
  so saves write real working-tree files (still uncommitted) — no overlay,
  no token needed.
- Email testing: localhost + `COLLECTORS_MOCK` keeps the join/confirm/leave
  loop local (confirm link rides home in the response). With a real
  `RESEND_API_KEY` in `.dev.vars`, subscribing a `*@resend.dev` test address
  additionally sends the true confirm — check Resend's dashboard, then finish
  the loop with the local link. Nothing else may leave a dev machine, and
  never test with `@example.com` (Resend 422s it outright). Docs:
  [test emails](https://resend.com/docs/dashboard/emails/send-test-emails),
  [safe test
  addresses](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing),
  [E2E with
  Playwright](https://resend.com/docs/knowledge-base/end-to-end-testing-with-playwright).

## Taste (non-negotiable)

The owner's taste is final. For any change in visual direction, show 2–4
options with screenshots (phone, iPad, desktop, dark and light) on the real
build and let them pick.

- Mom never handles tokens, secrets, or CLIs. Plain words everywhere.
- Warm and rich, not minimal. The owner tried a stripped-down "gallery
  wall" (no header bar, flat wall, stacked wall-label captions, one featured
  painting) and found it boring and empty. Keep what they chose instead:
  the translucent sticky header with blur, the warm drifting background
  wash, orange accent labels and prices, the full hero (orange label,
  headline, lede, two buttons, the three-point strip), and the staggered
  12-column grid of matted cards.
- Don't repeat the artist's name: the wordmark already says it, so the
  hero headline stays generic.
- Real sizes inside the stagger. Paintings keep their shape. A painting at
  least twice her typical area, or a wide one, takes the 8-column slot (the
  full row when it's both), and dense flow fills in beside it
  (`lib/gallery-layout.ts`).
- Captions stay on two lines: the title, then the orange price and the
  size together. Prices read "$140 CAD" (no ".00") wherever a buyer sees
  one.
- Type: Fraunces (`var(--serif)`, self-hosted, SIL OFL) for painting
  titles, prices, and section headings; system sans for the hero headline
  and body; script only for the wordmark. Never hard-code a serif stack.
- Motion is expected, not optional. Every interaction gets a considered
  response: hovers, folds, toasts, and reveals ease in, mostly through
  opacity and color. Signature moments: the background drifts slowly, and
  a tapped painting grows into its own page (a shared `transition:name`)
  and shrinks back. New motion should feel like something that happens in
  a gallery, not decoration.
- Reduced motion kills movement, never fades: slides, lifts, expands, the
  drift, and the painting morph go instant; color and opacity transitions
  still run.
- Three screens, always: every visual change is looked at on iPhone
  (~390px), iPad (~820px), and desktop (~1280px) widths, in dark and light,
  in a real browser.
- One focus ring only (accent outline, never outline + border change).
- Prose measures 50–70 characters a line: admin text sections
  (`.admin section.prose`, 40rem) stay narrow while the collection grid
  keeps the full width its cards need. Same rule for buyer prose.
- Whitespace separates, never divider lines in the studio: no hairlines
  under admin headings or fold counts, no boxes around sections.
- Painting descriptions and the "Interested?" button are primary: full-ink
  text and a solid button in both themes. Muted grey is for secondary
  asides only.
- Script-built nodes never carry Astro's scope attribute — style them
  with whole-selector `:global()` twins, and re-assert `[hidden]` whenever
  author `display` beats the UA rule. Pseudo-element-only selectors such
  as `::view-transition-*` need `:global()` too, or scoping breaks them.

## Crash recovery

Port 4331, commit along the way, verify in a real browser before claiming
done: the repo's own suites (`test:unit`, then the touched spec files,
then full `test:e2e`) plus a look at the page.
Fresh checkout (or wiped `.wrangler/`): run `pnpm db:migrate:local`
once — local D1 state is gitignored, and without its tables the
collector e2e tests fail with `no such table`.
