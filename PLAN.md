## Goal

Fix the studio page properly: one bug (dead page after clicking around),
one cleanup (dead files/routes), and the full TODO.md list. Small steps,
each checked. Crash safety = TODO.md + this file + one commit per step.

## What broke (root causes, checked in code)

- `AdminPanel.init()` runs on full load only. Clicking between studio pages
  swaps content without running it: lists stuck on "Loading...", dead
  buttons, missing greeting. Fix: run init on every studio visit, safely
  twice (guard).
- `src/pages/admin/gallery.astro` + its gate script race the router, so it
  sometimes locks mom out. Fix: delete the page; link the public gallery,
  which already follows her login.
- `src/layouts/Cart.astro` has zero uses. Delete it.

## Steps

1. **Init on every visit** (`AdminPanel.ts`): run on `astro:page-load` with
   a done-flag so listeners/refreshes never double-bind. Spec: load studio,
   leave, come back through a click — greeting shows, buttons work.
2. **Delete gallery page + Cart** (`admin/gallery.astro`, `Cart.astro`):
   Collection card links to `/#collection`. Header "← Gallery" clears the
   token and goes home (it IS leave now). Delete the Done card. Update the
   gate/leave/round-trip specs to the new flow.
3. **Header + cards** (`admin.astro`): drop eyebrow + greeting. Merge
   Inquiries/Ship-it/Advanced/collection-link into one info card. Add card
   half-width desktop, collection blurb card half-width. Hide off flags.
   "Advanced" with `>` marker. Views card hides when empty, bars when not.
   Rewrite blurbs in mom-voice; "wall preview" not "AR"; publishing note on
   the Add card.
4. **Form bits** (`admin.astro`, `AdminPanel.ts`): narrower file picker with
   pointer cursor; turn buttons gated with Try-it row; `.dev.vars` sample +
   README dev-upload note.
5. **Link hovers**: transition on all studio links; visited stays accent.
6. **Proof**: per step — typecheck, unit, build, targeted specs,
   screenshots (phone + desktop). End: full suite. Commit per step
   (1+2 together, 3, 4, 5+proof).

## Checks (every step)

- `pnpm typecheck`, `pnpm test:unit`, `pnpm check:inline`, `pnpm build`.
- `pnpm playwright test` for touched specs, full suite at the end (own 4331
  server; never touch 4321).
- Playwright clicks things, not just sees them; new routes get visited.
- Screenshots before calling any visual done; taste rules (no purple, no
  emoji, no new fonts, motion respects reduced-motion).

## Risks

- Token in `localStorage` + header-leave: leaving mid-add loses nothing
  (nothing saves until Save). State it, don't solve it.
- Views bars need analytics data: unconfigured/empty keeps the card hidden.
- If a step's spec fails twice, stop and report instead of forcing it.
