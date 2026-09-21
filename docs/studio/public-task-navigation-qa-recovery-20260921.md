# Public task-navigation browser regression repair — 2026-09-21

This tooling-only follow-up fixes the 12 public candidate failures recorded by PR #1903 at `eca919a7aa49a52b7575f1d8739dc890ef5e9525`, run `35558510243`.

## Failure and correction

Market, showcase, discover and help intentionally use WorkspaceTaskFrame. The old browser gate still required `.public-site-journey` on all non-home pages. Twelve assertions failed at 1440/390/320px although the new navigation was rendered.
The gate now requires exactly one navigation owner: the original journey or the task frame. A task frame must match one of the four declared routes and provide all four exact, same-origin workspace destinations and labels, correct current state, exact breadcrumb title/parent, studio-return link and visible/actionable/focusable search. Missing, duplicate, external, reordered or mislabeled navigation remains a failure.
No page is removed; the 14 routes × 3 viewports, one visible heading, loaded artwork, drawing destination, keyboard section navigation, horizontal-overflow and uncaught-error assertions are retained.

## Executed evidence

- Contract/model/component tests: 4 files /85 tests passed, including 16 new positive/negative snapshot cases.
- Changed-file strict ESLint and diff whitespace checks passed.
- Full corrected public browser gate: all 42 route/viewport cases passed against the actual candidate production dist at the same PR head. No HTTP content stubs or injected product state were used; the existing first-visit dialog is dismissed through its native action.
- The isolated duplicate build hit ENOSPC. Only that failed, untracked dist was removed (846MiB); existing source, other worktrees and release artifacts were preserved. The completed candidate build (`toon-final-release-candidate-build.log`, generated after the head commit) was served read-only for browser checks. This is not a successful new local build claim.
- Candidate source worktree remained clean at `eca919a7`; reused entry `index-BZH344cn.js`. Browser report: the isolated clone's `artifacts/public-webtoon-experience/report.json`; output log `/tmp/toon-public-frame-browser-fixed.log`.

## Delivery and limits

Only the verifier/helper/tests and this record are proposed for main. PR #1903's product changes are not duplicated or merged by this patch. The old main's public-journey contract remains supported.
No application/API/runtime, dependency, workflow, test removal, timeout increase, forced click, deployment, production data or infrastructure configuration change. Other exhaustive failures remain open in #1905; this is not full product certification.
