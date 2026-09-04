# Studio real-time collaboration V19 benchmark

- Date: 2026-09-04
- Scope: ToonSpectrum Studio live presence, following, cursor rendering, session communication, screen sharing, and collaboration safety
- Principle: durable drawing/document changes remain on the existing CRDT and authoritative-lock paths; attention and cursor preferences remain ephemeral presentation state.

## Competitive patterns reviewed

| Product / source | Product pattern | ToonSpectrum decision |
| --- | --- | --- |
| [Figma Spotlight](https://help.figma.com/hc/en-us/articles/360040322673-Present-to-collaborators-using-spotlight) | Follow another participant across canvas movement and page changes; make following and stopping conspicuous without replacing the canvas with a video stream | Keep the existing participant follow path and expose it as a one-tap **focused follow** control beside the always-visible presence dock |
| [Figma multiplayer cursor visibility](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options) | Users can hide multiplayer cursors when they become distracting | Add `all`, `followed`, and `hidden` cursor scopes as a local viewport preference |
| [Miro attention management](https://help.miro.com/hc/en-us/articles/360013358479-Attention-management) | Follow a collaborator, bring a participant or everyone to the facilitator, and let direct canvas interaction end attention capture | Use explicit focused follow now; reserve forced/opt-out presenter broadcast for a protocol revision because it needs remote consent, viewport payloads, and server authorization |
| [Miro People bar](https://help.miro.com/hc/en-us/articles/20967864443410-Miro-s-new-simplified-user-interface) | Central participant list combines follow/search/bring-to-me and cursor visibility | Put the most frequent attention controls in a compact canvas popover and retain the full Team panel for role, chat, screen, and recovery operations |
| [tldraw collaboration](https://tldraw.dev/sdk-features/collaboration) | Live cursors, viewport following, custom presence, connection status, offline queuing | Preserve ToonSpectrum's split between ephemeral presence and durable CRDT operations; prioritize viewport-only controls without widening document state |
| [tldraw cursor chat](https://tldraw.dev/sdk-features/cursor-chat) | Very short messages follow the pointer and expire automatically | Keep the existing bounded session chat in V19; cursor-anchored chat is a subsequent protocol/UI lane so it cannot accidentally become durable document content |
| [Yjs awareness](https://docs.yjs.dev/getting-started/adding-awareness) | Presence and cursors are awareness data, not persisted document data; excessive awareness can distract users | Cursor scope, focused peer, and trail choices remain local presentation preferences and never enter the Yjs document |
| [Canva Whiteboards](https://www.canva.com/online-whiteboard/) | Colorful live cursors and comments make collaborator activity legible | Retain participant colors, canvas comment pins, and team comments while adding user-controlled cursor density |

## V19 implementation

### Focused follow UX

- A 44 px canvas control sits beside the existing always-visible presence dock.
- The popover lists active participants first and starts/stops the existing follow path in one action.
- Choosing a participant automatically selects `followed` cursor scope so the presenter remains visually dominant.
- The full Team panel remains one tap away for invitations, roles, session chat, screen sharing, synchronization status, and recovery.
- Escape, outside click, explicit close, ARIA state, focus return, and coarse-pointer target sizes are included.

### Cursor visibility and accessibility

- `all`: show the most relevant live cursors.
- `followed`: show only the participant currently being followed.
- `hidden`: remove remote cursors while leaving document synchronization and comment pins active.
- Live stroke trails can be disabled independently; pointer position and participant identity remain visible.
- The preference is local to the viewer and stored without user/session identifiers.
- Cross-tab `storage` events keep the viewer's display preference consistent.
- When no preference exists and `prefers-reduced-motion: reduce` is active, trails default to off.

### Performance policy

The room still retains up to 64 recent cursor states for reconnect and follow correctness. The DOM overlay receives at most 12:

1. followed participant,
2. participants actively drawing,
3. freshest remaining cursor states.

Cursor events are still coalesced to one animation frame. When trails are disabled, point arrays are removed before React/DOM rendering, avoiding SVG polyline creation and reducing allocation/paint work. Hiding cursors returns a stable empty snapshot and does not unsubscribe or weaken document synchronization.

### Safety boundaries retained

- No cursor/view preference is written into the CRDT document, project snapshot, activity log, or recovery bundle.
- Existing server ACL, authenticated Socket.IO join, role capabilities, authoritative edit leases, CRDT outbox, acknowledgement barrier, and recovery-required boundary are unchanged.
- Screen media remains user-initiated WebRTC with per-viewer approval and memory-only signaling.
- The new controls cannot turn an authenticated server work into an unauthenticated local room.

## Verification

- Pure selection tests cover hidden/followed modes, focused/drawing/freshness priority, render budgets, and immutable trail stripping.
- jsdom interaction tests cover the compact popover, hidden mode, trail toggling, and one-tap focused follow.
- Existing cursor-store tests continue to cover one room subscription, rAF coalescing, leave/sentinel cleanup, and TTL expiry.

## Deliberately separate next protocol work

The following should not be simulated only in UI:

- **Spotlight me / bring everyone to me**: add an optional bounded viewport-awareness payload, presenter capability checks, recipient opt-out, interaction-to-break-follow behavior, rate limiting, and server relay tests.
- **Cursor chat**: add a short-lived targeted presence message with a strict character limit, automatic expiry, rate limiting, and no chat/document persistence.
- **Shared selections and viewport rectangles**: add purpose-specific presence records rather than overloading cursor packets.
- **Large-room fanout metrics**: record sampled cursor/presence queue delay and dropped decorative packets separately from durable CRDT acknowledgement telemetry.
