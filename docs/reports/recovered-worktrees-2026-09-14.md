# Recovered unpublished worktrees — 2026-09-14

## Scope

This integration preserves unpublished changes from five local worktrees: market storage recovery, P2P creative activities, catalog research, character conversion, and character-shaper quality. Original worktrees were not reset or overwritten. Only the unpublished patch from each worktree was replayed; already merged historical changes were not reapplied. Routing conflicts preserve both the current main routes and the recovered routes.

## Validation

- Changed Vitest suites: 23 files, 320 tests passed.
- Mandatory CI contract tests: 171 passed.
- Web and API TypeScript checks: passed.
- The existing required core gate remains unchanged; recovered UI regression suites are now explicitly executed by its static job.

These checks do not claim full browser, GPU, visual-asset, or production deployment approval. Premium-world asset generation remains separate because its delivery tests identified missing models and catalog registrations. Older video-production and workspace-layout experiments are preserved separately until their overlapping changes are reconciled.
