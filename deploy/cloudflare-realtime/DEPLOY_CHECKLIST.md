# Cloudflare Realtime Deployment Checklist

Deployment is intentionally separate from this scaffold. Complete every item
before routing production clients to the Worker.

## 1. Authority and ticket issuance

- [ ] Set `STUDIO_REALTIME_TICKET_ENABLED=true` only on the authenticated NestJS
      deployment that owns `POST /api/studio-realtime/tickets`.
- [ ] Configure all `STUDIO_REALTIME_CLOUDFLARE_*` values from the README; a
      partially enabled configuration must fail API bootstrap.
- [ ] Enable `STUDIO_REALTIME_REVOCATION_ENABLED` only after the exact control
      URL and a dedicated control secret are present; never reuse the ticket
      secret.
- [ ] Authorize the actor's access to the exact `workId + roomId` scope before
      signing.
- [ ] Confirm saved and provisional clients send their creator work ID as both
      `workId` and `roomId`; never substitute the `draft-room_<uuid>` lease ID.
- [ ] Generate a cryptographically random, single-use nonce for every ticket.
- [ ] Keep ticket TTL at or below two minutes and session TTL at or below five
      minutes. The session lease must never outlive the verified web session or
      the authoritative room-authorization lease.
- [ ] Use the exact canonicalization and HMAC context in `src/ticket.ts`.
- [ ] Return the ticket only to the authorized browser over HTTPS.
- [ ] Never persist or log the ticket.

## 2. Cloudflare configuration

- [ ] Use a current Wrangler release that supports declarative Durable Object
      `exports`.
- [ ] Review `wrangler.jsonc` against the target account and deployed namespace
      history. `wrangler.jsonc.example` is a documentation mirror; do not
      deploy `wrangler.test.jsonc`.
- [ ] Confirm `RealtimeRoom` and `RealtimeActorDirectory` are SQLite-backed.
      Do not create KV-backed namespaces.
- [ ] Bind `REALTIME_ROOMS` to `RealtimeRoom`.
- [ ] Bind `REALTIME_ACTORS` to `RealtimeActorDirectory`.
- [ ] Store `REALTIME_TICKET_SECRET` with a Workers secret or Secrets Store
      binding, never in `vars`, source control, CI output, or shell history.
- [ ] Store a distinct `REALTIME_CONTROL_SECRET` the same way and inject the
      matching value into Nest only through its server secret store.
- [ ] For local Worker development, keep the secret only in `.dev.vars` (or an
      environment-specific `.dev.vars.*`) after confirming the nested
      `.gitignore` excludes it. Never copy the secret into
      `wrangler.jsonc`/`vars`.
- [ ] Configure issuer and audience to exactly match the API signer.
- [ ] Review receipt count/byte and resume request/egress limits against the
      room-size canary. Never disable pre-admission or raise the byte ceilings
      to the Durable Object storage/account maximum.
- [ ] Keep the origin list explicit. Do not add `*`, HTTP origins, lookalike
      domains, or unrelated preview hosts.
- [ ] Attach the intended custom hostname, preferably
      `realtime.toonstudio.cloud`.
- [ ] Verify DNS, TLS, account limits, Durable Object billing, and rollback
      ownership.

If the deployment toolchain predates declarative `exports`, upgrade it. A
legacy one-time migration may use:

```jsonc
{
  "migrations": [
    {
      "tag": "realtime-sqlite-v1",
      "new_sqlite_classes": ["RealtimeRoom", "RealtimeActorDirectory"]
    }
  ]
}
```

Do not configure both lifecycle formats without checking the current Wrangler
schema and the namespace's deployed history.

## 3. Browser and edge security

- [ ] Add `wss://realtime.toonstudio.cloud` to the Studio page's CSP
      `connect-src`.
- [ ] Send the ticket only as the `ts-ticket.*` WebSocket subprotocol.
- [ ] Confirm query strings containing `ticket`, `token`, `jwt`,
      `authorization`, or `access_token` are rejected.
- [ ] Confirm `Origin` is required and matched exactly.
- [ ] Ensure proxies preserve `Upgrade`, `Connection`, `Origin`, and
      `Sec-WebSocket-Protocol`.
- [ ] Ensure the selected response protocol is only
      `toonspectrum-realtime-v1`.
- [ ] Do not enable permessage-deflate or an unreviewed compression extension
      as a substitute for the protocol byte limits.

## 4. Logging and observability

- [ ] Disable request-header/body capture for this route.
- [ ] Exclude `/v1/control/revocations` headers and body entirely; never log its
      timestamp, nonce, signature, actor/work/room identifiers, or raw error.
- [ ] Redact `Sec-WebSocket-Protocol` in Cloudflare Logpush, Tail Workers,
      tracing, error reporting, support tooling, and third-party proxies.
- [ ] Log only aggregate non-secret counters such as accepted connections,
      close codes, replay-gap counts, capacity rejections, and room-size
      buckets.
- [ ] Never use work IDs, room IDs, actor IDs, client IDs, nonces, comment
      bodies, SDP, ICE candidates, tickets, or raw exceptions as metric labels
      or logs.
- [ ] Alert on `1011`, repeated `1013`, capacity rejection, alarm failure, and
      Durable Object storage errors without attaching payloads.

## 5. Integration and quality gates

- [ ] Run the focused Vitest, TypeScript, and ESLint commands in the README.
- [x] Keep the official Cloudflare Vitest/workerd integration suite for actual
      WebSocket upgrade, nonce replay, hibernation eviction, SQLite
      persistence, channel replay, and alarm rearming.
- [ ] Add production-canary coverage for WebSocket close/error behavior and
      Cloudflare account-specific limits.
- [ ] Test two actors and multiple browser tabs in the same work.
- [ ] Test comments, presence, and offer/answer/ICE/hangup end to end.
- [ ] Test reconnect with an exact replay, paginated replay, and `resume-gap`.
- [ ] Test repeated/old/post-completion resume rejection, resume budget
      persistence across hibernation, and budget recovery after its window.
- [ ] Test duplicate idempotency keys and out-of-order client sequences.
- [ ] Test receipt count and byte exhaustion: rejection must not advance a
      channel sequence or mutate presence/signaling state, and expiry cleanup
      must advance the corresponding replay floor before admission recovers.
- [ ] Test one-time ticket replay, wrong work, wrong room, wrong origin, wrong
      audience, expiry, future issue time, malformed signature, and secret
      rotation.
- [ ] Test HMAC control body tampering, stale/future timestamp, nonce replay,
      partial configuration, session logout across multiple rooms, exact-room
      ACL removal, and preflight/revocation/final-confirm interleaving.
- [ ] Test binary frames, raster data URLs, oversized comments/SDP/ICE, unknown
      keys, and unknown message kinds.
- [ ] Test room capacity, per-actor capacity, slow-client backpressure, and
      recovery after `1013`.
- [ ] Test alarm-before-close ordering for exactly one presence leave and
      exactly one `signal.stop`; an idle connect-close churn case must create no
      leave event or receipt.
- [ ] Test owner-eject and viewer-self-end screen flows, peer cleanup, expired
      share cleanup, and same-ID reannounce without inherited grants.
- [ ] Confirm no branch silently truncates an event, lowers fidelity, disables a
      channel, or falls back to a partial protocol.
- [ ] Verify canonical project/comment persistence remains operational when the
      realtime coordinator is unavailable.

## 6. Rollout and rollback

- [ ] Start with an internal work allowlist and a separate custom hostname.
- [ ] Measure connection count, active-duration cost, SQLite writes, alarm
      invocations, replay size, and close-code distribution.
- [ ] Expand gradually only after the full feature and security matrix passes.
- [ ] Keep the existing realtime transport available during rollout; choose
      transports before connection, never downgrade an active room's protocol.
- [ ] Document who can disable the route, rotate the secret, restore a Durable
      Object using point-in-time recovery, and revert the client endpoint.
- [ ] Revoke the hostname and ticket issuer together during rollback so stale
      tickets cannot open new connections.
