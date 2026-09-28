# 참조 이미지 기반 전체 화면 통일 감사 — 2026-09-28

## 기준과 범위

- 기준 소스: `147befa4e`에서 시작한 `codex/reference-design-system-20260928`.
- 목표: 사용자가 첨부한 이미지의 어두운 남색 표면, 보라·청록 강조, 작품 이미지 중심 표현을 공개 페이지와 작업 공간의 공통 문법으로 연결한다.
- GNB, 푸터, 사이드 메뉴, 현재 위치, 연계 동선이 같은 서비스를 표현해야 한다.
- 드로잉 편집기의 배치와 조작은 유지하고 브랜드 일관성만 별도로 검토한다.
- 선택 가능한 아홉 테마, 키보드 초점, 고대비·강제 색상·동작 줄이기를 유지한다.
- 운영 배포는 이 작업에 포함되지 않는다. PR 및 main 병합과 구분한다.

## 현재 소스로 확인한 사실

이전 작업 문서의 완료 문구 대신 라우트 등록, 셸 분기, 스타일과 테스트를 다시 확인했다.

- `app/routes/groups`에는 최상위 라우트 패턴 250개가 있다. 모든 ID가 `campus-bindings.ts`에 분류되어 있으며 누락은 없다.
- `audit-sitewide-visual-ux.mjs`의 현재 URL 수집 결과는 336개다. Studio의 중첩 도구, Admin의 상세 경로, 학습 경로·수업 ID를 펼친 결과다.
- 기본 테마는 이미 `starlight`다. 공개 셸, 작업 셸, 집중 작업 셸, 드로잉 편집기 모두 기존 구현이 있다.
- 모든 등록 화면은 `RouteStage`의 공통 테마·loading/error/recovery 경계를 통과한다. 이 사실만으로 모든 페이지의 실사용이나 시각 검증이 완료된 것은 아니다.
- 공개 문서의 선언적 `Container`는 공통 최대 폭 1320px와 반응형 여백을 사용한다. 기존 starlight GNB는 1472px를 사용해 본문·푸터와 정렬이 달랐다.

최상위 등록 패턴을 공개 경로 판정과 작업 셸 정책에 넣은 분류는 다음과 같다. 매개변수는 표본 ID로 치환했으며 wildcard는 대표 진입점으로 판정했다. 인증·권한·실제 데이터 상태에 따라 달라지는 런타임 성공 여부를 뜻하지 않는다.

| 셸 분류 | 등록 패턴 수 | 예시 |
| --- | ---: | --- |
| 공개 페이지 | 127 | `/discover`, `/market`, `/learn/*`, `/community`, `/about` |
| 작업 공간 | 90 | `/settings`, `/messages`, `/studio/assets`, `/production/projects/:projectId/overview` |
| 집중 작업 | 10 | `/studio/new`, `/studio/import`, 프로젝트 기획·검수·설정 |
| 자체 홈·공간 | 6 | `/home`, `/team`, `/hub`, `/studio`, 개인·프로젝트 가상 공간 |
| 편집기 focus | 5 | 문서·초안·브러시 편집, `/studio/*` |
| 보호 경로 | 12 | 인증, Admin, 초대, 외부 검토, 결제 진입, 404 |

개인 학습 기록(`/learn/records`), 리서치 노트, 작성·운영 화면의 작업 셸은 현재 정책으로 명시되어 있다. 공개 페이지와 동일한 홍보 섹션을 붙이는 방식으로 이 경계를 제거하지 않는다. 대신 브랜드·색상·메뉴 의미·초점 규칙을 연결한다.

## 이번 통합에서 해결하는 차이

`reference-visual-system.css`의 starlight 스타일은 기존 셸을 재사용한다.

- GNB와 푸터가 본문과 같은 `--site-content-max` 및 `--site-page-gutter`를 따른다. 푸터의 좌우 safe area도 보존한다.
- 멤버십, 이벤트 목록·상세, 제품 투어·브랜드 필름의 연계 메뉴는 기존 `Container`를 사용한다. 개별 1152/1280/1504px 폭을 공통 프레임에 연결하고 배경 아트는 기존 외곽에 유지한다.
- 공개 GNB와 작업 topbar/sidebar/statusbar가 같은 남색 계열 표면·경계선을 사용한다.
- 선택된 작업 메뉴에는 공개 GNB와 같은 보라·청록 배경 및 명확한 현재 위치 표시를 적용한다.
- GNB·푸터·작업 탐색에서 키보드 초점을 청록색으로 통일한다. 강제 색상 모드에서는 운영체제의 `Canvas`, `CanvasText`, `Highlight`, `HighlightText`를 사용한다.
- 편집기 캔버스, 도구 위치, 문서 색상, 저장·권한·런타임 동작은 이 스타일 변경의 대상이 아니다.

공개 홈은 실제 기능으로 연결되는 다섯 가지 시작점, 내 프로젝트 복귀, 여덟 가지 제작 모듈로 재구성했다. 검색은 공통 검색 팔레트를 열며, 고정 샘플 작업을 실제 최근 작업처럼 표시하지 않는다. 편집기 그림은 AI 브랜드 아트로 구성한 콘셉트임을 설명하고 실제 드로잉 진입 링크를 제공한다. 상세 제품 소개와 제작 흐름·원칙·도움 앵커는 유지한다.

GNB·작업 공간·푸터·드로잉 앱바는 공통 ToonStudio 워드마크를 사용한다. 푸터에는 목적별 네 가지 메뉴 그룹, 계정·설정, 정책·문의 경로를 유지하고 고정 음악·환경 설정 도크 위로 마지막 링크까지 스크롤할 수 있게 했다. 하위 페이지는 다음 작업 카드를 먼저 보여 주며, 제공되는 제품 체험만 사용자가 펼쳐 볼 수 있다.

새 이미지 `apps/web/public/brand/reference-20260928/story-world.png`는 내장 이미지 생성 도구의 1672×941 원본 픽셀을 보존한다. 도구가 모델 버전 선택과 응답 식별자를 제공하지 않아 `2.5`라는 특정 버전 사용은 확인하지 못했다. 프롬프트와 사용 범위는 같은 디렉터리의 README에 기록했다. 이 참조 이미지와 2026-09-28 사용자 요청은 이전 문서의 따뜻한 색상 중심 방향을 대체하며, 기존 아홉 가지 사용자 선택 테마는 유지한다.

## 공식 서비스와 대조한 탐색 원칙

- [Linear의 UI 정비](https://linear.app/changelog/2026-03-12-ui-refresh)는 프로젝트·문서 사이에서 헤더, 탐색, 보기 조작을 맞추고 사이드바보다 본문을 강조한다. 이번 변경에서는 같은 브랜드와 셸 표면·초점 표현을 유지하면서 각 제작 도구의 배치를 보존했다.
- [Notion의 사이드바 안내](https://www.notion.com/help/navigate-with-the-sidebar)는 전역 검색, 목적별 상위 메뉴, 필요할 때 펼치는 정보를 함께 제공한다. 홈 검색을 실제 공통 검색에 연결하고, 하위 페이지의 다음 행동과 선택적 체험을 구분하는 데 적용했다.
- [Canva의 홈 안내](https://www.canva.com/design-school/resources/navigating-the-homepage/)는 유형별 새 작업 시작과 Projects에서 기존 작업 이어하기를 구분한다. 다섯 가지 제작 시작 카드와 실제 내 프로젝트 복귀를 분리해 적용했다.

위 내용은 2026-09-28 공식 자료를 확인해 현재 구현 원칙과 대조한 것이다. 각 서비스의 화면이나 자산을 복제하지 않았다.

## 요구사항별 검증 원장

| 요구사항 | 필요한 근거 | 현재 상태 |
| --- | --- | --- |
| 첨부 이미지의 미술 방향 | 실제 홈·하위 페이지·작업 셸 화면과 이미지 비교 | 소스·이미지 대조 완료, 최종 화면 검증 대기 |
| 모든 등록 URL의 분류 | 실제 라우트 권위와 셸 정책 대조 | 250개 분류, 누락 0 |
| 중첩 URL까지 전수 확인 | 336개 수집 목록의 데스크톱·모바일 readiness 및 화면 관찰 | 목록 재수집 완료, 최종 브라우저 실행 대기 |
| GNB·본문·푸터 정렬 | 1440/1920px와 390px에서 실제 경계 측정 | 실제 CSS 격리 브라우저의 세 폭에서 경계 일치, 앱 화면 측정 대기 |
| 작업 사이드 메뉴의 일관성 | 공개→작업 이동, 현재 메뉴, 검색·돌아가기·초점 검증 | 기존 셸 기반 시각 통합, 동선 검증 대기 |
| 드로잉 배치 보존 | 변경 파일 범위와 편집기 화면 비교 | 본 CSS에 편집기 배치 selector 없음, 최종 비교 대기 |
| 아홉 테마와 접근성 유지 | 테마별 computed style, 키보드·고대비·강제 색상·reduced-motion | CSS 격리 비교에서 다른 8테마 변경 없음, 청록 초점·강제 색상 통과, 앱 최종 검증 대기 |
| main 병합 | 원격 PR 상태·검증 결과·merge SHA | 미완료 |

## 검증 실행 방법과 판정 한계

1. `AUDIT_LIST_ROUTES=1 node scripts/audit-sitewide-visual-ux.mjs`로 URL 목록을 현재 소스에서 수집한다. 등록 목록과 중첩 권위가 바뀌면 목록부터 다시 비교한다.
2. 최종 빌드 또는 소유권이 확인된 로컬 서버에 대해 336개 URL을 starlight 데스크톱·모바일로 검사한다. 기존 감사 스크립트는 세션 API에 게스트 200, 나머지 API에 503 fixture를 제공한다. 따라서 이 실행은 전체 URL의 오류·차단·복구 셸 관찰이며 정상 데이터 화면 검증과 구분한다. 실패·차단·오류·리디렉션을 개별 분류하고 회복 경로를 확인한다.
3. 공개 목록/상세, 개인 설정, 작업 목록, 집중 작업, 제작 관리, 드로잉, Admin·보호 경로의 대표 화면에서 아홉 테마를 검사한다. 강제 색상·동작 줄이기는 별도 브라우저 조건으로 확인한다.
4. URL 진입 성공에 더해 메뉴 이동, 현재 위치, 닫기와 초점 복원, 하위 페이지 복귀, 모바일 가로 넘침, GNB·본문·푸터의 정렬을 확인한다.
5. 가짜 ID로 나타난 오류·권한 차단 화면은 정상 데이터의 상세 화면 검증을 대신하지 않는다. 실제 데이터가 필요한 경로에는 승인된 테스트 fixture 또는 격리된 테스트 계정을 사용하고 해당 범위를 기록한다.
6. 기존 전수 감사의 GPU 비활성화는 드로잉·3D 동작 보증이 아니다. 사용자 요청에 맞게 드로잉 레이아웃의 유지 여부를 별도 관찰하고 런타임 전체 통과로 확대 보고하지 않는다.

실제 실행한 결과만 아래에 추가한다. 목록 수집이나 소스 계약 검사를 화면 검수 완료로 기록하지 않는다.

## 실행 결과

- `pnpm exec vitest run apps/web/src/shared/components/unified-theme-contract.test.ts apps/web/src/shared/components/site-experience/site-experience-policy.test.ts apps/web/src/shared/components/site-public-routes.test.ts --maxWorkers=1`: 3개 파일, 141개 테스트 통과.
- `pnpm exec vitest run apps/web/src/domains/marketing/ProductTourPage.test.tsx apps/web/src/domains/marketing/BrandFilmPage.test.tsx apps/web/src/domains/marketing/events/BetaOpenEventGate.test.tsx apps/web/src/app/routes/groups/marketing.routes.test.tsx --maxWorkers=1`: 4개 파일, 22개 테스트 통과.
- 실제 공통·작업·참조 CSS를 Chromium의 격리된 문서에 적용해 변경 전후를 비교했다. 아홉 테마 중 starlight 외 여덟 테마의 GNB/작업 topbar/sidebar/현재 메뉴/푸터 computed style은 동일했다.
- 같은 격리 브라우저에서 1920/1440/390px의 GNB·본문·푸터 콘텐츠 좌우 경계가 일치했다. 1920px의 GNB 외곽 폭은 1472px에서 1320px로 정렬되었다.
- 키보드 초점은 2px 청록색, 강제 색상 모드에서는 3px 시스템 Highlight로 표시된다. 강제 색상 조건에서 네 가지 셸 표면의 배경 이미지가 제거되고 글자와 배경이 구별되는 것을 확인했다.
- 격리 브라우저 결과: `.qa/reference-design-20260928/css-contract-result.json`. 이는 실제 CSS cascade의 근거이며 앱 336개 URL의 콘텐츠·동선 검증 결과가 아니다.
- `git diff --check`: 통과.
- `pnpm harness:verify`: 변경 범위 lint, 아키텍처·문서 경계, 전체 웹·API 타입 검사 통과. 로그 `/tmp/toonstudio-reference-harness.log`. 이후 브라우저에서 발견한 보완 사항은 최종 검증에 별도 기록한다.
- `pnpm run build:bundle`: 로컬 정적 웹 번들 성공(2분 37초), 라이선스 공지 생성과 CSP 확인 통과. 로그 `/tmp/toonstudio-reference-build.log`. 운영 배포 실행이 아니다.
- 초기 대표 40개 조건의 가로 넘침·페이지 오류 수집은 완료했으나 일부 하위 페이지가 lazy route skeleton 상태였으므로 화면 준비 완료의 근거로 사용하지 않는다. 기존 readiness 판정과 실제 본문·이미지 로딩을 기다리는 후속 검증으로 구분한다.
- 최종 홈 표본 여섯 조건(starlight/light/contrast × 1440/390px)은 전체 스크롤 및 이미지 decode 후 다시 캡처했다. 모든 이미지 로드와 정책 링크 중심점 클릭 가능 여부를 확인했다. 결과는 `.qa/reference-design-20260928/representative-final-home-*.png`에 보존한다.
