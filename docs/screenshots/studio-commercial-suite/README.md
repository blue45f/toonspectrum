# Studio commercial suite — mobile verification captures

Captured on 2026-07-11 from the local Vite production-equivalent UI at a 375 × 812 CSS-pixel viewport.
These are implementation evidence, not product mockups.

| Capture | Verified flow |
| --- | --- |
| `writer-room-mobile.png` | Seven-stage story planning, AI draft review, and canvas projection readiness |
| `ai-provenance-mobile.png` | Provider/model/result provenance without raw prompts or credentials |
| `publish-package-mobile.png` | Publish preflight and deterministic single-ZIP package workflow |
| `auto-actions-mobile.png` | Typed batch actions, page scope, dry run, automatic recovery point, and one-step undo |

For each screen the interactive controls were checked at the mobile viewport, horizontal document
overflow was zero, and critical touch controls were at least 44 CSS pixels tall. The archive and publish
flows were also exercised through real browser downloads; their binary ZIP integrity is covered by the
corresponding automated tests.
