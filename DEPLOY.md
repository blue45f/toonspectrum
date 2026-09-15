# ToonSpectrum 배포 가이드

> **2026-09-15 사용자 정책:** 자동 빌드·배포 금지. PR 병합은 배포 승인이 아닙니다.
> 승인한 main SHA의 변경 배포 단위만 Cloudflare와 Render에 수동 반영합니다.
> Vercel은 정상 운영 권위가 아니라 승인형 emergency prebuilt rollback입니다.
> [최소 비용 배포 정책](docs/operations/minimum-cost-deployment-policy.md)이 이전 자동 배포 지침을 대체합니다.

기본 운영 권위는 무료 우선으로 분리합니다. Cloudflare Static Assets가 SPA와 정적 카탈로그를
직접 제공하고, 최소 Worker gateway는 API·Socket.IO·OG crawler 경로만 검토된 Core API origin으로
전달합니다. Neon/호환 PostgreSQL은 동적 원장, Cloudflare Durable Objects는 Studio의 임시 실시간
상태, Upstash는 선택형 분산 제한·조정, 목적별 R2/B2/Supabase private storage는 파일 data plane을
담당합니다. Core API의 기본 origin은 Render `toonspectrum-core-api`이며 Vercel은 수동 비상
rollback일 뿐 Git 자동 배포나 정상 트래픽 권위가 아닙니다.

한 제공자가 다른 제공자의 전체 폴백이 되지는 않습니다. 각 workload는 하나의 authority를 가지며,
동등 계약·quota snapshot·복구 절차가 검증되지 않은 공급자에는 자동으로 쓰지 않습니다.

| 레이어 | 스택 | 기본 호스트 | 배포 산출물 |
| --- | --- | --- | --- |
| 프론트 | Vite + React SPA | Cloudflare Static Assets | `dist/` |
| 카탈로그 | 정적 스냅샷 | Cloudflare Static Assets | `public/data/*.json` |
| Edge gateway | Cloudflare Worker | Cloudflare | 동적 경로만 Core API로 전달 |
| Core API | NestJS | Render `toonspectrum-core-api` | 인증·ACL·거래·원장 transaction |
| DB | PostgreSQL | Neon/호환 Postgres | 동적 데이터 + checksum migration 원장 |
| Studio realtime | Durable Objects | Cloudflare | presence·comment invalidation·screen-share signaling |
| 분산 제한/조정 | Redis | Upstash(선택) | auth rate-limit·lease·coordination |
| private object storage | 목적별 private buckets | Supabase/R2/B2 | source·derived·export 고정 라우팅 |
| 개인 프로젝트 | OPFS/로컬/BYOS | 사용자 기기·저장소 | 운영자 중앙 저장 최소화 |

`render.yaml`은 두 런타임을 정의합니다. `toonspectrum-core-api`는
`API_RUNTIME_ROLE=full`인 동적 HTTP 권위이고, `toonspectrum-studio-live`는 선택형 Socket.IO
폴백입니다. 정적 gateway의 `CORE_API_ORIGIN`은 readiness를 통과한 Core 서비스만 가리켜야 하며,
실시간 전용 origin이나 정적 사이트 자신을 지정하면 안 됩니다.

### 운영 검증 스냅샷 (2026-08-02)

- production DB `0001`~`0025` exact ledger와 runtime capability 검증 완료
- Cloudflare realtime `workers.dev` 활성; `realtime.toonstudio.cloud` custom hostname/DNS/TLS는 대기
- Upstash coordination과 Supabase private buckets 활성
- Google OAuth production callback 수정·검증 완료
- AI provider production secret·budget/failover 값은 다음 승인 배포 반영 대기

## 0. 준비물

- Node 24.16+와 pnpm 11 (`corepack enable` 권장)
- Cloudflare 계정과 수동 배포 권한
- Render Core API 서비스와 수동 배포 권한(Vercel 비상 rollback은 선택)
- Neon 또는 호환 PostgreSQL `DATABASE_URL`
- 소셜 로그인 실연동 시 Google Cloud / Kakao Developers / Naver Developers / GitHub OAuth App

## 1. 로컬 검증

```bash
pnpm install
pnpm catalog:gen
pnpm run verify
```

`pnpm catalog:gen`은 `apps/api/data/catalog.json.gz`를 읽어 `public/data/*.json`과 `public/data/ranking/*.json`을 만듭니다. 이 산출물은 빌드 시 다시 생성되며, 랭킹 기본 뷰는 `disableLive=true` 스냅샷 산식으로 사전 계산됩니다.

## 2. 정적 웹과 Core API 배포

정적 웹은 Git push로 자동 배포하지 않습니다. 검토된 `main`의 clean worktree에서 다음 순서로
번들·헤더·라우팅을 확인한 뒤 수동 승인 배포합니다.

```bash
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run

RENDER_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com pnpm run verify:render-core-origin
export CLOUDFLARE_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

Core API에는 `.env.production.example`의 PostgreSQL·인증·CORS·목적별 object storage 설정을
Render encrypted environment 또는 root `.env.local` Secret File로 주입합니다. `CORE_API_ORIGIN`은
credential, path, query가 없는 별도 HTTPS origin이어야 하며 readiness와 비-Vercel 검사를 통과해야 합니다.
프런트의 상대경로 `/api/...`는 Cloudflare gateway를 통해 동일 origin 경험을 유지합니다.
`/market/library`, `/market/publish` 같은 SPA 화면은 Worker를 실행하지 않고 Static Assets가
처리하며, `/market`, `/market/browse`, `/market/resource/:id`의 crawler HTML만 OG endpoint로 갑니다.

`vercel.json`의 Git 배포는 모든 branch에서 비활성입니다. `.github/workflows/deploy-vercel.yml`은
Cloudflare 또는 Render를 즉시 복구할 수 없는 경우 production reviewer가 승인한 current-main
ancestor만 prebuilt로 올리는 비상 절차이며 일반 릴리스 경로가 아닙니다.

## 3. OAuth 콜백

운영 정본은 `https://www.toonstudio.cloud`입니다. 아래 값을 Core API 환경변수와 각 OAuth
콘솔에 동일하게 등록합니다.

```env
OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
```

콘솔 등록 URI:

- Google: `https://www.toonstudio.cloud/api/auth/oauth/google/callback`
- Kakao: `https://www.toonstudio.cloud/api/auth/oauth/kakao/callback`
- Naver: `https://www.toonstudio.cloud/api/auth/oauth/naver/callback`
- GitHub: `https://www.toonstudio.cloud/api/auth/oauth/github/callback`

Google Identity Services의 승인된 JavaScript origin에는
`https://www.toonstudio.cloud`를 등록합니다. apex는 앱 실행 전에 정본으로 308
리다이렉트하므로 OAuth 기준 URL은 www 하나로 유지합니다.

카카오는 REST API 키와 client secret, 네이버는 로그인 애플리케이션의 Client ID/Secret,
GitHub는 OAuth App의 Client ID/Secret을 Core API에 주입합니다. 자세한 콘솔 신청·동의항목·
검증 절차는 [`docs/social-login-provider-setup.md`](docs/social-login-provider-setup.md)를 따릅니다.
운영에서 자격 증명이 없는 카카오·네이버·GitHub 공급자는 로그인 화면에서 숨기며,
데모 로그인은 비운영 환경에서 명시적으로 활성화한 경우에만 노출합니다.

## 4. 데이터 갱신

기본 사용자 경로는 검토된 정적 카탈로그입니다. 배포된 API와 GitHub Actions에는 크롤 실행 경로가
없으며, 데이터는 아래 수동 절차로만 바뀝니다.

1. 로컬에서 플랫폼별 robots.txt·이용약관·API 정책·호출량 제한을 확인한다.
2. `pnpm catalog:update:manual`을 실행해 수집 결과를 기존 `apps/api/data/catalog.json.gz`에 병합하고
   `apps/web/public/data/*.json`을 다시 만든다.
3. `git diff --stat`과 작품 수·플랫폼별 건수·샘플 상세를 검토한다. 관련 정보가 필요하면
   `pnpm related:update:manual`도 별도로 실행한다.
4. 검토된 파일만 커밋하고 Cloudflare 정적 배포와 API 재배포에 포함한다.

운영 서버는 번들된 gz 파일을 부팅 시 한 번 읽습니다. 실행 중 파일 교체, DB 스냅샷 갱신,
`/api/catalog/ingest/*` 또는 `/api/catalog/refresh` 호출로 반영하는 경로는 없습니다.

## 5. 배포 후 점검

- 프론트 도메인 접속 → 홈/검색/랭킹이 로드되는지 확인.
- `GET https://<domain>/api/auth/providers`가 200인지 확인.
- `GET https://<domain>/api/ranking?axis=popular&period=daily&limit=5`가 `meta.source="formula-api"`와 스냅샷 산식 fallback reason을 반환하는지 확인.
- 표지 프록시(`/api/cover?u=...`)가 이미지를 반환하거나 안전하게 폴백하는지 확인.
- 로그인/리뷰/커뮤니티 기능이 DB 연결로 동작하는지 확인.

## 6. Studio 실시간 권위와 선택형 Socket.IO 폴백

현재 ephemeral realtime production 권위는 Cloudflare Durable Objects `workers.dev`
origin입니다. `realtime.toonstudio.cloud`는 DNS zone·custom hostname·TLS가 완료되기 전에
사용하지 않습니다. Cloudflare는 presence, comment invalidation, screen-share signaling을
역할별 ticket으로 처리하며 raster pixel, 작품 ACL, 음성 media 권위가 아닙니다.

로그인한 사용자가 저장된 작품을 다시 편집하고 서버에 저장하려면 CRDT 변경을 영속 저장하는
Socket.IO 권위 서버가 필요합니다. Cloudflare presence나 local/P2P 전달은 이 저장 확인을
대신하지 않습니다. 기본 장기 실행 Nest 경로는 Render의 별도 runtime이며, 아래 Vercel native
함수는 emergency rollback 호환성만 제공합니다. 자동으로 확인을 생략하거나 Cloudflare 권위를
변경하지 않습니다.

### 비상 롤백용 Vercel native WebSocket 함수

[현재 Vercel WebSocket 문서](https://vercel.com/docs/functions/websockets)는 Fluid Compute에서
Node `http.Server` export와 WebSocket 전용 Socket.IO 클라이언트를 지원합니다.
`api/studio-live.js`는 별도 native 서버를 export하고 `/socket.io` rewrite만 담당합니다.
기존 `api/index.js`와 `/api/*` HTTP 경로는 그대로 유지됩니다.

```env
# 서버 환경. API_RUNTIME_ROLE=full을 studio-live로 바꾸지 않습니다.
STUDIO_LIVE_VERCEL_ENABLED=true
STUDIO_LIVE_CLUSTER_ADAPTER=postgres
STUDIO_LIVE_POSTGRES_URL=postgresql://USER:PASSWORD@DIRECT_HOST/DATABASE?sslmode=verify-full&channel_binding=require
STUDIO_LIVE_POSTGRES_POOL_MAX=2
# Vite 빌드에서만 공개되는 실제 같은 프로젝트 origin
VITE_STUDIO_LIVE_ORIGIN=https://www.toonstudio.cloud
```

이 경로는 opt-in이나 PostgreSQL adapter 설정이 없으면 503으로 거절하며 memory adapter로
폴백하지 않습니다. 일반 HTTP 함수는 이 별도 LISTEN 풀을 만들지 않습니다. 기존 migration과
최소권한 runtime role, 정확한 Origin allowlist, 같은 세션 인증 설정을 먼저 확인해야 합니다.
이 문서와 로컬 테스트는 원격 환경변수를 설정하거나 운영 배포를 활성화하지 않습니다.

함수의 현재 `maxDuration`은 60초이며 Vercel은 함수 수명이 끝나면 연결을 닫습니다. 재연결은
다른 인스턴스나 새 배포에 도착할 수 있으므로 PostgreSQL cluster adapter가 필요합니다.
활성화 검증은 실제 upgrade 경로·인증/Origin 거절·두 인스턴스 전달·연결 만료 후 재동기화·
ACK 이후 저장/재열기를 포함합니다. LISTEN용 direct PostgreSQL 연결은 인스턴스당 기본 2개이므로
DB의 전체 연결 예산도 확인합니다. 초기화 실패는 해당 인스턴스에서 다시 초기화하지 않으며,
새 인스턴스가 새 자원으로 시작합니다. 종료 시 열린 연결과 adapter 풀을 정리합니다.

`render.yaml`의 Nest 프로세스는 전체 모듈 그래프를 재사용하지만
`API_RUNTIME_ROLE=studio-live`가 공개 표면을 다음으로 제한합니다.

- `GET /api/health/live`, `GET /api/health/ready`: 운영 probe
- `/socket.io`: Studio 실시간 협업 연결
- 그 밖의 `/api/*`: 일반 API로 처리하지 않음

`toonspectrum-core-api`는 일반 HTTP 권위이고 `toonspectrum-studio-live`는 Socket.IO 전용입니다.
Cloudflare의 `CORE_API_ORIGIN`은 전자를, 선택적인 `REALTIME_API_ORIGIN` 또는 프런트의
`VITE_STUDIO_LIVE_ORIGIN`은 후자를 가리킵니다. 두 runtime role을 서로 바꾸거나 하나의 무료
인스턴스에 이중 권위로 합치지 않습니다.

### 실시간 협업 Socket.IO를 별도 장기 실행 서버에 배포할 때

일반 `api/index.js` 진입점은 PostgreSQL Socket.IO adapter를 장착하지 않습니다.
실시간 협업만 별도 Render/Fly 등 승인된 장기 실행 Nest 서버로 보낼 수 있도록 프런트 빌드에
별도 origin을 지정합니다. SPA의 일반 HTTP API는 Cloudflare gateway가 Render Core API로 전달합니다.

```env
# Vite 빌드 시 공개되는 값 — 경로가 아닌 https origin
VITE_STUDIO_LIVE_ORIGIN=https://realtime.toonstudio.cloud

# 장기 실행 Nest 서버의 비공개 환경변수
STUDIO_LIVE_CLUSTER_ADAPTER=postgres
STUDIO_LIVE_POSTGRES_URL=postgresql://USER:PASSWORD@DIRECT_HOST/toonspectrum?sslmode=verify-full&channel_binding=require
STUDIO_LIVE_POSTGRES_POOL_MAX=2
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud

# 검증된 원형 펜 래스터 CRDT 파일럿 — 프런트/서버를 같은 릴리스에서 함께 활성화
VITE_STUDIO_RASTER_CRDT_AUTO_PUBLICATION=verified-renderer-handoff-v1
STUDIO_RASTER_ASSET_ADMISSION=verified-renderer-handoff-v1
```

프로세스를 트래픽에 연결하기 전에 numbered SQL migration 전체를
`scripts/production-database-migrations.manifest` 순서로 적용해야 합니다. `0023`의
`toonspectrum_ops.deployment_migration` 원장은 각 파일의 SHA-256 checksum과 적용 상태를 보존해
이미 적용한 과거 constraint/index migration을 다음 release에서 다시 실행하지 않습니다. 운영 DB의
기본 경로는
[production-database-migrations.yml](.github/workflows/production-database-migrations.yml)
수동 실행입니다. 저장소 `production-database` Environment에 required reviewer와
`PRODUCTION_DATABASE_DIRECT_URL` secret, `PRODUCTION_RUNTIME_DATABASE_ROLE` variable을 설정하고,
검토한 정확한 40자리 release SHA와 확인 문구를 입력합니다. direct URL의 사용자는 DDL 전용
migrator이고 variable은 Vercel/Render 앱이 실제 사용하는 별도 최소권한 PostgreSQL role입니다.
두 role이 같거나 runtime role이 migrator를 상속하면 runner가 DDL 전에 거부합니다. runtime
role은 `LOGIN`, 현재 DB `CONNECT`, `public` schema `USAGE`가 있어야 하며 superuser/CREATEROLE이면
안 됩니다. CREATEDB/REPLICATION/BYPASSRLS 같은 elevated role flag도 허용하지 않습니다.

secret은 credentialed direct endpoint여야 하며 query에는
`sslmode=verify-full&channel_binding=require`만 허용합니다. URL parser는 protocol·authority·
canonical effective hostname을 확인하고, pooler/pgbouncer hostname 및 `host`, `hostaddr`,
`service`, `port`, `user`, `dbname`, `options` 같은 libpq override를 거부합니다. DB secret은
checkout/action이 아니라 URL 검증·migration·capability 검증 step에만 주입됩니다.
runner는 runtime role에서 `toonspectrum_ops` schema와 ledger/lock table의 모든 권한을 회수하고,
최종 verifier는 runtime role이 해당 객체의 owner가 아니며 `USAGE`/`CREATE` 및
`SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` 권한을 갖지 않는지
구조적으로 재확인합니다.

이 검사는 ops 원장을 앱에서 격리하는 release boundary이며 product DML 권한을 자동으로
과다 부여하지 않습니다. 인프라 준비 단계에서 runtime role에 현재 API가 사용하는 public
relation/sequence의 필요한 `SELECT`/`INSERT`/`UPDATE`/`DELETE`만 별도 GRANT하고, 실제 runtime
`DATABASE_URL` 세션의 `SELECT current_user`가 `PRODUCTION_RUNTIME_DATABASE_ROLE`과 exact
match하는지 required reviewer가 먼저 확인해야 합니다. dummy role 이름으로 ops ACL gate를
대리 통과시키면 안 됩니다. 이어서 같은 runtime 연결로 `/api/health/ready`, 로그인, 저장, 협업,
댓글, Marketplace publish canary를 통과시켜야 합니다. 이 identity+DML canary가 끝나지 않으면
migration이 성공해도 runtime release는 승인하지 않습니다.

workflow mode는 다음처럼 분리됩니다.

- `adopt` + `ADOPT-TOONSPECTRUM-MIGRATION-HISTORY`: 기존 무원장 DB가 reviewed production
  baseline인 0019까지 실제 도달했는지 relation·constraint/index·0017 cutover marker로 먼저
  증명합니다. 증명된 0001~0019는 SQL을 재실행하지 않고 exact checksum과 `adopted` provenance를
  기록하며, 0020~0022와 0024~0025를 genuine pending으로 실행하고 0023 bootstrap을 기록합니다.
- `apply` + `APPLY-TOONSPECTRUM-PRODUCTION-MIGRATIONS`: 원장 이후 새 pending migration만
  실행합니다. 과거 migration은 checksum만 확인하고 건너뜁니다.
- `repair` + `REPAIR-TOONSPECTRUM-MIGRATION-STATE`: 원인을 확인한 운영자가 중단된
  `applying`/`failed` 상태와 stale runner lock을 명시적으로 복구할 때만 사용합니다. 원장이
  없거나 누락된 history/pending row에는 사용할 수 없으므로 adoption/apply의 우회 경로가
  아닙니다. durable lock이 있으면 DB 원장에서 확인한 exact 64자리 `ownerToken`을
  `stale_lock_owner_token` input으로 함께 전달해야 하며, DB 획득 시각이 60분 이상 지난 lock만
  같은 token을 조건으로 원자적 compare-and-delete합니다. 신선한 lock이나 token 불일치는
  fail-closed입니다.

workflow는 production DDL concurrency를 1로 고정하고 manifest가 모든 numbered migration과
정확히 일치하는지 확인합니다. 끝에서는 현재 API health-readiness가 요구하는 relation 전체,
comment reanchor, Marketplace generated search/GIN opclass, `pg_trgm`, `0017` cutover marker,
manifest checksum 원장과 runner-lock 해제를 구조적으로 검증합니다. 이미 provision된 운영 DB
upgrade 전용이므로 base relation이 없으면 DDL 전에 실패하며, 새 production DB bootstrap은 별도
승인 작업으로 먼저 완료해야 합니다. 앱의 build/start/health 명령에서는 DDL이나
`drizzle-kit push`를 실행하지 않습니다.

프로덕션 배포는 `origin/main` push와 분리합니다. `vercel.json`은 모든 Git branch 배포를
비활성화하고, 정적 웹의 기본 권위는 `deploy/cloudflare-static`의 Cloudflare Static Assets입니다.
PR 생성, main merge, scheduled catalog commit은 배포를 만들지 않습니다. 검토된 운영자가 clean
`main`에서 명시적 approval 문자열을 제공한 수동 명령만 실행할 수 있습니다.

```bash
pnpm run validate:architecture
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run

export CLOUDFLARE_CORE_API_ORIGIN=https://<reviewed-core-api-origin>
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

`main`은 브랜치 보호로 PR 전용이며 CI의 `core` 체크(lint·typecheck·마이그레이션 채택·전체
Vitest·빌드 게이트) 성공이 머지 조건입니다. `core`는 병렬 잡 `lint`·`typecheck`·`build`·
`test (1/3..3/3)`·`test (serial lane)`의 결과를 합칩니다. 릴리스 체크 `verify`는 같은 잡들과
`studio-3d-runtime`을 합칩니다. 관리자 우회는 배포 우회가 아니며, 우회 커밋 역시 별도 수동
릴리스 전에는 운영에 반영되지 않습니다. 우회 이유는 PR이나 커밋 본문에 기록하고 다음 PR에서
필수 검증을 다시 녹색으로 돌립니다.

`.github/workflows/deploy-vercel.yml`은 Cloudflare 전환 기간의 수동 비상 fallback만 담당합니다.
`workflow_dispatch` 외 trigger가 없고 current main ancestry·production environment review·고정 CLI·
prebuilt artifact 검증을 모두 요구합니다. 일반 릴리스, preview, data refresh가 이 workflow를 자동
호출해서는 안 됩니다.

migration을 동반하는 release는 expand/contract 두 번의 reviewed merge로 나눕니다. 자동 배포가
없어졌으므로 migration과 runtime 순서를 명시적으로 제어할 수 있지만, release migration workflow는
release SHA가 이미 `origin/main`의 ancestor일 것을 요구합니다. 기존 runtime이 migration 동안 계속
서비스하므로 expand migration은 구 runtime과도 호환되어야 합니다.

migration을 동반하는 수동 release 순서는 다음과 같습니다. Render는 `autoDeployTrigger: off`를
유지합니다.

1. backward-compatible expand runtime과 migration을 포함한 reviewed commit을 `main`에 merge합니다.
   merge만으로 어떤 공급자에도 배포되지 않습니다.
2. 현재 runtime과 새 runtime이 모두 사용할 수 있는 add-only migration인지 다시 확인합니다. 삭제,
   rename, stricter constraint처럼 구 runtime을 깨는 변경은 이 단계에 포함하지 않습니다.
3. 필요한 Studio writer drain과 운영 승인 후
   `production-database-migrations.yml`을 merge된 정확한 SHA로 실행합니다. 최초 원장 채택은
   `adopt`, 이후는 `apply`를 선택하고, 요구되는 writer 확인 문구를 입력합니다.
4. migration과 full capability verification이 녹색이면 Cloudflare static dry-run, Core API canary,
   realtime canary를 같은 SHA 기준으로 실행합니다.
5. 정적 웹과 Core API의 변경된 배포 단위만 수동 배포하고 health, 로그인 cookie, OAuth callback,
   asset upload, Socket.IO/DO reconnect, OG crawler HTML을 검사합니다.
6. 직전 release로 rollback할 수 있는 상태를 유지한 채 관찰한 다음, 구 schema 호환 경로 제거와
   destructive DDL은 별도 contract release로 진행합니다. 구 binary가 완전히 사라진 뒤에만 안전합니다.

migration·realtime 계약을 건드리지 않는 순수 프론트엔드 release도 자동 배포되지 않습니다. 검증된
SHA를 수동 정적 배포하여 비용과 릴리스 횟수를 통제합니다. exact 명령, quota 정책, custom-domain
전환과 rollback은 [`docs/FREE_INFRASTRUCTURE.md`](docs/FREE_INFRASTRUCTURE.md)를 따릅니다.

PostgreSQL adapter는 listener와 publisher를 동시에 확보하기 때문에 풀 최솟값이 2이며, `pooler`
호스트나 PgBouncer transaction endpoint는 사용할 수 없습니다. 원격/운영 URL은
`sslmode=verify-full`과 `channel_binding=require`를 각각 정확히 한 번 명시해야 합니다. URL
query는 node-postgres/libpq 해석이 authority·credential·routing을 덮어쓰지 못하도록 이 두 키
외에는 허용하지 않으며, 평문 연결은 production이 아닌 명시적 loopback 테스트 모드에만
허용됩니다. 부팅
사전검사는 별도 세션의 nonce `pg_notify`가 실제 listener에
도착하는지, attachment 임시 행의 `INSERT → SELECT(bytea) → DELETE` 권한과 롤백 정리를 확인한 뒤에만
트래픽을 받습니다.

애플리케이션은 `@socket.io/postgres-adapter`의 cluster/heartbeat semantics를 사용하되, 패키지의
fire-and-forget PubSub lifecycle은 사용하지 않습니다. 로컬 transport가 `/`와 `/studio-live`의 실제
`LISTEN` 완료를 기다린 뒤에만 ready를 기록하고, 동적 namespace 실패나 연결 단절 시 checked-out
client를 폐기한 후 전체 채널을 재구독합니다. 종료는 pending connect/init과 진행 중 작업을 회수하고
PubSub listener를 닫은 다음 pool을 닫습니다. 장기 실행 서버에는 그래도 프로세스 재시작 정책과
교차 노드 broadcast/RPC 모니터링을 두고, adapter 버전 변경 시 CI의 2-node integration을 재검증하세요.

래스터 CRDT의 두 토큰은 비밀이 아니라 정확한 운영 opt-in입니다. 둘 중 하나라도 누락되면 원형 펜
자동 타일 게시가 실행되지 않으며 기존 Yjs 벡터 원본이 계속 화면·내보내기의 권위가 됩니다. 활성화한
배포에서는 먼저 실제 PostgreSQL migration과 래스터 에셋 업로드 권한을 확인하고, 두 브라우저에서
동일 획의 `append → broadcast → replay → handoff`와 스크롤·내보내기 즉시 벡터 복구를 점검하세요.

### Render 무료 Blueprint와 운영 승격 게이트

현재 `render.yaml`의 `plan: free`는 무료 우선 best-effort 운영 등급입니다. Core API의 기능 권위로
사용할 수 있지만 SLA를 제공하지 않으며, 다음 제약 때문에 always-on 응답 시간이나 수평 확장이 필요한
서비스 등급과는 맞지 않습니다
([Render Free 공식 문서](https://render.com/docs/free)).

- inbound HTTP 요청이나 기존 WebSocket의 메시지가 15분 동안 없으면 spin down하고, 다음 요청의
  cold start는 약 1분 걸릴 수 있습니다.
- workspace 전체에서 월 750 free instance-hours를 소진하면 다음 달까지 무료 서비스가
  suspend될 수 있습니다.
- 단일 인스턴스만 허용되어 수평 확장과 다중 인스턴스 장애 검증을 할 수 없습니다.
- 무료 web service에는 `preDeployCommand`를 설정할 수 없습니다.

무료 Render Core API는 Cloudflare 정적·edge liveness와 결합한 best-effort 운영 권위로 사용합니다.
다만 SLA, 짧은 첫 응답, 다중 인스턴스 또는 상시 WebSocket이 요구되면 유료 always-on Render나
동등한 호스트로 별도 승인 승격하고 direct PostgreSQL, health probe, 재시작 정책과 교차 노드
integration을 다시 검증해야 합니다. Cloudflare가 정적·R2·liveness를 계속 담당하므로 승격 시에도
프런트와 파일 트래픽을 Core 호스트로 되돌리지 않습니다.

Render의 [pre-deploy command](https://render.com/docs/deploys#pre-deploy-command)는 유료 web
service에서 build 이후, 새 버전 시작 이전에 별도
인스턴스로 실행되며 실패하면 새 배포를 중단하고 마지막 성공 버전을 유지하므로 migration 경계로
사용할 수 있습니다. 다만 운영에서는 아래 두 DDL writer 중 **정확히 하나만** 선택합니다.

1. 기본: GitHub의 승인형
   [production-database-migrations.yml](.github/workflows/production-database-migrations.yml)을
   먼저 실행하고 구조 검증 성공 후 Render release를 승인합니다.
2. 유료 Render 대안: 동일한 checksum-led runner의 `apply`와 full capability verifier를
   `preDeployCommand`에서 실행하고 GitHub migration 실행 경로는 사용하지 않습니다. 해당 Render
   service만 sole writer여야 하며 자동 `drizzle-kit push`, start-command migration, 다른 호스트의
   pre-deploy를 모두 금지합니다. 최초 `adopt`나 `repair`는 pre-deploy 자동 경로에서 실행하지
   않습니다.

현재 무료 Blueprint에는 지원되지 않는 `preDeployCommand`를 일부러 넣지 않았습니다. 유료 플랜
전환과 DDL writer 변경은 비용·운영 경계를 바꾸므로 별도 리뷰에서 함께 승인해야 합니다.
