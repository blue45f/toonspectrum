# WEBDEX 배포 가이드 (상용)

웹 + API + DB를 분리 배포하는 3-tier 구성이다.

| 레이어 | 스택 | 호스트 | 배포 산출물 |
| --- | --- | --- | --- |
| 프론트 | Vite + React SPA | **Vercel** | `dist/` (정적) + `/api` 프록시 rewrite |
| API | NestJS | **Render**(상시구동) | `node dist/apps/api/src/main.js` |
| DB | PostgreSQL | **Neon**(기존) | `catalog_snapshot` 등 |

> **왜 API가 서버리스가 아닌가** — `lib/server/catalog-store.ts`가 카탈로그 26k건을 부팅 시
> 메모리에 적재·인덱싱한다. 서버리스 콜드스타트마다 재적재하면 느리고 비싸므로 **상시구동 호스트**가 필요하다.
>
> **왜 Vercel에 `/api` 프록시인가** — 프론트는 상대경로 `/api/...`로 호출한다(`apiPath()`는 미사용).
> `vercel.json`의 rewrite가 `/api/*`를 API 호스트로 프록시하면 브라우저는 단일 오리진 → **CORS 불필요**.

---

## 0. 준비물

- [Neon](https://neon.tech) DB와 `DATABASE_URL` (이미 보유)
- [Render](https://render.com) 계정, [Vercel](https://vercel.com) 계정
- 로컬: Node 22(`.nvmrc`), `corepack enable` (pnpm 11)
- (선택) 소셜 로그인 실연동 시 Google Cloud / Kakao Developers 앱

---

## 1. API 배포 (Render)

레포에 `render.yaml` Blueprint가 있다.

1. Render → **New → Blueprint** → 이 레포 선택 → `render.yaml` 자동 감지.
2. 환경변수 입력(`sync:false` 항목):
   - `DATABASE_URL` — Neon 연결 문자열(`?sslmode=require`)
   - `GOOGLE_OAUTH_*`, `KAKAO_*` — (선택) 미설정 시 로그인은 `[데모]` 폴백
   - `OAUTH_REDIRECT_BASE_URL`, `WEB_APP_BASE_URL` — **둘 다 프론트(Vercel) 공개 도메인으로 동일하게** 설정한다(두 값이 다르면 OAuth 콜백이 실패). Vercel 프로젝트명이 정해졌으면 도메인을 예측해 미리 입력(예: `https://webdex.vercel.app`), 아니면 2단계 후 입력하고 **Render 재배포**.
   - `AUTH_STATE_SECRET`, `CATALOG_INGEST_TRIGGER_TOKEN` — Render가 자동 생성(`generateValue`)
3. 배포 완료 후 **API URL 확보** (예: `https://webdex-api.onrender.com`).
4. 헬스체크 `GET /api/auth/providers` 가 200이면 정상.

> free 플랜은 15분 무요청 시 슬립 → 재기동 시 카탈로그 재적재로 첫 응답이 느리다. 상용은 **Starter 이상**(상시구동) 권장.

---

## 2. 프론트 배포 (Vercel)

1. **배포 전에** `vercel.json`의 `/api` rewrite destination 플레이스홀더 **`CHANGE-ME-webdex-api.onrender.com`을 1단계 Render API URL로 교체**한다. 이 값이 남아 있으면 모든 API 호출이 깨진다.
   ```jsonc
   { "source": "/api/:path*", "destination": "https://webdex-api.onrender.com/api/:path*" }
   ```
   > `/api` 접두사는 의도된 것이다 — API는 전역 프리픽스 `/api`를 쓰므로 `/api/ranking` → `https://<api>/api/ranking` 로 정확히 매핑된다(중복 아님).
2. Vercel → **Add New → Project** → 이 레포 선택. 설정은 `vercel.json`이 제공(빌드 `pnpm run build`, 출력 `dist`).
   - 또는 CLI: `pnpm i -g vercel` → `vercel` (프리뷰) → `vercel --prod` (프로덕션).
3. 배포 완료 후 **프론트 도메인 확보** (예: `https://webdex.vercel.app`).

---

## 3. URL 정합 (OAuth/리다이렉트)

프론트 도메인이 정해지면 **Render 환경변수**를 그 값으로 갱신한다. **두 값은 반드시 동일**(프론트 공개 도메인)해야 하며, 다르면 OAuth 콜백 리다이렉트가 실패한다:

```
OAUTH_REDIRECT_BASE_URL=https://webdex.vercel.app
WEB_APP_BASE_URL=https://webdex.vercel.app
```

Render가 재배포되면 OAuth 콜백/복귀가 모두 Vercel 도메인을 통하게 된다(프록시 경유 → API).

---

## 4. 소셜 로그인 콘솔 등록 (실 OAuth 쓸 때만)

각 콘솔에 **승인된 리디렉션 URI**를 등록:

- Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트
  `https://webdex.vercel.app/api/auth/oauth/google/callback`
- Kakao Developers → 카카오 로그인 → Redirect URI
  `https://webdex.vercel.app/api/auth/oauth/kakao/callback`
  - 동의항목: 닉네임·프로필이미지·(가능하면)이메일. 이메일 미동의 시 `kakao_<id>@kakao.local`로 대체.

키를 Render 환경변수(`GOOGLE_OAUTH_*`, `KAKAO_*`)에 넣으면 로그인 모달의 `[데모]` 표시가 사라지고 실 로그인으로 전환된다.

---

## 5. 데이터 갱신

카탈로그는 Neon `catalog_snapshot`(`isCurrent`)에서 부팅 시 로드되며, 60초 폴링으로 외부 갱신을 핫리로드한다.
주기 갱신은 GitHub Actions 크론(`refresh-data.yml`)이 담당한다:

- Actions 시크릿: API 베이스 URL과 `CATALOG_INGEST_TRIGGER_TOKEN`(Render와 동일 값)을 설정.
- 크론이 `POST /api/catalog/ingest/run`을 호출 → `scripts/crawl.mjs` 실행 → 품질 게이트 통과 시 새 스냅샷 승격.
- 즉시 갱신은 관리자 콘솔(`/admin` → 운영 탭 → 수동 크롤)로도 가능.

---

## 6. 배포 후 점검

- [ ] 프론트 도메인 접속 → 랭킹/연재 캘린더에 데이터가 보이는가 (API 프록시 정상)
- [ ] `GET https://<프론트>/api/auth/providers` 200
- [ ] 로그인(이메일/비밀번호) 동작, 관리자 계정으로 `/admin` 대시보드 지표 로드
- [ ] (실 OAuth 시) 구글/카카오 로그인 → `/auth/callback` 복귀 → 세션 유지
- [ ] 표지 이미지 로드(`/api/cover` 프록시)

---

## 커스텀 도메인(선택)

Vercel에 도메인 연결 후, `OAUTH_REDIRECT_BASE_URL`·`WEB_APP_BASE_URL`과 OAuth 콘솔 리디렉션 URI를
그 도메인으로 갱신하면 된다.
