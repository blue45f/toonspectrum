# Studio approachable workflow — 2026-09-13

## Scope and benchmark

Reduce the number of simultaneously presented specialist tools without removing commands,
changing the saved workspace, or replacing the existing command-execution registry.
This is a scoped implementation, not proof of usability superiority or an exhaustive competitor audit.

Official references reviewed:

- CLIP STUDIO PAINT Simple / Studio Mode: https://support.clip-studio.com/en-us/faq/articles/20230040
  Applied principle: a simpler starting presentation with a reversible path to specialist tools.
- Procreate QuickMenu: https://help.procreate.com/procreate/handbook/interface-gestures/quickmenu
  Applied principle: a small set of common actions; not a copied radial-menu implementation.
- Figma Actions: https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design
  Applied principle: search instead of memorizing menu locations. Reuse Studio's existing registry-backed search.

## Implementation

- Standard and focus toolbar presentations retain assets, cuts, drawing, insertion, balloons, images and color.
- Specialist reference, scene/3D, style, AI and utility launchers are revealed with `더 많은 도구`.
  `기본 도구만` reverses the disclosure. Full mode stays expanded. Saved preferences are not rewritten.
- An already-open specialist popover remains mounted when launched from another entry point.
  Open reference panels retain a close affordance; selected images retain frame-animation access.
- `시작 안내` is explicit, never automatic. Six described tasks lead to canonical cut creation,
  stroke-safe pen activation, balloon/background menus, preview and tutorials.
- Locked document/page edits are disabled with reasons; preview and help remain usable.
- `도구 찾기` uses the existing command-search channel. A missing host produces visible feedback.
- Native modal dialog, explicit close, Escape, focus return, labeled 44px minimum entry buttons,
  responsive task cards and reduced-motion-aware transitions. Older browsers receive an explicitly
  non-modal fallback, not a falsely labeled modal.
- No new third-party dependency, telemetry, backend, storage migration or paid service.

## Validation boundaries

The added workflow runs the new behavior suites plus existing toolbar, hint, lazy-boundary,
density and 3D-entry contracts. It supplements rather than replaces protected `CI / core`.
The main workflow and its required checks are unchanged.

Local TypeScript parsing is only syntax validation. Component tests use jsdom and do not prove
browser top-layer behavior, real-device touch behavior, drawing latency, or production deployment.
Production browser access, remote device connection and the external QA connector were unavailable
in this session; no live-site, screenshot or device-validation success is claimed.

Merge only after the exact PR head's required core and new targeted workflow pass.

## Further evidence needed

Run first-use task testing (first cut, first balloon, undo, export), keyboard-only and screen-reader
checks, narrow viewport/tablet checks, and production smoke testing after deployment. Compare task
completion, errors and completion time with the previous UI before claiming a measured improvement.
