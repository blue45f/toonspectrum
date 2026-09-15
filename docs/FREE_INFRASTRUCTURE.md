# ToonSpectrum 무료 우선 인프라 운영 기준

상태: **활성 아키텍처 정책**

정책 파일: [`config/free-infrastructure-policy.json`](../config/free-infrastructure-policy.json)

검증: `pnpm run verify:free-infrastructure`

## 목표

운영자 비용을 가능한 한 0원에 가깝게 유지하되 기능, 품질, 데이터 무결성, 보안 수준을 낮추지
않는다. 무료 자원의 개수를 늘리는 것보다 다음 경계를 먼저 지킨다.

1. 정적 요청은 정적 CDN이 직접 처리한다.
2. 작품 원본과 무거운 렌더링은 로컬 우선으로 처리한다.
3. 개인 대용량 데이터는 사용자 소유 저장소(BYOS)를 기본 확장 경로로 사용한다.
4. 회원, 권한, 작품 소유권, 거래 상태는 하나의 PostgreSQL 원장에 유지한다.
5. 실시간 조정, 공개 에셋, 백업은 목적별 공급자로 분리한다.
6. 유료 전환과 유료 failover는 자동화하지 않는다.
7. Oracle/OCI는 운영, 폴백, 백업 후보에서 제외한다.

## 최종 배치

| 책임 | 기본 경계 | 원칙 |
|---|---|---|
| 정적 웹·카탈로그 | Cloudflare Static Assets | 정적 요청은 Worker를 실행하지 않는다. |
| 동적 경로 게이트웨이 | Cloudflare Worker | `/api`, Socket.IO, OG 경로만 처리한다. |
| 핵심 원장 | Neon/호환 PostgreSQL | 회원·ACL·소유권·거래의 단일 쓰기 권위다. |
| 실시간 room 조정 | Cloudflare Durable Objects | presence·cursor·comment·signaling만 담당한다. |
| 공개 에셋 | Cloudflare R2 Standard | 해시 기반 불변 객체와 장기 캐시를 사용한다. |
| 원본·DB 백업 | Backblaze B2 + 암호화 로컬 사본 | 주 공급자와 실패 도메인을 분리한다. |
| 개인 프로젝트 | OPFS/로컬 파일/BYOS | 운영자 중앙 저장소를 무제한 개인 드라이브로 사용하지 않는다. |
| 이메일 | Resend | 인증·보안·거래 메일을 우선하고 알림은 digest한다. |
| 기존 NestJS API | 기존 운영 경계 → scale-to-zero 호환 경계 | Worker로 옮기지 못한 핵심 API만 남긴다. |
| AI | 사용자 키 또는 로컬 모델 | 운영자 AI key를 기본 경로로 사용하지 않는다. |

## 현재 구현된 전환 경계

### 정적 웹 분리

`deploy/cloudflare-static`은 Static Assets와 최소 Worker gateway를 함께 정의한다.
`assets.run_worker_first`는 동적 경로에만 적용되므로 일반 정적 요청은 Worker 일일 요청 한도를
사용하지 않는다. 기존 `/api` 상대 경로를 대규모로 즉시 바꾸지 않아도 API origin을 분리할 수
있다.

### 보안·캐시 헤더 보존

`apps/web/public/_headers`는 `vercel.json`의 검증된 헤더에서 생성한다. 정적 호스트를 바꾼다는
이유로 CSP, COOP/COEP, HSTS, immutable cache 계약을 제거하지 않는다.

### 자동 배포 차단

- `vercel.json`은 모든 Git branch 배포를 비활성화한다.
- 기존 `vercel:deploy`, `vercel:preview` 명령은 실패한다.
- Cloudflare 운영 배포는 검토된 `main`, clean worktree, 명시적 approval 문자열이 모두 있어야 한다.
- PR과 `main` 병합 자체는 배포를 만들지 않는다.

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

## 저장소 배치 규칙

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

## DB 분리 규칙

### 단일 원장에 남기는 데이터

- 사용자와 인증 상태
- 작품·프로젝트 소유권
- 팀·협업 ACL
- 마켓 거래·라이선스·정산 상태
- asset 위치와 lifecycle 원장
- 관리자 감사 이벤트

### 분리 가능한 파생 데이터

- 공개 카탈로그와 정적 검색 shard
- 추천 후보와 인기 집계
- 기능 플래그와 에지 설정
- 재생성 가능한 검색 인덱스
- 짧은 TTL cache와 idempotency receipt

파생 저장소 장애는 원장의 의미를 바꾸지 않는다. 요청 중 여러 DB에 동시 쓰지 않고 원장
transaction과 outbox를 완료한 뒤 idempotent consumer가 파생 데이터를 갱신한다.

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
export CLOUDFLARE_CORE_API_ORIGIN=https://<reviewed-core-api-origin>
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

운영 배포 전에는 커스텀 도메인, CSP, 로그인 cookie, OAuth callback, `/api/health/ready`, Socket.IO
upgrade, OG crawler HTML, Studio WASM/WebGPU 로딩을 canary에서 확인한다.

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
- 핵심 원장의 기능별 다중 DB 분할
- Queue를 영구 이벤트 원장으로 사용
- 프로젝트 원본을 PostgreSQL BLOB에 저장
- 파일 바이트를 NestJS가 받아 다시 object storage로 중계
- 운영자 key를 기본 AI 경로로 사용
- 자동 preview 및 production 배포
- 검증되지 않은 fallback 공급자 자동 선택
- 복구 rehearsal 없는 백업 완료 표시
