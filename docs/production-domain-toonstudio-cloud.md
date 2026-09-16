# `toonstudio.cloud` 운영 도메인 설정

## 정본과 리다이렉트

- 정본(canonical): `https://www.toonstudio.cloud`
- apex: `https://toonstudio.cloud` → 정본으로 영구 `308`
- 정적 웹: Cloudflare Static Assets Worker `toonspectrum-web`
- 동적 API와 crawler OG: Cloudflare gateway → Render `toonspectrum-core-api`

Cloudflare의 `toonstudio-apex-redirect` Worker가 `toonstudio.cloud/*`만 담당하고 경로와 query를
유지한 `308`을 반환한다. `www.toonstudio.cloud/*`는 Static Assets Worker가 담당한다. 사람의
`/title/:slug`, `/market`, `/market/browse`, `/market/resource/:id` 탐색은 SPA 정적 자산으로
처리하고, 알려진 crawler user-agent만 Render의 `/api/og`로 전달한다.

Vercel 런타임과 저장소 설정은 퇴역했다. `origin.toonstudio.cloud` 또는 기존 Vercel project domain은
정상·비상 origin으로 사용하지 않는다. 해당 DNS 레코드와 Vercel custom-domain 연결 삭제는 코드
변경과 분리한 운영 작업으로 수행하며, 삭제 전에는 `www`와 apex가 Cloudflare 권위를 가리키는지
확인한다.

## Render Core API 환경 변수

```dotenv
CANONICAL_HOST=www.toonstudio.cloud
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud
OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
```

브라우저는 상대경로 `/api/...`를 사용하고 Cloudflare gateway가 검증된 Render origin으로 전달한다.
별도 API origin을 프런트에 하드코딩하지 않는다.

## OAuth 공급자 콘솔

인가 코드 흐름을 쓰는 공급자에는 다음 콜백 URI를 정확히 등록한다.

```text
https://www.toonstudio.cloud/api/auth/oauth/google/callback
https://www.toonstudio.cloud/api/auth/oauth/kakao/callback
https://www.toonstudio.cloud/api/auth/oauth/naver/callback
https://www.toonstudio.cloud/api/auth/oauth/github/callback
```

Google Identity Services의 승인된 JavaScript origin에는 `https://www.toonstudio.cloud`를 등록한다.
apex는 애플리케이션 실행 전에 정본으로 리다이렉트하므로 callback과 JavaScript origin의 기준은
`www` 하나로 유지한다.

## Studio 실시간 협업

임시 realtime 권위는 Cloudflare Durable Objects의 `realtime.toonstudio.cloud`이고,
`workers.dev` origin은 독립 canary·rollback 확인용으로 유지한다. 두 경로 모두 작품 원장이나
raster pixel 저장소가 아니다. 영속 CRDT Socket.IO가 필요한 기능은 `render.yaml`의 별도
`toonspectrum-studio-live` 장기 실행 runtime을 사용한다.

```dotenv
VITE_STUDIO_REALTIME_ORIGIN=https://realtime.toonstudio.cloud
VITE_STUDIO_LIVE_ORIGIN=https://<reviewed-studio-live-origin>
```

비공개 ticket secret과 PostgreSQL adapter 설정은 각 서버 secret manager에만 저장하며 브라우저,
Git 또는 `VITE_` 변수에 넣지 않는다. Socket.IO HTTP CORS와 WebSocket upgrade `Origin` 검사는
같은 exact allowlist를 사용한다.

## 배포 후 확인

```bash
curl -I https://toonstudio.cloud/studio
curl -I https://www.toonstudio.cloud/studio
curl -s https://www.toonstudio.cloud/robots.txt
curl -A 'Googlebot/2.1' -s https://www.toonstudio.cloud/market | grep -E 'canonical|og:title'
curl -s https://www.toonstudio.cloud/api/health/ready
```

첫 요청은 `https://www.toonstudio.cloud/studio`로 `308` 리다이렉트되어야 한다. `www`는 `200`,
Core readiness는 `200 {"status":"ready"}`, crawler HTML의 canonical/OG/JSON-LD는 모두 `www`를
가리켜야 한다.
