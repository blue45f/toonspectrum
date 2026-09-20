# Searchable studio workspace switching

Date: 2026-09-20
Status: implemented; merge and final build verification recorded in the PR. No production deployment.
Base: main after PR #1868, including the separately merged CI health-probe fix #1864.

## User-visible behavior

- Home, team and explore retain the native work selector and offer an on-demand title-search picker inside the existing single context panel.
- Search normalizes Korean composition, Unicode width and case; every whitespace-separated term must match the title literally.
- Results support recent-activity or natural title order, deterministic duplicate-title IDs, and 30-item incremental display without dropping access to remaining matches.
- Selecting a work only changes verified workspace context. The current route/category remains intact; Back returns to the previous selection rather than reopening the picker.
- Personal scope requires an explicit choice. Deleted/archived works, loading and storage failures never fall back to an unrelated manuscript.
- Search never touches last-opened timestamps, writes a second project store, transmits titles to a server, opens an editor or grants access.
- Footer status distinguishes checking, unavailable work and storage failure from the personal workspace.
- Initial focus enters the search field. Arrow keys/Home/End navigate native result buttons; Enter selects the focused result. IME composition does not trigger navigation or dismissal.
- Escape and native cancel close the inspector. Focus returns to its invoker even when React removes the focused search field during closure. Closing presentation does not terminate media sessions.

## Verification

- Focused Vitest regression: 9 files / 77 tests passed, including 3 explicit shared-dialog focus/cancel/IME tests.
- Search browser journeys: 8 checks passed using 65 synthetic works in a fresh isolated Chromium context; library bytes remain unchanged after ordinary search/selection.
- Existing studio-first browser regression: 20 checks passed, including exact manuscript resume, personal scope, missing-work recovery, navigation continuity and the real live-space shell.
- Both browser suites reported zero uncaught page errors. Long titles and inspector layout were checked at 1440, 820, 390 and 320 CSS pixels; desktop/mobile screenshots were reviewed.
- New regressions are registered in the required CI target list; existing checks remain enabled.
