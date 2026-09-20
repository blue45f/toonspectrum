# Review comment → current editor location

Status: **current implementation**, 2026-09-20. This is the source-aware location slice of
`virtual-studio-review-production-workflow-20260920.md`; it does not declare the whole design complete.

## Public integration

`StudioReviewEditorLink` takes `request: { subject, commentId }`. The subject is the existing
immutable review tuple: project, work, artifact, review, snapshot revision and root digest.
`studioReviewEditorHref(request)` uses the existing work canvas route and carries only those IDs
plus `reviewComment`. A location/source anchor, private preview URL, document body, authentication
material or image never travels in the URL. Duplicate/malformed identity fields are rejected.

The editor's capture Host adapter also mounts `StudioReviewEditorHandoffMount` when this request
is present. Arrival performs **zero authority reads and zero selection**. The native “의견 위치 선택”
button starts verification; there is no additional approval dialog, automatic save or automatic
selection. The review Panel decides whether to offer the link using current edit access and a
saved source anchor; an invitation or visible link grants no editor permission.

## Authority and source checks

`StudioReviewEditorHandoff` reads the exact saved review/comment through authenticated graph
clients, verifies the immutable review snapshot, requires current graph edit access, and finds
the requested ordinal through the preview reader. Only its server-derived mapping survives;
signed image URLs are discarded. Closed review history can locate a source only when the actor
still has current editing access and the current manuscript is that exact source.

The shared-document reader independently verifies current work editing access. Its server
revision and canonical document SHA-256 must equal the immutable mapping/source pin. The actual
Host uses the same save projection as review capture, including durable filter masks, preserved
document extensions and linked media rules. Only active-page navigation is excluded from the
save comparison. Unsaved source or metadata changes reject the handoff.

After hashing, the controller reads the review/comment/mapping and work again. Changed IDs,
anchors, document contents, source revisions or edit access reject the request. A fresh authority
lease with identical source may replace the initial lease after long document hashing. Before
selection, a synchronous runtime projection comparison detects changes that have not reached a
React render. Mutation tickets, access/document generations, project generation, auth publication,
current page, mounted state and pending drawing/commit/pointer state fence asynchronous results.

No historical document is installed. Page/cut/object identities come from `anchor.source` and
the mapping, never `ScopeRef.panelId` or spatial proximity. Master elements retain explicit master
ownership. A coordinate/region selects only its explicit source cut, or the exact page when no
cut is named. It does not invent an object selection or a rectangular editor highlight. The UI
states this page-level result and directs precise point/region inspection to the pinned review.

## Selection and request lifecycle

The existing ordinary comment navigator and review handoff share
`selectStudioEditorCommentTarget`. It validates the destination first, then asks the existing
page command to switch. The command must return success and synchronously report the target
page before selection, master mode, tool or point state is applied. Rejected/unconfirmed page
changes preserve existing selection. The Host's accepted page command updates its page ref and
React state without marking a document mutation.

A repeated request while pending shares one read attempt. A different comment cancels the old
attempt. Close, unmount, auth publication, browser blur/hidden or explicit cancellation fence
late results. Refocusing does not restart it. A retry is another explicit read of the same stable
request; this operation makes no server mutation, upload, receipt or idempotency key. It cannot
retry an uncertain document write because no such write is part of handoff.

## Verification and limits

- Unit/component integration uses actual source derivation, save projection, Host authority
  adapter and shared selection adapter. It covers exact cut/master selection, distinct graph
  versus authoring IDs, unchanged page navigation, dirty/stale/missing sources, current and late
  actor/permission/generation/input changes, failed page transport, request replacement,
  cancellation, explicit retry, expiry and React StrictMode arrival.
- `scripts/verify-virtual-studio-review-editor-handoff.mjs` verifies a development-only synthetic
  document with actual React mount, mutation authority, save projection, selection adapter and
  authenticated client response parsers behind intercepted HTTP. At 1280px and 390px, Enter
  selects the exact cut, the real mutation generation remains unchanged, buttons meet 44px
  height and there is no horizontal overflow. Dirty, revoked, rejected-page and cancelled late
  responses perform zero selection. The run records zero API writes and page errors.
- Browser artifacts are written to `.qa/virtual-studio-review-editor-handoff/`. This harness is
  **not** full `StudioCuttoonEditorHost`/Konva E2E, real production authentication, persisted
  server storage, WAN/multiple-device proof or performance evidence. Full-host and production
  lifecycle acceptance remain separate work.
- Assignment, due dates, production-task completion, resubmission and approval are distinct
  workflows. This location operation does not resolve a comment or approve an artifact.

Run the scoped checks from the task checkout:

```sh
pnpm exec vitest run apps/web/src/domains/creator/review-handoff apps/web/src/domains/creator/studio-comment-editor-selection.test.ts apps/web/src/domains/creator/review-capture
STUDIO_QA_BASE_URL=http://127.0.0.1:5253 pnpm exec node scripts/verify-virtual-studio-review-editor-handoff.mjs
```

The verifier requires a loopback dev server whose process working directory matches the current
checkout. No deployment, production data modification or migration is performed by these checks.
