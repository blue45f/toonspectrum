# 운영 환경변수와 자격 증명

툰스튜디오 운영 자격 증명은 Git 저장소에 평문으로 저장하지 않는다. 정적 웹의 기본 권위는
Cloudflare Static Assets, 동적 Core API의 기본 권위는 Render `toonspectrum-core-api`다. 실제
비밀값은 공급자의 encrypted environment, Render Secret File 또는 GitHub `production` Environment
Secrets에 보관하고 저장소에는 변수명·검증 규칙·자동화 코드만 둔다. Vercel은 승인형 비상 rollback이며
Git 자동 배포는 비활성이다.

## 운영 원칙

- 기존 운영 비밀을 자동으로 출력·회전·정규화하지 않는다.
- `main` push, scheduled data update, PR 생성은 어떤 공급자에도 자동 배포하지 않는다.
- 누락된 값만 추가하고 기존 값 변경은 별도 키 회전으로 취급한다.
- `DATABASE_URL`처럼 외부 시스템의 실제 연결 정보가 필요한 값은 임의 생성하지 않는다.
- 실제 API는 `AUTH_SESSION_SECRET`을 우선 사용하고 없으면 `AUTH_STATE_SECRET`을 세션 서명에 사용한다.
  둘 다 없으면 적용·배포를 중단한다.
- OAuth 인가 코드 공급자가 구성된 경우 `AUTH_STATE_SECRET`도 필요하다.
- 새 인증 비밀은 앞뒤 공백 없는 32 UTF-8 바이트 이상이어야 한다.
- 비밀값은 로그, GitHub Summary, PR 코멘트, 빌드 산출물과 채팅에 출력하지 않는다.
- `VITE_` 접두사에는 공개 가능한 URL만 넣고 토큰·비밀번호·DB URL을 넣지 않는다.
- 환경변수 변경 후에는 해당 runtime만 수동 재배포하고 readiness를 다시 검증한다.

## Render Core API

`render.yaml`의 `toonspectrum-core-api`는 `API_RUNTIME_ROLE=full`인 기본 동적 권위다. 서비스는
`autoDeployTrigger: off`를 유지하며 build/start에서 migration을 실행하지 않는다.

필수값:

- `DATABASE_URL`
- `AUTH_SESSION_SECRET` 또는 `AUTH_STATE_SECRET`
- OAuth 인가 코드 공급자를 쓰는 경우 `AUTH_STATE_SECRET`
- `API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud`
- `OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud`
- `WEB_APP_BASE_URL=https://www.toonstudio.cloud`
- `CANONICAL_HOST=www.toonstudio.cloud`

기존 운영값을 옮길 때는 Render encrypted environment를 사용하거나 root `.env.local` Secret File로
주입한다. `apps/api/src/load-env.ts`는 프로세스 초기 import에서 이 파일을 읽는다. Secret File은
Render dashboard에서 암호화하여 저장하고 로컬 임시 파일은 전환 완료 후 삭제한다. 파일 내용이나
비밀값을 터미널에 출력하지 않는다.

선택적 공급자 값:

- 현재 API 공급자 설정에 맞는 `GOOGLE_OAUTH_*`, `KAKAO_*`, `NAVER_*`
- 개인 저장소 OAuth의 `GOOGLE_DRIVE_OAUTH_*`, `DROPBOX_OAUTH_*`, `ONEDRIVE_OAUTH_*`,
  `PERSONAL_CLOUD_OAUTH_STATE_SECRET`, `PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY`
- 사용자 키가 아닌 운영자 제공 AI 경로를 실제 활성화할 때만 해당 provider key
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `PRIVATE_OBJECT_STORAGE_ENABLED`, `PRIVATE_OBJECT_STORAGE_*_PROVIDER`,
  `PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT`
- `R2_OBJECT_STORAGE_*` — R2가 선택된 purpose만 구성
- `B2_OBJECT_STORAGE_*` — B2가 선택된 purpose만 구성
- `SUPABASE_OBJECT_STORAGE_*` — legacy 또는 선택된 Supabase purpose
- 기존 `R2_*`, `S3_*`, `CREATOR_ASSET_OBJECT_STORAGE_*` — 해당 레거시 코드가 실제 참조할 때만 유지
- `UPSTASH_COORDINATION_*`
- Cloudflare realtime ticket issuer·audience·secret·TTL

선택값이 없으면 해당 기능은 명시적으로 비활성 또는 구성되지 않음 상태를 표시해야 하며, 공개 페이지와
로컬 Studio 기능을 중단해서는 안 된다.

개인 저장소 공급자의 콘솔 등록값, 최소 scope, 운영·로컬 콜백은 [`personal-cloud-provider-registration.md`](./personal-cloud-provider-registration.md)를 따른다.

## Render 전환 검증

환경 주입과 수동 deploy가 완료된 뒤 Cloudflare origin을 바꾸기 전에 다음을 실행한다.

```bash
RENDER_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com \
  pnpm run verify:render-core-origin
```

검증기는 다음을 요구한다.

1. HTTPS origin에 credential·path·query·fragment가 없음
2. `/api/health/live`가 redirect 없이 `200 {"status":"ok"}`
3. `/api/health/ready`가 redirect 없이 `200 {"status":"ready"}`
4. 응답에 `x-vercel-id`가 없음
5. 응답 본문이 제한된 크기의 JSON 계약과 일치함

무료 Render는 inactivity 후 cold start가 발생할 수 있으므로 충분한 timeout을 사용하지만 503 readiness나
DB schema 실패를 성공으로 취급하지 않는다.

## Cloudflare 운영 환경

기본 정적 릴리스는 다음 검증을 수행한다.

```bash
pnpm run validate:architecture
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

Render 검증 후에만 다음 origin으로 수동 배포한다.

```bash
export CLOUDFLARE_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

`/api/health`와 `/api/health/live`는 Cloudflare edge에서 응답하고 `/api/health/ready`만 Render의 DB·schema
readiness를 확인한다. 대형 파일은 Static Assets sidecar와 R2가 담당하며 Core API를 파일 fallback으로
사용하지 않는다.

## GitHub production environment secrets

운영 migration과 수동 자동화가 사용할 비밀은 GitHub 저장소의 `production` Environment에 등록한다.
Cloudflare token은 최소권한으로 제공하며 Core API origin은 비밀이 아닌 검토된 HTTPS origin이다.
DB migration용 direct URL과 runtime `DATABASE_URL`은 역할과 권한이 다른 값이어야 한다.

Vercel 비상 rollback을 실제 승인했을 때만 다음 값이 필요하다.

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

정상 Cloudflare/Render 릴리스는 이 값들을 사용하지 않는다.

## Vercel 감사와 비상 rollback

Vercel Production 환경은 기존 복구점을 보존하기 위해 값 이름 존재 여부만 감사할 수 있다. 기본 감사는
변수를 추가하거나 배포하지 않는다. `deploy=true` 또는 `deploy-vercel.yml`은 Cloudflare/Render로
복구할 수 없는 장애에 대해 사용자가 별도로 승인한 경우만 실행한다.

```bash
VERCEL_TOKEN=... \
VERCEL_PROJECT_ID=... \
node scripts/configure-vercel-production.mjs --audit-only
```

감사 결과에는 변수 이름과 상태만 출력하고 값은 출력하지 않는다. Sensitive 키 존재 확인은 값의 유효성,
DB 연결이나 schema readiness 검증을 대신하지 않는다.

## 키 노출 대응

실제 키가 Git 이력, 빌드 로그, 이슈 또는 채팅에 노출된 경우 파일 삭제만으로 끝내지 않는다.

1. 해당 공급자에서 키를 즉시 폐기한다.
2. 새 키를 발급한다.
3. Render와 필요한 GitHub Environment Secret을 갱신한다.
4. 해당 runtime을 수동 재배포하고 readiness·로그인·OAuth를 검증한다.
5. 노출 기간의 접근 로그와 비용 사용량을 확인한다.
6. Vercel 복구점을 유지한다면 그 환경의 동일 키도 함께 회전한다.
