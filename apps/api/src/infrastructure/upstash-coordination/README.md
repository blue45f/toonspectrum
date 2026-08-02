# Upstash coordination boundary

This boundary is deliberately narrower than a general Redis repository. It may store only:

- short-lived compare-and-set leases;
- idempotency receipt state, immutable request fingerprints and outcome fingerprints;
- provider circuit counters/cooldowns;
- provider budget counters and per-operation decision receipts;
- bounded authentication rate-limit counters keyed only by pre-hashed subjects.

It cannot store creator content, prompts, document/CRDT authority, canonical save state, thumbnails,
exports, or asset bytes. Every external identity and proof is HMAC-SHA-256 transformed before it
becomes a Redis key or value. Every key has a bounded TTL.

The REST transport accepts only an exact single-result JSON envelope, enforces request/response
byte limits, uses a whole-response deadline, rejects redirects, and turns transport uncertainty
into a failure. Lua `EVAL` scripts provide compare-and-set semantics for ownership-sensitive
mutations.

Receipt keys remain scoped by operation and idempotency key. The receipt value additionally binds
one HMAC-transformed request fingerprint for the tenant, workload, command metadata and payload.
Reusing a key with different input returns an explicit request conflict; it never creates a second
receipt by moving the fingerprint into the Redis key.

When `UPSTASH_COORDINATION_ENABLED` is absent or `false`, the factory returns `null`; consumers must
leave this module out of the Nest graph. There is intentionally no in-memory fallback. Enabling it
requires:

- `UPSTASH_COORDINATION_REST_URL`
- `UPSTASH_COORDINATION_REST_TOKEN`
- `UPSTASH_COORDINATION_KEY_HASH_SECRET`

Optional bounds are `UPSTASH_COORDINATION_NAMESPACE`,
`UPSTASH_COORDINATION_TIMEOUT_MS`, `UPSTASH_COORDINATION_MAX_REQUEST_BYTES`, and
`UPSTASH_COORDINATION_MAX_RESPONSE_BYTES`.
