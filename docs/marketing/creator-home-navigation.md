# Creator homepage: navigation and workflow follow-up

## Scope

Built on PR #773 HEAD `a37e4e780980f5294940d7cc2a72a39537aa8e16` in a separate follow-up branch. The merge-gated feature branch is not rewritten or repeatedly pushed while its existing core checks wait for runners. This follow-up does not change branch protection, the core gate, studio documents, database state, media rendering or n8n credentials.

## Implemented

- An in-flow introduction navigation landmark links to the workflow, tools, brand film and FAQ. Its four native fragment URLs retain browser back/forward and modifier/new-tab behavior. It is not an additional sticky header and does not cover the editor or mobile navigation.
- Initial fragment URLs are resolved once the lazy homepage mounts. Known destinations receive heading focus and instant, offset scrolling. Unknown or malformed fragments do not become selectors or change focus.
- Same-fragment activation handles the case that produces no hashchange. Changed fragments are left to the browser. Scheduled work is cancelled on navigation/unmount, with a revision check guarding against already queued callbacks.
- Workflow selection is available beside the explanation as well as the top preview. Both controls share one state. Left/right, Home and End work within the currently operated group; Tab, Enter/Space and browser modifiers retain native behavior.
- Minimum 44px control height, a wrapping two-column mobile jump menu, light/dark focus styling and forced-colors selected-state fallback. The existing film fragment stays `#creator-film` and focuses its readable heading; navigating there does not play or download a film.

## Evidence and acceptance

Local executed checks: 26 navigation-contract tests passed after TypeScript transpilation with only the test-runner import (`vitest` to `node:test`) and module extension changed. The source helper passed strict TypeScript checking with ES2022 and DOM libraries. TS/TSX syntax and the added CSS parse were checked. These results do not assert a full application typecheck, a React DOM run or a browser pass.

Added integration coverage: three React DOM picker tests, preservation of the homepage's existing no-heavy-engine/pressed-state contract, unique focusable heading targets, and a real Playwright production script covering 320/390/820/1440px, KO/EN, light/dark, direct fragments, native history, same-fragment focus, synchronized pickers, keyboard control, no initial MP4 request and minimum control height. The existing seven-condition homepage and playback-upgrade scripts remain enabled. Full execution and screenshots are reported only by a completed Actions run.

The existing homepage-quality workflow gains a narrowly scoped push trigger for the follow-up branch, so it can validate without rewriting or merging into PR #773. Its permission stays contents: read. Existing core tests are not removed, relabelled, skipped or replaced.

## Design reference

W3C, Understanding Focus Not Obscured (Minimum):
https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum

Heading offsets and an in-flow rather than fixed extra navigation bar are intended to prevent the new controls from hiding focused content. This is an implementation goal, not a claim of site-wide WCAG conformance.
