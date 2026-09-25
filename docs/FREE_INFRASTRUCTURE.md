# ToonSpectrum 무료 우선 인프라 운영 기준

상태: **current — 무료 우선 정책 / migration — Supabase 빈 시작·D1 연결 준비 / target — 추가 공급자 후보 보류**

기준일: **2026-09-26**. 이 문서는 운영 중인 경계, 생성·구현 후 운영 반영을 기다리는 항목,
장기 후보를 구분한다. 정책 파일에 공급자가 있다고 해서 해당 공급자가 생성되었거나 운영 요청을
처리한다고 해석하지 않는다.

정책 파일: [`config/free-infrastructure-policy.json`](../config/free-infrastructure-policy.json)

DB 연합 운영 기준: [`operations/federated-free-database-data-plane.md`](operations/federated-free-database-data-plane.md)

검증: `pnpm run verify:free-infrastructure`

## 목표

운영자 비용을 가능한 한 0원에 가깝게 유지하되 기능, 품질, 데이터 무결성, 보안 수준을 낮추지
않는다. 서로 독립적인 무료 할당량을 최대한 활용해 실제 처리 가능한 트래픽을 늘리는 것이
목표다. 분산은 다음 데이터·실행 경계를 유지하면서 진행한다.

1. 정적 요청은 정적 CDN이 직접 처리한다.
2. 작품 원본과 무거운 렌더링은 로컬 우선으로 처리한다.
3. 개인 대용량 데이터는 사용자 소유 저장소(BYOS)를 기본 확장 경로로 사용한다.
4. 원자 작업의 경계를 보존하고 각 데이터의 쓰기 권위를 하나로 정해 독립 workload부터 분산한다.
5. 실시간 조정, 공개 에셋, 백업은 목적별 공급자로 분리한다.
6. 유료 전환과 유료 failover는 자동화하지 않는다.
7. Oracle/OCI는 운영, 폴백, 백업 후보에서 제외한다.

## 현재 운영 경계 — current

아래는 기존 서비스의 운영 경계다. 새 DB와 분석 저장소의 전환 완료를 의미하지 않으며,
현재 장애 복구와 배포 후 검증은 다음 절에서 별도로 관리한다.

| 책임 | 현재 경계 | 원칙 |
|---|---|---|
| 정적 웹·카탈로그 | Cloudflare Static Assets | 정적 요청은 Worker를 실행하지 않는다. |
| 동적 경로 게이트웨이 | Cloudflare Worker | `/api`, Socket.IO, OG 경로만 처리하고 liveness는 edge에서 응답한다. |
| 실시간 room 조정 | Cloudflare Durable Objects | presence·cursor·comment·signaling만 담당한다. |
| 공개 에셋 | Cloudflare R2 Standard | 해시 기반 불변 객체와 장기 캐시를 사용한다. |
| private 객체 | 기록된 공급자 위치 + 목적별 고정 라우팅 | R2/Supabase/B2 adapter 지원과 실제 bucket·복제 완료 여부는 구분한다. |
| 개인 프로젝트 | OPFS/로컬 파일/BYOS | 운영자 중앙 저장소를 무제한 개인 드라이브로 사용하지 않는다. |
| Core NestJS API | Render `toonspectrum-core-api` | scale-to-zero full authority이며 수동 release만 허용한다. |

AI는 기능에서 제외하지 않는다. 사용자 키는 통합 설정에서 재사용하고, 로컬 실행은 해당 기능의
결과·품질·사용성을 보존하는 경우에 사용한다. 키 미설정·한도·실패를 이유로 운영자 유료 추론으로
자동 전환하지 않는다. 이메일은 인증·보안·거래 계약을 유지하며 비용만을 이유로 필수 전달을
생략하거나 사용자에게 불필요한 대기를 추가하지 않는다.

## 이번 구현과 운영 반영 대기 — migration

사용자는 2026-09-26 기존 Neon 원본을 보존하고 기존 데이터 이관을 생략한 새 무료 DB의 빈 시작을
승인했다. 기존 Neon은 quota 장애가 확인된 보존 원본이며 정상 복구 대상으로 검증된 상태가 아니다.

| 대상 | 실제 완료·검증 | 아직 완료하지 않은 운영 경계 |
| --- | --- | --- |
| Supabase PostgreSQL 17 핵심 DB | 정본 스키마 적용, migration 원장 92행·marker 13개·사용자 0행, 제한 runtime TLS 인증·권한·rollback 검증 | Render DB·CA 설정과 배포된 API의 가입·로그인·저장 검증 |
| Supabase 앱 readiness | 실제 runtime과 CA `verify-full`로 Node `PostgresHealthReadinessRepository` 실행: `database=true`, `schema=true` | 배포된 HTTP readiness 및 사용자 흐름 검증 |
| Cloudflare D1 분석 DB | 실제 DB 1개 `toonspectrum-analytics-buffer`, `analytics-buffer-v2` 적용, 단독 중복 이벤트·heartbeat·overview·pulse canary 통과 | 인증 Worker 배포와 Core 수집·관리자 조회의 `TRAFFIC_ANALYTICS_STORE=d1` 전환 |
| Firestore·Firebase RTDB·BigQuery | 무료 자원과 초기 규칙·테이블 생성, GCP billing 비활성 | 제품 repository·권한·실제 runtime 연결; 아직 알림·presence·분석의 운영 권위가 아님 |
| Supabase compatibility schema | private `toonspectrum_federation` 3개 테이블 보존 | 이관 검증용 보조 schema이며 소셜 운영 권위로 전환하지 않음 |
| 공급자 후보 라우터 | 정책·quota 검사·경로 계획 코드 | 기본 비활성; `plan()` 실행만으로 제품 읽기·쓰기가 분산되지 않음 |

Supabase의 공개 CA는 검증된 파일을 Linux image에 포함하고 `NODE_EXTRA_CA_CERTS`로 신뢰를
추가하는 방식으로 배포 준비한다. DB·CA의 개별 검증은 운영 연결 완료와 구분한다. SQL 적용
체크섬, 원격 검증 근거와 남은 전환 기준은 [상세 운영 기록](operations/federated-free-database-data-plane.md)에 둔다.

D1 v2 원격 canary에서는 새 세션과 page view를 기록하는 쓴 행 수가 12행에서 9행으로
25% 줄었다. 이는 동일한 단일 canary의 D1 `meta` 측정이며 일일 처리량이나 실제 트래픽 규모를
보장하는 수치가 아니다.

직전 Core image에는 새 공개 CA와 D1 adapter가 없다. 새 Supabase·D1 환경변수를 유지한 채
이전 image만 복원하면 TLS 연결이 실패하거나 분석 쓰기 권위가 PostgreSQL로 돌아갈 수 있다.
Neon의 quota `402`도 해소되지 않았으므로 기존 DB를 정상 rollback 대상으로 간주하지 않는다.
새 image에서 TLS readiness와 D1 수집·조회를 먼저 검증하고, 복구는 image·환경변수·DB 쓰기 권위를
함께 판단한다. 새 권위에 쓰기가 시작된 뒤 원장이나 분석 저장소를 자동으로 되돌리지 않는다.

## 장기 공급자 후보 — target, 활성화 보류

| 후보 공급자 | 검토할 독립 workload | 활성화 전제 |
| --- | --- | --- |
| CockroachDB·TiDB | 거래 원장, 계정·프로젝트·커뮤니티·협업 중 독립성이 검증된 도메인 | 원자 작업·인가·멱등성·복구 계약과 무료량 확인; 현재 운영 DB가 아님 |
| Cosmos·DynamoDB·MongoDB Atlas | 큰 JSON, 감사 이벤트, AI job 문서 | 데이터 계약, runtime 인증, repository와 quota 검증 |
| Turso·추가 D1·MotherDuck | 공개 read model, edge index, 오프라인 분석 | 재생성·동등성·행 비용·실제 무료 할당량 검증 |
| Convex·Appwrite | 독립 review·feedback workflow | 기존 기능·품질·권한을 유지하는 연결 구현과 운영 검증 |

특정 엔진이나 DB 수를 최종 배치로 고정하지 않는다. 초안의 TiDB 5개 instance와 D1 edge 8개·분석
2개 shard는 배치 후보였으며 생성·연결 완료 수가 아니다. D1처럼 계정 전체 한도를 공유하는
공급자는 DB를 늘려도 무료 읽기·쓰기·저장량 합계가 늘지 않는다. 독립 무료량이 실제로 추가되는지와
요청당 행·저장·전송 비용을 측정한 뒤 채택한다.

## 현재 구현된 전환 경계

### 정적 웹 분리

`deploy/cloudflare-static`은 Static Assets와 최소 Worker gateway를 함께 정의한다.
`assets.run_worker_first`는 동적 경로에만 적용되므로 일반 정적 요청은 Worker 일일 요청 한도를
사용하지 않는다. 기존 `/api` 상대 경로를 대규모로 즉시 바꾸지 않아도 API origin을 분리할 수
있다.

### 보안·캐시 헤더 보존

`apps/web/public/_headers`와 Worker 동적 응답은 `config/http-response-headers.json`의 같은 보안·캐시
계약을 사용한다. 정적 호스트를 바꾼다는 이유로 CSP, COOP/COEP, HSTS, immutable cache 계약을
제거하지 않는다.

### 자동 배포 차단

- Vercel 런타임·설정·배포 workflow는 제거되었고 아키텍처 검증이 재도입을 거부한다.
- Render Core API와 Cloudflare 운영 배포는 모두 수동이며 검토된 `main` SHA를 사용한다.
- Cloudflare 운영 배포는 clean worktree와 명시적 approval 문자열이 모두 있어야 한다.
- PR과 `main` 병합 자체는 어느 공급자에도 배포를 만들지 않는다.

### 공급자 제외

기존 `deploy/oci` 실행 scaffold와 migration runbook은 제거했다. 정책 검증은 해당 경로가 다시
추가되면 실패한다. 계정 중단 경험이 있는 공급자를 단순 무료 용량 때문에 복구 경로로 다시
도입하지 않는다.

### 목적별 private object storage 라우팅

API는 Supabase 전용 구현 대신 provider-neutral port를 사용한다. source·derived·export 목적은 각각
Supabase, Cloudflare R2, Backblaze B2 중 정확히 한 공급자에 고정할 수 있다. S3-compatible 공급자는
AWS SigV4, SHA-256 content-addressed path, immutable upload, signed read URL, private bucket readiness를
동일한 계약으로 검증한다. 라우팅에서 사용하지 않는 purpose bucket은 만들 필요가 없다.

라우팅은 다음 명령으로 fingerprint를 만든 뒤 환경변수와 함께 검토한다.

```bash
pnpm run infra:storage-routing-fingerprint -- \
  --source=cloudflare-r2 \
  --derived=supabase \
  --export=backblaze-b2
```

신규 저장 참조는 `toonspectrum.private-object-storage.v2`와 `providerId`를 함께 기록한다.
`0048_creator_asset_storage_locations`는 기존 v1 행을 역사적 Supabase primary로 승격한다. 따라서
라우팅 fingerprint를 바꿔도 기존 객체 읽기·삭제는 기록된 공급자로 유지되고 새 객체만 새 배치를
따른다. 기존 primary를 보유한 공급자 credential은 명시적 migration이 완료될 때까지 제거하면 안
된다. B2 adapter가 존재한다고 해서 R2 객체가 자동 백업되는 것도 아니다. 검증된 secondary copy는
`creator_asset_storage_replica` inventory에 기록하고 복제·승격은 별도의 승인된 작업으로 수행한다.

## 저장소 배치 규칙 — target 계약

이 표는 데이터 배치와 보존의 기준이다. adapter나 bucket의 존재만으로 자동 백업·복제·복구까지
운영 중이라고 판단하지 않는다.

| 데이터 | 기본 위치 | 운영자 클라우드 업로드 조건 |
|---|---|---|
| 작업 중 프로젝트·레이어 | OPFS | 공유·게시·사용자 명시 동기화 전에는 업로드하지 않는다. |
| 로컬 프로젝트 패키지 | File System Access / 다운로드 | 사용자가 직접 보관한다. |
| 개인 원본의 원격 동기화 | BYOS | 사용자가 저장소와 credential을 소유한다. |
| 공개 브러시·텍스처·GLB·VRM | R2 | 공개 라이선스·무결성 검증 후 불변 객체로 등록한다. |
| 썸네일·프리뷰 | R2 또는 사전 생성 정적 파일 | 원본에서 재생성 가능해야 한다. |
| 게시 작품 원본 | 중앙 private storage | 명시적 게시·공유 계약과 quota admission을 통과해야 한다. |
| DB dump·재생성 불가능 원본 | B2 + 암호화 로컬 | 체크섬과 복구 테스트를 통과해야 한다. |
| 내보내기 ZIP·영상 | 사용자 기기 우선 | 서버 생성 시 짧은 TTL 후 삭제한다. |
| 임시 업로드 | 목적별 temp prefix | lifecycle로 자동 삭제한다. |

중앙 스토리지를 여러 공급자에 무작위로 쓰지 않는다. 논리적 asset id와 공급자 위치 등록부를
통해 신규 데이터 배치와 이전을 분리한다. 파일 이전은 `복사 → 크기·SHA-256 검증 → 등록부 전환
→ 관찰 기간 → 이전 객체 삭제` 순서로 수행한다.

## DB 연합 배치 규칙

상세 운영 계약은
[`operations/federated-free-database-data-plane.md`](operations/federated-free-database-data-plane.md)를
따른다. 무료 DB를 연결할 때도 aggregate마다 쓰기 권위는 하나뿐이다.

### 원자 작업과 쓰기 권위

계정 병합, 작품 저장, 게시 승인, 거래 확정처럼 함께 성공하거나 실패해야 하는 작업은 현재의
transaction 경계를 유지한다. 이번 빈 시작은 이 계약을 Supabase PostgreSQL에 구성하는 단계다.
PostgreSQL이나 하나의 DB를 영구 조건으로 두지 않으며, 별도 공급자로 분리할 때는 확정 버전,
인가·멱등성·복구 프로토콜을 먼저 구현한다. 요청 한 번에서 여러 DB로 권위 쓰기를 동시에 보내거나
장애 시 다른 DB에 자동으로 쓰지 않는다.

### 독립 workload와 파생 데이터

방문 분석처럼 원장 외래키에 의존하지 않는 workload부터 실제 수집·조회·retention을 함께
분리한다. 공개 카탈로그는 현재 Static Assets 경로를 유지하고, Turso 같은 read model은
추가 효과와 동등성을 검증한 뒤 도입한다. Firestore·RTDB·BigQuery는 생성되어 있어도 repository가
연결되기 전에는 운영 트래픽 분산으로 계산하지 않는다. BigQuery Sandbox는 streaming 대신
검증한 batch load를 후보로 사용한다.

파생 데이터의 비동기 복제는 권위 transaction과 outbox, 멱등 consumer를 갖춘 경로에 한해
사용한다. 후보 라우터는 기본 비활성이며, 환경변수 quota snapshot은 자동 갱신 경로가 검증되기
전까지 운영 중앙 쓰기의 공통 게이트로 활성화하지 않는다. 실제 활성화된 admission은 snapshot이
없거나 만료되면 실패로 처리하고, 유료 failover나 다른 엔진으로 자동 쓰기 전환하지 않는다.

## 무료 한도 가드레일

정책 파일의 기준은 다음과 같다.

| 비율 | 동작 |
|---:|---|
| 60% | 관리자 경고와 공급자별 원인 표시 |
| 70% | 현재 증가율로 예상 소진일 계산 |
| 80% | 신규 대형 파일을 로컬/BYOS로 유도하고 파생 파일 정리 |
| 85% | 개인 대형 파일의 중앙 신규 쓰기 중단 |
| 95% | 핵심 원장 외 중앙 쓰기 중단, 읽기·내보내기·로컬 저장 유지 |

`free-allowance-with-app-cap` 공급자는 공급자 청구서가 한도를 알려주기 전에 애플리케이션에서
더 낮은 hard cap을 적용한다. 알림은 과금 차단이 아니므로 자동 유료 failover를 허용하지 않는다.

### Private object storage 쓰기 admission

목적별 R2/Supabase/B2 라우팅은 신규 객체 배치 정책이고, 저장된 v2 `providerId`가 기존 객체
위치의 권위다. locator가 있더라도 quota 부족 시 다른 공급자로 자동 write failover하지 않는다.
대신 선택된 공급자에
바이트를 보내기 전에 `FreeTierPrivateObjectStorageWriteAdmission`이 다음을 검증한다.

- 공급자 상태가 `healthy`인지
- 측정 시각과 `staleAfterMs` 기준으로 사용량 스냅샷이 신선한지
- `max(usedBytes, forecastBytes) + uploadBytes`가 `capacityBytes × applicationHardCapRatio` 이하인지
- source 원본은 단일 authority에만 쓰이는지

운영에서 활성화할 때는 다음 값을 함께 설정한다.

```dotenv
PRIVATE_OBJECT_STORAGE_QUOTA_GUARD_ENABLED=true
PRIVATE_OBJECT_STORAGE_QUOTA_SNAPSHOTS_JSON={"version":"toonspectrum.private-object-storage-quota.v1","providers":{"cloudflare-r2":{"capacityBytes":10737418240,"applicationHardCapRatio":0.8,"billingBoundary":"free-allowance-with-app-cap","health":"healthy","usedBytes":0,"forecastBytes":0,"observedAtEpochMs":1800000000000,"staleAfterMs":86400000}}}
```

JSON에는 실제 라우팅에서 선택한 모든 공급자(`cloudflare-r2`, `supabase`, `backblaze-b2`)가
포함되어야 한다. 정적 환경 스냅샷은 만료되면 안전하게 쓰기를 중단한다. 이후 KV/D1 기반
실시간 수집기를 연결할 때는 `PrivateObjectStorageRuntimes.writeAdmission`으로 snapshot source를
주입하고 라우팅·객체 wire contract는 변경하지 않는다.

## 배포 절차

### 로컬 검증

```bash
pnpm run validate:architecture
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

### 운영 배포

```bash
git switch main
git pull --ff-only
git status --short
RENDER_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com pnpm run verify:render-core-origin
export CLOUDFLARE_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

운영 배포 전에는 커스텀 도메인, CSP, 로그인 cookie, OAuth callback, Render 직접
`/api/health/ready`, edge `/api/health/live`, Socket.IO upgrade, OG crawler HTML, Studio WASM/WebGPU
로딩을 canary에서 확인한다. Core 응답에 `x-vercel-id`가 있으면 전환을 중단한다.

## 단계별 후속 전환

### 2차: 위치 인식 asset registry와 replica inventory — 구현 완료

- provider-neutral private object storage port는 신규 upload를 provider-located v2 reference로 감싼다.
- `creator_asset_storage_object.providerId`가 primary 위치를 고정해 목적별 라우팅 변경 후에도 기존
  객체를 다른 공급자로 오인하지 않는다.
- `creator_asset_storage_replica`는 검증 시각·상태·경로·digest·bytes·MIME를 기록하며 trigger가
  primary와 동일한 공급자 또는 불일치 metadata를 거부한다.
- replica는 자동 write/read authority가 아니며 승격은 별도 operator-gated migration으로만 수행한다.
- 다음 단계는 outbox 기반 비동기 복제 작업과 digest 검증 후 inventory 등록을 연결하는 것이다.

### 3차: BYOS

- OPFS 자동 저장을 기본 유지한다.
- File System Access 기반 프로젝트 폴더 연결을 우선한다.
- WebDAV와 S3-compatible 사용자 저장소를 provider port 뒤에 추가한다.
- Google Drive/OneDrive는 별도 OAuth scope와 revoke UI가 준비된 뒤 활성화한다.
- credential은 서버 DB나 프로젝트 파일에 평문으로 저장하지 않는다.

### 4차: API 축소

- 카탈로그·도움말·공개 설정은 정적 shard로 이동한다.
- signed upload, rate limit, Turnstile, 공개 read만 경량 Worker 후보로 이동한다.
- 인증·권한·거래처럼 원장 transaction이 필요한 경로는 Core API에 유지한다.
- 이미지·영상·3D·AI의 기본 실행 위치는 브라우저 또는 사용자 로컬 companion으로 유지한다.

### 5차: 백업·복구 검증

- 매일 PostgreSQL logical dump
- 중요 object manifest와 SHA-256 inventory
- B2 encrypted replica
- 관리자 로컬 암호화 사본
- 월 1회 빈 환경 복구 rehearsal

백업 파일 존재만으로 복구 가능하다고 간주하지 않는다. restore 후 row count, migration ledger,
asset digest, ACL, 샘플 프로젝트 열기를 검증한다.

## 금지 사항

- 무료 용량 우회를 위한 다중 계정 순환
- 사용자에게 알리지 않은 품질·해상도·기능 하향
- 공급자 한도 초과 시 자동 유료 전환
- 원자 작업·권한·복구 계약을 구현하지 않은 핵심 원장의 다중 DB 분할
- Queue를 영구 이벤트 원장으로 사용
- 프로젝트 원본을 PostgreSQL BLOB에 저장
- 파일 바이트를 NestJS가 받아 다시 object storage로 중계
- 운영자 key를 기본 AI 경로로 사용
- 자동 preview 및 production 배포
- 검증되지 않은 fallback 공급자 자동 선택
- 복구 rehearsal 없는 백업 완료 표시
