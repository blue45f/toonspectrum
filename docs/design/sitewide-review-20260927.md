# 사이트 전체 레이아웃·탐색 동선 재검토 — 2026-09-27

- 상태: **current / migration**
- 검토 기준: `2ac94220c9b0115348a734d0b7f7769e800d42db`의 라우트와 이번 변경의 공개 셸 분류
- 범위: 사용자 웹의 등록 경로, 중첩 학습·Studio 경로, 사용자 웹 내부 관리자와 독립 관리자 웹
- 전수 원장: [페이지·셸·접근 조건 JSON](./sitewide-review-20260927.routes.json)
- 근거: [ADR 0023](../adr/0023-sitewide-route-registry-and-shell-boundaries.md), 실제 route group, domain router, `AppShell`, 관련 테스트

이 문서는 **소스 전수 목록과 확인한 구조적 문제**를 기록한다. 로그인된 데이터 화면,
동적 문서, 실제 결제·협업·편집, 모든 테마의 브라우저 검증이 끝났다는 의미는 아니다.
브라우저 관측 결과는 소스 목록과 별도로 기록해야 한다.

## 1. current — 전수 경로 원장

TypeScript AST로 루트 route group의 `id`, `path`, `element`를 읽고
`studioRoutePath()`를 기존 Studio registry로 해석했다. 각 선언의 실제 페이지 파일,
리다이렉트, 동적 파라미터, 대표 URL, 셸 분류를 JSON에 기록했다.

| 집계 | 수 | 의미 |
| --- | ---: | --- |
| 최상위 등록 | 250 | 249개 선언과 전체 404 wildcard 1개. 동일 화면의 별칭도 포함 |
| 기존 시각 감사 수집 URL | 265 | 변경 전 수집기. 대표 경로 + literal route + Studio registry + Admin manifest를 중복 제거 |
| 보완한 시각 감사 수집 URL | 336 | 위 목록에 중첩 Learn/Studio 목적지 71개 추가. 학습은 실제 콘텐츠 ID, companion은 허용 surface 사용 |
| Learn 내부 분기 | 12 | `LearnPage`와 `LearnContent` 내부 라우팅. 별도로 전수 원장에 포함 |
| Studio runtime 경로 family | 14 | surface·문서 ID·작품 ID 조합을 처리하는 manifest 패턴 |
| 사용자 웹 내부 Admin 목적지 | 16 | `/admin/*` 아래 실제 관리자 manifest 목적지 |

처음 literal 경로만 수집한 숫자를 브라우저 감사 범위로 사용하면 대표 Studio 경로가
누락된다. 보완한 실행 기준은 **336개 URL**이며 JSON의 `auditRoutes`와
`AUDIT_LIST_ROUTES=1` 결과가 정확히 일치한다. 모든 개인 문서 ID의 유효성을 보증하는
목록은 아니며, 정적 Learn 콘텐츠와 runtime surface 조합을 빠짐없이 포함한 관측 표본이다.

| Route group | 등록 수 | 실제 화면 구성과 개별 확인 지점 |
| --- | ---: | --- |
| `catalog.routes.tsx` | 17 | `/`은 `UnifiedHomePage` → 비로그인 `CreatorHomePage`, 로그인 `/home`. 나머지는 catalog 목록·검색·추천·랭킹·캘린더·상세 |
| `marketing.routes.tsx` | 9 | `/home`, `/team`, `/hub`는 `StudioWorkspacePage`; 소개·멤버십·행사·영상은 marketing 소유 |
| `community.routes.tsx` | 23 | 커뮤니티·홍보·카페·협업 목록/상세와 작성·수정·운영 화면이 함께 등록됨 |
| `creator-resources.routes.tsx` | 49 | research·생태계·창작 자료; 24개 자료 URL은 `ResourceSearchPage`의 공급자별 export를 공유 |
| `creator.routes.tsx` | 64 | Studio 입구·프로젝트·에셋·가상 공간·작품 갤러리와 legacy alias, `/learn/*`, `/studio/*` |
| `production.routes.tsx` | 27 | 팀·프로젝트·회차·권한·외부 검토; `ProductionHubPage`의 surface별 구성 |
| `market.routes.tsx` | 10 | 공개 탐색·비교·소재 상세와 소유·등록·관리·결제 화면 |
| `account.routes.tsx` | 11 | 계정·설정·메시지와 공개 회원 프로필·창작자 목록 |
| `integrations.routes.tsx` | 4 | 외부 연동·자동화·게시·개발자; 제공자/계정/프로젝트 상태별 검증 필요 |
| `legal.routes.tsx` | 28 | 서비스·기술·도움말·정책·지원. `TermsPage`, `PrivacyPage`는 `PolicyPage` 공유 |
| `engagement.routes.tsx` | 3 | 알림·취향 시작·공유 컬렉션. 컬렉션 snapshot은 개인 공유 상태 별도 검증 |
| `experience.routes.tsx` | 2 | 운세·플레이; 고유 상호작용과 개인 상태 분리 유지 |
| `reference.routes.tsx` | 1 | 공개 레퍼런스 |
| `admin.routes.tsx` | 1 | `AdminRouter`가 16개 운영 화면과 `useAdminGate`를 소유 |
| `not-found.route.tsx` | 1 | 등록되지 않은 목적지의 복구 화면 |

JSON의 `accessMetadata`는 기존 UX 분류를 그대로 기록한 값이다. 이것을 API 인증·인가
증거로 해석하면 안 된다. 예를 들어 `/admin/*`의 일반 metadata 폴백은 `public`이지만,
실제 `AdminAuthorizedRouter`는 `useAdminGate`에서 관리자 권한을 확인한다.
`accessReview`에 실제로 검토할 권한 범위를 따로 표시했다.

### 중첩 화면과 수집기의 사각지대

- 학습: `/learn`, `/learn/resources`, `/learn/classroom`, `/learn/trace`, `/learn/process`,
  `/learn/careers`, `/learn/education`, `/learn/records`, `/learn/paths/:pathId`,
  `/learn/lessons/:lessonId`, `/learn/glossary`, `/learn/studio`.
- `/learn/education`은 최상위 경로에서 `/ecosystem/education`으로 리다이렉트한다.
  내부의 `EducationDirectoryPage` 분기는 현재 그 URL의 최초 화면이 아니다.
- Studio: `canvas`, `comic`, `animation`, `brushes`, `bg3d`, `poser`, `character`와
  `work/:workId`, `remix/:sourceWorkId` 조합, compose, publish, lift3d, storyworld,
  companion, production 화면은 `STUDIO_ROUTE_MANIFEST`와 resolver를 함께 확인한다.
- `/studio/p/:projectId/d/:documentId`, `/studio/draft/:draftId`는 실제 문서 authority와
  저장·undo·협업 lifetime을 유지해야 한다. 일반 페이지 셸 변경으로 재마운트하지 않는다.
- `apps/admin-web/src/app/shell/AdminApp.tsx`는 독립 운영 정책 패널을 렌더한다.
  사용자 웹의 `/admin/*` 16개 화면 전체가 이 앱으로 이전된 상태는 아니다.

## 2. current — 이질감의 구조적 원인

### 공개 목록에서 공개 상세로 이동할 때 바뀌는 셸

`AppShell`은 `isPublicCreativeRoute(pathname)`가 참이면 campus를 만들지 않는다.
반대로 누락된 경로는 `SpatialCampusFrame`과 `WorkspaceTaskFrame`으로 진입할 수 있다.
동일한 목적의 목록·상세 사이에 공개 안내, 상단 내비게이션, 사이드바, 콘텐츠 폭과
추가 장면이 바뀌는 이유다.

이번 변경에서 실제 소스로 공개 기능을 확인한 다음 목적지를 같은 공개 셸에 포함했다.

- 커뮤니티 이벤트·홍보 목록/상세, 협업 모집 조건·공개 포트폴리오·공고 상세
- 공개 회원 프로필과 기존 `/create/:id` 작품 상세
- 따라 그리기 안내와 기술 playbook
- 공개 리서치 카탈로그·오픈 제작·콘텐츠 팩, 생태계 4개 허브
- 접근성·디자인 안내, 이용약관·개인정보·저작권 정책, 공개 제보 게시판과 개발자 계약 안내

`/learn/trace`는 안내와 Studio 연결을 제공하며 자체 원고를 저장하지 않는다.
반면 `/learn/records`, `/research/catalog/notebook`, 공유 snapshot 컬렉션은
개인 작업 맥락이 있으므로 이번 공개 셸 확장에 포함하지 않았다.
작성·수정·관리·moderation·workspace 경로도 공개 상세 패턴과 구분했다.
이 변경은 표현상의 셸 분류만 바꾸며 로그인·권한 검사를 변경하지 않는다.

### 스타일과 메뉴의 여러 소유자

공통 프레임이 없었던 시기에 추가된 계층이 현재 함께 적용된다.

| 소유자 | 파일 | 개선 기준 |
| --- | --- | --- |
| 전역 테마 | `app/styles/globals.css`, `design-themes.css`, `unified-theme-contract.css` | 색·표면·본문·강조·focus는 공통 토큰에서 파생 |
| 공개 셸 | `site-header`, `public-site-journey`, `public-site-shell.css` | 브랜드·주 메뉴·현재 위치의 구조와 순서 유지 |
| 시각 안내 | `SiteExperienceFrame`, `SiteCreationCompass`, `RoutePurposeScene`, `PublicSiteNextSteps` | 본문 시작 전에 중복 설명·이미지·행동을 누적하지 않음 |
| 작업 셸 | `WorkspaceTaskFrame`, `workspace.css`, `workspace-redesign.css`, `workspace-visual-v3.css` | 작업 밀도는 유지하면서 제목·공간·버튼 계층 통일 |
| 가상 공간 | `SpatialCampusFrame`, `CampusRoom` | 장면 모드와 실제 작업을 구분하고 사용자 선택 보존 |
| 페이지별 디자인 | promotion, learning, marketplace, creator flagship 등의 전용 CSS | 공통 토큰을 사용하며 독립 팔레트·반경·폭의 임의 재정의 축소 |

`site-navigation`, `site-route-metadata`, `site-public-routes`, `workspace-task-route`,
`campus-bindings`는 각각 다른 projection을 소유한다. 메타데이터 하나를
인증·페이지 소유권·Studio runtime의 새 권위로 사용하면 안 된다.

## 3. migration — 통일 작업의 적용 경계

공개 탐색과 소개 화면은 같은 내비게이션, 콘텐츠 폭, 제목 계층, 카드·버튼·focus 규칙을
사용한다. 실제 그림·3D 편집기는 도구 밀도와 정밀 입력을 유지하고, 같은 브랜드 토큰과
돌아가기 동선만 공유한다. 정책 문서와 계정·결제·검토 화면은 읽기와 판단에 필요한
정보가 먼저 보이도록 한다.

공통 스타일로 해결할 수 없는 화면은 다음 상태를 따로 확인해야 한다.

| 대상 | 별도 검증 |
| --- | --- |
| 홈·허브 | 비로그인 소개 → 로그인 개인 홈 전환, 최근 작업·새 작업의 목적 구분 |
| 목록·검색·마켓·자료 | 필터 적용·해제, 결과 개수, 빈 결과, 페이지 이동, 저장 여부, 모바일 정렬 |
| 작품·작성자·프로필·홍보 상세 | 대표 이미지가 없는 경우, 비공개·삭제 항목, 글 길이, 원래 목록으로 복귀 |
| 계정·연동·메시지 | 로그인 전/후, 만료·권한 거절, 오류·재시도, 개인 정보 노출 범위 |
| 학습 | 실제 lesson/path ID, 학습 메모·진행률 유지, 안내에서 Studio로 이어가기 |
| Studio 프로젝트·편집기 | 문서와 프로젝트 ID 구분, 저장·undo·복구·협업 연결, 작업 도중 이동 |
| Production·외부 검토 | 같은 프로젝트 맥락, 외부 token 격리, 승인/거절·읽기 전용 상태 |
| Admin | 관리자 인증·인가 실패, 파괴적 조작 확인, 사용자 웹과 독립 앱 경계 |

## 4. 검증 범위와 실행 방법

저장소 루트에서 의존성 설치와 로컬 서버 준비 후 실행한다. 아래 시각 감사는 읽기용
브라우저 관측이며 모든 API를 비로그인/503 fixture로 대체한다. 실제 운영 데이터 또는
운영 배포를 변경하지 않는다.

```sh
AUDIT_LIST_ROUTES=1 node scripts/audit-sitewide-visual-ux.mjs

AUDIT_BASE_URL=http://127.0.0.1:5276 \
AUDIT_ROUTE_MODE=all AUDIT_THEMES=light \
AUDIT_VIEWPORT_MODE=desktop AUDIT_SCROLL_SWEEP=1 \
AUDIT_CAPTURE=issues AUDIT_WORKERS=2 \
AUDIT_OUTPUT=.qa/sitewide-20260927/all-light-desktop \
node scripts/audit-sitewide-visual-ux.mjs

AUDIT_BASE_URL=http://127.0.0.1:5276 \
AUDIT_THEMES=light,dark,contrast AUDIT_VIEWPORT_MODE=all \
AUDIT_SCROLL_SWEEP=1 AUDIT_CAPTURE=always AUDIT_WORKERS=2 \
AUDIT_OUTPUT=.qa/sitewide-20260927/representative-themes \
node scripts/audit-sitewide-visual-ux.mjs
```

전체 336 URL × 3 테마 × 2 viewport는 2,016개 관측이다. 모바일은 390×844,
데스크톱은 1440×1000이다. 이 스크립트는 Studio GPU를 끄므로 캔버스·3D 기능의
정상 실행 근거가 아니다. 동적 URL은 `visual-audit` placeholder를 사용하므로
데이터가 존재하는 상세 화면 검증도 별도로 필요하다. Learn은 실제 10개 lesson과
5개 path ID를 사용하며 Studio companion은 workspace/navigator/review/reference를 사용한다.

중첩 Learn/Studio URL은 JSON의 `learningBranches`와 `studioRouteFamilies`의
`auditPaths`에 기록하고 수집기에 연결했다. 실제 사용자 문서와 GPU 편집은 관련
Playwright/Studio 검증에서 확인한다. 모든 대상을 빈 ID 화면으로만 통과시켜 전수
완료로 보고하지 않는다.

### 콘텐츠 준비 판정 보완

기존 900ms의 `.route-stage--settled` 대기는 화면 전환 애니메이션만 확인했으며,
스켈레톤만 보이는 `/`와 `/discover`도 문제가 없는 관측으로 통과시킬 수 있었다.
이제 `data-route-state`, 실제 보이는 loading fallback·pending·recovery·skeleton,
본문 요소를 함께 검사하고 기본 20초까지 기다린다. 결과에 관측한 상태 전환,
소요 시간, timeout을 남기며 fallback·pending·stalled·skeleton·empty·error를 실패로
분류한다. 명시적인 blocked/degraded와 SPA 리다이렉트는 별도 경고로 기록한다.

2026-09-27 로컬 서버의 `/`, `/discover`, `/learn/trace`, `/admin/overview`에서
fallback → ready 전환을 관측했다. 홈 화면 PNG도 직접 확인하여 실제 본문·hero 렌더를
확인했다. 이 중 Admin의 비로그인 안내는 현재 제품이 legacy ready로 표시하므로
관리자 기능 검증으로 볼 수 없다. 보고서는 guest/503 fixture, GPU 미사용,
`authenticatedWorkflowsVerified: false` 조건을 함께 기록한다.

`node --test scripts/lib/sitewide-visual-ux-audit.test.mjs`의 12개 테스트와 수정한
감사 스크립트·helper·test의 ESLint를 통과했다. 전체 브라우저 결과는 이 네 경로의
준비 판정 검증과 별도로 종합한다.

이번 공개 셸 분류 변경의 실제 검증:

```sh
pnpm exec vitest run \
  apps/web/src/shared/components/site-public-routes.test.ts \
  apps/web/src/shared/components/site-experience/site-experience-policy.test.ts \
  apps/web/src/shared/components/site-navigation.test.ts
```

2026-09-27 공개 정책 누락까지 보완한 실행 결과: **3개 파일, 131개 테스트 통과**.
legal registry의 28개 목적지 전체를 직접 대조하며 공개 목적지의 일관성뿐 아니라
작성·관리·개인 기록·모르는 경로의 제외를 함께 확인했다.
전체 하네스·typecheck·build·실제 브라우저 결과는 최종 통합 검증에서 별도로 기록한다.

### migration — 시작 시점의 검증 차단과 계약 복구

2026-09-27 기준 main `2ac94220c9b0115348a734d0b7f7769e800d42db`에서 실행한
전체 typecheck 로그에는 794개 TypeScript 오류가 있었다. `TS2305` 577개,
`TS7006` 126개, `TS2307` 29개 등이 포함되며 계약 파일 이전 후 남은 잘못된
재-export/import 경로가 많은 후속 오류를 만든다. 이는 이 문서의 공개 셸 변경을
검증하는 테스트와 다른 범위다.

`pnpm dev`의 `predev` 카탈로그 생성도 같은 core 재-export 오류로 시작하지 못했다.
`packages/contracts/src/{search,types,taxonomy,recommend,reference-assets}.ts`가
이전 웹 디렉터리 기준 `../../../../../packages/core/src/...`를 참조한 것이 원인이다.
현재 contracts 위치에서의 올바른 경로는 `../../core/src/...`다. 이번 작업에서
다섯 경로를 복구한 후 카탈로그 predev와 로컬 서버 시작이 통과했다. 같은 수정 후
전체 typecheck에는 479개 오류가 남았다. 기존 794개와 core 경로만 복구한 뒤의
479개는 서로 다른 검증 시점의 값이며, 이후 전체 계약 복구의 최종 오류 수가 아니다.

이후 기준 커밋에 있는 Studio 구현 19개를 공용 contracts 권위로 옮기고 원래 웹 경로는
재-export하도록 복구했다. codec 의존성, 자료 workflow, API 인증 스키마, 자기 참조
rate-limit, 인증 테스트 위치도 바로잡았다. 다른 세션의 주 작업트리 미커밋 파일을
복사하거나 수정하지 않았다. 출처 동일성·타입 정의·lockfile의 부수 변화와 검증 근거는
[계약 이전 누락 복구 기록](../engineering/contracts-migration-repair-20260927.md)에 정리했다.

계약 구현 복구와 관련 18개 파일·179개 테스트, contracts 단독 typecheck,
architecture·보안·라이선스 검증은 완료했다. 이 문서 작성 시 루트 전체 typecheck,
웹 build, 통합 harness와 최종 브라우저 검증은 진행 중이며 PR CI·main 병합은
별도의 최종 결과로 확인한다. 구현 복구 완료와 전체 통합 검증 완료를 구분한다.

## 5. 상태 보고 경계

이 문서 작성 시점에 공개 셸 누락 보완과 소스 인벤토리의 검증을 완료했다.
완성된 전면 디자인, 모든 로그인 동선, 전체 typecheck/build, main 병합 또는 운영
배포 완료를 이 문서만으로 주장하지 않는다. 운영 배포는 PR 병합과 별도의 명시적
사용자 승인이 필요하다.


## 5. 2026-09-27 정적 빌드 관측과 후속 수정

다음 표는 실제 실행한 관측이며 정상 사용자 데이터의 기능 완주와 구분한다.

| 실행 | 조건 | 결과 |
| --- | --- | --- |
| 전체 데스크톱 URL | 1440×1000, light, 336 URL, 스크롤 순회, axe 미실행 | 336/336 관측 완료. 원본 보고서에서 실패 25, 경고 102 |
| 전체 모바일 URL | 390×844, light, 336 URL, 스크롤 순회, axe 미실행 | 336/336 관측 완료. raw 실패 24, 경고 66. ready 316, blocked 1, error 15, empty 4 |
| 홈 테마·화면 폭 | 9개 테마 × 2 viewport | 18/18 ready, 실패 0. 색 대비 자동 판정은 18조건 모두 incomplete를 별도 기록 |
| 학습·마켓 실제 동선 | 390/1440 × light/dark/contrast, 배너 닫기 없음 | 6조건 84단계 통과, pageerror·가로 overflow 0 |
| 메뉴·검색·작품 목록 복귀 | 390/1440, light/dark/contrast, ko/en | 12조건 68검사 통과, pageerror 0 |
| 실제 포인터 경합 회귀 | 1440×1100, 화면 하단의 학습 실습 링크 | 누르는 동안 배너 미노출, pointerdown/up/click 모두 원래 링크 유지, 해시 이동 후 배너 표시 |
| 통합 하네스 | 전체 변경 범위 | `pnpm harness:verify` 통과. 영역별 브라우저·API 통합 검증을 대체하지 않음 |

전체 데스크톱 관측의 실패 25개는 다음과 같이 후속 분류했다.

- 카페 관리 1개: 비로그인 안내가 `stalled`로 오인되는 실제 결함. 명시적 blocked 상태와 실제 RouteStage 회귀 테스트로 수정했다.
- 생태계 2개: 병렬 관측 중 lazy fallback 지연. 같은 API fixture의 단일 worker 재관측에서 ready, issue 0으로 회복했다.
- AI 설정 1개: 전체 문서 리다이렉트 중 검사 context가 소멸했다. 직접 재관측에서 `/settings/ai?source=studio`와 본문 ready를 확인했고, 감사는 제한 시간 안에서 해당 전환만 다시 관측하도록 보완했다. 브라우저 종료 오류는 계속 실패로 처리한다.
- Production 프로젝트 15개: 존재하지 않는 `visual-audit` ID와 503 API fixture에 대해 명시적 오류·제작 관리 홈 복귀가 표시됐다. 실제 프로젝트 화면의 성공 검증이 아니다.
- 3D 계열 6개: GPU를 끈 조건에서 WebGL context 실패 4개, 포털 내부 WebGPU 오류가 route stage 밖에 표시되는 2개. GPU 렌더링 성공이나 정상 편집으로 인정하지 않는다.

경고도 단순히 모두 제품 결함으로 해석하지 않았다. 닫힌 details의 자손은 실제 펼치면
표시되므로 감사의 가시성 판정에서 제외했다. 화면 진입 전 Motion 콘텐츠는 실제 타깃으로
스크롤해 표시되는지 재확인했다. 잘린 텍스트 경고는 `clip-path`·1px 크기의 스크린리더 전용
설명·비포커스 skip link와 구분한다. 확인되지 않은 외부 이미지 로딩과 고밀도 Studio 조작부의
작은 타깃 경고는 별도 검증 경계로 남긴다.

공개 화면의 실제 작은 모바일 타깃은 발표 타이머 초기화 32×44, 제보 새로고침 36×44,
검색 보기 전환 38×44로 실측하여 해당 인스턴스만 최소 44×44로 보완했다.
공통 Segmented나 전문 편집기의 밀도를 일괄 변경하지 않았다.

모바일 전수 관측의 실패 24개는 Production 15개 오류 fixture와 GPU 관련 9개(WebGL 5, 3D 포털 4)다.
카페 관리는 recovery 없이 blocked이며 AI 설정은 실제 목적지로 이동해 ready를 확인했다.
후속 빌드의 공개 조작부 실측과 PR CI는 별도의 최종 결과로 갱신한다.
로컬 원본 증거는 `.qa/sitewide-final-light-desktop/report.json`,
`.qa/sitewide-final-light-mobile/report.json`, `.qa/design-home-merge-candidate/`,
`.qa/visual-ux/navigation-final/`, `.qa/design-review/`에 보존한다.

## 6. current — 2026-09-27 고정 빌드의 최종 홈·동선 재검증

부모 빌드 세션 `47923`의 `.qa/sitewide-merge-ready/dist`를 별도 로컬 preview
`http://127.0.0.1:61096`에서 확인했다. 서빙된 HTML과 고정 산출물의 byte가 같으며,
`index.html` SHA-256은 `4b7ede4b711026882f657fce8174e463fd28f6047b959872c5ac3fee8b6bd5db`,
엔트리는 `/assets/index-DokCVtvM.js`다. 검증 중 제품 소스는 수정하지 않았다.
이 빌드에는 후속 Campus URL 대소문자 분류, Studio 저장 안내 및 필터 오류 표시 수정이
포함되지 않는다. 아래에서 검사한 소문자 홈·법적 경로는 해당 수정의 대상이 아니다.
최종 전체 CI·병합 결과와 구분한다.

| 재검증 | 실제 조건과 범위 | 결과 |
| --- | --- | --- |
| Flagship·open-creation | 기존 Playwright 2 spec, worker 1 | 20/20 통과, flaky 0, 110.5초 |
| 공개 메인 | `/` 진입, 9개 테마 × 1440/390px | 18/18 통과. 이미지 로딩, 제목·가로 넘침, 창작 목적지 6개, 기존 홈 조작부 계약인 높이 44px 이상, 키보드 초점·본문 이동 확인 |
| 개인 작업실 장애 상태 | `/home`, API 503, 1440/820/390px | 3/3 통과. 문서 흐름의 배너, 실제 메뉴 클릭, dialog 초점, Escape 후 실행 버튼 복귀, 주요 행동 높이 44px 이상 확인 |
| 법적 읽기 | `/privacy`·`/terms`·`/copyright` × 1440/390px | 6/6 통과. 단일 제목, 공개 헤더·푸터, 홍보형 다음 단계 제외, 가로 넘침 없음 |
| 정상 상태 대표 이미지 | `/` 재진입 직후 Aurora/Light × 1440/390px | 4개 캡처. health `available`·analytics `accepted` 응답 fixture 사용 |

공개 메인 본문 바로가기의 기존 정책을 함께 확인했다. 인식된 `#creator-flow` 등의
fragment는 `CreatorHomePage`가 `/about/studio#...`로 이동시키므로, 본문 이동과 초점 검증
이후의 화면은 공개 소개 경로다. 소개 경로에서 `전체`의 `aria-current="page"`와 강조가
적용되는 것은 현재 위치 분류에 따른다. 대표 이미지 4장은 `/`에 새로 진입한 뒤 캡처해
실제 메인의 `홈`만 현재 페이지로 표시되는 것을 확인했다. 초기 본문 이동 이후의
이미지는 별도 `merge-ready-public-home-post-anchor-*` 기록으로 보존한다.

통합 로컬 증거는 `.qa/design-review/merge-ready-focused-evidence.json`이다. 상세 원본은
`flagship-merge-ready-results.json`, `merge-ready-home-themes.json`,
`merge-ready-home-degraded-built.json`, `merge-ready-legal.json`,
`merge-ready-home-healthy-captures.json`에 보존했다. 최종 대표 이미지는 같은 디렉터리의
`merge-ready-public-home-healthy-{aurora,light}-{1440,390}.png`다.

일반 검증은 비로그인·503 API fixture, 외부 요청 차단, GPU 비활성화, reduced motion
조건이다. 정상 상태 이미지만 별도로 실제 schema에 맞는 health·analytics 응답을 사용했으며
DOM·CSS 숨김이나 화면 조작은 하지 않았다. 운영 API 정상 상태, 인증된 실제 데이터 저장,
GPU 편집기 렌더링, 전체 색 대비 통과 또는 운영 배포를 이 결과로 주장하지 않는다.
