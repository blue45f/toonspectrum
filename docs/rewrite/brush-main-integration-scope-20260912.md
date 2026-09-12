# Brush branch integration and CI scope — 2026-09-12

## What this merge contains

PR #1331 already put the unified brush product catalogue and an executing core
check on main (`2aa8132fd82a8bfdd8efaad671fb6eec6ae6fdc6`). Its product files are
not duplicated by this follow-up. The remaining PR #1332 diff was CI configuration
and two temporary source-archive workflows, not a new brush engine.

This follow-up removes those completed archive workflows and preserves every
mandatory check already on main: architecture, CSP, toolchain coverage, strict
lint, web/API/realtime types, all sixteen selected product regression files,
brush catalogue audit, API/web release build and the unchanged bundle ratchet.
Static/product validation and build can run in parallel. Serial performance tests
are additionally required. The aggregate `core` accepts only actual success from
all three declared jobs and rejects missing, failed, cancelled, skipped, malformed
or unrecognized results. Its script and wiring have standalone Node/Vitest tests.

## Deliberate scope split, not an all-tests-passed claim

The earlier #1332 proposal attempted to make the entire root suite required in
one change. Actual runs found existing failures across route/UI contracts,
CI-policy expectations, missing generated artifacts and database-test setup.
Those failures are not relabelled as passing and assertions are not deleted to
hide them. The wholesale expansion is NOT activated as a required merge gate in
this integration. Main's existing `main-full-qa-fast-diagnostics.yml` remains
unchanged for broad post-merge/on-demand diagnostics. The earlier proposal and
its reports remain in Git history and Actions. Promoting complete-root validation
requires fixing its environment and each current product contract first.

## Product work that is still separate

The current 48-item catalogue is a baseline, not a final brush-count target.
The product goal is to remove similar output, not distinctive texture, pattern,
pressure/tilt/speed response or stateful paint behavior. No legacy user-data
migration or 72-design search-alias requirement applies to this pre-launch site.
A measured re-audit of excluded brushes, new generative tip implementations and
creator integration, licensing review, and live/settled/export comparison are NOT
implemented by this CI integration. Do not infer them from an old PR title or an
illustrative image.

Git integration, successful required checks, a hosted deployment and browser
acceptance are separate outcomes. This PR does not assert deployment completion.
