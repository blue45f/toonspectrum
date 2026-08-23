# Market 도메인 설계 — 스튜디오 리소스 마켓 (v1)

날짜: 2026-08-23
상태: 구현됨 (v1, 무료 전용)

## 1. 배경 & 목표

Studio에는 이미 **커뮤니티 마켓플레이스**가 있다:

- 백엔드: `apps/api/src/modules/creator-marketplace/` — 브러시·필터·팔레트·템플릿·3D 프리셋·에셋 6종의 공유 리소스 CRUD (`/creator/marketplace/resources`)
- 프론트: `StudioCommunityMarketplacePanel` — **스튜디오 내부** 패널에서만 발견/설치 가능

문제: 마켓이 스튜디오 안에 갇혀 있어 **발견(discovery) 표면이 없다**. Clip Studio Assets처럼 스튜디오 밖 공개 마켓 페이지가 필요하다.

목표: `/market` 독립 라우트 그룹으로 (1) 공개 브라우즈/검색/상세, (2) 스튜디오 진입 연결을 제공한다.

## 2. 레퍼런스 리서치 요약

| 서비스 | 채택한 패턴 |
| --- | --- |
| **Clip Studio Assets** | 종류 카테고리 퀵링크, 신작/추천 섹션, 상세 페이지의 라이선스·출처 명시, "앱으로 열기" 1클립 CTA, 종류/등록일 필터 |
| **Figma Community** | 리소스 타입 탭, 프리뷰 카드 그리드, 크리에이터 귀속, 1차 CTA가 곧 "앱에서 사용" |
| **Unity Asset Store** | URL 기반 필터 상태, 퍼블리셔 귀속, "내 에셋" 개념(→ 우리는 스튜디오 설치 패널이 담당) |
| **Gumroad/Blender Market** | 유료 결제 — **v1 제외** (백엔드가 `access:"free"` 고정. YAGNI) |

## 3. 범위 (v1)

**한다**: 공개 마켓 홈, URL 파라미터 기반 브라우즈(검색/종류/라이선스/태그 + 커서 페이지네이션), 리소스 상세 페이지, 단건 공개 API, 내비게이션 진입점.

**안 한다 (YAGNI)**: 유료/포인트, 평점·리뷰, 다운로드 수 집계, 업로드 UI(스튜디오 패널이 이미 담당), 별도 SPA/서브도메인.

## 4. 라우팅 (별도 섹션 추가)

AppRouter에 "Market Domain Routes" 섹션 추가 (lazyRetry 청크 분할):

- `/market` — 홈: 히어로 + 6종 카테고리 그리드 + 최신 공유 그리드 + 라이선스 안내 + "스튜디오에서 공유하기" CTA
- `/market/browse` — 브라우즈: `?q&kind&license&tag` URL 파라미터 + "더 보기" 커서 페이지네이션
- `/market/resource/:id` — 상세: manifest 전체(버전/호환 엔진/라이선스/출처/AI 공개), entries 목록, 배급자, 같은 종류 최신 추천

연결 파일: `route-manifest.ts`, `route-titles.ts`(STATIC_TITLES + `/market/resource/` 동적 분기), `site-header.tsx` NAV, `site-header-mobile-nav.tsx` MOBILE_NAV, i18n `ko.json`/`en.json` + 카탈로그 재생성.

## 5. API 추가 — 단건 공개 조회

`GET /creator/marketplace/resources/:id` (공개, `Cache-Control: public`)

- repository: `findById(id)` — `hidden = false` 필터, list와 동일 컬럼 select
- service: `getById(id, viewerId?)` — 없으면 `NotFoundException` (404는 프론트에서 `notFound` 흐름)
- controller: `@Get("/:id")` — 기존 `@Get("/mine")` **뒤에** 선언해 라우팅 충돌 방지
- 프론트 client: `getCreatorMarketplaceResource(id)` (network 청크 + facade, zod 파싱)

## 6. 프론트 구조 — `src/domains/market/`

- `market-kind.ts` — 6종 리소스 종류 메타데이터(한글 라벨, 설명, 커버 hue, lucide 아이콘). 단일 출처.
- `MarketResourceCard.tsx` — 타이포그래픽 커버(종류 hue 스펙트럼 그라디언트 + 종류 라벨) + 이름 + 배급자 + 태그. 중첩 카드 금지.
- `use-market-resources.ts` — list client 래핑 훅(필터 + 커서 누적).
- `MarketHomePage.tsx` / `MarketBrowsePage.tsx` / `MarketResourceDetailPage.tsx`

데이터 흐름: 페이지 → `use-market-resources` / client facade → `/creator/marketplace/resources*` → zod 검증 → 렌더. 404는 `useApiResource`의 notFound 계약을 따른다.

## 7. 디자인 시스템 준수 (DESIGN.md)

- Dark warm-ink 고정, OKLCH만(`#000/#fff`·raw rgb/hex 금지), 중립은 hue 64–70 축
- persimmon 악센트는 프라이머리 신호(CTA/활성 탭)만; 종류 hue는 **데이터 맥락**(커버 그라디언트·칩)으로만
- 플랫 표면 + 보더, 그림자 절제, 중첩 카드 금지, 스켈레톤 로딩(스피너 금지), 빈 상태는 다음 행동을 가르침
- 모션 150–250ms ease-out-expo, `prefers-reduced-motion` 존중. Space Grotesk(수치/영문 라벨) + Pretendard(UI)

## 8. 에러 처리

- API 404 → 상세 페이지 `notFound` 상태(안내 + 브라우즈 복귀 링크)
- 네트워크/5xx → `ErrorState` + 재시도
- zod 파싱 실패 → 기존 client의 `toApiError` 메시지 흐름 유지

## 9. 테스트

- API: service `getById`(정상/404/숨김 행 제외), controller 소유 경계, repository contract 반영
- 프론트: market-kind 메타데이터 무결성, MarketResourceCard 렌더, 상세 404 흐름
- 게이트: `pnpm lint`, `tsc`, 관련 vitest, `check:studio-bundle`/`validate:architecture` (청크 추가가 래칫에 영향 없는지 확인)

## 10. 이후 확장 (비목표)

유료/포인트 결제, 평점·리뷰, 다운로드 카운트, 배급자 페이지(`/market/creator/:id`), 컬렉션 큐레이션, 마켓 전용 SEO 메타.
