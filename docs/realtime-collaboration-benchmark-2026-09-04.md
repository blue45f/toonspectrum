# Studio realtime collaboration benchmark and V19 upgrade

Date: 2026-09-04  
Scope: ToonSpectrum Studio canvas collaboration

## Executive summary

Studio already has a stronger collaboration foundation than a typical canvas editor: authenticated
Socket.IO rooms, strict replay-resistant envelopes, active/idle presence, remote cursors, expiring
edit leases, ephemeral chat, screen sharing, voice signaling, Yjs/CRDT durability, recovery export,
a binary ink lane, P2P fan-out, and an authoritative fallback path. V19 therefore does not replace
the existing authority model. It closes the highest-impact experiential and performance gaps around
cursor continuity, constrained networks, large rooms, discoverability, user control, lightweight
cursor conversation, and presenter attention.

The release principle is **degrade disposable presence before durable work**. Cursor cadence, trail
detail, and local DOM cursor count may adapt. CRDT updates, server acknowledgements, lock operations,
comments, ordinary room chat, screen signaling, and negotiated binary ink are not sampled or
rewritten by this layer.

## Benchmark signals

| Product / architecture | Useful pattern | ToonSpectrum status after V19 |
| --- | --- | --- |
| Figma multiplayer | Visible collaborators, cursor chat, spotlight/follow, cursor-priority rules in large sessions, and a dedicated show/hide multiplayer cursors control | V19 adds persistent cursor visibility, five-second cursor chat, and priority admission for the cursor-chat author, followed collaborator, active drawing, and active editors. Existing page follow remains available. |
| Miro attention management | Follow a collaborator, opt into a presenter invitation, bring everyone to a presenter, and stop follow on local navigation | V19 adds an authenticated, expiring “current work location” invitation with an explicit Follow or Dismiss choice. It intentionally does not seize another user’s camera. |
| Canva | Clear participant colour and contextual comments close to the object under review | Studio keeps deterministic participant colour and anchored comment pins. V19 fixes the cursor-visibility path so hiding cursors cannot hide comment pins. |
| tldraw | Lightweight awareness, camera follow, and graceful offline behavior | Studio keeps its existing follow and durable recovery boundaries. V19 moves high-frequency cursor work behind an isolated adaptive transport. |
| Liveblocks | Explicit connection/presence status and reconnection-aware UX | Studio already exposes transport and authoritative-save status. V19 adds a separate cursor-quality signal so users can distinguish document safety from disposable presence quality. |
| Yjs awareness | Awareness is ephemeral and separate from the durable document | V19 preserves this boundary: only `cursor:update` is coalesced or compacted. Cursor chat and attention are short-lived room events; Yjs/CRDT operations remain authoritative and durable. |

## Problems found in the pre-V19 path

1. `StudioLiveRoom.publishCursor` used a leading-edge interval. A cursor event arriving inside the
   interval returned `false`, so the final location in a fast pointer burst could be lost.
2. Cursor cadence was fixed regardless of room size, background visibility, browser data-saver, or
   effective network type.
3. The receiver already used an isolated external store and animation-frame batching, but the sender
   had no equivalent latest-wins trailing queue.
4. Users could follow collaborators, but there was no persistent, discoverable preference to hide
   multiplayer cursors without disabling collaboration.
5. Document safety and cursor quality were represented by one visual area. A low-quality presence
   lane could look like a document durability problem even when CRDT acknowledgements were healthy.
6. Brief spatial feedback required either opening the team panel or writing an ordinary room-chat
   message, which separates the feedback from the cursor location it describes.
7. A presenter could be followed individually, but could not send a bounded, opt-in invitation to
   the room from the always-visible canvas chrome.
8. The first cursor-visibility implementation returned before rendering the whole live overlay,
   which could unintentionally hide durable review comment pins together with disposable cursors.

## V19 implementation

### 1. Sequence-safe latest-wins cursor transport

`createStudioAdaptiveCursorTransportFactory` decorates either the authenticated server transport or
the local BroadcastChannel transport.

- The first eligible cursor is sent immediately.
- Events inside the adaptive interval replace a single pending cursor; the newest location wins.
- A pending cursor is flushed before any later non-cursor envelope. If it cannot be sent at that
  barrier, the old disposable cursor is dropped so a stale sequence is never retried after a newer
  lock, chat, presence, voice, or signaling message.
- The clear-cursor sentinel is immediate and cancels queued pointer work.
- Failed disposable sends receive one bounded trailing retry while the inner transport is ready.
- Close cancels timers and removes the scoped diagnostics snapshot.

This retains the existing strict sequence/replay contract while fixing lost final-pointer samples.

### 2. Adaptive cadence and bounded fan-out

The cadence policy is deterministic and unit-tested:

| Condition | Cadence target | Trail behavior |
| --- | ---: | --- |
| Active drawing, small room | 16 ms | Full cursor trail |
| Ordinary movement, small room | 24 ms | Full cursor trail |
| 8+ peers | at least 32 ms | Full trail unless another constraint applies |
| 24+ peers | at least 48 ms | Full trail unless another constraint applies |
| 64+ peers | at least 72 ms | Compact trail |
| 128+ peers | at least 120 ms | Compact trail |
| 3G / 2G / slow-2G | 64 / 100 / 160 ms | Compact at 64 ms or slower |
| Browser data saver | at least 96 ms | Compact trail |
| Background tab | 250 ms | Compact trail |

Compaction removes only optional cursor polyline points. The normalized pointer location, drawing
state, tool, page, colour, width, and opacity continue to travel. Binary ink remains on its existing
negotiated lane and is never JSON-reencoded or sampled by V19.

The receiver also bounds local DOM/SVG cursor work after ordering candidates by user value:

1. author of an active cursor-chat bubble;
2. collaborator currently being followed;
3. participant actively drawing;
4. active participant;
5. idle participant.

The local presentation cap is 64 cursors in the live tier, 40 in balanced mode, and 20 in constrained
mode. This never removes a participant from presence or changes document synchronization.

### 3. User-facing cursor controls

- Persistent `remoteCursorsVisible` preference stored per browser profile.
- Cross-tab preference updates through the browser storage event.
- Canvas-dock quick toggle on layouts with sufficient space.
- Full-width mobile-safe control in the collaboration panel.
- Keyboard shortcut: `Ctrl/Command + Alt + \\`.
- Text fields and contenteditable surfaces are excluded from the global shortcut.
- Hiding cursors does not stop edits, CRDT sync, comments, locks, chat, or screen sharing.
- Comment pins remain rendered even when disposable remote cursors are hidden.

### 4. Separate cursor-quality feedback

A work-scoped external store reports:

- quality tier: live, balanced, constrained;
- effective cadence and adaptation reason;
- peer count;
- accepted, sent, coalesced, compacted, and failed disposable messages;
- whether a trailing cursor is pending.

The dock shows a compact warning only when the cursor lane is no longer in the live tier. The team
panel shows the full explanation. Existing sync safety continues to represent document durability
and authoritative acknowledgement, not pointer smoothness.

### 5. Cursor chat attached to the work location

The always-visible presence dock exposes a cursor-chat composer. `/` opens it when focus is not in a
text editor, input, select, textarea, or contenteditable surface.

- Cursor chat is limited to 80 characters.
- One latest message per author appears next to the author’s current cursor for five seconds.
- Replacing a message retires the previous timer immediately.
- The message is not appended to ordinary session chat history or the document.
- It reuses the authenticated, ACL-checked and rate-limited ephemeral room-chat transport instead of
  opening a second unauthenticated lane.
- The reserved message-id parser is strict. A malformed reserved id is dropped rather than exposed
  as ordinary chat.
- In a rolling deployment, an older client still receives readable fallback text rather than an
  opaque binary or an unknown protocol version.

### 6. Opt-in attention and follow invitation

Owners, administrators, and editors can send “Invite everyone to my current location” from the
canvas dock when another participant is present.

- The sender publishes a fresh page/tool presence heartbeat before the invitation.
- The invitation expires after twelve seconds.
- The receiver chooses Follow or Dismiss; no remote viewport is seized automatically.
- Accepting reuses the existing participant-follow state, so subsequent page moves continue through
  the already tested follow pipeline.
- Commenters and viewers cannot broadcast attention requests.
- The control remains outside durable document state and ordinary room-chat history.

This captures the useful part of Miro’s presenter attention pattern while preserving autonomy,
mobile comfort, reduced-motion safety, and the existing server authorization model.

## Invariants

- No protocol-version change is required; the wrapper emits already valid V18 cursor envelopes.
- No ACL, room membership, lock lease, CRDT recovery, or server acknowledgement behavior changes.
- Envelope order remains monotonic at the inner transport boundary.
- A pending cursor never crosses a later sequence number.
- Local fallback still uses the same adapter and policy.
- Dynamic loading preserves the collaboration bundle boundary; the adaptive module is loaded only
  when a live room is started.
- Hiding remote cursors is presentation-only and cannot hide comment pins.
- Cursor chat and attention never enter the durable Yjs document or ordinary room-chat list.
- Viewer write gates and edit-capable attention gates fail closed on both UI and Room paths.

## Tests added

- cadence policy for drawing, large rooms, data saver, and hidden tabs;
- work-scoped quality-store subscriptions and lifecycle cleanup;
- immediate first cursor plus newest trailing cursor;
- ordering barrier before a later presence envelope;
- immediate clear sentinel and obsolete-cursor removal;
- constrained-network trail compaction;
- bounded retry and close cancellation;
- persistent cursor visibility, hydration, shortcut matching, and text-input exclusion;
- dock accessibility/data contracts for visible/hidden controls and constrained quality;
- strict cursor-chat and attention control-id parsing and expiry;
- Room-to-Room delivery with control events excluded from ordinary chat history;
- role gates for viewer cursor chat and commenter/viewer attention;
- cursor priority and constrained-tier presentation caps;
- replacement, leave, disconnect, and expiry cleanup for cursor-chat bubbles.

## Follow-up boundary

Full presenter-camera spotlight remains a separate protocol feature. It requires an explicit
presenter authority, a bounded zoom/viewport/rotation payload, opt-out semantics, server-side
authorization, local-interaction escape rules, reduced-motion behavior, and mobile viewport
projection. V19 deliberately implements only the safe, opt-in attention invitation and existing page
follow; it does not smuggle camera control through chat or introduce an unauthenticated broadcast.