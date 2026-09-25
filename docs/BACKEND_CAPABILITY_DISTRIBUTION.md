# Backend capability 분산 정책

- 상태: **현재 배치·실패 정책**
- 최종 갱신: **2026-09-26**

ToonSpectrum은 하나의 transactional source of truth를 유지하고 실패 뒤 재시도·재구성이 가능한 workload만
외부 provider에 배치한다. 무료 hosting quota를 distributed transaction 권위로 사용하지 않는다.

## 권위 경계

다음은 항상 NestJS API와 authoritative PostgreSQL에 남는다.

- 인증, session, identity linkage
- work/document save와 billing
- CRDT document metadata, operation ordering, acknowledgement
- authorization과 marketplace ownership

Render의 Core API가 authoritative HTTP를 제공한다. Socket.IO CRDT fanout과 authoritative lock은 같은
Nest application의 별도 long-running Render role이 소유한다. `render.yaml`은 두 배포 경계와 Socket.IO
cluster adapter용 direct PostgreSQL endpoint를 선언한다. 어느 role도 object store, media relay,
thumbnail worker, generic fallback이 아니다.

capability router에는 권위 operation ID가 없다. feature code가 실수로 free provider에 보낼 수 없다.

## workload별 placement

provider 선택은 generic round-robin이 아니라 workload-first다. 정상 traffic에는 목적별 primary owner가
하나 있다. fallback은 동일한 complete placement role과 exact v1 gateway를 제공하는 provider 사이의
bounded continuity일 뿐 load balancing이나 타 기능 이동이 아니다.

| placement role | workload | 기본 owner | 동일 역할 continuity | 금지 대체 |
| --- | --- | --- | --- | --- |
| `container-worker` | 고품질 thumbnail·conversion | Cloud Run | Fly, Railway, Cloudtype, Render, Koyeb | 짧은 edge function |
| `edge-short` | webhook validation·짧은 event | Cloudflare Workers | AWS Lambda, Azure Functions, Netlify, Deno, Supabase/Firebase functions | 장시간 conversion worker |
| `durable-queue` | cleanup·notification dispatch | Upstash QStash | Cloudflare Queues | process-local timer |
| `object-store` | source image, 3D asset, thumbnail, export | Supabase Storage | Cloudflare R2, Firebase Storage | container local filesystem |
| `realtime-relay` | presence, comment invalidation, screen signaling | Cloudflare Durable Objects | ACL bridge가 검증된 full-contract relay | raster pixel, voice media, comment 권위, CRDT ordering |

Upstash Redis coordination은 user data capability가 아니다. 짧은 lease, idempotency receipt, provider
circuit, budget reservation만 저장하고 artwork, asset byte, session, comment, authoritative CRDT를 저장하지
않는다.

browser의 Supabase Realtime adapter는 lazy boundary만 있으며 production에서는 비활성이다. ToonSpectrum
session은 Supabase Auth JWT가 아니므로 검증된 JWT/RLS bridge 없이 anon channel을 열지 않는다. 첫 배포의
세 ephemeral channel은 Cloudflare가 소유하고 Supabase는 private object storage data plane으로 사용한다.

## 분산 실행 수명주기

1. exact provider circuit 조회
2. provider concurrency slot 획득
3. Redis `TIME` 기준 UTC day request/cost budget 원자 예약
4. command idempotency receipt 예약
5. 실행과 장시간 lease renewal
6. circuit close/update, terminal outcome fingerprint, lease release

분산 비활성 시 gate는 `local-process`를 명시한다. 활성화한 뒤 coordination이 누락·비활성·오류·접근 불가면
configuration/runtime와 readiness를 fail-closed한다. Redis에 artwork/provider response body를 쓰지
않는다. receipt는 tenant, workload, command metadata, payload를 묶은 immutable request fingerprint와
canonical SHA-256 terminal outcome fingerprint만 저장한다. 같은 key를 다른 request에 재사용하면 conflict다.

provider가 exact response를 반환한 뒤 lease renewal이 불확실해지면 response를 reconciliation용으로
보존하고 `delivery-unknown`을 반환한다. cancelled receipt로 바꾸거나 다른 provider에 자동 재시도하지
않는다.

budget day는 API host clock이 아니라 Redis clock이 소유한다. provider hash는 UTC day 변경 시 원자
reset하고 다음 midnight 뒤 bounded grace에 expire한다.

router는 URL, token, response body 없이 `placementRole`과
`selectionReason: workload-affinity`만 기록한다. HTTP를 받을 수 있다는 이유로 edge provider를 thumbnail
fallback으로 선택하지 않는다.

## provider 특성

- Render free service는 idle sleep과 ephemeral local file 때문에 latency/durable 작업의 기본 owner가 아니다.
- Fly autostop은 burst worker에 사용할 수 있지만 request 종료 뒤 background lifecycle을 명시해야 한다.
- function platform은 bounded request executor이며 durable queue가 아니다.
- Supabase Edge Function은 native multithreading image conversion에 부적합하다.
- Cloud Run service는 HTTPS/WebSocket, job은 finite container task에 적합하다.
- Koyeb free instance는 sleep하므로 exact-contract auxiliary container다.
- QStash는 durable dispatch facade이며 exact acknowledgement와 idempotency key를 보존해야 한다.

provider plan limit은 변하므로 code에 광고 무료 quota를 고정하지 않는다. 운영자가 dashboard의 현재 값을
명시적 hard budget, concurrency, duration, payload 환경값으로 옮긴다.

## fail-closed 설정

예시는 `deploy/backend-capabilities.env.example`을 따른다. remote provider는 다음을 모두 만족해야 한다.

1. `BACKEND_DISTRIBUTION_ENABLED=true`
2. provider별 `ENABLED=true`
3. HTTPS gateway URL과 32자 이상 credential
4. daily request/cost, duration, payload, concurrency 명시
5. request가 capability·provider limit 안에 있음
6. exact workload placement role 일치
7. circuit closed, budget 잔여

local fallback은 production 밖에서 `BACKEND_LOCAL_FALLBACK=development`로만 best-effort workload에
허용한다. durable asset storage는 process-local filesystem으로 fallback하지 않는다.

## exact HTTPS gateway

모든 provider facade는 하나의 endpoint만 구현한다.

```text
/.well-known/toonspectrum/backend-capabilities/v1/execute
```

container provider는 full app graph가 아니라 `API_RUNTIME_ROLE=capability-worker` image를 공유한다. 공개
surface는 `/api/health/live`, exact execute endpoint, signed readiness endpoint뿐이다. Render/Fly/Railway
template은 `deploy/capability-worker/`에 있고 `DATABASE_URL`, auth/session, CRDT, Socket.IO module 없이 같은
non-root image를 실행한다.

dispatch envelope에는 provider, capability, workload, timestamp, UUID nonce, idempotency key와 다음 요구를
넣는다.

```text
fidelity: exact
allowDegraded: false
latency: tolerant
```

cold start와 queue wait는 허용하지만 축소 dimension, 낮은 image quality, 누락 layer, 부분 collaboration,
변형 export는 허용하지 않는다. full contract가 불가능하면 retryable rejection 또는 exact `accepted`
acknowledgement를 반환한다. 동일 역할 provider가 없으면 authoritative outbox가 기다릴 수 있도록
unavailable/providers-exhausted를 반환한다.

cleanup/notification facade는 explicit durable-queue executor port를 사용한다. strict payload는
`cleanup.dispatch`, `notification.dispatch`이며 command에 URL, method, header, credential, provider base URL을
주지 않아 arbitrary callback/SSRF relay가 되지 않게 한다. default Nest app은 adapter가 없으면 queue role을
설치하지 않는다. role을 활성화했는데 adapter/readiness가 없으면 traffic 전에 실패한다.

QStash producer는 distribution과 QStash provider가 모두 유효할 때만 설치한다. URL Group 존재와 HTTPS
endpoint를 검증하고 bounded versioned command, SHA-256 dedup ID, redirect/referrer/credential 차단,
body log redaction을 적용한다. provider dedup window가 10분이므로 consumer도 `Upstash-Signature`와 durable
idempotency를 검증해야 한다. Cloudflare Queue는 adapter가 등록되기 전 green readiness를 반환하지 않는다.

16 MiB hard JSON ceiling과 provider별 더 작은 ceiling은 control-plane 한도이며 asset 품질 제한이 아니다.
큰 source/model/export는 lossless object storage에 올리고 immutable asset ID 또는 presigned URL로 참조한다.
inline body/result를 truncate·resample하지 않고 거부한다.

thumbnail worker는 immutable Supabase source reference를 받아 MIME, byte count, SHA-256을 decode 전에
검사하고 image/pixel bomb budget, aspect ratio를 지킨 뒤 deterministic PNG/JPEG을 private derived bucket에
저장한다. 같은 tenant/key 동시 command는 한 promise를 공유하며 다른 fingerprint 재사용은 거부한다.
WebP는 deterministic encoder가 검증되기 전 unsupported다. Long AI도 strict command port를 사용하지만
queue acceptance가 증명될 때까지 광고하지 않는다.

gateway token은 `x-toonspectrum-gateway-token`에만 있다. body/status/result에 넣지 않는다. base URL은 path,
query, fragment, userinfo 없는 secure origin이어야 한다. fixed path와 redirect 차단으로 credential 유출을
막는다. response는 bounded extra-key-free v1 schema와 `fidelity: exact`를 만족해야 한다.

failover는 `BACKEND_GATEWAY_MAX_ATTEMPTS` 안에서 idempotent command와 같은 placement role에만 허용한다.
delivery가 불확실한 non-idempotent request는 재전송하지 않고 같은 idempotency key를 유지한다.

## rollout

1. distribution disabled 상태로 policy, gateway, Upstash coordination 배포
2. Supabase source/derived/export private bucket readiness와 exact-byte smoke 검증
3. Cloudflare DO coordinator와 단기 Nest admission ticket 활성화
4. CRDT fanout/lock용 long-running Nest Socket.IO host 배포
5. capability-worker 하나를 배포하고 signed health·exact thumbnail canary 실행
6. adapter, budget, lease, receipt, failure-path 검증 뒤 remote execution 활성화

rollout 뒤에도 provider 선택은 목적별이다. 동일 역할 continuity만 bounded recovery로 사용하고 서로 다른
workload는 서로 다른 host에 동시에 배치할 수 있다.
