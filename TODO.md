# Redesign: WYSIWYG studio (agreed, not yet built)

## Verdict

Yes — one shared painting layout, draft/edit routes that look like the buyer
page, dashboard slimmed to a thumbnail index. Superior because: single
presentation source, no remember-the-name round trip, thumbnails, no layout
shift, dev parity. Caution: two admin JS islands (dashboard + painting
editor) — both must import from lib/, never duplicate logic.

## Design

- New `src/layouts/PaintingLayout.astro` (props: painting data, mode:
  "buy" | "edit" | "draft"). Sections: photo, title/price/meta,
  description, "Try it on your wall", "Ask about this painting".
  - buy: today's page, pixel-identical (existing specs guard this).
  - edit: same page, static text swapped for inputs, Save/Delete toolbar.
  - draft: empty painting — photo tile says "upload a photo", AR slot says
    the waiting copy, Interested button disabled with one-line why.
- New routes (Access on /admin/* covers them, no auth work):
  - `/admin/paintings/new` — draft mode. Save publishes via commitFiles
    (photo + models + md); dev = practice save in memory.
  - `/admin/paintings/[slug]` — edit mode for existing pieces.
- Dashboard `/admin` keeps banner/views/info; Collection card becomes a
  thumbnail grid linking to the edit routes (bake image URLs into the page
  JSON); Add card becomes a "Start a new painting" button to /admin/new.
- Skeleton rows in the Collection card (static markup, replaced on load) —
  fixes the collapse-then-shove layout shift.
- Draft waiting copy (mom words): "Waiting for a photo — once one arrives,
  the 3D takes about 5 seconds to build. You'll see it here, and on a phone
  you can also view it in AR." VERIFIED: photo-to-viewer measured 277ms warm
  (simple textured frame box, built locally — no AI scan); ~5s covers cold
  vendor downloads honestly.

## Agreed decisions (user, 2026-09-06)

- Drafts are a real feature (none exist yet): `draft: true` frontmatter,
  excluded from gallery/sitemap/[id]; admin shows a Drafts section only when
  drafts > 0. Save-as-draft button on the painting editor; Publish flips the
  flag. Drafts live in git, so they survive devices.
- After saving (draft or published) she lands back on /admin.
- Old Add form + inline editors die the moment the new routes work (no
  parallel editors).

## Build order (no big-bang)

1. DONE (20779bf^): draft flag in schema; drafts hidden from gallery,
   painting pages, and static paths.
2. DONE: `PaintingDetail.astro` extracted; buyer page rebased unchanged.
3. DONE: `StudioPainting.ts` island (live preview, photo tile, auto AR,
   save/publish/delete, dev practice overlay in localStorage).
4. DONE: routes /admin/paintings/new + /admin/paintings/[slug] (Access on
   /admin/* covers them). Saves land back on /admin with flash + share kit
   via session storage. Practice = dev without token; a stored token means
   the commit, even on localhost.
5. DONE: dashboard is a thumbnail index (Drafts/Available/Sold) with
   skeleton rows, practice merge + reset, new-painting door. Old Add form,
   inline editors, and buyer in-context panel retired; buyer admin-bar is
   now a door to the studio room.
6. DONE: specs rewritten (studio-painting, ar-regen via rooms, dashboard
   doors/thumbs/Drafts/practice, SW exclusion incl. rooms). 79 e2e + 58
   unit green.

## Crash notes

- Port 4331 serves dist/ via workerd: rebuild after every change.
- dataset.localEdit (not dataset["local-edit"]).
- Gates before commit: typecheck, check:inline, build, unit, full Playwright.

## Done earlier (committed 20779bf)

Single focus ring; accent collection link; 32rem rows; Advanced spacing;
0.12s underlines; prepopulated 3D slot; nav Add opens form; wordmark to
/admin; calm add animation; dev practice edit/delete; 6s toast expiry.

## Still human-gated

Push to main for CI; real upload test on barbart.ca/admin.

## Follow-ups (2026-09-07, uncommitted)

- Banner preview in dev: saving without a backend keeps the wording in
  `studio-banner-preview-v1` (this browser) and the homepage renders it
  above the collection. A stored token still means the real commit.
- Edit-room photo replace drops `srcset`/`sizes` before the blob swap, so
  the frame shows the new upload (was: stale srcset candidate on screen).
- Collector signup is a modal (`#notify-dialog` in Layout, opened from nav
  - hero) — the about section is text only. Specs updated (scroll
    assertions became modal assertions).
- Admin nav has a Metrics link (`/admin#sec-collection`, where view counts
  live in the rows). Gates green: format, lint, astro check, typecheck,
  62 unit, check:inline, build, 95 e2e + 1 flaky-pass.

## Studio dev loop (2026-09-07, uncommitted)

- `pnpm dev:studio` (astro on :4332 + working-tree content API on :4333)
  so publish flows are testable without prod; writes stay uncommitted,
  `pnpm studio:reset` restores gallery paths. Verified live: banner POST
  through the proxy rendered on the dev homepage, reset restored it.

## Follow-ups (2026-09-08, uncommitted)

- Studio Collection: Drafts are a foldable ("N drafts") in the right
  column with compact rows (3rem thumbs, single column); Sold drags
  within its group like Available, and the homepage sold archive follows
  the same `order:` frontmatter. Toasts say "Sold order …" for sold
  drags. New e2e covers the sold drag (stubbed trio, tree holds one
  sold). Gates green: format, lint, astro check, typecheck, 133 unit,
  check:inline, build; verified in a real browser on :4331 (fold
  toggles, sold draggable, drafts not, homepage order intact).

## Follow-ups (2026-09-08, uncommitted, part 2)

- Drafts + Sold folds animate open/shut (allow-keywords ease, same as
  the Advanced drawer; instant under reduced motion). Folded Drafts
  yields its column: Available stretches 2fr to 1fr, divider fades out
  (color-only transition). Verified 1280/820/390px, zero overflow.
- AGENTS.md: added the motion-everywhere + three-screens taste rules;
  loop now runs touched spec files per change, full e2e pre-commit.
- Ran the tests for real this time: full suite 113 passed. Fixed 4
  stale assertions along the way — available-drag and practice-drag
  counts assumed unordered data (tree now has order:, so only n-1 rows
  rewrite; proven pre-existing via stash), the practice mirror compared
  a Promise instead of polling, and the Drafts-section assertion needed
  the new count label. About link: measured identical to Collection in
  light theme (same color + 0.78 opacity); only Notify-me differs, by
  design.
- Drafts moved below Available as a full-width fold (compact rows in a
  responsive multi-column grid, like Sold); two-column studio layout
  retired. Advanced Settings unfolds + fades its content in.
  Full suite 114 passed.
- Admin split into pages: /admin is Collection only; Banner, Views
  (new stats table, most-watched-first, graceful when empty), and Guide
  live under a tab bar (Collection/Banner/Views/Guide). Shared form
  styles moved to components/studio.css, toast+tabs to AdminTabs.astro;
  AdminPanel inits only the section whose markup exists. Full suite
  116 passed; verified all four pages at 1280 + phone.
- Committed dd37d7a and pushed to main: CI order fixed
  (build→check:inline), local D1 migrate step added, tests made
  clean-checkout safe, plus the two build-required modules
  (model-files, gallery-paths) that were never committed.
- Trash is live: Delete moves paintings to a closed fourth fold
  (Available, Drafts, Sold, Trash) with Restore + Delete forever;
  Empty trash destroys in one commit; anything over 30 days old clears
  itself on dashboard visits. Normal edits preserve the flags;
  trashedAt is always quoted (bare dates break the content schema —
  caught by the build mid-turn). Room deletes move to trash too.
  Suite: 149 unit, 120 e2e, all green; trash fold verified in browser.
- CI is one integrated job now (install once, gate order, shared
  dist) with branch concurrency cancel.
- Review pass: schemas row-list parsers deduped via parseRowList;
  removed dead maybeInput helper; new unit tests for money, dims, and
  parseStatsSeed (142 unit green, admin-studio e2e 40 green).
- WordPress gaps, all four, live (156 unit, 126 e2e, all green):
  - Draft preview: /admin/preview/[slug] shows the buyer page for any
    painting (draft or live) with a banner, no working inquiry form,
    and noindex. Edit rooms link out via a toolbar Preview button.
    Dashboard rows keep one studio door per card (contract), so they
    link only to the room — preview lives one tap inside.
  - Autosave: rooms silently back up typed fields to localStorage
    (800ms debounce) and restore them after a refresh or crash; the
    backup clears on every save/delete landing back on /admin. No UI.
  - Scheduled publishing: rooms offer a "Publish on" date; a dated
    draft commits publishOn (quoted, like trashedAt) and the dashboard
    publishes due drafts on her next visit in one commit (re-reads
    each file first; failures keep drafts with a toast). Draft rows
    say "goes live <date>". Publishing by hand clears the date.
  - Rename redirects: saving a new title retires the old slug into
    slugHistory (same commit, newest-first, cap ten); buyer pages
    build one alias path per entry, canonical back to the title slug
    (relative — the static build bakes a placeholder origin, caught
    by e2e). Legacy _redirects untouched; the commit allowlist stays
    gallery-only.
  - Two catches by the suites: canonical baked as localhost:4321
    (now relative paths) and the row Preview shortcut violating the
    one-door-per-card / never-"preview" list contracts (removed).
- SEO pass (156 unit, 129 e2e, all green): `site: barbart.ca` plus a
  SITE_URL constant (build bakes a placeholder origin, so share tags
  never derive from the request); hand-rolled sitemap.xml (published
  paintings only, no drafts/studio) + robots.txt (studio disallowed);
  buyer pages share the painting photo with absolute addresses
  (was: site icon on a localhost URL).
- Studio redesign from taste + screenshots (140 unit*, 130 e2e green):
  sections live in the header nav (aria-current, arrow-only Leave on
  phones) — AdminTabs.astro deleted, toast moved to Layout;
  sec-collection unwrapped (children straight on main) and all four
  admin sections de-carded to whitespace; drafts wear the same photo
  cards as Available (trash stays compact); grab fist closes mid-drag
  (`:active grabbing`); dev suffix reads as a muted sub-line.
- Advanced drawer determinism (140 unit, 133 e2e green): the fade only
  sometimes played — the transition shorthand resets
  transition-behavior and the minifier sorts it first, silently killing
  the discrete display step (fixed with !important + @starting-style,
  measured identical 3-round curves both directions, pinned by test).
- Metrics redesign + measure pass (140 unit, 133 e2e green): ranked
  thumb rows with share bars and a headline total instead of the
  ledger table (no status column, no drafts); lede in ink with one
  honest empty line; hairlines off all admin headings/folds;
  text sections capped at 40rem prose while the grid keeps full
  width; taste+measure rules written into AGENTS.md. Clay hover test
  hardened against load flakes (re-hover in poll, same assertion).
  *Unit reads 140, matching HEAD exactly — every added block verified
  running; the earlier 156 sighting never reproduced.
- Second studio pass (140 unit, 132 e2e green): h2 says Available with
  matching Drafts/Sold fold headers, h3s gone; photo hover lights the
  title; admin transitions verified mid-fade + pinned by a test (were
  already animated); drafts off Metrics; /admin/views renamed
  /admin/metrics (+ redirect); Guide in ink with photo/publish/
  disappeared explainers; mid-drag cursor forced to "move" (OS owns
  it); date field freed from checkbox CSS + nowrap label; drag is and
  was intact (user confirmed).
- Drawer determinism + studio titles/centering/grid (140 unit, 134
  e2e green): the unfold only slid in Chromium — Safari/Firefox
  snapped it, and under reduced motion the slide died while the fade
  played, so the same drawer felt random. Now one script path (WAAPI
  height + beat-behind fade, new src/lib/drawer.ts) for Advanced and
  all three folds, instant height under reduced motion with the fade
  intact; the old curve test passes unmodified, plus an animate-spy
  pin. Two real bugs found along the way: folds wired before the
  innerHTML swap (fresh nodes went unwired — wire after), and
  rebuilds clobbering live toggle state (a refresh mid-close popped
  the fold back open — renderRows now carries effective fold state
  across the swap). SSR folds wire at init (the collection fetch lags
  behind). Tab titles read Admin - Collection/Banner/Metrics/Guide
  (rooms too); prose sections center in the container (were
  left-hugging wide screens); collection grid is four across (15rem
  min — five squeezed photos and drag targets).
- Drag honesty + studio batch (140 unit, 134 e2e green): same-row
  drops split left/right (center drops on side neighbors always fell
  before, crying "already" on real moves); the no-op toast reads as
  confirmation now. Show-until select is content-sized with a drawn
  chevron; metrics unified on "views"; trash copy shortened; room
  toolbar puts Sold/date/notify above the buttons; each admin page
  gets its own faint wash (four new SVGs, Layout backdrop prop).
- Drag silence (140 unit, 135 e2e green): dropping a card where it
  already sits (the near half of an adjacent neighbor — Night Reeds
  onto First Thaw's left half) stayed silent instead of toasting
  "already the order" on every miss; the safety-net toasts in
  persistOrder went quiet for the same reason. The reorder hint now
  says the orange edge shows where the card lands. Pinned by a test
  that reads the toast line immediately (a retrying assertion would
  out-wait the 6s toast and pass against the noisy code too).
- Phone header wrap (135 e2e green): CI was red on three straight
  pushes — the 390px no-sideways-scroll test failed only under
  Linux fonts (system-ui falls back to wide DejaVu, +13px on the
  admin nav row). The row now wraps below the wordmark on narrow
  screens plus tighter phone padding/gaps, so it never scrolls
  sideways whatever the font. Two rows on her iPhone too, roomier
  taps, everything still visible.
- De-flaked two CI-only timing tests (both failed past pushes):
  the toast mid-fade pins animation-name/duration now (the 0.25s
  run finished between round-trips, reading 0 animations). The
  inquiry hover test re-parks and re-hovers inside toPass polls
  (a late image shifts the input under or out from the pointer
  mid-fade — one park alone failed both directions in CI).
- Buyer, not collector, in buyer-facing words (privacy page alerts
  copy + signup test title). Code identifiers stay: /api/collectors
  and the email_collectors table are load-bearing names.
- Easy CSS wins taken (136 e2e green): textareas auto-grow with
  field-sizing: content (lh floors keep the empty rows height;
  inputs untouched), accent-color on the native date picker. The
  AI's checkbox accent-color was dead on arrival — studio boxes are
  hand-drawn appearance:none. light-dark(), :where() nesting,
  container queries, content-visibility, anchor positioning, and
  dvh all declined on the record (risk without reward).
- Targets answer only themselves (139 e2e green): banner Show-until
  label hugs its dropdown (full-width labels forward hover to the
  control from anywhere in the row); metric titles park on their
  words (a stretched grid link also caught dead-space clicks);
  Sold sits right of the publish-on date in room toolbars. New
  tests: room save carries publishOn (dashboard-side scheduling was
  already covered; stubs are per-test memory, so no clock and no
  delete-after needed — 3.png unnecessary, existing jpgs do), plus
  hover pins for both fixes (each verified failing pre-fix; the
  metrics one must measure the text range, not the stretched box).
  Trash guide line already covered (move/restore/purge + 30-day
  auto-clear tests).
- Drawer headers unselectable (140 e2e green): Advanced Settings
  plus the Sold/Drafts/Trash fold counts wear user-select none —
  a header is a control, not content. Pinned by double-clicking
  the header and reading the (empty) selection.
- Guide teaches the drag (140 e2e green): Collection order section
  names Available/Sold as draggable, drafts/trash as staying put,
  in the page's own plain words.
- NOTIFY_EMAIL_TO is ARTIST_INBOX now (143 unit, 140 e2e green):
  the old name still works as a silent fallback so a stale
  dashboard secret never silences mail — rename it in the
  Cloudflare dashboard when convenient. Docs + example updated;
  local .dev.vars already on the new name.
- NOTIFY_EMAIL_FROM is ARTIST_SENDER (146 unit): same legacy
  fallback; wrangler.toml carries the value (committed, both envs),
  so no dashboard change needed for the sender. Local .dev.vars
  sets it to the gallery address — without a verified-domain
  sender, Resend only delivers to its own account email.
- Legacy fallbacks removed: dashboard already holds ARTIST_INBOX
  (verified via secret list — no NOTIFY_* secrets remain), so the
  old names are gone from code, types, tests, and docs. README
  records who sees what (sender always visible; inbox only in
  list-mail To line).
- List consent lifecycle, LOCAL COMMIT ONLY (150 unit, 145 e2e
  green — do NOT push before the remote migration): double opt-in
  (token links, 7-day expiry, confirm page), one-click
  unsubscribe (token link + List-Unsubscribe headers + modal Leave
  button + goodbye page), per-recipient broadcasts to confirmed
  addresses only (single-BCC design would 400 past 49
  recipients), templates centralized next to sending, privacy
  wording matches. Remote 0004 must apply BEFORE this deploys or
  live subscribe 500s.
- CI retries the browser install (apt mirror exit 100 twice running,
  failing runs before any gate; PAT can't rerun, hence the empty
  retrigger commit). Root cause: Google's Chrome repo serves a stale
  Packages index (Hash Sum mismatch), unrelated to our deps — the
  workflow drops every apt source pointing at dl.google.com by URL
  (a filename-based removal missed it) and keeps the retry for real
  blips. Verified: full CI success after the URL-based removal.

## Status 2026-09-10 — ping customization + banner layout (uncommitted)

- Ping box on /admin/banner has an optional Message line; stored in new
  `push_message` table (migration 0005, applied remote + local), served by
  public GET /api/push-message, shown by the service worker instead of the
  standard note. Tap still opens the site homepage.
- Banner controls are one desktop line: Show-until select, Update banner,
  status text. Wraps on narrow phones.
- `pnpm db:migrate` (full chain) is NOT re-runnable: 0004's ALTERs fail on
  an already-migrated DB (duplicate column: token). Apply single files
  instead. CI's db:migrate:local is fine (fresh state each run).
- Leaving uncommitted for review: banner/ping work + user's own gallery
  order edits in three painting .md files.

## Status 2026-09-10 — ping errors, cooldown, modal copy (uncommitted)

- Ping 404 in studio dev is the sidecar (only content endpoints; /api/notify
  404s): admin now says plainly the ping needs the live site. 429 from the
  new 5-minute tickle cooldown (migration 0006, applied remote + local)
  says to wait a few minutes. Empty pings and publish alerts never count.
- Subscribe in studio dev 404s on /api/push the same way: new "unavailable"
  result says browser alerts need the live site.
- Notify modal: drag-select spilling past the card no longer closes it
  (selection guard; closedby="closerequest"); tapping the status line copies
  it with a "Copied." toast.

## Status 2026-09-10 — dev cooldown 20s (committed below)

- PUSH_COOLDOWN_S env override (seconds, default five minutes); local
  .dev.vars sets 20. 429 wording follows the cooldown (seconds vs minutes).
- Subscribe "unavailable" message verified true: studio sidecar 404s both
  /api/push and /api/notify, while 4331 serves the VAPID key (works there).

## Status 2026-09-10 — modal email layout + dev mock list (committed below)

- Notify modal: email field spans the full row; Join then Leave share the
  row below as halves (primary first, LTR).
- Dev mock list: COLLECTORS_MOCK=true in local .dev.vars only, plus a
  localhost hostname rail, so dev can never touch the Resend segment.
  Joins store pending rows in local D1 email_collectors and answer with a
  localhost confirm link shown in the modal (tap copies it); confirm and
  leave round-trip the same table; admin count reads confirmed rows.
- Modal specs wait for the push paint to settle before submitting, use
  missing@tld for backend-agnostic validation coverage, and detect mock
  mode for valid-address submits.

## Status 2026-09-10 — studio dev push loop (committed below)

- Sidecar hosts push now (scripts/studio-push-mock.mjs): own VAPID keypair
  cached in node_modules/.cache, in-memory subscribers + ping line, same
  /api/push + /api/push-message + /api/notify shapes. Tickles go over the
  real push service. No cooldown, no email in studio. Needs a studio stack
  restart to pick up (sidecar predates the routes).

## Status 2026-09-10 — modal adapts to dead push (committed below)

- subscribePush maps AbortError push-service failures to nopushservice with
  its own words (unit-covered). The result is remembered per browser
  (localStorage); later modal paints hide the push half and leave email
  standing, with a quiet Try-again button that lifts the flag. Success
  clears it. Modal specs detect mock mode and wait for the push paint.

## Status 2026-09-10 — retry button removed (committed below)

- No Try-again button: the Notify button itself is the retry path. The
  flag machinery, hiding, and their tests are gone; detection plus the
  sticky settings-worded verdict stay.
