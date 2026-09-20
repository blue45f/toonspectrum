# Workspace lifecycle refresh and optional space recovery

Status: implementation complete; release verification recorded separately.
Base: 6c8b07a91 (includes the independently merged handoff query correction).

## Implemented

- Re-read the canonical project library when returning focus, restoring a page or foregrounding a tab.
- Treat same-tab project events as invalidation signals, not authoritative project snapshots.
- Recognize cross-tab localStorage.clear() notifications without confusing unrelated keys or session storage.
- Surface revoked storage access through the existing error and retry flow.
- Remove every lifecycle listener when its library consumer unmounts.
- Catch rejected space-view imports and render failures inside the optional space presentation.
- Preserve the surrounding workspace menu, selected project and recovery controls.
- Let the user explicitly continue in list view without changing the document or rendering engine.

## Verification

- Focused library, workspace, navigation, preference and browser-storage authority tests: 13 files / 102 tests passed.
- Both new suites are included in the mandatory CI target manifest.
- Full typecheck, lint, architecture, CI-contract and production-build checks run through the normal gates.
- No new browser journey is claimed: the extra browser-check script write was blocked by the tool.

## Not included

No independent realtime resume watcher, production deployment, database migration, permission change,
new storage authority, library upgrade, artwork replacement or automatic renderer fallback.
