# Creator homepage regression repair — 2026-09-20

Status: local product and browser checks. This does not claim a later GitHub result or deployment.

The `creator-home` job on `b96cc5678179ced5a184c840b52c721559bd1c53` failed while the first-visit event dialog owned focus. The standalone navigation and continuity verifiers now share the existing real-button dismissal helper with public browser journeys. The navigation verifier explicitly completes dismissal before checking page focus. The dedicated event tests still exercise first exposure, keyboard dismissal, Escape, persisted dismissal and the real fixture click.

The investigation also reproduced three product problems:

- The task picker rendered the same recent-work card and project link twice. It now renders one copy, preserving the canonical destination, precise resume description and trust state.
- The visual task-picker stylesheet was not imported, and older text-navigation selectors overrode its card layout. Loading a shared image moved the already focused support heading from about 150 px to 2,157 px below the viewport top. The existing card styles are restored; legacy text-navigation rules apply only to their own markup, and lazy artwork fills a reserved card area. Images retain their original quality.
- The lazy home could try to focus its fragment while the first-visit modal was open. Fragment navigation now waits for visible modal dismissal. Only a deferred request resumes: subsequent modal changes do not pull focus back to an old fragment, invalid/new hashes supersede pending work, and unmount removes the observer and scheduled work.

The hero's product-tour expectation follows the current destination and independently checks the production sample-project link. No navigation destination, history assertion, minimum target size or original timing threshold was removed. The navigation probe additionally withholds the actual shared hero/card SVG until focus is restored, then requires the heading to remain visible and all six artwork areas to stay bounded after image loading.

Validation on macOS ARM64, Node 24.16.0, Playwright 1.62.1 Chromium:

- Full Web TypeScript check and production build passed after the navigation change. The final CSS-only adjustment was rebuilt with the normal `build:bundle` lifecycle, including legal notices and static CSP postbuild.
- The exact homepage CI unit command passed 20 files / 170 tests, including five additional modal-ordering, latest-hash and cleanup cases.
- Production navigation passed desktop 1440×1000, tablet 820×1180, mobile 390×844 and English 320×740: delayed artwork, legacy fragments, native history, repeated keyboard activation, no video requests, 44 px controls and no horizontal overflow.
- The purpose-first, film and continuity commands use the same built preview. Continuity retains its seeded private-parameter sanitation, reload persistence, install-prompt and offline checks.
- Public event/home Playwright checks passed 14 cases before the final card-specific CSS selector adjustment. The separate recent-work viewport regression remains in its own repair/verification scope; it is not claimed as passed by this run.

The shared helper is included in the three affected workflow path filters and the homepage's selected lint/browser routing. Local logs are `/tmp/virtual-studio-creator-home-final-build.log`, `/tmp/virtual-studio-creator-home-ci-unit.log`, `/tmp/virtual-studio-creator-home-navigation-final.log`, `/tmp/virtual-studio-creator-continuity-final.log`, and `/tmp/virtual-studio-creator-home-final-browser.log`. The navigation report and screenshots are written below `artifacts/creator-home/navigation/`. Fresh CI on the resulting commit remains required for merge.
