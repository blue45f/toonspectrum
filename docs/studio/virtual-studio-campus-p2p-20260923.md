# Virtual Studio Campus P2P completion — 2026-09-23

Status: implemented in `feat/virtual-studio-campus-p2p-20260923`; production deployment is not included.
This change extends the existing Virtual Studio rather than replacing its project, document, review,
world-publication or hiring authorities. Space movement and direct peer data never grant access to a
work, manuscript, review, team or interview.

## Product completion in this change

- A pre-entry lobby selects one of the four player characters or deterministic automatic selection.
  The live collaboration provider, publication lookup, signaling and media UI are not mounted until
  the user explicitly enters. Microphone and camera remain off and require their existing consent.
- The selection is versioned in local browser preferences, migrates the previous avatar key and is
  also passed directly into the current session when browser storage is unavailable.
- Four dedicated NPC identities now use a separate cast registry and 35 ToonStudio-owned PNG files.
  NPC keys, URLs and bytes do not overlap player sprites. The first rendered NPC frame also uses the
  NPC fallback, so slow loading cannot briefly present a real player character as an NPC.
- A project-scoped whiteboard runs on the existing reliable direct RTC data channel. Strokes, notes,
  removals and clear operations travel peer-to-peer; no new board relay, database table or object
  storage is introduced. A browser may recover only its own authored items for the exact world
  revision. Remote teammate content is not silently cached.
- The board protocol has exact world/board/revision scope, per-session epochs, monotonic sequence
  numbers, strict packet keys, owner-only mutations, viewer read-only behavior and bounded frames.
  Each participant may publish at most 20 entities with at most 48 quantized points per stroke.
- A shared room-module catalog exposes P2P huddles, the whiteboard, work sessions, interview waiting,
  an invite-only interview conversation, a quiet lounge, tarot, traditional readings and the arcade.
  Entries declare privacy, direct-transport use, capacity, project requirement and a safe route,
  authored zone or existing panel. The catalog does not execute arbitrary code or mint permissions.
- Team invitations can carry a non-authoritative entry hint for the team lobby, an already-linked
  project space or the existing hiring waiting-room manager. The one-time secret stays in the URL
  fragment and is removed before acceptance. The server still receives only its existing
  email/role/revision command and rechecks every team and project permission.

## P2P topology and cost boundary

Presence, reactions, social invitations, exact-roster conversations and this whiteboard use the
existing direct WebRTC data path after authenticated signaling. The current media product remains a
small-group mesh: up to three remote participants, four people including self. The current direct
peer overlay admits at most eight remote peers per browser, so the board catalog advertises nine
people including self and does not reinterpret the larger presence-store bound as product capacity.
The server remains necessary for authentication, membership and permission checks, one-time team
invitations, world publication revisions, durable project documents, reviews and work-session
records. Those are authoritative state and are not moved into untrusted peer packets merely to save
infrastructure cost. Large meetings, public broadcasts and reliable operation across restrictive
NATs require a separately approved TURN/SFU capability and measured admission policy.

## Security and privacy invariants

- Entering a room, approaching a person or opening a board never enables microphone, camera,
  recording, screen sharing, AI, publication or billing.
- A peer can update or delete only entities carrying that peer's session ID and current epoch.
- Packets from an unconnected sender, another target, another world revision, a stale epoch, an old
  sequence or an unknown field set are ignored.
- Routes containing invite, token, code or secret parameters cannot be registered as room modules.
- Interview modules are never public. The waiting-room entry returns to the existing hiring
  workspace `panel=rooms`; the virtual interview conversation still requires current project access
  and exact-roster consent.
- NPCs never enter online-member counts, teammate cards, direct conversations or media rosters.
- Local whiteboard recovery is scoped by world ID, board ID and content revision, and stores only the
  current browser participant's own bounded entities.

## Asset provenance and reproducibility

`scripts/generate-virtual-studio-npc-cast.py` deterministically generates the dedicated cast under
`apps/web/public/assets/virtual-studio/npc-cast-v1`. `art-manifest.json` records SHA-256, byte size and
image dimensions. Verification must assert 35 PNG files, matching manifest entries and zero byte
hash overlap with `production-v2/player-*.png`.
## Verification targets

```sh
pnpm exec vitest run \
  apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.test.ts \
  apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceEntryLobby.test.tsx \
  apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-cast.test.ts \
  apps/web/src/domains/creator/virtual-space/studio-virtual-space-p2p-board.test.ts \
  apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceP2pBoard.test.tsx \
  apps/web/src/domains/creator/virtual-space/use-studio-virtual-space-p2p-board.test.tsx \
  apps/web/src/domains/creator/virtual-space/studio-virtual-space-room-catalog.test.ts \
  apps/web/src/domains/creator/virtual-space/studio-spatial-invite-context.test.ts \
  apps/web/src/domains/creator/production-hub/TeamWorkspacePage.test.tsx \
  apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.social.test.tsx \
  apps/web/src/domains/creator/virtual-space/studio-virtual-space-acceptance.test.ts
pnpm run typecheck
pnpm run validate:architecture
pnpm run build
pnpm run check:studio-bundle
```

## Deliberate limits

No production deployment, database migration, new server, paid RTC provider, automatic email,
recording, legal identity verification or large-meeting claim is included. The existing world
authoring already owns room/prop/collider/spawn/portal/NPC editing, templates, undo/redo and revision
publication; this change exposes the new modules through that world rather than creating a second
editor. Physical mobile devices, multiple WAN/NAT environments, manual screen-reader sessions and
long-duration multi-peer soak remain release-environment acceptance work.
