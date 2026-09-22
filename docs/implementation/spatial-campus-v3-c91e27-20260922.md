# Spatial campus v3 — isolated implementation

Base: `84aa2f6a72f04ff808ffcdae26283135657c7d71`.
Branch: `feat/spatial-campus-v3-c91e27-20260922`.
Status: verified integration checkpoint; full v3 acceptance remains incomplete. No deployment or database changes.

## Ownership

This session owns additive `app/spatial-campus`, `shared/lib/spatial-campus`,
`shared/components/spatial-campus`, focused market/fortune presentation adapters,
and narrowly scoped AppShell/WorkspaceTaskFrame integration.

Read-only overlap review found another session modifying manuscript contracts,
API/package manifests, lockfile, migration 0087 and Skia render/canvas packages.
Those files are not owned by this session. PR #1939 owns pinned review sharing;
its server/UI work must not be recreated or implicitly merged here.

The original checkout and every other worktree stay untouched. Dependencies are
installed independently from the frozen lockfile. No shared node_modules links,
process termination, branch reset, forced push, CI bypass or schema migration.

## Acceptance

Record route binding, domain integration, tests, browser evidence and unverified
requirements separately. Existing pages remain the authority for domain writes.
Scene rendering, interest lists and navigation never confer rights or confirm
storage, approvals, purchases or publication.

## Implemented checkpoint — resumed 2026-09-22

- Explicit bindings for **205 registered top-level route IDs** across nine districts,
  checked against the actual route AST. Wildcard router internals are not an exhaustive
  per-page acceptance certificate. Existing URLs, route owners and aliases are retained.
- Campus map, direct place selection and scene/task/focus presentations reuse the existing
  workspace shell. View changes preserve the same child component and domain query values.
- Existing authored art and Phaser runtime are reused as a **shared atelier**, not nine
  newly illustrated rooms. Walking is optional and local-only; no presence/media is opened.
- Market browse exposes bounded public record references in the scene, using the same
  fetched results. This projection does not acquire, install, purchase or mutate a manuscript.
- All **29 registered fortune experiences** have explicit room/category bindings; the legacy
  character entrance remains separate. Existing calculations and result lifetimes are retained.
- Exact allow-listed manuscript return references are tab-scoped, owner-checked and expiring.
  Missing/unsupported references do not silently substitute a different document.
- Scene failures now stay inside a dedicated boundary: no whole-document reload, no task
  remount, one sanitized diagnostic and a same-task recovery action. Lazy rejection is unit-tested.
- Fortune notebook reads/saves/deletes now use account-specific browser keys. Actor changes
  reset ephemeral input and select that actor’s shelf. The pre-existing signed-out device key
  is preserved, not automatically migrated or deleted. This is local UI separation, not
  encryption or a new server authorization system; signed-out legacy notes remain device-shared.

## Verified checkpoint

- Changed-source ESLint: passed, zero warnings.
- Combined relevant regression: **133 files / 1,344 tests passed** in one run (do not add the
  earlier focused counts to this total). Includes app, workspace, market and fortune regressions.
- Chromium development-server matrix: **40 route/viewport cases** (10 routes at widths
  1440, 1024, 390 and 320). No uncaught runtime errors, horizontal document overflow or duplicate
  main landmarks in these cases. Anonymous session and synthetic market records are fixtures;
  remaining API calls deliberately return unavailable. This is not production API acceptance.
- Browser interactions: public record projection; private dream input preserved across all
  three modes without URL/storage leakage; nine-place dialog and Escape; real Phaser startup,
  measured actor movement from keyboard input, canvas disposal on stop and unchanged domain input.
- Architecture and toolchain coverage, Web/API typecheck, production build, generated legal notices, CSP and the unchanged bundle ratchet: passed. The static bundle gate reported zero regressions; its old runtime-startup telemetry was not remeasured.

## Not completed / next work

The whole v3 design is **not** complete. S2–S5 still include district-specific artwork/manifests,
actual domain-object presentation beyond the market projection, the complete typed inventory and
cross-domain apply/receipt paths, trace-practice integration, public-room publishing, media privacy
warnings and end-to-end authorized production/review workflows. Existing implementation in other
sessions must be reconciled, not duplicated.

A nested workbench scroll-restoration module and an additional real-browser scene-import failure
injection were attempted during this continuation but their write requests were rejected before
execution by the connector security check. Neither was applied through another path. Existing
navigation behavior is retained; the new scene-boundary failure tests are React/DOM tests only.
Earlier blocked market-overview and palette-save adapter writes also remain unimplemented.

Physical iOS/Android/pen/IME/screen-reader validation, one-hour soak, real GPU loss/recovery in
this campus adapter, complete route/subrouter coverage and all 32 v3 acceptance gates remain.
Repository-wide CI and production deployment are separate from the checks above.

Concurrent open PR file lists reviewed: #1939 (pinned review), #1949/#1950/#1951 (Skia).
No files from those lists are modified in this checkpoint. A broad all-worktree scan was blocked;
there is no claim of a globally exclusive filesystem lock. The existing dedicated worktree is kept.

## Production-preview follow-up

The first production-preview run completed the 40 route/layout cases, then failed waiting for
`data-local-x`, which the existing Phaser component intentionally emits only in development.
The test was not weakened: the campus adapter now exposes only its existing local position
callback as anonymous x/y diagnostic attributes, and the same >3-pixel movement assertion reads
those attributes in both environments. No engine implementation or private peer data was changed.
The adapter also retains the last local pose when the scene is released offscreen and restored;
a React/DOM regression verifies that resume and observer cleanup.
The rebuilt production-preview rerun is recorded separately after completion.

## Latest-main integration verified

Main `030d53411cbba3a801ae0d86c4fa10c84a40fa17` was merged into this feature branch,
not vice versa. Verified source commit: `9b3f51dd49620b7c3fe97ef66f980de82604f93e`.
There were no merge conflicts. GPU canvas/render/engine files remain byte-identical to that
main; the campus changes stay separate from the accepted GPU implementation.

At this integrated source commit the following passed again:
- 133 relevant test files / 1,344 tests; Web and API typechecks.
- Production build, generated legal notices, CSP, unchanged static bundle ratchet.
- The production-preview version of all 40 route/viewport cases and all four campus
  interaction cases, including measured keyboard movement and preserved private input.
- The existing main-owned `verify-studio-skia-product.mjs` against the same built preview:
  actual local `/studio/canvas`, three pointer strokes, one visible Skia surface, 100% zoom,
  90-degree rotation, existing Undo/Redo and explicit recovery from real GPU context loss.
  Recovery restored identical document pixels; uncaught errors were zero. Observed renderer:
  ANGLE Metal / Apple M2 Max. No authorization/API mock was added to this editor runner.

The editor result is a small local smoke/regression test, not long-session performance,
all-tool support or authenticated multi-user acceptance. Campus API fixtures remain as above.
Logs: `/tmp/toonstudio-campus-c91e27-integrated-{tests,typecheck,build,postbuild,bundle,browser,editor}.log`.
Campus report: `/tmp/toonstudio-campus-c91e27-qa/integrated-preview/report.json`.
Editor report: `artifacts/skia-product/report.json` (generated, not committed).

PR #1952 remains Draft. No main merge of this PR, production deployment, database migration,
engine rewrite, lockfile update or validation-threshold relaxation was performed.

## Spatial follow-up completed on 2026-09-22

The previously uncommitted follow-up was recovered in the same dedicated worktree and committed as
`5384c2286` (`feat(campus): connect spatial objects palettes and practice flows`). This closes the
planned follow-up without creating a second router, editor or persistence authority:

- Nine districts now retain distinct authored artwork while reusing the existing local Phaser
  engine only as an optional presentation surface.
- Market, library, gallery, academy, plaza and authorized production pages publish bounded typed
  display references. Public districts reject a candidate marked `private` even when its URL
  matches a public allow-list.
- Existing project-shell pages publish only the current project id and canonical
  `/studio/p/:projectId/overview` reference as `private` to the atelier boundary. Project
  documents, team members, review state and query data do not cross that seam.
- Fortune can hand only validated HEX colors to the existing Studio SQLite palette authority.
  Context changes abort the handoff instead of committing into a stale project/session.
- Academy `/learn/trace` launches the existing Studio reference canvas with
  `practice=trace`; it does not create another drawing engine or storage format.
- Nested workspace history restores the owned scroll container on browser POP while preserving
  same-route filter position and clearing memory when the signed-in owner scope changes.
- The production browser harness now verifies district artwork, optional-scene chunk failure
  isolation, private form preservation and sanitized failure reporting.

Follow-up verification passed:

- Before the concurrent main advance, changed-file lint, Web/API typechecks, focused regressions and
  the full production build had already completed with exit 0.
- After rebasing without conflicts onto `8d5d8f7d7`, workspace-link verification, Web/API
  typechecks and 9 focused files / 70 tests passed again.
- The rebased source completed a fresh full production build, generated legal notices and static
  CSP verification with exit 0.
- A fresh production preview of that rebased build passed 48 route/viewport cases
  (12 routes x 1440/1024/390/320), with no horizontal overflow, one main landmark and zero page errors.
- The same preview verified nine distinct district artwork surfaces, synthetic public-record
  projection, private fortune input preservation, the native nine-place map dialog, measurable
  Phaser keyboard movement, clean scene unmount and injected CampusRoom chunk-failure isolation.
- Trace-practice browser verification entered the real Studio editor/reference canvas and retained
  the explicit `practice=trace` query with zero runtime errors.

Campus report: `/tmp/toonstudio-campus-c91e27-rebased/report.json`.
Trace artifacts: `/tmp/toonstudio-trace-practice-c91e27-rebased`.

Existing dependency/bundler warnings (`import.meta` in CJS analysis, browser-externalized Node
modules and third-party WASM direct-eval warnings) remain warnings; the verified build completed
successfully.

PR #1952 was merged by a concurrent session at `0c10f9a8d` and its source branch was
deleted. These two follow-up commits were then rebased without conflicts onto the newer
`origin/main` checkpoint `8d5d8f7d7` and moved to
`feat/spatial-campus-v3-followup-20260922`. This follow-up itself has not been merged or
deployed. No database migration, lockfile change, engine rewrite or validation-threshold
relaxation was performed in this follow-up.
