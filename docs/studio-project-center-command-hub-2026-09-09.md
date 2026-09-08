# Studio Project Center Command Hub

Date: 2026-09-09  
Scope: `/studio` project center dialog  
Stacked base: `feat/studio-file-control-center-20260909`

## Why this change

The project center already exposes a broad professional workflow: export and archival, planning and production, version/import, direction/publishing/review, plus the file lifecycle and recovery center. The remaining usability bottleneck is retrieval cost. A creator who knows the desired outcome still has to scan several long sections, and repeated actions have no personal shortcut layer.

This change keeps every existing button as the single execution authority and adds a command-navigation layer over those buttons. Search results, favorites, and recents call the original DOM target, so save, import, publish, review, and recovery side effects do not fork into a second implementation.

## Benchmark findings

| Product | Observed project/navigation pattern | Applied decision |
| --- | --- | --- |
| CLIP STUDIO Projects / Manage works | Labels, favorites, multi-select, per-work sync, cloud/device views, previous-version download and detail metadata | Add persistent favorites and explicit scopes now; preserve sync/version/library work as dedicated project-library concerns |
| Figma file browser (2026 folder model) | Search and recents in the file browser, starred content, nested folders, inherited or restricted access | Treat section scopes as a lightweight in-editor information architecture; keep the `/studio/projects` link as the path for future nested organization and permissions |
| Canva workspace | One-click favorite actions and starred designs, folders, and templates for a personalized workspace | Show favorites both as a dedicated view and as immediate quick access when the full catalogue is open |
| Adobe Photoshop Home | Recent cloud documents, keyword filters, shared/deleted states, offline visibility | Add recent-action history and intent/keyword search; retain current disabled-state explanations instead of hiding unavailable commands |
| Notion Search / Library | `Cmd/Ctrl+P` or `Cmd/Ctrl+K`, recent results, best-match ordering with title weight, favorites and filtered library views | Rank labels above descriptions/sections, support keyboard result movement and execution, and expose recent/favorite views |

### Primary references

- CLIP STUDIO official: https://tips.clip-studio.com/en-us/articles/889
- Figma Help, file browser: https://help.figma.com/hc/en-us/articles/14381406380183-Guide-to-the-file-browser
- Figma Help, folders: https://help.figma.com/hc/en-us/articles/360038006494-Create-and-manage-folders
- Canva newsroom, customizable workspace and starred content: https://www.canva.com/en_in/newsroom/news/glow-up/
- Adobe Photoshop Help, Home screen: https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/homescreen-overview.html
- Notion Help, workspace search: https://www.notion.com/en-gb/help/search
- Notion Help, Library: https://www.notion.com/en-gb/help/manage-your-library

## Implemented UX contract

### Search quality

- NFKC normalization makes full-width file-format input and mixed punctuation predictable.
- Multi-token AND matching searches labels, descriptions, section names, accessibility names, titles, authored search terms, and element identifiers.
- Intent synonyms bridge Korean and common production English, including backup/archive, publish/release, review/QA, version/checkpoint, import/open, export/download, and collaboration/share.
- Exact label matches outrank label prefixes, description matches, section matches, and keyword matches.
- Results are capped to 18 for scan speed while reporting the full match count.

### Personalized navigation

- Favorites persist locally with defensive parsing, de-duplication, and a 24-item cap.
- Recent actions persist locally with most-recent-first ordering and an 8-item cap.
- Favorites and recents are available as dedicated result views.
- Up to three favorite and recent commands are surfaced as quick-access actions in the full catalogue view.
- Storage failures never block current-session use.

### Information architecture

- Existing authored section titles become horizontal scope filters.
- File lifecycle content has its own scope.
- Query, favorites, and recents switch to a focused result view and temporarily hide the long authored catalogue.
- Clearing the query or returning to All restores every element to its authored hidden state.
- Dynamic/lazy-mounted commands are re-indexed with a mutation observer without observing the command hub's own rendering.

### Keyboard and accessibility

- `/` focuses search unless the user is editing another field.
- Arrow keys, Home, End, and Enter navigate and execute ranked results without moving focus from search.
- `Alt+P` toggles the active result's favorite state.
- Escape clears the query first, then resets a scoped view, leaving the existing dialog-dismiss layer as the final Escape owner.
- Result counts and action/favorite changes use polite live regions.
- Disabled original commands remain represented and cannot be executed through the proxy result.

## Verification

Focused Vitest coverage validates:

1. Unicode/punctuation normalization.
2. Exact-result precedence, Korean/English synonyms, and multi-token intent matching.
3. Stable action keys and defensive local persistence.
4. Search over visible text, title, and accessible name.
5. Slash/Escape keyboard ownership.
6. Enter execution through the original command and recent-history recording.
7. Favorite persistence and favorite-only view.
8. Authored section filtering and original visibility restoration.

## Follow-up boundary

The command hub deliberately does not invent backend project records. Nested folders, labels applied to works, thumbnail/list layouts, bulk move/delete/sync, cloud conflict resolution, project-level roles, and trash restoration belong to `/studio/projects`, where they can be backed by durable project identity and authorization rather than local command metadata.
