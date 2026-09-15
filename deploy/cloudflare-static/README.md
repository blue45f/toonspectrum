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
| edge liveness | `/api/health`, `/api/health/live`의 `GET`/`HEAD` | Worker 자체 | Core API를 깨우지 않고 `no-store`로 `status=ok` 응답 |
| core | 나머지 `/api/*`, OG crawler 경로, `/api/catalog/*`, `/api/health/ready`, `/api/config` | `CORE_API_ORIGIN` | 단일 권위, 자동 write failover 없음 |
| public read | 안전한 `GET`/`HEAD`/`OPTIONS`의 `/api/random`, `/api/home`, `/api/calendar`, `/api/insights`, `/api/ranking`, `/api/explore`, `/api/tags`, `/api/search`, `/api/titles/*`, `/api/authors/*`, `/api/kmas/book-webtoons`, `/api/cover`, `/api/public/*` | `PUBLIC_READ_API_ORIGINS` | 최대 8개 동일 계약 origin에 결정적 분산, `502`/`503`/`504`와 네트워크 오류만 다음 origin 재시도 |
| social | `/api/community`, `/api/reviews` | `SOCIAL_API_ORIGIN` | 미설정 시 core, 명시한 설정이 잘못되면 fail closed |
| playground | `/api/fortune`, `/api/play` | `PLAYGROUND_API_ORIGIN` | 미설정 시 core, 명시한 설정이 잘못되면 fail closed |
| admin | `/api/admin` | `ADMIN_API_ORIGIN` | 단일 권위, 자동 failover 없음 |
| realtime | `/socket.io`, `/api/realtime`, `/api/studio-live` | `REALTIME_API_ORIGIN` | 단일 권위, WebSocket handle 그대로 전달 |
| large asset | Static Assets의 25 MiB 제한을 넘는 검토된 WASM/GLB 경로 | 압축 Static Assets + R2 `LARGE_ASSETS` binding | 일반 읽기는 Brotli/gzip sidecar, Range·압축 미지원은 R2, 두 계층 누락/장애 시 명시한 `LARGE_ASSET_ORIGIN`만 사용 |

공개 읽기 풀은 `cf-ray + path + query`를 affinity key로 사용해 동일 요청을 안정적으로 origin에 배치한다. 첫 origin이 일시적으로 실패한 경우에만 다음 읽기 origin을 시도한다. `POST`, `PUT`, `PATCH`, `DELETE`와 기타 권위 요청은 복수 공급자에 재전송하지 않는다. 이 규칙은 무료 한도를 병렬로 활용하면서 중복 쓰기와 split-brain을 방지한다.

readiness, runtime config, 관리자 경로처럼 운영 상태나 기준 권위를 나타내는 경로는 메서드가 읽기여도 공개 replica 풀에 포함하지 않는다. 공개 읽기 allowlist는 실제 API controller와 함께 검토하며, 새로운 prefix를 포괄적으로 자동 분산하지 않는다.

### 공개 replica 보안 경계

공개 읽기 origin은 사용자별 권위를 갖지 않는다. Worker는 public-read 요청에서 다음 정보를 제거한 뒤 replica로 전달한다.

- `Authorization`, `Proxy-Authorization`, `Cookie`
- `x-user-*`, `x-admin-*`, `x-csrf-*`, `x-session-*`
- 클라이언트가 직접 보낸 `Forwarded`, `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`

core·social·playground·admin·realtime 요청의 전달 IP는 클라이언트 입력을 신뢰하지 않고 Cloudflare가 제공한 bounded `CF-Connecting-IP`만 `X-Forwarded-For`로 다시 구성한다. public-read replica에는 IP도 전달하지 않는다. 재시도 대상 응답의 body는 취소해 연결·메모리 자원을 회수한다.

각 upstream 요청에는 다음 관측 헤더가 추가된다.

- `x-toonspectrum-edge: cloudflare-static-gateway-v2`
- `x-toonspectrum-edge-route: core | public-read | social | playground | admin | realtime | large-asset`
- `x-toonspectrum-edge-attempt: 0..n`
- 대형 파일 응답의 `x-toonspectrum-large-asset-source: static-br | static-gzip | r2`

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

`CORE_API_ORIGIN`은 동적 원장의 필수 권위다. 나머지 기능별 origin이 비어 있으면 해당 요청은 core로 유지되므로 기능을 단계적으로 분리할 수 있다. 반대로 변수가 존재하지만 유효하지 않으면 조용히 core로 우회하지 않고 `503 CORE_API_UNAVAILABLE`로 닫힌다. 대형 파일만 예외로, sidecar와 R2가 실패해도 `LARGE_ASSET_ORIGIN`을 명시하지 않았다면 Core API를 파일 서버로 깨우지 않고 `503 LARGE_ASSET_UNAVAILABLE`을 반환한다.

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
- provider-neutral 보안 헤더 계약과 Cloudflare 동적 응답 동기화
- R2 대형 파일의 전체·HEAD·Range·ETag 응답과 원본 fallback

`dry-run`은 로컬 프로덕션 빌드를 만든 뒤 Wrangler 번들·Static Assets 구성과 모든 origin 변수를 검사하지만 원격에 배포하지 않는다.

### 25 MiB 초과 정적 파일

Cloudflare Static Assets의 개별 파일 한도는 25 MiB다. 배포 전에 `prepare:cloudflare-static-assets`가 `dist` 전체를 검사하고, 검토된 OpenCascade WASM 및 modular street seating GLB의 Brotli(`.br`)·gzip(`.gz`) sidecar를 생성한다. 원본 대형 파일만 `.assetsignore`에서 제외하고, sidecar가 25 MiB를 넘거나 새로운 미검토 파일이 한도를 넘으면 배포를 중단한다.

일반 GET·HEAD는 브라우저의 `Accept-Encoding`에 맞는 sidecar를 같은 URL에서 투명하게 제공해 무제한 Static Assets 요청을 우선 활용한다. 두 객체의 원본은 Standard 클래스 R2 버킷 `toonspectrum-public-assets`에 동일 key로 저장하며 Worker의 `LARGE_ASSETS` binding으로 직접 읽는다. byte Range, 압축 미지원 요청, HEAD와 `If-None-Match`를 처리하고 1년 immutable 캐시 및 원본 MIME을 적용한다. sidecar와 R2가 모두 없거나 일시적으로 읽히지 않을 때만 명시적으로 설정한 `LARGE_ASSET_ORIGIN`으로 폴백하며 Authorization, Cookie, 사용자·관리자·세션 헤더는 전달하지 않는다. 변수를 생략하면 Core API fallback을 추론하지 않는다.

`sync:cloudflare-r2-assets:dry-run`은 빌드 산출물과 허용 목록을 검증하고 원격 쓰기를 하지 않는다. 운영 배포에서는 `prepare:cloudflare-static-assets`가 sidecar를 만든 뒤 `sync:cloudflare-r2-assets`가 승인된 원본 초과 파일을 R2에 먼저 업로드하고 Worker를 배포한다.

## 수동 운영 배포

자동 Git 배포는 허용하지 않는다. 검토된 `main`의 깨끗한 worktree에서만 다음 명령을 실행한다.

```bash
export CLOUDFLARE_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com
export CLOUDFLARE_PUBLIC_READ_API_ORIGINS=https://<read-a>,https://<read-b>
export CLOUDFLARE_SOCIAL_API_ORIGIN=https://<social-origin>
export CLOUDFLARE_PLAYGROUND_API_ORIGIN=https://<playground-origin>
export CLOUDFLARE_ADMIN_API_ORIGIN=https://<admin-origin>
export CLOUDFLARE_REALTIME_API_ORIGIN=https://<realtime-origin>
# 선택적 R2 장애 fallback
export CLOUDFLARE_LARGE_ASSET_ORIGIN=https://<immutable-origin>
export VITE_CATALOG_SOURCE=static
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
pnpm run cloudflare:static:deploy
```

`VITE_CATALOG_SOURCE`를 생략해도 `static`이 기본이다. `api`는 정적 카탈로그에 문제가 발생했을 때 검토자가 선택하는 호환 롤백 모드이며, 다른 값은 배포 전에 거부된다.

분리하지 않은 선택 origin은 설정하지 않는다. 배포 스크립트가 모든 값을 HTTPS origin으로 정규화한 뒤 Wrangler `--var`로 전달한다. Wrangler 인증은 로컬 로그인 또는 별도 운영 secret으로 제공한다.

## 커스텀 도메인 전환

`workers_dev` URL은 배포 후 독립 canary로 유지한다. 이 Static Assets Worker는 Cloudflare 영역 라우트 `www.toonstudio.cloud/*`만 담당하며 실패 모드는 fail-open이다. apex `toonstudio.cloud/*`는 [`../cloudflare-apex-redirect`](../cloudflare-apex-redirect/)의 초소형 `308` Worker가 별도로 담당한다. 이 분리는 apex 정본화 때문에 모든 정적 파일 요청을 Worker 코드로 통과시키는 비용·장애 결합을 피한다. `origin.toonstudio.cloud`는 DNS-only Vercel 원본으로 남겨 API와 R2 fallback의 재귀 프록시를 방지한다. 도메인·라우트 변경은 Wrangler 토큰 권한과 별도로 Cloudflare Dashboard에서 검증한다.

## 헤더 계약

`apps/web/public/_headers`는 `vercel.json`의 기존 보안·캐시 헤더로부터 생성한다. Vite가 이를 `dist/_headers`로 복사하고 Static Assets가 정적 응답에 적용한다.

```bash
pnpm run generate:cloudflare-static-rules
pnpm run generate:cloudflare-static-rules -- --check
```

동적 Worker 응답에는 동일한 공통 보안 헤더를 직접 추가한다. Cloudflare Web Analytics를 활성화한 운영 영역은 script origin `https://static.cloudflareinsights.com`과 beacon origin `https://cloudflareinsights.com`만 CSP에 허용하며 wildcard나 broad `https:`는 허용하지 않는다. 헤더가 바뀌면 생성 파일과 Worker 테스트가 함께 실패하도록 유지한다.

## 롤백과 장애 격리

- 정적 릴리스는 직전 검증 SHA로 다시 수동 배포한다.
- 공개 읽기 replica 장애는 안전한 읽기 요청 안에서만 다른 replica를 시도한다.
- core·social·playground·admin·realtime 권위는 임의의 다른 공급자로 자동 write failover하지 않는다.
- 특정 기능 권위가 중단되어도 정적 앱과 로컬 OPFS 프로젝트는 계속 사용할 수 있어야 한다.
- Vercel 수동 fallback은 Cloudflare 또는 Render를 복구할 수 없는 비상 rollback일 뿐 정상 트래픽·자동 배포 권위가 아니다.
- 사용자 프로젝트 원본은 이 정적 배포 단위에 저장하지 않는다.
- 사용 금지된 퇴역 공급자는 운영·fallback·복구 경로에 포함하지 않는다.
