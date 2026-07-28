# ToonSpectrum 배포 가이드

현재 기본 배포는 **Vercel 단일 프로젝트**입니다. 프론트는 정적 SPA로, `/api/*`는 `api/index.js`가 컴파일된 NestJS 서버리스 앱(`apps/api/src/serverless.ts`)으로 위임합니다. 카탈로그 검색·탐색·랭킹은 빌드 시 생성된 `public/data/*.json` 정적 스냅샷을 기본으로 사용하고, 리뷰·인증·커뮤니티 같은 동적 기능만 API/DB를 사용합니다.

| 레이어 | 스택 | 기본 호스트 | 배포 산출물 |
| --- | --- | --- | --- |
| 프론트 | Vite + React SPA | Vercel | `dist/` |
| 카탈로그 | 정적 스냅샷 | Vercel CDN | `public/data/*.json` |
| API | NestJS serverless | Vercel Functions | `api/index.js` → `apps/api/dist/.../serverless` |
| DB | PostgreSQL | Neon 또는 호환 Postgres | 리뷰·인증·커뮤니티·ingest 폴백 |

`render.yaml`은 장시간 상시구동 API를 다시 쓰고 싶을 때의 보존된 대안입니다. 현재 `vercel.json`은 Render 프록시가 아니라 Vercel 함수로 `/api/*`를 라우팅합니다.

## 0. 준비물

- Node 22.12+와 pnpm 11 (`corepack enable` 권장)
- Vercel 계정
- Neon 또는 호환 PostgreSQL `DATABASE_URL`
- 소셜 로그인 실연동 시 Google Cloud / Kakao Developers 앱

## 1. 로컬 검증

```bash
pnpm install
pnpm catalog:gen
pnpm run verify
```

`pnpm catalog:gen`은 `apps/api/data/catalog.json.gz`를 읽어 `public/data/*.json`과 `public/data/ranking/*.json`을 만듭니다. 이 산출물은 빌드 시 다시 생성되며, 랭킹 기본 뷰는 `disableLive=true` 스냅샷 산식으로 사전 계산됩니다.

## 2. Vercel 배포

1. Vercel → Add New Project → 이 레포 선택.
2. `vercel.json`의 설정을 그대로 사용합니다.
   - `buildCommand`: `pnpm --filter @webtoon-nest/api build && pnpm run build`
   - `outputDirectory`: `dist`
   - `/api/:path*` → `/api/index`
   - `/title/:slug` → `/api/og?slug=:slug`
3. 환경변수를 설정합니다.
   - `DATABASE_URL`: 동적 API가 사용할 PostgreSQL 연결 문자열.
   - `AUTH_STATE_SECRET`: OAuth state 서명 키. 상용은 고정값 필수.
   - `OAUTH_REDIRECT_BASE_URL`: Vercel 공개 도메인.
   - `WEB_APP_BASE_URL`: Vercel 공개 도메인.
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`: 선택.
   - `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`: 선택.
   - `ADMIN_EMAILS`: 선택.
   - `CATALOG_INGEST_TRIGGER_TOKEN`: 원격 수동 ingest를 쓸 때만.
   - `CATALOG_INGEST_MODE=off`: 기본 권장.

프론트가 상대경로 `/api/...`를 호출하므로 CORS 설정은 필요 없습니다. 같은 Vercel 도메인에서 정적 SPA와 서버리스 API가 함께 제공됩니다.

## 3. OAuth 콜백

프론트 도메인이 `https://toonspectrum.example.com`이라면 아래 값을 Vercel 환경변수와 각 OAuth 콘솔에 맞춥니다.

```env
OAUTH_REDIRECT_BASE_URL=https://toonspectrum.example.com
WEB_APP_BASE_URL=https://toonspectrum.example.com
```

콘솔 등록 URI:

- Google: `https://toonspectrum.example.com/api/auth/oauth/google/callback`
- Kakao: `https://toonspectrum.example.com/api/auth/oauth/kakao/callback`

키가 없으면 로그인 모달은 데모 폴백을 명확히 표시합니다.

## 4. 데이터 갱신

기본 사용자 경로는 정적 카탈로그입니다.

1. 크롤러가 새 `apps/api/data/catalog.json.gz`를 만든다.
2. `pnpm catalog:gen`이 `public/data/*.json`을 생성한다.
3. Vercel 재배포로 CDN 스냅샷이 갱신된다.

로컬 또는 운영 API 폴백 경로에서 DB 스냅샷을 직접 갱신하려면 `pnpm ingest` 또는 `POST /api/catalog/ingest/run`을 사용할 수 있습니다. 운영에서 자동 수집을 켜기 전에는 플랫폼별 robots.txt, 이용약관, API 약관, 호출량 제한, 저장 필드 범위를 별도로 검토해야 합니다.

## 5. 배포 후 점검

- 프론트 도메인 접속 → 홈/검색/랭킹이 로드되는지 확인.
- `GET https://<domain>/api/auth/providers`가 200인지 확인.
- `GET https://<domain>/api/ranking?axis=popular&period=daily&limit=5`가 `meta.source="formula-api"`와 스냅샷 산식 fallback reason을 반환하는지 확인.
- 표지 프록시(`/api/cover?u=...`)가 이미지를 반환하거나 안전하게 폴백하는지 확인.
- 로그인/리뷰/커뮤니티 기능이 DB 연결로 동작하는지 확인.

## 6. Render 대안

`render.yaml`은 장시간 상시구동 Nest API를 따로 배포하기 위한 보존된 Blueprint입니다. 이 경로를 쓰려면 `vercel.json`의 `/api/:path*` rewrite를 Render API URL로 바꾸거나 `VITE_API_BASE`/프록시 전략을 별도로 정해야 합니다. 현재 기본 배포와 자동 검증은 Vercel serverless 경로를 기준으로 합니다.

### 실시간 협업 Socket.IO를 별도 장기 실행 서버에 배포할 때

Vercel serverless 진입점은 WebSocket 수명주기를 유지하지 않으며 PostgreSQL Socket.IO adapter도
장착하지 않습니다. SPA의 HTTP API가 Vercel에 남아 있어도 실시간 협업만 OCI/Render/Fly의 Nest
서버로 보낼 수 있도록 프런트 빌드에 별도 origin을 지정합니다.

```env
# Vite 빌드 시 공개되는 값 — 경로가 아닌 https origin
VITE_STUDIO_LIVE_ORIGIN=https://realtime.toonspectrum.example

# 장기 실행 Nest 서버의 비공개 환경변수
STUDIO_LIVE_CLUSTER_ADAPTER=postgres
STUDIO_LIVE_POSTGRES_URL=postgresql://USER:PASSWORD@DIRECT_HOST/webdex?sslmode=verify-full&channel_binding=require
STUDIO_LIVE_POSTGRES_POOL_MAX=2
API_CORS_ALLOWED_ORIGINS=https://toonspectrum.example.com

# 검증된 원형 펜 래스터 CRDT 파일럿 — 프런트/서버를 같은 릴리스에서 함께 활성화
VITE_STUDIO_RASTER_CRDT_AUTO_PUBLICATION=verified-renderer-handoff-v1
STUDIO_RASTER_ASSET_ADMISSION=verified-renderer-handoff-v1
```

먼저 `0009_socket_io_postgres_adapter.sql`을 적용해야 합니다. PostgreSQL 모드는 listener와
publisher를 동시에 확보하기 때문에 풀 최솟값이 2이며, `pooler` 호스트나 PgBouncer transaction
endpoint는 사용할 수 없습니다. 원격/운영 URL은 `sslmode=require`, `verify-ca`, `verify-full` 중
하나를 명시해야 하며 앞의 두 레거시 값도 현재의 인증서·호스트 검증 의미를 보존하도록
`verify-full`로 정규화합니다. URL query는
node-postgres 해석이 authority/credential/routing을 덮어쓰지 못하도록 소문자 `sslmode`와
`channel_binding`만 각각 한 번 허용하며, 평문 연결은 production이 아닌 loopback 개발 DB에만
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
