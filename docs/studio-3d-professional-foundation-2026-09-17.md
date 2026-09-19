# Studio 3D 전문가 작업공간 기반 — 2026-09-17

> **2026-09-19 후속 계획:** 엔진·커널·자산·캐릭터의 장기 승격 순서는
> [Scene3D 장기 플랫폼 고도화](./studio/studio-3d-platform-evolution-2026-09-19.md)를 따른다.
> 이 문서는 workspace/professional baseline의 근거로 유지한다.

## 결정

- 대화형 편집 장면의 주 엔진은 Three.js/R3F/three-vrm을 유지한다.
- Unity 또는 Babylon.js로 장면 소유권을 넘기지 않는다.
- 고급 FX와 멀티패스 작업은 기존 격리 specialist 계약을 통해 확장한다.
- 이번 단계는 엔진 교체보다 먼저 필요한 편집기 구조·작업공간·품질 기준선을 제품 코드에 고정한다.

## 이번 구현

### 타입이 있는 Scene Outliner

`studio-bg3d-scene-outliner-controller.ts`가 기존 가변 host bag과 UI 사이의 좁은 경계를 제공한다.
Outliner는 renderer, Three Object3D, Babylon Node, GPU handle을 받지 않고 다음 데이터와 명령만 받는다.

- 직렬화 가능한 객체 ID·이름·종류·부모 ID
- visible·locked·selected 상태
- 검색·선택·이름 변경·표시·잠금·복제·삭제 명령
- 읽기 전용 계층 projection

### 전문가용 3패널 Workspace

대형 화면에서는 다음 구조를 사용한다.

```text
Scene Outliner | Interactive Viewport | Inspector / Render / Shot tools
```

중소형 화면에서는 기존 탭 흐름을 유지하되 동일한 typed Outliner를 사용한다. 따라서 반응형 UI마다
장면 조작 로직을 중복 구현하지 않는다. 대형 화면의 Outliner·Inspector 폭은 포인터 또는 키보드로
조절할 수 있고, 유효 범위로 정규화한 뒤 사용자 로컬 설정에 저장한다.

### 원자적 Outliner 명령

`studio-bg3d-outliner-mutation.ts`가 이름 변경·표시·잠금·복제·삭제를 renderer-neutral 계획으로 만든다.
각 조작은 변경 전 스냅샷, typed command ID, 다음 선택 상태를 함께 생성하고 기존
`commitImmediateHistoryTransition`에 한 번만 전달한다. UI가 배열을 직접 수정하거나 별도 undo 상태를
만들지 않으므로 한 번의 사용자 조작이 정확히 한 번의 undo 단계가 된다.

### 접근성과 직접 조작

- WAI-ARIA tree/treeitem 의미 구조
- Arrow Up/Down, Home/End, Left/Right 탐색
- Shift/Ctrl/Command 다중 선택
- 계층 접기·펼치기와 전체 접기·펼치기
- 이름 변경·표시·잠금·복제·삭제
- 검색 결과와 빈 장면 상태

## Professional quality corpus v1

고도화 전후를 같은 장면으로 비교하기 위해 8개 대표 시나리오를 고정했다.

| 시나리오 | 주 위험 |
| --- | --- |
| 빈 장면 수명주기 | open/close, dispose, context restore |
| 소형 교실 | hierarchy, transform, round-trip |
| 중형 거리 | instancing, camera, capture |
| 대형 판타지 홀 | large scene, LOD, shadow frustum |
| 단일 캐릭터 | VRM, pose, grounding, prop contact |
| 다중 캐릭터 | shared stage, capture authority, shot |
| 투명·발광 야간 | straight alpha, emission, bloom |
| 반복 소품 스트레스 | selection, undo/redo, memory stability |

모든 시나리오는 beauty/depth/object-ID를 포함한 명시적 렌더 pass, 해상도, capability, 성능 예산을
가진다. 엔진 비교용 승인 manifest는 small/medium/large 한 장면씩만 projection해 기존 벤치마크
계약에 연결할 수 있다.

## 수치 기준

- 데스크톱 preview p95: 16.7 ms
- 모바일 preview p95: 33.3 ms
- 선택·기즈모 입력 p95: 100 ms
- 단일 capture: 16,777,216 pixels 이하
- 동일 장면의 object/material ID: exact match
- 30분 soak 후 지속 heap/GPU 증가 없음
- context/device loss 후 canonical scene 손실 없음

이 수치는 현재 성능을 충족했다고 주장하는 값이 아니라, 이후 renderer·asset·NPR 개선의 승인 기준이다.

## 다음 구현 순서

1. 기존 `useStudioBg3dEditorState`의 document state와 transient session state 분리
2. BG3D·Hybrid DCC·VRM의 SceneDocument authority 통합
3. workspace panel dock/show-hide 및 프로젝트별 layout preset
4. Linked 3D Layer와 2D paint-over round-trip
5. GLB/LOD/KTX2 자산 admission pipeline
6. beauty/depth/normal/ID/line/tone 기반 NPR render graph
7. Three WebGPU/TSL A/B와 Babylon FX production gate

## 검증 명령

```bash
pnpm run verify:studio-3d-professional-foundation
pnpm run typecheck
pnpm run build:bundle
```

이번 기반은 현재 저장 형식과 주 렌더러를 바꾸지 않는다. 따라서 WebGPU·Babylon·Unity 실험이 실패해도
기존 프로젝트와 편집 장면은 동일하게 복구할 수 있어야 한다.
