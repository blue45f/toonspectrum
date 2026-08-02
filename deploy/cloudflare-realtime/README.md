# ToonSpectrum Cloudflare Realtime Coordinator

This directory is a deployment scaffold for a work-and-room-scoped Cloudflare
Durable Object. It coordinates only:

- lightweight presence and cursor state;
- anchored comment operations;
- WebRTC screen-sharing signaling.

It is not an artwork store, pixel CRDT, media relay, authentication authority,
billing service, or canonical project-save service. Raster/image/audio/video
bytes are rejected: WebSocket binary frames are closed with code `1003`, the
JSON protocol has no asset-byte field, embedded `data:image/*` values are
invalid, and every frame has a hard byte bound. Screen media remains WebRTC
peer media; this service relays only bounded SDP/ICE control messages.

## Architecture

```text
Browser
  │  Sec-WebSocket-Protocol:
  │  toonspectrum-realtime-v1, ts-ticket.<short-lived-HMAC-ticket>
  ▼
Cloudflare Worker entry
  ├─ exact HTTPS Origin allowlist
  ├─ no query credentials
  ├─ HMAC ticket verification
  ├─ separate HMAC revocation control plane
  └─ object key = work:<workId>:room:<roomId>
       ▼
SQLite-backed RealtimeRoom Durable Object
  ├─ verifies the same ticket again
  ├─ binds both workId and roomId in SQLite
  ├─ consumes its one-time nonce
  ├─ accepts a hibernatable WebSocket
  ├─ keeps an independent replay sequence/floor for each channel
  ├─ pre-admits bounded idempotency receipt count and storage bytes
  ├─ persists connection-level presence and signaling ACL state
  ├─ enforces actor/channel publish and connection resume/egress budgets
  └─ broadcasts only authorized presence/comments/screen-signaling
       ▲
       │ actor → bounded room directory + revocation fences
SQLite-backed RealtimeActorDirectory Durable Object
```

The Durable Object uses Cloudflare's WebSocket Hibernation API. Connection
identity, scopes, expiry, last client sequence, violation count, per-channel
resume frontier, and resume request/egress window are stored in the WebSocket
serialized attachment, so wake-up does not depend on stale in-memory maps. The
attachment remains well below Cloudflare's 16,384-byte limit. Presence,
one-time nonces, receipt usage, publish budgets, screen-share ownership, viewer
grants, and WebRTC peer bindings are SQLite state, so an isolate eviction
cannot silently reset authorization, ordering, or backpressure.

This is a purpose-specific host boundary, not a reduced replica of the primary
API. NestJS/PostgreSQL remains authoritative for membership, durable comments,
projects, and saved artwork. Cloudflare owns only latency-sensitive room
coordination. A provider outage therefore pauses that purpose; it never causes
the browser to reinterpret an unrelated host as a weaker implementation of the
same contract.

The implementation follows the current Cloudflare guidance:

- [Durable Object WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Object base class](https://developers.cloudflare.com/durable-objects/api/base/)
- [SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Durable Object class lifecycle](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## Endpoint and browser handshake

The only room endpoint is:

```text
GET /v1/rooms/<workId>/<roomId>
Upgrade: websocket
Origin: https://toonstudio.cloud
Sec-WebSocket-Protocol: toonspectrum-realtime-v1, ts-ticket.<ticket>
```

The browser can express the handshake without placing a credential in the URL:

```ts
const socket = new WebSocket(
  `wss://realtime.toonstudio.cloud/v1/rooms/${encodeURIComponent(
    workId,
  )}/${encodeURIComponent(roomId)}`,
  ["toonspectrum-realtime-v1", `ts-ticket.${ticket}`],
);
```

The response selects only `toonspectrum-realtime-v1`; it never echoes the
ticket-bearing subprotocol. The Worker and Durable Object contain no request,
header, ticket, exception, or payload logging. Cloudflare Logpush, Tail
Workers, tracing, and third-party observability must also redact or exclude
`Sec-WebSocket-Protocol`. Do not put a ticket in a URL, cookie log, metric
label, exception, or analytics event.

`GET /health` returns only a versioned service status and contains no room or
credential data.

## Ticket contract

The API authority issues a short-lived ticket before the WebSocket handshake.
The exact canonical claim object is:

```json
{
  "version": "toonspectrum.realtime-ticket.v1",
  "issuer": "toonspectrum-api",
  "audience": "toonspectrum-realtime",
  "subject": "actor-id",
  "sessionVersion": 1,
  "authorizationEpochMs": 1699999999000,
  "workId": "work-id",
  "roomId": "room-id",
  "clientId": "browser-client-id",
  "origin": "https://toonstudio.cloud",
  "scopes": ["presence", "comments", "screen-signaling"],
  "nonce": "at-least-16-base64url-characters",
  "issuedAtMs": 1700000000000,
  "expiresAtMs": 1700000060000,
  "sessionExpiresAtMs": 1700000300000
}
```

Rules:

- the ticket TTL is at most two minutes;
- the connection session is at most five minutes and never outlives the verified web session or
  the authoritative room-authorization lease;
- issuer, audience, work, room, and exact browser origin are signed bindings;
- `authorizationEpochMs` is no later than `issuedAtMs` and fences the exact ACL
  snapshot used by the API;
- every nonce is consumed once in the work's SQLite Durable Object;
- the secret is at least 32 UTF-8 bytes;
- claim keys and scope values are exact; unknown keys fail;
- the payload is recursively key-sorted canonical JSON;
- the ticket is
  `base64url(canonicalClaims) + "." + base64url(HMAC-SHA256(...))`;
- the signed input is
  `"toonspectrum/realtime-ticket/hmac-sha256/v1\n" + payloadSegment`.

[`signRealtimeTicket`](./src/ticket.ts) is the reference issuer implementation.
Production issuance belongs behind authenticated NestJS authorization and must
confirm that `subject` can access the exact `workId + roomId` scope. Never expose
`REALTIME_TICKET_SECRET` or ticket signing to the browser.

The Nest integration is mounted only when
`STUDIO_REALTIME_TICKET_ENABLED=true`. Its server-side configuration is:

```dotenv
STUDIO_REALTIME_TICKET_ENABLED=true
STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID=cloudflare-realtime-v1
STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER=toonspectrum-api
STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE=toonspectrum-realtime
STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET=<same value as REALTIME_TICKET_SECRET>
STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS=120
STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS=300
STUDIO_REALTIME_REVOCATION_ENABLED=true
STUDIO_REALTIME_CLOUDFLARE_CONTROL_URL=https://realtime.toonstudio.cloud/v1/control/revocations
STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET=<same value as Worker REALTIME_CONTROL_SECRET, different from ticket secret>
STUDIO_REALTIME_CLOUDFLARE_CONTROL_TIMEOUT_MS=3000
```

The API issuer/audience must exactly match the Worker vars, and the two secret
bindings must contain the exact same 32-byte-or-longer random value. The secret
belongs in the Nest deployment secret store and `wrangler secret put`; it must
not be placed in either environment example, `vars`, or a `VITE_` value.
Enabling the Nest route with a missing, weak, whitespace-padded, or out-of-range
value aborts API bootstrap without printing the secret.

## Immediate revocation control plane

`POST /v1/control/revocations` is server-to-server only. It accepts the exact
vendor JSON content type and an HMAC-SHA256 signature over the method, fixed
path, timestamp, UUID nonce, and body digest. Credentials are never accepted in
the URL. Requests older than 30 seconds, future timestamps, altered bodies,
unknown fields, replayed actor nonces, weak/equal ticket and control secrets,
or partially enabled configuration fail closed.

The actor Durable Object stores only bounded `actor → room` registrations and
short-lived session/room fences. Room admission uses a preflight and a final
post-accept confirmation: a revocation between those phases either closes the
already accepted socket or makes final confirmation reject it. Logout raises
the durable session version before the control event and retains the signed
browser cookie on a `503`, allowing a safe retry. Member removal persists an
append-only removal epoch in the same PostgreSQL transaction; a repeated
DELETE replays that epoch, so a transient edge failure cannot become a
permanent revocation-delivery gap. A later re-invite receives a newer
authorization epoch and is not closed by a delayed older event.

`REALTIME_CONTROL_SECRET` belongs in the Worker secret store and must match
`STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET`; it must never equal
`REALTIME_TICKET_SECRET`, appear in `vars`, a `VITE_` value, request logs,
tracing, metrics, or query strings. Both `REALTIME_ROOMS` and
`REALTIME_ACTORS` must be bound as SQLite Durable Objects.

The current Studio transport uses the creator work ID as its canonical live
room ID. This is also true for unsaved collaboration: provisioning creates a
hidden provisional work, and live collaboration joins that provisional
`workId`; the separate `draft-room_<uuid>` is only the provisioning/lease record
identifier. Protocol v1 therefore requests
`{ "workId": "<creator-work-id>", "roomId": "<same-creator-work-id>" }`.
The Nest ACL adapter rejects every other pairing before ticket signing.

The Worker verifies path, work, room, origin, issuer, and audience before
routing. The Durable Object repeats the same verification and then atomically
binds both identifiers in its SQLite `room_state`. Its namespace name is
normalized as
`work:${encodeURIComponent(workId)}:room:${encodeURIComponent(roomId)}`;
simple canonical IDs therefore produce `work:<workId>:room:<roomId>`, while
reserved delimiters cannot collide.

## Protocol v1

Every JSON frame has:

```json
{ "version": "toonspectrum.realtime.v1", "type": "..." }
```

Unknown envelope keys, unknown payload keys, mismatched channel/payload pairs,
unsafe identifiers, non-finite coordinates, oversized text, and binary/raster
markers fail closed. The exact TypeScript shapes and validators live in
[`src/protocol.ts`](./src/protocol.ts).

Client messages:

| Type | Purpose |
| --- | --- |
| `publish` | Send one presence, anchored-comment, or targeted signaling operation. Requires a unique `idempotencyKey`, increasing `clientSequence`, and `sentAtMs`. |
| `resume` | Request the bounded replay suffix after `afterSequence`. |
| `ping` | Exact constant JSON heartbeat. Hibernation auto-replies with `pong` without waking the object. |

Server messages:

| Type | Purpose |
| --- | --- |
| `welcome` | Returns server-issued connection identity, scopes, each channel's current sequence/replay floor, and expiry. |
| `presence-snapshot` | Paginated connection-level presence state. Cursor stroke tails are intentionally omitted. |
| `ack` | Maps an idempotency key to its canonical channel sequence and marks duplicates. |
| `event` | Canonical channel-sequenced operation with the server-issued `connectionId`. |
| `replay` | Channel-specific bounded page with `toSequence`, `currentSequence`, and `complete`. |
| `error` | Stable non-secret error code; never reflects input or exceptions. |
| `pong` | Constant heartbeat response. |

Presence accepts `presence.update`, `presence.cursor`, and `presence.leave`.
The bounded display name/role/state profile is presentation metadata only; ACL
and capabilities always come from the signed ticket and server authorization.
Comments carry only `comment.changed` invalidations (thread id, monotonic
activity sequence, and change kind), never comment bodies. Screen signaling
accepts broadcast `signal.announce`/`signal.stop`, targeted
`signal.request`/`signal.access`, and targeted `signal.offer`,
`signal.answer`, and `signal.ice`. A request must address the active share
owner; only that owner can approve a viewer; offers require an approved
owner/viewer pair; answers and ICE require the persisted `peerConnectionId`.
`sessionId` is the share ID. Share stop/restart removes old viewer grants and
peer bindings. An approved viewer may send `decision: "ended"` to the owner to
stop its own session; the owner may send the same decision to eject that
viewer. Both directions delete the viewer's peer binding immediately.
Persisted actor + client targets prevent replay from leaking to an unrelated
actor that later reuses a client ID. Targeted signaling is delivered only to
the sender's connection set and the exact authorized target. Stopped and
expired share/member/peer rows are removed, and the same share ID can start a
new generation without inheriting grants.

## Replay, ordering, and backpressure

- Presence, comments, and screen signaling each have an independent monotonic
  sequence and contiguous replay floor. A noisy cursor stream cannot create a
  false comment or signaling replay gap.
- A per-connection client sequence must strictly increase.
- The SQLite event log makes replay survive hibernation.
- Idempotency receipts are separate from the replay log but use the same
  retention deadline as their event. Count and conservative stored-byte usage
  are tracked durably; a publish is rejected with `backpressure` before any
  presence/signaling/sequence write if admitting its receipt would exceed the
  configured room budget. Live receipts are never evicted for a newer publish.
- The default log is bounded to 2,048 events and 15 minutes.
- Cleanup removes a complete per-channel sequence prefix, preserving a
  contiguous suffix. A client behind that channel's floor receives
  `resume-gap` and must reload the canonical snapshot before resuming.
- Closing or expiring a connection claims its durable registry row once. A
  presence leave is emitted only when that connection actually stored
  presence; connect-close churn creates neither an event nor a receipt.
  Owned/expired shares similarly claim one durable share generation and emit
  exactly one replayable `signal.stop`. Server cleanup events do not consume
  client idempotency receipt capacity.
- Replay is paginated to at most 128 scanned events and 128 KiB per server
  frame. Targeted signaling visibility is evaluated while scanning; no event
  is truncated or retargeted.
- Each connection records the next permitted `afterSequence` per channel and
  rejects skipped, repeated, old, or post-completion resume requests. The
  request count and serialized replay/error bytes share a fixed window stored
  in the hibernatable attachment, so isolate eviction cannot reset the budget.
- Actor + channel fixed-window budgets cap event count and UTF-8 bytes without
  disabling another channel or another actor.
- Browser WebSockets expose `bufferedAmount`; Cloudflare's server-side
  hibernatable socket does not. The sender uses the explicit buffered-send
  budget where the runtime exposes it. When it is absent, bounded frames plus
  the durable resume-egress window prevent unmetered replay amplification;
  `send()` still fails closed. Missing `bufferedAmount` is treated as an empty
  runtime-owned queue, not as evidence of unlimited capacity.
- Capacity is explicit: room and actor connection limits reject new
  handshakes rather than disabling comments, presence, or signaling.

The production scaffold exposes these durable hardening limits:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `REALTIME_MAX_RECEIPT_COUNT` | `4096` | Maximum live client idempotency receipts per room. |
| `REALTIME_MAX_RECEIPT_BYTES` | `33554432` | Conservative maximum stored receipt bytes per room. |
| `REALTIME_RESUME_WINDOW_MS` | `10000` | Per-connection durable resume budget window. |
| `REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW` | `64` | Maximum accepted resume responses in that window. |
| `REALTIME_RESUME_MAX_BYTES_PER_WINDOW` | `8388608` | Maximum serialized resume response bytes in that window. |

All values are strict positive base-10 integers with bounds enforced at Worker
startup. `wrangler.jsonc.example` mirrors the reviewed defaults; production
changes must preserve at least one maximum replay frame per byte budget and
enough resume requests for all three channels.

The Durable Object replay log is operational realtime state, not permanent
artwork or comment storage. The existing API/PostgreSQL path remains canonical
for saved projects and durable comment history. Production client integration
must use the same idempotency key when coordinating a canonical comment write
with its realtime notification.

## Local verification

Pure protocol/store checks run in Node, including an actual in-memory SQLite
database:

```sh
pnpm exec vitest run deploy/cloudflare-realtime/src
pnpm typecheck:cloudflare-realtime
pnpm exec eslint --max-warnings=0 deploy/cloudflare-realtime
```

The official Cloudflare Vitest pool runs the Worker in `workerd` with a real
SQLite-backed Durable Object. It verifies the WebSocket handshake, welcome and
presence snapshot, one-time nonce replay rejection, channel-local replay,
SQLite persistence, hibernation eviction/restart, and alarm rearming:

```sh
pnpm test:cloudflare-realtime
pnpm exec wrangler deploy --dry-run \
  --config deploy/cloudflare-realtime/wrangler.jsonc \
  --outdir /tmp/toonspectrum-realtime-dry
```

[`wrangler.jsonc`](./wrangler.jsonc) is the reviewed production scaffold.
[`wrangler.test.jsonc`](./wrangler.test.jsonc) contains a deterministic,
explicitly local-only credential and must never be deployed. Production still
requires `wrangler secret put REALTIME_TICKET_SECRET` and every item in
[`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md). These files do not deploy the
Worker or create Cloudflare resources by themselves.
