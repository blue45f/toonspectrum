# Studio nested-modal focus integrity — 2026-09-05 follow-up

## Reproduced defect

The previous PR #750 production blob `b4cc328aade3c2438c50ef366e74886b603ac41b` restores to the background main-menu trigger after a child modal closes, even though the parent modal remains open. This is a DOM-contract reproduction using the actual compiled production module, not a screenshot of the deployed Studio.

The same 36-scenario Chromium suite was run before and after the correction. Before: 26 passed / 10 failed at one viewport. After: 36 passed / 0 failed at each of 320x568, 768x1024, 1440x900 and 2560x1440: 144 execution instances, 36 distinct scenarios. Browser: Chromium 144.0.7559.96.

## Product changes

- Remember the last focus inside each modal, including child autofocus before the MutationObserver callback.
- Capture the opener chain before eligibility checks, because the child can already have made its parent inert.
- Restrict fallback candidates to the surviving modal; never jump to the background because its parent is temporarily inert or its opener was removed.
- Preserve ancestor opener chains when multiple portals close in one DOM batch or in reverse order.
- Restore three nested levels one at a time and handle background-modal removal.
- Discover existing body-portalled modals on installation and retain portal ownership across same-batch DOM moves.
- Keep each dialog's own restoration priority, preventScroll, owner-document boundaries, idempotent cleanup, and body-only MutationObserver scope.

No canvas mutation, document schema, drawing engine, collaboration ACL, browser permission, payment flow or branch protection is changed.

## Evidence and verification limits

Production TypeScript passed `strict` + `noUncheckedIndexedAccess` compilation with ES2022 / DOM / DOM.Iterable. The added 13-case Vitest nested-modal file passed syntax transformation and is included in the permanent focused workflow with the existing suites. The Vitest suite, repository-wide lint/typecheck/build, real Studio React E2E, Firefox/WebKit, real mobile IME hardware and pen devices were not executed locally. CI pending is not CI passing.

Production source SHA-256: `0547e2f6424522f51c3439d809373a5e6e3558f6d4ff4eb0bcd4aab50f3a388a`.
Nested Vitest source SHA-256: `780a41205aad7ba8a89c2dc20cc8344f9c903bc4129d237f8bcc0adeb7e6551c`.

This follow-up extends the earlier focus-return report; its explicit earlier exclusion of nested-modal verification no longer describes these focused DOM tests. It still does not establish whole-product accessibility compliance.
