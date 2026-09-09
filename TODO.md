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
- Review pass: schemas row-list parsers deduped via parseRowList;
  removed dead maybeInput helper; new unit tests for money, dims, and
  parseStatsSeed (142 unit green, admin-studio e2e 40 green).
