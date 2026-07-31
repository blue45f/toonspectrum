# Backend capability distribution

ToonSpectrum keeps one transactional source of truth and distributes only workloads whose failure
can be retried or reconstructed. This avoids turning free hosting quotas into a distributed
transaction problem.

## Authority boundary

The following always stay on the NestJS API and authoritative PostgreSQL:

- authentication, sessions and identity linkage
- work/document saves and billing
- CRDT document metadata, operation ordering and acknowledgement
- authorization and marketplace ownership

Vercel can serve the bounded HTTP portion of that API. Socket.IO CRDT fanout and authoritative
locks additionally require the same Nest application on a long-running host. The checked-in
`render.yaml` is that purpose-specific deployment boundary: it uses the same session signing key
as Vercel and a direct PostgreSQL endpoint for the Socket.IO cluster adapter. It is not used as an
object store, media relay, thumbnail worker or generic fallback.

The capability router intentionally has no IDs for those operations. Feature code cannot route
them to a free provider by mistake.

## Workload-specialized placement

Provider selection is workload-first, not a generic free-host round robin. Normal traffic has one
purpose-specific primary owner. Fallback is only a continuity path between providers that expose
the same complete placement role and exact v1 gateway contract; it is not load balancing and does
not move unrelated features between hosts.

| Placement role | Workloads | Normal primary owner | Same-role continuity only | Never substituted with |
| --- | --- | --- | --- |
| `container-worker` | high-quality thumbnail rendering and conversion | Cloud Run | Fly, Railway, Cloudtype, Render, Koyeb | short edge functions |
| `edge-short` | webhook validation and short event work | Cloudflare Workers | AWS Lambda, Azure Functions, Vercel, Netlify, Deno Deploy, Supabase/Firebase functions | long conversion workers |
| `durable-queue` | cleanup and notification dispatch | Upstash QStash | Cloudflare Queues | process-local timers |
| `object-store` | source images, 3D assets, thumbnails and exports | Supabase Storage | Cloudflare R2, Firebase Storage | container local filesystems |
| `realtime-relay` | presence, comment invalidation and screen-share signaling | Cloudflare Durable Objects with channel-isolated state | Supabase/Firebase or a full-contract container relay after its ACL bridge is verified | raster pixels, voice media, comment authority or CRDT ordering |

Shared coordination is also purpose-bound but is not a user-data capability: Upstash Redis stores
only short-lived leases, idempotency receipts, provider circuit state and budget reservations.
It never stores artwork, asset bytes, sessions, comments or authoritative CRDT operations.

The browser contract includes a lazy Supabase Realtime adapter boundary, but the current production
profile does not activate it. ToonSpectrum sessions are not Supabase Auth JWTs, so exposing an anon
channel before a verified JWT/RLS authorization bridge would weaken the existing Creator ACL.
Cloudflare therefore owns the three ephemeral channels for the first rollout, while each channel
keeps an independent sequence, replay floor, rate budget and durable state. Supabase in this phase
is the private object-storage data plane, not an unverified public collaboration shortcut.

The installed coordination gate performs the distributed execution lifecycle in this order:

1. read the exact provider circuit;
2. acquire one of that provider's configured concurrency slots;
3. atomically reserve the request/cost budget for the UTC day selected by Redis `TIME`;
4. reserve the command idempotency receipt;
5. execute and, for long calls, renew the lease;
6. close/update the circuit, fingerprint the terminal outcome and release the lease.

When distribution is disabled, the gate explicitly reports `local-process`; it does not pretend a
distributed reservation succeeded. Once distribution is enabled, missing, disabled, invalid, or
unreachable Upstash coordination is a fail-closed configuration/runtime error and readiness must
also fail. No artwork or provider response body is written to Redis. A receipt keeps the immutable
request fingerprint that binds tenant, workload, command metadata, and payload, then records only a
canonical SHA-256 terminal outcome fingerprint. Reusing one idempotency key for a different request
is an explicit conflict rather than a duplicate success.

If lease renewal becomes uncertain after a provider has already returned an exact response, the
dispatcher preserves that response for reconciliation and reports `delivery-unknown`; it does not
turn the call into a terminal cancelled receipt or silently retry it on another provider.

Daily budget rollover is owned by the Redis server clock, not by an API host's wall clock. A stable
HMAC-derived provider hash is reset atomically when Redis observes a new UTC epoch day and expires
after the next Redis-observed midnight plus a bounded grace period. API nodes with clock skew
therefore cannot split one provider budget across two date keys.

The router records `placementRole` and `selectionReason: workload-affinity` without URLs, tokens or
provider response bodies. An async-capable edge provider cannot become a thumbnail fallback merely
because it accepts HTTP.

Render free web services currently spin down after idle time and have ephemeral local files, so they
are never first choice for latency-sensitive or durable work. Fly autostop is useful for bursty
workers, but background work must have an explicit lifecycle because an HTTP machine can stop after
the request closes. Vercel and similar function platforms are treated as bounded request executors,
not durable queues. Supabase Edge Functions have runtime limits and cannot run Node libraries that
need native multithreading, so image conversion belongs on a container worker.

Cloud Run services support HTTPS and WebSockets, while Cloud Run jobs run finite container tasks.
Koyeb can scale to zero and its free instance sleeps, so it is an exact-contract auxiliary
container rather than a low-latency authority. QStash is modeled only as a durable dispatch facade:
the facade must return ToonSpectrum's exact gateway acknowledgement and preserve the idempotency key.

Official references:

- [Render free instances](https://render.com/docs/free)
- [Render service types](https://render.com/docs/service-types)
- [Fly autostop/autostart](https://fly.io/docs/launch/autostop-autostart/)
- [Fly Machines background-work lifecycle](https://fly.io/docs/machines/guides-examples/managing-machines-with-the-api/)
- [Railway cost controls](https://docs.railway.com/pricing/cost-control)
- [Railway cron, worker and queue guidance](https://docs.railway.com/guides/cron-workers-queues)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Netlify background functions](https://docs.netlify.com/build/functions/background-functions/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Firebase Functions quotas](https://firebase.google.com/docs/functions/quotas)
- [Cloud Run services, jobs and worker pools](https://cloud.google.com/run/docs/overview/what-is-cloud-run)
- [AWS Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Azure Functions hosting and scaling](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale)
- [Deno Deploy](https://docs.deno.com/deploy/)
- [Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero)
- [Upstash QStash background jobs and deduplication](https://upstash.com/docs/qstash/overall/getstarted)

Provider plan limits change. The code deliberately does not hard-code advertised free quotas.
Operators copy the current limits from the provider dashboard into explicit hard budget,
concurrency, duration and payload environment values.

## Fail-closed configuration

See [`deploy/backend-capabilities.env.example`](../deploy/backend-capabilities.env.example).

A remote provider is selectable only when all of the following are true:

1. `BACKEND_DISTRIBUTION_ENABLED=true`
2. the provider-specific `ENABLED=true`
3. its HTTPS gateway URL and a 32+ character credential are present
4. daily request/cost budgets, duration, payload and concurrency limits are explicit
5. the request fits the capability and declared provider limits
6. the provider has the exact workload placement role
7. the provider's circuit is closed and budget remains

Local fallback is available only with `BACKEND_LOCAL_FALLBACK=development`, only outside production,
and only for best-effort work. Durable asset storage never falls back to a process-local filesystem.

## Exact HTTPS gateway

Every provider facade implements one fixed endpoint:

`/.well-known/toonspectrum/backend-capabilities/v1/execute`

The dispatcher sends a canonical, versioned JSON envelope containing the provider, capability,
workload, timestamp, UUID nonce and idempotency key. It also sends immutable execution requirements:

- `fidelity: exact`
- `allowDegraded: false`
- `latency: tolerant`

Cold starts and queue wait are acceptable. Reduced dimensions, lower image quality, missing layers,
partial collaboration semantics or altered exports are not. A provider that cannot execute the full
contract must return a retryable rejection or an exact `accepted` queue acknowledgement. If no
same-role provider is available, the dispatcher returns unavailable/providers-exhausted so the
authoritative outbox can wait; it never silently selects a degraded implementation.

The 16 MiB JSON request/response ceiling is a control-plane safety boundary, not an artwork size or
quality limit. Large source images, models and exports must be uploaded losslessly to object storage
and referenced by immutable asset ID or presigned URL. The dispatcher rejects an oversized inline
body without truncating, resampling or sending it.

The gateway token is present only in `x-toonspectrum-gateway-token`. The token never appears in the
body, status snapshot or result. Base URLs are secure origins only; userinfo, paths, queries and
fragments are rejected. The code fixes the path, omits browser credentials/referrers and disables
redirect following so a provider cannot redirect the credential to another origin. Responses are
bounded and must match an extra-key-free v1 schema with `fidelity: exact`.

Provider failover is bounded by `BACKEND_GATEWAY_MAX_ATTEMPTS`. It occurs only for commands marked
idempotent and only to another provider with the same placement role. A non-idempotent request whose
delivery becomes unknown is never replayed. The same idempotency key is preserved across an allowed
failover.

## Rollout

1. Deploy policy, gateway and Upstash coordination with distribution disabled.
2. Verify the three private Supabase purpose buckets (`source`, `derived`, `export`) through API
   readiness and perform exact-byte upload/read/delete smoke tests.
3. Deploy the Cloudflare Durable Object coordinator and enable short-lived Nest admission tickets
   for presence, comment invalidation and screen-share signaling.
4. Deploy the long-running Nest Socket.IO host for CRDT fanout and locks; point
   `VITE_STUDIO_LIVE_ORIGIN` at its exact HTTPS origin.
5. Enable one idempotent thumbnail adapter on a full container worker such as Cloud Run.
6. Enable remote gateway execution only after its exact adapter, budget, lease, receipt and
   end-to-end failure-path tests pass.

Provider selection remains purpose-specific even after rollout. Same-role continuity is a bounded
recovery path, while different workloads can remain connected to different hosts concurrently.
