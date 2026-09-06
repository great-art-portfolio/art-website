## Goal

Answer every open item from the 2026-09-06 review in one pass: make the public
gallery copy honest on desktop, settle the "New" badge lifetime, fix the
section-head wrapping and hero buttons (with a taste pass), make /admin truthful
in dev (no more "…" placeholders or wrong hints), remove the pointless blurbs,
add an admin gallery route plus sign-out, and verify the code comments that were
questioned. This file is crash recovery: a new session can pick up from here
with zero prior context.

## Success Criteria

- A desktop visitor reading the AR section gets copy that makes sense without a
  phone in hand; mobile copy unchanged in meaning.
- The "New" badge disappears on its own after the agreed lifetime.
- "Available works" / eyebrow never wrap awkwardly at 390px; hero buttons pass
  a taste review.
- On a dev server with no API, every admin section says what is actually wrong
  ("needs the live /admin") — no "…" dots, no README-setup hint for a dev
  problem, no wrong blurb.
- Mom can go Studio → gallery → painting → edit/delete and back, and can
  leave admin; every step is linked, no URLs to remember.
- The JPEG/PNG size comment states only what was measured.
- Full suite green on port 4331; screenshots at 390px and desktop attached to
  the final report.

## Context And Current Facts

- Public gallery is `src/components/Gallery.astro` (cards link to
  `/paintings/<slug>`); detail page `src/pages/paintings/[id].astro` carries the
  AR copy "Try it on your wall / True size — point your phone at the wall where
  it would hang." (`#ar-mount`).
- "New" badge: `NEW_MS = 21 * 24 * 60 * 60 * 1000` (`Gallery.astro:28`).
- Hero buttons share one size class (`.btn-primary, .btn-ghost`,
  `src/pages/index.astro:145-164`); section-head is eyebrow + h2 + count
  (`Gallery.astro:143-153`).
- AR models (`src/lib/ar.ts`): texture capped at 1024px (`MAX_TEX_SIDE`),
  `texture.userData.mimeType = "image/jpeg"`. U1 measured a committed GLB:
  267KB JPEG of 271KB total at 1012×1024; same pixels as PNG = 1.9MB
  (~7×) — the old "~4×" comment was wrong in magnitude, fixed in b848c18.
- Admin is `src/pages/admin.astro` + `src/components/AdminPanel.ts`. Exact
  strings confirmed: status blurb "Add a painting below — saving publishes it
  to the site." (`admin.astro:9-11`); collection hint "Open the gallery …"
  (`admin.astro:93`); banner "Shows until" (`admin.astro:103`); announcement
  placeholder "Find me at the Lilac Festival this Sunday!" (`admin.astro:101`).
- Most admin complaints are **dev-mode artifacts, not bugs**. The screenshots
  show `localhost:4321` = `pnpm dev` (`astro dev`, whose default port is 4321),
  which serves no Functions runtime: `src/lib/api.ts:14-18` documents that API
  routes answer HTML 404 there. Concretely: `paintingViews()` catches the
  failure and returns `{unconfigured: true}` (`api.ts:142-144`), so dev shows
  the README-setup hint instead of a dev message; `refreshFlags()` throws away
  the `api.status()` failure (`AdminPanel.ts:369-371`), leaving the "…"
  placeholders forever. The local-only Views message exists but is unreachable
  through this path.
- Auth: Cloudflare Access gates `/admin/*` in production; `ADMIN_API_TOKEN`
  (sessionStorage today) is the backup (`functions/_lib/http.ts:23-28`).
  `/login` forwards to `/admin`; Access does email-OTP sign-in. There is no
  sign-out anywhere today.
- Dashboard fact RESOLVED (via README secrets list): `ADMIN_API_TOKEN` **is**
  set in production, so `requireAdmin` enforces the Bearer live — the local
  token genuinely unlocks publishing, not just the toolbar. Consequence: the
  unlock-flag idea is dead (a toolbar without the token would fail every
  save); instead the token goes sticky per-browser (`localStorage`) so mom
  types it once, and "Leave admin" clears it.
- `pnpm dev` is the full-stack command: `predev` runs `astro build`, then
  `wrangler pages dev dist` serves on **4331** with the Functions API live.
  `pnpm dev:astro` is the markup-only fast path (no API — admin/views
  publish paths 404 there, by design). E2e is pinned to the same 4331
  (`playwright.config.ts`); 4321 belongs to another project on this machine.
- Hero "Direct" row (Q1, resolved 2026-09-06): on mobile the `.hero-meta`
  definition list runs "Direct from the studio, no gallery markup" inline
  while longer terms wrap into a ragged two-column look — inconsistent.
  Fix in U2: a real two-column grid (term column + description column) at
  narrow widths.
- Committed: ab53b65, 4cbc7cc, 6d97446, fe9bb85, baa70d6, 966f57e
  (planning round), b848c18 (U1). Uncommitted: hover-prefetch
  (`Gallery.astro`, `tests/gallery.spec.ts`) and README (user's edit).
  Deleted as agreed: `foo.md`, `.agents/plans/2026-09-06-admin-studio.md`.
- Architecture (do not "fix" this): each painting has ONE public URL
  (`/paintings/<slug>`) for buyers and mom alike — there are no
  `/admin/paintings/*` routes and none are planned. Admin mode is a toolbar
  overlay on the public page, shown iff this browser holds the token
  (`localStorage` after U5; `sessionStorage` today); visitors never have one.
  API writes are gated by Access + the env Bearer. So "only mom can edit" =
  toolbar hidden + API gated, never a secret URL.
- CI (`.github/workflows/ci.yml`) runs `astro check` + `build` + full e2e,
  but NOT `typecheck` (tsc), `test:unit`, or `check:inline` — all three exist
  and pass locally. U9 adds them.

## Constraints And Non-goals

- No new secrets or auth machinery: Access + token gate stays; sign-out only
  clears the local token and navigates (ending the Access session itself is a
  Cloudflare-side step — verify at build time, see Risks).
- Non-goals: crop/straighten/exposure sliders; inbox features; vendored `/js`
  or AR pipeline changes (copy only); public gallery visual redesign beyond
  the listed items; touching the other project's ports/processes.

## Key Decisions

- **Dev-honesty over dev-parity**: do not make analytics/flags work in dev;
  make every section name the real situation ("needs the live /admin").
  Rejected: proxying Cloudflare GraphQL locally — secrets must never run
  under a dev server.
- **Unreachable vs unconfigured are different states**: preflight with
  `api.status()`; unreachable API → dev message, reachable-but-unconfigured
  → README hint. Rejected: keeping the single `unconfigured` boolean — it is
  the exact conflation behind the "Most viewed" screenshot.
- **`/admin/gallery` links, it doesn't edit**: the new route reuses gallery
  card markup; tapping a card lands on the painting page where the existing
  token-gated toolbar already edits/deletes. Rejected: inline Edit/Delete on
  cards — same fat-finger risk already rejected once.
- **AR copy without device detection**: one sentence true on both ("…on your
  phone, point it at the wall…"). Rejected: `matchMedia` branching — more
  code for a copy problem.
- **"New" = 7 days** (agreed 2026-09-06): one-line `NEW_MS` change.
- **"Shows until" → "Show until"**; status-blurb default text deleted (the
  `#admin-status` element stays for live messages); collection hint replaced
  by the `/admin/gallery` link.
- **Notify collectors stays with honest copy** (recommended): it pushes
  subscribed collectors, a different channel from the inbox email. Removal is
  one line if Q4 goes the other way.
- **Taste pass is a work unit, not a question**: load `bundled:taste` before
  touching hero buttons / section-head, attach before/after screenshots.
- **"Leave admin", not "Sign out"** (Q2, resolved + renamed 2026-09-06):
  there is no sign-in screen of ours — returning to `/admin` just works
  (Access asks for an email code only when its own session expired), so
  "Sign out" promises what it can't deliver. The button clears
  `ADMIN_API_TOKEN` from this browser (hides every painting-page edit
  toolbar on this browser) and lands on `/`. "The local token" is set via
  the Settings field; it reveals the toolbar and rides along as the API
  Bearer. Case A confirmed (secret is set in production): without the token saves
  401, so after leaving, `/admin` still opens (Access) but publishing waits
  on re-entering the token — the subline says exactly that.
  Rejected: linking an Access logout endpoint — unverified, and a wrong guess
  strands mom on a Cloudflare page. Clearing our own token is fully safe and
  reversible (retype it in Settings); the "90%" caveat was only ever about
  leaving the Access session itself alone.
- **`/admin/gallery` confirmed as linking cards** (Q3, resolved 2026-09-06):
  separate admin pages, public pages untouched — exactly the Key Decision
  above.
- **Notify collectors stays, explained** (Q4, resolved 2026-09-06): the
  share-panel button pushes a browser notification to visitors who tapped
  "Notify me" (via `/api/notify`) — a different channel from the inbox email
  mom gets from inquiries. Copy must say that in her words.
- **Settings tucks away; token goes sticky** (2026-09-06): the Settings
  block collapses into a `<details>` ("Advanced") mom never opens day to
  day. The token field stays as the Access-off/dev path, but on her phone
  she types it once: storage moves `sessionStorage` → `localStorage`
  ("remember this browser"), so toolbars + publishing survive restarts.
  "Leave admin" clears it. No security change: same secret, same gates,
  same XSS exposure class; Access + `requireAdmin` still decide every write.

## Recommended Approach

Audit the one measured claim first (cheap, falsifiable), then public items,
then admin truthfulness, then the new route + sign-out, then full validation.
Each unit below is independently committable in order.

## Work Plan

- **U1. Comment audit** — DONE (b848c18): parsed a committed `.glb`
  (JPEG, 267KB of 271KB at 1012×1024; PNG equivalent 1.9MB, ~7×); comment
  reworded to measured numbers. Bundle deliberately not rebuilt (comment-only).
- **U2. Public polish** (`Gallery.astro`, `index.astro`, `[id].astro`):
  device-neutral AR sentence; `NEW_MS` to 7 days (agreed 2026-09-06);
  eyebrow `white-space:
  nowrap` + section-head flex fix so "Available works" and the count sit
  cleanly at 390px; `.hero-meta` becomes a two-column grid (term + description
  columns) below ~40rem so the "Direct" row aligns with the others;
  hero-button taste pass (load `bundled:taste` first).
- **U3. Admin dev-honesty** (`api.ts`, `AdminPanel.ts`): three states, three
  messages — no API (`dev:astro`: "needs the live /admin"), API without
  secrets (`pnpm dev`: publishing/analytics genuinely unavailable locally —
  name that, not "couldn't reach"), live. `paintingViews()` distinguishes
  unreachable from unconfigured; `refreshFlags()` and ship/settings dots
  render "unavailable in this preview" (or similar) instead of "…" on
  failure. Capabilities row unchanged (already live data). Note: the new
  `pnpm dev` resolves the unreachable case for local validation, so U3 is
  now mostly honest-copy for the no-secrets state, verified via route-mocked
  404s.
- **U4. Admin copy surgery** (`admin.astro`): delete status-blurb default;
  collection hint → link to `/admin/gallery`; "Show until"; keep the banner
  blurb and announcement placeholder (verified finished behavior, not a bug).
  Settings section collapses into `<details>` per the Key Decision (token
  field stays as the Access-off path); dots become truthful via U3 — under
  the new `pnpm dev` they already resolve to real values.
- **U5. `/admin/gallery` + "Leave admin"** (new `src/pages/admin/gallery.astro`,
  `Layout.astro` studio nav, `AdminPanel.ts` or small script): card listing
  reusing gallery CSS, each card linking to its (public) painting page, where
  the token-gated toolbar already edits/deletes; Studio header links to it;
  painting-page admin bar already links back to Studio — confirm the round
  trip; "Leave admin" clears the sticky token, then lands on `/` with the
  subline "Token cleared on this browser — enter it in Settings to edit
  again." (Case A confirmed: saves need the Bearer live.) Token storage
  moves to `localStorage` (`api.ts` `adminHeaders` + `getPhoto`, `AdminPanel`
  token field, `[id].astro` `initAdmin`).
- **U6. Notify-collectors copy**: rewrite `collectors-hint` text to name
  subscribed-collector push vs inbox email in her words.
- **U7. Full validation** (see Validation Plan) + screenshots (390px, 1440px).
- **U8. Housekeeping**: commit the pending hover-prefetch (verified 18/18
  on 4331); `foo.md` and the old `.agents` plan already deleted.
- **U9. CI gates** (`.github/workflows/ci.yml`): add `pnpm typecheck`,
  `pnpm test:unit`, `pnpm check:inline` to the check job. No workflow
  redesign; e2e already runs the full suite on the committed 4331 config.

## Validation Plan

- `pnpm typecheck`, `pnpm test:unit`, `pnpm build` (expect 15 pages after U5).
- `pnpm playwright test` full suite on 4331 (config starts
  `wrangler pages dev dist --port 4331` itself; do not hand-start servers).
- New/updated specs: `/admin/gallery` round trip (studio → gallery → painting
  admin toolbar → back), "Leave admin" clears token and lands on `/`, Views
  shows the dev message under `astro dev`-style API failure (route-mock
  `/api/*` 404 like the existing admin-studio mocks), no "…" dots visible in
  that state.
- CI: `pnpm typecheck`, `pnpm test:unit`, `pnpm check:inline` all pass locally
  (they're what U9 wires in); push to main lets the real workflow confirm.
- Screenshots: subnav edge vs card edge at 390px and 1440px; section-head at
  390px; hero buttons before/after; AR section desktop + mobile widths.
- Human gate (not automatable): mom does one real upload on barbart.ca/admin.

## Risks / Rollback

- Access session logout: if no clean page-side logout exists, sign-out covers
  only the local token — state this in the report rather than faking it.
- `/admin/gallery` adds a build page; keep it token-gated like `/admin`
  (same Layout wordmark path) so nothing admin-only leaks to visitors —
  extend `tests/admin-studio.spec.ts` visitor test to the new route.
- Taste items are subjective: screenshots are the acceptance evidence, not
  opinion. Rollback per unit is `git revert` (units stay separate).

## Open Questions

- None. Resolved 2026-09-06: Q1 (hero-meta "Direct" row — two-column grid
  fix in U2), Q2 (sign-out clears local token, lands on `/`), Q3 (linking
  cards), Q4 (keep Notify collectors, clarified copy), Q5 (7-day "New"
  expiry — agreed).
