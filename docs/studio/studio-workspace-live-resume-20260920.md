# Studio workspace live resume and recovery

Date: 2026-09-20
Status: implemented; verification receipts are recorded separately below. Not a deployment.

## Changes
- One read-only resume target feeds the desk, list, work inspector and footer.
- Document metadata and exact-resume events invalidate saved state; event payloads never supply a destination.
- Native cross-tab storage changes, document-list removal, focus, pageshow and visibility restoration refresh the target.
- Same-turn exact-resume updates are coalesced; unchanged snapshots do not notify React. No polling or persistence owner was added.
- A missing, archived or trashed remembered manuscript leads to that project's document list, never a neighbouring manuscript.
- Storage access failures discard the old destination and expose explicit retry/storage inspection.
- Resume activation rechecks the destination, including auxiliary clicks, before accepting a stale link.
- Mobile artwork reserves its original aspect ratio without the old fixed-height letterbox.
- Focus scroll clearance accounts for the fixed bottom menu.
- View switches use explicit accessible names and opt out of redundant tooltips that could intercept the adjacent button.

## Reproduction
- Run the existing local Vite server on a free loopback port.
- `WORKSPACE_QA_URL=http://127.0.0.1:PORT node scripts/check-studio-workspace-recovery.mjs`
- Also run `scripts/check-studio-first-workspace.mjs` and `scripts/check-studio-workspace-switcher.mjs` with the same environment.
- All browser fixtures use fresh isolated Playwright contexts, not the user's browser profile.
- Recovery checks inject optional-module/image failures and storage denial, and exercise real cross-tab deletion/restoration.
- Generated screenshots/logs/fixture data remain untracked in `.qa/workspace-live-resume-20260920/`.

## Boundaries
No production deployment, migration, artwork replacement, engine change, shared-permission mutation or new storage authority. The browser checks exercise local metadata and anonymous UI, not authenticated collaboration or cross-device cloud synchronization. An additional production-preview recovery-script creation request was blocked and is not part of this delivery; it must not be reported as executed.

## Acceptance receipt — draft, not ready to merge
- Current focused tests: 13 files / 113 tests passed, including 17 resume cases and 2 view-label cases.
- Development recovery browser checks: 11 passed; no uncaught page errors, including real cross-tab storage and four viewport widths.
- CI execution-contract tests: 19 passed before the final view-label test was registered; rerun is recorded in the gate log.
- Web/API typecheck and scoped lint passed before the final view-label change; normal commit/push hooks revalidate the submitted revision.
- Production build/CSP completed for the initial resume/mobile changes. Additional production-preview recovery script was not created or run.
- Existing full workspace browser journey fails at line 87: a focus-return global tooltip intercepts the Space view button. Reproduced again after excluding tooltips on view switches alone.
- A separate request to exclude the modal launchers and add its regression was blocked by tool security; that patch is NOT applied.
- Therefore this work is preserved as a draft and must not be merged until the tooltip interaction is corrected and the full journey passes. No protection rule, CI expectation or browser assertion was bypassed.
