# Upstash coordination 경계

일반 Redis repository가 아니라 다음 bounded coordination state만 저장한다.

- 짧은 compare-and-set lease
- idempotency receipt, immutable request fingerprint, outcome fingerprint
- provider circuit counter·cooldown
- provider budget counter와 operation별 decision receipt
- 사전 hash된 subject 기반 bounded 인증 rate-limit counter

creator content, prompt, document/CRDT authority, canonical save, thumbnail, export, asset byte를 저장할 수
없다. 외부 identity와 proof는 Redis key/value가 되기 전에 HMAC-SHA-256으로 변환하며 모든 key에 bounded
TTL을 둔다.

REST transport는 exact single-result JSON envelope만 받고 request/response byte limit, 전체 response
deadline, redirect 거절을 적용한다. transport 불확실성은 실패다. ownership-sensitive mutation은 Lua
`EVAL` compare-and-set으로 처리한다.

receipt key는 operation과 idempotency key 범위에 머물며 value가 tenant, workload, command metadata,
payload의 HMAC request fingerprint를 함께 묶는다. 같은 key를 다른 input으로 재사용하면 명시적 conflict를
반환하고 fingerprint를 key에 섞어 두 번째 receipt를 만들지 않는다.

`UPSTASH_COORDINATION_ENABLED`가 없거나 `false`면 factory는 `null`을 반환하고 consumer는 Nest graph에서
module을 제외한다. in-memory fallback은 없다.

필수 환경변수:

- `UPSTASH_COORDINATION_REST_URL`
- `UPSTASH_COORDINATION_REST_TOKEN`
- `UPSTASH_COORDINATION_KEY_HASH_SECRET`

선택 한도:

- `UPSTASH_COORDINATION_NAMESPACE`
- `UPSTASH_COORDINATION_TIMEOUT_MS`
- `UPSTASH_COORDINATION_MAX_REQUEST_BYTES`
- `UPSTASH_COORDINATION_MAX_RESPONSE_BYTES`
