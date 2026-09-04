# Studio realtime collaboration benchmark and V19 upgrade

Date: 2026-09-04  
Scope: ToonSpectrum Studio canvas collaboration

## Executive summary

Studio already has a stronger collaboration foundation than a typical canvas editor: authenticated
Socket.IO rooms, strict replay-resistant envelopes, active/idle presence, remote cursors, expiring
edit leases, ephemeral chat, screen sharing, voice, Yjs/CRDT durability, recovery export, a binary
ink lane, P2P fan-out, and an authoritative fallback path. V19 therefore does not replace the
existing authority model. It closes the highest-impact experiential and performance gaps around
cursor continuity, constrained networks, large rooms, discoverability, and user control.

The release principle is **degrade disposable presence before durable work**. Cursor cadence and
trail detail may adapt. CRDT updates, server acknowledgements, lock operations, comments, chat,
voice, screen signaling, and negotiated binary ink are not sampled or rewritten by this layer.

## Benchmark signals

| Product / architecture | Useful pattern | ToonSpectrum status after V19 |
| --- | --- | --- |
| Figma multiplayer | Visible collaborators, spotlight/follow, and a dedicated show/hide multiplayer cursors control | Individual page follow already existed. V19 adds persistent cursor visibility controls in both the canvas dock and team panel, plus the familiar cross-platform shortcut. Presenter-led spotlight remains a separately scoped protocol feature. |
| Miro attention management | Follow a collaborator, bring everyone to a presenter, and release follow on local navigation | Individual follow already existed. V19 improves its surrounding visibility/performance feedback; bring-everyone remains a future authority-controlled feature rather than an unsafe client-only broadcast. |
| tldraw | Lightweight presence, camera follow, and graceful offline behavior | Studio keeps its existing follow and durable recovery boundaries. V19 moves high-frequency cursor work behind an isolated adaptive transport. |
| Liveblocks | Explicit connection/presence status and reconnection-aware UX | Studio already exposes transport and authoritative-save status. V19 adds a separate cursor-quality signal so users can distinguish document safety from disposable presence quality. |
| Yjs awareness | Awareness is ephemeral and separate from the durable document | V19 preserves this boundary: only `cursor:update` is coalesced or compacted. Yjs/CRDT operations remain authoritative and durable. |

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

### 3. User-facing cursor controls

- Persistent `remoteCursorsVisible` preference stored per browser profile.
- Cross-tab preference updates through the browser storage event.
- Canvas-dock quick toggle on layouts with sufficient space.
- Full-width mobile-safe control in the collaboration panel.
- Keyboard shortcut: `Ctrl/Command + Alt + \\`.
- Text fields and contenteditable surfaces are excluded from the global shortcut.
- Hiding cursors does not stop edits, CRDT sync, comments, locks, chat, voice, or screen sharing.

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

## Invariants

- No protocol-version change is required; the wrapper emits already valid V18 cursor envelopes.
- No ACL, room membership, lock lease, CRDT recovery, or server acknowledgement behavior changes.
- Envelope order remains monotonic at the inner transport boundary.
- A pending cursor never crosses a later sequence number.
- Local fallback still uses the same adapter and policy.
- Dynamic loading preserves the collaboration bundle boundary; the adaptive module is loaded only
  when a live room is started.
- Hiding remote cursors is presentation-only and cannot hide comment pins.

## Tests added

- cadence policy for drawing, large rooms, data saver, and hidden tabs;
- work-scoped quality-store subscriptions and lifecycle cleanup;
- immediate first cursor plus newest trailing cursor;
- ordering barrier before a later presence envelope;
- immediate clear sentinel and obsolete-cursor removal;
- constrained-network trail compaction;
- bounded retry and close cancellation;
- persistent cursor visibility, hydration, shortcut matching, and text-input exclusion;
- dock accessibility/data contracts for visible/hidden controls and constrained quality.

## Follow-up boundary

Presenter-led spotlight / “bring everyone to me” requires an explicit presenter authority, a bounded
viewport payload, opt-out semantics, and server-side authorization. It should not be smuggled through
chat or implemented as an unauthenticated client broadcast. That work belongs in a dedicated
protocol revision with camera-state tests, reduced-motion behavior, and mobile viewport projection.
