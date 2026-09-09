# Studio Guided Help benchmark and implementation

Date: 2026-09-09  
Scope: `apps/web/src/domains/creator` help surfaces

## 1. Existing product baseline

The studio already has unusually strong support infrastructure:

- F1 unified command, setting, panel and tutorial search with terminology aliases.
- Feature tutorials and a searchable shortcut surface.
- Live device/browser diagnostics, recovery scanning, third-party notices and a privacy-bounded bug-report package.
- Current-tool metadata derived from the real command catalog.

The missing layer was authored, task-oriented help. `studio-current-tool-help.ts` could expose a label, shortcut, aliases and related catalog entries, but deliberately reported no prose HelpGraph. This meant that users could find *where* a command lived without getting a compact answer to “what do I do next?” or “why did this fail?”.

## 2. Competitive patterns reviewed

| Product | Useful pattern | Product decision |
| --- | --- | --- |
| Adobe Photoshop Discover | Contextually relevant help, tutorials, quick actions and one-click solutions in a single surface | Put current-tool guidance, short procedures, troubleshooting and hand-offs in one dialog; do not claim a quick action unless the existing command registry can execute it |
| Adobe Fresco | A quick tour can be launched from the working document and deeper hands-on tutorials remain available in-app | Make the current document/tool a first-class help entry, then hand off to deeper learning instead of forcing users back to a home screen |
| Figma Actions | One search surface for common actions, assets, plugins and other workflows | Preserve F1 as the authoritative execution/search layer and hand off to it instead of creating a second command system |
| Figma shortcuts panel | Category browsing, learned-shortcut highlighting and a panel that can remain visible while working | Keep shortcuts as a dedicated surface; make Guided Help teach a small next step rather than duplicating the full shortcut catalog |
| Clip Studio Paint Command Bar / Quick Access | Support is one quick command away; frequently used tools and commands can be grouped and searched | Add stable support shortcuts and intent-based entry points without forcing users through a long manual hierarchy |
| Krita Pop-up Palette | Cursor-adjacent access to favorite brushes, colors and view controls to keep artists in flow | Prioritize the current tool and the shortest continuation path; avoid unrelated documentation on the first screen |
| Procreate QuickMenu | Fully customizable fast access and workflow-specific profiles | Organize guidance around user intent and production phase rather than mirroring menu taxonomy |
| Canva Help Center | Question-first search, example questions, topic browsing and a separate “solve your issue” route | Use natural-language Korean examples and keep troubleshooting/recovery visibly separate from learning content |
| Affinity Photo | Tool pages explain the active tool’s context-toolbar settings and link to related topics | Keep compact current-tool facts beside the authored procedure, and expose a tested related-article graph |
| MediBang Paint | Task tutorials explain selection/fill by goal, then surface controls such as gap closing, expansion, anti-aliasing and reference scope | Write failure-oriented recipes for “fill leaked”, “white edge remains” and “only part of the canvas changes” instead of listing controls without a result |
| Photopea | A progressive Learn hierarchy starts with basics and builds toward advanced workflows; tooltips expose names and shortcut letters | Preserve the long-form manual for sequential learning while Guided Help stays compact and task-local |
| Concepts | Focused tool tutorials combine a goal, exact activation path, practical tips and an undo/recovery path | Give every authored article an expected outcome, tips, likely cause and ordered recovery step |

Official references:

- https://helpx.adobe.com/ca/photoshop/desktop/get-started/learn-the-basics/access-discover-panel.html
- https://helpx.adobe.com/fresco/desktop/using/in-app-learning.html
- https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design
- https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard
- https://help.clip-studio.com/en-us/manual_en/690_interface/Command_Bar.htm
- https://help.clip-studio.com/es-es/manual_es/690_interface/Paleta_de_acceso_r%C3%A1pido.htm
- https://docs.krita.org/en/reference_manual/popup-palette.html
- https://help.procreate.com/procreate/handbook/interface-gestures/quickmenu
- https://www.canva.com/help/
- https://affinity.help/photo2/English.lproj/pages/Tools/tools_measure.html
- https://medibangpaint.com/en/tutorial/pc/use-select-tool/
- https://www.photopea.com/learn/
- https://concepts.app/en/tutorials/nudge-tool/

## 3. Implemented synthesis

### Contextual entry

Every command ID currently emitted by `resolveStudioActiveToolCommandId` has an authored article. Opening **Help > Current Tool Help** now goes directly to that tool’s guide. Requests without a known tool open the intent-led help home.

### Authored knowledge graph

`studio-guided-help.ts` contains an offline, version-controlled graph with:

- 27 authored articles, including all 19 active tool commands.
- 30-second start steps and an explicit expected outcome.
- Preconditions/checks, workflow tips, likely causes and ordered fixes.
- Korean task phrases plus Clip Studio, Photoshop, Krita and Procreate terminology.
- Related-article edges and relevant tutorial identifiers.
- One honest primary hand-off per article.

### Intent-first discovery

The help home supports:

- Natural-language queries such as “색이 새요”, “저장 복구” and “일부만 고쳐야 해요”.
- Familiar terms such as `Paint Bucket`, `QuickShape`, `Eyedropper` and `Quick Mask`.
- Eight outcome-led starting points for drawing, filling, selection, lettering, layers, brush creation, export and recovery.
- A bounded empty state that moves to the complete F1 index instead of ending in a dead end.

### Clear surface ownership

The new dialog teaches and diagnoses the task, while existing audited surfaces retain authority:

- F1 owns command availability, execution, panel navigation and complete catalog search.
- The measured support center owns device diagnostics, recovery state, terminology tables, licenses and bug packages.
- The long-form manual still opens in a separate tab.

`studio-help-surface-routing.ts` makes this split explicit and testable without changing the existing help request channel.

### Accessibility and responsive behavior

- True modal semantics, Escape close and a Tab focus loop.
- Background `inert`, body/root scroll locking and exact restoration.
- Opener focus restoration.
- 44 px primary touch targets and mobile safe-area padding.
- Search result status announcements and semantic headings/details.
- Existing theme tokens only; no parallel visual system.

## 4. Verification contracts

Pure graph tests enforce:

- Coverage of every active-tool resolver output.
- Minimum actionable content per article.
- Unique article/command IDs and valid related edges.
- Korean and competitor-term search behavior.
- Stable routing between Guided Help and measured support.

Component tests cover:

- Initial current-tool routing.
- Search, result navigation and empty-state recovery.
- Support/search/manual hand-offs.
- Modal focus, inert, scroll restoration and Escape behavior.
- Mobile safe-area and 44 px target contracts.

## 5. Deliberate non-goals

- No AI-generated answer is presented as authoritative runtime help.
- No second command executor or duplicated availability logic is introduced.
- No telemetry or personalization is added without a consent and retention design.
- No unsupported “one-click fix” is advertised. Guided Help hands execution to the existing state-aware registry.
