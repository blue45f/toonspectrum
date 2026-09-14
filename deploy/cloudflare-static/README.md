# Cloudflare Static Assets gateway

이 배포 단위는 ToonSpectrum 웹 앱을 **정적 에셋 우선**으로 제공하고, 동적 요청만 기능별 무료 인프라 권위로 전달한다. 정적 HTML, JS, CSS, 카탈로그, 브러시 manifest는 Static Assets가 직접 처리하므로 Worker 호출량을 사용하지 않는다.

Cloudflare 배포 빌드는 별도 지정이 없으면 `VITE_CATALOG_SOURCE=static`을 사용한다. 따라서 홈·랭킹·검색·작품 카탈로그의 대부분은 생성된 JSON과 브라우저 정적 엔진에서 처리되고, 동적 public-read origin 풀은 정적 모드로 해결할 수 없는 호환·점진 전환 경로로만 남는다. 검토된 롤백이 필요할 때만 `VITE_CATALOG_SOURCE=api`를 명시한다.

Worker는 다음 동적 경로에만 먼저 실행된다.

- `/api`, `/api/*`
- `/socket.io`, `/socket.io/*`
- 정확히 한 slug를 가진 `/title/:slug`
- `/market`, `/market/browse`, 정확히 한 ID를 가진 `/market/resource/:resourceId`

`/market/library`, `/market/publish` 같은 앱 화면은 Static Assets의 SPA fallback이 처리한다. Worker-first 범위를 넓혀 정적 트래픽을 유료·제한형 실행 요청으로 바꾸지 않는다.

## 무료 인프라 연합 라우팅

동적 요청은 경로와 메서드에 따라 다음 권위로 분리한다.

| workload | 경로 | Worker 변수 | 실패·폴백 정책 |
|---|---|---|---|
| core | 나머지 `/api/*`, OG crawler 경로, `/api/catalog/*`, `/api/health/*`, `/api/config` | `CORE_API_ORIGIN` | 단일 권위, 자동 write failover 없음 |
| public read | 안전한 `GET`/`HEAD`/`OPTIONS`의 `/api/random`, `/api/home`, `/api/calendar`, `/api/insights`, `/api/ranking`, `/api/explore`, `/api/tags`, `/api/search`, `/api/titles/*`, `/api/authors/*`, `/api/kmas/book-webtoons`, `/api/cover`, `/api/public/*` | `PUBLIC_READ_API_ORIGINS` | 최대 8개 동일 계약 origin에 결정적 분산, `502`/`503`/`504`와 네트워크 오류만 다음 origin 재시도 |
| social | `/api/community`, `/api/reviews` | `SOCIAL_API_ORIGIN` | 미설정 시 core, 명시한 설정이 잘못되면 fail closed |
| playground | `/api/fortune`, `/api/play` | `PLAYGROUND_API_ORIGIN` | 미설정 시 core, 명시한 설정이 잘못되면 fail closed |
| admin | `/api/admin` | `ADMIN_API_ORIGIN` | 단일 권위, 자동 failover 없음 |
| realtime | `/socket.io`, `/api/realtime`, `/api/studio-live` | `REALTIME_API_ORIGIN` | 단일 권위, WebSocket handle 그대로 전달 |

공개 읽기 풀은 `cf-ray + path + query`를 affinity key로 사용해 동일 요청을 안정적으로 origin에 배치한다. 첫 origin이 일시적으로 실패한 경우에만 다음 읽기 origin을 시도한다. `POST`, `PUT`, `PATCH`, `DELETE`와 기타 권위 요청은 복수 공급자에 재전송하지 않는다. 이 규칙은 무료 한도를 병렬로 활용하면서 중복 쓰기와 split-brain을 방지한다.

`/api/catalog/ingest/status`, catalog refresh/run, readiness, runtime config처럼 운영 상태나 기준 권위를 나타내는 경로는 메서드가 읽기여도 공개 replica 풀에 포함하지 않는다. 공개 읽기 allowlist는 실제 API controller와 함께 검토하며, 새로운 prefix를 포괄적으로 자동 분산하지 않는다.

### 공개 replica 보안 경계

공개 읽기 origin은 사용자별 권위를 갖지 않는다. Worker는 public-read 요청에서 다음 정보를 제거한 뒤 replica로 전달한다.

- `Authorization`, `Proxy-Authorization`, `Cookie`
- `x-user-*`, `x-admin-*`, `x-csrf-*`, `x-session-*`
- 클라이언트가 직접 보낸 `Forwarded`, `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`

core·social·playground·admin·realtime 요청의 전달 IP는 클라이언트 입력을 신뢰하지 않고 Cloudflare가 제공한 bounded `CF-Connecting-IP`만 `X-Forwarded-For`로 다시 구성한다. public-read replica에는 IP도 전달하지 않는다. 재시도 대상 응답의 body는 취소해 연결·메모리 자원을 회수한다.

각 upstream 요청에는 다음 관측 헤더가 추가된다.

- `x-toonspectrum-edge: cloudflare-static-gateway-v2`
- `x-toonspectrum-edge-route: core | public-read | social | playground | admin | realtime`
- `x-toonspectrum-edge-attempt: 0..n`

사용자 credential을 Worker 변수에 저장하지 않는다.

## Origin 설정 계약

모든 origin은 다음 조건을 만족해야 한다.

- 절대 `https://` origin
- username/password 없음
- path, query, fragment 없음
- 공개 읽기 풀에서는 중복 origin 금지
- 공개 읽기 풀 최대 8개
- 현재 정적 gateway 자신을 가리키는 origin 금지

공개 읽기 풀의 **일부라도** 현재 gateway를 가리키면 해당 origin만 제거하고 진행하지 않고 전체 구성을 fail closed 한다. 잘못된 풀 일부를 숨긴 채 재귀 프록시가 발생하는 상황을 방지하기 위한 규칙이다.

`CORE_API_ORIGIN`은 필수 호환 권위다. 나머지 도메인 origin이 비어 있으면 해당 요청은 core로 유지되므로 기능을 한 번에 모두 이전하지 않고 단계적으로 분리할 수 있다. 반대로 변수가 존재하지만 유효하지 않으면 조용히 core로 우회하지 않고 `503 CORE_API_UNAVAILABLE`로 닫힌다.

예시는 [`.env.example`](./.env.example)을 참고한다.

## 검증

```bash
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

검증 범위에는 다음이 포함된다.

- 정적 요청이 Worker를 통과하지 않는지
- Cloudflare build가 기본적으로 static catalog를 사용하는지
- core·social·playground·admin·realtime 경로 격리
- 공개 읽기의 결정적 분산과 안전한 재시도
- 공개 replica에 세션·사용자·IP credential이 전달되지 않는지
- catalog ingest·readiness·runtime config가 core에 남는지
- write 요청이 replica 풀로 전달되지 않는지
- 잘못된·중복된·일부 자기참조 origin fail-closed
- POST body stream을 손상하지 않는 URL rewrite
- OG route mapping과 WebSocket passthrough
- Vercel과 Cloudflare 보안 헤더 계약 동기화

`dry-run`은 로컬 프로덕션 빌드를 만든 뒤 Wrangler 번들·Static Assets 구성과 모든 origin 변수를 검사하지만 원격에 배포하지 않는다.

## 수동 운영 배포

자동 Git 배포는 허용하지 않는다. 검토된 `main`의 깨끗한 worktree에서만 다음 명령을 실행한다.

```bash
export CLOUDFLARE_CORE_API_ORIGIN=https://<reviewed-core-api-origin>
export CLOUDFLARE_PUBLIC_READ_API_ORIGINS=https://<read-a>,https://<read-b>
export CLOUDFLARE_SOCIAL_API_ORIGIN=https://<social-origin>
export CLOUDFLARE_PLAYGROUND_API_ORIGIN=https://<playground-origin>
export CLOUDFLARE_ADMIN_API_ORIGIN=https://<admin-origin>
export CLOUDFLARE_REALTIME_API_ORIGIN=https://<realtime-origin>
export VITE_CATALOG_SOURCE=static
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

`VITE_CATALOG_SOURCE`를 생략해도 `static`이 기본이다. `api`는 정적 카탈로그에 문제가 발생했을 때 검토자가 선택하는 호환 롤백 모드이며, 다른 값은 배포 전에 거부된다.

분리하지 않은 선택 origin은 설정하지 않는다. 배포 스크립트가 모든 값을 HTTPS origin으로 정규화한 뒤 Wrangler `--var`로 전달한다. Wrangler 인증은 로컬 로그인 또는 별도 운영 secret으로 제공한다.

## 커스텀 도메인 전환

`workers_dev`는 비활성이다. 최초 운영 전환은 Cloudflare 계정에서 검토자가 직접 `www.toonstudio.cloud` 커스텀 도메인을 연결한 후 canary URL로 검증한다. Apex `toonstudio.cloud`는 Bulk Redirect 또는 Redirect Rule로 `https://www.toonstudio.cloud/:path`에 영구 리다이렉트한다. `_redirects` 파일은 domain-level redirect를 지원하지 않으므로 이 규칙을 애플리케이션 코드로 흉내 내지 않는다.

## 헤더 계약

`apps/web/public/_headers`는 `vercel.json`의 기존 보안·캐시 헤더로부터 생성한다. Vite가 이를 `dist/_headers`로 복사하고 Static Assets가 정적 응답에 적용한다.

```bash
pnpm run generate:cloudflare-static-rules
pnpm run generate:cloudflare-static-rules -- --check
```

동적 Worker 응답에는 동일한 공통 보안 헤더를 직접 추가한다. 헤더가 바뀌면 생성 파일과 Worker 테스트가 함께 실패하도록 유지한다.

## 롤백과 장애 격리

- 정적 릴리스는 직전 검증 SHA로 다시 수동 배포한다.
- 공개 읽기 replica 장애는 안전한 읽기 요청 안에서만 다른 replica를 시도한다.
- core·social·playground·admin·realtime 권위는 임의의 다른 공급자로 자동 write failover하지 않는다.
- 특정 기능 권위가 중단되어도 정적 앱과 로컬 OPFS 프로젝트는 계속 사용할 수 있어야 한다.
- Vercel 수동 fallback은 Cloudflare 전환 기간의 비상 경로일 뿐 자동 배포 권위가 아니다.
- 사용자 프로젝트 원본은 이 정적 배포 단위에 저장하지 않는다.
- Oracle/OCI는 운영·fallback·복구 경로에 포함하지 않는다.
