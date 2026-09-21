# Studio unified workflow and recovery release — 2026-09-21

## Integrated source

This release combines PR #1903 (unified task navigation, production views and pinned review), PR #1906 (public navigation contract), and the previously preserved 3D QA repair `61b84ba0e` without rewriting their history.

The product change in this follow-up adds an explicit localized accessible name to the search action in the live, library and task workspace shells. Responsive hidden text no longer produces an unnamed icon button.

## Reproduced failures and repairs

- Creation steps are inside the shipped advanced-setup disclosure; the browser test now expands it by clicking. It verifies the actual input and template without claiming an unsaved project is saved.
- Exact resume uses the shared work-actions dialog in both live/list modes, not a footer that exists only in list mode. Original document identity, durable stroke, page, zoom and scroll assertions remain.
- Public journeys cross the actual journey/task/workspace shells with real clicks and browser Back, preserving all original destinations.
- Recovery previously waited for a manual button after automatic recovery had already unmounted the notice. A read-only DOM observer distinguishes automatic and explicit completion, including transient notices. Neither branch invents a user click.
- The lifecycle and artist gates retain OPFS/SQLite authority, absence of legacy compatibility records, unchanged visual thresholds, dimensions, and pixel/byte-identical before/after PNG checks.
- Static-only readiness diagnostics accept only an exact HTTP 502 at an explicitly ported `http://127.0.0.1` preview's `/api/health/ready`. Production origins, unrelated paths/statuses and page errors remain failures. Diagnostics are retained separately, not reported as API success.
- The 3D gate retains real GLTF loading, professional-mode navigation, model insertion, worker and GPU evidence. Its exact readiness classifier is shared rather than duplicated.

## Verification before final merge

- Integrated virtual-space/workspace/production/shared regression: 112 files, 1,128 tests passed.
- Updated QA helper regression: 5 files, 120 tests passed, including invalid/contradictory recovery receipts and standalone browser-script parsing.
- Canonical lifecycle: completed with 0 changed pixels after Undo, Redo, reload, and before/after exported PNG comparison; local readiness failures retained separately.
- Web/API typecheck and production build including legal notices and CSP verification passed.
- Full browser suites and final exact-head CI/deployment identifiers are recorded in the release PR after execution, not predeclared here.

## Explicit boundaries

Issue #1905 remains open until the remaining exhaustive lanes are rerun and verified. This release is not certification of every brush/GPU/browser, authenticated WAN collaboration or the entire longer-term feature ledger. No migration, production data, secrets, plan, automatic deployment setting or API runtime code is changed by this follow-up.
