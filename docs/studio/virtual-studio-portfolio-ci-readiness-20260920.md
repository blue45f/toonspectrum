# Portfolio asynchronous readiness regression — 2026-09-20

Status: **current test repair**. The `Full pnpm test` job for PR #1856 at
`b96cc5678179ced5a184c840b52c721559bd1c53` failed one portfolio assertion while
4,584 other files and 52,248 other tests passed. The separate full-test job on
that same commit passed. [Original failed run](https://github.com/blue45f/toonspectrum/actions/runs/35483328912)

`ProductionPortfolioLanding` renders its heading in the loading shell before
the project and task API promises finish. The test awaited that static heading
and then synchronously queried a project card, which could still be absent.
The assertion now awaits the same expected card with Testing Library's existing
default timeout. Subsequent inbox, task, navigation and API assertions are
unchanged. No product implementation, timeout, retry or skipped-test setting is
changed.

The complete production-hub directory passed **24 files / 84 tests**; scoped
ESLint and `git diff --check` passed. Local evidence is in
`/tmp/virtual-studio-portfolio-readiness-tests.log` and
`/tmp/virtual-studio-portfolio-readiness-lint.log`. This focused run is not a
claim that the next full GitHub suite has passed.
