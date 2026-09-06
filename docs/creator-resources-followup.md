# Creator resource hub follow-up

This supplements `creator-resources.md`; backup restore now defaults to merge rather than replacement.

## Follow-up improvements (2026-09-06)

- `GET /api/creator-resources/providers`: fixed three-provider configuration summary. Returns only `provider` and `availability` (`keyless`, `configured`, `not_configured`). Never exposes credentials, environment values, or quotas. Does not call providers or claim they are reachable. The hub and each search page show this distinction before searching.
- The hub now shows a real saved board with title/creator/ISBN keyword search, provider and KST deadline-date filters, newest-added/retrieval-time/title/deadline sorting, individual removal and export of only visible attribution records. Filtering is local to saved records, not a global provider search. A future date is not proof that applications are open.
- Backup merge preserves current work by default; replacement remains explicit. Tests cover repeated merges, Korean whitespace, duplicate records and combined size/count overflow.
- Search requests are cancelled and skipped in saved-only view. Previous result/error state resets cleanly when switching views.
- Upstream HTTP 429/503 responses create a per-host 1–120 second cooldown using bounded `Retry-After` seconds/date parsing. Other providers and valid cached results stay usable. Instance-local limits do not replace distributed quota enforcement.
- Met duplicate IDs are fetched once; negative/non-integer totals never enter the success cache. The browser rejects duplicate cards and contradictory unavailable/not-configured payloads.
- 18 new shared cases complement the original 34 (52 total). `scripts/check-creator-resources.mjs` runs both groups with strict TypeScript. Dedicated Vitest wrappers and the focused CI paths/lint commands include both groups.

Repository merge status and deploy status must be reported independently. The standard merge API reported required `core` status pending; Vercel separately reported a deployment rate limit. No branch protections, required tests, deployment limits or billing settings were changed.

## Verification evidence

- Strict dependency-light TypeScript compile and 52/52 shared cases passed in Node.
- The same 52/52 cases passed in Chromium 144.0.7559.96 using an isolated CommonJS module harness with mocked provider responses. This is **not** a React page rendering, real provider request, or full-app E2E test.
- All 27 TS/TSX files in the source bundle passed syntax checks. This is not the whole-repository typecheck.
- Focused CI action majors now match the existing root CI (`actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`); pnpm is selected from the repository packageManager field rather than a second duplicated version. Existing core/verify gates are unchanged.

Backup merge keeps current records and nonblank story fields; it only adds unseen records, fills blank fields and unions completed checks. An explicit checkbox and confirmation enable complete replacement. Validate the combined 200-resource/200-check/1 MB limits before writing. Existing v1 backups still work. Read-before-write localStorage is not an atomic multi-tab database: simultaneous tab edits can still race, and no account synchronization is claimed.

An unavailable Met response can legitimately carry hasMore=true from a successful ID search even when all detail requests fail. The browser preserves the unavailable status instead of misreporting this as a response-schema error; pagination UI remains hidden while unavailable.
