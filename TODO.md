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
  *Unit reads 140, matching HEAD exactly — every added block verified
  running; the earlier 156 sighting never reproduced.
