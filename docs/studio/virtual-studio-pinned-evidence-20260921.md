# Virtual Studio pinned evidence — implementation checkpoint

## Scope and status

This change continues VS-23 (asset use/rights evidence) and VS-24 (AI evidence).
It is an implementation draft, not completion of either full backlog item.
The external guest/mentoring/showcase proposal was not applied: the source-write request failed its tool security determination.

Implemented source:
- Authenticated WorkSession evidence GET, using an attested review capture rather than current `creator_work.doc`.
- Current session participation and work membership checked before and after the metadata read.
- Whitelisted asset placement/recorded rights and AI execution metadata; no prompt text, provider request IDs, seeds, pixel payloads, storage locators or upstream error text.
- Unknown commercial usage remains unknown. Stored token counts are not treated as actual billing or independent provider proof.
- On-demand panel, scoped 15-second metadata leases, hidden/logout/session-change invalidation, source-page navigation and explicit AI note citation.
- Durable session history format, collaboration authority, dependency versions, database schema and production configuration are unchanged.

## Observed verification

- Focused projection tests: 16 passed, 1 failed.
- Combined new evidence client plus existing session workflows/resource regressions: 62 passed, 1 failed (5 files).
- Failure: duplicate AI operation identities retain the first record. The regression requires excluding all ambiguous identities.
- The attempted duplicate-ID correction was blocked twice before execution; it remains unfixed in this draft.
- Additional UI-test file creation and direct disposable database probe were also blocked; no real PostgreSQL end-to-end claim is made.
- Workspace dependency links: 22 across 12 packages verified. `git diff --check` passed.
- Typechecking and ESLint were run separately; their final outcomes must be recorded after reading process results.

Do not merge or deploy while the new regression is failing. No test, hook, threshold or permission check was weakened.

## Type and static-check follow-up

`pnpm typecheck` completed with exit code 0 after restoring the actual tracked translation dictionaries, scene manifests and generated Vello bindings required by the sparse worktree.
The initial missing-file errors were not suppressed. Full Web and API typechecking used the existing compiler settings.
The evidence hook was subsequently changed to keep lease invalidation in effects rather than call `Date.now()` during render; a strict ESLint rerun was started.
The new evidence source test remains failing on ambiguous AI identity; do not mistake successful types or existing workflow regressions for release readiness.

## Remaining validation and original backlog

Before main integration: exclude every duplicate operation ID, rerun all evidence tests, add rendered-panel and auth/visibility/late-response hook tests, run actual disposable PostgreSQL capture-to-session authority tests, validate the final production bundle and exact-head CI.
VS-09 audio recording/retention, VS-13/26 isolated external pinned reviewers, VS-21 native scene/camera review, VS-23 complete release rights lineage, VS-24 authoritative provider receipts/input-output change records and VS-27 independent approved publication are not completed by this draft.
No production deployment, database changes, environment configuration changes or protection/CI weakening were performed.


## 2026-09-22 implementation and runtime acceptance follow-up

The prior blocked edits were re-attempted in the following user-authorized continuation and executed normally. The previously failing duplicate-ID test now passes. An oversized (>2,000) source history is not treated as a unique prefix: AI records are withheld and the omitted count is shown. All source evidence remains a projection of the attested immutable review, not a billing or licensing attestation.

Newly reproduced and fixed: clicking a citation after its lease expired but before the timer ran could still write the stale citation. The event handler now checks the lease and requests a fresh read instead. A rendered regression fails before this change and passes after it.

- Full session/evidence/model/DI regression: 17 files / 163 tests passed.
- Actual producer/session PostgreSQL: 2 files / 40 tests passed, including new capture -> invited reader -> live document divergence -> explicit receipt-backed citation -> ACL revocation checks, plus unattested capture denial.
- New disposable database `studio_evidence_integration_20260922`, loopback only; existing guarded schema preparation installed 12 real graph invariants. No production database was accessed.
- Actual Chromium + actual repository/DB runner: 1440, 390 and 320px passed reading/agenda/material workflows and the newly added evidence display and explicit citation. Zero page errors, horizontal overflow and automated WCAG2A/AA violations in that scope. User identities and private object storage remain explicit fixtures, not production login or WAN certification.
- Web/API/owned browser runner typecheck passed. Strict lint passed before the final packaging correction; normal final hooks will rerun checks.
- Production Web bundle compiled. Restoring omitted tracked third_party license documents fixed sparse-checkout notice generation without suppressing it. Static bundle ratchet: 27 within / 10 improved / 0 regressions; after-shell 5952.8KiB raw / 1999.2KiB gzip.
- The full API build then exposed a real defect: `work-session-evidence` was absent from the emitted workspace package exports. Add this exact compiled subpath to the existing runtime staging manifest and its executable package test; do not weaken the import verifier. Final API build result must be recorded after execution.

Concurrency: a separate session merged the narrower duplicate-ID correction as #1932 while this broader work was still being verified. Preserve both its additional tests and these acceptance changes. This follow-up is not an authorization to deploy. Original broad VS-01–30/F01–40 expansion and exhaustive #1905 certification are not closed by the above targeted evidence.


API packaging completion: TypeScript had resolved the package subpath as an external module, so it also needed an exact API `paths` entry to emit its source inside the API output. After adding the exact mapping and runtime export, the unmodified full API build passed all 25 runtime/package smoke tests, workspace staging, emitted-import verification and legal policy verification. `node --check` on the emitted API main succeeded. No compiled output is committed.
