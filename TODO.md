# Studio polish backlog (mirrors the running todo list — pick up here after a crash)

Done, committed:
- Doubled focus ring on Add painting inputs is one accent outline (admin.astro + [id].astro twins for script-built fields).
- "Open the collection" blue link: script-injected links miss Astro scope attrs, so a :global twin styles them.
- Collection/stats rows capped at 32rem on desktop (was 40rem).
- Advanced summary in Good to know has 1.5rem top margin.
- All link underline fades 0.25s -> 0.12s (Layout, Gallery, admin, painting page).
- 3D slot prepopulated under the photo with wait text; still auto-builds on upload/rotate/dims; f-ar recheck restores the slot.
- Nav "Add painting" opens the form (or scrolls when open); admin wordmark links to /admin.
- Add form arrives as one calm expand+fade; closing reverses it (no stagger, no snap).
- Dev Collection list supports practice edits + two-tap deletes in memory; reload restores repo state. Baked JSON carries alt/description/dims.
- Error toasts (studio + painting edit panel) clear after 6s; each new message restarts the clock.

Still human-gated (not code):
- Push to main for CI.
- Real upload test on barbart.ca/admin.

Notes that bit us:
- Port 4331 serves dist/ via workerd (predev builds). Rebuild after every change or the browser shows stale CSS.
- dataset["local-edit"] is undefined — data-local-edit reads as dataset.localEdit.
- check:inline covers inline scripts; typecheck + unit + full Playwright before every commit.
