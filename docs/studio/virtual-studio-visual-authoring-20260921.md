# Virtual Studio visual authoring — 2026-09-21

Status: implemented; final merge verification pending. Base main: 48a822a3c504398f11f9f221f867da5cab8347b2.

## Actual product paths

The existing World Authoring panel now includes direct layout editing, purpose starters, reusable packages and explicit-use action rules. Original form editing, local drafts, Tiled/JSON, history and publication remain.

Direct editing supports image props, tool anchors, collision areas, spawns and portals. Mouse/touch drag is a local preview until release; accepted movement is one undoable edit. Snap, zoom, keyboard nudge, movement buttons, multi-selection alignment, duplication and standalone image sizing/rotation share immutable commands. Exact colliders and same-ID tool anchors move together; duplication preserves the corresponding confirmation rule.

Background-painted furniture is not movable. Collider-bearing props cannot be automatically resized or rotated. Unknown image dimensions are shown as anchor markers. Nearby seats and NPCs are not inferred as prop children. Local locks and selection groups are editing controls, not new shared permissions.

Solo, small-team and review-first starters preserve original artwork and tools, vary safe spawns/NPC composition and require a separate replacement confirmation. Existing private/door boundaries must remain unchanged. No selection automatically publishes or changes a document.

Reusable data-only packages include canonical manifest SHA256, exact image digests, byte sizes, MIME types and an author-provided usage statement. The statement is not a software-verified license. Parsing contacts no asset host; explicit verification reads the displayed locations. Streaming budgets are 32MiB/image, 128MiB/world and 64 distinct images. Existing image-header inspectors check MIME and dimensions before decode: 16,777,216 pixels/image, 67,108,864 pixels/world; static JPEG/WebP structural checks are retained. Verified PNG/JPEG/WebP bytes are decoded through local object URLs. Cancellation, timeout and failure retain the original draft. Explicit unpinning enables deliberate asset replacement without altering published history.

No-code rules run only after an explicit tool-anchor action and a separate confirmation. Activity conditions and target actions use existing enums. No arbitrary script, automatic media, external job, payment, sharing or permission change executes. Escape, cancellation, hiding, world/activity changes and duplicate confirmation are handled. Ordinary tool menus remain available; these rules are not access control.

## Evidence

New model/component tests cover 56 cases, included in the larger virtual-space regression: 72 files / 737 tests passed before the final lazy-mount optimization. Web/API type checks passed. Final exact-head checks are attached to the PR.

A fresh PostgreSQL16 container, toonstudio-world-authoring-test-20260921, binds only to 127.0.0.1:32773. The existing guarded initializer installed 12 real graph invariants. World/session authority: 2 files / 68 tests passed, including legacy receipt preservation, new-field persistence/replay and invalid-schema rejection before writes. No production database is used.

Actual UI and repository image bytes at 1440/390/320px passed mouse/native-touch movement, release-only commit, Escape, Undo, multi-alignment, locking, painted-background restrictions, rule confirmation/blocking, staged templates and package export/import. Automated WCAG2A/AA checks: zero violations; no page errors/viewport overflow. These use a synthetic world and block API writes, not authenticated publication or WAN media. Evidence: /tmp/toon-world-authoring-browser-final/.

## Scope and release

User requested main merge, not deployment. No migration, production credentials/configuration, infrastructure or paid provider change. Future deployment must update API readers before Web can publish the optional assetIntegrity/interactionRules fields. Legacy fields remain absent and hashes are not rewritten. Older API versions reject new manifests; coordinate any rollback.

This is not a declaration that all original 30 design items are complete. External pinned guest permissions, recording retention, native 3D scene/camera synchronization, verified AI execution evidence, approved public showcases, new all-skin action art and full device/WAN/scale certification remain separate. Arbitrary structural-rig rotation and a hosted package marketplace are also not claimed. Issue #1905 stays open for exhaustive verification not established by these focused results.

Continuation review also clears index-addressed selections when an external world or Undo replaces geometry, avoiding edits against a newly indexed entity. The browser workflow explicitly reselects after Undo; all previous movement and lock assertions remain. Final CI and merge identifiers are recorded in the pull request.

## Bundle and deferred loading follow-up

The first integrated bundle exceeded the existing post-shell Studio budget by approximately0.7KiB raw/0.4KiB gzip. No budget or baseline was raised. Browser-only reusable-package metadata now lives under the Web authoring domain rather than the shared publication schema. The actual authoring screen loads only in authoring mode through a retryable lazy boundary, with an unchanged parent draft after load failure or scope replacement. Normal live-world visits do not load authoring/template code. The fixture uses this same lazy entry. New tests cover source import boundaries, an explicit retry, disabled editing and a late result from an old work.

The lazy authoring split alone did not fix the editor-size regression: manifest traversal showed that the drawing editor pulled the format-gateway root barrel through the graph compatibility DTO. The final correction introduces a focused compatibility-report export and moves the already-asynchronous Krita bundle parser behind the explicit import request. This preserves the exact mapper, errors, rights/unsupported ledger and commit semantics. Import behavior and new eager-boundary regressions are tested; no source feature, test or bundle threshold is removed.

An additional real-browser network-failure injection showed that the browser may cache a failed ES module, so recreating only React.lazy is insufficient in that case. The error surface now also offers an explicit save-and-reload operation using the existing world draft store. It reads the saved draft back, checks the exact publication base and manifest, and refuses to reload if storage cannot be verified. This is a local draft operation, not server publication. The fixture restores this same local draft after a document reload. Tests do not count the failed retry-only attempt as a pass.
