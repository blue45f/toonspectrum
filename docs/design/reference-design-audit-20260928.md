# 참조 이미지 기반 전체 화면 통일 감사 — 2026-09-28

상태: **current — 로컬 검증 및 전수 관찰 기록**. 아래 결과는 각각 기록된 소스 시점의 관측이다. 전수 관찰과 실제 동선의 후속 검증을 구분하며, 원격 CI·main 병합의 최종 상태는 이 브랜치 PR의 Checks와 merge SHA를 정본으로 사용한다.

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
| 첨부 이미지의 미술 방향 | 실제 홈·하위 페이지·작업 셸 화면과 이미지 비교 | 소스·이미지 대조 및 production preview 대표 26조건 통과. 후속 공통 CSS의 마켓 2조건도 별도 통과 |
| 모든 등록 URL의 분류 | 실제 라우트 권위와 셸 정책 대조 | 250개 분류, 누락 0 |
| 중첩 URL까지 전수 확인 | 336개 수집 목록의 데스크톱·모바일 readiness 및 화면 관찰 | 672/672 고유 조건 관찰 완료. 정상 데이터 검증과 구분하며 원본의 실패·경고 및 후속 검사를 아래에 기록 |
| GNB·본문·푸터 정렬 | 1440/1920px와 390px에서 실제 경계 측정 | 격리 CSS의 세 폭에서 경계 일치. 앱 대표 26조건 가로 넘침 0, 홈 320px 포함. 집중 작업 1440/390/320px에서 바깥 스크롤 0·헤더 상단 0 |
| 작업 사이드 메뉴의 일관성 | 공개→작업 이동, 현재 메뉴, 검색·돌아가기·초점 검증 | 공통 검색 네 진입 조건의 초점 순환·Escape·호출 버튼 복귀 통과. 모바일 메뉴 27개 목적지와 닫기 후 초점 복귀 확인 |
| 드로잉 배치 보존 | 변경 파일 범위와 편집기 화면 비교 | 캔버스·도구 배치 유지. `/studio?drawingShell=app` 1440/390px 대표 관찰 통과. 모바일 시작 안내 닫기만 44px 보완. 3D 복구 상태는 별도 10조건 검증 |
| 아홉 테마와 접근성 유지 | 테마별 computed style, 키보드·고대비·강제 색상·reduced-motion | 격리 CSS에서 다른 8테마 동일, 청록 초점·강제 색상 통과. 실제 홈의 아홉 테마와 검색 키보드 240회 통과. CTA 대비 17.55:1. 모든 페이지·모든 접근성 조건을 통과했다는 뜻은 아님 |
| main 병합 | 원격 PR 상태·검증 결과·merge SHA | 로컬 결과와 구분해 이 브랜치 PR의 필수 Checks·병합 상태·merge SHA를 최종 정본으로 사용한다 |

## 검증 실행 방법과 판정 한계

1. `AUDIT_LIST_ROUTES=1 node scripts/audit-sitewide-visual-ux.mjs`로 URL 목록을 현재 소스에서 수집한다. 등록 목록과 중첩 권위가 바뀌면 목록부터 다시 비교한다.
2. 최종 빌드 또는 소유권이 확인된 로컬 서버에 대해 336개 URL을 starlight 데스크톱·모바일로 검사한다. 기존 감사 스크립트는 세션 API에 게스트 200, 나머지 API에 503 fixture를 제공한다. 따라서 이 실행은 전체 URL의 오류·차단·복구 셸 관찰이며 정상 데이터 화면 검증과 구분한다. 실패·차단·오류·리디렉션을 개별 분류하고 회복 경로를 확인한다.
3. 공개 목록/상세, 개인 설정, 작업 목록, 집중 작업, 제작 관리, 드로잉, Admin·보호 경로의 대표 화면에서 아홉 테마를 검사한다. 강제 색상·동작 줄이기는 별도 브라우저 조건으로 확인한다.
4. URL 진입 성공에 더해 메뉴 이동, 현재 위치, 닫기와 초점 복원, 하위 페이지 복귀, 모바일 가로 넘침, GNB·본문·푸터의 정렬을 확인한다.
5. 가짜 ID로 나타난 오류·권한 차단 화면은 정상 데이터의 상세 화면 검증을 대신하지 않는다. 실제 데이터가 필요한 경로에는 승인된 테스트 fixture 또는 격리된 테스트 계정을 사용하고 해당 범위를 기록한다.
6. 기존 전수 감사의 GPU 비활성화는 드로잉·3D 동작 보증이 아니다. 사용자 요청에 맞게 드로잉 레이아웃의 유지 여부를 별도 관찰하고 런타임 전체 통과로 확대 보고하지 않는다.
7. 개발 서버의 콜드 로드, lazy route skeleton, 실행 중 HMR은 관측 시점에 영향을 준다. 전수 감사의 원본 실패를 삭제하거나 대표 표본 통과로 대체하지 않는다. 고정 소스의 production preview 결과와 진행 중인 개발 서버 전수 관찰을 구분한다.

실제 실행한 결과만 아래에 추가한다. 목록 수집이나 소스 계약 검사를 화면 검수 완료로 기록하지 않는다.

## 실행 결과

### 대표 화면·동선

- `.qa/reference-design-20260928/representative-production-final-results.json`: 변경 없는 `6cf9936ede9c6828b038e83e23b88b31b0190b3b`의 production preview에서 **26조건 통과**. 홈의 아홉 테마, 공개 마켓·학습·정책, 설정, 새 작품, 드로잉 앱 셸을 포함한다. 1440/390px를 기본으로 홈·새 작품은 320px도 관찰했다. 모든 조건의 가로 넘침, 페이지 오류, 이미지 오류, 캡처 시 표시 중인 skeleton은 0이다.
- 검색은 홈 1440/390px, 설정 1440px, 새 작품 390px의 네 진입 조건에서 각각 `Tab` 30회와 `Shift+Tab` 30회, 총 **240회** 모두 모달 내부 초점을 유지했다. 입력 초점, Escape 닫기, 원래 호출 버튼으로의 초점 복귀도 통과했다. 모달 닫힘 직후의 동기식 관측과 브라우저 초점 복원을 구분해 최대 1초 기다렸으며 검증 조건은 완화하지 않았다.
- 모바일 메뉴는 목적지가 있는 링크 **27개**와 닫기 후 초점 복귀를 확인했다. 홈의 정책·도움 링크 **8개**는 각 중심점 hit test를 통과해 고정 도크에 가려지지 않았다. 링크 목록·클릭 가능성 검증이며 27개 목적지의 모든 인증·데이터 기능이 정상이라는 의미는 아니다.
- `/studio/new`는 1440/390/320px에서 내부를 750px 스크롤한 뒤 바깥 문서 스크롤 `0`, 헤더 상단 `0`을 유지했다. 홈의 주 CTA 대비는 **17.55:1**이다.
- `.qa/reference-design-20260928/representative-css-final-results.json`: 후속 공통 CSS가 포함된 `b43e84b9cb543150d587d55a463138352ced94ee`에서 `/market` 1440/390px **2조건 별도 통과**. 당시 미커밋 변경은 API 회귀 테스트 위치와 CI 대상 목록뿐이며 웹 런타임 변경은 없었다. 표시 중인 skeleton·가로 넘침·페이지 오류·이미지 오류 0, 공통 조작 영역 44px를 확인했다. 캡처는 `representative-css-final--market-starlight-{1440,390}-viewport.png`다. 앞선 26조건 전체를 이 시점에 재실행한 것으로 합산하지 않는다.
- 최종 런타임 소스 `08e462508`의 production preview에서 3D 복구 **3조건**(390×844, 320×667, 844×390)을 별도로 통과했다. `bg3d-production-contrast-result.json`과 `bg3d-production-*.png`에 두 복구 버튼의 중심점 hit test·trial click, 가로 넘침 0, 실제 색상 대비와 정상 엔진 상태의 셀렉터 비적용을 기록했다.
- 같은 production에서 시작 안내 닫기와 템플릿 즐겨찾기 **2조건**의 44×44px 크기와 실제 닫힘·즐겨찾기 전환을 확인했다. 최종 런타임 소스 `cdbd76ce9`의 production 로비 **4조건**(온보딩·작업실 × 정상 capability·API 503)에서도 일반 wheel 스크롤, 실제 Tab 초점과 중심점 hit, 기본 scrollIntoView, trial click, TextRange 전체 표시를 모두 확인했다. 가로 넘침 0이며 정상 여백 11.2px를 유지하고 오류 안내 높이 246px만 추가했다. 결과는 `lobby-clearance-production-result.json`이다.
- 대표 검증은 게스트 세션 200, 나머지 API 503 fixture를 사용한다. 홈의 `healthy-chrome` 조건만 실제 schema에 맞는 서비스 capability fixture를 추가했다. DOM이나 CSS로 내용을 숨기지 않았으며, 집중 작업 화면은 전체 페이지 캡처의 sticky 위치 왜곡을 피하기 위해 viewport 캡처를 사용했다. 정상 운영 데이터나 GPU 편집 동작 검증은 아니다.

### 전수 관찰 결과와 원본 한계

- 첫 실행 `.qa/reference-design-20260928/all-routes-live/report.json`은 **exit 1**이며, 기대 672조건 중 관측 레코드 471개다. 데스크톱 336개와 모바일 135개 레코드 중 모바일 5개는 탐색 실패로 화면을 관찰하지 못했다. 따라서 화면 관찰 완료 범위는 데스크톱 336·모바일 130개다.
- 원본 판정은 실패 30, 경고 463이다. readiness는 ready 445, blocked 2, stalled 1, error 15, empty 3, unobserved 5이며, 콜드 로드·API 503 fixture·게스트 권한·GPU 비활성 조건을 함께 기록했다. 이 수치는 성공률이나 정상 데이터 서비스 품질로 환산하지 않는다. 원본 오류와 대비 검토 등 경고도 보존한다.
- 누락 201조건과 탐색 실패 5조건을 합친 모바일 **206조건**을 `.qa/reference-design-20260928/all-routes-recovery/`에서 관찰했다. 보충 실행도 **exit 1**, raw 실패 24·경고 203을 그대로 보존한다. 두 실행의 실제 DOM 관측을 URL·테마·viewport로 중복 제거한 `.qa/reference-design-20260928/all-routes-consolidated.json`은 **672/672조건(336 URL × PC·모바일)**이며, 첫 실행의 탐색 실패 5개는 실관측에서 제외했다. 개발 서버의 실행 중 소스 변화는 각 실행 metadata에 남아 있어 최종 고정 커밋의 빌드 보증과 구분한다.
- 통합 readiness는 ready 632, blocked 2, stalled 2, error 30, empty 6이며 raw critical 조건은 49개다. 제작 관리의 가짜 프로젝트 ID와 API 503으로 발생한 오류 30개, 3D portal의 수집 경계 밖 표시 6개, GPU 비활성에 따른 WebGL 오류 10개, 개발 서버 첫 lazy 로드 지연 3개로 분류했다. ready 판정 또한 해당 fixture의 셸 관측이며 실제 프로젝트의 정상 데이터·GPU 기능 성공을 뜻하지 않는다. 최종 소스에서 URL 수집기를 재실행해 최초 336개 목록과 추가·삭제가 모두 0임을 확인했다.
- 첫 로드가 지연된 `/create/visual-audit`, `/research/catalog`, `/studio/animation`은 데스크톱·모바일 **6조건**을 원래 readiness 20초·탐색 45초·axe·전체 스크롤 조건으로 다시 검사해 모두 ready, critical 0, exit 0을 확인했다. 최초 timeout/stalled 관측은 삭제하지 않고 후속 결과와 구분한다.
- 모바일 `/studio/bg3d`의 GPU 사용 불가 화면에서 장면 선택 힌트와 하단 sheet가 복구 버튼을 가리는 결함을 수정했다. 엔진 확인·실패 상태에만 안내·조작 표시와 예약 여백을 조정하고 복구 영역이 내부 스크롤되도록 했다. 정상 엔진의 셀렉터 비적용을 확인했으며 일반 캔버스 배치는 유지했다. `bg3d-recovery-contrast-result.json`의 **10조건**(starlight 1440/390/320×667/844×390, light·dark·contrast 1440/390)에서 두 버튼의 중심점 hit test와 trial click, 가로 넘침 0, 글자 대비 최소 **5.426:1**을 확인했다. 해당 후속 변경의 최종 production 검증·빌드·하네스 결과는 아래에 별도 기록한다.

### 자동 경고의 추가 검토

통합 관측에는 대비 판정 보류 666조건, 잘림 78조건, 작은 조작 영역 44조건, 작은 글자 27조건, 숨김 텍스트 2조건이 있다. 원본을 수정해 경고를 없애지 않았으며, `.qa/reference-design-20260928/warning-classification.md`와 `warning-focused-result.json`에 소스·실화면 판정을 분리했다.

- 잘림으로 기록된 172노드 중 169개는 반응형 스크린리더 전용 텍스트와 비초점 skip link였다. 나머지 3개 경고는 공통 복귀 링크 두 종류이며, 대표 온보딩·작업실 화면의 추가 TextRange 측정에서 글자 전체가 버튼 안에 들어옴을 확인했다. flex 축소와 padding 때문에 scrollWidth가 초과한 자동 판정의 오탐이며 텍스트를 줄이지 않았다.
- 가져오기 화면의 21개 opacity 0 노드는 내부 스크롤로 진입한 뒤 0.99~1로 표시되는 것을 확인했다. 화면에 나타나기 전 애니메이션의 초기 상태를 실제 숨김 결함과 구분한다.
- 모바일 시작 안내 닫기 34px와 템플릿 즐겨찾기 36px는 실제 폭 부족이었다. 좁은 화면·터치 환경에서만 **44×44px**로 보완하고 실제 클릭 동작을 확인했다. 드로잉의 43px 퀵모드, 데스크톱 편집기 밀도와 도구 배치는 사용자 요청에 따라 유지했다.
- 별도로 온보딩 복귀 버튼은 서비스 오류 안내가 있는 경우 일반 스크롤·Tab 초점에서도 가려지는 실제 문제가 있었다. 모바일 로비의 아래 여백과 버튼의 `scroll-margin-bottom`에 기존 `--service-status-overlay-clearance`를 반영했다. 온보딩·작업실 × 정상 capability·API 503의 **4조건**에서 일반 wheel 끝 스크롤, Shift+Tab→Tab, 기본 scrollIntoView, 중심점 hit test를 통과했다. 정상 조건의 11.2px 아래 여백은 동일하고 배너 조건에서만 실제 안내 높이 246px가 더해졌다. `lobby-clearance-dev-result.json`에 기록했으며 기존 EntryLobby 테스트 2개도 통과했다.
- 데스크톱 compact 샷 select의 20px 높이는 별도 확인이 필요한 기존 항목이다. 주변 4px 간격만으로 뒤쪽 카드 선택 영역까지 포함한 간격 예외를 입증할 수 없으므로 최소 기준 통과로 기록하지 않는다. 기존 드로잉의 9px 장르 라벨도 가독성 보완 후보로 남긴다. 이는 드로잉 도구 배치 보존 범위이며 이번 공통 셸 개편에서 일괄 변경하지 않았다.
- axe의 확정 color-contrast violation은 0개지만 incomplete 표본은 경로당 최대 12개이며 원인 정보가 제한되어 있다. 이미지·그라데이션·반투명 배경의 자동 판정 한계를 모든 대비의 통과로 해석하지 않는다. 대표 CTA와 3D 안내의 실제 대비 측정은 해당 표본에만 적용된다.

조작 영역 검사의 40/44px 제품 기준은 [WCAG 2.2의 2.5.8 최소 크기](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)의 24×24px 또는 명시된 예외와 구분한다. 이 감사는 사이트 전체 WCAG 준수 인증이 아니다.

### 단위 검사·빌드·하네스

- 관련 최종 단위 검사: **10개 파일 205개 테스트 통과**, `/tmp/toonstudio-reference-final-unit.log`. 보충 실행 `/tmp/toonstudio-reference-final-unit-extra.log`의 3개 파일 11개 통과는 별도 기록이며, 이전·후속 실행과 중복되는 테스트를 합산하지 않는다.
- `b43e84b9cb543150d587d55a463138352ced94ee`의 `pnpm run build:bundle`: **exit 0, 2분 3초**. 로그 `/tmp/toonstudio-reference-merge-build.log`. 실행 중 API 테스트 이동·CI 대상 수정만 있었고 웹 런타임 변경은 없었다. 라이선스 공지 생성과 provider-neutral CSP 확인을 통과했다. 기존 third-party 번들 경고는 남아 있으며 경고 0을 뜻하지 않는다.
- `pnpm run audit:licenses`: **exit 0**. pnpm 573항목, Vello CPU/GPU 85/137 crates, opaque WASM inventory 3개, 라이선스 원문 429개 검사 통과. 검사 도구가 기록한 루트 라이선스 파일 없는 npm 패키지 48개 정보도 유지한다.
- 이미지의 소스 파일과 `dist/brand/reference-20260928/story-world.png`는 모두 2,660,785바이트이며 SHA-256은 `0785b918e7c7a3772e654dcaae9d4dceb2cd0c1b36222cd083e73dec7368a169`로 동일하다. 빌드 복사 과정에서 원본 이미지 바이트가 바뀌지 않았다.
- `0e6954294`의 `pnpm harness:verify`: **exit 0**. 웹 전체 및 API의 세 tsconfig 타입 검사, 변경 범위 lint, 아키텍처·문서 경계, ratchet 검사 통과. 로그 `/tmp/toonstudio-reference-merge-harness-final.log`. 이 시점 이후의 수정은 아래 빌드·하네스 결과로 별도 기록한다.
- 모바일 복구·터치 영역 보완을 포함한 `08e462508600b96e4fac36f08417e94c5167c712`의 `pnpm harness:verify`도 **exit 0**이다. 로그 `/tmp/toonstudio-reference-ready-harness.log`. 해당 CSS 관련 기존 3개 파일 20개 테스트와 템플릿 2개 테스트를 별도로 통과했다.
- 같은 소스의 `pnpm run build:bundle`도 **exit 0**이며 라이선스 공지 생성과 CSP 검사까지 통과했다. 로그 `/tmp/toonstudio-reference-ready-build.log`. 빌드 중 후속 수정은 감사 문서에만 있었다.
- 복귀 버튼 가림 보완을 포함한 최종 런타임 소스 `cdbd76ce909ed68a03f6829e43b8d45ec6991fdd`의 `pnpm run build:bundle`은 **exit 0, 1분 52초**, 라이선스 공지·CSP 통과이며 `pnpm harness:verify`도 **exit 0**이다. 로그는 `/tmp/toonstudio-reference-final-navigation-build.log`, `/tmp/toonstudio-reference-final-navigation-harness.log`다. 이후 커밋은 검증 결과 문서화이며 해당 런타임 소스와 구분한다.
- 위 빌드는 로컬 검증 산출물이다. 운영 배포는 실행하지 않았으며, 원격 PR CI·main 병합 결과를 대신하지 않는다.

### 기존 main CI 실패 복구

- 기존 main `147befa4e`의 CI run `36388973114`에서 실패한 foundation/product shard는 새 마이그레이션 0094~0096이 누락된 고정 fixture와 가구 목록을 실제 상대 URL로 호출하는 테스트에서 발생했다. 테스트 5개 파일을 수정해 실파일 **96개**, bootstrap 포함 ledger **97개**의 명시적 계약을 맞췄다. 신규 SQL의 실제 파일·순서·트랜잭션·잠금 제한·비파괴성·scope·참조 제약을 유지하고, 가구 목록만 정상 빈 응답으로 제공했다. 관련 **9개 파일 217개 테스트 통과, unhandled 오류 0**이며 개수 검증 삭제·skip·자동 추종으로 완화하지 않았다.
- DB 준비 job의 `there is no parameter $1`은 CHECK DDL에 최대 배치 수 36이 bind parameter로 들어간 실제 스키마 오류였다. 기존 패턴에 따라 신뢰된 컴파일 시점 상수만 SQL 리터럴로 처리해 동일한 36개 제약을 유지했다. 0094 마이그레이션은 수정하지 않았다. 도메인이 소유하는 `studio-virtual-space-decoration.schema.test.ts`와 CI 대상 목록에 회귀를 넣어 `PgDialect/getTableConfig` 결과의 bind parameter 부재, 리터럴 36, SQL 정본 일치를 검사한다.
- 새로 만든 격리 PostgreSQL 17에서 DB 준비와 **20개 trigger** 설치를 확인하고, CI와 동일한 통합 검사 **5개 파일 187개 테스트**를 통과했다. 운영 DB는 변경하지 않았다. 위 shard·DB 결과는 각각의 검증 범위이며 UI 단위 테스트와 합산하지 않는다.

### PR #2170 후속 검증과 복구

- 최초 PR HEAD `7fc763243`의 번들 검사는 app entry 21개(상한 19), BG3D 활성화 94개(상한 92)로 실패했다. 기준 main `147befa4e`의 동일 CI build job은 17/90으로 성공했으므로 이번 변경에서 생긴 회귀로 판정했다. 공통 브랜드 마크가 컬렉션 아이콘 4개를 정적으로 불러오는 의존성을 `toonstudio-mark.tsx`로 분리했다. 기존 함수 본문·DOM·이미지·class·aria·컬렉션 기능과 기존 export를 보존했고 Vite 분할 정책·예산·baseline은 바꾸지 않았다.
- `421639a30`의 브랜드 변경을 포함한 재빌드에서 **app 17개, BG3D 90개**, `pnpm run check:studio-bundle` **exit 0, 회귀 0**을 확인했다. 로그 `/tmp/toonstudio-reference-brand-leaf-bundle-budget.log`, 변경 전후 manifest는 `.qa/reference-design-20260928/manifest-{before,after}-brand-leaf.json`이다. 출력에 포함되는 2026-09-14 시작 시점 런타임 관측은 오래된 별도 자료이며 이번 정적 측정의 런타임 성능 결과로 사용하지 않는다.
- 홈의 접근성 이름은 기존 `ToonStudio 홈` / `ToonStudio home`을 복구하고 `/studio`의 `내 프로젝트` / `My projects` 구분을 유지했다. 원격에서 실패했던 기존 `StudioWorkspaceRedesign` 테스트는 수정 없이 통과했다. 관련 **7파일 38테스트**와 변경 lint를 통과했다.
- 원격 hiring·full diagnostic는 전체 bootstrap의 0095 단계에서 복합 기본키 이름 불일치로 실패했다. CHECK DDL 수정으로 그 앞 단계가 통과한 뒤 드러난 후속 결함이다. 스키마의 기본키 이름만 기존 0095와 동일한 `studio_virtual_space_decoration_layout_pkey`로 명시하고 열·순서·기존 SQL을 보존했다. 회귀는 수정 전 **1 실패·3 통과**, 수정 후 **4 통과**다.
- 새 격리 PG17에서 전체 bootstrap의 동일 오류를 재현한 뒤 새 DB에서 성공을 확인했다. **19 adopted·76 applied**, 두 번째 적용 **0 applied·96 checksum-verified skips**, ledger **97행 모두 applied**, 기본키 정본 일치와 **20개 Studio trigger**를 직접 확인했다. 같은 DB의 CI 통합 **5파일 187테스트**도 통과했고 로컬 DB 서버를 정상 종료했다. 로그는 `/tmp/toonstudio-reference-pk-*.log`, 실행 명령·대상은 `toonstudio-reference-pk-bootstrap-{red,green}.json`에 보존한다. 운영 DB 변경은 없다.
- 브랜드 분리와 PK 보완을 포함한 소스의 `pnpm harness:verify`는 **exit 0**(`/tmp/toonstudio-reference-release-harness.log`)이며 웹 재빌드는 **exit 0, 1분 56초**, CSP·라이선스 통과(`/tmp/toonstudio-reference-brand-leaf-build.log`)다. 빌드 시작 시 HEAD는 `7fc763243`에 확정된 웹 수정이 적용된 상태였고, 동일 웹 소스는 `421639a30`에 커밋했다. 뒤의 `b3ddc0594`는 API 기본키·회귀만 변경한다. 이전 PR HEAD의 통과 결과를 갱신된 HEAD의 CI 성공으로 사용하지 않는다.

### 탐색·오류 복구 후속 회귀

- 갱신된 PR의 foundation 실패 7건은 가구 선택기를 실제로 마운트하는 두 테스트에 목록 응답 fixture가 없던 문제였다. 기준 main의 동일 상대 URL 오류도 확인했다. 두 fixture를 정상 빈 목록으로 고정하고 실제 제품의 네트워크 거절도 국소적으로 처리했다. 기존 목록을 유지하고 한·영 안내와 사용자가 누르는 목록 재시도를 제공하며, 패널 종료·이전 요청 취소 뒤 응답은 적용하지 않는다. 업로드 자동 재시도나 전역 오류 억제는 없다.
- 위 문제는 수정 전 기존 두 파일의 assertion 8개가 통과해도 **unhandled 7개로 exit 1**, 새 오류 복구 테스트는 **2개 실패·unhandled 2개**로 재현됐다. 수정 후 관련 **4파일 21테스트, unhandled 0개**를 통과했다. 이어 실제 core foundation 명령도 **37개 dependency-free 검사 및 411파일 7,595테스트 PASS / exit 0**다. 로그는 /tmp/toonstudio-reference-foundation-final.log다.
- 검색 탭 테스트는 선택 상태 변경과 requestAnimationFrame의 실제 초점 이동 사이에 Tab을 보내던 경쟁이었다. 실제 작품 탭 초점까지 기다리자 원격과 같은 실패가 재현됐다. 빈 작품 범위의 마지막 탭에서는 모달 처음으로 순환하는 것이 맞으므로, 중간 Tab의 기본 동작 보존과 양 끝 순환을 각각 검증했다. 검색 제품 소스는 바꾸지 않았고 **2파일 22테스트**를 통과했다.
- 모바일 드로잉에서 오류 안내가 지우개 설정 버튼의 클릭을 가로채는 문제를 실제 production 화면에서 재현했다. 열린 draw 시트의 stacking context 아래로 오류 안내를 배치했다. 경고 문구·표시·포인터 동작을 보존하고 시트를 닫으면 원래 계층으로 돌아온다. 수정 후 개발 화면의 정상 지우개 클릭·선택 상태·중심 hit와 경고 펼치기, 관련 **6개 회귀**를 통과했다. 최종 production에서도 1440/390px 시작 안내 정상 닫기, 390px 지우개 선택·중심 hit, 시트 종료 후 경고 z-index 0→40 복원과 정상 펼치기를 확인했다. 결과는 .qa/reference-design-20260928/overlay-live-production-final-results.json이다.
- 소개 페이지의 구형 앵커가 늦은 글꼴·헤더 재배치 뒤 가려지는 원격 tablet 관측을 복구했다. 제목이 초점을 유지하는 동안에만 위치를 보정하고, 사용자의 wheel·touch·pointer·keyboard 조작 또는 다른 컨트롤 초점 이후에는 화면을 되당기지 않는다. 페이지 종료 시 예약 프레임과 관측을 해제한다. 기존 탐색 및 새 늦은 재배치·사용자 의도 회귀를 포함한 **3파일 57테스트**를 통과했다.

- 복구 기록 삭제 어댑터가 저장소 삭제를 현재 문서 초기화로 보고해 이미 닫은 시작 안내를 다시 기다리던 문제를 고쳤다. 동일 production에서 실제 삭제 버튼·확인 버튼을 눌러 문서 ID·내용 유지, 복구 저장소 삭제, 캔버스 표시를 확인했다. 기존 어댑터는 같은 20초 전체 제한에서 실패했고 수정 후 통과했다. 실제 새 문서의 안내 닫기를 요구하는 readiness 계약은 유지했다. 관련 **4파일 44테스트**를 통과했다.
- 최종 산출물에서 원래 브러시 명령의 desktop/perfect-marker 단일 시나리오도 자체 preview를 사용해 **exit 0, 1/1**, select→paint→undo→redo 및 UI 카탈로그 대조, 오류 0을 확인했다. 전체 도구·long·shapes·내구성 검증으로 합산하지 않는다. 외부 preview 5195를 지정한 선행 실행의 API 502로 인한 exit 1도 원로그에 보존한다.
- 웹 런타임 소스 a27ba81f0을 포함한 통합 production build는 **2분 4초 / exit 0**, CSP·라이선스 통과다. 전체 타입·변경 lint·경계 검사인 하네스도 **exit 0**이며 번들 gate는 기존 기준 그대로 **app 17개 / BG3D 90개 / 회귀 0**이다. 로그는 /tmp/toonstudio-reference-ci-recovery-{build,harness,bundle}.log다. 후속 검증 스크립트·문서 변경은 이 웹 산출물과 구분한다.

- 공개 홈을 개인 workspace로 찾던 검사와 모바일에서 의도적으로 접힌 보조 여정 바를 요구하던 검사는 기준 main에서도 이미 현재 UI와 달랐다. 공개 홈의 실제 5개 시작·8개 모듈·검색 복귀, 개인 /home의 원래 계약, 모바일 하단 5개 목적지·전체 메뉴의 동등한 이동을 모두 검사한다. 새 닫힌 details의 lazy 이미지는 실제 가시성으로 구분하고, 직접 펼친 후 이미지 로딩과 접기·초점 복귀를 별도 검증한다. 정책 페이지는 공통 공개 셸을 유지하되 홍보 패널이 없음을 검사한다.
- 최종 production a27ba81f0에서 공개 경로 **42/42 PASS**, 실제 상호작용·오류 주입 **22/22 PASS**, 원래 소개 앵커 검사 **4/4 PASS**다. 앵커는 desktop/tablet/mobile/English small mobile에서 구형 주소·지연 이미지·뒤로/앞으로·동일 fragment 재진입·44px 동작을 확인했다. .qa/reference-design-20260928/ci-triage-7fc/의 final-production 원장에 기록한다. 수정 전 CI 실패와 개발 서버 지연 로그는 보존하며 이 조건들을 기존 672와 중복 합산하지 않는다.

### 초기 검증 기록

다음은 후속 수정 전의 초기 근거다. 위에 기록한 소스별 결과를 대체하거나 테스트 총수에 더하지 않는다.

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
