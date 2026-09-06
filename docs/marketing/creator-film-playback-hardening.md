# Creator homepage follow-up: accessible and resilient brand films

## Changes

- Queue the latest chapter request until native video metadata exists. Clamp invalid or oversized seek times to the actual film duration. Ignore stale play-promise rejections after a newer request, pause, close, or unmount.
- Keep native video controls when playback permission is denied. Real media failures retain the existing retry, transcript, poster and studio entry.
- Move keyboard focus from the disappearing poster/retry control to the native video. Return focus to the poster after closing. Chapter buttons retain focus and indicate the actual current chapter with `aria-current=step`.
- Pause when the document becomes hidden. Returning to the page never automatically resumes playback.
- Provide real same-origin downloads for the already-rendered landscape, portrait and square MP4s. Label these as a silent 24-second Korean-title illustrative film, including in the English interface.
- Improve English narrow-screen headline wrapping, visible focus contrast in the dark film section and mobile download touch targets.

## Verification

`creator-film-playback.test.ts` contains 12 pure native-media control tests. `CreatorBrandFilm.test.tsx` adds three React DOM interaction tests. The normal creator-home job still executes all existing responsive, native-video, footer, language and media-integrity checks, plus the new tests and `scripts/verify-creator-film-upgrades.mjs`.

The additional browser verifier deliberately withholds the MP4 response, selects several chapters before metadata exists, verifies that only the latest choice plays, and checks focus, all three actual browser downloads, and closing before loading. Evidence is saved separately as `film-upgrades.json` and screenshots in the existing artifact directory.

Local pure tests may be run by transpiling these exact TypeScript assertions and replacing only the Vitest describe/it import with node:test; that does not validate React integration or substitute for the full repository CI. A document describing a check is not evidence that its latest CI run passed.

No main-branch protection, required core check, existing studio feature, database, credential or automatic social publishing configuration is changed by this follow-up.

## References

- https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement — metadata, media events and native playback.
- https://playwright.dev/docs/test-assertions — awaited focus and DOM assertions instead of timing races.
