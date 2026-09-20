# Virtual Studio spatial activity and source-bound review acceptance

Status: **current implementation under integration review**. This continues the original
living-world design and benchmark ledger; it does not replace their remaining work with
the narrower scope of this implementation batch. No production release is authorized.

## Implemented behavior

- NPCs use authored activity anchors with approach, alignment, activity and exit phases.
  The default world has 12 floor work/rest anchors. Human shared review seats are excluded
  from those NPC routines. NPC seating capability was exercised with a dedicated fixture;
  it does not establish shared-seat ownership for NPCs in the default world.
- An explicitly started guide tour uses reachable story, drawing, review and asset stops.
  The guide waits for the user to catch up. Starting, waiting and arriving never moves the
  user's character or launches a tool automatically. Stop, Escape, focus/away mode,
  window blur, backgrounding and world replacement revoke the request. Late status from
  an earlier tour cannot alter a restarted tour. Starting a tour also relinquishes accepted
  avatar-follow ownership and invalidates pending seat approaches, so a delayed release
  cannot restart movement after the user's new choice.
- Conversation admission uses exact authored acoustic geometry, current presence,
  direct connection and the same immutable world binding. Proposal, acceptance, commit
  and active membership each check these conditions. Leaving a zone or losing its binding
  closes the exact Huddle; returning does not revive previous consent. Same-zone distance
  tolerance remains stable under repeated boundary movement and candidate-cache pressure.
- Completed review captures expose a server-derived source map for each immutable preview
  ordinal. This retains the original document revision/digest and page/cut/object identities.
  The server requires a matching completed capture receipt; an ordinary graph operation
  cannot impersonate that receipt. Legacy and ambiguous previews explicitly remain unmapped.
- Reviewers can attach notes to a mapped page, cut, object, point or region. Pointer and
  keyboard percentage entry use the same source validator. A source-bound note preserves
  the graph artifact scope separately. Permission, identity, page or lease changes invalidate
  the placement and retain the draft for an explicit new placement or whole-review choice.
- Comparison discovers accessible snapshots only on request, including closed review history.
  Selecting a comparison reads two exact subjects without changing the editor, original
  review or approval target. Each side has independent pagination. Overlay is available only
  when source page identity and source/render dimensions match. Expired or revoked private
  reads remove the pair. Signed URLs stay in memory and use `no-referrer`.

## Evidence and limits

The source-map contract and SQL validation are documented in
`virtual-studio-spatial-review-contract-20260920.md`. Related unit tests, API type checking,
and an actual local PostgreSQL producer run verify immutable history after the current work
changes. This proves identity and decoded image dimension binding; it does not claim that a
server reconstructs or visually compares every submitted raster to the source document.

Real Phaser Canvas and forced WebGL runs exercised NPC activity, separate floor/hip positions,
guide wait/resume/cancel and six scene recreations without reported browser errors. WebGL
used SwiftShader; this is not a claim about hardware GPU performance. The long crowd check is
a deterministic 20-minute simulation, not a physical-device media soak test.

`scripts/verify-virtual-studio-spatial-review.mjs` checks actual React and client parsers with
intercepted HTTP and decoded synthetic QA pages. It verifies explicit two-version selection,
overlay opacity, independent pages, keyboard Escape/focus restoration, a source-bound cut
comment POST, unchanged editable head, private-content removal, and no horizontal overflow
at 390 pixels. It is not a production authentication or end-to-end object-storage test.
Runtime evidence is written under `.qa/virtual-studio-spatial-review/` and is not committed.

The integration check completed 48 web test files / 499 tests and full Web TypeScript checking.
The later API scope hardening completed 20 focused tests, eight actual PostgreSQL producer
tests, full API TypeScript checking and scoped lint. The browser flow completed 21 fixture
requests, exactly one explicit comment mutation and zero page errors. These are local results;
they do not substitute for the subsequent exact-commit GitHub checks.

Independent review found and reproduced the guide ownership race before the fix. The corrected
Page, Guide and slot-hook regressions passed 45 tests across three files, including both the
visible follow state and a deferred real slot-controller release. Integration of the existing CI
repairs with this batch passed 25 CI routing and sparse-checkout contracts.

## Remaining design work

- Private acoustic zones and zones with doors are unavailable until authoritative door state,
  grants, lease renewal/revocation and compatible participant protocol are implemented.
  Unmapped corridors and entry areas do not implicitly become public conversation zones.
- Default NPC anchors use floor activities; dedicated furniture, broader continuous role
  animations across all character skins, environmental audio and ducking remain separate work.
- Source-aware editor handoff, assignees, completion criteria and deeper issue workflows remain
  in the original review ledger. Comparing snapshots does not implement those workflows.
- Broader platform/device coverage, non-loopback media tests, final CI and main merge are
  integration requirements. See the original completion/benchmark documents for the complete
  scope, including items outside this batch.
