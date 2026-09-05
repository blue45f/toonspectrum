# Studio interaction integrity — 2026-09-05

## Implemented scope

This change hardens the existing Studio-wide modal focus-return authority. It does not add a parallel UI state store or change document mutations, drawing output, collaboration permissions, saved project schemas, or menu command IDs.

- Reject CSS-hidden controls and ancestors, inherited disabled fieldsets, closed-details content, inert/hidden/aria-hidden ancestors, and foreign owner documents.
- Preserve the first-legend disabled-fieldset exception and explicit child visibility overrides.
- Skip hidden or disabled responsive copies when selecting a fallback menu trigger.
- Verify the browser actually moved focus. Continue to another eligible anchor after silent or throwing focus failures; never report false success.
- Keep preventScroll, body-only fallback, immediate/timer/frame retries, and each dialog's own restoration priority.
- Give each Document an independent installation and idempotent disposal; an old disposer cannot uninstall a replacement.

## Executed locally

- Production module compiled with TypeScript strict + noUncheckedIndexedAccess, target ES2022, DOM libraries.
- The compiled, modified production module was loaded into actual Chromium using Playwright. Twenty-one focused DOM-contract cases at each of 320x568, 768x1024, 1440x900, and 2560x1440 passed: 84/84, zero failures.
- Browser cases covered CSS visibility, disabled fieldset/legend behavior, details/summary behavior, fallback selection, actual focus acceptance, preventScroll, document boundaries, lifecycle isolation, ordinary modal restoration, and respecting a dialog's own restoration.

## Not established by those checks

The 84 cases are focused DOM-contract executions, not 84 independent feature implementations and not a full Studio visual/E2E audit. No claim is made that pen hardware, pixel rendering, all screen sizes, nested modal focus stacks, Firefox/WebKit, production deployment, or all existing application tests were verified locally.

The existing Vitest tests are retained unmodified. A new integrity suite extends them. The permanent `Studio interaction integrity` workflow runs both suites and targeted lint using repository dependencies. The required real `core` check remains unchanged and must succeed before merge.

## Separate audit findings, not fixed by this patch

`StudioMainMenu.tsx` currently imposes a 240px minimum dropdown height even when less room is available, uses the layout viewport instead of the visual viewport, and focuses keyboard-selected rows with preventScroll without explicitly revealing them inside the menu scroller. These need a separately verified placement/navigation correction; this focus-return patch does not claim to fix menu geometry.
