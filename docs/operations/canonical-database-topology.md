# ToonStudio 운영 DB / 데이터 플레인 정본

> 기준일: 2026-09-29
>
> 이 문서는 **Neon `neondb` 하나만 운영 DB라고 기억하는 오류를 방지하기 위한 운영 정본**이다.
> DB, KV, realtime state, object storage, analytics를 모두 같은 종류의 DB로 취급하지 않으며,
> 각 workload의 단일 authority와 현재 연결 상태를 구분한다.

## 1. 현재 운영 권위

| 영역 | 현재 권위 / 자원 | 상태 | 용도 |
| --- | --- | --- | --- |
| Core API 영속 원장 | **Supabase PostgreSQL** `ybsgfhofuvkhywbpytnl` | **현재 권위** | 계정·세션·creator·작품·커뮤니티·commerce·협업 등 동적 제품 데이터 |
| 기존 Neon | **Neon project `spring-cake-80412917` / main / `neondb`** | **legacy 보존** | 기존 원본·호환/마이그레이션 기준. 새 운영 쓰기 권위로 사용하지 않음 |
| Studio ephemeral realtime | Cloudflare Durable Objects | 운영 정본 | presence·comment invalidation·screen-share signaling |
| Studio 장기 Socket.IO 저장/cluster | Render `toonspectrum-studio-live` + direct PostgreSQL contract | 선택형/별도 runtime | Socket.IO adapter 및 CRDT 영속 경계. Core API 원장과 역할을 혼합하지 않음 |
| 분산 제한/조정 | Upstash Redis | 운영 계약에 포함 | auth rate-limit·lease·짧은 idempotency·hot coordination |
| private object storage | Supabase / Cloudflare R2 / Backblaze B2 | 목적별 고정 라우팅 | source·derived·export 파일 data plane |
| 공개 정적/대형 자산 | Cloudflare Static Assets / R2 | 운영 정본 | 정적 카탈로그·대형 immutable asset |
| 개인 창작 원본 | OPFS / 로컬 / BYOS | 사용자 측 권위 | 중앙 DB에 불필요한 개인 원본을 저장하지 않음 |

### Neon에 대한 명시적 규칙

- 현재 확인된 Neon 운영 프로젝트에는 **`neondb` 하나**가 있으며 main branch가 기본 branch다.
- `neondb`는 기존 원본/legacy compatibility 자원으로 보존한다.
- **새 제품 데이터의 기본 write authority는 Neon으로 되돌리지 않는다.**
- Supabase와 Neon에 같은 제품 데이터를 자동 dual-write하지 않는다.
- quota 장애를 이유로 Neon ↔ Supabase 사이를 자동 failover하지 않는다.
- Neon branch를 새 production DB로 간주하지 않는다. 이름이 `pre-*`, `backup-*`, `migration-*`인 branch는 검증/백업 이력으로 취급한다.

## 2. 실제 확인된 현재 상태

### Supabase

- project: `ybsgfhofuvkhywbpytnl`
- 상태: `ACTIVE_HEALTHY`
- PostgreSQL 17
- `toonspectrum_federation` private schema와 `provider_quota_snapshot`, `social_projection`, `migration_checkpoint` 보존
- 현재 실제 데이터가 존재하므로 과거의 “빈 시작” 기록만 보고 **빈 DB로 오인하면 안 된다**.
- 2026-09-29 read-only 확인 결과:
  - `public.account`: 1
  - `public.session`: 0
  - `public.creator_work`: 1
  - `public.creator_work_revision`: 2
  - `public.toonspectrum_schema_migration`: 13
  - `toonspectrum_federation.migration_checkpoint`: 0

### Neon

- project: `spring-cake-80412917` (`webtoon-index`)
- default/main branch: `br-misty-bonus-aoh2bnha`
- database: `neondb`
- 현재 Neon project에는 과거 검증/백업 목적의 여러 branch도 남아 있으므로 branch 존재 자체를 운영 권위로 해석하지 않는다.

### Cloudflare D1

- 실제 생성 기록: `toonspectrum-analytics-buffer`
- 상태: **DB 생성 및 단독 canary 검증 완료, Core → Worker → D1 운영 경로 전환은 별도 확인 필요**
- 용도: analytics ingest buffer / 관리자 overview·pulse
- Core가 PostgreSQL에 대신 기록하는 자동 fallback은 금지한다.

### GCP / Firebase

- GCP project: `toonstudio-cloud-20260915`
- Firestore: `(default)`, `asia-northeast3`
- Firebase RTDB: `asia-southeast1`
- BigQuery dataset: `toonspectrum_analytics`
- 현재 기록상 자원/초기 schema는 생성되어 있으나 제품 runtime의 알림·presence·analytics authority로 모두 연결된 것으로 계산하지 않는다.

## 3. 분산 workload 후보와 현재 상태

### 권위 전환이 준비됐지만 인증/운영 연결이 없는 자원

다음은 정책/manifest에 정의되어 있으나 **실제 운영 자원으로 생성되었다고 간주하지 않는다**.

- CockroachDB Basic — payment/entitlement/idempotency ledger
- TiDB Cloud Starter 5개 — identity, projects, commerce, community, collaboration
- Turso — public catalog/read model
- Azure Cosmos DB Free — project documents/large JSON
- AWS DynamoDB Free — audit/delivery/usage events
- MongoDB Atlas M0 — AI jobs/moderation evidence
- Convex Free — live review
- Appwrite Free — feedback/support/business inquiries
- MotherDuck Lite — offline analysis

이 목록은 “향후 workload를 분산할 논리 shard”이며, 공급자 인증·quota snapshot·repository·권한·canary가 끝나기 전에는 운영 처리량에 포함하지 않는다.

### 이미 구현/연결 계약이 있는 보조 데이터 플레인

- Upstash Redis: rate-limit / lease / short idempotency / hot cache
- Cloudflare Durable Objects: ephemeral realtime
- Supabase/R2/B2: 목적별 private object storage
- Cloudflare D1: analytics buffer
- BigQuery/MotherDuck: 분석 후보/배치 경계
- Turso/D1: public/read-model 후보

## 4. 운영 환경변수 정본

### Core API

반드시 실제 운영 secret store에서 확인해야 하는 값:

- `DATABASE_URL` → **현재 Supabase PostgreSQL authority**
- `AUTH_SESSION_SECRET`
- `AUTH_STATE_SECRET` (authorization-code OAuth를 사용하는 경우)
- `API_CORS_ALLOWED_ORIGINS`
- `WEB_APP_BASE_URL`
- `OAUTH_REDIRECT_BASE_URL`
- `AUTH_RATE_LIMIT_MODE=distributed`
- `UPSTASH_COORDINATION_ENABLED=true`
- `UPSTASH_COORDINATION_REST_URL`
- `UPSTASH_COORDINATION_REST_TOKEN`
- `UPSTASH_COORDINATION_KEY_HASH_SECRET`

Supabase PostgreSQL TLS를 사용하는 배포 이미지에는 공개 CA를 포함하고
`NODE_EXTRA_CA_CERTS=/app/deploy/trust/supabase-prod-ca-2021.crt` 계약을 유지한다.
Native Render runtime을 사용하는 경우에는 이 파일 경로가 실제 runtime에 존재하는지 별도로 확인한다.
**DB 비밀번호, API token, OAuth secret, private key, connection string 등 실제 secret 값은 Git에 기록하지 않는다. 로컬 개발/검증에서는 `.env.local`, `.env.development.local`, `.env.production.local` 등 Git에서 제외된 로컬 env 파일에 저장하고, 실제 운영에서는 배포 플랫폼의 secret/environment store에 저장한다. 문서와 `.env.*.example` 파일에는 변수명과 placeholder만 기록한다.**

### Studio live runtime

- `DATABASE_URL` → 현재 Core API와 동일한 제품 authority가 필요한 ACL/read 경계
- `STUDIO_LIVE_CLUSTER_ADAPTER=postgres`
- `STUDIO_LIVE_POSTGRES_URL` → **LISTEN 가능한 direct PostgreSQL endpoint**
- `STUDIO_LIVE_POSTGRES_POOL_MAX=2`
- `STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED`
- `AUTH_SESSION_SECRET`
- `API_CORS_ALLOWED_ORIGINS`

`STUDIO_LIVE_POSTGRES_URL`에는 Neon transaction pooler/PgBouncer endpoint를 사용하지 않는다.
Core 원장과 Studio Socket.IO cluster 저장 역할을 임의로 합치거나 서로 다른 authority로 바꾸지 않는다.

### Analytics

D1 전환을 실제 운영에 연결할 때만 다음을 활성화한다.

- `TRAFFIC_ANALYTICS_STORE=d1`
- `TRAFFIC_ANALYTICS_D1_RPC_URL`
- `TRAFFIC_ANALYTICS_D1_RPC_TOKEN`
- `TRAFFIC_ANALYTICS_D1_TIMEOUT_MS`

현재 값을 확인하지 못한 상태에서 `d1`로 강제 전환하지 않는다.

### Private object storage

목적별 provider routing을 사용하는 경우:

- `PRIVATE_OBJECT_STORAGE_ENABLED`
- `PRIVATE_OBJECT_STORAGE_SOURCE_PROVIDER`
- `PRIVATE_OBJECT_STORAGE_DERIVED_PROVIDER`
- `PRIVATE_OBJECT_STORAGE_EXPORT_PROVIDER`
- `PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT`
- 선택 provider의 endpoint / access key / secret / bucket
- 필요 시 `PRIVATE_OBJECT_STORAGE_QUOTA_GUARD_ENABLED` 및 최신 quota snapshot

routing fingerprint만 바꾼다고 기존 객체가 이동하지 않는다. 기존 object reference와 실제 bucket을 함께 검증한 뒤 routing을 바꾼다.

## 5. 앞으로 DB를 추가할 때의 고정 규칙

1. **먼저 workload를 선언**한다. “DB 하나 추가”가 아니라 어떤 domain의 read/write authority인지 기록한다.
2. provider 인증과 quota snapshot을 확인한다.
3. schema/permission/canary를 검증한다.
4. 하나의 aggregate에는 하나의 write authority만 둔다.
5. automatic cross-provider write failover와 synchronous dual-write를 사용하지 않는다.
6. 기존 Neon 데이터가 남아 있다는 이유로 Neon을 새 권위로 되돌리지 않는다.
7. 생성된 DB와 실제 runtime 연결을 구분한다.
8. 문서의 “provisioned / connected / cut over / candidate” 상태를 분리해 기록한다.
9. 운영 credential, DB URL, token 값 자체는 Git에 기록하지 않는다. 실제 값은 로컬에서는 `.env.local` 계열의 Git-ignored 파일에 저장하고, 운영에서는 배포 플랫폼의 secret/environment store에 저장한다.
10. 이 문서와 `config/free-database-federation.json`의 shard/route 변경은 함께 검토한다.

## 6. 관련 정본

- `DEPLOY.md` — 실제 배포 역할과 수동 release 경계
- `docs/operations/federated-free-database-data-plane.md` — 무료 DB federation의 전환·rollback 기록
- `config/free-database-federation.json` — provider/shard/route 정책
- `docs/FREE_INFRASTRUCTURE.md` — 무료 인프라와 실제 생성 자원 기록
- `.env.production.example` — 운영 환경변수 계약
- `deploy/trust/README.md` — Supabase PostgreSQL TLS CA 계약

> **중요:** DB 개수나 schema 파일 존재만으로 “분산 처리가 완료”된 것으로 기록하지 않는다.
> 실제 운영 분산 완료는 해당 workload의 repository 연결, 권한, read/write canary, quota guard,
> 장애 시 fail-closed 동작, 배포된 runtime 검증까지 끝난 경우에만 표시한다.
