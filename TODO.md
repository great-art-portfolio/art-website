# Admin + painting fixes — everything from the review, in plain words

(Card means card. Nothing here should need asking again.)

## Studio page header
- [ ] Delete the "ARTIST STUDIO" eyebrow and the "Good evening." line.
- [ ] Merge "Add a painting" + "Add new painting" (one button, no double header).
- [ ] Top nav "← Gallery" IS the leave button: clears the browser token, goes home.

## Cards (final set: info, Add, views, banner — whitespace separates them)
- [ ] Add card is half-width on desktop. Collection blurb card is half-width too.
- [ ] Merge Inquiries + Ship it + Advanced + the collection link into ONE info card.
- [ ] Collection blurb rewritten for mom, not customers. Publishing note moves to the Add card.
- [ ] "Settings" renamed "Advanced", marker is `>` that turns down when open.
- [ ] Hide any flag that is off (Shippo off / Stripe off = no line at all).
- [ ] Views card hidden when there is nothing to show; otherwise bar chart per painting.
- [ ] Delete the "Done for now" card (leave lives in the nav now).

## Words
- [ ] One name rule: the site is the Gallery, the section is the Collection.
- [ ] No "AR" for mom or buyers — say "wall preview" everywhere people read.
- [ ] Token talk hidden: mom signs in (email code) and out, never handles a token.

## Add form
- [ ] File picker is narrower, mouse turns to a finger over it.
- [ ] Turn/rotate buttons hidden until a photo is loaded (same as Try-it row).
- [ ] Uploads testable in dev: `.dev.vars` sample file + README note.

## Routing (the real bugs)
- [ ] Studio code runs on EVERY visit, not just full loads (this is why lists
      stuck on "Loading..." and buttons died after clicking around).
- [ ] Delete `src/pages/admin/gallery.astro`. Collection card links to the
      public gallery, which follows mom's login automatically.
- [ ] Delete `src/layouts/Cart.astro` (leftover, nothing uses it).

## Links
- [ ] Every studio link animates on hover (collection link, Chit Chats, Pirate Ship).
- [ ] No browser-blue links anywhere, visited or not.

## Proof (every step)
- [ ] Playwright visits every changed route; buttons get clicked, not just seen.
- [ ] Screenshots at phone + desktop widths before calling a visual done.
- [ ] typecheck, unit tests, inline guard, build, full suite — all green.
