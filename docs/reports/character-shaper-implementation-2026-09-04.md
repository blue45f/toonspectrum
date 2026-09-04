# 캐릭터 셰이퍼 구현 보고서 — 2026-09-04

대상 브랜치: `claude/shaper-site-analysis-implementation-vl5m45`
빌드 계약: [`docs/studio/character-shaper-design-brief-2026-09-04.md`](../studio/character-shaper-design-brief-2026-09-04.md)
사용 설명서: [`docs/studio/character-shaper.md`](../studio/character-shaper.md)

## 1. 무엇이 들어갔나

`/studio/character` 라우트에 **프리셋 우선 3D 캐릭터 작업실**을 올렸다. 새 씬 문서를 만들지 않고
기존 VRM 포저 런타임(`useStudioVrmPoserController`) 위에 얹었기 때문에 저장·되돌리기·캡처·삽입
경로가 하나로 유지되고, 「고급 편집」으로 기존 대화상자를 같은 모델 위에서 그대로 연다.

- 15개 슬롯 카탈로그와 파생 레시피, 능력 프로파일, 적용 계획 (model 오너)
- 결정론적 SVG 카드 미리보기 · 포즈/손 글리프 (preview 오너)
- 의미 레이어 PSD, 이미지 수학, 참고 이미지 팔레트 추출 (export 오너)
- 작업실 셸(요약 바 · 슬롯 레일 · 선반 · 카드 · 뷰포트 HUD · 모바일 시트) (ui-shell 오너)
- 인스펙터 · 참고 서랍 · 출력 독 · 페인트 HUD · 정밀 컨트롤 (ui-panels 오너)
- **이 보고서가 다루는 범위**: 바인딩·히스토리·마운트 컴포넌트, 라우트/호스트 배선, 발견 가능성
  (메뉴·명령·툴레일·검색·팔레트·튜토리얼), Blender 패키지 진입점, 문서

## 2. 파일 지도 (이번 소유 범위)

| 파일 | 역할 |
|---|---|
| `src/domains/creator/character-shaper/useCharacterShaperHistory.ts` | 60단계 라벨+스냅샷 스택(순수 함수 + 훅) |
| `src/domains/creator/character-shaper/useCharacterShaperBinding.ts` | `CharacterShaperBinding` 구현 — 파생·커밋·되돌리기·비교·색 |
| `src/domains/creator/character-shaper/StudioCharacterShaper.tsx` | 컨트롤러 + 바인딩 + 셸(또는 고급 편집) 마운트 |
| `src/domains/creator/character-shaper/CharacterShaperBlenderPackage.tsx` | Blender 캐릭터 패키지 진입점(체형 슬롯 ▸ 정밀 제작) |
| `src/domains/creator/studio-workspace-route.ts` · `studio-router/studio-route-manifest.ts` | `character` 표면 + 매니페스트 패턴 |
| `src/domains/creator/studio-interactive-3d-surface.ts` | 3D 렌더러 승인 — 셰이퍼가 레거시 포저보다 우선 |
| `src/domains/creator/StudioCuttoonEditorHost.tsx` | `characterShaperOpen` 상태·메뉴 오프너·라우트 분기·표면 동기화·프롭 전달·튜토리얼 액션 |
| `src/domains/creator/StudioLazyPanelStack.tsx` · `StudioThreeDPreviewPanelStack.tsx` · `studio-page-lazy-ui.ts` | 지연 마운트(포저와 동일한 `onInsert`/`onClose` 정리) |
| `src/domains/creator/studio-cuttoon-editor/*` | 세션 백 필드와 툴레일 입력 배선 |
| `src/domains/creator/studio-command-catalog.ts` · `studio-main-menu-*` | `insert.character-shaper` 명령 + `3D ▸ 캐릭터 셰이퍼` 메뉴 |
| `src/domains/creator/StudioLeftToolRail.tsx` · `studio-app-settings.ts` · `studio-chrome-ia-map.ts` · `editor-client/studio-left-tool-rail-client.ts` | 툴레일 런처(`character-shaper`) |
| `src/domains/creator/studio-search-corpus.ts` | 통합 검색 패널 항목(셰이퍼·캐릭터 만들기·프리셋…) |
| `components/command-palette-data.ts` · `components/command-palette.tsx` | ⌘K 스튜디오 도구 + `/shaper` 페이지, 단축키 없는 도구의 라우트 이동 |
| `src/domains/creator/studio-feature-tutorials.ts` · `studio-feature-tutorial-en-fallbacks.ts` | `character-shaper` 튜토리얼 + 영어 안전 문구 |
| `docs/studio/character-shaper.md` · `STUDIO_MANUAL.md` · `README.md` | 문서 |

## 3. 설계 결정 세 가지

**되돌리기는 원본 상태 스냅샷이다.** 셰이퍼는 자기 레이어를 따로 들지 않으므로, 커밋 직전의
호스트 원본 상태(아바타 포지 · 워드로브 · 소품 · 의상 표시 · 포즈 본맵과 손가락 · 표정 id와
가중치 · 커스텀 색 · 홍채 틴트 · 손 방향)를 통째로 저장한다. 되돌리면 그 값을 그대로 되돌려
쓰므로, 포즈/표정처럼 런타임이 자체 히스토리를 가진 변경도 대화상자 안에서는 셰이퍼 단계가
이긴다. 스택은 60단계에서 가장 오래된 것부터 버린다.

**입 모양의 표정 하한은 `activeExpressionId`를 건드리지 않는다.** 호스트의
`updateExpressionWeight`는 가중치에서 표정 id를 다시 계산하기 때문에, 그대로 쓰면 창작자가 고른
표정이 "custom"으로 바뀐다. 하한은 `setExpressionWeights`로만 쓰고 id는 손대지 않는다.

**홍채 틴트는 커스텀 색이 바뀔 때마다 다시 칠한다.** `StudioVrmActor`가 `customColors` 변화마다
`applyVrmCustomColors`와 다음 프레임의 보정 패스를 돌리므로, 틴트 이펙트의 의존성에
`customColors`를 함께 넣고 `requestAnimationFrame` 한 번을 뒤따라 붙였다.

## 4. 검증

```bash
pnpm exec vitest run src/domains/creator/character-shaper \
  src/domains/creator/studio-router src/domains/creator/studio-workspace-route.test.ts
# → 32 files / 386 tests pass

pnpm exec vitest run \
  src/domains/creator/studio-interactive-3d-surface.test.ts \
  src/domains/creator/studio-command-catalog.test.ts \
  src/domains/creator/studio-main-menu-groups.test.ts \
  src/domains/creator/studio-main-menu-group-spec.test.ts \
  src/domains/creator/studio-main-menu-localization.test.ts \
  src/domains/creator/studio-chrome-ia-map.test.ts \
  src/domains/creator/studio-primary-action-reachability.test.ts \
  src/domains/creator/studio-app-settings.test.ts \
  src/domains/creator/StudioLeftToolRail.test.tsx \
  src/domains/creator/editor-client/studio-left-tool-rail-client.test.ts \
  src/domains/creator/studio-command-search.test.ts \
  src/domains/creator/studio-inspector-density.test.ts \
  src/domains/creator/studio-feature-tutorials.test.ts \
  src/domains/creator/studio-feature-tutorial-en-fallbacks.test.ts \
  src/domains/creator/StudioFeatureTutorialHub.test.tsx \
  src/domains/creator/StudioLazyPanelStack.test.tsx \
  src/domains/creator/studio-page-lazy-ui.test.ts \
  components/command-palette.test.tsx components/command-palette-search.test.ts
# → all pass

pnpm exec vitest run \
  src/domains/creator/studio-host-architecture-ratchet.test.ts \
  src/domains/creator/studio-lazy-panel-stack-boundary.test.ts \
  src/domains/creator/studio-left-tool-rail-boundary.test.ts \
  src/domains/creator/studio-tool-belt-content-boundary.test.ts \
  src/domains/creator/studio-main-menu-groups-boundary.test.ts \
  src/domains/creator/studio-menu-shipped-surface-entry-points.test.ts \
  src/domains/creator/studio-creative-modes-surface-boundary.test.ts \
  src/domains/creator/studio-optional-ui-bundle-boundary.test.ts \
  src/domains/creator/studio-page-tool-transition-boundary.test.ts \
  src/domains/creator/studio-menubar-content-boundary.test.ts \
  src/domains/creator/studio-menu-session-model-boundary.test.ts \
  src/domains/creator/StudioMenubarContent.test.tsx \
  src/domains/creator/scene-3d/studio-3d-insert-controller-boundary.test.ts \
  src/domains/creator/vrm/studio-vrm-character-workshop-boundary.test.ts \
  src/domains/creator/CharacterShaperLandingPage.test.tsx
# → 15 files / 200 tests pass

pnpm exec eslint --max-warnings=0 <변경 파일 전부>   # → 0 problems
```

루트 `pnpm typecheck` 는 메모리 상한 때문에 이 세션에서 돌리지 않았다. 대신 루트 `tsconfig.json`
을 확장하고 **변경 파일 + 실제 의존 그래프**(`StudioCuttoonEditorHost.tsx` 포함)만 포함한 스크래치
프로젝트로 `tsc -p` 를 돌려 0 에러를 확인했다. 게이트의 전체 typecheck 로 최종 확인이 필요하다.

세션 백(`StudioCuttoonEditorViewSessionCore/Rest`)의 `any` 개수는 래칫이라 새 필드는 `any` 가
아니라 실제 타입(`boolean`, setter 시그니처)으로 넣었다.

## 5. Browser evidence (2026-09-04, 개발 서버 + Playwright/SwiftShader)

`pnpm verify:studio-character-shaper` 로 재현한다. 실행 결과는
`docs/screenshots/character-shaper/character-shaper-evidence.json`, 캡처는 같은 디렉터리에 있다.
검증 스크립트는 이미지에 들어 있는 Chromium 을 직접 가리키고, WebGL 캔버스가
`preserveDrawingBuffer: false` 이므로 합성된 스크린샷을 페이지 안에서 다시 디코딩해 통계를 낸다
(`e2e/studio-3d-visual-verification.spec.ts` 와 같은 기법).

| 항목 | 결과 |
| --- | --- |
| `/studio/character` 데스크톱 1440×900 | `character-desktop.png` — 레일·선반·뷰포트·인스펙터·독이 한 화면 |
| `/studio/character` 모바일 390×844 | `character-mobile.png` — 가로 overflow 없음(스크립트가 단언) |
| 헤어 카드 커밋 전/후 | 타일 휘도 최대 변화 **32.3** |
| 워드로브 카드 커밋 전/후 | 타일 휘도 최대 변화 **85.2** |
| PSD 내보내기 영수증 | 레이어 **10개** — 주선·윤곽선 / 음영·어두운 면 / 밑색(얼굴·상의·하의·피부) / 미리보기 |
| 대화상자 안 접근 가능한 이름 누락 | **0건** |
| 페이지 오류 | **0건** |

아직 자동 검증에 들어 있지 않은 항목: 투명 PNG 알파 커버리지, 표면 드로잉 획 → PSD 「표면 드로잉」
그룹 생성, 참고 서랍을 드로잉 중에 여닫는 왕복, Esc 순서와 포커스 복귀. 수동으로 확인했고
스크립트에 넣는 것은 후속 작업이다.

### 이 검증이 실제로 잡아낸 결함

첫 실행에서 헤어 카드의 타일 변화가 **0** 이었다. 「헤어 없음」 카드는 "원본 헤어를 숨깁니다" 라고
적혀 있는데 화면이 그대로였다 — 카탈로그가 막으려던 바로 그 상태다. 원인은 셰이퍼가 아니라
`StudioVrmAvatarForge` 의 헤어 감춤 조건이었다: `replaceOriginal` 이 켜져 있어도 스타일이 `none`
이면 건너뛰었다. `replaceOriginal` 하나만으로 판단하도록 고쳤고(민머리를 만드는 조합이 바로 이것이다),
`shouldHideAuthoredVrmHair` 로 의도를 문서화해 회귀 테스트를 붙였다. 고친 뒤 같은 검증에서 32.3 이
나왔고, 헤어가 사라졌으므로 PSD 의 머리 마스크가 비어 정직하게 빠져 레이어가 11 → 10 으로 줄었다.

### 셰이퍼가 만들지 않은, 그러나 눈에 띄는 문제

절차적 워드로브 상의(티셔츠)가 몸에 맞지 않고 조각난 판으로 보인다(`character-desktop-top.png`).
같은 모델·같은 옷을 기존 `3D 캐릭터` 빌더에서 입혀도 결과가 동일하므로 이번 변경의 회귀가 아니라
`buildGarmentParts` 의 기존 품질 한계다. 셰이퍼는 그 경로를 한 번의 클릭 거리로 당겨 놓았을 뿐이며,
의상 메시 품질 자체는 별도 작업으로 남는다.

## 6. 남은 한계 (정직한 목록)

- 눈이 얼굴 메시에 합쳐진 모델(VRoid 계열)은 PSD 눈 마스크를 분리할 수 없다. 이유와 함께 생략된다.
- MToon 재질이 없는 모델은 음영·하이라이트가 평면과 같아 두 레이어가 빠진다.
- 참고 서랍의 팔레트 추출과 추천 패널이 각자 파일 입력을 가진다 — 이미지를 두 번 올려야 한다.
- 손가락 굽힘은 런타임이 손 단위로만 제공한다(고급 편집에서 손가락별 조절).
- 실루엣 프리셋(체형 슬롯 인스펙터)은 `presetId` 를 비우므로 요약 바가 체형을 "직접 조절"로 읽는다.
  의도된 동작이다.
- 새 툴레일 도구는 기존 사용자의 저장된 툴바 목록에는 없으므로 「더 보기」에서 꺼내야 한다
  (저장소의 기존 동작 그대로).
- 모바일 툴벨트(`StudioToolBeltContent`)에는 아직 셰이퍼 버튼이 없다. 모바일에서는 상단 메뉴
  `3D ▸ 캐릭터 셰이퍼`, ⌘K 팔레트, 통합 검색, 주소로 연다.
- 상단 메뉴에서 레거시 `3D 캐릭터`를 고르면 셰이퍼가 닫힌다(같은 문서 위에 VRM 런타임이 둘 서지
  않게). 무손실 전환 경로는 셰이퍼 안의 「고급 편집」이다.
