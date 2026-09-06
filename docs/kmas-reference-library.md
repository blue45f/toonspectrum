# KMAS comic reference library

## Product and design

`/references` is a creator's research surface, not another popularity ranking. Search Korean comic/book metadata, inspect the credited creators and publisher, and keep personal notes. The warm-ink/persimmon editorial layout follows DESIGN.md. Three URL-addressable views (`search`, `notes`, `guide`) share a desktop/mobile layout, visible field labels, a keyboard-accessible Radix dialog and reduced-motion support.

- Search fields: title, illustrator, writer, publisher, platform and ISBN.
- Submit-driven requests, explicit page navigation and URL/back-button restoration.
- Real results only. No demonstration catalogue, invented scores, global statistics or artwork downloads.
- Missing metadata remains visibly unavailable. Result order is the provider's order, not popularity.
- Personal notes: max 100 references and 4,000 characters per note, device/browser-local storage only. Markdown export includes attribution. JSON backup/restore is additive, validated, limited to 2 MiB, and never overwrites an existing note. No account synchronisation or automatic Studio import is claimed.
- Synopses and third-party images are not persisted in notes. This interface does not grant artwork reuse rights.

## Official contract and operational setup

Source reviewed: https://www.kmas.or.kr/guide/openapi (2026-09-06).

Use the approved, server-only `KMAS_PRV_KEY` already supported by this repository. Do not create a `VITE_` equivalent or enter the key in the browser. The provider documents an approval process, an application traffic allowance of 1,000/day and a 12-month use period; operators must verify their own approval and usage terms.

`GET /api/kmas/references?field=title&q=...&page=1` calls `/openapi/search/bookAndWebtoonList` through NestJS. The endpoint accepts only three validated public parameters. It preserves the existing adapter's explicit 1-based pagination (the guide lists default 0 but its response examples show 1); verify first/second pages against the approved production account before declaring live acceptance.

Security/reliability: HTTPS host allowlist; redirects rejected; 8-second upstream timeout; bounded 2 MiB response body; safe error codes; no raw upstream errors or credential URLs returned. Identical requests coalesce. A bounded 128-entry, 30-minute server-process cache and 30 new requests/minute/4 concurrent requests cap reduce traffic. These are **per-process safeguards**, not a distributed daily quota guarantee. For horizontally scaled production, monitor the provider allowance and add shared quota accounting before higher-traffic promotion. Cache entries are bounded by 8 MiB in aggregate, evicted by least-recently-used order, and invalidated when the key is removed, restored, changed, or its base URL changes. A generation token prevents an old A→B→A in-flight result from repopulating the new cache. Returned results are cloned to avoid shared-cache mutation. Error exits abort unread upstream bodies.

`KMAS_NOT_CONFIGURED`, `KMAS_RATE_LIMITED`, `KMAS_TIMEOUT`, `KMAS_UNAVAILABLE` and `INVALID_QUERY` each have explicit UI states. Initial navigation and note browsing do not request this upstream API. Other pre-existing application catalogue requests are unchanged.

## Validation

Unit contract tests: `pnpm exec vitest run lib/__tests__/kmas-reference.test.ts lib/__tests__/kmas-reference-hardening.test.ts lib/__tests__/kmas-reference-recovery.test.ts`.

Browser tests: `pnpm exec playwright test --config playwright.references.config.ts`. The suite uses explicitly synthetic API fixtures and tests search submission, history, notes, reload, export, keyboard modal close, unavailable-key handling and narrow-screen overflow. Fixture screenshots are test evidence, not evidence of a live approved KMAS call.

Release acceptance also requires existing repository lint/type/build/test gates. Live KMAS acceptance requires a valid approved key and must not be inferred from successful mocked tests or a successful code merge.


## Notebook consistency and recovery

The production UI calls `mutateReferenceNotes`, not the legacy whole-document writer. Every operation reads the current v1 document, compares the editor's baseline where necessary, and writes its result synchronously inside the origin's named Web Lock. Independent additions merge. Stale saves and deletion confirmations return a conflict without overwriting stored bytes. Duplicate bookmark clicks do not erase an existing note. This coordinates participating pages on the same origin; it cannot coordinate an older app version or another script that writes the key without acquiring the same lock.

On quota errors, unsupported locks, damaged storage, or a rejected lock, the UI does not report an optimistic saved result. Draft text stays in the open editor. HTTPS and Web Locks are required for writes; unsupported browsers are read/export-only. Closing a dirty detail dialog or unloading the page requests confirmation. This does not claim protection for every possible SPA history/unmount transition.

The editor displays a changed-note warning and the latest stored note, preserving its original baseline and local draft until the user explicitly reloads it. JSON restore validates the entire input first and adds only missing references. A combined count over 100 rejects the entire restore. Existing notes are preserved even when an imported note with the same ID contains different text. Synopses and unknown fields remain excluded from persistence and exports.

References: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API and https://reactrouter.com/api/hooks/useSearchParams (reviewed 2026-09-06).

## Recovery and deliberate restore (v3)

JSON backups are parsed into an in-page preview before any write. The preview shows new records, existing records retained, existing records with differing notes retained, and resulting note count. Users explicitly confirm additions or cancel. The commit re-reads the latest storage under Web Locks, so another tab's intervening additions remain intact. Over-capacity restores fail atomically.

Unsaved editor text is retained in sessionStorage with its original conflict-detection baseline. A notebook shelf exposes recoverable drafts, including works not yet bookmarked. Reloading or reopening the dialog in the same tab restores text without silently treating it as saved. Draft storage is tab-session recovery only, is not account sync, and is not durable after closing a tab. Browser-created duplicate tabs can initially copy sessionStorage; their subsequent edits are independent. Limits are 20 drafts and 256 KiB UTF-8, with no silent eviction. Failed/corrupt storage is never reported as saved. Saving disables editing during the commit and removes only the submitted draft after success.

Added tests: lib/__tests__/kmas-reference-recovery.test.ts covers preview preservation, stale baselines, storage/size/schema failures, draft cleanup and capacity races. e2e/kmas-references.spec.ts includes explicit restore confirmation, cancellation, reload recovery and cross-tab stale-draft rejection. The workflow runs all three unit-test files before lint/build/browser verification.


## Delivery verification (2026-09-06, revision 3)

- 82 assertions registered as tests passed in the local Node test harness (30 original, 34 hardening, 18 recovery). Only the temporary test copies changed their `vitest` registration import to `node:test`. Production module contents and assertion bodies were unchanged. The three test files and their five imported production modules passed strict TypeScript checking with the available local compiler. This is not a run of the repository's Vitest/TypeScript 6 toolchain.
- 21 TS/TSX files passed a separate syntax-only `transpileModule` check. This is not full frontend/API type checking.
- Installed Chromium started, but navigating to the local harness was blocked with `net::ERR_BLOCKED_BY_ADMINISTRATOR` before any browser assertion ran. No policy was disabled and no alternate local route was tried.
- The React Playwright file defines 13 scenarios, including two viewport variants. None were executed in this environment. The browser harness failure is retained in the verification package; it is not a passing result.
- No complete repository build, ESLint, SonarQube, CI or authenticated live KMAS query was completed.
- All four existing integration files were checked against the observed main commit `dbd5e75a207950b00360516a4353af872ff67e60` and match the patch's original blobs. Patch application and output bytes are verified against an isolated four-file base, not a full repository checkout.
- GitHub accepted two temporary Git trees, including a draft module and the API/contract group. A subsequent source-tree write was blocked by the OpenAI tool security-state check. No source commit or branch-ref update was made, and no PR/main merge/deployment was completed. These unreferenced Git objects do not publish the feature.

The main merge and release gates remain outstanding. Do not infer deployment, browser UI correctness or provider approval from the delivered patch.

## Merge-readiness hardening (2026-09-06)

Conflicting personal notes sharing an ID are now rejected as an ambiguous document, rather than silently retaining only the last row. Identical duplicates still coalesce. Existing ambiguous storage is left untouched, and restore rejects such backups before preview/commit.

Save/import inputs and their optimistic-conflict baselines are cloned before waiting for the cross-tab lock. Later mutations to the caller's object cannot alter the submitted operation. Regression tests are registered in both the normal root suite and the focused workflow.

The local verification runner adapts only Vitest test registration to node:test. It does not replace a full repository install, production build, React typecheck or required GitHub CI. No main merge or production deployment is claimed.
