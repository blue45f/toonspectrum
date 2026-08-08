# 명령 통합 계획 (Command Consolidation Plan)

작성 2026-08-08 · Wave A 산출물
근거 문서: `docs/rewrite/ux-audit-v5.md` §2.4(갭 1 명령 일관성) ·
`docs/architecture/ToonStudio_최종공유본_초확장_멀티엔진_제품기능_UIUX_성능품질_아키텍처_V5_2026-08-07.md` §15.3·§15.4

---

## 0. 이 문서가 다루는 범위

Wave A는 **토대만** 만들었다. 실행 배선은 건드리지 않았다.

| 항목 | Wave A 상태 |
| --- | --- |
| `packages/studio-command-registry` §15.4 확장 | 완료 (하위호환) |
| `src/domains/creator/studio-command-catalog.ts` 선언 데이터 | 완료 (155 항목) |
| 충돌 표면화 `COMMAND_CONFLICTS` | 완료 (14건) |
| 커버리지·충돌·용어 역인덱스 테스트 | 완료 |
| **실제 흡수(소비자 전환)** | **미착수 — 아래 4단계** |

`StudioPage.tsx`·`studio-main-menu-groups.ts` 등 기존 소비자는 Wave A에서 **한 줄도 바꾸지 않았다.**
따라서 이 시점의 런타임 동작 변화는 0이다.

---

## 1. 현행 실측 (2026-08-08)

### 1.1 5벌 수기 목록

| 목록 | 정의 위치 | 항목 수 | 테스트 시 라이브 import |
| --- | --- | --- | --- |
| 메인 메뉴 | `studio-main-menu-groups.ts:228-1121` | **116** (8그룹) | ✗ (스냅샷 + 소스 드리프트 가드) |
| 편집 명령 테이블 | `studio-edit-controls.ts:6-111` | **20** | ✓ `STUDIO_EDIT_MENU_COMMAND_ORDER` |
| ⇧Q 빠른 액세스 | `studio-quick-access-integration.ts:10-28` | **18** | ✓ `STUDIO_QUICK_ACCESS_COMMAND_IDS` |
| 라디얼 퀵 액션 | `studio-quick-actions.ts:19-35` | **16** | ✓ `QUICK_ACTION_IDS` |
| 커스터마이즈 키맵 | `studio-app-settings.ts:82-117` | **34** | ✓ `STUDIO_SHORTCUT_ACTIONS` |
| 단축키 도움말 | `StudioShortcutsHelp.tsx:34-146` | **37행** | ✗ (스냅샷 + 소스 드리프트 가드) |

감사 문서가 "메뉴 85"로 적은 값은 **고유 `onSelect` 클로저 수**다. 항목 수 실측은 **116**이고,
차이는 필터 팩 27개가 `.map()` 으로 클로저를 공유하기 때문이다. 카탈로그는 116을 기준으로 삼았다.
`STUDIO_EDIT_MENU_COMMANDS` 도 감사 문서의 15가 아니라 **20**이었다.

### 1.2 수렴 결과

- 카탈로그 항목: **155**
- 원본 출처 링크(origins): **247** — 한 명령이 평균 1.6개 목록에 중복 등재돼 있었다는 뜻이다
- 용어 사전(aliases): **423** (CSP 107 · Photoshop 134 · Krita 112 · Procreate 51 · 자사 레거시 19)
- 커버리지: **5벌 100%** (`STUDIO_COMMAND_CATALOG_UNCOVERED` = 빈 배열)

### 1.3 네임스페이스 매핑

§15.3은 메뉴를 17그룹으로 정의한다. 카탈로그의 `CommandId` 네임스페이스는 그중 12개를 그대로 쓰고,
현행 제품에 있으나 §15.3 메뉴 그룹이 아닌 4개를 추가했다.

| 네임스페이스 | 출처 | 비고 |
| --- | --- | --- |
| `file` `edit` `view` `select` `layer` `transform` `brush` `filter` `text` `window` `help` | §15.3 그룹 | 그대로 |
| `tool` | 추가 | 도구 **활성화** 명령. §15.3은 도구를 메뉴가 아닌 팔레트로 다루므로 메뉴 그룹이 없다 |
| `color` | 추가 | 전경·배경색 조작 (`color.swap-primary-secondary`) |
| `insert` | 현행 메뉴 그룹 | §15.3은 이 항목들을 Layer / Text & Balloon / 3D & Physics 로 재분배한다 |
| `ai` | 현행 메뉴 그룹 | §15.3에 대응 그룹 없음 |
| 미사용 | `canvas` `vector` `comic` `animation` `collaboration` | 현행 제품에 대응 명령이 없어 카탈로그가 비어 있다 |

마지막 줄이 §15.3 대비 **실질 갭**이다. 메뉴 커버리지 감사(ux-audit-v5 §2.7 "17개 중 5개 그룹")와 같은 결론이다.

---

## 2. 발견한 충돌 14건

`COMMAND_CONFLICTS`에 구조화해 두었고, 단축키 유일성 테스트는 **여기 선언된 것만** 예외로 허용한다.
즉 새 충돌을 조용히 추가하는 것이 불가능하다.

### 2.1 단축키 충돌 (`shortcut-collision`) — 3건

| id | 키 | 명령 | 처리 |
| --- | --- | --- | --- |
| ~~`q-quickmask-vs-grayscale`~~ | `Q` | `select.quick-mask` ↔ `view.color-vision-grayscale` | **2026-08-08 해소** — 단독 `Q` = 퀵 마스크, 색각 검수 흑백 명암 = `⌥Q`(`⇧Q`는 빠른 액세스 팔레트가 이미 사용). 메뉴 배지·보기 리졸버·카탈로그·도움말 네 곳을 같은 값으로 맞췄고 `COMMAND_CONFLICTS`에서 제거했다 |
| `shift-s-saveview-vs-sizelock` | `⇧S` | `view.save-current-view` (+ 도달 불가 크기 잠금) | view 리졸버가 먼저 실행돼 크기 잠금은 dead code |
| `cmd-d-duplicate-vs-deselect` | `⌘D` | `edit.duplicate` ↔ `select.deselect` | **Wave A 신규 발견** — 팔레트만 복제를 ⌘D 로 광고, 메뉴는 ⌘J |

### 2.2 단축키 문서 불일치 (`shortcut-divergence`) — 2건

| id | 내용 |
| --- | --- |
| `zoom-chord-divergence` | 메뉴 `=` / `-` / `Home` vs 도움말 `⌘ +` / `⌘ −` / `⌘ 0` |
| `layer-order-chord-inversion` | **Wave A 신규 발견** — 앞으로 쌍은 Photoshop과 같은데(맨 위 `⌘⇧]`, 위 `⌘]`) 뒤로 쌍은 뒤집혀 있다(맨 뒤 `⌘[`, 뒤 `⌘⇧[`). Photoshop·CSP는 맨 뒤가 `⌘⇧[` |

### 2.3 동작 불일치 (`behavior-divergence`) — 2건

`delete-clear-vs-remove` (메뉴 `선택 제거` = 내용 지우기 ≠ 팔레트·라디얼 `선택 삭제` = 요소 삭제),
`eyedropper-toggle-divergence` (키보드·툴레일은 토글, Quick Deck·라디얼은 항상 ON).

### 2.4 ID 분기 (`id-divergence`) — 4건

`fill-id-divergence` (`tool-fill` / `draw/fill` / `fill` / `advanced-fill` 4가지 이름),
`balloon-id-divergence` (`insert/bubble` vs `add-bubble`),
`transform-tool-vs-pixel` (같은 단어, 다른 명령),
`menu-item-id-collision` (**Wave A 신규 발견** — 메뉴 항목 id는 전역 유일하지 않다. `app-settings` 가
view·edit 두 그룹에 존재한다. 그래서 카탈로그의 menu origin은 `<group>/<item>` 로 한정한다).

### 2.5 나머지 3건

`cmd-s-unbound` (`⌘S` 표시만 하고 바인딩 없음),
`dead-keymap-entries` (`undo`·`redo`·`tool-hand` 재매핑 무효),
`help-row-multiplexing` (도움말 37행 중 6행이 두 명령을 겸함 — 행 수와 명령 수가 1:1이 아닌 이유).

---

## 3. 흡수 순서

순서는 **드러나는 결함의 밀도** 순이다. 키맵이 가장 작고(34) 가장 많은 결함(dead 3 + 미바인딩 1 + chord 충돌 2)을
즉시 노출하므로 먼저 한다.

### 3-1단계 · 키맵 (34) — 가장 먼저

**목표**: `chord → CommandId` 단일 리졸버. 현재 6개 리졸버가 순차 실행된다
(`StudioPage.tsx:23498-24236` 마스터 + 하드코딩 chord 24개, `studio-view-controls.ts:672-701`,
`studio-edit-controls.ts:251-275`, `studio-drawing-shortcuts.ts:210-277`,
`studio-pixel-selection-history.ts:687`, `StudioHybridDccViewport.tsx:1506-1590`).

**작업**
1. 카탈로그의 `shortcut` 을 소스로 하는 `resolveStudioChord(chord, ctx): CommandId | null` 을 신설한다.
2. 6개 리졸버를 **삭제하지 않고** 그 앞에 새 리졸버를 둔다. 새 리졸버가 처리한 chord만 `preventDefault` 하고,
   나머지는 기존 경로로 흘려보낸다(스트랭글러).
3. 처리한 chord를 하나씩 기존 리졸버에서 제거한다. 제거 단위 = 커밋 단위.

**경계 테스트 설계**
- `chord-parity.test.ts`: 34개 키맵 액션 + 도움말 37행이 광고하는 모든 chord에 대해, 신구 리졸버가
  **같은 CommandId** 를 내는지 표 기반 대조. 신규 리졸버만 값을 내는 chord(= dead 였던 것)는 별도 목록으로 승인.
- `dead-entry.test.ts`: `undo`·`redo`·`tool-hand` 를 재매핑한 뒤 합성 `keydown` 을 디스패치해
  `defaultPrevented === true` 를 확인. 현재는 false 다.
- `unbound.test.ts`: `⌘S` 합성 keydown → `defaultPrevented === true`. 현재는 false 다.
- `chord-uniqueness.test.ts`: 리졸버 테이블에 chord 중복이 0인지. 예외는 `COMMAND_CONFLICTS` 선언분만.

**동작이 바뀌는 지점 (위험)**
- `Q`: quick mask ↔ grayscale 중 하나가 반드시 키를 잃는다. **제품 결정 필요**.
- `⇧S`: 크기 잠금이 살아나면 보기 저장이 키를 잃는다. **제품 결정 필요**.
- `undo`/`redo` 재매핑이 처음으로 실제 동작한다 → 기존에 "안 먹던" 사용자 설정이 갑자기 적용된다.
  마이그레이션: 기본값과 다른 저장값이 있으면 1회 안내 후 적용.
- `⌘S` 바인딩이 생기면 브라우저 저장 대화상자를 가로챈다 → 되돌리기 어려운 인상. 별도 커밋·별도 검증.

### 3-2단계 · 메뉴 (116 + 편집 20)

**목표**: `buildStudioMainMenuGroups` 가 라벨·단축키·비활성 사유를 **카탈로그에서 읽고**,
`onSelect` 만 호스트가 주입하는 형태로 바꾼다.

**작업**
1. `STUDIO_EDIT_MENU_COMMANDS`(20) 를 먼저 카탈로그 파생으로 교체한다. 이미 순수 데이터라 위험이 가장 낮다.
2. 그다음 8그룹을 그룹 단위로 옮긴다. 그룹당 1커밋. 필터 팩 27개는 `.map()` 구조가 이미 데이터 주도라 마지막.
3. 메뉴 항목 id를 `<group>/<item>` 로 정규화한다(`menu-item-id-collision` 때문에 필수).

**경계 테스트 설계**
- `menu-parity.test.ts`: 신구 `buildStudioMainMenuGroups` 산출물을 같은 state 로 실행해
  **(그룹 순서 · 항목 순서 · id · label · shortcut · disabled · separatorAfter)** 전 필드 대조.
  이미 있는 스냅샷 인벤토리(`STUDIO_MENU_ITEM_INVENTORY`)가 순서까지 보존하므로 그대로 기준으로 쓴다.
- `disabled-reason.test.ts`: `StudioEditAvailabilityInput` 의 각 boolean 을 한 번씩 뒤집으며
  `availability().reason` 이 기존 `unavailableReason` 과 문자열 동일한지.
- 드리프트 가드(이미 존재): 소스의 `id: "…"` 리터럴 104개가 스냅샷과 정확히 일치하는지.

**동작이 바뀌는 지점 (위험)**
- 동적 라벨 6개(`save-draft` 공동 저장 / `publish` 수정 게시 / `reset-rotation` 각도 표기 /
  `page-sequence`·`quick-access-palette`·`left-panel`·`right-panel` 열림 상태)는 **정적 라벨이 아니다.**
  `LocalizedLabel` 로는 표현되지 않으므로 `labels` + `labelFor(ctx)` 오버라이드가 필요하다. 설계 부채로 명시.
- `layer-order-chord-inversion` 정정은 사용자 키맵 마이그레이션을 동반한다. **단독 커밋**으로 분리.
- `file.export` 는 메뉴가 `set(true)`, 메뉴바가 `toggle()` 이다. 통일하면 메뉴바에서 두 번 눌러도 안 닫힌다.

### 3-3단계 · 팔레트 (⇧Q 18 + 글로벌 ⌘K)

**목표**: 두 팔레트를 모두 레지스트리 `list()` / `search()` 파생으로 만든다.
현재 `⌘K` 는 라우트 10개 하드코딩(`components/command-palette.tsx:22-72`)이라 **에디터 명령이 0개**인데
`AppShell.tsx:142` 에서 스튜디오에도 마운트된다.

**작업**
1. `⇧Q` deck 의 18개 하드코딩 카탈로그(`studio-quick-access-integration.ts:64-207`)를 카탈로그 파생으로 교체.
   `EXECUTION_INTENTS` 매핑은 그대로 두고 id만 카탈로그 id로 바꾼다.
2. `⌘K` 에 스튜디오 컨텍스트일 때 레지스트리 명령을 합류시킨다. 라우트 명령은 별도 섹션으로 유지.
3. 팔레트 표기 정정: `duplicate` 를 `⌘J` 로(`cmd-d-duplicate-vs-deselect`), `save` 의 `⌘S` 는
   1단계에서 바인딩되지 않았다면 표기 제거.

**경계 테스트 설계**
- `palette-availability.test.ts`: 기존 `StudioQuickAccessCommandAvailability` 18개 boolean 조합과
  레지스트리 `availabilityOf()` 결과가 일치하는지. 조합 폭발을 막기 위해 각 명령별 on/off 2케이스씩 36건.
- `palette-order.test.ts`: 실측 deck 슬롯이 10개였다. 카탈로그 파생 후에도 기본 10슬롯 · 같은 순서인지.
- `search-recall.test.ts`: CSP·Photoshop 용어 20개를 넣어 기대 명령이 상위 3위 안에 오는지
  (`resolveTerminology` 는 이미 테스트됨 — 여기서는 랭킹).

**동작이 바뀌는 지점 (위험)**
- `⌘K` 에 에디터 명령이 합류하면 결과 수가 10 → 165로 급증한다. 랭킹·섹션 구분 없이 합치면 **회귀**다.
  섹션 분리 + 컨텍스트 가중치를 같은 커밋에 넣어야 한다.
- 팔레트 명령의 실행은 현재 `EXECUTION_INTENTS` → quick-action 경유다. 레지스트리 `execute` 로 바꾸면
  `eyedropper` 의 "항상 ON" 동작이 토글로 바뀐다(`eyedropper-toggle-divergence`). 의도된 변경이지만 릴리스 노트 대상.

### 3-4단계 · 라디얼 (16) + 잔여 네임스페이스

**목표**: 라디얼 슬롯이 `CommandId` 를 저장하게 한다. 현재는 `StudioQuickActionId` 16개 유니온이라
슬롯에 배치할 수 있는 명령이 16개로 고정돼 있다.

**작업**
1. `StudioQuickActionsPreferences.slots` 의 값 타입을 `CommandId` 로 넓히고,
   기존 16개 id → 카탈로그 id 마이그레이션 맵을 `version: 2` 로 저장한다.
2. `advanced-fill` → `tool.fill` 로 흡수(`fill-id-divergence`).
3. 남은 2개 네임스페이스(`StudioCompanionCommandName` — `studio-tools-companion.ts:107-112`,
   `StudioLayerNavigatorAction` 20개 — `StudioLayerNavigator.tsx:82-115`)를 같은 방식으로 흡수한다.
   이 둘은 Wave A 카탈로그 범위 밖이었다.

**경계 테스트 설계**
- `radial-migration.test.ts`: v1 저장값(16 id 조합)을 넣어 v2 로 읽었을 때 같은 명령이 나오는지.
  손상된 저장값·미지의 id 는 기본값으로 폴백하는지.
- `radial-slot-availability.test.ts`: 슬롯이 임의 `CommandId` 를 받게 되면 **disabled 명령이 슬롯에 앉을 수 있다.**
  6방향 중 disabled 슬롯의 렌더·히트테스트 계약을 고정.

**동작이 바뀌는 지점 (위험)**
- 슬롯에 앉힐 수 있는 명령이 16 → 155로 늘어난다. 손가락 기억을 깨지 않으려면 기본 6슬롯은 그대로 둬야 한다.
- `delete` 슬롯이 `edit.delete-selection` 인지 `edit.clear-selection` 인지 결정해야 한다
  (`delete-clear-vs-remove`). 현행 라디얼은 요소 삭제 쪽이다.

---

## 4. 단계 공통 규칙

1. **스트랭글러만.** 새 경로를 기존 경로 앞에 두고, 처리한 항목을 뒤 경로에서 하나씩 뺀다. 일괄 교체 금지.
2. **패리티 테스트가 먼저.** 각 단계는 "신구 산출물 대조 테스트"를 먼저 커밋하고, 그 테스트가 green 인 상태로
   구현을 얹는다. 대조 테스트가 red 로 바뀌는 커밋은 **의도된 동작 변경**이므로 커밋 메시지에 근거를 남긴다.
3. **충돌은 코드가 아니라 `COMMAND_CONFLICTS` 에서 해소한다.** 항목을 지우는 커밋 = 그 충돌을 실제로 해결한 커밋.
4. **동작 변경은 단독 커밋.** `Q`·`⇧S`·`⌘S`·레이어 순서 chord 4건은 각각 독립 커밋으로 분리한다.
5. `docs/rewrite/ux-audit-v5.md` 의 갭 G-CMD는 4단계가 모두 끝나고 "수기 목록 5 → 0" 이 될 때 닫는다.

---

## 5. 잔여 부채 (Wave A가 만들지 않고 기록만 한 것)

| 항목 | 내용 |
| --- | --- |
| 동적 라벨 | 메뉴 6항목이 상태 의존 라벨이다. `LocalizedLabel` 만으로는 부족 — `labelFor(ctx)` 확장 필요 |
| `preview` | §15.4 필드는 만들었으나 카탈로그 155개 중 `preview` 를 선언한 항목은 0이다. 필터·변형부터 채울 값이 있다 |
| `permissions` | 레지스트리 게이트는 동작하나 카탈로그에 권한을 선언한 명령이 없다. 협업(승인·잠금) 흡수 시 채운다 |
| `undo` 팩토리 | 레지스트리가 `execute` 결과에 undo 엔트리를 합성하지만, 실제 히스토리 스택 연결은 흡수 단계의 일이다 |
| §15.3 미대응 그룹 | `canvas` `vector` `comic` `animation` `collaboration` 5개 네임스페이스가 비어 있다 |
| Voice 명령 표면 | §15에 있으나 제품에 없다(음성 코드는 WebRTC 통화·TTS 낭독뿐). 카탈로그에도 없다 |
