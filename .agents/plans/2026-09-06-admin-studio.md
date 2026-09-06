## Goal

Make `/admin` a studio your mom can run from her phone by typing `/admin`:
she can visit her collection as an admin (no URL hacking, no pointless
blurbs), edit on the painting page, delete from inside the edit UI, try AR
before publishing, and understand every section at a glance. Nothing
admin-only ever leaks to visitors. Fix the mobile alignment she spotted.

## Success Criteria

- Mom types `/admin`, taps any painting in the Collection section, and lands
  on its page in admin mode (edit toolbar present) — no URLs to remember.
- Edit stays on the painting page; delete lives inside the edit UI behind a
  confirm that names the painting — not one-tap on every card.
- Uploading shows a live card preview while she types, plus a "Try AR"
  button that previews true-size AR before she saves.
- Collection, Inquiries, and Settings copy says what each thing does in her
  words; no "Publishing needs the live site" jargon, no manual Refresh
  buttons on the happy path.
- A signed-out visitor sees zero admin chrome anywhere.
- Mobile subnav aligns with page content at 390px, zero overflow.
- Full suite green: new `tests/admin-studio.spec.ts` plus existing unit,
  gallery, images, smoke/banner/redirects.

## Context And Current Facts

- Admin is `src/pages/admin.astro` + `src/components/AdminPanel.ts`. No
  delete anywhere: repo search for delete/DELETE across `src` + `functions`
  returns zero hits, and `functions/api/commit.ts` only writes files — no
  delete path exists yet.
- Painting pages already show `#admin-bar` + edit-in-context when
  `sessionStorage.ADMIN_API_TOKEN` is set (`[id].astro` `initAdmin`), but
  nothing links mom from `/admin` to the gallery except the logo.
- Preview answers (her question): YES to card preview — `#add-preview`
  (`refreshAddPreview`, `AdminPanel.ts:224`) updates live while she types
  title/price/dims/photo. AR preview is post-save ONLY: `showArPreview`
  (`AdminPanel.ts:252`) runs after commit from memory blobs (`:549-550`).
  She cannot try AR before publishing today.
- Buyer notes land in her private inbox (`NOTIFY_EMAIL_TO`, never shown on
  the site — `README.md:56`, `functions/_lib/env.ts:20`) with reply-to set
  to the buyer; nothing is stored, so there is no inbox. The Inquiries card
  should say exactly that, naming her inbox rather than "your email".
- "Publishing needs the live site — this preview can't reach it" is the
  offline/unconfigured fallback in `refreshCollection`: she opened admin
  somewhere without the API (local preview). Rewrite in plain words:
  "Couldn't reach the publishing service — open barbart.ca/admin on the
  live site." Same for Views ("Analytics isn't wired up yet" is fine but
  jargon-heavy — simplify).
- Settings card is operator chrome (token, service-worker/sync/network
  flags). Keep the capability, lose the jargon: one line that says whether
  this browser can work offline, token row only explained as "only if
  Access is off" (already there — keep).
- Header + subnav findings stand from the screenshots: `Layout.astro:52-63`
  renders visitor nav (Notify me) on studio pages; `.subnav`
  (`admin.astro:260-269`) is full-bleed with no inline padding ("Add" hugs
  the viewport edge); seven step badges repeat one pattern — badges go.
- AR fallback (answered, no work): `ar-modes="webxr scene-viewer
  quick-look"` tries native WebXR first, then OS-native Scene Viewer /
  Quick Look, else inline 3D remains.

## Constraints And Non-goals

- Verify on local dev (`wrangler pages dev dist`), never live `/admin`.
- Existing Cloudflare Access + `ADMIN_API_TOKEN` gate stays; delete reuses
  `requireAdmin`.
- Non-goals: crop/straighten/exposure sliders (mom never asked; rotate +
  retake covers her); inbox features; public gallery visuals; vendored `/js`
  or AR pipeline changes.

## Key Decisions

- Collection cards LINK to painting pages in admin mode; no inline
  Edit/Delete on cards (her "idk if that's a good idea" — agreed, too easy
  to fat-finger). Rejected: per-card edit/delete.
- Delete lives at the bottom of the edit UI (both studio list editor and
  edit-in-context) behind a confirm naming the painting; one commit removes
  `.md` + photo + `.glb`/`.usdz`; status notes git-history recovery.
- Extend `POST /api/commit` with optional `delete: [paths]` under the same
  allowlist shape (not a new route): one gate, one allowlist. Verify
  blob-less (deletion) entries in `functions/_lib/github.ts` at build time.
- Copy surgery, not new sections: Collection hint deleted; Inquiries names
  her inbox + reply flow + mark-sold-after-shipping; Settings in plain
  words; API-unreachable errors say to open the live `/admin`.
- Manual Refresh buttons go: sections auto-load, retry appears only on
  failure.
- Pre-save "Try AR" button in the Add form builds models from the prepared
  photo + dims into `#ar-preview` without committing (reuses the vendored
  builder + `showArPreview`).
- Studio header keeps the wordmark; nav becomes Gallery / View site (drop
  Notify me + About when `wordmark="admin"`).

## Recommended Approach

Visible wins first (header, subnav, copy — no logic), then Collection links,
then delete endpoint + tucked UI, then pre-save AR try, then the journey
test pinning it all. Each unit stands alone.

## Work Plan

1. Studio header + subnav + copy (`Layout.astro`, `admin.astro`,
   `AdminPanel.ts` strings only). Conditional studio nav; subnav inline
   padding + narrow-screen scroll; step badges removed; Inquiries/Settings/
   error copy rewritten; Refresh buttons replaced by auto-load + on-failure
   retry.
2. Collection-as-links (`AdminPanel.ts` `refreshCollection`). Each row links
   to its painting page (admin mode via existing token seam); keep the
   text editor as the edit surface; add "← View gallery" link.
3. True delete (`functions/api/commit.ts`, `functions/_lib/github.ts`,
   `AdminPanel.ts` + `[id].astro` edit UIs). `delete[]` allowlisted to
   paintings + models; confirm names the painting; one commit; status notes
   repo-history recovery.
4. Pre-save "Try AR" (`AdminPanel.ts` Add form). Button builds from the
   prepared photo + current dims via vendored `ar-tooling.js`, renders into
   `#ar-preview` with a "preview only — nothing published" note; failures
   degrade to a status line, never block saving.
5. `tests/admin-studio.spec.ts`. Authed: `/` → every card opens its page
   with `#admin-bar` + working edit toggle; `/admin` Collection rows link
   to the right pages; delete control present in edit UI. Anon: no
   `#admin-bar`, toggle, or delete control anywhere. Copy assertions for
   the rewritten hints (no "live site" jargon).

## Validation Plan

- `node --test "tests/unit/**/*.test.mjs"` green; `pnpm typecheck` +
  `pnpm build` (14 pages) after each unit.
- `pnpm playwright test tests/admin-studio.spec.ts` — both contexts;
  highest-risk step (header, links, API, UI).
- Re-run gallery (17) + images (3) + smoke/banner/redirects (18).
- Manual at 390/820/1440px: `/admin` overflow 0, subnav edge matches card
  edge (screenshot); upload flow watched once with mom before any further
  upload-scope work.

## Risks / Rollback

- Delete widens a write API: same allowlist + `requireAdmin`, tests hitting
  out-of-scope paths. Rollback per unit (implementation commits revert
  cleanly; only `ab53b65` + this plan exist so far).
- Card-to-page links depend on the token seam: reuse the exact
  sessionStorage mechanism existing tests use.
- `scripts/public/js/model-viewer.js` stray duplicate still untracked —
  delete with her go-ahead during unit 1.

## Open Questions

None.

## Status (2026-09-06, implemented, uncommitted)

All 5 units done, full suite green: unit 48, typecheck, build (14 pages),
admin-studio 5, gallery 17, images 3, smoke/banner/redirects 18.
Deviations: studio nav is Gallery + Add painting (two links to `/` would be
silly); found + fixed author `display:inline-flex` beating `[hidden]` on the
Retry buttons. e2e admin-API calls are route-mocked (no backend under
`wrangler pages dev`); delete exercised to confirm-arm only, never fired.
Follow-up (uncommitted): `.keep` exemption so ← Gallery survives the ≤38rem
nav collapse (it was display:none on her iPhone — she had no way home),
subnav padding to exact edge alignment, 0.75rem mobile nav gap. Verified by
screenshot at 390px + admin-studio 5 / gallery 17 green.
