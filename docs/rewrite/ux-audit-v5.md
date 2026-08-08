# ToonStudio UI/UX 동선 감사 — V5 §15 수용 기준 실측

- 감사 일자: 2026-08-08
- 감사 대상 워크트리: `/Users/hjunkim/WebstormProjects/toonspectrum/.claude/worktrees/toonstudio-v11-codex-master-23fdef`, 브랜치 `claude/toonstudio-v11-codex-master-23fdef`
- 기준 문서: `docs/architecture/ToonStudio_최종공유본_초확장_멀티엔진_제품기능_UIUX_성능품질_아키텍처_V5_2026-08-07.md:533-660`
  (§15 표 12기준 · §15.1 레이아웃 · §15.2 Workspace Profiles 12종 · §15.3 메뉴 · §15.4 CommandRegistry)
- 정량 측정치: `tests/benchmarks/results/ux-audit.json`
- 성격: **감사 전용. 소스 무수정.** 이 문서는 재구성 웨이브가 착수할 근거만 만든다.

## 0. 방법과 한계

| 항목 | 내용 |
| --- | --- |
| 브라우저 실측 | Playwright chromium(`channel=chrome`, headless) + vite dev `127.0.0.1:5199`, 게스트로 `/studio` 진입 |
| 뷰포트 | 데스크톱 1440×900, 모바일 390×844 |
| 코드 실측 | 전 항목 grep/파일 열람. 모든 판정에 `파일:라인` 병기 |
| 한계 1 | **시간 지표는 vite dev(비번들) 기준의 상한선**이다. cold run은 vite dep-optimizer 때문에 캔버스 DOM 진입까지 18,999ms였고 warm run은 1,569ms였다. 본문은 warm 값을 대표로 쓴다. |
| 한계 2 | `§15.3`은 과업 지시상 "16개 메뉴"였으나 문서 실제 `####` 헤딩은 **17개**다(File·Edit·View·Canvas·Layer·Select·Transform·Brush·Filter·Vector·Text & Balloon·Comic & Story·Animation·3D & Physics·Collaboration·Window·Help). 본 감사는 17개 기준으로 셌다. |
| 한계 3 | 스크린리더 실사용·tremor 프로파일 사용성은 코드 존재 여부만 확인했다(둘 다 부재). |

---

## 1. 12기준 충족 현황표

| # | V5 §15 원칙 | 수용 기준 | 판정 | 핵심 실측치 |
| --- | --- | --- | --- | --- |
| 1 | 첫 작업 | 30초 안에 첫 획, 포맷 선택 강요 금지 | **부분** | 포맷 강요 없음 ✅ / 첫 획까지 9.0s ✅ / **첫 획 앞에 강제 2동작** ❌ |
| 2 | CSP 전환 | 파일·브러시·단축키·Workspace 가져오기 | **부분** | PSD·ABR·ORA ✅ / `.clip`·`.sut` `bridge-only` / **단축키·Workspace 가져오기 0** |
| 3 | 명령 일관성 | 단일 CommandID, 중복 구현 금지 | **미충족** | CommandRegistry **import 사이트 0** / **7개 ID 네임스페이스** / zoom-in 7중복 |
| 4 | 1–2–3 규칙 | 매 획 1 · 자주 2 · 관리 3 | **부분** | 대표 15개 중 **10 통과 / 5 실패** |
| 5 | 포인터 거리 | 브러시 80 / 선택 180 / 레이어 행 120px | **미충족** | **예산 10개 전부 초과.** 최근접 컨트롤 **388px** |
| 6 | 진행 공개 | 숨은 실패 금지 | **부분** | 저장·동기화 상시 노출 ✅ / **GPU 강등·저장 실패·쿼터 초과 무고지** |
| 7 | Progressive disclosure | 기본 5~9개 속성 | **미충족** | 인스펙터 속성 탭 **33개** 노출 / 5개 패널 중 1개만 충족 |
| 8 | 장치 적응 | 장치별 Workspace override | **미충족** | 프로파일 7/12, **device override 필드 자체가 없음** |
| 9 | Undo 신뢰 | preview/transaction/undo | **부분** | undo ✅ / preview·transaction ❌, 네이티브 `confirm()` 10곳 |
| 10 | 도움말 | F1/툴팁/영상/HelpGraph + 용어 alias | **미충족** | F1 ❌ HelpGraph ❌ 영상 ❌ / **용어 alias 8개 중 2개만 검색** |
| 11 | 접근성 | 캔버스 외 UI WCAG gate | **부분** | 접근명 100% ✅ 대비 0실패 ✅ / **모달 포커스 트랩 부재**, 24px 미만 타깃 15개 |
| 12 | 오류 복구 | GPU loss/탭 종료/저장소 압박 시 Safe Mode | **미충족** | **Safe Mode 코드 0건.** 복구 모듈 3종 dead code |

**집계: 충족 0 / 부분 6 / 미충족 6.**

---

## 2. 항목별 실측

### 2.1 첫 획 30초 — **[부분]**

측정(warm, 1440×900, 게스트):

| 지표 | 값 |
| --- | --- |
| 내비게이션 → `<canvas>` DOM 진입 | **1,569ms** |
| 내비게이션 → UI 정착 | 5,570ms |
| 내비게이션 → 첫 획 커밋 완료 | **9,027ms** |
| 첫 획 앞 필요 사용자 동작 | **2회** (획 포함 3회) |
| 포맷 선택 강요 | **없음** — 게스트 상태로 `무제 / 1페이지 / 작업공간=스토리보드` 문서가 자동 생성 |

30초 예산 자체는 통과한다. 문제는 **"게스트 상태로 즉시 캔버스"** 정신을 두 가지가 막는다는 것이다.

1. **온로드 모달이 캔버스를 덮는다.** `elementFromPoint(canvasCenter)`가 `BUTTON[aria-label="빠른 시작 닫기"]`(`class="pointer-events-auto absolute inset-0 … bg-canvas/25 backdrop-blur-[…]"`)를 반환한다. `aria-modal="true"` 다이얼로그(520×396)와 캔버스 전면(924×856) backdrop이 함께 뜬다. Escape 이후에야 `elementFromPoint`가 `CANVAS`가 된다.
2. **기본 도구가 브러시가 아니다.** 로드 직후 `aria-pressed="true"`인 도구는 `선택 (V)`이다. 사전 동작 0회로 캔버스를 드래그하는 대조 실험에서 undo 버튼이 활성화되지 않았다 — 획이 남지 않는다.

즉 실제 동선은 `모달 해제 → 펜 전환 → 드래그`다. 아이러니하게 모달 본문이 "도구를 열면 바로 캔버스에서 작업해요"라고 안내한다.

### 2.2 1–2–3 규칙 — **[부분] 15개 중 10 통과**

| 명령 | 등급 | 실측 동작수 | 경로 / 근거 | 판정 |
| --- | --- | --- | --- | --- |
| 실행취소 | 매 획 ≤1 | 1 | `⌘Z` 하드코딩 `StudioPage.tsx:23821` / 상단바 버튼 | ✅ |
| 펜 전환 | 매 획 ≤1 | 1 | `B` / 툴레일 `studio-main-menu-groups.ts:1005-1012` | ✅ |
| 지우개 전환 | 매 획 ≤1 | 1 | `E` / 툴레일 | ✅ |
| 브러시 크기 | 매 획 ≤1 | 1 | `[`·`]` `studio-drawing-shortcuts.ts:268-275` | ✅ |
| 불투명도 | 매 획 ≤1 | 1 | 하단바 슬라이더 | ✅ |
| 스포이드 | 매 획 ≤1 | 1 | `I` / 툴레일 — **단 Quick Deck 경로는 토글이 아니라 항상 ON**(`StudioPage.tsx:23117-23119`) | ✅(동작 불일치) |
| 색 변경 | 매 획 ≤1 | 1 | 우패널 스와치 (속성 탭 활성 시) | ✅ |
| 확대/축소 | 자주 ≤2 | 1 | `=`·`-` / 하단 뷰바 | ✅ |
| 화면 맞춤 | 자주 ≤2 | 1 | `Home` / `맞춤` | ✅ |
| 임시저장 | 자주 ≤2 | 1 | 상단바 버튼 — **메뉴가 광고하는 `⌘S`는 핸들러 없음** | ✅(광고 오류) |
| 새 레이어 | 자주 ≤2 | 2 | 우패널 `레이어` 탭 → `새 레이어` — 메인 메뉴에 항목 없음 | ✅ |
| 선택 후 변형 | 자주 ≤2 | **3** | 툴레일 `y=1003` — 1440×900 뷰포트 밖이라 스크롤 1동작 추가 | ❌ |
| 레벨(Levels) | 관리 ≤3 | **>3** | 우패널 속성 → 색보정 → 스크롤 → 섹션. `StudioImageAdjustmentsPanel.tsx:724-726`. 메뉴·팔레트·검색 어디에도 없음 | ❌ |
| 커브(Curves) | 관리 ≤3 | **>3** | 동일. `StudioImageAdjustmentsPanel.tsx:793` | ❌ |
| 클리핑 마스크 | 자주 ≤2 | **3** | 선택 → 속성 탭 → 체크박스 `StudioInspectorAside.tsx:2420-2428` | ❌ |

구조적 원인 3가지:

- **`레이어` 메뉴 그룹이 없다.** 모든 레이어 명령이 우패널 탭 전환을 강제하므로 상시 +1동작이다.
- **`필터` 메뉴 33개에 Levels/Curves/Color Balance 등 보정 명령이 없다.** 보정은 인스펙터 깊숙이만 존재하고, 4개 검색 박스 어느 곳에서도 색인되지 않는다.
- **툴레일 34개 버튼 중 19개(56%)가 1440×900 뷰포트 밖이다**(`y` 900→2004). 하위 도구는 구조적으로 +1동작이다.

### 2.3 포인터 거리 — **[미충족] 예산 10/10 초과**

캔버스 가시영역 중심 `(686, 472)` 기준. 캔버스 논리 크기 `924×1386`가 뷰포트 900보다 커서 세로 웹툰 문서는 항상 잘려 보인다.

| 예산 항목 | V5 예산 | 실측 | 최근접 컨트롤 | 판정 |
| --- | --- | --- | --- | --- |
| 브러시 HUD | 80px | **388px** (기하중심 기준 122px) | 하단 드로우 옵션바 | ❌ |
| 브러시 크기 | 80px | **423px** | 브러시 크기 슬라이더 (1091,859) | ❌ |
| 브러시 불투명도 | 80px | **555px** | (1227,859) | ❌ |
| 펜 도구 버튼 | 80px | **488px** | 툴레일 (198,240) | ❌ |
| 색 스와치 | 80px | **534px** | (1187,553) | ❌ |
| 사각 선택 | 180px | **495px** | 툴레일 (198,818) | ❌ |
| 올가미 선택 | 180px | **522px** | 뷰포트 밖 | ❌ |
| 선택 후 변형 | 180px | **556px** | 뷰포트 밖 | ❌ |
| 레이어 행 동작 | 120px | **614px** | 레이어 탭 활성 후 (1270,281) | ❌ |
| 레이어 탭 자체 | 120px | **668px** | (1269,146) | ❌ |

**캔버스 중심에서 가장 가까운 인터랙티브 요소 자체가 388px다.** 즉 "손이 닿는 반경"에 어떤 명령도 없다. 커서를 따라오는 HUD·라디얼 메뉴·근접 팝오버가 전무하고, 모든 명령이 화면 가장자리 크롬에 고정돼 있다. 이 항목은 부분 개선이 아니라 **온캔버스 명령 표면 신설**이 필요하다.

### 2.4 명령 일관성 (CommandID 단일화) — **[미충족]**

**`packages/studio-command-registry`는 제품 코드에서 import 사이트가 0이다.**

- 클래스 정의: `packages/studio-command-registry/src/index.ts`(83줄). 헤더 주석(`:1-5`)이 V5 규칙을 그대로 적어 놓았다.
- 전 파일 타입 grep 결과 참조는 `package.json:138`(deps 선언), `pnpm-lock.yaml:114-116,512`, `scripts/verify-studio-engine.mjs:109,140`(디렉터리 존재만 확인), 자체 테스트뿐이다. `src/`·`apps/`·`components/`·`lib/`에 import/require 0건.

§15.4 인터페이스 대비 구현률:

| 필드 | 상태 |
| --- | --- |
| `id` | ✅ |
| `labels: LocalizedLabel[]` | ❌ (`title: string` 단일) |
| `aliases: TerminologyAlias[]` | ❌ |
| `availability(ctx)` | 근사 (`when?()` boolean) |
| `preview?(ctx)` | ❌ |
| `execute(ctx)` | 근사 (`run()`) |
| `undo?: UndoFactory` | ❌ |
| `helpNodeId` | ❌ |
| `permissions?` | ❌ |

**9개 필드 중 3개 근사, 6개 부재.**

레지스트리 자리를 **7개의 서로 호환되지 않는 ID 네임스페이스**가 대신한다.

| 네임스페이스 | 파일:라인 | 개수 |
| --- | --- | --- |
| 메뉴 item id (표시/테스트용, 디스패치는 `onSelect` 클로저) | `studio-main-menu-model.ts:11-28` | 85 클로저 |
| `STUDIO_EDIT_MENU_COMMANDS` (label+shortcut 문자열만, `run` 없음) | `studio-edit-controls.ts:6-111` | 15 |
| `STUDIO_SHORTCUT_ACTIONS` (사용자 커스터마이즈 키맵) | `studio-app-settings.ts:83-118` | 34 |
| `QUICK_ACTION_IDS` (라디얼) | `studio-quick-actions.ts:19-35` | 16 |
| `STUDIO_QUICK_ACCESS_COMMAND_IDS` (⇧Q 팔레트) | `studio-quick-access-integration.ts:10-28` | 18 |
| `StudioCompanionCommandName` | `studio-tools-companion.ts:107-112` | — |
| `StudioLayerNavigatorAction` (판별 유니온) | `StudioLayerNavigator.tsx:82-115` | 20 |

단축키 리졸버도 **6개**가 순차 실행된다: `StudioPage.tsx:23498-24236`(마스터, `matchStudioShortcut` 27회 + **하드코딩 chord 24개**), `studio-view-controls.ts:672-701`(9), `studio-edit-controls.ts:251-275`(11), `studio-drawing-shortcuts.ts:210-277`(12), `studio-pixel-selection-history.ts:687`, `StudioHybridDccViewport.tsx:1506-1590`(~13).

#### 중복 구현 실측 목록

| 명령 | 사이트 수 | 유형 | 근거 |
| --- | --- | --- | --- |
| **zoom in** | 7 | **DUP-LOGIC** | `studio-main-menu-groups.ts:600-608`, `StudioPage.tsx:23868`, `:23765`, `StudioToolBeltContent.tsx:1497`, `StudioCanvasViewport.tsx:1875` / `:2128` / `:4300` — 동일 식 `setZoom((c)=>stepStudioViewZoom(c,1))` 7회 복붙, 공통 핸들러 없음 |
| **zoom out** | 7 | DUP-LOGIC | 위와 대칭 |
| **펜/지우개 전환** | 8 | **DUP-LOGIC, 부수효과 4갈래** | `StudioPage.tsx:36705-36707` / `:23566-23573` / `:23914-23925` / `:23112-23116`, `StudioLeftToolRail.tsx:402-411,674,698`, `StudioToolBeltContent.tsx:1000-1005`, `StudioMobileEditingDock.tsx:1466,1511`, `studio-companion-tool-command-executor.ts:38-47`. 속성패널 열기 / eyedropper 해제 / `drawingShortcutStateRef` 갱신 유무가 경로마다 다르다 |
| **eyedropper** | 4 | **DUP-LOGIC + 동작 버그** | 키보드 `I`(`StudioPage.tsx:23581-23586`)와 툴레일(`StudioLeftToolRail.tsx:787-793`)은 토글, Quick Deck·라디얼(`StudioPage.tsx:23117-23119`)은 **항상 ON** |
| **delete** | 7 | DUP-LOGIC | 키보드 경로(`StudioPage.tsx:24030-24058`)만 말풍선 포인트 / 픽셀 영역 / 엘리먼트 3분기를 갖는다 → `Del` ≠ 컨텍스트 메뉴 `삭제` |
| **brush size** | 8 | DUP-LOGIC + 클램프 2원화 | `studio-brush-library.ts:184` `[1,80]` vs `studio-draw-ux.ts:17` `{min:1,max:80}` |
| **fit to screen** | 9 | SHARED-FN | 단축키 경로만 `announceDrawingShortcut` 추가 |
| **undo** | 8 | SHARED-FN | `STUDIO_SHORTCUT_ACTIONS`의 `undo`(`studio-app-settings.ts:104`)는 **dead** — 실제로는 `StudioPage.tsx:23821` 하드코딩이라 재매핑이 먹지 않는다 |
| **export/download** | 4 | DUP-LOGIC | 메뉴는 `setExportMenuOpen(true)`, 메뉴바는 `setExportMenuOpen(o=>!o)` — 같은 "명령"이 다른 의미 |

부수 결함:

- **dead 키맵 엔트리 3개**: `undo`·`redo`·`tool-hand`(`studio-app-settings.ts:104,105,85`). 설정에서 바꿔도 아무 일도 안 일어난다.
- **광고만 되고 바인딩이 없는 단축키**: `⌘S`. 메뉴(`studio-main-menu-groups.ts:237`)와 Quick Access deck 모두 `⌘S`를 표시하지만 `KeyS`+meta 핸들러가 없다. 합성 `keydown` 디스패치 결과 `defaultPrevented=false`로 재확인했다.
- **chord 충돌**: `⇧S`를 view 리졸버(`studio-view-controls.ts:698` 보기 저장)와 drawing 리졸버(`studio-drawing-shortcuts.ts:259` 크기 잠금)가 동시에 주장하고, view가 먼저 실행되므로 **크기 잠금은 도달 불가 dead code**다. `Q`는 quick mask(`StudioPage.tsx:23732`)와 grayscale(`studio-view-controls.ts:695`)이 충돌하며, 메뉴(`studio-main-menu-groups.ts:703`)와 도움말(`StudioShortcutsHelp.tsx:96`)이 **서로 다르게 문서화**돼 있다.
- **팔레트 2개 모두 레지스트리 미파생**: 글로벌 `⌘K`는 라우트 10개 하드코딩(`components/command-palette.tsx:22-72`)으로 **에디터 명령이 0개**인데 `AppShell.tsx:142`에서 스튜디오에도 마운트된다. `⇧Q` Quick Access는 별도 18개 하드코딩 카탈로그(`studio-quick-access-integration.ts:64-207`)이고, 실측 deck 슬롯은 10개였다.
- 결과적으로 **수기 유지 명령 목록이 5개**다: 메뉴 85 / 팔레트 18 / 라디얼 16 / 키맵 34 / 도움말 37행. 명령 하나를 추가하려면 5곳을 고쳐야 한다.
- **Voice 명령 표면은 존재하지 않는다**(음성 관련 코드는 WebRTC 음성채팅·TTS 낭독뿐).

### 2.5 Progressive disclosure — **[미충족]**

기본 상태 문서 전역 실측: **가시 컨트롤 83개 / 가시 인터랙티브 170개**. 우패널 기본 상태만 컨트롤 29 · 인터랙티브 57.

| 패널 | 파일 | 기본 노출 | Advanced 구획 | 5~9 충족 |
| --- | --- | --- | --- | --- |
| 드로우 옵션바 | `StudioDrawOptionsBar.tsx` | **13** | ✅ `:296`·`:1005`·`:1122` | ❌ |
| 인스펙터 · 속성(이미지 선택) | `StudioInspectorAside.tsx:1719-3285` | **33** | ❌ (탭 게이팅만) | ❌ |
| 도구 속성 팔레트(그리기) | `StudioInspectorAside.tsx:3484-3811` | **13 그룹 / 35 리프** | ❌ | ❌ |
| Brush Studio | `StudioBrushStudio.tsx` | 0 (런처 버튼) | ✅ 모달+탭, 21 Range + 6 Toggle 분산 | ✅ |
| 이미지 보정 | `StudioImageAdjustmentsPanel.tsx` | 28섹션 중 **6개만 open** | ✅ `:575-621` | ✅(섹션 단위) |

인스펙터 속성 탭 33개의 내역은 하단 액션바에만 버튼 15개(`:3194-3283`), 위치·크기 입력 6개(`:2499-2551`), 혼합 모드 select 16옵션(`:2450-2476`), 확장 블렌드 3개(`:2478-2492`) 등이다. 이 파일에는 `showAdvanced`/`<details>`/아코디언이 **하나도 없다**.

도구 속성 팔레트는 `studio-drawing-palettes.ts:56-62`에서 `collapsed: { "sub-tools": false, "tool-properties": false }` — **두 팔레트 모두 기본 펼침**이다.

"모드가 달라도 동일 명칭" 요구를 만족하는 단일 진실원천은 `studio-retouch-help.ts:1-14` 하나뿐이고, 대상은 리터치 도구 4개(smudge·wet-mix·dodge-burn·liquify)에 한정된다. 5~9 예산을 강제하는 테스트는 레포에 없다.

### 2.6 Workspace Profiles — **[미충족] 7 / 12**

현행 정의: `src/domains/creator/studio-workspaces.ts:337` `STUDIO_DEFAULT_WORKSPACES` — `스토리보드(:339)` `선화(:349)` `채색(:359)` `대사·레터링(:369)` `검수(:379)` `게시(:389)` `프로 만화(:399)`.

| V5 §15.2 프로파일 | 현행 대응 | 상태 |
| --- | --- | --- |
| Quick Sketch | — | 미구현 |
| CSP Migration | — | 미구현 |
| Pen Display | — | 미구현 |
| Mobile Draw | — | 미구현 (`mobileControlSide` 좌/우손 필드만: `:137`,`:429`,`:654-665`) |
| Comic Production | 프로 만화 | 근사 |
| Paint Studio | 채색 | 근사 |
| Vector Design | — | 미구현 |
| Photo Edit | — | 미구현 |
| Animation | — | 미구현 |
| Pose & 3D | — | 미구현 |
| Collaboration Review | 검수 | 근사(리뷰 세션 개념 없음) |
| Presentation/Publish | 게시 | 근사 |

**정확 일치 0 · 근사 4 · 부재 8**, 스펙에 없는 자체 프로파일 3(스토리보드·선화·대사·레터링).

축이 다르다. V5는 **작업 성격 × 장치**로 프로파일을 나누는데, 현행은 **웹툰 제작 파이프라인 단계**로 나눈다. 그 결과 §15의 "장치 적응 — Pen Display/Mobile/Keyboard/Mouse/Touch별 Workspace override" 요구가 구조적으로 표현 불가능하다. `studio-workspaces.ts` 전수 확인 결과 레이아웃 필드는 `desktop`(패널 열림/폭)과 `mobileControlSide`뿐이고 device override 개념이 없다.

`StudioCompanionWorkspacePresets.tsx:26,34,42,50`의 4개(`draw`·`navigate`·`review`·`reference`)는 멀티 디스플레이 보조창 전용이라 §15.2 프로파일이 아니다.

### 2.7 메뉴 구조 커버리지 — **[미충족] 17개 중 5개 그룹만 대응**

현행: `src/domains/creator/studio-main-menu-groups.ts` — **8그룹 / 116항목**.

| 그룹 | 정의 라인 | 항목 수 |
| --- | --- | --- |
| 파일 | `:230` | 10 |
| 편집 | `:330` | 20 |
| 삽입 | `:500` | 11 |
| 보기 | `:596` | 31 |
| 필터 | `:880` | 33 |
| 그리기 | `:1003` | 6 |
| AI | `:1061` | 3 |
| 도움말 | `:1091` | 2 |

커버리지 표:

| V5 §15.3 그룹 | 현행 | 상태 | 비고 |
| --- | --- | --- | --- |
| File | 파일 | 이름 다름·부분 | Publish Package · 포맷 호환성 보고서 · 복구 센터 · 프로젝트 권리 BOM 없음 |
| Edit | 편집 | 이름 다름·부분 | History Branch · Automation Recipe · Input Device Calibration 없음. 반대로 레이어 순서 명령 4개가 Edit에 잘못 들어가 있음 |
| View | 보기 | 이름 다름·부분 | 31항목으로 가장 두껍지만 Proof/ICC Soft Proof · Onion Skin · Performance HUD · Safe Mode 없음 |
| Canvas | — | **부재** | 크기·해상도·색공간·크롭·세로 캔버스·그리드/자/퍼스·대칭·Seamless |
| Layer | — | **부재** | 전 항목. 레이어 명령은 우패널에만 존재 |
| Select | — | **부재** | 선택 명령은 툴레일에만 존재 |
| Transform | — | **부재** | Mesh Warp · Puppet Warp · Repeat Transform 등 |
| Brush | 그리기(6) | 축소판 | Brush Studio는 인스펙터 깊숙이. Preset Browser · Brush DNA · SUT/ABR 임포트 · Fidelity Lab 메뉴 진입점 없음 |
| Filter | 필터 | 이름 다름·양호 | 33항목. Adjustment Layer · Filter Gallery · EffectGraph Editor · Bake/Proxy 없음 |
| Vector | — | **부재** | |
| Text & Balloon | — | **부재** | 삽입 그룹에 `말풍선`·`텍스트` 2항목만 산재 |
| Comic & Story | — | **부재** | Page Manager는 좌측 페인에 존재하나 메뉴 없음 |
| Animation | — | **부재** | |
| 3D & Physics | — | **부재** | 삽입 그룹에 3D 4항목 산재 |
| Collaboration | — | **부재** | 협업 기능은 있으나(팀 작업공간 버튼) 메뉴 없음 |
| Window | — | **부재** | Workspace Profile·Quick Deck·Action Bar 전환이 `보기` 그룹에 섞여 있음 |
| Help | 도움말(2) | 심각 미흡 | Command Search · CSP/Photoshop 용어 검색 · 장치·브라우저 진단 · 복구 가이드 · License/Attribution · Bug Report Package 전부 없음 |

**그룹 커버리지 29.4%(5/17).** 스펙에 없는 자체 그룹 3개(삽입·그리기·AI)가 존재하며, 이 셋이 Canvas/Layer/Select/Transform/Text/3D 자리를 애매하게 흡수하고 있다.

### 2.8 용어 alias 검색 — **[미충족]**

통합 Command Search가 없다. 대신 **서로 다른 4개의 부분 검색 표면**이 있다.

| 검색 표면 | 파일:라인 | 코퍼스 |
| --- | --- | --- |
| 단축키 도움말 검색 | `StudioShortcutsHelp.tsx:280-296` | 35행 |
| Quick Access 팔레트(⇧Q) | `studio-quick-access.ts:628-646` | 18 명령 |
| 인스펙터 네비게이터 | `studio-inspector-layout.ts:263-277` | 12 라우트 (명령 실행 아님, 탭 이동) |
| 튜토리얼 허브 | `StudioFeatureTutorialHub.tsx:132-143` | 32 튜토리얼 |

전용 terminology alias 레이어는 없다. 존재하는 것은 수기 동의어 3벌뿐이다 — `StudioShortcutsHelp.tsx:20-21 searchAliases`(35행 중 **7행만** 채워짐), `studio-quick-access-integration.ts:74-205 keywords`, `studio-inspector-layout.ts:154-220 keywords`.

경쟁 제품 용어 실측(8개 중 2개 적중 = **25%**):

| 질의 | 결과 |
| --- | --- |
| Bucket fill / 페인트 버킷 | ✅ 3개 인덱스에 존재 |
| 레이어 마스크 | ✅ 인스펙터 검색만 |
| 선택 범위 (CSP) | ❌ 코드 주석에만 존재(`StudioPage.tsx:27533`) |
| Clipping / 클리핑 | ❌ 기능은 `StudioInspectorAside.tsx:2420-2428`에 있으나 어떤 인덱스에도 없음 |
| Sub tool / 서브 도구 | ❌ 라벨은 `StudioDrawingPaletteOptions.tsx:41-43`에 있으나 검색 불가 |
| Auto action | ❌ |
| Levels / 레벨 | ❌ |
| Curves / 커브 | ❌ |

`studio-brush-alias-profile.ts`는 이름과 달리 **용어 alias가 아니라 브러시 렌더 파라미터 프로파일**이다(`studio-outline-stroke-contract.ts:254`에서 `diameterScale`로 소비).

부가 도움말 요구: **F1 바인딩 없음**(`?`만, `studio-app-settings.ts:117`), **HelpGraph/`helpNodeId` 코드 0건**, **짧은 영상 0건**(창작자 UI의 `<video>`는 웹캠 피드 하나뿐). 있는 것은 툴팁 16개(`studio-tool-hints.ts`)와 튜토리얼 32개(`studio-feature-tutorials.ts`)다.

**CSP 전환(기준 2) 별도 판정**: PSD(`studio-psd-import.ts`)·ABR(`studio-abr-import.ts`)·ORA는 구현됐고 손실 미리보기 UI(`StudioInterchangeLossPreviewDialog.tsx`)까지 있다. 반면 `.clip`·`.sut`는 `studio-interchange-capabilities.ts:1132-1150`에서 `import: "unsupported"`, `status: "bridge-only"`, `proprietary: true`로 **정직하게 표기**돼 있다(정확/근사 명시 요구는 이 지점에서 충족). **단축키 가져오기·Workspace 가져오기는 0건**이다.

### 2.9 접근성 — **[부분]**

데스크톱 1440×900(캔버스 외 UI):

| 항목 | 실측 | 판정 |
| --- | --- | --- |
| 가시 인터랙티브 | 98 | — |
| 키보드 포커스 가능 | 81 (`tabindex=-1` 12) | 양호 |
| **접근명 누락** | **0** | ✅ 우수 |
| 대비(WCAG AA) | 52개 텍스트 노드 검사, **실패 0** | ✅ (OKLCH 토큰을 canvas 2d로 rgb 해석 후 계산) |
| 타깃 24×24 미만 (WCAG 2.2 AA 2.5.8) | **15 / 97** | ❌ |
| 타깃 44×44 미만 | 57 / 97 | 참고 |
| **모달 포커스 트랩** | **부재** | ❌ 심각 |

포커스 트랩 실측: 온로드 `빠른 시작` 다이얼로그는 `aria-modal="true"`인데 **Tab 1회 만에 포커스가 다이얼로그 밖 `크리에이티브 모드` 버튼으로 빠져나간다.** Tab 26회 중 다이얼로그 내부에 머문 정지점이 0이었다. WCAG 2.1 2.4.3 및 `aria-modal` 계약 위반이다.

24px 미만 타깃 15개는 대부분 좌측 페이지 페인의 아이콘 버튼이다: `1페이지 이름·콘티 메모 편집`(18×18), `위로/아래로 이동`(18×18), `맨 위로/맨 아래로`(14×14, 13×14), `이 앞에/뒤에 빈 페이지 삽입`(18×18), `페이지 복제`·`미러 복제`·`내용 비우기`·`페이지 삭제`(18×18). **`페이지 삭제` 같은 파괴적 명령이 18×18px**이라는 점이 특히 문제다.

모바일 390×844: 가시 인터랙티브 64(뷰포트 내 36), **44×44 미만 0**, 온로드 모달 없음 — 모바일 쪽은 오히려 기준에 근접한다.

**tremor 프로파일은 `src/domains/creator` 전수 grep 0건**으로 부재다.

### 2.10 오류 복구 / Safe Mode — **[미충족]**

**"Safe Mode"는 제품 코드에 존재하지 않는다.** `src`·`apps`·`packages` 전수 grep에서 실제 히트는 무관한 지역 변수뿐(`safeModelRuntimeKey`, `StudioLiquifyPanel.tsx:143` `const safeMode = normalizeStudioLiquifyMode(mode)`). Safe Mode는 V5 문서(`:548`,`:586`,`:858`,`:1189` 등)에만 있다.

| 경로 | 사용자 노출 | 근거 |
| --- | --- | --- |
| 메인 2D 캔버스 WebGPU device loss | **없음(무음)** | `StudioWebGpuCanvas.tsx:76/245/487` → `StudioCanvasViewport.tsx:3791` → `StudioPage.tsx:12116-12121`. `failOverGpuAuthorityAfterSurfaceLoss`(`:12062-12079`)로 canvas2d 강등. 토스트·배너·안내 없음 |
| WebGPU 필터 런타임 loss | 없음(무음) | `studio-engine-webgpu-filter-runtime.ts:680-682`, `:1202-1208` |
| Hybrid DCC 3D 뷰포트 WebGL lost | **있음** | `StudioHybridDccViewport.tsx:1244-1257` 리스너, `role="alert"` 오버레이 `:2012-2020` |
| 메인 문서 자동저장 실패/쿼터 | **없음(무음)** | `StudioPage.tsx:9674-9721`, 최종 실패는 `console.error`(`:9720`)뿐 |
| OPFS 쿼터 감지 | 없음(무음) | `studio-opfs-filesystem.ts:27,318-319,387-390` / `studio-opfs-recovery-journal.ts:994-995` — 메시지가 UI에 닿지 않음 |
| 앱 설정 영속화 불가 | 있음(좁음) | `StudioAppSettingsPanel.tsx:915-931` `role="alert"` + 재시도 |
| Hybrid DCC session-only 강등 | 있음(좁음) | `StudioPage.tsx:4931-4946` → `StudioHybridDccDialog.tsx:23,143` |
| 3D 샷 배치 쿼터 저하 | 있음(좁음) | `studio-bg3d-shot-batch-recovery-store.ts:766-767` → `StudioBg3dViewPanel.tsx:832-833` |
| 탭 종료 경고 (`beforeunload`) | **부재** | 전수 grep 0건 |
| `pagehide` 긴급 플러시 | 내부만 | `StudioPage.tsx:13861`, `:13868-13872` |
| **세션 복구 배너** | **있음** | `StudioPage.tsx:9809-9840` 감지 → `StudioCanvasStatusRail.tsx:321-356` `복구하기`/`비우기` + JSON 백업 탈출구(`:334`). 배너가 떠 있는 동안 자동저장을 억제(`:9591`)해 복구본 덮어쓰기를 막는다 |
| 명명 체크포인트 | 있음 | `StudioCheckpointPanel.tsx:84`, `StudioPage.tsx:37547-37592` |

**가장 아픈 발견 — 복구 기계장치 3종이 전부 배선되지 않은 dead code다.**

- `studio-device-loss-recovery.ts:323` `createDeviceLossRecovery` — 테스트 외 소비자 0. `healthy → lost → retrying → recovered | permanently-demoted` 상태기계(`:199-205`)가 제품에서 한 번도 돌지 않는다.
- `studio-gpu-fabric.ts:221,256,316` — 테스트 외 소비자 0.
- `studio-opfs-recovery-runtime.ts` — importer 0. `cleanupQuota`(`:93,:467`) 미가동.

즉 **"문서 의미 손실 없이 품질만 낮춘다"는 동작 자체는 부분적으로 일어나지만(Konva 폴백·자동저장 억제), 사용자에게 한 번도 고지되지 않는다.** V5가 금지한 "숨은 실패"에 정확히 해당한다.

### 2.11 진행 공개 — **[부분]**

노출되는 것: 상단 `임시저장`·`게시하기`, 우상단 동기화 상태 버튼(44px, "안전하게 동기화됨. 같은 출처 탭끼리 연결되었습니다…"). 저장·동기화는 상시 가시이고 방해도 하지 않는다 — 이 부분은 잘 만들어졌다.

노출되지 않는 것(= 숨은 실패): **메인 캔버스 GPU 강등**, **메인 문서 자동저장 실패**, **OPFS 쿼터 초과**. GPU/변환 상태 표시기가 없다.

### 2.12 Undo 신뢰 — **[부분]**

Undo/Redo/작업 내역은 갖춰져 있다. 그러나 V5가 요구하는 **preview / transaction / undo 3종** 중 preview와 transaction이 없다. 파괴적 명령의 안전장치는 네이티브 `globalThis.confirm()` 10곳이다: `StudioPage.tsx:22409`, `:22454`, `:22484`, `:25989`, `:26324`, `:26342`, `:26405`, `:37569`, `:37583`, `:39035`. 브라우저 모달이라 미리보기가 불가능하고 캔버스를 가린다.

`CommandDefinition`에 `preview?`·`undo?: UndoFactory` 필드가 아예 없다(`packages/studio-command-registry/src/index.ts:14-23`) — 명령 계층 재구성 없이는 이 기준을 만족시킬 수 없다.

---

## 3. 갭 목록 — 재구성 작업 항목

우선순위 = 사용자 영향(1~5) × 구현 비용(1~5, 낮을수록 싸다). P0는 영향이 크고 다른 갭의 선행 조건인 것.

| # | ID | 갭 | 영향 | 비용 | 우선 | 선행 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **G-CMD** | CommandRegistry 미배선. 7 ID 네임스페이스·6 단축키 리졸버·5 수기 명령 목록·중복 구현(zoom 7 / 펜전환 8 / eyedropper 동작불일치) | 5 | 5 | **P0** | — |
| 2 | **G-MENU** | §15.3 17그룹 중 12그룹 부재(Layer·Select·Transform·Canvas·Brush·Vector·Text·Comic·Animation·3D·Collaboration·Window) | 5 | 3 | **P0** | G-CMD |
| 3 | **G-DIST** | 포인터 거리 10개 예산 전부 초과. 최근접 컨트롤 388px. 온캔버스 명령 표면 부재 | 5 | 3 | **P0** | G-CMD |
| 4 | **G-SAFE** | Safe Mode 부재 + 복구 모듈 3종 dead code + GPU/저장 실패 무고지 | 4 | 2 | **P0** | — |
| 5 | **G-DISC** | Progressive disclosure 위반. 인스펙터 속성 33개, 5패널 중 1개만 충족 | 4 | 3 | P1 | G-CMD(명칭 SSOT) |
| 6 | **G-ALIAS** | 용어 alias 레이어 부재. 8개 질의 중 2개 적중. 통합 Command Search 없음 | 4 | 2 | P1 | G-CMD |
| 7 | **G-FIRST** | 첫 획 앞 강제 2동작(온로드 모달 캔버스 차단 + 기본 도구가 선택) | 4 | 1 | P1 | — |
| 8 | **G-A11Y** | 온로드 모달 포커스 트랩 부재, 24px 미만 타깃 15개(파괴적 명령 포함) | 3 | 1 | P1 | — |
| 9 | **G-WS** | Workspace Profiles 7/12, 장치별 override 필드 자체 부재 | 3 | 3 | P1 | G-MENU |
| 10 | **G-RAIL** | 툴레일 34개 중 19개(56%)가 1440×900 뷰포트 밖 | 4 | 2 | P1 | G-DIST |
| 11 | **G-UNDO** | 파괴적 명령 네이티브 `confirm()` 10곳, preview/transaction 없음 | 3 | 3 | P2 | G-CMD |
| 12 | **G-KEYFIX** | dead 키맵 3개(undo/redo/tool-hand), 미바인딩 `⌘S`, `⇧S`·`Q` chord 충돌, 도움말·메뉴 문서 불일치 | 3 | 1 | P2 | G-CMD |
| 13 | **G-CSPIN** | CSP 단축키·Workspace 가져오기 0건 (파일/브러시는 있음) | 2 | 3 | P2 | G-CMD, G-WS |
| 14 | **G-HELP** | F1 · HelpGraph · 짧은 영상 부재, Help 메뉴 2항목 | 2 | 2 | P2 | G-ALIAS |
| 15 | **G-TREMOR** | tremor 프로파일 부재 | 2 | 2 | P3 | — |

---

## 4. 재구성 착수 순서 (다음 웨이브용)

### Wave A — 명령 계층 통일 (G-CMD, G-KEYFIX) · **모든 후속 작업의 선행**

1. `packages/studio-command-registry`를 §15.4 스펙까지 확장한다: `labels: LocalizedLabel[]`, `aliases: TerminologyAlias[]`, `availability()`, `preview?()`, `undo?: UndoFactory`, `helpNodeId`, `permissions?` 추가.
2. 7개 네임스페이스를 하나의 `CommandId` 유니온으로 흡수한다. 흡수 순서는 **키맵(34) → 메뉴(85) → Quick Access(18) → 라디얼(16) → Companion → LayerNavigator(20)**. 키맵을 먼저 하는 이유는 dead 엔트리 3개와 chord 충돌 2건이 즉시 드러나기 때문이다.
3. 단축키 리졸버 6개를 레지스트리 조회 1개로 대체하고 `StudioPage.tsx:23498-24236`의 하드코딩 chord 24개를 제거한다.
4. **경계 테스트를 먼저 깐다**: (a) 모든 메뉴 항목이 `commandId`를 갖는다 (b) 같은 `commandId`를 두 곳에서 `register`하면 실패한다 (c) 도움말 표·메뉴 표·키맵이 전부 레지스트리에서 파생된다 (d) 광고된 단축키에 반드시 핸들러가 있다(`⌘S` 회귀 방지).
5. 회귀 검증 표적: zoom-in/out 7사이트, 펜/지우개 8사이트의 **부수효과 4갈래**를 하나로 합칠 때 어느 것을 정본으로 삼을지 먼저 결정한다(속성패널 자동 열기 여부가 핵심 결정).

### Wave B — 값싸고 즉효 (G-FIRST, G-A11Y, G-KEYFIX 잔여)

- 온로드 모달을 비모달 코치마크로 바꾸거나, 최소한 캔버스 backdrop을 걷어내고 포커스 트랩을 넣는다.
- 기본 도구를 펜으로 바꾸거나, 모달의 "2. 그리기" 버튼이 실제로 펜을 활성화하고 닫히게 한다.
- 좌측 페이지 페인 아이콘 버튼 15개를 24×24 이상으로 키운다(`페이지 삭제` 우선).

### Wave C — 명령 표면 재배치 (G-MENU, G-DIST, G-RAIL)

- §15.3 17그룹으로 메뉴를 재구성한다. Layer·Select·Transform·Canvas 신설이 1–2–3 규칙 실패 5건 중 4건을 직접 해소한다.
- 온캔버스 명령 표면을 신설한다(커서 추종 브러시 HUD ≤80px, 선택 컨텍스트 바 ≤180px, 레이어 행 인라인 액션 ≤120px). 이것 없이는 §15 포인터 거리 기준을 만족할 수 없다.
- 툴레일을 그룹 접기 또는 2열로 바꿔 1440×900에서 전량 가시화한다.

### Wave D — 정보 밀도와 검색 (G-DISC, G-ALIAS, G-HELP)

- 인스펙터 속성 탭을 기본 5~9 + Advanced Inspector로 쪼갠다. `StudioImageAdjustmentsPanel.tsx:575-621`의 `AdjustmentSection` 패턴이 이미 레포 내 정답이므로 그것을 인스펙터에 이식한다.
- `aliases`를 CommandDefinition에서 읽어 CSP/Photoshop/Krita/Procreate 용어 사전을 채우고, 4개 검색 박스를 레지스트리 기반 단일 Command Search로 합친다. 최소 커버리지 목표는 이번 실측 8개 질의 100%.

### Wave E — 신뢰성 (G-SAFE, G-UNDO, G-WS)

- **dead code 3종을 먼저 배선한다.** `studio-device-loss-recovery.ts` + `studio-gpu-fabric.ts` + `studio-opfs-recovery-runtime.ts`는 이미 작성·테스트가 끝나 있고 소비자만 없다. 여기에 사용자 고지 UI(상태 레일 확장)를 붙이면 Safe Mode의 8할이 완성된다.
- 파괴적 명령 10곳의 `confirm()`을 `preview()` + 트랜잭션 undo로 교체한다.
- Workspace Profiles를 §15.2 12종 + 장치 override 축으로 재설계한다.

---

## 5. 부록 — 참고 자료

- 정량 원본: `tests/benchmarks/results/ux-audit.json`
- 선행 감사(경계값): `docs/rewrite/current-studio-boundary.md`
- 주요 실측 대상 파일
  - `src/domains/creator/studio-main-menu-groups.ts` (8그룹/116항목/85 `onSelect`)
  - `src/domains/creator/studio-main-menu-model.ts:11-28` (`StudioMainMenuItem` — `commandId` 없음)
  - `src/domains/creator/studio-workspaces.ts:337` (7 프로파일)
  - `src/domains/creator/StudioInspectorAside.tsx:1719-3285` (속성 33개)
  - `src/domains/creator/StudioDrawOptionsBar.tsx:296,1005,1122` (Advanced 구획 — 좋은 사례)
  - `src/domains/creator/StudioImageAdjustmentsPanel.tsx:575-621` (progressive disclosure 정답 패턴)
  - `src/domains/creator/StudioCanvasStatusRail.tsx:321-356` (세션 복구 UI — 좋은 사례)
  - `packages/studio-command-registry/src/index.ts` (import 사이트 0)
  - `src/domains/creator/studio-device-loss-recovery.ts` / `studio-gpu-fabric.ts` / `studio-opfs-recovery-runtime.ts` (dead code)
