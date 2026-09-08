# Studio command hub benchmark and implementation note

- Date: 2026-09-09
- Surface: `/studio`
- Goal: make feature discovery and execution feel like one coherent editor command system instead of two unrelated search palettes.

## Benchmarked interaction patterns

| Product | Verified pattern | Product implication for ToonStudio |
| --- | --- | --- |
| Figma Design | The Actions menu opens with `Command K` / `Control K` and combines common productivity actions, assets, plugins, widgets, and AI tools. | Use the industry-familiar shortcut for the editor's authoritative command surface, not a second static palette. |
| FigJam | Quick actions are keyboard-first: open the bar, type an action or object, then press Enter. The screen-reader flow also exposes actions and settings that have no dedicated shortcut. | Search results must advertise what Enter will do and execute the same handler as the visible menu. |
| Adobe Photoshop | Discover combines tools, contextual help, tutorials, quick actions, and help articles in one place, with a global shortcut and visible search entry point. | Keep commands, inspector destinations, tutorials, and terminology aliases in one search index. |
| Clip Studio Paint | Quick Access can run tools, auto actions, palette display commands, and settings; the same controls are available in Companion Mode. | Treat tools and panel visibility as safe direct actions and keep mobile/desktop entry points converged. |
| Blender | Menu Search (`F3`) searches interface operators, shows where each command lives, supports arrow-key navigation, and executes with Return. | Preserve location context, keyboard navigation, and direct activation while keeping destructive operators explicit. |

Primary references:

- https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design
- https://help.figma.com/hc/en-us/articles/14477051168791-Use-FigJam-with-a-screen-reader
- https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/access-discover-panel.html
- https://help.clip-studio.com/en-us/manual_en/840_options/Companion_Mode.htm
- https://docs.blender.org/manual/en/5.2/interface/operators.html

## Repository findings

Before this change, ToonStudio already had a strong domain search index with command catalogue entries, inspector routes, tutorials, and CSP/Photoshop/Krita/Procreate aliases. It also had honest action badges, disabled reasons, keyboard navigation, and an explicit execution registry.

The remaining product gap was the boundary between that editor-native system and the app-wide command palette:

1. `Command K` / `Control K` always opened the app-wide static palette, even on `/studio`.
2. The app-wide Studio tool entries dispatched synthetic keyboard events instead of using the live menu command handlers.
3. The editor-native search was discoverable through F1 and local buttons, but not through the shortcut users expect from Figma-class editors.
4. Direct execution required per-row annotations even for inherently reversible tool, view, selection, colour, and panel actions, so most command results still fell back to help.

## Implemented design

### One authoritative Studio shortcut path

The shared AppShell now asks the mounted Studio command-search host to open when `Command K` or `Control K` is pressed on a Studio route. The request crosses a small shared bridge rather than importing the creator domain into shared UI.

The bridge is deliberately synchronous and non-replaying:

- a mounted Studio host returns `true` and opens the registry-backed search;
- an unmounted or deferred Studio host returns `false`;
- the global palette remains the fallback, preventing a dead shortcut during initial loading or failures;
- leaving Studio keeps the existing global palette behavior unchanged.

### Risk-tiered direct activation

The execution registry now admits two classes of results:

1. automatically safe/reversible command families: `tool`, `view`, `window`, `select`, `color`, and non-reentrant `help`;
2. explicitly reviewed commands using `searchActivation: "execute"`.

A small exact allowlist covers reversible affordances in broader namespaces, such as undo/redo, copy, history, app pen settings, export-panel opening, project-center opening, and copy-image-to-clipboard.

The following remain blocked unless separately reviewed, and dangerous rows are blocked even when annotated:

- save and publish;
- delete, cut, paste, layer merge, insertion, and content transforms;
- AI or network-costing operations;
- the command that opens command search itself;
- malformed command IDs.

All admitted commands reuse the menu row's live `onSelect` closure and disabled reason. No second execution implementation is introduced.

### Discoverability and accessibility

The visible Studio search trigger now advertises `Command K` and F1. The existing APG combobox model, `aria-activedescendant`, result location, action badge, disabled reason, scope chips, focus restoration, and mobile entry point remain unchanged.

## Verification contracts added

- macOS `Command K` routes to Studio and does not open the global palette;
- Windows/Linux `Control K` does the same;
- nested Studio routes are recognized;
- global palette behavior remains intact outside Studio;
- the global palette is a fallback when the Studio host is not ready;
- the Studio host accepts the AppShell request and preserves the requested search scope;
- safe command families and reviewed commands become bindings;
- consequential, dangerous, malformed, and reentrant commands remain excluded.

## Follow-up opportunities

These are intentionally separate from this low-risk integration:

- recent and favorite commands with per-user persistence;
- command previews and parameter entry before execution;
- telemetry for zero-result searches and help-only results;
- full migration from menu closures to a single typed CommandRegistry;
- replacing the app-wide palette's remaining synthetic Studio-tool key events after all tool commands are registry-native.
