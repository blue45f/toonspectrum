# Source-bound review and production workflow

Status: **migration in progress**. The pinned review, source mapping, capture producer and
production workspace are current authorities. The connections below are implementation targets
until their source, tests and browser paths are recorded. This continues VS-E04/E09; it does not
replace the remaining original-design ledger or authorize production deployment.

## Existing authorities and identities

Graph review comments already store `assigneeIds`, `dueAt`, `severity` and an immutable `anchor`.
Assignees are user IDs with current work editor/admin/owner access. Production tasks instead
refer to role-assignment IDs. A connection between them must resolve those identities explicitly.
`ProductionHandoffBrief.acceptanceCriteria` already owns completion criteria; it should not be
duplicated into an unrelated review-comment text convention.

The production workspace uses the existing server JSON/CAS persistence and `baseRevision`
conflict handling. A task can reference an exact review subject, comment ID and handoff ID without
a new database table. Its persistence is a separate operation from comment creation. If the
comment succeeds and task storage fails, the UI must preserve that comment ID and resume the
connection explicitly. It must not claim atomic completion or create another comment on retry.

## Implementation slices

1. Expose eligible assignee and deadline controls in the pinned review. Preserve text, assignment
   and time across same-account renewal, and fence actor changes, revoked membership and stale
   requests. Same comment-ID replay must compare body, anchor, severity, assignees and deadline;
   mismatched inputs are conflicts. The server remains the final assignment authority.
2. Connect the saved request to a production task and its existing handoff completion criteria.
   Reuse project access and revision conflict handling. Partial success remains visible and
   recoverable, with saved IDs retained for explicit retry.
3. Add explicit source-aware editor handoff. Read the saved comment and mapping again, then
   compare the current saved document and runtime projection against their exact source identity.
   Check the mutation ticket, document generation, pending stroke state and current permissions
   before and after asynchronous reads. Only select a currently verified page/cut/object; do not
   replace the manuscript with the historical snapshot or infer a location from its proximity.
4. Capture the correction through the existing save/capture bridge and offer explicit resubmission.
   Resolve the new snapshot's actual `submission` parent from authoritative revisions before
   storing it as `resolutionRevisionId`. A `review-snapshot` is not an accepted resolution kind.
   Reuse the new pinned review for comparison, required-note handling and authorized approval.

## Editor handoff constraints

The handoff transports stable subject/comment identifiers, never private preview URLs or image
bytes. A different saved revision/digest, missing cut, unsaved runtime changes, unavailable
hydration, pending stroke or changed actor cancels selection. Existing save UI may be offered for
dirty content; its completion must trigger fresh source verification. A failed page switch must
not be followed by an element selection on the wrong page. World avatar follow and document
follow remain separate permissions.

## Required evidence

- Eligible assignment and completion criteria survive server reload, and an unauthorized user
  cannot become the assignee through a forged request.
- Pending permission/read responses cannot revive an old draft or redirect another document.
  Dirty, changed, missing or revoked source cases perform no page selection or document writes.
- Comment/task partial success resumes using the same IDs. Reusing an ID with changed semantic
  input conflicts, including a different severity, assignee set or deadline instant.
- A real correction, save and new capture connect the exact new submission parent to the old
  request; foreign artifacts and unrelated submissions are rejected.
- New required notes block approval. A valid new approval preserves the prior snapshot, comments,
  assignments and resolution history. Publication remains a separate authorization.

## Assignment and retry evidence

The initial assignment slice passed 47 UI/DTO checks and 21 real PostgreSQL review checks
(68 total). The PostgreSQL run uses a separate local review-workflow database. It covers
semantic comment-ID conflicts, equivalent deadline instants and current assignment authority.

The extended `scripts/verify-virtual-studio-spatial-review.mjs` browser journey renders actual
React, API response parsers and decoded synthetic QA images using intercepted HTTP. At 390px,
it selects two eligible people, preserves the chosen cut and enters a local Asia/Seoul deadline.
A fresh roster that demotes the selected editor prevents any comment POST. A deliberately lost
response then preserves the draft; an explicit retry sends the same ID and complete request,
creating one comment across two attempts. The exact UTC deadline is retained. The run produced
33 intercepted HTTP requests in total, zero page errors and no horizontal overflow. This is local
fixture evidence, not production login, database connectivity or transport-failure certification.

The required foundation regression manifest now includes the complete review-handoff directory
and shared editor selection regression, in addition to the existing capture and virtual-space
coverage. Its routing/coverage tests passed. Editor handoff and subsequent task connections
remain subject to their separate implementation and browser evidence below.

The roster renewal and saved editor-link slice passed 62 focused checks across five files.
Current verified display names are shared by the saved comments and assignee picker. The visible
roster renews within its 15-second lease; expiry, revocation, hidden documents and actor changes
clear unverified names without discarding a same-account comment draft.

The explicit editor handoff passed 95 focused checks across 11 files and six desktop/mobile
browser scenarios. The browser harness uses the real authority and selection adapters with a
dev-only host fixture; it is not full Host/Konva or production-authentication evidence. Dirty,
revoked and superseded contexts performed no selection or document writes. See the separate
editor-handoff contract for the exact limits.

## Production reference contract

The Web workspace parser and API DTO now consume the same optional `reviewRef` schema from
`@toonspectrum/studio-project-model`. It contains the exact saved subject, comment ID and
optional existing handoff ID. It contains no signed URLs, comment body, approval or permission
claim. Both current tasks and recorded workspace versions preserve the reference through
serialization. A reference to another work, a missing/duplicate handoff, a different production
hierarchy or extra private payload fails admission instead of being silently discarded.

This additive contract passed 66 model/Web/API tests across three files; required routing passed
eight contracts. The existing `ProductionHandoffBrief.acceptanceCriteria` remains authoritative.
This contract alone does not create a task or grant review access. The explicit saved-comment
connection now uses the server admission and UI recorded below.

## Production reference server admission

The existing production-workspace transaction now validates new references against actual
work, graph, artifact, review, snapshot, digest and comment-anchor rows. New or rebound task
assignments require current owner/admin/editor membership and explicit production role IDs
whose global, same-node or ancestor scope covers the task. Every saved review assignee must be
represented. The same work lock, CAS and protected role/approval gates remain in force.

Unchanged references and role bindings remain historical records after a former member leaves;
ordinary task edits do not require that person's former access. A new reference introduced only
in a workspace version still requires a real graph relationship. There is no new database table
or migration, and a saved review can be explicitly connected to more than one existing task.

Four API suites passed 68 checks, including 47 actual PostgreSQL scenarios (26 added for this
slice). They cover forged identities, role scope, membership downgrade queued against the work
lock, concurrent CAS and preservation of historical records. Shared model and complete API
typechecks passed with the current implementation. The separate UI evidence follows; these
server checks alone do not establish the completed user workflow.

## Explicit production connection

An editable saved comment exposes an explicit connection control. Opening it reads the current
review, production workspace and team; it does not create a task, role, handoff or another comment.
The user selects an existing task, an optional existing handoff and current role assignments for
the comment's assignees. Replacing a different review reference requires an explicit replacement
choice. The latest full workspace is preserved except for that task's reference and assignments.

Before the single CAS write, the controller verifies fresh authority, role coverage and the exact
previous reference and handoff criteria. A lost response is reconciled through a read, including
fresh role ownership and scope validation. There is no automatic PUT replay. A CAS conflict
requires the user to reload and confirm the choices again. Actor changes, hidden documents,
expired leases and revoked rights fence late results.

Nine focused files passed 75 tests and CI routing passed eight checks. Nine browser scenarios
passed at 1280px/390px using actual React, controllers and HTTP parsers with synthetic records.
They cover keyboard selection and close-focus return, explicit replacement, lost response,
unconfirmed writes, CAS conflicts and actor/revocation fences. Both screenshots were visually
inspected. This is a development fixture, not production authentication/storage or full Host E2E.
Independent review identified focus loss during periodic background renewal. The corrected
controller keeps valid choices active while renewing, coalesces concurrent renewal reads and
lets an explicit save start its own fresh authority read. Expiry clears the choices and fences
late renewal results. Four focused files passed 30 checks; the expanded browser run passed ten
scenarios, including select focus/value retention during delayed renewal, actual lease expiry
and rejection of the late response. The fix was committed separately as `49bba64c9`.

## Producer-attested follow-up resolution

The existing resolve request accepts optional `resolutionSourceRef`, an exact immutable
`completed.subject` identity. The server verifies both captures' saved-source digest, canonical
receipt, fingerprint and operation request/payload hashes, plus their actual single-parent
snapshot/submission/checkpoint lineage. The follow-up saved-source revision and operation
sequence must both increase. `resolutionRevisionId` must be that new snapshot's actual
submission parent; the snapshot itself is not a valid submission.

The optional validation runs before a resolved-comment replay can return success. It rejects
unrelated or forged pins with HTTP 422 `review_resolution_source_mismatch`, using existing
service error mapping. Legacy requests without the field keep their existing behavior; the Web
must not silently fall back to that path after a failed attested request. No table or migration was
added. These checks establish the correction's source relationship, not that the requested
artistic change has been satisfied; resolution remains a deliberate user decision.

Six suites passed 152 distinct tests: DTO 15, source map/attestation 45, preview reader 21,
producer service 7, actual PostgreSQL producer 17 and existing PostgreSQL review races 47.
Scoped lint, diff validation and full API/Web typechecks passed. The separately implemented
capture-return and explicit resolution UI are documented below.

## Capture return and deliberate resolution

Starting a new capture fixes the originating review/comment to that capture owner. A later
same-work route change, reopening the dialog or retrying the same intent cannot relabel the
result as another comment's correction. Completion offers an explicit identity-only return link;
account changes immediately hide the link. No comment body, image URL or permission claim is
placed in the URL. The receiving review page reacts to the current route parameters.

The correction panel verifies both exact pins and the original comment, reads the new snapshot's
single submission parent, and displays the actual existing two-preview/overlay component. The
user compares the images and explicitly confirms the correction before a fresh authority read
and one resolution POST with `resolutionSourceRef`. HTTP 422 cannot trigger a legacy fallback.
An ambiguous write switches that attempt to read-only reconciliation. A user recheck also reads
without blindly resending the POST. Approval of the new review remains a separate action.

Actor/generation changes, hidden documents, expired leases and revoked access clear private
comparison state and fence delayed results. Background renewal preserves valid keyboard focus
and the user's checkbox while the current lease remains valid; expiry clears the confirmation
and a late response cannot restore it. The comment's recorded resolution must identify the
exact submitted revision before the UI reports success.

The integrated portfolio passed 17 files / 118 tests, the final UI check passed five tests and CI
routing passed eight contracts. Full Web typechecking and scoped lint passed. Eleven browser
scenarios passed at 1280px/390px, covering the completion link, two real decoded QA previews,
overlay, explicit write, lost responses before/after persistence, invalid source, revoked access,
missing parent, actor changes, hidden state, renewal focus and expiry. Both comparison captures
were visually inspected. These fixtures use actual components, parsers and controllers with
synthetic HTTP records; they do not establish production authentication, database attestation
or a complete router journey. Commit: `90b2db2b1`.

## Actual Host capture with an isolated local API

`scripts/verify-virtual-studio-review-host.mts` starts and owns a real local Nest API and Vite
process through `studio-review-host-qa-runtime.mjs`. It rejects occupied ports and requires an
explicit loopback test/QA database. The shared isolated environment excludes production local
environment files and paid services. The normal CSRF/CORS boundary is retained by using an
already supported development origin. Both owned processes terminate on completion or error.

The fixture inserts a new verified test account using the current password hash, avoiding
external verification email. Actual login issues the session cookie; actual work creation and
saved-document reads use the API and PostgreSQL. The full Studio Host loads the real work,
uses its actual mutation-authority code, dismisses onboarding through the visible button
and invokes the shipped capture command. Only the capture-producer HTTP endpoints
are intercepted, since this isolated API has no external private-object store.

The initial empty-page owned-runtime run passed with a separate bootstrapped local PostgreSQL 16 database
and its DML-only runtime role. The actual Host exported two distinct PNGs at the unchanged
default 2x resolution, **1440 by 2160** each. Browser-decoded center pixels matched each saved
fixture page's background and ordinal. The intent matched the actual saved revision/digest,
three source reads were observed, prepare and complete each occurred once, upload SHA-256
receipts matched the exact completion body, and there were zero page errors or source writes.
The completion screenshot was visually inspected. This covered the two-page Host/export bridge,
actual login and source reads; it did **not** exercise authored manuscript persistence or the
collaboration server's save acknowledgement. Extending the fixture to real pen input exposed
the missing development WebSocket opt-in in the QA runtime. The runtime now explicitly uses
the existing same-origin Vite proxy to its owned loopback Nest gateway. No save-authority check
was relaxed. The [authored manuscript follow-up](virtual-studio-review-host-authored-evidence-20260920.md)
records real pen input, the shared save and per-stroke PNG evidence. Neither run establishes
production object storage or WAN media.

To reproduce, provide `TEST_DATABASE_URL` for a dedicated, migrated local test database and run
`pnpm exec tsx scripts/verify-virtual-studio-review-host.mts`. Optional local endpoints are
`STUDIO_QA_BASE_URL` (default `http://127.0.0.1:5181`) and `STUDIO_QA_API_BASE_URL` (default
`http://127.0.0.1:4355`). The verifier does not migrate, reset or drop a database. It writes its
synthetic evidence under `.qa/virtual-studio-review-host/` by default; `STUDIO_QA_OUTPUT` changes
that location. This manual integration verifier complements the required unit/database lanes.
