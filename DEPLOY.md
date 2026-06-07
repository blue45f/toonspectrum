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
