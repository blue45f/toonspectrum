# ToonStudio help experience benchmark and implementation

Date: 2026-09-09  
Scope: `/studio` task help, learning, shortcuts, troubleshooting and feature discovery

## Benchmark signals

| Product / source | Useful pattern | ToonStudio decision |
| --- | --- | --- |
| [Canva Help Center – keyboard shortcuts](https://www.canva.com/help/canva-keyboard-shortcuts/) | Question-first entry, task-grouped shortcut reference, macOS/Windows separation, “Was this helpful?”, related content | One omnibox for symptoms/features/keys, grouped shortcut results, per-article feedback, related recommendations |
| [Clip Studio Paint – Quick Access Palette](https://help.clip-studio.com/en-us/manual_en/690_interface/Quick_Access_Palette.htm) | Feature search, search history, result location, direct execution, configurable sets and phone companion | Recent searches, command-search handoff, current-tool context and touch-sized responsive navigation |
| [Adobe Photoshop – Discover](https://helpx.adobe.com/photoshop/using/photoshop-discover.html) | In-product learning, contextual recommendations and action-oriented search | Keep guidance inside the editor and recommend articles from the active tool; open real tutorial surfaces rather than duplicating them |
| [Figma Help Center](https://help.figma.com/) | Resource-centre model, keyboard-first discovery and short task articles | A single help home with short, scannable task articles and a stable F1 escape hatch |
| [Procreate Handbook](https://help.procreate.com/procreate/handbook) | Gesture and tool learning written around creative tasks | Include canvas navigation, pen/touch and mobile-sized guidance instead of desktop-only feature descriptions |
| [Krita Manual](https://docs.krita.org/) | Searchable manual, reference plus task tutorials, recovery/performance documentation | Separate “learn” and “solve” modes while linking to measured device diagnostics and recovery tools |

## Gaps after integrating the latest `main`

- The editor now contains authored current-tool and contextual troubleshooting dialogs in addition to the measured technical surfaces. They remain specialist destinations rather than one task-oriented front door.
- Tutorials, shortcut help, manual, command search, contextual recipes and technical support have independent navigation and do not share recent searches, bookmarks or outcome progress.
- The authored specialist help is Korean-first; the global front door still needs bilingual task discovery and familiar English editor terms.
- There is no offline-aware prioritisation, help-specific feature discovery, local bookmark/history continuity, explicit multi-step learning progress or article feedback.

The implementation therefore preserves the existing `StudioContextHelpDialog`, `StudioGuidedHelpDialog` and measured support center. The new hub sits above them and routes to each canonical surface instead of replacing or copying its specialist behavior.

## Implemented information architecture

1. **Home** — symptom/feature/shortcut omnibox, current-tool context, quick actions, recommendations, bookmarks and topic browsing.
2. **Guided learning** — four outcome-based checklists. Completion is always explicit and stored only in browser storage.
3. **Shortcuts** — searchable default key reference plus a handoff to the existing user-configured shortcut surface.
4. **Troubleshoot** — routes symptoms to the existing measured diagnostics, recovery, terminology and privacy-previewed bug-report package.
5. **What’s new** — concrete help-surface changes with a local reviewed state; no marketing-only release claims.

## Content and trust rules

- Guidance is bilingual (Korean/English) and searches both languages plus familiar editor terms.
- No server upload occurs from bookmarks, recent searches, checklist progress or feedback; all are localStorage with failure-safe fallbacks.
- Offline state changes recommendation priority toward save/recovery guidance.
- Technical claims remain in the existing probe-backed surfaces rather than being copied into static prose.
- The full manual opens in a new tab so an unsaved editor is never replaced.
- The existing tutorial and shortcut components remain canonical and are opened from the hub.

## Accessibility and responsive behaviour

- `role="dialog"`, `aria-modal`, labelled search, keyboard focus entry/trap/return and Escape close.
- Background content is inert and document scrolling is restored on close.
- Mobile bottom-sheet layout, horizontal tab navigation, touch-sized controls and safe-area padding.
- Search result counts use a polite live region; selected states use `aria-current`, `aria-pressed` or native checkboxes.
- Colour is never the only state cue; labels, icons and checkmarks accompany visual state.

## Validation targets

- Knowledge graph integrity: unique IDs, valid guide references and non-empty procedural steps.
- Korean symptom and English familiar-term search ranking.
- Active-tool and offline recommendation changes.
- Menu request wiring, tutorial/shortcut action handoff and existing command-catalog compatibility.
- Dialog context, search, troubleshooting routing, explicit progress persistence and Escape close.
