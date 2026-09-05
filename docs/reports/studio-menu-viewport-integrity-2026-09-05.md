# Studio menu viewport integrity — 2026-09-05

## Actual production changes

The existing `StudioMainMenu` now uses a typed, finite geometry planner. It measures the visual viewport (including offset, zoom and software-keyboard shrinkage), constrains natural menu width as well as its minimum width, and opens upward only when below is cramped and above offers more space. 240px is a placement preference, not a minimum height that can escape the screen. Upward menus use their actual height rather than reserving a guessed empty area.

Arrow/Home/End navigation reveals the focused command by moving only the menu's scrollTop. Page/canvas ancestors do not move. ArrowUp on the trigger opens the last discoverable item, including disabled commands; ArrowDown opens the first. Keyboard composition events do not open, navigate or dismiss the menu. Touch/coarse-pointer rows have a 44px minimum target.

Visual-viewport events and outer scrolling are coalesced into one animation frame, equivalent coordinates do not rerender, and scrolling menu rows is ignored by trigger remeasurement. All listeners and the scheduled frame are cleaned up.

The canonical menu catalogue, command IDs, grouped ARIA semantics, disabled-item reasons, rich tool hints, hover switching, outside-click focus ownership, document mutation paths and styling tokens are preserved.

## Executed locally

- Actual new production geometry module compiled using TypeScript strict + noUncheckedIndexedAccess with DOM libraries.
- Actual edited TSX and added test files passed TypeScript syntax transformation. This is not full-project semantic typechecking.
- Compiled production geometry/reveal functions exercised in actual Chromium: 16/16 scenarios (eight viewport/trigger configurations, each with short and long menus). Assertions cover visible bounds, first/middle/last row reveal, retained focus, stable visible rows and no page/outer-scroller movement.
- 1,000 deterministic randomized geometry inputs passed containment, finite-value and min/max-width invariants. An initially discovered fractional-rounding minWidth/maxWidth inversion was corrected and all cases rerun.

## Explicit limits

The local Chromium checks use an isolated DOM fixture with the actual production helper. They are not a full Studio React/browser E2E sweep, not a pixel-diff baseline, and do not establish Firefox/WebKit, actual mobile IME hardware, pen latency or all dynamic font/loading states. The added actual React/Vitest interaction tests and existing menu contracts run in the permanent focused CI workflow with repository dependencies. Full lint/typecheck/test/build remain subject to the unchanged required core gate.

This PR is independent of the focus-return PR #750 and does not claim that other Studio panels, workflow PRs, or all competing apps have been fully implemented or verified.
