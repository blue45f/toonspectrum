# Resolved review comment → production task completion

Status: **implemented source; integrated acceptance pending**. This is the VS-05 task-completion slice, based on `e210784e447934a805e85c60ca88d9911b0d2f38`. It does not imply the rest of the original design, a merge, or a deployment is complete.

## User path and authority

The pinned review panel exposes **해결된 의견의 작업 완료 검토** for a saved resolved comment when the current project grants editing access. Expansion reads the saved review, the server production workspace and the current team. The user chooses an existing task already linked to this exact comment and review pin. Missing tasks and handoffs use the existing production board; the feature never creates a placeholder task or comment.

The completion surface reads the server-derived original and replacement review pins, the current resolved comment and the linked handoff's exact acceptance criteria. It links both fixed review images for inspection. Every criterion requires an explicit check before **기준을 확인하고 작업 완료**. A changed observed proof clears stored checks, including A → B → A. Equivalent background reads preserve the current form while its 15-second read lease remains valid.

The dedicated creator endpoint authenticates through the existing cookie/session request boundary and accepts no actor or completion time from the body. The body contains only request ID, workspace CAS revision, proof digest and the exact confirmed criteria. Unicode/interior-space task IDs follow the existing production task ID contract; graph pin IDs retain their narrower existing contract.

## Server transaction and retained evidence

`GET /creator/works/:id/production-tasks/:taskId/review-completion` reads current evidence. `POST` at the same path explicitly completes the task. Both acquire the work lock before checking current collaboration access, then read the workspace and lock the original review before its comment. Completion requires current edit access, the exact work/project/artifact/snapshot/hash/comment relation, an existing same-scope handoff with criteria, and a currently resolved comment.

The replacement is derived from the comment's actual resolution submission parent. Both captures must pass the existing producer receipt, operation, saved-source digest and immutable revision-chain attestation. The replacement must advance both saved source revision and server operation sequence. Legacy or manually resolved comments without that proof remain unavailable for this dedicated flow; their existing manual workflow remains unchanged.

The transaction updates exactly one task to `done` / `100` from fresh workspace JSON and advances the existing CAS revision. Other tasks, versions, handoffs, members and graph approval state remain unchanged. An immutable `studio-review-task-completion-v1` response in the existing `studio_mutation_receipt` table records cookie actor, server time, both pins, criteria and resolution proof. This receipt's `resultRevisionId` references the original pinned source; no new graph revision is fabricated. No new table or migration is required.

The receipt is separate from production document JSON. The generic strict workspace DTO rejects injected completion fields, so manual task `done` is not verified completion evidence. An exact request replay rereads current authority and returns the existing result without rewriting the workspace. Changed request bytes under the same ID fail. Lost responses cause one authorized read; only explicit retry can resend the unchanged intent. CAS conflicts never automatically apply a patch to a newer workspace.

## Invalidation without unnecessary reconfirmation

Generic workspace save computes affected linked task IDs before querying completion receipts. No affected task means no completion-history query. Changes to that task's review link, production scope, linked handoff scope/criteria, completion status/progress or removal append a `studio-review-task-completion-invalidated-v1` receipt for each affected prior completion fingerprint inside the existing CAS transaction. Original receipts are never overwritten or deleted. Returning criteria or status to the former value does not undo an invalidation.

Unrelated task edits and task/workspace labels preserve current evidence. The resolution proof retains PostgreSQL's exact six-digit fractional timestamp as text; truncating it to JavaScript milliseconds could otherwise miss a same-millisecond reopen/resolve. A reopened comment is unavailable and a newly resolved version has different evidence. Old receipts remain historical records, not new approvals.

## Verification evidence

At this checkpoint, seven focused Vitest files passed **54 assertions**, covering the server transaction through a controlled query adapter, strict client parsing, actor/visibility/late-result fences, exact-intent reconciliation, selected-task preservation, invalidation and the actual React forms. The final rerun includes the retained-intent/proof mismatch fence, delayed-response display lease, React check-state ABA and scope-ancestry invalidation. Shared model TypeScript and scoped ESLint passed. Required-target manifest / semantic-shard tests passed **13 assertions**, and `git diff --check` passed.

Four actual PostgreSQL scenarios have been added to the existing review preview producer integration suite. They use real producer-generated original/replacement captures and existing constraints, with fixtures deleting only their own records. These cases cover atomic completion/replay, unrelated-edit preservation and criteria A → B → A, exact microseconds and reopening, and revoked editor replay / generic evidence rejection. **These new database cases have not yet been executed.**

The development-only browser harness and `scripts/verify-virtual-studio-review-task-completion.mjs` cover 1280px / 390px keyboard use, both pinned links, no write before all checks, response-loss reconciliation, identical explicit retry, changed proof and late account replacement. They use synthetic HTTP records with the real UI/hooks/controller/client parsers and are not production authentication/storage or full editor E2E. **Browser execution, integrated Web/API type checking and full CI remain pending.** No performance, merge, deployment or release claim is made here.
