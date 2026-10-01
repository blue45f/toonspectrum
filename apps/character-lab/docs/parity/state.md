# SHAPER 패리티 — state-presets 영역 (상태·프리셋·슬롯 패널)

- 작성: state-presets 작업자, 2026-10-01. core가 `docs/shaper-parity-checklist.md`로 집계한다(열 구조 동일).
- 소유 파일: `src/state/**`(17), `src/presets/**`(3), `src/app/shell/panels/SlotPanel.tsx`(+`.test.tsx`), 이 문서.
- 열 의미: **구현 상태** 구현됨/부분/미구현 · **Node 검증** vitest 파일 · **브라우저 검증** 미검증 또는 `YYYY-MM-DD·기기·backend` · **비고** 베타·사유.

## 1. 항목별 상태

| 항목(SHAPER 대응) | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고 |
|---|---|---|---|---|
| 15슬롯 구성 중 외형 12슬롯 × 64 프리셋(얼굴형 6·눈 6·눈동자 5·코 5·입 5·귀 4·헤어 7·체형 6·상의 5·하의 5·신발 4·액세서리 6) | 구현됨 | `presets/appearance-presets.test.ts`(64개, 어휘 안, id·라벨 유일, 같은 슬롯 안 patch 상호 상이, `catalogInvariants` 통과) | 미검증(썸네일 픽셀) | 어휘는 `contracts/preset-vocabulary.ts`에 동결. 연기 30개(표정 12·포즈 10·손 8)는 animation 영역 |
| 프리셋 patch가 실제 외형을 바꿈(params/parts/colors 조합) | 구현됨 | 같은 파일(파라미터 프리셋은 슬롯 키 전부 기록·0 포함, 파츠 프리셋은 어휘 이름, 의상·신발·액세서리는 기본색 포함) | 미검증(실제 렌더) | 파라미터 프리셋은 교체 시 이전 잔여 값이 남지 않도록 다루는 키 전부를 적는다 |
| 프리셋 `requires`(소스가 제공해야 할 morph) 결정적 유도 | 구현됨 | 같은 파일(`requiresForPatch`) | — | `morph:param:<key>:<±>` 형식. 불충족 시 플래너가 미지원 사유로 노출(대체 없음) |
| 프리셋 간 충돌 선언(`conflictsWith`, 대칭) | 구현됨 | 같은 파일(참조 유효·대칭·슬롯 상이) | — | 히메컷/트윈테일 ↔ 캡/귀걸이/헤드폰, 후드티 ↔ 헤드폰, 세일러복 ↔ 초커 |
| 슬롯 탭 15개(얼굴/몸·의상/연기 그룹) + 카드 그리드 + 현재 선택 표시 | 구현됨 | `app/shell/panels/SlotPanel.test.tsx`(jsdom: 탭 15·카드 수·`aria-pressed`) | 미검증(레이아웃) | 활성 슬롯은 셸 UI 상태(`useUiState`)와 공유. 스타일 클래스 `cl-slot-panel/toolbar/tabs/tab/grid/card/badge/thumb/…`는 core CSS에 아직 없음(§4) |
| 카드 클릭 = `slot/apply` dispatch 1회, 액세서리 "없음" 카드 | 구현됨 | 같은 파일 | — | 실제 store 연결 테스트에서 클릭 → 레시피 변경 → 선택 카드 이동 → 실행 취소 복귀까지 확인 |
| 슬롯 능력 배지: `unavailable`은 disabled + 사유(tooltip·텍스트), `partial`은 경고 배지 + 사유 | 구현됨 | 같은 파일 | — | 탭 자체에도 배지를 단다(제작 패키지 소스에서 교체형 헤어 미제공 등) |
| 미지원 사유 표시(플래너 `unsupported`: requires 불충족·카탈로그 밖) | 구현됨 | 같은 파일 + `state/apply-plan.test.ts` | — | 마지막 적용 플랜(`useApplyPlan`)에서 읽어 해당 슬롯·카드에 "미적용" 배지와 사유를 보여준다 |
| 충돌 카드 "겹침 주의" 배지(적용은 가능) | 구현됨 | 같은 파일 | — | `presetConflicts(entry, recipe, catalog)` |
| 썸네일 카드(ready 래스터·pending·failed 사유) | 구현됨 | 같은 파일(pending/failed 배지) | 미검증(실제 썸네일 픽셀·canvas 표시) | 래스터 → `ImageData`/canvas. 요청은 셸 thumbnail-driver가 활성 슬롯 우선으로 한다 |
| 실행 취소/다시 실행 버튼 + 깊이 표시 | 구현됨 | 같은 파일 | — | TopBar에도 undo/redo가 있으면 같은 명령을 보낸다 |
| 레시피 reducer(명령 11종: slot/apply·param/set·color/set·expression/set·pose/set·hand-pose/set·shading/set·physics/set-provider·source/set·recipe/load, +history·paint는 store) | 구현됨 | `state/recipe-reducer.test.ts`(불변성, patch만 적용, 클램프, 정규화, 거부 코드·한글 사유) | — | 잘못된 명령은 `RecipeCommandError`로 거부하고 store가 `failures`에 쌓는다(무음 금지) |
| undo/redo: 1 명령 = history 1단계 | 구현됨 | `state/history.test.ts`, `state/lab-store.test.ts` | — | 레시피가 바뀌지 않는 명령은 단계를 만들지 않는다 |
| 슬라이더 연속 드래그 병합(`param/set` + `coalesceKey`, 250 ms 윈도우) | 구현됨 | 같은 파일들(병합·윈도우 밖 분리·`before` 유지) | — | undo 한 번에 드래그 전체가 되돌아간다 |
| history 용량 200(초과 시 가장 오래된 항목 제거), redo 소거 | 구현됨 | `state/history.test.ts`(205회 push → 200), `state/lab-store.test.ts`(limit 3) | — | |
| 페인트 스트로크 undo 토큰 history 통합(`paint/stroke`, 방향 콜백) | 구현됨 | `state/lab-store.test.ts` | 미검증(실제 텍스처 복원은 paint 영역) | `onPaintUndo(token, direction)`로 paint 도메인이 주입 |
| 소스 전환(`source/set`)이 능력 맵까지 undo/redo | 구현됨 | `state/lab-store.test.ts` | — | 같은 소스라도 능력 맵이 바뀌면 단계 생성 |
| 적용 플랜(morphWeights = 파라미터 ± 분리 + FACS, boneRotations = pose ∪ handPose 정규화, 파츠 가시성·재질·색) | 구현됨 | `state/apply-plan.test.ts`(가중치 [0,1], 단위 쿼터니언, 레이아웃·variant 가시성) | 미검증(엔진 반영은 render 영역) | `createApplyPlanner({ partLayout, features, settleSteps })`로 소스별 레이아웃·feature 주입 |
| 미지원 슬롯 미적용 + 사유, 대체 없음; `conflictsWith`·partial 능력 → partial 사유 | 구현됨 | 같은 파일 | — | 미지원 프리셋의 파라미터 morph도 제외, 파츠는 소스 기본값 유지 |
| 플랜 revision 메모(`getPlan`)·프리셋 임시 적용 플랜(`planForPreset`/`planWithPreset`) | 구현됨 | `state/lab-store.test.ts`, `state/apply-plan.test.ts` | — | 셸 thumbnail-scheduler의 `planForPreset`과 같은 의미 |
| 레시피 저장(정규형 JSON, `character-<digest8>.json`)·불러오기(손상 JSON·스키마·미래 버전 한글 사유) | 구현됨 | `state/recipe-io.test.ts`(round-trip 바이트 동일, 키 순서 무관, 사유 코드) | — | ExportPanel(export 영역)은 자체 `export/recipe-file.ts`(`.character.json`, 페인트 레이어 포함)를 쓴다 — 통합 시 한쪽으로 합치기 권장(§4) |
| 브라우저 파일 열기/저장(File System Access 우선, 없으면 `<input type=file>`/`<a download>` + `revokeObjectURL`) | 구현됨 | `state/recipe-io.test.ts`(capability 판정 `openMethodFor`/`saveMethodFor`, 취소 판정 `isAbortError`) | 미검증(실제 피커·다운로드) | DOM 경로 자체는 `recipe-io.browser.ts`(테스트 import 금지 규약) |
| 썸네일 캐시 키(해당 슬롯·그 프리셋 patch 키·연기 필드 제외 digest + 셰이딩 모드)와 LRU 400 | 구현됨 | `state/thumbnail-cache.test.ts`(키 불변·변화 조건, LRU 순서·한도) | — | 페인트 레이어·셰이딩 모드 외 옵션은 키에 영향 없음 |
| React 연결(`useSyncExternalStore`, 선택자 얕은 비교로 리렌더 억제) | 구현됨 | `state/useLabStore.test.tsx`(jsdom) | — | 컨텍스트 훅(`useLabState`/`useLabSelector`)은 core `lab-store-context.tsx`; state의 훅은 store를 인자로 받는 `useLabStoreState`/`useLabStoreSelector` |
| 이벤트 반영(engine/physics/vision 상태, failure·dismiss, thumbnail/update) | 구현됨 | `state/lab-store.test.ts`(testing/mock-store 참조 구현과 동치) | — | |

## 2. 공개 API 요약

- `state/recipe-reducer.ts`: `reduceRecipe(recipe, cmd, catalog)`, `RecipeCommandError`, `isRecipeCommand`, `normalizePose`, `mergePoseScoped`, `describeCommandKo`.
- `state/history.ts`: `createHistory(limit | { limit, coalesceWindowMs })` → `push/undo/redo/canUndo/canRedo/depth/redoDepth/peekUndo/peekRedo/canCoalesce/entries/clear`; `HistoryEntry = RecipeHistoryEntry | PaintHistoryEntry`; `HISTORY_DEFAULT_LIMIT = 200`, `HISTORY_COALESCE_WINDOW_MS = 250`.
- `state/lab-store.ts`: `createLabStore({ catalog, planner?, initial?, history?, now?, onPaintUndo? })` → `LabStoreHandle`(`getState/dispatch/subscribe/applyEvent` + `getPlan/planForPreset/getHistory/catalog`); `applyLabEvent(state, event)`.
- `state/apply-plan.ts`: `planApply: ApplyPlanner`, `createApplyPlanner(options)`, `planWithPreset`, `unmetRequirement`, `presetConflicts`, `layoutFromPalette`, `materialPresetFor`, `DEFAULT_PART_LAYOUT`, `SLOT_PART_ROLES`, `PART_COLOR_KEYS`, `PRESET_MATERIALS`, `DetailedApplyPlan`(= ApplyPlan + `partial`).
- `state/recipe-io.ts`: `serializeRecipe`, `deserializeRecipe`, `recipeFileName`, `openMethodFor`, `saveMethodFor`, `isAbortError`; `state/recipe-io.browser.ts`: `openRecipeFile(win?)`, `saveTextFile(name, text, mime?, win?)`.
- `state/thumbnail-cache.ts`: `thumbnailCacheKey(presetId, recipe, shadingMode, catalog?)`, `createThumbnailCache(limit = 400)`.
- `state/useLabStore.ts`: `useLabStoreState(store)`, `useLabStoreSelector(store, selector, isEqual?)`, `shallowEqual`.
- `presets/index.ts`: `APPEARANCE_PRESETS`(64), 슬롯별 배열 12개, `appearancePresetsForSlot`, `requiresForPatch`, `APPEARANCE_PRESET_COUNT`.
- `app/shell/panels/SlotPanel.tsx`: `SlotPanel`, `NULLABLE_SLOTS`.

## 3. 검증 명령

```sh
pnpm exec eslint --max-warnings=0 apps/character-lab/src/state apps/character-lab/src/presets apps/character-lab/src/app/shell/panels/SlotPanel.tsx apps/character-lab/src/app/shell/panels/SlotPanel.test.tsx
pnpm exec vitest run apps/character-lab/src/state apps/character-lab/src/presets apps/character-lab/src/app/shell/panels/SlotPanel.test.tsx
pnpm --filter @toonstudio/character-lab typecheck
```

## 4. 브라우저 미검증·다른 영역 의존(통합 시 확인)

- 미검증: 썸네일 픽셀·canvas 표시, 파일 피커/`<a download>` 실제 동작, 패널 레이아웃. 이 컨테이너에는 GPU·브라우저가 없다.
- core CSS(`src/app/styles/character-lab.css`)에 SlotPanel 클래스(`cl-slot-panel`, `cl-slot-toolbar`, `cl-slot-title`, `cl-slot-history`, `cl-slot-undo/redo`, `cl-slot-history-depth`, `cl-slot-tabs`, `cl-slot-tab-group(-label)`, `cl-slot-tab(--active)`, `cl-slot-grid-wrap`, `cl-slot-grid(-caption/-reason/-unsupported)`, `cl-slot-grid`, `cl-slot-card(--selected/--disabled/--none)`, `cl-slot-card-thumb/-label/-reason`, `cl-slot-badge(--unavailable/--partial/--unsupported/--conflict)`, `cl-slot-thumb(--text/--pending/--failed)`, `cl-slot-empty`, `cl-slot-footer`)가 아직 없다. Export·Paint 패널과 같은 상황이며 core가 한 번에 추가한다(작업자는 공유 CSS를 편집하지 않는다).
- 레시피 파일 모듈이 둘이다: `state/recipe-io.ts`(스펙 5.1, `character-<digest8>.json`)와 `export/recipe-file.ts`(`.character.json`, 페인트 레이어 PNG 포함). ExportPanel은 후자를 쓴다. 저장 포맷을 하나로 합칠지 core가 결정한다(둘 다 `parseRecipe` strict 스키마를 쓰므로 서로 읽을 수 있다).
- 카탈로그 병합(`APPEARANCE_PRESETS` + `PERFORMANCE_PRESETS`)과 불변식 실행은 core `catalog-registry.ts`.
- core `lab-runtime.ts`는 `thumbnailCacheKey(presetId, recipe, shadingMode)` 3인자 형태로 호출한다. 네 번째 인자로 카탈로그를 넘기면 그 프리셋 patch가 덮어쓰는 파라미터·색·연기 필드까지 키에서 빠져(슬라이더 드래그 중 불필요한 썸네일 재생성 감소) 더 정밀해진다 — core가 `cacheKey(presetId, recipe, recipe.shading.mode, catalog)`로 바꾸기를 권장.
