## Goal

Second pass, sparked by the 2026-09-06 review of the finished first plan:
polish the visitor painting page (viewer loading state, inquiry before AR),
then rebuild `/admin` from a long 1D list into a grid dashboard that looks
designed — tasteful controls, honest states, no dead ends. Crash recovery:
a new session can pick up from here with zero prior context.

## Success Criteria

- First visit to a painting page never flashes raw content in the viewer
  stage; a skeleton holds the space until the model (or its fallback) lands.
- The inquiry form opens above the AR section, painting still visible.
- `/admin` is a responsive grid (multi-column desktop, single-column phone),
  not a scrolling list; the sticky subnav is gone.
- The add-painting form is hidden behind an "Add new painting" toggle.
- Errors/status are always visible (sticky bottom bar), never stranded at
  the top of a long page.
- Every button, input, and select has hover/focus styling that matches the
  site; no browser-default blue links, no unstyled native controls.
- "Try AR preview" cannot be tapped before a photo exists.
- Full suite green on 4331; screenshots (admin grid both widths, painting
  order, viewer skeleton) attached to the final report.

## Context And Current Facts

- Prior plan (all committed): ab53b65, 4cbc7cc, 6d97446, fe9bb85, baa70d6,
  966f57e, b848c18, ca115dd (U2), ad13041 (U3), 311834a (U4), de1cf16 (U5),
  79f715c (U6), 66f6e32 (U8), 51b8166 (U5 follow-up), abc5768 (U9),
  e9e7d0c + 25083b1 (plan bookkeeping). Hover-prefetch markup rode in U2.
- Painting page (`src/pages/paintings/[id].astro`): `#ar-stage` gets a static
  poster img, then `model-viewer` swaps in on scroll — the swap flashes.
  Inquiry block (`#inquiry-reveal` + `#inquiry-form`) sits BELOW `#ar-mount`;
  tapping it scrolls the painting out of view. Models are ~300KB, loaded on
  scroll into view via `src/lib/vendor-loader.ts`.
- Admin (`src/pages/admin.astro` + `src/components/AdminPanel.ts`): single
  column of `.card` sections, sticky `.subnav` (edge-aligned but ugly),
  `#admin-status` at top (now starts empty per U4), native `select`
  unstyled, collection link is browser-default blue, `#ar-try` clickable
  with no photo (only an error status answers). `input`/`textarea` have
  `:focus-visible` but no hover transition; buttons mostly static.
- Taste skill loaded 2026-09-06 (anti-slop filter, negative constraints);
  a new session must re-read `bundled:taste` before touching admin CSS.
- Verify on `wrangler pages dev dist`, e2e on port 4331
  (`playwright.config.ts`); `pnpm dev` builds + serves (predev hook).
- Auth/architecture (settled, do not reopen): one public painting URL with
  a token toolbar overlay; sticky `localStorage` token; "Leave admin"
  clears it; `/admin/gallery` links to public pages.

## Constraints And Non-goals

- No model prefetching (five 300KB hover downloads punish every visitor).
- No cycling image/description/viewer UI on the painting page.
- No new secrets/auth; no vendored-bundle or AR-pipeline changes (copy/CSS
  only on the viewer); no public-gallery visual redesign beyond P1.

## Key Decisions

- **Skeleton, not spinner, not prefetch**: `#ar-stage` keeps a
  shimmer/skeleton block in the exact 20rem box until the viewer element or
  the failure fallback replaces it. Rejected: model prefetch (bandwidth),
  spinner overlay (layout shift when it clears).
- **Inquiry moves above AR** (whole block: reveal button + form), so the
  form opens with the painting still on screen. Rejected: button-only move
  (form would still render below), collapsing AR (hides a selling feature).
- **Grid kills the subnav**: sections become a responsive grid
  (≥60rem: 2–3 columns with Add spanning; below: one column). Anchor ids
  stay for deep links; the sticky strip goes away with its alignment grief.
  Rejected: keeping both (redundant navigation).
- **Add form behind a toggle**: "Add new painting" button reveals
  `#upload-form` (hidden by default); AR-try row additionally stays hidden
  until a photo loads. Rejected: details/summary here (the form is long;
  explicit toggle + focus management reads better).
- **Sticky bottom status**: `#admin-status` becomes
  `position: sticky; bottom: 1rem`, so errors land where mom is looking.
  Rejected: per-card status regions (AdminPanel rewrite for no gain).
- **Controls match the site**: `select` styled like inputs (same border,
  radius, background, padding); inputs/buttons get hover border transitions;
  admin links use the accent treatment, never browser blue. Focus rings stay
  accent.
- **Taste gate**: `bundled:taste` constraints apply to every admin CSS edit;
  before/after screenshots are the acceptance evidence.

## Work Plan

- **P1. Painting page** (`[id].astro`): move inquiry block above `#ar-mount`;
  skeleton element in `#ar-stage` cleared on viewer/fallback render.
  Specs: order-agnostic ones keep passing; add skeleton-exists assertion to
  `gallery.spec.ts` AR coverage.
- **P2. Admin grid** (`admin.astro` CSS + markup order): grid layout,
  remove `.subnav` (+ its CSS/tests); keep section ids. Update
  `admin-studio.spec.ts` subnav test → grid/no-overflow test at 390px.
- **P3. Add-form toggle** (`admin.astro`, `AdminPanel.ts` init): hidden
  `#upload-form` + "Add new painting" button; focus first field on open.
- **P4. Status + controls** (`admin.astro` CSS, `AdminPanel.ts` if needed):
  sticky-bottom `#admin-status`; hover/focus transitions for buttons,
  inputs, select; accent admin links; taste pass with screenshots.
- **P5. AR-try gating + link color**: `#ar-try` row hidden until
  `preparedBlob` exists (unhide in photo-load + rotation paths); confirm no
  browser-blue links remain anywhere in admin.
- **P6. Full validation**: typecheck, unit, build, full e2e on 4331,
  screenshots (admin grid 390px + desktop, painting order, skeleton),
  commit per unit.

## Validation Plan

- `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, `pnpm check:inline`.
- `pnpm playwright test` full suite (config boots its own 4331 server).
- New/updated specs: viewer skeleton present pre-load; inquiry precedes AR
  in DOM order; grid has zero horizontal overflow at 390px; add-form hidden
  until toggled; status bar sticky (computed `position`).
- Screenshots: admin grid both widths, painting page order + skeleton,
  before/after for restyled controls.
- Human gate: mom uploads on barbart.ca/admin (unchanged standing gate).

## Risks / Rollback

- Moving inquiry above AR changes the selling flow order — screenshots prove
  it reads well; revert is one commit per unit.
- Dropping the subnav removes anchor navigation; grid + kept ids preserve
  deep links. `git revert` per unit.
- Taste is subjective: screenshots decide, not opinion.

## Open Questions

- None. The one judgment call (prefetch vs skeleton) is decided above with
  reasons.
