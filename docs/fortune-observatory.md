# Fortune Observatory / 운세 관측소

## Scope
`/fortune` now exposes 29 browsable experiences with Korean search, category filters, favorites, a local text notebook, and a dedicated `?content=<id>` route. Existing character webtoon fortune remains available at `?content=character`; its six existing API-backed experiences, recommendations, narration, and sharing are retained. New observatory experiences run in the browser without an AI provider, API key, database, or registration. This is not an offline-install guarantee: the page/code must first load. Existing character APIs retain their existing server/provider behavior.

## Calculation contract
- Supported civil dates: 1900-01-01 through 2050-12-31. Korean lunar input uses `korean-lunar-calendar@0.4.0`, including explicit intercalary-month validation. Chinese lunar dates are not substituted for Korean dates.
- Solar-term instants use `lunar-typescript@1.8.6`. Its UTC+08 wall clock is converted to an instant and then shown in KST (UTC+09). Exact year/month pillars are evaluated at that instant, using ipchun and monthly jie boundaries.
- The day pillar uses the input Korean civil date, not the library's Chinese civil date. Hour branches start at 23:00; the user explicitly chooses midnight or 23:00 day rollover. No undocumented 30-minute offset is imposed.
- Unknown birth time does NOT produce an invented hour pillar. A backward-compatible empty hour-pillar sentinel is returned and excluded from element counts. Noon is used only for unresolved year/month boundaries and a warning appears on a jie day. Element ratios use largest remainders to sum to 100.
- Standard KST is assumed even for historical dates. Birthplace, true-solar-time, historical timezone changes and daylight-saving corrections are not implemented. Results near boundaries can differ from other schools/calculators. This is not a certified KASI ephemeris.
- Stem ten-gods use five-element direction AND polarity. Hidden stems are a conventional reference list. No definitive useful-god, strength, health, fate or personality diagnosis is offered.
- Daewoon direction is user-selected, NOT inferred from sex. Approximate starting age uses time to the adjacent jie, three days per year; subsequent pillars proceed from the month pillar in 10-year intervals. Approximation and unknown-time caveats remain visible.
- Period charts are editorial content indices derived from a deterministic seed and day-pillar keywords, not probabilities or auspicious-day recommendations. Yearly monthly samples use each month's 15th day and are not represented as traditional monthly luck. Tarot defaults to the existing 22 major arcana, with an optional 78-card daily deck and original Korean creative prompts. Reference date, deck and position determine a replayable result; three cards are unique.

## Privacy and accessibility
Birth dates, times, partners and dream text are session-only in the new observatory. Favorites store IDs only. The user must press `해석 보관` to save a public-text interpretation; dates/times of birth, dream original, raw charts and numerology derivation are excluded. The notebook is bounded to 12 entries, handles unavailable/corrupt storage, and provides per-item and full deletion. Existing character store data is separate and not silently erased. Shared navigation contains the experience ID only.
Visible Korean labels, keyboard controls, focus indication, explicit result headings, numerical element labels, selectable calendar days, responsive layouts and reduced-motion fallbacks accompany visual presentation. No continuous decorative animation is required. Medical, financial, hiring and relationship decisions are explicitly excluded from the interpretation's purpose.

## Sources and licenses
- Korean lunar conversion (MIT): https://github.com/usingsky/korean_lunar_calendar_js
- Solar terms (MIT): https://github.com/6tail/lunar-typescript and https://6tail.cn/calendar/api.html

## Reproducing validation
```sh
pnpm exec vitest run packages/core/src/fortune/fortune-observatory.test.ts packages/core/src/fortune/fortune-engine.security.test.ts apps/api/src/modules/fortune/fortune.controller.test.ts apps/web/src/domains/fortune/fortune-observatory-storage.test.ts
pnpm exec tsc -p tsconfig.json --pretty false
pnpm exec vite build
pnpm run validate:architecture
pnpm run audit:security
pnpm run audit:licenses
# Start Vite in a separate terminal, then run the browser smoke:
pnpm exec vite --host 127.0.0.1 --port 5197 --strictPort
node e2e/fortune-observatory-smoke.mjs
```
Browser smoke accepts `FORTUNE_BASE_URL`, `FORTUNE_EVIDENCE_DIR`, and optional `FORTUNE_CHROME_PATH`. It uses an installed macOS Chrome when available, otherwise the Playwright-installed Chromium. Screenshots and a JSON summary go to the OS temp directory by default and are not tracked in Git.

Validated on 2026-09-13: 77 tests in four files passed; web typecheck, production Vite build, architecture validation, security audit, and license audit passed. The browser smoke aborts fortune API calls and verifies invalid-date rejection, unknown-time chart rendering, explicit notebook saving without birth dates, leap-day calendar selection, partner comparison, three-card selection, notebook deletion, and landing-page overflow at 320/390/768/1440 px. No browser page errors were recorded. Existing unrelated wasm-vips/three-vrm bundler warnings remain outside this feature's scope.

## Optional external enrichment
See [the enrichment runbook](fortune-api-enrichment.md). Optional calendar verification and horoscope originals are explicit actions, do not replace the local result, and default to disabled until server configuration and rights checks are complete. Existing local experiences remain usable without these providers.
