# Cloudflare Static Assets gateway

이 배포 단위는 ToonSpectrum 웹 앱을 정적 에셋 우선으로 제공한다. 정적 HTML, JS, CSS,
카탈로그, 브러시 manifest는 Static Assets가 직접 처리하고 Worker 호출량을 사용하지 않는다.
Worker는 다음 동적 경로에만 먼저 실행된다.

- `/api`, `/api/*`
- `/socket.io`, `/socket.io/*`
- `/title/*`
- `/market`, `/market/*`

동적 요청은 `CORE_API_ORIGIN`의 기존 NestJS API로 프록시한다. API origin을 구성하지 않았거나
HTTPS origin 검증에 실패하면 SPA HTML로 폴백하지 않고 `503 CORE_API_UNAVAILABLE`로 닫힌다.

## 검증

```bash
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

`dry-run`은 로컬 프로덕션 빌드를 만든 뒤 Wrangler 번들·Static Assets 구성을 검사하지만 원격에
배포하지 않는다.

## 수동 운영 배포

자동 Git 배포는 허용하지 않는다. 검토된 `main`의 깨끗한 worktree에서만 다음 명령을 실행한다.

```bash
export CLOUDFLARE_CORE_API_ORIGIN=https://<reviewed-core-api-origin>
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

Wrangler 인증은 로컬 로그인 또는 별도 운영 secret으로 제공한다. `CORE_API_ORIGIN`은 공개 origin이며
credential, path, query를 포함할 수 없다. API credential은 Worker 변수에 넣지 않는다.

## 커스텀 도메인 전환

`workers_dev`는 비활성이다. 최초 운영 전환은 Cloudflare 계정에서 검토자가 직접
`www.toonstudio.cloud` 커스텀 도메인을 연결한 후 canary URL로 검증한다. Apex
`toonstudio.cloud`는 Bulk Redirect 또는 Redirect Rule로 `https://www.toonstudio.cloud/:path`에
영구 리다이렉트한다. `_redirects` 파일은 domain-level redirect를 지원하지 않으므로 이 규칙을
애플리케이션 코드로 흉내 내지 않는다.

## 헤더 계약

`apps/web/public/_headers`는 `vercel.json`의 기존 보안·캐시 헤더로부터 생성한다. Vite가 이를
`dist/_headers`로 복사하고 Static Assets가 정적 응답에 적용한다.

```bash
pnpm run generate:cloudflare-static-rules
pnpm run generate:cloudflare-static-rules -- --check
```

동적 Worker 응답에는 동일한 공통 보안 헤더를 직접 추가한다. 헤더가 바뀌면 생성 파일과 Worker
테스트가 함께 실패하도록 유지한다.

## 롤백

- 정적 릴리스는 직전 검증 SHA로 다시 수동 배포한다.
- API 문제는 `CORE_API_ORIGIN`을 임의의 다른 공급자로 자동 전환하지 않는다.
- Vercel 수동 fallback은 Cloudflare 전환 기간의 비상 경로일 뿐 자동 배포 권위가 아니다.
- 사용자 프로젝트 원본은 이 정적 배포 단위에 저장하지 않는다.
