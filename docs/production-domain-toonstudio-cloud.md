# `toonstudio.cloud` 운영 도메인 설정

## 정본과 리다이렉트

- 정본(canonical): `https://www.toonstudio.cloud`
- apex: `https://toonstudio.cloud` → 정본으로 영구 `308`
- 이전 Vercel URL: `https://toonspectrum.vercel.app` → 정본으로 영구 `308`

Vercel 프로젝트의 Domains 설정에서 `www.toonstudio.cloud`를 Primary Domain으로 유지합니다.
`vercel.json`에도 apex와 이전 Vercel 호스트를 정본으로 보내는 host 조건부 리다이렉트를
두어, 도메인 설정이 재연결되더라도 중복 콘텐츠가 노출되지 않게 합니다.

## Vercel Production 환경 변수

비밀 값은 저장소에 넣지 말고 Vercel Production 환경에만 설정합니다.

```dotenv
CANONICAL_HOST=www.toonstudio.cloud
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud
OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
WEBDEX_SITE_URL=https://www.toonstudio.cloud
```

프론트와 `/api`가 같은 Vercel 배포에 있으므로 `VITE_API_BASE_URL`은 비워 둡니다. 브라우저는
기존처럼 상대경로 `/api/...`를 사용하며, 별도 API origin을 하드코딩하지 않습니다.

## OAuth 공급자 콘솔

인가 코드 흐름을 쓰는 공급자에는 다음 콜백 URI를 정확히 등록합니다.

```text
https://www.toonstudio.cloud/api/auth/oauth/google/callback
https://www.toonstudio.cloud/api/auth/oauth/kakao/callback
https://www.toonstudio.cloud/api/auth/oauth/naver/callback
```

Google Identity Services의 승인된 JavaScript origin에는
`https://www.toonstudio.cloud`를 등록합니다. apex는 애플리케이션을 실행하기 전에 정본으로
리다이렉트되므로 OAuth callback과 JavaScript origin의 기준은 `www` 하나로 유지합니다.

## Studio 실시간 협업

Vercel Functions는 장기 실행 Socket.IO 서버가 아닙니다. 실시간 협업을 운영할 때는 Nest
서버를 장기 실행 호스트(예: `https://realtime.toonstudio.cloud`)에 배포하고 다음 값을
설정합니다.

프론트(Vercel build-time):

```dotenv
VITE_STUDIO_LIVE_ORIGIN=https://realtime.toonstudio.cloud
```

장기 실행 Nest 서버:

```dotenv
NODE_ENV=production
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
```

명시적 `VITE_STUDIO_LIVE_ORIGIN`이 없는 Vercel/custom-domain 빌드에서는 클라이언트가
`wss://www.toonstudio.cloud/socket.io`에 잘못 연결하지 않고 실시간 연결을 비활성화합니다.
Socket.IO의 HTTP CORS와 WebSocket upgrade `Origin` 검사는 같은 exact allowlist를 사용하며,
credentialed wildcard CORS는 사용하지 않습니다.

## 배포 후 확인

```bash
curl -I https://toonstudio.cloud/studio
curl -I https://toonspectrum.vercel.app/studio
curl -I https://www.toonstudio.cloud/studio
curl -s https://www.toonstudio.cloud/robots.txt
curl -s https://www.toonstudio.cloud/ | grep -E 'canonical|og:url'
```

첫 두 요청은 `https://www.toonstudio.cloud/studio`로 영구 리다이렉트되어야 하고, 정본
페이지의 canonical/OG/JSON-LD 및 `robots.txt`의 sitemap도 모두 `www`를 가리켜야 합니다.
