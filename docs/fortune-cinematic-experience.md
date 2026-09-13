# Fortune cinematic experience

## Product direction
The existing 29 local fortune experiences now share an editorial, webtoon-inspired presentation. The concept is “나의 다음 장면”: a reading is an invitation to create, not a predetermined outcome. This change upgrades interaction and presentation, not the accuracy or scope of the underlying fortune calculations.

## Research, reviewed 2026-09-13
- Forceteller publisher listing: https://play.google.com/store/apps/details?hl=ko&id=com.un7qi3.forceteller — topic-based discovery, daily readings and calendar depth informed the entry points. Its predictive marketing claims and paid/content-volume model are not adopted.
- Labyrinthos: https://labyrinthos.co/ and https://play.google.com/store/apps/details?hl=en&id=com.labyrinthos.app — self-discovery, card meanings, spreads and reading reflection informed the selectable deck and journal journey. No artwork, characters or proprietary interpretation text was copied.
- W3C C39: https://www.w3.org/WAI/WCAG22/Techniques/css/C39 — respects the OS reduced-motion preference. Native buttons/radios, named controls and focus handoff accompany the visuals; this is not a claim of complete WCAG certification.

## Implemented experience
- Original inline SVG moonlit observatory and cat guide; four topic palettes, comic borders, halftone paper, caption and speech-bubble treatment. No remote image or font requests.
- Four self-selected intents recommend real existing routes. Selecting an experience compacts the hero so input and results remain close to the top.
- Explicit 22-card selection, shuffle, horizontal scroll-snap and native radio keyboard behavior. Shuffling changes the order only, clears the selection and never changes the meaning of a numbered choice. One choice determines a three-card spread as before; this is explained before selection.
- Comic reader preserves every section, body and item from the existing result. Previous/next, numbered scene navigation, arrow/Home/End keyboard controls on navigation buttons, horizontal touch gestures and optional scene transitions are provided. No autoplay, looping decoration, speech or forced audio.
- Full report mode retains charts, element percentages, calendars, terms, trend details and complete tarot spreads. Calendar-heavy results default to report mode; other results default to comic mode. Computations are unchanged.
- Contextual three-step drawing missions, local checklist, explicit mission copy and the existing studio route. The mission is not silently imported into a document.
- Explicit sanitized text copy and native share with a manual text fallback on denied clipboard permissions. Share cancellation does not copy or publish anything. Existing core sanitizer excludes birth dates/times, dream input, charts and numerology derivation.
- Color HEX copy, dream-symbol input helpers, non-input experience preludes and notebook scroll/focus handoff.
- All input changes invalidate in-flight readings so an older asynchronous result cannot overwrite a changed form.

## Boundaries and privacy
No new dependencies, paid APIs, network services, account requirements or database migrations. Existing `?content=character` API-backed behavior is untouched. Birth/partner/dream input remains session-only; checklist state is not persisted. A user must explicitly save a sanitized reading to the existing bounded notebook. See `fortune-observatory.md` for the unchanged calendar range, unknown-time handling, approximations and entertainment disclaimer.

## Validation
- 120 tests across six files passed, including all 29 reading-to-comic mappings, shuffled-deck identity, complete section retention, keyboard navigation, explicit selection, clipboard denial and native share cancellation.
- Root web TypeScript check passed with the project's 8 GiB Node heap setting. An initial 6 GiB attempt exhausted its heap; no compiler diagnostic was suppressed.
- Strict lint of changed source/tests and architecture validation passed.
- Existing fortune browser smoke passed with fortune API requests blocked and no page errors.
- New cinematic browser smoke passed: landing/tarot/dream results at 320, 390, 768 and 1440 px without horizontal overflow; mood navigation; keyboard/touch reading; reduced motion; three-card report; mission checklist; clipboard fallback; explicit notebook save/focus; palette actions. No page errors recorded. Screenshots were visually reviewed.
- Production Vite bundle build passed. Existing third-party wasm-vips direct-eval and three-vrm/three WebGPU export warnings remain unrelated to this presentation change.

## Reproduce
```sh
pnpm exec eslint apps/web/src/domains/fortune/FortuneStoryReader.tsx apps/web/src/domains/fortune/FortuneReadingTools.tsx apps/web/src/domains/fortune/FortuneInteractiveDeck.tsx apps/web/src/domains/fortune/FortuneStoryPortal.tsx apps/web/src/domains/fortune/FortuneSceneArt.tsx apps/web/src/domains/fortune/fortune-cinematic-model.ts apps/web/src/domains/fortune/fortune-sharing.ts --max-warnings=0
pnpm exec vitest run --maxWorkers=1 packages/core/src/fortune/fortune-observatory.test.ts packages/core/src/fortune/fortune-engine.security.test.ts apps/api/src/modules/fortune/fortune.controller.test.ts apps/web/src/domains/fortune/fortune-observatory-storage.test.ts apps/web/src/domains/fortune/fortune-cinematic-model.test.ts apps/web/src/domains/fortune/FortuneCinematic.test.tsx
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc -p tsconfig.json --pretty false --incremental false
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vite build
pnpm exec vite --host 127.0.0.1 --port 5298 --strictPort
# In another terminal:
FORTUNE_BASE_URL=http://127.0.0.1:5298 node e2e/fortune-observatory-smoke.mjs
FORTUNE_BASE_URL=http://127.0.0.1:5298 node e2e/fortune-cinematic-smoke.mjs
```
Both browser scripts accept `FORTUNE_EVIDENCE_DIR` and `FORTUNE_CHROME_PATH`. The new script emits a JSON result and desktop/mobile screenshots. Local validation used installed binaries directly in an isolated dependency overlay to avoid modifying another active worktree's modules. No dependency or lockfile changes are part of this feature.
