# Virtual Studio continuation acceptance — 2026-09-20

Status: **current implementation and bounded local verification; migration to main pending final CI**.
This is a continuation of the Living World work, not a declaration that every requirement in the
[complete benchmark and original-design ledger](virtual-studio-benchmark-20260920.md) is finished.
Source/tests remain authoritative. Production deployment, external storage provisioning, database
migration, external invitations, physical camera/microphone capture and paid services were not part
of this verification.

## Implemented paths

- Four existing character identities have 24 unchanged generated RGBA PNG sheets: four directional
  walk sheets plus directional held wave/sit sheets per character, 96 drawings. Walking follows
  actual traveled distance. These are four key poses per direction, not eight manually drawn
  in-betweens or multi-frame action clips. See the [provenance record](virtual-studio-drawn-character-provenance-20260920.md).
- Lazy texture requests prioritize the visible direction/action and share decoded textures.
  Scene generations prevent late loads from attaching to departed entities. The stable `skinKey`,
  `registryRevision` and clip intersection contract preserves character identity across reordered
  registries and exposes older/unsupported character fallbacks in the teammate card.
- Authored sofa slots have separate physical approach points and rendered hip attachments. A
  bounded validated polygon repeats the same clean plate to occlude seated feet. Labels follow
  the rendered actor; visual attachment does not move the authoritative floor position. Occupancy
  still requires the existing room coordinator's grant, epoch and lease. Local-only mode cannot
  claim a shared seat.
- Targeted greetings use acknowledgement and bounded expiry/cooldown; a third participant is not
  a recipient. Per-session blocking ends associated activity/media and fences delayed packets.
- Two-to-four-person conversations require each exact member's acceptance. An accepted immutable
  roster cannot silently expand or replace members; leaving ends that roster. Focus/away,
  disconnect and explicit world transitions clean up membership/media. Ordinary tab blur cancels
  unfinished invitations and movement/follow but preserves an already accepted conversation.
- Replayable onboarding and Korean/English room/person/tool search expose existing Studio routes
  and safe movement. They do not start media, AI or server mutations automatically.
- An explicit editor command compares the saved CreatorWork and runtime projection, uses the
  existing save flow when needed, captures all pages and creates an immutable pinned review via
  the existing ProjectGraph authority. Cancellation/retry preserves intent identity; uncertain
  mutations are not resubmitted automatically. Pixel decoding and fresh server PNG encoding occur
  in bounded workers. Identical pages remain separate ordinals. No image downscaling is used.
- Invitations carry the exact project/work/artifact/review/revision/hash identity. New invitations
  require an open review; approved history remains readable with current ACL and the same pin.
  Private preview responses bind the work's active object ownership and short-lived signed URLs.
  The panel removes expired, hidden, revoked or superseded private content. Account changes
  invalidate the old view, drafts and pending writes, including auth-store changes before React
  publishes the new session. Same-account session renewal preserves drafts, retry identities and
  selected workflow state within the existing permission lease. Returning from a hidden tab or
  revoked view releases obsolete busy state without replaying a pending mutation.
- Required/recommended/note comments, explicit saved-resolution selection, reopen, changes-requested
  decisions and a separate approval confirmation use existing review authority. Every mutation
  checks current access and review state. A review decision does not publish the work or advance
  `artifact.approvedRevisionId`.
- Review/comment locking prevents approval from racing a newly created/reopened required note.
  Producer work access is re-read after acquiring the work lock, so queued requests cannot reuse
  revoked membership. Whole-work deletion removes restricted graph dependencies within the
  existing authorized transaction and preserves rollback behavior.

## Reproducible verification and limits

The owned development server is port 5247 in the `virtual-studio-living-world` worktree. Browser
scripts attest the listening process's working directory before running. Generated evidence stays
in `.qa/virtual-studio-runtime-acceptance/` and is not committed.

| Evidence | Verified result | Limit |
| --- | --- | --- |
| Latest web integration portfolio | 56 files, 686 tests passed across the main 54-file run and two supplemental transport suites; same-account renewal, account change, hidden-view save races and stable character thumbnails are included | Targeted Virtual Studio/review/Huddle/transport/storage-boundary portfolio, not the entire repository |
| Review API focused tests | 84 tests passed, including actual Nest feature-module dependency construction | Module construction does not start a production API or external storage |
| Latest-main graph integration | 68 tests passed across 10 graph suites, including both actual Nest module construction regressions | The 18 PostgreSQL cases are skipped in this no-database run and verified separately by the dedicated database gate below |
| Dedicated PostgreSQL gate | 18 tests passed across producer and review-race suites in a fresh PostgreSQL 16 database with full existing 0064 and 0077 SQL | Disposable localhost container; no production migration or production data |
| Database bootstrap guard | Empty schema prepared with 12 Studio triggers; an existing 157-table target was rejected without reset | Only explicitly named loopback test/integration databases accepted |
| Product runtime acceptance | 15 checks passed: desktop keyboard/input focus, mobile native touch, collision, portals, reliable consent, world mismatch, four-person media, repeated mount and failed-asset recovery | Local Chromium; simulated gamepad, no production admission |
| Production artifacts | API build and import/runtime guards passed; Vite web build and static CSP passed; Studio bundle structural check passed | Build artifacts remain local. The bundle checker labels its older startup measurements as stale; they are not new runtime performance evidence |
| Four-person RTC harness | 5 logical identities, 4 consenting members, 6 media edges, 12 decoded directions with 85 decoded frames in the final runtime run, outsider media edges 0; generated streams stopped on leave | One Chromium, native loopback RTCPeerConnections and generated canvas tracks; not WAN/NAT or physical devices |
| Pinned review browser journey | Real React components and client parsers: required note → explicit saved resolution → confirmation → approval → readable history → ACL revoke removes image/notes; width 390 without overflow; page errors 0 | Intercepted HTTP fixtures and an existing character image as a test page; not real production authentication/storage |
| CI contract tests | 58 tests passed after latest main integration with the new required database lane retained in `core`; an actual temporary Git checkout verifies that foundation alone restores its three required art packs | GitHub execution and merge state are recorded separately after push |

The CI `database` job provisions PostgreSQL 16 on a standard Ubuntu runner, installs the current
locked dependencies, prepares only a fresh test schema, and runs both real integration suites.
`core` requires its success in addition to every previous mandatory lane. The preparation helper
requires Drizzle's positive completion receipt because the CLI can exit zero after logging SQL
errors. Existing database triggers are applied to the fixture; no new migration is introduced.

## Integration repairs found by GitHub checks

The first PR run exposed an over-budget Host file and existing verification assumptions that
no longer matched the integrated application. Capture context and navigation were extracted
into focused modules without raising the Host ceiling. Nine related suites / 75 tests passed,
including pending-stroke durability and navigation guards. A new production build, its full
Web type check, static CSP and bundle structure checks also passed locally.

The menu fix keeps horizontal layout changes from opening a different group under a stationary
pointer and sends authored fallback text through the translation resolver. Regression tests
exercise actual pointer movement and missing translations. The menu verifier now adds the
specialized tools through More and checks all 13 retained tools against the current eight-tool
default; its desktop settings flow uses the actual desktop floating window.
The complete production-preview menu verifier passed all primary menus, AI entry, platform
resize/undo, the 13-tool rail, popovers, docking and drawing-time hide/restore. Launcher checks
measure opacity, pointer access, inertness and accessibility hiding rather than treating a
fully transparent element as visible merely because Playwright reports a layout box.

Sparse checkouts include the exact fault-matrix and world-metadata files consumed by their
checks. The product shard's 31 static suites / 290 tests and the dedicated two PostgreSQL suites /
18 tests form the same 33-suite coverage without running database suites in an unprepared static
job. The 3D shard passed 30 suites / 329 tests. Feedback verification now prepares its existing
shared ACL dependencies in its disposable database; both runs passed all 13 scenarios. These
local results do not imply that the repaired commit's GitHub checks or main merge have finished.

Both full-suite workflows provision their own disposable PostgreSQL 16 database and the actual
zsh interpreter used by shell regressions. The existing bootstrap applies the complete migration
ledger and separates the runtime role. The full-suite wrapper serializes all 14 database files,
then executes the unchanged remainder and performance entrypoint. Actual Vitest collection
verified the exact 4,612-file union (14 database + 4,598 remaining, no overlap). The first phase
passed 188 database tests and the marketplace database verifier. The remaining run completed
52,238 tests with no failed assertions, 38 existing skipped tests, and two module-collection
failures. Both failures were reproduced with native Node: `createRequire` anchored at a pnpm
symlink could not find the real consumer's transitive dependency. Anchoring at `realpathSync`
resolved both dependencies, and their seven focused tests passed. The complete run was still a
failure; these focused repairs are not relabeled as a new full-suite pass. Performance and the
next exact-commit GitHub run remain pending. The runner, workflow and shell checks passed 88 tests.

The filter browser survey passed 49 filters across three repetitions (147 apply/undo checks).
Its later direct-image failure was isolated to selection chrome and a verifier Escape action
that cleared the selected image. The repaired representative run passed all seven scenarios,
including an explicitly asserted image target, 113,817 changed pixels after apply and zero
residual pixels after undo across the unchanged 179,790-pixel crop. Static-preview readiness
errors are classified only for the spawned loopback origin's exact optional API path; unrelated
assets, origins and paths still fail. Browser and response error counts were zero.

The full shapes stage passed with live stage coordinates, explicit first-endpoint identity,
unchanged other control points and the existing 15-degree tolerance. Undo/redo, source metadata,
cold restoration, narrow-screen controls and zoom/rotation checks passed. Durability verification
recognizes the current automatic restore and the existing explicit fallback, and additionally
requires the at-risk stroke to repaint all three measured route segments. Its real run preserved
both strokes and their metadata, with automatic recovery, three visible segments and zero errors.

Useful commands, with an explicitly owned dev origin and disposable database variables:

```sh
pnpm exec vitest run apps/web/src/domains/creator/virtual-space apps/web/src/domains/creator/review-capture
pnpm run verify:studio-virtual-art
node scripts/verify-virtual-studio-review.mjs
node scripts/validate-virtual-studio-runtime.mjs
node scripts/prepare-studio-review-test-db.mjs
pnpm exec vitest run --no-file-parallelism apps/api/src/modules/studio-project-graph/studio-review-preview-producer.integration.test.ts apps/api/src/modules/studio-project-graph/studio-project-graph-review-race.integration.test.ts
```

## Remaining completion ledger

This batch materially advances B02/B03/B06/B07/B09/B10/B13/B14/B15/B18/B20 and the review portions
of E01/E04/E19/E23. Those identifiers are not all marked complete: furniture movement/publish,
shared private doors and acoustic boundaries, full NPC anchor lifecycles, more authored action
clips, cut-level annotations, two-version comparison/follow-view, durable asynchronous handoff,
team templates/toolkits and the other expanded design paths still require implementation or
integration evidence. Twenty-minute 8/16/24-presence and media measurements, multiple actual
browsers/devices/NATs and manual screen-reader acceptance remain unverified. Local fixtures are
not promoted into those claims. The production P2P overlay currently admits at most eight remote
peers per client; the presence store's 24-entry bound does not establish 24-person product
admission. Larger direct-controller fixtures must be labeled as stress profiles until admission,
transport topology and resource measurements are integrated and verified. Conditional public ecosystems, large broadcasts and social 3D
retain the original design's conditions and do not authorize deployment or new paid infrastructure.
