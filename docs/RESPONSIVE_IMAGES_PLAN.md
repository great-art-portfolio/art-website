# Responsive images + grid + upload plan (rough-representative, not pixel-perfect)

Goal: painting gallery stays fast and good-looking on iPhone / iPad / desktop as
mom adds/deletes paintings with varied aspects. Uploads auto-create all needed
responsive variants. Admin stays one-tap simple.

Source of truth is code, not docs/ (docs may be stale).

## Already good (keep)

- Auto-variants: `src/content.config.ts` `image()` + Astro `<Image>` build webp
  srcsets. Gallery `400/700/1000`, sold `400/700`, detail `640/960/1280/1600`.
  Locked by `tests/images.spec.ts`.
- `src/lib/image.ts` is browser prep only (MAX_SIDE 2000, JPEG 0.85). Leave
  thumbnails to sharp.
- Grid preserves aspect (`width:100%; height:auto`). 1-col / 2-col@40rem /
  12-col editorial@60rem (7 / 5+offset / trios). Ragged rows are by design.
- AR models already compressed (1024px JPEG texture, <512KB assert) + lazy
  (IntersectionObserver + dynamic model-viewer import + poster).
- Policy: verify on local dev server, never live barbart.ca/admin.

## Phase 1 — refactor-first (do first, no visual change)

1. New `src/lib/responsive-images.ts`: GALLERY_WIDTHS / SOLD_WIDTHS /
   PHOTO_WIDTHS + gallerySizes() / soldSizes() / photoSizes(). Use from
   `src/components/Gallery.astro` and `src/pages/paintings/[id].astro`.
   Why: widths/sizes hardcoded in 2+ places drift when grid changes.
2. `src/lib/image.ts`: extract pure `scaleFor(srcW, srcH, rotation)` from
   canvas/document side effects. Unify object-URL revoke. Node-testable.
3. Keep `#gallery-static .card` selectors (e2e coupled in gallery.spec.ts).

## Phase 2 — responsive images (pipeline + grid + upload)

- Detail hero: `loading=eager + fetchpriority=high + decoding=async`, pin webp.
- Gallery: `decoding=async`, pin webp; first 1-2 cards eager/high, rest lazy.
- Grid: `.gallery{align-items:start}`; `#add-preview` echo card
  (shadow + Georgia title). No aspect-ratio/cover (never crop art).
  Optional extreme-portrait guard: `.mat img{max-height:80vh;object-fit:contain}`.
- Upload: HEIC/EXIF failure message + `createImageBitmap(from-image)` hint;
  photo-meta file-size line from preparedBlob.size. Keep rotate 90/270.
  Defer crop/straighten/exposure sliders.

## Phase 3 — tests (local dev only)

- `tests/images.spec.ts`: hero eager/high, decoding, format pin; import
  widths/sizes from responsive-images.ts.
- `tests/gallery.spec.ts`: breakpoint columns/overflow, aspect-preserved.
- Unit: `scaleFor`, `formatDimensions`, api base64/getPhoto. Keep
  ar-models / painting-edit / banner green.

## Order

Refactor (Phase 1) -> responsive (Phase 2) -> tests again (Phase 3).

## Status (2026-09-06)

- Phase 1 DONE: responsive-images.ts extracted + wired; scaleFor() pure + tested.
- In-flight work completed: vendored /js/model-viewer.js + /js/ar-tooling.js
  are now actually loaded (painting page + admin, via @vite-ignore stable
  URLs). FIX: vendor script bundled the viewer instead of copying it
  verbatim — the raw module imports bare "three" and never loaded in a
  browser. vendor.test.mjs guards this (no bare imports, entry points).
  Re-run `pnpm vendor` after upgrading deps OR editing src/lib/ar.ts.
- Phase 2 DONE: hero eager/high/decoding + webp pin; first gallery card
  eager/high, rest lazy; grid align-items:start; admin preview echoes card;
  upload shows px + upload size and a HEIC hint on desktop failures.
- Phase 3 DONE: images.spec.ts locks widths/sizes/eager/decoding/format;
  vendor.test.mjs + responsive-images.test.mjs added. Full suite green:
  unit 45, gallery 17, images 3, smoke/banner/redirects 18.
- Left alone (not mine): scripts/public/js/model-viewer.js is a stray
  byte-duplicate of public/js/model-viewer.js, unreferenced — delete it
  when convenient.
- Uploads auto-create responsive variants at build (Astro Image + sharp);
  nothing extra needed on upload.
- Perf/responsiveness spot-check (2026-09-06, local static server): iPhone
  390 = 1 col, iPad 820 = 2 col, desktop 1440 = 12-col editorial
  (spans ~693/483/379), zero horizontal overflow everywhere; correct
  variants picked (400w phone, 700w desktop). Painting page trace:
  LCP 226ms lab, CLS 0.00, no render-blocking LCP cost. Admin at 390px:
  all sections + inputs fit. Extreme-portrait guard added
  (.mat img max-height:80vh + object-fit:contain).
