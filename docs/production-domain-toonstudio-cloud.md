# `toonstudio.cloud` 운영 도메인 설정

## 정본과 리다이렉트

- 정본(canonical): `https://www.toonstudio.cloud`
- apex: `https://toonstudio.cloud` → 정본으로 영구 `308`
- 비상 원본: `https://origin.toonstudio.cloud` → DNS-only Vercel fallback, canonical 아님

Cloudflare의 `toonstudio-apex-redirect` Worker가 `toonstudio.cloud/*`만 담당하고, 경로와
query를 그대로 유지한 `308`을 반환합니다. `www.toonstudio.cloud/*`는 Static Assets Worker
`toonspectrum-web`가 담당합니다. 두 역할을 분리해 정적 파일을 모두 Worker 코드로 통과시키지
않으면서도 apex 정본화를 보장합니다.

`origin.toonstudio.cloud`는 Cloudflare API/R2 장애 시 확인할 DNS-only Vercel 원본이며
페이지의 canonical/OG/JSON-LD는 항상 `www`를 가리켜야 합니다. 역사적으로 사용한
`toonspectrum.vercel.app`은 현재 운영 계정이 관리하는 도메인이 아니므로 배포·스모크 계약에
포함하지 않습니다. `vercel.json`의 해당 host redirect는 도메인이 다시 연결될 경우를 위한
방어적 규칙으로만 유지합니다.

## Vercel Production 환경 변수

비밀 값은 저장소에 넣지 말고 Vercel Production 환경에만 설정합니다.

```dotenv
CANONICAL_HOST=www.toonstudio.cloud
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud
OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
WEBDEX_SITE_URL=https://www.toonstudio.cloud # 기존 알림 스크립트 호환 키
```

프론트와 `/api`가 같은 Vercel 배포에 있으므로 `VITE_API_BASE_URL`은 비워 둡니다. 브라우저는
기존처럼 상대경로 `/api/...`를 사용하며, 별도 API origin을 하드코딩하지 않습니다.

## OAuth 공급자 콘솔

인가 코드 흐름을 쓰는 공급자에는 다음 콜백 URI를 정확히 등록합니다.

```text
https://www.toonstudio.cloud/api/auth/oauth/google/callback
https://www.toonstudio.cloud/api/auth/oauth/kakao/callback
https://www.toonstudio.cloud/api/auth/oauth/naver/callback
https://www.toonstudio.cloud/api/auth/oauth/github/callback
```

Google Identity Services의 승인된 JavaScript origin에는
`https://www.toonstudio.cloud`를 등록합니다. apex는 애플리케이션을 실행하기 전에 정본으로
리다이렉트되므로 OAuth callback과 JavaScript origin의 기준은 `www` 하나로 유지합니다.

## Studio 실시간 협업

2026-08-02 기준 ephemeral realtime 권위는 Cloudflare Durable Objects이며, 검증된
`workers.dev` origin을 사용합니다. `realtime.toonstudio.cloud`는 Cloudflare zone이 없어
custom hostname/DNS/TLS가 완료되지 않았으므로 아직 권위 origin으로 설정하지 않습니다.

프론트(Vercel build-time):

```dotenv
VITE_STUDIO_REALTIME_ORIGIN=https://toonspectrum-realtime.toonstudio-realtime.workers.dev
```

Cloudflare와 Vercel은 같은 `STUDIO_REALTIME_TICKET_SECRET`을 각각의 secret manager에서
주입해야 하며, 브라우저·Git·`VITE_` 변수에는 노출하지 않습니다. Cloudflare는
presence, comment invalidation, screen-share signaling만 담당하고 작품 ACL·raster
pixel·음성 media 권위가 아닙니다.

Vercel Functions는 장기 실행 Socket.IO 서버가 아닙니다. CRDT fanout·lock에 별도
Nest Socket.IO host가 필요한 승인된 폴백에서만 다음 경계를 추가합니다.

프론트(Vercel build-time, 선택):

```dotenv
VITE_STUDIO_LIVE_ORIGIN=https://approved-socket-origin.example.com
```

장기 실행 Nest 서버:

```dotenv
NODE_ENV=production
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
```

명시적 `VITE_STUDIO_LIVE_ORIGIN`이 없는 Vercel/custom-domain 빌드에서는 선택형 Socket.IO가
`wss://www.toonstudio.cloud/socket.io`에 잘못 연결하지 않고 Socket.IO transport만 비활성화합니다.
Socket.IO의 HTTP CORS와 WebSocket upgrade `Origin` 검사는 같은 exact allowlist를 사용하며,
credentialed wildcard CORS는 사용하지 않습니다.

## 배포 후 확인

```bash
curl -I https://toonstudio.cloud/studio
curl -I https://www.toonstudio.cloud/studio
curl -I https://origin.toonstudio.cloud/studio
curl -s https://www.toonstudio.cloud/robots.txt
curl -s https://www.toonstudio.cloud/ | grep -E 'canonical|og:url'
```

첫 요청은 `https://www.toonstudio.cloud/studio`로 `308` 리다이렉트되어야 합니다. `www`와
비상 원본은 모두 `200`이어야 하지만, 양쪽 HTML의 canonical/OG/JSON-LD 및 `robots.txt`의
sitemap은 모두 `www`를 가리켜야 합니다. `origin`은 검색·OAuth·사용자 공유 URL로 쓰지
않습니다.
