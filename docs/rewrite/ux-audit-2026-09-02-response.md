# ToonStudio /studio UI/UX 정밀 분석(2026-09-02) 반영 기록

- 원문: ChatGPT 공유 대화 "UI UX 분석 개선사항" (`https://chatgpt.com/share/6a971801-41a4-83e8-8f06-e0c034acb196`)
- 반영 일자: 2026-09-02 · 브랜치 `claude/chatgpt-share-analysis-75d1d0`
- 선행 감사: `docs/rewrite/ux-audit-v5.md`(2026-08-08). 이번 원문은 그 감사 이후 개편된 메뉴·검색·인스펙터를
  다시 읽고 **정본이 어디인지 알 수 없는 문제**를 핵심으로 지목했다.
- 성격: 원문의 P0·P1·P2 항목 하나하나에 대해 **적용 / 부분 적용 / 보류**를 소스 위치와 함께 적는다.
  보류 항목은 이유와 다음 단계를 남긴다 — 조용히 빠지는 항목이 없게.

## 0. 원문 주장의 코드 대조

원문은 배포본을 직접 클릭하지 못했고 소스 계약으로 판정했다고 밝혔다. 반영 전에 각 주장을 실제 소스와 대조했다.

| 원문 주장 | 대조 결과 |
| --- | --- |
| 18개 상위 메뉴가 한 행에 안 들어가 오버플로 메뉴가 뜬다 | 사실. `studio-main-menu-presentation.ts` 가 9+9 두 티어로 18개를 내보내고 `StudioMenubarContent` 가 실측 오버플로를 그렸다. |
| 도움말이 마지막이 아니다 | 사실. 익숙한 티어의 마지막(9번째)이고 뒤에 전문 티어 9개가 이어졌다. |
| canonical 메뉴 순서와 presentation 순서가 따로 관리된다 | 사실이나 의도적 설계. §15.3 카탈로그(17+AI)는 커버리지 계약이고 표시 순서는 프레젠테이션 계층이 맡는다. 이번에도 카탈로그는 건드리지 않았다. |
| Figma형 위치·크기 패널이 밀도 계약 밖에서 항상 렌더링 | 사실. `StudioFigmaDesignPanel` 이 X·Y·W·H·회전·불투명도+버튼 3개를 선택 즉시 최상단에 그렸고, 밀도 표는 그 값들이 `element.layout` 에 접혀 있다고 기록했다(실제로는 기울이기만 남아 있었다). |
| 이미지 탭 5개를 밀도 계산에서 컨트롤 1개로 취급 | 사실(`element.pixel-tools`, leaves 1). DOM 계수는 탭을 `chrome` 으로 따로 센다. |
| 통합 명령 검색이 대부분의 명령을 실행하지 못한다 | 사실. 명령 행은 도움말을 연다(배지 "도움말"). CommandRegistry 실행 배선은 `command-consolidation-plan.md` 3단계로 남아 있다. |
| 모바일에서 통합 검색 트리거를 숨긴다 | 사실(`hideTrigger={isMobile}`). F1 만 남고 눈에 보이는 진입점이 없었다. |
| 전역 검색과 인스펙터 내부 검색이 중복 | 사실. 내비게이터가 자체 `input[type=search]` 와 결과 목록을 따로 가졌다(전역 색인의 부분집합). |
| canonical 이미지 탭 순서 ≠ 표시 순서 | 사실. 모델 quick→fill→retouch→mask→transform, 표시 quick→fill→transform→retouch→mask. |
| 불투명 / 투명도 / 불투명도 혼재 | 사실. 위치·크기 패널이 필드 "불투명", 부제 "투명도" 를 썼다. |
| 인스펙터 라벨 하드코딩 한국어 | 사실. 내비게이터 전체가 리터럴이었다. |
| inspector layout 을 localStorage 에 기억해 타입 전환 시 이전 하위 탭 잔존 | 사실. 정책 재검토는 보류(아래 §3). |

## 1. 적용한 항목

### P0

| # | 원문 | 적용 | 위치 |
| --- | --- | --- | --- |
| P0-1 | 실제 DOM 기반 인스펙터 밀도 검증 | **부분 적용.** `data-inspector-priority`(essential·contextual·advanced·chrome)·`data-inspector-control-id` 계약과 순수 계수기·감사기를 추가했다. 규칙: essential > 9, 같은 control id 두 번 노출, 접힘 밖의 advanced, 사유 없는 disabled, 우선순위 미선언. 격리 마운트 가능한 표면(내비게이터 7상태, 위치·크기 단일/다중·접힘/펼침)은 jsdom 계약 테스트로 고정했다. 전체 인스펙터 상태(텍스트·말풍선·이미지·프레임·그리기)는 페이지 모델이 필요해 브라우저 검증기 몫으로 남겼다. | `studio-inspector-dom-density.ts`, `studio-inspector-dom-density.test.tsx` |
| P0-2 | 위치·크기 패널 축소 | **적용.** 필수 행은 불투명도 하나, 변형은 `X 120 · Y 840 · 640×320 · 0°` 요약 한 줄. 펼치면 X·Y·W·H·회전·확대·좌우/상하 반전 그리드. 열림 상태는 다른 섹션처럼 기억되고 `selection.geometry` 딥링크는 자동으로 펼친다. 밀도 표를 실제 렌더에 맞췄다(opacity 출처, skew 행, `selection.geometry` 8 leaves). | `StudioFigmaDesignPanel.tsx`, `studio-selection-geometry-summary.ts`, `studio-inspector-density.ts` |
| P0-3 | 검색 표면 통합 + 명칭 | **적용.** 인스펙터 내부 검색을 제거하고 그 버튼이 통합 다이얼로그를 '현재 패널' 범위로 연다. 다이얼로그에 범위 칩(전체·현재 패널·명령·도움말)과 "전체에서 N건 보기" 폴백을 넣었다. 명칭은 "기능·설정 찾기"(F1). 행 우측 동작 배지(이동·도움말·튜토리얼·선택 필요·열 수 없음)는 기존 그대로다. | `StudioCommandSearchDialog.tsx`, `StudioCommandSearchHost.tsx`, `studio-command-search-scope.ts`, `studio-help-center-channel.ts` |
| P0-4 | 모바일 검색 진입점 | **적용.** 하단 작업 공간 도크에 '찾기' 버튼. 같은 채널로 같은 다이얼로그를 연다. | `StudioMobileEditingDock.tsx` |
| P0-5 | 상단 메뉴 18 → 12, 도움말 마지막 | **적용.** `파일 · 편집 · 보기 · 삽입 · 레이어 · 선택 · 그리기 · 만화 · 필터 · 도구 · 창 · 도움말`. 삽입 = 텍스트·벡터, 도구 = 캔버스·변형·애니메이션·3D·협업·AI. 복합 메뉴 안에서 출처 그룹마다 캡션과 구분선. 카탈로그·항목 id·핸들러·로케일 경로·§15.3 커버리지 테스트는 무변경. 원문이 제안한 11개와 다른 점: 필터(52항목)는 독립 메뉴로 남겼고, 협업은 별도 공유 패널 대신 도구 메뉴의 한 구획으로 두었다. | `studio-main-menu-presentation.ts`, `StudioMainMenu.tsx`, `StudioMenubarContent.tsx` |

### P1

| # | 원문 | 적용 | 위치 |
| --- | --- | --- | --- |
| P1-6 | 인스펙터 기본 탭 3개(대상·레이어·문서), 작품 정보 → 게시 시트 | **적용(변형).** 탭은 대상·레이어·문서. 작품 정보는 상시 탭이 아니라 게시 CTA·파일 메뉴·검색이 여는 **게시 준비 모드**로, 내비게이터가 "편집으로 돌아가기"를 보여 준다. 별도 시트 대신 기존 라우트(`primary: "publish"`)를 유지해 딥링크·게시 워크스페이스·저장 흐름을 깨지 않았다. | `studio-inspector-layout.ts`(`STUDIO_INSPECTOR_PRIMARY_TABS`), `StudioInspectorNavigator.tsx` |
| P1-7 | 패널 너비 적응형 | **부분 적용.** 기본 폭 280 → 320. 420px 이상이면 대상 속성 아래에 레이어 목록을 함께 그린다(탭 왕복 제거). 타입별 권장 폭(텍스트 340~380, 이미지 고급 380~480)의 자동 전환은 보류. | `studio-workspace-layout-metrics.ts`, `StudioInspectorAsideShell.tsx` |
| P1-8 | 좌측 레일: 직접 조작 도구 vs 작업공간 실행기 | **적용.** 실행기(3D 인형·캐릭터·배경, Hybrid DCC, 참고 이미지, 프레임 애니메이션)는 모서리 ↗, 점선 각진 테두리, `aria-haspopup="dialog"`. 레일을 두 열로 쪼개지는 않았다 — 순서·단축키·도달성 계약을 그대로 두는 편이 안전했다. | `studio-chrome-ui.tsx`(`launcher`), `StudioLeftToolRail.tsx` |
| P1-9 | 프로젝트 작업창 → 프로젝트 센터 | **보류.** §3 참고. | — |
| P1-10 | CommandRegistry 실행 정본 | **보류.** 기존 계획(`command-consolidation-plan.md` 3-1~3-4단계)이 있고 이번 범위 밖이다. 검색 행의 정직한 배지는 유지. | — |

### P2

| # | 원문 | 적용 | 위치 |
| --- | --- | --- | --- |
| P2-11 | 필터 갤러리 | **보류.** 52항목 평면 목록은 그대로다. | — |
| P2-12 | 텍스트·말풍선 속성 세분화 | **적용(텍스트).** 타이포그래피 15개 → 글꼴(5)·외형(9)·고급 조판(2), 문단(정렬·세로 쓰기·자간·행간·맞춤)은 한 곳. 정렬 이중 노출 제거. 말풍선 순서 재배치(대사 편집 최상단, 꼬리·글자·변형 순)는 보류. | `StudioInspectorTypographySection.tsx`, `StudioInspectorSelectionSection.tsx` |
| P2-13 | 용어 통합 | **적용.** 불투명/투명도 → 불투명도(canonical 상수 사용), 속성 패널/작업 패널 → 작업 패널, 탭 페이지 → 문서, 검색 경로 `인스펙터 › 속성` → `인스펙터 › 대상`, 문서 하위 탭 라벨 "문서 설정". "빠른 수정 → 빠른 이미지" 는 보류(검색 색인·튜토리얼·검증기 전반에 걸친 이름이라 별도 회차). | 여러 파일 |
| P2-14 | 카드·테두리·작은 글씨 감소 | **부분 적용.** 손댄 표면(내비게이터·위치·크기·검색 호스트·시작 안내)에서 0.52~0.7rem 을 11px 하한으로 올렸고 내비게이터 테스트가 하한을 고정한다. 카드 중첩 축소는 보류. | — |
| P2-15 | 사용 로그 기반 기본값 | **보류.** 텔레메트리 없음(밀도 표 머리말 그대로). | — |

### 원문 결함표 대비

| 결함 | 상태 |
| --- | --- |
| Figma형 위치·크기 패널 밀도 계약 밖 렌더링 | 해소 |
| 밀도 표 `element.layout` 모델 ≠ 실제 | 해소 |
| 이미지 탭 5개 = 컨트롤 1개 계산 | DOM 계수에서 `chrome` 으로 분리 계수(표의 leaves 1 은 유지 — 탭 내부는 이미 점진 노출) |
| 통합 명령 검색 실행 불가 | 미해소(보류 P1-10), 배지로 정직하게 표시 |
| 모바일 통합 검색 트리거 숨김 | 해소 |
| 전역 검색 ↔ 인스펙터 검색 중복 | 해소 |
| 이미지 탭 canonical ≠ 표시 순서 | 해소(단일 정본에서 파생) |
| 불투명/투명도/불투명도 혼재 | 해소 |
| 도움말이 마지막 아님 | 해소 |
| 인스펙터 라벨 하드코딩 한국어 | 부분 해소 — 내비게이터 문구를 `studio.inspector.*` 키 + 한국어 폴백 표로 옮겼다. 팩에 키가 실리면 그 번역이 이긴다. 모바일 도크의 마지막 리터럴(페이지·내보내기)은 팩 키로 교체했다. 다른 섹션은 그대로. |
| 레일 도구/실행기 동일 문법 | 해소 |
| 프로젝트 작업 팝오버 = 대형 허브 | 미해소(보류) |
| inspector layout 기억 → 타입 전환 시 하위 탭 잔존 | 미해소(보류) |
| canonical 메뉴 순서 ≠ presentation 순서 | 의도적 분리 유지(프레젠테이션 테스트가 12개 순서를 고정) |

## 2. 수용 기준 현황

| 항목 | 원문 기준 | 현황 |
| --- | --- | --- |
| 상단 메뉴 | 1280px 무스크롤 | 12개 타이틀. 실측 오버플로 감지·메뉴는 그대로 있어 좁은 창에서도 복구된다. 1280px 실브라우저 재측정은 남았다. |
| 상위 메뉴 수 | 12개 이하 | 12 ✓ |
| 도움말 위치 | 항상 마지막 | ✓(`studio-main-menu-presentation.test.ts`) |
| 인스펙터 기본 너비 | 최소 320px 권장 | 기본 320 ✓(최소 240 유지) |
| 인스펙터 첫 화면 | 상호작용 요소 5~9개 | 위치·크기 패널 기준 필수 1 + 크롬 1(접힘) / 펼침 9. 전체 상태는 브라우저 계수 필요 |
| 인스펙터 상단 크롬 | 데스크톱 96px 이하 | 내부 검색 제거·캡션 sr-only·탭 3개로 축소. 픽셀 실측은 남았다 |
| 중복 검색 | 화면당 하나 | ✓ |
| 이미지 하위 탐색 | 320px 숨은 가로 탭 없음 | 3+2 그리드 ✓ |
| 명령 검색 | 비파괴 명령 90% 직접 실행 | ✗(보류 P1-10) |
| 레이어↔속성 전환 | 클릭 1 또는 단축키 | 탭 1클릭 ✓, 420px+ 에서는 동시 표시 |
| 비활성 컨트롤 | 사유 확인 가능 | DOM 감사 규칙(`disabled-without-reason`)으로 고정 |
| 모바일 터치 타깃 | 44×44 | 유지(`min-h-11`) |
| 주요 용어 | 같은 개념 동일 명칭 | 불투명도·작업 패널·문서·대상 통일 |
| 회귀 테스트 | 상태별 DOM 밀도 검사 | 격리 표면 ✓, 전체 상태는 검증기 몫 |

## 3. 보류 항목과 다음 단계

1. **CommandRegistry 실행 정본(P1-10).** 메뉴·레일·단축키·검색이 하나의 `execute(context)` 를 쓰게 하는 작업.
   `command-consolidation-plan.md` 3-1(키맵)부터. 이것이 끝나야 검색 Enter 가 비파괴 명령을 직접 실행한다.
2. **프로젝트 센터(P1-9).** 현재 프로젝트 작업창은 JSON/아카이브 백업·PSD 가져오기·Writer Room·AI 이력·
   애니매틱·권리 감사·바이블·Hybrid DCC·스냅샷·체크포인트·자동 액션 12종의 버튼 그리드다. 상태(최근 자동 저장·
   체크포인트·백업 시각)를 같이 보여 주는 넓은 시트로 승격하려면 저장·복구 파이프라인 상태 조회가 먼저 필요하다.
3. **필터 갤러리(P2-11).** 검색·미리보기·즐겨찾기·파괴 여부 표시. 필터 메뉴 52항목은 그대로다.
4. **말풍선 인스펙터 순서(P2-12 잔여).** 대사 편집을 최상단 primary action 으로, 꼬리·글자·변형 순.
5. **inspector layout 기억 정책.** 선택 타입이 바뀌면 이미지 하위 탭을 `quick` 으로 되돌릴지 결정.
6. **폭 적응형 2단계(P1-7 잔여).** 텍스트·말풍선 340~380, 이미지 고급 380~480 자동 전환.
7. **전체 상태 DOM 밀도 계수.** `scripts/verify-studio-inspector-walkthrough.mts` 에서
   `auditStudioInspectorDensity` 를 호출해 텍스트·말풍선·이미지·프레임·다중 선택·모바일 상태를 실브라우저로 센다.
8. **로케일 팩 키(잔여).** 도크·검색·도구 메뉴 키는 이번 회차에 75개 팩에 실었다. 내비게이터의 `studio.inspector.*`
   키는 아직 코드 폴백표(한국어)만 있다 — 팩에 실으면 그 번역이 이긴다.

## 4. 검증

### 4.1 같은 회차에 정리한 기존 결함(main 기준선부터 실패)

main 의 core CI 는 2026-09-01 이후 붉은 상태였다. 이 브랜치의 전체 vitest 에서 잡힌 기준선 실패를 원인별로 정리했다.

| 결함 | 원인 | 처리 |
| --- | --- | --- |
| `StudioMobileEditingDock` 로케일 테스트 | 드로잉 도구 행의 페이지·내보내기 라벨이 한국어 리터럴 | 팩 키로 교체, 8키를 75팩에 추가, 래칫 1,325→1,333 |
| 프로덕션 마이그레이션 스크립트 테스트 3종 | `0035_creator_marketplace_3d_asset_kind.sql` 이 매니페스트에 미등록(e90aadbe) | 매니페스트 등록, 래칫 34→35, 필수 전진 목록 갱신 |
| `.myb` 자산 메타데이터 테스트 | 커널 웨이브(66bc25b4)가 `hardness` 를 팁으로 매핑했는데 테스트는 미매핑을 기대 | 매핑 계약으로 갱신(미매핑 예시는 `anti_aliasing`) |
| 히스토리 세분화 계약 | 페이지 분할(d2d80130) 뒤 undo/redo 가 `function`, 사이드카 setter·수화가 컨트롤러로 이동, flush 는 `onBeforeRecordSidecar` 주입 | 마커를 합성 에디터 소스와 호스트 훅으로 재지정 |
| 포인터 시작 플랜(ink-wash) | b871ff48 이 ink-wash·inkwash-bleed-wash 를 유체 잉크 브러시로 편입 → dab 다이내믹스 제외가 의도 | bounded 목록에서 제외하고 유체 계약을 별도 단언 |
| `StudioDrawNode` 펜슬 3건 | e90aadbe 가 리본 셀을 알파 버킷별 복합 경로로 배치 → 스텁이 fill 당 마지막 서브패스만 기록 | 스텁에 서브패스 기록(`fillSubpaths`) 추가, 셀 단언을 서브패스 기준으로 |
| `StudioDrawNode` ink-wash 리테인드 워터컬러 | 유체 브러시는 커밋 렌더가 wet-ink 리플레이로 위임 | 유체 위임 단언 + 리테인드 캐리어는 비유체 `inkwash-white-ink` 로 검증 |
| 검수 진입점 뷰포트 스냅샷 | 430px 몰입 모드에서 내보내기 옵션 셰브론이 44px 타깃으로 승격됐는데 스냅샷은 이전 값 | 스냅샷 갱신 |
| `verify:studio-mobile-top`(inapp-browser CI) | 모바일 메뉴바 페이지 목록·다운로드 버튼이 42px 폭 | `min-w-11 justify-center` |
| core CI `pnpm run lint` | `scripts/qa/studio-soak-runner.mjs`(56e7148a)의 ANSI 제거 정규식이 `no-control-regex` 에 걸림 | 해당 줄만 규칙 해제(사유 인라인) |
| core CI `check:studio-bundle` | 페이지 분할 웨이브가 남긴 all-type 인라인 import(`import { type X }`) 64건이 `verbatimModuleSyntax` 아래서 런타임 edge 로 남아 comipo-assembly·scene-templates 를 Studio 정적 그래프에 되돌림(studio-gates §1 함정). vitest 가 붉어 main 에서는 이 단계까지 못 갔다 | 24파일 전부 `import type` 으로 재작성, 탐지기 0건, 로컬 재빌드 게이트 통과 |
| `verify:studio-mobile-top` 레인 넘침(320~430px) | 모바일 액션 클러스터가 44px 버튼 7개(332px)라 레인(overflow-hidden)을 넘쳐 게시하기·전체화면 종료가 잘림 | 도크가 이미 가진 페이지·다운로드 사본을 모바일에서 숨기고, 전체화면·초안 저장·게시하기 라벨을 ≤429px 에서 아이콘 전용(44px)으로 접음 |

| `studio-3d-visual` CI(2026-08-31 19:53Z 부터 적색) | ADR-0018(0520c7e1)이 BG3D 의 자동 WebGL2 mount 를 제거했는데 Playwright 스펙은 "WebGPU 가 없으면 WebGL2 로 내려간다" 를 전제 → SwiftShader 레인(WebGPU 어댑터 없음)에서 뷰포트가 "WebGPU 사용 불가" 게이트 뒤에 빈 채로 남고, 진입 경로 테스트는 "컬러 배경 추가" 가 "캡처할 3D 장면이 아직 준비되지 않았습니다" 로 닫히지 않아 실패 | 스펙에 `ensureBg3dWebGl2`(보기 탭에서 WebGL2 를 직접 선택, 배지 `WebGL2 사용 중`·게이트 부재 단언) 를 넣어 첫 열기·재열기마다 호출. 이전의 배지 검사는 `count()` 가드로 빈 뷰포트에서도 통과하던 공허 단언이었다. 엔진을 고른 뒤 CI 에 남은 마지막 비교(재열기 뒤 캔버스 ≈ 업데이트 캔버스, 칸 RGB 차 3.55 > 3)는 `waitForFrameChange` 가 돌려주는 과도기 프레임(Transformer 제거와 raster 교체 사이)과 상태 레일 알림 높이에 따른 문서 스코프 크기 변화가 원인 → 정착 기반 캡처(`waitForStableDocumentFrame`, 연속 두 샘플 같은 크기·채널차 1 미만)와 알림 단언 뒤 닫기(`dismissStudioStatusNotices`)로 레이아웃 고정. 그래도 리눅스 러너에서 두 번 연속 정확히 3.55 가 재현돼(정착·알림 제거 뒤, 시간 문제 아님 — 러너별 글꼴·레이아웃 차이로 칸 경계가 한 픽셀 이동) 계약을 presenter 영수증으로 옮김: 재열기·닫기 뒤 `expected.src`·`receipt.src` 가 업데이트 PNG 와 동일해야 하고, 화면 비교는 "삽입 raster 보다 업데이트 raster 에 가깝다"는 방향 판정으로 바꿈. 두 프레임 PNG 와 델타는 Playwright 첨부로 남김 |
| `studio-inapp-browser` CI "Open the 3D editor" 단계 | 같은 원인 — 인앱 WebView 는 WebGPU 가 차단(`inapp-browser-blocked`)되고 자동 폴백이 없어 `verify-studio-bg3d-inapp-editor.mts` 가 45초 동안 canvas 를 기다리다 실패. main 에선 앞 단계(라우트 스윕)가 먼저 깨져 이 단계가 skipped 였기 때문에 드러나지 않았다 | 검증기에 `selectWebGl2Engine`(보기 탭 → WebGL2 → `WebGL2 사용 중` 대기 → 원래 탭 복귀) 추가, 사라진 `auto` 옵션 제거, CI 주석 갱신 |
| `studio-inapp-browser` CI "Open the 3D editor" 단계 (2차, main #484 병합 뒤) | 4583af11 이 빠른 시작 코치를 비모달로 바꾸며 다른 모달이 열릴 때 스스로 물러나던 경로(`yieldToOpenModal`)를 없앰 → 라우트 `/studio/bg3d` 로 진입하면 3D 편집기 다이얼로그가 코치 위에 겹치고, 검증기의 코치 닫기 클릭은 다이얼로그 뷰포트 컨테이너에 가로막혀 30초 타임아웃 | `dismissQuickStart` 가 편집기 다이얼로그가 이미 보이면 코치를 건너뛰고(측정 대상에 영향 없음), 아니면 10초 제한으로 닫기를 시도. main 은 앞 단계(라우트 스윕·모바일 상단)가 이 PR 의 수정 없이 실패해 이 단계가 skipped 라 드러나지 않음 |

| CI `verify` 잡 (`verify:studio-3d-console`) | 메뉴바 프레젠테이션이 3D·협업을 도구 복합 타이틀로 접었는데 브라우저 검증기 3종이 최상위 `3D`·`협업` 트리거를 클릭 → 존재하지 않는 메뉴를 30초 기다리다 실패 | `verify-studio-3d-console`·`verify-studio-bg3d-physics`·`verify-studio-collab-ui` 가 도구 트리거·도구 드롭다운으로 진입(항목 id·라벨 무변경), 3D 콘솔 소스 계약 테스트도 같은 앵커로 갱신 |
| CI `verify` 잡 VRM 색 복원 (기준선 결함) | `measureStudioVrmChroma` 가 rAF 2회만 기다려 소프트웨어 래스터라이저에서 정착 전 프레임을 기준선으로 잡음(러너 0.0058 vs 복원 0.0027, 복원값은 조용한 머신의 정상값과 일치) | 세 캡처 모두 연속 두 샘플이 일치할 때까지 표본화(`measureSettledStudioVrmChroma`), 임계값은 유지 |
| CI `verify` 잡 BG3D 캔버스 (main 도 동일 실패) | ADR-0018 로 자동 mount 가 없어 캔버스가 영원히 안 보임 | 보기 탭에서 WebGL2 를 직접 선택하고 `WebGL2 사용 중` 배지를 대기 |
| main 6ddf0406(CSP 패리티) 원형 텍스트 패널 병합 | main 은 단일 타이포그래피 섹션 끝에 원형 텍스트·외곽선·자간/행간·그림자 블록을 나란히 추가 | 3분할 구조에 맞춰 원형 텍스트만 고급 조판 섹션에 편입(외곽선·그림자는 외형, 자간·행간은 문단 섹션이 이미 소유 → 중복 컨트롤 id 금지 계약). main 의 테스트는 "타이포그래피" 대신 "고급 조판" 섹션을 열도록 갱신 |
로컬 재검증(병합 트리 프로덕션 빌드): `verify:studio-mobile-top` 8/8 OK, `verify:studio-inapp-browser` 32/32 OK — 스윕이 잡던
빠른 시작 패널 390px 넘침도 같은 레인 넘침의 파생이었다. 3D 는 CI 와 같은 조건(Playwright 번들 Chromium headless, ANGLE/SwiftShader,
`navigator.gpu` 없음)에서 `verify:studio-3d-visual` 을 돌려 진입 경로 테스트 통과를 확인했다. 남은 기록 항목: `oil-ribbon impasto`
스냅샷(부하 시 간헐) 은 이번 회차 범위 밖으로 기록만 남긴다.

- 단위·계약: `pnpm vitest run` 전체(이 브랜치에서 실행).
- 기존 결함 수정: `StudioMobileEditingDock.test.tsx › renders the drawing tool row in the active locale` 는 변경 이전
  기준선에서도 실패하던 결함이었다 — 드로잉 도구 행의 페이지·내보내기 버튼이 한국어 리터럴이라 `en` 로케일에서도
  한글이 남았다. 두 버튼과 새 진입점(찾기·기능·설정 찾기), 도구 복합 메뉴 제목의 키를 75개 팩 전부에 실었고
  (미번역 로케일은 영어 pending-translation 관례), 키 수 래칫을 1,325 → 1,333 으로 올렸다.
- 타입·린트: pre-push 훅(`validate:architecture` · `tsc` · `lint-changed`).
- 브라우저 검증기 갱신: `scripts/verify-studio-inspector-walkthrough.mts`(3탭·게시 준비 모드·통합 검색 범위·3카드 코치),
  `scripts/verify-studio-native-raster-tools.mts`(캔버스 메뉴 → 도구 복합 메뉴).
