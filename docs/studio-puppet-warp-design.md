# Studio Puppet Warp — 설계 문서 (StudioPage.tsx 통합 지침)

> 이 문서가 다루는 범위: **새 파일 3개는 이미 작성·테스트 완료됨** —
> `src/domains/creator/studio-puppet-warp.ts`(순수 로직 + 38개 유닛 테스트),
> `src/domains/creator/StudioPuppetWarpOverlay.tsx`(Konva 오버레이),
> `src/domains/creator/StudioPuppetWarpPanel.tsx`(인스펙터 패널).
> 이 세션에서는 **`StudioPage.tsx`를 의도적으로 건드리지 않았다** — 아래 내용은 후속 통합 패스가
> 정확히 어디에 무엇을 추가해야 하는지에 대한 지시서다. 라인 번호는 이 문서 작성 시점
> (`StudioPage.tsx` 15,047줄) 기준이며, 파일이 계속 자라는 단일 거대 파일이라 통합 시점엔 몇 줄
> 어긋나 있을 수 있다 — 각 항목의 "앵커 텍스트"(정확히 일치해야 하는 기존 코드 조각)로 검색해
> 위치를 재확인할 것.

## 0. 한 줄 요약

Photoshop Puppet Warp 대응 — 사용자가 이미지 위에 핀을 찍고 드래그하면, 이미지 네 모서리를
고정한 채 핀 위치를 정점으로 한 Delaunay 삼각분할 메쉬가 부드럽게 변형된다. 핀 배치/드래그는
실시간 Konva 오버레이 미리보기만 갱신하고, "적용" 버튼을 눌러야 원본 해상도로 실제 픽셀을
왜곡해 굽는다(crop 도구와 동일한 "미리보기 → 적용 확정" 패턴).

---

## 1. 새로 만든 파일 3개

### 1.1 `src/domains/creator/studio-puppet-warp.ts` (순수 로직)

| 구분 | export |
|---|---|
| 타입 | `PuppetPin`, `PuppetTriangle`, `AffineMatrix`, `PuppetMeshVertices`, `PuppetWarpCtx2DLike`, `PuppetWarpCanvasFactory` |
| 상수 | `MAX_PUPPET_PINS`(24), `PUPPET_PIN_MIN_DIST`(0.035), `PUPPET_WARP_CORNERS`(4개 고정 코너) |
| 핀 모델 | `canAddPuppetPin`, `addPuppetPin`, `removePuppetPin`, `movePuppetPin`, `resetPuppetPinPositions`, `isPuppetWarpNoop` |
| 메쉬 조립 | `puppetMeshVertices` |
| 삼각분할 | `delaunayTriangulate`(Bowyer-Watson 직접 구현, 외부 라이브러리 없음), `triangulatePuppetMesh` |
| 아핀 변환 | `triangleAffineTransform` |
| 오버레이용 기하 | `puppetMeshTriangleLines` |
| 굽기 | `bakePuppetWarpToCanvas` |

핵심 설계 결정(자세한 근거는 파일 상단 주석 및 §5 참고):

- **코너 4개를 항상 고정된 가상 핀으로 포함**한다 — 사용자 핀만으로 삼각분할하면 볼록 껍질
  밖(이미지 모서리 쪽)이 어떤 삼각형에도 안 덮여 그 자리가 비게 된다. 코너 포함 시 삼각분할은
  항상 단위 사각형 전체를 빈틈없이 덮고, "액자 틀은 고정, 안쪽만 인형처럼 굽힌다"는 puppet warp
  직관과도 맞다.
- **위상(삼각형 인덱스 목록)은 핀을 드래그해도 바뀌지 않는다** — 항상 `rest`(원본/배치 당시)
  위치로 1회 계산하고, 드래그 중엔 같은 인덱스 삼각형이 `current`(드래그된) 위치를 가리킬
  뿐이다. 매 프레임 재삼각분할하지 않는다(성능·안정성).
- **핀 좌표는 0..1로 클램프** — Photoshop처럼 이미지 경계 밖으로 핀을 확장 배치하는 것은
  스코프 밖(§5).
- `bakePuppetWarpToCanvas`는 항상 **원본 이미지를 무왜곡으로 한 번 먼저 그리는 폴백 바닥층**을
  깐 뒤, 삼각형마다 `save()+clip(변형된 삼각형 경로)+transform(아핀)+drawImage(원본 전체)
  +restore()`로 덮어 그린다 — 표준 canvas 삼각형 텍스처 매핑 기법. 퇴화 삼각형(면적≈0)은
  `triangleAffineTransform`이 `null`을 반환해 건너뛴다(그 자리는 폴백 바닥층이 채운다).
- flip(좌우/상하 반전 표시) 처리는 `studio-heal-clone.ts`/`studio-magic-wand.ts`와 동일한
  `flipNormalizedPoint` 관례 — rest/current 양쪽에 동일하게 적용해 상대 관계를 보존한다.

`createPixelEditCanvas`(StudioPage.tsx, 라인 2104)는 **수정 없이 그대로** `PuppetWarpCanvasFactory`
로 넘길 수 있다 — 진짜 `CanvasRenderingContext2D`는 `save`/`restore`/`transform`/`clip`을 이미
전부 가지고 있어 `PuppetWarpCtx2DLike`를 구조적으로 만족한다(heal-clone의 `HealCloneCtx2DLike`와
동일한 관례, 메서드 바이베리언스로 컴파일 검증됨).

### 1.2 `src/domains/creator/StudioPuppetWarpOverlay.tsx` (Konva 오버레이)

`StudioHealCloneOverlay`처럼 항상 `listening=false`인 다른 5개 픽셀 도구 오버레이와 **다르게,
이 오버레이는 핀 마커에 `listening`을 켜 두고 Konva 네이티브 `draggable`+`onDragMove`를 쓴다** —
`StudioPerspectiveOverlay`(소실점 핸들)와 동일한 패턴. 핀 개수가 적고(≤24) 각각이 독립적으로
드래그되는 이산적 타깃이라 heal-clone처럼 ref+RAF로 스트로크를 누적하는 것보다 이 편이 훨씬
단순하고 StudioPage에 새 코드가 거의 필요 없다(§2.3 참고).

Props: `frame`(`SelectionFrame`, 이미지 요소 배치), `scale`(`effScale`), `pins`, `busy`(true면
`draggable=false`로 드래그 잠금), `onMovePin(id, x, y)`(정규화 좌표, 프레임 크기로 나눠서 콜백).

핀 마커에는 `name="puppet-pin-handle"`을 달아 뒀다 — StudioPage의 onStageDown이 "빈 자리 클릭 =
새 핀 추가" 분기에서 이 이름으로 기존 핀 위 클릭을 걸러낸다(§2.4).

### 1.3 `src/domains/creator/StudioPuppetWarpPanel.tsx` (패널)

`StudioCropPanel`과 동일한 "토글 진입 + 적용/초기화/취소" 3버튼 푸터 + `StudioPerspectivePanel`과
동일한 "핀 목록(삭제 버튼)" 리스트를 합친 형태. 완전히 controlled(로컬 상태 없음).

Props: `active`, `pins`, `busy`, `canApply`, `onToggle`, `onRemovePin(id)`, `onResetPositions()`,
`onApply()`, `onCancel()`.

---

## 2. StudioPage.tsx 통합 지점 (실제 수정은 후속 패스가 수행)

### 2.1 import 추가 (2곳)

**(a) 순수 로직 import** — 알파벳 순서상 `./studio-psd-export`(라인 346)와 `./studio-quickshape`
(라인 347) import 블록 **사이**에 삽입:

```tsx
import {
  addPuppetPin,
  bakePuppetWarpToCanvas,
  isPuppetWarpNoop,
  movePuppetPin,
  puppetMeshVertices, // 오버레이가 아니라 StudioPage 자체에서 필요하면만(보통 불필요, §2.6 참고)
  removePuppetPin,
  resetPuppetPinPositions,
  type PuppetPin,
} from "./studio-puppet-warp";
```

(`puppetMeshVertices`는 StudioPage가 직접 쓸 일이 없다면 빼도 된다 — overlay/bake 함수 내부에서만
쓰인다. `MAX_PUPPET_PINS`도 패널 내부에서만 쓰이므로 StudioPage에 들여올 필요 없다.)

**(b) 오버레이 컴포넌트 import** — `StudioHealCloneOverlay`처럼 lazy-load 하지 않고(Stage 트리
밖 포탈 불가) 일반 import. 알파벳 순서상 `StudioPublishContextBanner`(라인 442)와
`StudioSkewPanel`(라인 443) **사이**:

```tsx
import { StudioPuppetWarpOverlay } from "./StudioPuppetWarpOverlay";
```

**(c) 패널은 lazy-load** — 다른 픽셀 도구 패널들(`StudioCropPanel` 라인 574, `StudioHealClonePanel`
라인 618, `StudioLayerMaskPanel` 라인 622)과 같은 블록에, `StudioLayerMaskPanel`(라인 622-625)
바로 뒤·`StudioQuickShapePanel`(라인 626) 바로 앞에 삽입:

```tsx
const StudioPuppetWarpPanel = lazyRetry(
  () => import("./StudioPuppetWarpPanel").then((mod) => ({ default: mod.StudioPuppetWarpPanel })),
  "StudioPuppetWarpPanel"
);
```

### 2.2 상태 선언

크롭 상태 선언(`const [cropRect, setCropRect] = useState<CropRect | null>(null);`, 라인 3874)
바로 뒤에 삽입 — crop과 같은 "미리보기 후 적용 확정" 계열이라 인접 배치:

```tsx
// 퍼펫 워프 — 핀 배열은 이미지 요소 1개에 귀속되지만 crop과 동일하게 elId를 별도로 추적하지
// 않는다(적용 시점의 selected를 그대로 대상으로 삼는다 — §5 "elId 미추적" 참고).
const [puppetWarpActive, setPuppetWarpActive] = useState(false);
const [puppetWarpPins, setPuppetWarpPins] = useState<PuppetPin[]>([]);
const [puppetWarpBusy, setPuppetWarpBusy] = useState(false);
```

`healCloneSourceCursorRef` 등과 달리 **ref가 전혀 필요 없다** — 드래그는 Konva 네이티브가
처리하고, 클릭-추가는 onStageDown에서 즉시(세션 없이) `setPuppetWarpPins`를 호출하기 때문이다.

### 2.3 armed 계산식

`cropArmed`(라인 4161) 근처, 다른 armed 상수들(`smudgeArmed`/`healCloneArmed`/
`layerMaskPaintArmed`, 라인 4173-4175) 옆에 추가:

```tsx
// 퍼펫 워프 무장(이미지 요소 선택 + 모드 on) — crop과 동일한 정책(무장 중 다른 스테이지
// 제스처·요소 드래그/선택 전환을 막는다, §2.5 참고).
const puppetWarpArmed = puppetWarpActive && selected?.type === "image";
```

### 2.4 `disarmAllPixelTools()` 업데이트 (필수 — 누락 시 다른 배치들에서 실제로 재발했던 버그)

`disarmAllPixelTools()`(라인 4855-4867) 안에 한 줄 추가:

```tsx
function disarmAllPixelTools() {
  setCropRect(null);
  setPixelTool(null);
  setPanelSplitActive(false);
  setNodeEditTool(null);
  setSmudgeActive(false);
  setHealCloneTool(null);
  setEyedropperActive(false);
  setBubbleAnchorPickActive(false);
  setQuickShapeActive(false);
  setColorWheelOpen(false);
  setLayerMaskPaintActive(false);
  setPuppetWarpActive(false); // ← 추가
  setPuppetWarpPins([]);      // ← 추가(핀도 함께 폐기 — 다른 도구로 전환 시 세션 종료)
}
```

### 2.5 onStageDown — 새 분기 1개만 (Move/Up은 변경 없음, 아래 설명)

heal-clone 분기(라인 6941-6977) 바로 뒤, 픽셀 선택 도구 분기(라인 6981) 바로 앞에 삽입:

```tsx
// 퍼펫 워프 무장 중: 빈 자리 클릭 = 새 핀 추가(그 자리에서 세션 없이 즉시 커밋). 기존 핀
// 위 클릭은 오버레이의 Konva 네이티브 draggable(onDragMove)이 처리하므로 여기서는
// "puppet-pin-handle" 이름으로 걸러 무시한다 — 안 걸러내면 핀을 클릭할 때마다 그 자리에 또
// 새 핀이 추가돼 버린다(Konva 이벤트가 핀 Circle → Stage 로 버블링되기 때문).
if (
  puppetWarpArmed &&
  !puppetWarpBusy &&
  selected?.type === "image" &&
  !isSpacePressed &&
  !(e.target.getParent() instanceof KonvaRuntime.Transformer) &&
  e.target.name() !== "puppet-pin-handle"
) {
  const pos = e.target.getStage()?.getRelativePointerPosition();
  if (!pos) return;
  const frame: SelectionFrame = {
    x: selected.x,
    y: selected.y,
    width: selected.width,
    height: selected.height,
    rotation: selected.rotation,
  };
  const p = canvasPointToNormalized(pos.x, pos.y, frame);
  setPuppetWarpPins((pins) => addPuppetPin(pins, { id: uid(), x: p.x, y: p.y }));
  return; // 무장 중엔 다른 스테이지 제스처(마퀴 등)를 막는다 — crop/heal-clone과 동일 정책.
}
```

**`onStageMove`/`onStageUp`에는 통합 지점이 없다 — 의도적으로 아무것도 추가하지 않는다.**
heal-clone/smudge/layer-mask는 "브러시 크기 미리보기 원이 마우스를 따라다녀야" 해서
`onStageMove`에 커서 갱신 코드가 필요하지만, 퍼펫 워프의 핀은 브러시가 아니라 이산적인 클릭
타깃이라 호버 커서는 각 핀 Circle 자신의 `onMouseEnter`/`onMouseLeave`(오버레이 컴포넌트 안에
이미 구현됨, `StudioPerspectiveOverlay`와 동일 패턴)로 충분하다. 드래그도 Konva가 내부적으로
`dragstart`/`dragmove`/`dragend`를 전부 처리하므로 `onStageUp`에서 세션을 커밋하는 코드도
필요 없다(heal-clone/node-edit과 가장 크게 다른 지점 — §5에 명시된 의도적 이탈).

### 2.6 기존 요소 draggable/onSelect 가드에 `!puppetWarpArmed` 추가 (필수 — 빠뜨리면 핀 추가 클릭이 이미지를 같이 드래그시킨다)

라인 10076-10086의 `draggable` 계산식:

```tsx
const draggable =
  !opts.asMask &&
  tool === "select" &&
  !locked &&
  !pixelToolArmed &&
  !cropArmed &&
  !panelSplitArmed &&
  !nodeEditArmed &&
  !smudgeArmed &&
  !healCloneArmed &&
  !layerMaskPaintArmed &&
  !puppetWarpArmed; // ← 추가
```

라인 10090-10101의 `onSelect` 계산식(같은 함수 스코프, 몇 줄 아래):

```tsx
const onSelect = opts.asMask
  ? () => {}
  : () =>
      tool === "select" &&
      !pixelToolArmed &&
      !cropArmed &&
      !panelSplitArmed &&
      !nodeEditArmed &&
      !smudgeArmed &&
      !healCloneArmed &&
      !layerMaskPaintArmed &&
      !puppetWarpArmed && // ← 추가
      setSelectedId(el.id);
```

이 두 곳을 빠뜨리면: 퍼펫 워프가 무장된 상태에서 이미지 빈 자리를 클릭해 핀을 추가하려 할 때,
Konva `Image` 노드 자체가 `draggable=true`라 핀 추가와 동시에(혹은 대신) 이미지가 드래그되는
버그가 생긴다 — 다른 5개 픽셀 도구가 이미 이 두 체인에 자기 armed 플래그를 추가해 둔 것과
정확히 같은 이유.

### 2.7 굽기 함수 — `applyCropToSelectedImage`(라인 6633-6687) 바로 뒤에 추가

```tsx
// ── 퍼펫 워프 적용 — "적용" 버튼을 눌러야 실행되는 파괴적 편집(crop과 동일 패턴, heal-clone처럼
// 스트로크 종료마다 자동으로 굽지 않는다 — 핀을 여러 번 조정해보고 마음에 들 때 확정한다).
// 원본 자연 해상도로 삼각형 메쉬를 워프해 굽고, 결과를 data URL로 교체(patchEl)해 히스토리
// 1건(⌘Z 1회)으로 남긴다.
async function applyPuppetWarpToSelectedImage() {
  if (puppetWarpBusy || isPuppetWarpNoop(puppetWarpPins)) return;
  if (selected?.type !== "image") return;
  const target = selected; // await 사이 선택 변경에 흔들리지 않게 스냅샷(crop/heal-clone과 동일).
  const pins = puppetWarpPins;
  setPuppetWarpBusy(true);
  try {
    const img = await loadPixelEditImage(target.src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const out = bakePuppetWarpToCanvas(img, w, h, pins, createPixelEditCanvas, {
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (!out) throw new Error("퍼펫 워프 결과를 만들지 못했습니다.");
    const src = (out as HTMLCanvasElement).toDataURL("image/png");
    patchEl(target.id, { src } as Partial<El>);
    setPuppetWarpActive(false);
    setPuppetWarpPins([]);
    setError(null);
  } catch (err) {
    console.error("Failed to apply puppet warp:", err);
    setError(err instanceof Error ? err.message : "퍼펫 워프 적용에 실패했습니다.");
  } finally {
    setPuppetWarpBusy(false);
  }
}
```

### 2.8 Konva 오버레이 마운트

heal-clone 오버레이 블록(라인 10991-11002) 바로 뒤, layer-mask 오버레이 블록(라인 11003) 바로
앞에 삽입:

```tsx
{/* 퍼펫 워프 오버레이 — 핀 마커(드래그 가능) + 변형된 메쉬 그물선. 다른 픽셀 도구 오버레이와
    달리 이 Layer는 listening=false 를 주지 않는다 — 핀 Circle 이 Konva 네이티브 드래그를 받아야
    하기 때문(오버레이 파일 헤더 주석·§2.5 참고). */}
{!isExporting && puppetWarpArmed && pixelOverlayFrame && (
  <Layer>
    <StudioPuppetWarpOverlay
      frame={pixelOverlayFrame}
      scale={effScale}
      pins={puppetWarpPins}
      busy={puppetWarpBusy}
      onMovePin={(id, x, y) => setPuppetWarpPins((pins) => movePuppetPin(pins, id, x, y))}
    />
  </Layer>
)}
```

`pixelOverlayFrame`(라인 4154-4157)은 이미 crop/heal-clone/layer-mask 오버레이가 공유하는
"선택된 이미지 요소의 `SelectionFrame`" 계산값 — 그대로 재사용한다(새 frame 계산 불필요).

### 2.9 패널 마운트

`<StudioCropPanel .../>`(라인 13565-13590) 바로 뒤, `selected.type === "image"` 블록을 닫는
`</>`(라인 13592) 바로 앞에 삽입:

```tsx
{/* 퍼펫 워프 — 핀을 놓고 드래그해 이미지를 관절 인형처럼 변형. 적용 전까지는 오버레이
    미리보기만 갱신되고 원본 픽셀은 그대로다. */}
<StudioPuppetWarpPanel
  active={puppetWarpActive}
  pins={puppetWarpPins}
  busy={puppetWarpBusy}
  canApply={!isPuppetWarpNoop(puppetWarpPins)}
  onToggle={() => {
    if (puppetWarpActive) {
      setPuppetWarpActive(false);
      setPuppetWarpPins([]);
      return;
    }
    disarmAllPixelTools();
    setPuppetWarpActive(true);
  }}
  onRemovePin={(id) => setPuppetWarpPins((pins) => removePuppetPin(pins, id))}
  onResetPositions={() => setPuppetWarpPins((pins) => resetPuppetPinPositions(pins))}
  onApply={() => void applyPuppetWarpToSelectedImage()}
  onCancel={() => {
    setPuppetWarpActive(false);
    setPuppetWarpPins([]);
  }}
/>
```

### 2.10 Esc 키 체인

전역 단축키 핸들러의 Escape 분기(라인 5766-5799)에서, `cropRect` 분기(라인 5774-5776) 바로
뒤·`panelSplitActive` 분기(라인 5777) 바로 앞에 추가:

```tsx
} else if (cropRect) {
  setCropRect(null);
} else if (puppetWarpActive) {
  // 퍼펫 워프도 crop과 동일하게 Esc 로 먼저 종료(핀 전부 폐기) — 다음 Esc 가 그 다음 레이어를 닫는다.
  setPuppetWarpActive(false);
  setPuppetWarpPins([]);
} else if (panelSplitActive) {
  ...
```

### 2.11 `uid()` — 이미 존재, 새 import 불필요

`uid`는 StudioPage.tsx 라인 1076에 `const uid = () => crypto.randomUUID();`로 이미
로컬 정의돼 있다(`addVanishingPoint(prev, { id: uid(), ... })`와 동일하게 그대로 재사용).

---

## 3. 통합 체크리스트 (후속 패스용)

- [ ] import 2곳(§2.1a, §2.1b) + lazy 패널 import 1곳(§2.1c)
- [ ] 상태 선언 3개(§2.2)
- [ ] `puppetWarpArmed` 계산식(§2.3)
- [ ] `disarmAllPixelTools()`에 2줄 추가(§2.4) — **가장 잊기 쉬운 지점, 이전 배치들에서 실제
      버그였다**
- [ ] `onStageDown` 새 분기 1개(§2.5) — Move/Up은 손대지 않는다
- [ ] `draggable`/`onSelect` 체인에 `!puppetWarpArmed` 추가(§2.6) — **두 번째로 잊기 쉬운 지점**
- [ ] 굽기 함수 `applyPuppetWarpToSelectedImage`(§2.7)
- [ ] Konva 오버레이 마운트(§2.8) — `listening=false`를 넣지 않도록 주의(다른 오버레이와 다름)
- [ ] 패널 마운트(§2.9)
- [ ] Esc 체인(§2.10)
- [ ] 수동 QA: 핀 3~4개로 팔/다리 굽히듯 드래그 → 메쉬 그물선이 실시간으로 따라오는지 → 적용 →
      `⌘Z`로 되돌리기 → 취소 버튼이 핀을 버리고 원본을 그대로 두는지 → 좌우 반전된 이미지에서도
      동일하게 동작하는지(flipX 경로) → 다른 도구(예: 스포이드) 클릭 시 무장이 자동 해제되는지

---

## 4. 다른 5개 도구와의 상호작용 모델 차이 요약

| | heal-clone | 퍼펫 워프 |
|---|---|---|
| 1단계(지정) | Alt+클릭으로 소스 앵커 | 빈 자리 클릭으로 핀 추가(모디파이어 없음) |
| 2단계(동작) | 일반 드래그로 스트로크 누적(ref+RAF) | 기존 핀을 Konva 네이티브 드래그(ref 불필요) |
| 확정 시점 | 스트로크(드래그) 종료마다 자동 굽기 | "적용" 버튼(명시적, crop과 동일) |
| onStageMove/Up 필요? | 예(스트로크 누적/커밋) | 아니오(Konva가 전부 처리) |

heal-clone의 "2단계 상호작용"이라는 **정신**(지정 제스처와 동작 제스처가 다르다)은 그대로
가져오되, 실제 배선은 소실점(perspective) 패턴을 더 많이 차용했다 — 핀은 heal-clone의 "흐르는
붓질"보다 소실점의 "이산적이고 개별적으로 드래그 가능한 점"에 훨씬 가깝기 때문이다. 이 적응은
"heal-clone 패턴이 제일 가깝다"는 원 지시에 대한 의도적 실용적 변형이며, 결과적으로 StudioPage에
필요한 새 코드가 heal-clone보다 훨씬 적다(ref/RAF 세션·onStageMove/Up 분기 전부 불필요).

---

## 5. 스케치 대비 편차 · 알려진 한계 (필수 명시 섹션)

1. **완전한 ARAP 아님, 삼각형별 아핀 근사다.** 각 삼각형은 독립적인 아핀 변환으로 그려지므로
   전역적으로 "강체에 가까운" 최적화(에너지 최소화)가 없다. 팔다리를 살짝 굽히는 정도의
   자연스러운 사용 범위에서는 충분히 그럴듯하지만, 이 근사의 한계는 명확히 아래 항목들로
   나타난다.

2. **핀을 극단적으로 드래그하면 삼각형이 접히거나(fold) 뒤집힐 수 있다.** 위상(연결관계)이
   고정이므로, 한 핀을 이웃 삼각형을 "뚫고" 지나갈 만큼 멀리 끌면 그 삼각형들이 자기교차하며
   눈에 띄게 찌그러진 결과가 나온다. 실제 ARAP/Moving-Least-Squares 기반 구현은 이런 상황에서도
   부드럽게 저항하지만, 이 구현은 그 저항이 없다 — 사용자가 과도한 드래그를 자제해야 한다(패널
   안내 문구에 "자연스러운 범위 권장"으로 명시함). 완전 방지는 스코프 밖.

3. **삼각형 이음매의 미세한 안티에일리어싱 아티팩트.** 인접한 두 삼각형을 각각 `clip()`으로
   잘라 그리면 경계에서 서브픽셀 단위로 미세한 선(seam)이 보일 수 있다(각 클립 패스의
   안티에일리어싱이 독립적으로 일어나기 때문). 폴백 바닥층(원본 무왜곡 이미지)이 완전한 투명
   틈은 막아 주지만, "색이 살짝 다른 두 삼각형이 만나는 선" 자체는 남을 수 있다. 완벽한 방지
   (예: 삼각형을 미세하게 확장해 겹쳐 그리는 overdraw 기법)는 스코프 밖으로 명시적으로 뺐다.

4. **핀은 이미지 경계 밖으로 배치할 수 없다(0..1 클램프).** Photoshop Puppet Warp는 이미지 밖에도
   핀을 놓아 그 영역을 확장/고정하는 용도로 쓸 수 있는데, 이 구현은 항상 이미지 사각형 내부로
   제한한다 — 렌더링 캔버스 크기가 항상 원본 자연 해상도와 같다는 단순한 가정을 지키기 위한
   의도적 축소.

5. **핀이 이미지 요소 id(elId)에 묶여 있지 않다.** `cropRect`와 완전히 동일한 기존 관례를 그대로
   따른 것 — `puppetWarpPins`는 "지금 무슨 이미지가 선택돼 있든" 그 이미지에 대한 임시 작업
   상태로 취급되고, 적용 시점엔 `selected`를 그대로 대상으로 삼는다. 사용자가 퍼펫 워프 도중
   다른 이미지로 선택을 전환하면(오버레이/패널은 `puppetWarpArmed = ... && selected?.type ===
   "image"` 가드 때문에 사라지지만) `puppetWarpPins` 값 자체는 상태에 남아 있다가, 원래 이미지로
   되돌아오면 다시 나타난다 — crop이 이미 갖고 있던 것과 똑같은 알려진 한계이며 이 배치에서
   새로 만든 문제가 아니다.

6. **Bowyer-Watson 구현은 강건성(robustness) 처리가 없는 교과서 버전이다.** 정확한/섭동
   (perturbed) 산술을 쓰는 CAD급 구현이 아니라 `1e-9`/`1e-12` 정도의 고정 epsilon만 쓴다. 핀을
   서로 거의 겹치게(또는 거의 일직선으로) 배치하는 병적인 입력에서는 아주 드물게 삼각분할이
   미세하게 어긋날 수 있다 — `PUPPET_PIN_MIN_DIST`(코너/기존 핀과 최소 거리 3.5%)로 가장 흔한
   퇴화 케이스는 이미 걸러낸다.

7. **실시간 왜곡 프리뷰(캔버스 픽셀 자체가 드래그 중에 계속 다시 그려지는 것)는 구현하지
   않았다** — 드래그 중엔 Konva 오버레이의 메쉬 그물선(벡터 선)만 실시간으로 갱신되고, 실제
   이미지 픽셀 왜곡은 "적용"을 눌러야 1회 계산된다. 원 지시에서도 "필수는 아니다, 스스로 판단"
   이라 명시했던 부분 — 매 드래그 프레임마다 자연 해상도 전체를 캔버스에 다시 굽는 것은 큰
   이미지에서 버벅임을 유발할 위험이 커서 제외했다. 사용자는 벡터 그물선만으로도 변형 결과를
   충분히 가늠할 수 있다(그물선이 곧 아핀 변환의 정확한 경계이므로 "감"이 아니라 "정확한 미리
   보기"에 가깝다).
