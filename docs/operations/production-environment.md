# 운영 환경변수와 자격 증명

툰스튜디오 운영 자격 증명은 Git 저장소에 평문으로 저장하지 않는다. 정적 웹의 기본 배포 권위는 Cloudflare Static Assets이며, 동적 Core API는 검토된 별도 origin을 사용한다. 실제 비밀값은 각 공급자의 encrypted secret store 또는 GitHub `production` Environment Secrets에 보관하고, 저장소에는 변수명·검증 규칙·자동화 코드만 둔다. Vercel은 전환 기간의 수동 비상 fallback이며 Git 자동 배포는 비활성이다.

## 운영 원칙

- 기존 Vercel·Cloudflare·Core API 환경변수는 자동으로 덮어쓰거나 회전하지 않는다.
- 정적 앱 운영 배포는 `docs/FREE_INFRASTRUCTURE.md`의 수동 승인 명령만 사용한다.
- `main` push, scheduled data update, PR 생성은 어떤 공급자에도 자동 배포하지 않는다.
- 누락된 값만 추가한다.
- `DATABASE_URL`처럼 외부 시스템의 실제 연결 정보가 필요한 값은 임의 생성하지 않는다.
- 실제 API는 `AUTH_SESSION_SECRET`을 우선 사용하고, 없으면 `AUTH_STATE_SECRET`을 세션 서명에 사용한다. 두 키 모두 없고 명시적으로 전달된 값도 없으면 적용·배포를 중단한다. 비밀값을 임의 생성하지 않는다.
- 기존 `AUTH_STATE_SECRET`만 있는 경우 새 `AUTH_SESSION_SECRET`을 추가하지 않는다. 기존 세션의 서명 권한을 바꾸는 작업은 별도의 키 회전 절차로 진행한다.
- 새 인증 비밀은 앞뒤 공백 없는 32 UTF-8 바이트 이상이어야 한다. 전달된 값을 자동으로 잘라내거나 수정하지 않는다.
- OAuth 인가 코드 공급자가 구성된 경우 `AUTH_STATE_SECRET`도 필요하다.
- 비밀값은 로그, GitHub Step Summary, PR 코멘트, 빌드 산출물에 출력하지 않는다.
- `VITE_` 접두사에는 공개 가능한 URL만 넣고, 토큰·비밀번호·데이터베이스 URL을 넣지 않는다.
- 런타임 환경변수 변경 후에는 해당 배포 단위만 검토된 수동 프로덕션 배포로 갱신한다.

## GitHub production environment secrets

운영 자동화가 사용할 수 있는 비밀값은 GitHub 저장소의 `production` Environment에 등록한다.

기본 정적 배포 권한:

- Cloudflare 인증은 운영자의 로컬 Wrangler 세션 또는 GitHub `production` environment의 최소권한 token으로만 제공한다.
- `CLOUDFLARE_CORE_API_ORIGIN`은 비밀이 아닌 검토된 HTTPS origin이며 credential·path·query를 포함할 수 없다.

Vercel 비상 fallback을 실제로 실행할 때만 필요한 권한:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`와 `VERCEL_PROJECT_ID` — 고정된 Vercel CLI가 두 값을 함께 요구하므로 둘 다 필수

애플리케이션 필수값:

- `DATABASE_URL`
- `AUTH_SESSION_SECRET` 또는 `AUTH_STATE_SECRET` — 기존 Vercel 설정이 있으면 전달 없이 보존
- `AUTH_STATE_SECRET` — OAuth 인가 코드 공급자를 구성하는 경우 필수

선택적 공급자 값:

- 현재 API 공급자 설정에 맞는 `GOOGLE_OAUTH_*`, `KAKAO_*`, `NAVER_*`
- 개인 저장소 OAuth의 `GOOGLE_DRIVE_OAUTH_*`, `DROPBOX_OAUTH_*`, `ONEDRIVE_OAUTH_*`,
  `PERSONAL_CLOUD_OAUTH_STATE_SECRET`, `PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `PRIVATE_OBJECT_STORAGE_ENABLED`, `PRIVATE_OBJECT_STORAGE_*_PROVIDER`,
  `PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT`
- `R2_OBJECT_STORAGE_*` — R2가 선택된 purpose만 구성
- `B2_OBJECT_STORAGE_*` — B2가 선택된 purpose만 구성
- `SUPABASE_OBJECT_STORAGE_*` — legacy 또는 선택된 Supabase purpose
- 기존 `R2_*`, `S3_*`, `CREATOR_ASSET_OBJECT_STORAGE_*` — 해당 레거시 코드가 실제 참조할 때만 유지

선택적 공급자 값이 없으면 해당 기능은 명시적으로 비활성 또는 구성되지 않음 상태를 표시해야 하며, 공개 페이지와 기본 Studio 기능을 중단해서는 안 된다.

개인 저장소 공급자의 콘솔 등록값, 최소 scope, 운영·로컬 콜백은 [`personal-cloud-provider-registration.md`](./personal-cloud-provider-registration.md)를 따른다.

## 실행

기본 정적 릴리스는 로컬 또는 승인된 운영 runner에서 다음 검증을 수행한다.

```bash
pnpm run validate:architecture
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

운영 배포는 검토된 `main`의 clean worktree에서만 `TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production`을 명시하여 실행한다. 정확한 명령과 canary·rollback 절차는 [`docs/FREE_INFRASTRUCTURE.md`](../FREE_INFRASTRUCTURE.md)에 둔다.

Vercel 환경 감사가 필요한 전환 기간에는 GitHub Actions의 **Production readiness** 워크플로를 사용할 수 있다. `deploy=false`가 기본이며 변수 추가와 배포를 수행하지 않는 감사 전용 실행이다. `deploy=true`는 Vercel 비상 fallback을 명시적으로 선택한 경우에만 사용한다.

공개 주소는 실제 OAuth 코드가 읽는 `WEB_APP_BASE_URL`과 `OAUTH_REDIRECT_BASE_URL`에 `https://www.toonstudio.cloud`를 사용한다. 기존 값이 있으면 보존한다.

워크플로는 다음 순서로 동작한다.

1. Vercel 토큰·프로젝트 ID·조직 ID 존재 확인
2. 저장소가 실제 참조하는 환경변수 이름 수집
3. Vercel Production 환경의 기존 키 목록 조회
4. `DATABASE_URL`, 실제 인증 서명 권한, OAuth state 조건을 검사하고 하나라도 없으면 어떤 변수도 추가하기 전에 중단
5. 감사 전용이면 `planned`에 추가 예정 키만 기록하고 종료
6. 배포 모드이면 기존 값은 보존하고 누락된 전달 가능 값만 추가한 뒤 새 프로덕션 배포 생성
7. 배포 URL과 `www.toonstudio.cloud`의 루트·마켓·공개 마켓 API 검사

## 로컬 감사

```bash
VERCEL_TOKEN=... \
VERCEL_PROJECT_ID=... \
node scripts/configure-vercel-production.mjs --audit-only
```

감사 결과에는 변수 이름과 상태만 출력되며 값은 출력하지 않는다. `planned`는 추가 계획이며 `created`와 구별한다. 조회된 Sensitive 키는 값 열람 없이 존재 여부만 확인하므로 그 값의 유효성이나 실제 DB 연결·스키마 준비까지 검증한 것으로 해석하지 않는다. API 오류 응답 본문도 로그에 출력하지 않는다.

## 키 노출 대응

실제 키가 Git 이력, 빌드 로그, 이슈 또는 채팅에 노출된 경우 파일 삭제만으로 끝내지 않는다.

1. 해당 공급자에서 키를 즉시 폐기한다.
2. 새 키를 발급한다.
3. Vercel 또는 GitHub Environment Secret을 갱신한다.
4. 새 배포를 생성한다.
5. 노출 기간의 접근 로그와 비용 사용량을 확인한다.
