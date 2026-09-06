# Admin + painting fixes — everything from the review, in plain words

(Card means card. Nothing here should need asking again.)

## Studio page header
- [x] Delete the "ARTIST STUDIO" eyebrow and the "Good evening." line.
- [x] Merge "Add a painting" + "Add new painting" (one button, no double header).
- [x] Top nav "← Gallery" IS the leave button: clears the browser token, goes home.

## Cards (final set: info, Add, views, banner — whitespace separates them)
- [x] Add card is half-width on desktop. Collection blurb card is half-width too.
- [x] Merge Inquiries + Ship it + Advanced + the collection link into ONE info card.
- [x] Collection blurb rewritten for mom, not customers. Publishing note moves to the Add card.
- [x] "Settings" renamed "Advanced", marker is `>` that turns down when open.
- [x] Hide any flag that is off (Shippo off / Stripe off = no line at all).
- [x] Views card hidden when there is nothing to show; otherwise bar chart per painting.
- [x] Delete the "Done for now" card (leave lives in the nav now).

## Words
- [x] One name rule: the site is the Gallery, the section is the Collection.
- [x] No "AR" for mom or buyers — say "wall preview" everywhere people read.
- [x] Token talk hidden: mom signs in (email code) and out, never handles a token.

## Add form
- [x] File picker is narrower, mouse turns to a finger over it.
- [x] Turn/rotate buttons hidden until a photo is loaded (same as Try-it row).
- [x] Uploads testable in dev: `.dev.vars` sample file + README note.

## Routing (the real bugs)
- [x] Studio code runs on EVERY visit, not just full loads (this is why lists
      stuck on "Loading..." and buttons died after clicking around).
- [x] Delete `src/pages/admin/gallery.astro`. Collection card links to the
      public gallery, which follows mom's login automatically.
- [x] Delete `src/layouts/Cart.astro` (leftover, nothing uses it).

## Links
- [x] Every studio link animates on hover (collection link, Chit Chats, Pirate Ship).
- [x] No browser-blue links anywhere, visited or not.

## Proof (every step)
- [x] Playwright visits every changed route; buttons get clicked, not just seen.
- [x] Screenshots at phone + desktop widths before calling a visual done.
- [x] typecheck, unit tests, inline guard, build, full suite — all green.

## Code review (studio surface + outbox)
- [x] Publish resets the photo from memory (a second Save can't reuse it).
- [x] iPhone offline inquiries flush on reconnect (`armOutboxFlush` wired in,
      single-flight guards so a replay can't send twice).
- [x] Collection server failure says so with Retry out (no live-site runaround).
- [x] Card preview hides its image until a photo arrives.
- [x] API client names the status on non-JSON errors; photo fetch shares auth.
- [x] Removed dead code: `BANNER_DURATIONS`, unused admin CSS, one-click post
      button + client (share kit is the posting path; endpoint stays dormant).
- [x] Tests: publish reset, offline queue + reconnect send, 500 copy, hidden
      preview image, banner lifetimes; smoke follows the new copy.
- [x] Full suite 63/63, unit 48/48, typecheck + inline + build green.
