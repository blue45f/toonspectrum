# Studio × Figma collaboration benchmark — 2026-07-13

## Scope

This benchmark translates Figma's collaboration strengths into webtoon-production workflows. It
does not copy Figma's visual identity or claim file compatibility. Sources are Figma's official
documentation for [multiplayer tools](https://help.figma.com/hc/en-us/sections/360006780134-Multiplayer-tools),
[comments](https://help.figma.com/hc/en-us/articles/360039825314),
[branching](https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching), and
[change comparison](https://help.figma.com/hc/en-us/articles/15023193382935-Compare-changes-in-Dev-Mode).

## Product translation

| Figma strength | Webtoon-specific translation | ToonSpectrum status |
| --- | --- | --- |
| Multiplayer presence and cursors | See assistants' cursors on the active long-scroll page, including their current tool | Implemented: authenticated room is editor-lifetime, normalized cursor overlay is isolated from the large editor, immediate leave/page clear plus 3-second stale cleanup, WCAG-readable deterministic colors, no export contamination |
| Follow another collaborator | Click an assistant avatar to follow page changes while reviewing cuts | Implemented: sticky presence dock and page-follow toggle; invalid/unknown page IDs are ignored |
| Canvas comments | Keep editorial notes attached to pages, cuts and elements | Implemented: unresolved threads are projected as grouped, accessible DOM pins that follow element bounds and open the existing thread rail |
| Comments separated from artwork | Review UI must never render into exported episode pixels | Implemented: cursor and comment overlays are DOM siblings outside Konva and color-grade filters |
| Persistent multiplayer independent of panels | Closing team management must not disconnect the editing room | Implemented: `StudioLiveCollaborationProvider` owns the room; the team panel owns only screen-capture/WebRTC lifetime |
| Late screen-share discovery | A reviewer opening the team panel after sharing started must still find the host | Implemented: the late controller sends a bounded authenticated discovery signal; the host replays share metadata without granting media access |
| Explicit recovery/fallback | Do not silently change the collaboration trust boundary | Implemented: authenticated server retry and user-selected same-origin local-tab fallback remain distinct; missing credentials fail closed and terminal ACL revocation disables fallback |
| Named versions and compare | Compare episode revisions before restoration | Partially available: server revisions/checkpoints exist; semantic before/after comparison and named versions remain planned |
| Branch/review/merge | Let an assistant propose a lettering or coloring pass without overwriting main | Planned after semantic diff and server review comments; snapshot-only pseudo-branches would not provide safe merge semantics |

## Deliberate safety boundaries

- The current server lease protocol is authoritative, but the editor must not treat
  `claimLock() === true` as acquisition: in server mode it only means the request was sent. Mutation
  enforcement will be enabled only after a resource-correlated acquire/deny/timeout contract and
  rollback tests exist.
- Local `BroadcastChannel` collaboration is a same-origin tab preview, not an internet team room and
  not a cross-device authoritative lock service. Its v1 presence wire remains the legacy exact
  two-field shape so older open tabs continue to discover newly deployed clients; tool metadata is
  additive only on the authenticated server adapter and on the already-compatible cursor message.
- Existing comments are saved inside the shared Studio document for editors. A commenter-only,
  independently revisioned server review-thread store is still required before claiming Figma-level
  reviewer workflows.
- Screen capture remains panel-scoped on purpose: closing the panel stops capture tracks and P2P
  connections, while low-risk presence/cursor state remains connected. Discovery only replays the
  share id/label; every viewer still requests access and every host still approves individually.
  During a rolling deploy, a newly deployed late viewer cannot force a pre-deploy host controller
  to understand the additive discovery sentinel. A future server-side active-share snapshot is the
  safe compatibility bridge for that short mixed-version window.

## Next implementation order

1. Resource-correlated authoritative lock acquisition and hierarchical resource conflicts.
2. Drag/transform/text/pixel-tool mutation guards with Konva rollback on denial.
3. Server editorial comment threads with commenter permission, mentions and realtime events.
4. Semantic and visual revision comparison, then named versions.
5. Durable operation stream or CRDT foundation, followed by three-way branch review and merge.
