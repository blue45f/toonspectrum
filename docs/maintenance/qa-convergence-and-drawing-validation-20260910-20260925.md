# QA convergence and drawing validation summary — 2026-09-10 to 2026-09-25

Status: **historical maintenance summary**. Raw screenshots, browser logs, JSON reports and
CI trigger receipts were removed from the maintained source tree. They remain recoverable from
Git history and, where applicable, GitHub Actions artifacts. Product behavior is guarded by the
maintained source tests and canonical workflows rather than by checked-in execution output.

## CI and branch convergence

- The protected required check remained `CI / core`; recovery commits did not bypass or replace it.
- A user-authored recheck was required after bot-authored repair commits because GitHub did not
  schedule pull-request workflows for the token-authored head.
- PR #1289 convergence started at `415452d8653282f6ce91c65219a992167408208f` and retained the
  canonical workflow set while reconciling performance, VRM admission and tagged recovery branches.
- CI optimization retained four root Vitest shards, main-only V8 coverage/Sonar aggregation,
  non-required browser jobs after `core`, and `--prefer-offline` installs.

## Recovered product changes

- Studio 3D insertion quality policy: `a8c475dc38060d46e50406b3802ead1867ab2515`
- Studio effects workspace payload: `f76a78bc047d42dcc74cda6002307d50fb491cd8`
- Unified Studio 3D entry: `1b71d831407324fb4b2d9e5b4f0c1cabb5dd1d52`

The maintained regressions cover VRM model/thumbnail admission, atomic preview transitions,
BG3D WebGL recovery and batch insertion races. One-shot recovery workflows and transport payloads
are intentionally absent from the final source tree.

## Drawing validation evidence

The removed `.qa` tree contained generated filter-dialog captures, drawing-workbench screenshots,
durable-document snapshots, two-minute visible-soak checkpoints and their machine reports. These
were run receipts, not runtime inputs. Future executions must write to ignored `.qa/`, `artifacts/`
or CI artifact storage and must not be committed.
