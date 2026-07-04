# Studio Liquify(Push 브러시) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **StudioPage.tsx는 이 세션에서 수정하지 않았다.** 순수 로직/프레젠테이션
> 신규 파일(`studio-liquify.ts`, `studio-liquify.test.ts`, `StudioLiquifyPanel.tsx`)만 만들었고,
> 아래는 후속 통합 패스가 정확히 어디에 무엇을 넣어야 하는지에 대한 지시서다. 라인 번호는
> **커밋 `6285df150aea7ddbb52855686c3e0f8c2f06b06c` 기준**(이 저장소는 병렬 세션이 `StudioPage.tsx`를
> 동시에 건드릴 수 있어 라인이 밀렸을 수 있다 — 각 절의 "앵커 텍스트"로 실제 위치를 다시 찾아라).

## 0. 새로 만든 파일

- `src/domains/creator/studio-liquify.ts` — 순수 코어(DOM 의존 없음). Push 변위 필드 계산 +
  backward-mapping 렌더 + 캔버스 팩토리 orchestration.
- `src/domains/creator/studio-liquify.test.ts` — 30개 유닛 테스트, 전부 통과(`npx vitest run
  src/domains/creator/studio-liquify.test.ts`) — 최초 24개 + 아래 §16-9 회귀 검증 과정에서 발견한
  버그를 고치며 추가한 6개(비유한 좌표 방어 회귀 테스트).
- `src/domains/creator/StudioLiquifyPanel.tsx` — 무상태 프레젠테이션 패널(`StudioSmudgePanel.tsx`와
  동일한 스타일: 무장 토글 1개 + 슬라이더 2개 + busy 스피너 + 상태 문구).

셋 다 `npx tsc --noEmit -p .`/`npx eslint`를 이 상태(기존 파일 무수정)에서 클린 통과했다(apps/api 관련
tsc 에러 4건은 이 워크스페이스에 `@nestjs/common`/`reflect-metadata` 가 설치되지 않은 무관한 기존
환경 갭 — liquify 파일을 빼고 다시 돌려도 동일하게 재현됨을 확인).

## 1. 알고리즘 요약(왜 이렇게 만들었는지는 `studio-liquify.ts` 모듈 docstring에 상세 기술)

1. 스트로크 좌표(정규화 SelPoint, `appendBrushPoint`로 누적)를 자연 픽셀 좌표(`LiquifyPixelPoint`)로
   변환한다(heal-clone과 동일하게 flip을 먼저 되돌린 뒤 스케일).
2. `buildLiquifyDisplacementField`가 스트로크를 리샘플(`resampleLiquifyPath`, 간격=반경×0.35)하고,
   각 세그먼트(이전 점→현재 점) 방향 벡터×strength를 그 점 중심 반경 내 좌표에 코사인(Hann window)
   falloff(`liquifyBrushWeight`) 가중치로 **단순 합산**해 국소(스트로크 바운딩박스 한정, 캔버스 전체가
   아님) 변위 그리드(dx/dy, `Float32Array`)를 만든다.
3. `applyLiquifyDisplacement`가 backward mapping으로 렌더한다 — 출력 픽셀 (x,y)마다 원본의
   (x-dx, y-dy)를 `sampleBilinearClamped`(bilinear + 클램프-투-엣지)로 읽어 쓴다. 구멍 없음.
4. `bakeLiquifyStrokeToCanvas`가 heal-clone의 frozen/work 2-캔버스 패턴을 그대로 재사용해 실제
   DOM 캔버스에 굽는다(원본을 두 번 그려 하나는 절대 안 건드리는 소스로 고정, 다른 하나에만 결과를
   쓴다 — 같은 버퍼로 하면 이미 옮겨 쓴 픽셀을 다시 원본인 양 읽는 이중 왜곡이 생긴다).

## 2. import 추가

### 2-1. 정적 import (파일 상단, `studio-layers`와 `studio-magic-resize` import 사이 — 알파벳 순서상
그 사이가 정확한 자리다. 앵커: `} from "./studio-layers";` 바로 다음 줄, `import { computeMagicResize`
바로 앞)

```ts
import {
  bakeLiquifyStrokeToCanvas,
  LIQUIFY_RADIUS_DEFAULT,
  LIQUIFY_STRENGTH_DEFAULT,
  type LiquifyPixelPoint,
} from "./studio-liquify";
```

### 2-2. 지연 패널 import (앵커: `const StudioLayerMaskPanel = lazyRetry(...)` 블록 바로 다음, `const
StudioQuickShapePanel = lazyRetry(...)` 바로 앞 — 다른 픽셀 브러시 패널들과 같은 자리에 모아둔다)

```ts
const StudioLiquifyPanel = lazyRetry(
  () => import("./StudioLiquifyPanel").then((mod) => ({ default: mod.StudioLiquifyPanel })),
  "StudioLiquifyPanel"
);
```

## 3. 상태 훅 — `layerMaskBusy` state가 끝나는 지점(레이어 마스크 "선택 요소가 바뀌면…" `useEffect`
직후, 크롭 리셋 `useEffect` 직전)에 삽입. 앵커: `}, [selectedId]);` (레이어 마스크 블록의 마지막 줄)
다음, `// 선택 요소가 바뀌면 크롭 모드·진행 중 드래그·busy 를 해제한다` 주석 앞.

```ts
// ── Liquify(Push 브러시) — studio-liquify 통합 상태 ── smudge와 동일하게 단순(무장/반경/강도/busy
// + 드래그 ref + 커서 ref)하다 — 실시간 드래그 미리보기 오버레이는 두지 않는다(studio-smudge.ts와
// 동일한 이유, StudioLiquifyPanel.tsx docstring 참고). smudge와 동일하게 선택 요소 변경 시 별도
// 리셋 useEffect도 두지 않는다(heal-clone/layer-mask와 달리 소스 앵커 같은 "요소 귀속" 상태가 없다).
const [liquifyPaintActive, setLiquifyPaintActive] = useState(false);
const [liquifyRadius, setLiquifyRadius] = useState(LIQUIFY_RADIUS_DEFAULT);
const [liquifyStrength, setLiquifyStrength] = useState(LIQUIFY_STRENGTH_DEFAULT); // %
const [liquifyBusy, setLiquifyBusy] = useState(false);
const liquifyDragRef = useRef<{ elId: string; frame: SelectionFrame; points: SelPoint[] } | null>(null);
const liquifyCursorRef = useRef<Konva.Circle>(null);
```

## 4. `liquifyArmed` 파생 상수 — 앵커: `const layerMaskPaintArmed = layerMaskPaintActive &&
selected?.type === "image";` 바로 다음 줄(`smudgeArmed`/`healCloneArmed`/`layerMaskPaintArmed`와
같은 클러스터).

```ts
const liquifyArmed = liquifyPaintActive && selected?.type === "image";
```

## 5. `disarmAllPixelTools()` — 12번째 armed 상태로 추가

앵커: 함수 본문 마지막 줄 `setLayerMaskPaintActive(false);` 바로 다음(닫는 `}` 직전).

```ts
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
  setLiquifyPaintActive(false); // ← 추가
}
```

이 함수 바로 위 주석(`// 캔버스 제스처를 무장(armed)해 가로채는 도구 11종을 한꺼번에 끈다…`)의
**"11종"을 "12종"으로 고쳐라** — 개수가 실제로 바뀐다.

## 6. Escape 키 핸들러 — `layerMaskPaintActive` 분기 다음, `pixelTool || pixelSel` 분기 앞에 삽입

앵커: `} else if (layerMaskPaintActive) { setLayerMaskPaintActive(false); layerMaskDragRef.current =
null; clearLayerMaskDragPreview(); } else if (pixelTool || pixelSel) {` 사이.

```ts
} else if (liquifyPaintActive) {
  setLiquifyPaintActive(false);
  liquifyDragRef.current = null;
} else if (pixelTool || pixelSel) {
```

## 7. `onStageDown` — 색상 휠 롱프레스 가드에 조건 추가 + 새 브랜치 삽입

### 7-1. 색상 휠 롱프레스 가드(앵커: `!smudgeActive &&` / `!healCloneTool &&` 두 줄이 있는 조건 블록)
— `smudgeActive`/`healCloneTool`과 같은 이유로 liquify도 무장 중엔 롱프레스가 발동하면 안 된다. 아래
줄을 그 두 줄 사이/다음에 추가:

```ts
      !liquifyPaintActive &&
```

> 참고(정보용, 이 작업의 필수 항목은 아님): 이 가드 목록에는 원래 `!layerMaskPaintActive`도 빠져
> 있다(레이어 마스크 붓 무장 중에도 롱프레스 색상 휠이 열릴 수 있는 기존 버그로 보인다). 이번
> liquify 추가와 별개의 기존 갭이라 **고치지 않았다** — 통합 담당자가 원하면 같이 고쳐도 된다.

### 7-2. 새 브랜치 — heal-clone 브랜치(`if (healCloneArmed && !healCloneBusy && …) { … return; }`)가
끝나는 지점, 픽셀 선택 도구 브랜치(`if (pixelTool && selected?.type === "image" && …)`) 시작 전에 삽입.
앵커: heal-clone 브랜치의 마지막 `return;` 다음 줄의 `}` 바로 다음, `// 픽셀 선택 도구 무장 중:` 주석 앞.

```ts
    // Liquify(Push) 브러시 무장 중: 스테이지 드래그를 왜곡 스트로크 좌표 누적으로 가로챈다. crop/
    // 픽셀 선택과 동일한 정책 — 무장 중엔 다른 캔버스 제스처를 막는다. liquifyBusy 가드는 직전
    // 스트로크의 비동기 렌더(변위 필드 계산 + backward mapping)가 끝나기 전에 새 스트로크를 시작해
    // patchEl 갱신이 서로를 덮어쓰는(lost-update) 경쟁을 막는다(healCloneBusy와 동일 이유).
    if (
      liquifyArmed &&
      !liquifyBusy &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
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
      liquifyDragRef.current = { elId: selected.id, frame, points: [canvasPointToNormalized(pos.x, pos.y, frame)] };
      return;
    }
```

## 8. `onStageMove` — 커서 갱신 헬퍼 + 드래그 누적 분기 + 호버 분기

### 8-1. 커서 갱신 헬퍼 함수 — `updateHealCloneCursorNodes` 함수 정의 바로 다음(같은 "커서 헬퍼"
그룹), `onStageMove` 함수 정의 앞에 추가:

```ts
// Liquify 브러시 호버 커서 — smudgeCursorRef/layerMaskCursorRef와 동일 기법(ref 직접 갱신, 리렌더
// 없음). heal-clone 선례를 따라 호버뿐 아니라 드래그 중에도 이 함수를 호출해 커서가 스트로크를
// 계속 따라오게 한다(smudge는 드래그 중 커서를 갱신하지 않는데, 여기선 공짜에 가까운 개선이라
// heal-clone 쪽을 택했다 — §9 참고).
function updateLiquifyCursorNode(pos: { x: number; y: number }) {
  const cursor = liquifyCursorRef.current;
  if (!cursor) return;
  cursor.position(pos);
  if (!cursor.visible()) cursor.visible(true);
  cursor.getLayer()?.batchDraw();
}
```

### 8-2. 드래그 좌표 누적 — heal-clone 드래그 분기(`if (healCloneDragRef.current) { … return; }`)가
끝난 다음, 마퀴 드래그 분기(`if (marqueeStartRef.current) { …`) 앞에 삽입:

```ts
    // Liquify(Push) 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터 — heal-clone과
    // 동일한 appendBrushPoint 재사용). 실제 픽셀 왜곡은 여기서 계산하지 않는다(스트로크 종료까지
    // 미룬다 — smudge/heal-clone/layer-mask와 동일한 "제스처 1회 = 커밋 1회" 관례).
    if (liquifyDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = liquifyDragRef.current;
        updateLiquifyCursorNode(pos);
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const radiusNorm = liquifyRadius / Math.max(1, session.frame.width);
        const nextPoints = appendBrushPoint(session.points, p, radiusNorm);
        if (nextPoints !== session.points) session.points = nextPoints;
      }
      return;
    }
```

### 8-3. 호버 시 커서 표시 — 커서 else-if 체인(`if (smudgeArmed) {…} else if (layerMaskPaintArmed)
{…} else if (healCloneArmed && selected?.type === "image") {…} else if (tool === "draw") {…}`)에서
heal-clone 분기와 `tool === "draw"` 분기 사이에 삽입:

```ts
    } else if (liquifyArmed) {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      if (cursorPos) updateLiquifyCursorNode(cursorPos);
    } else if (tool === "draw") {
```

이 체인 위 주석(`// 커서 프리뷰: 드로잉/문지르기/복구브러시 세 무장 상태는…`)도 liquify를 언급하도록
업데이트하면 좋다(필수는 아님, 정보 정확도 문제일 뿐).

## 9. `onStageUp` — 스트로크 종료 시 굽기 트리거

앵커: heal-clone 드래그 종료 분기(`if (healCloneDragRef.current) { … return; }`)가 끝난 다음, 마퀴
드래그 종료 분기(`if (marqueeStartRef.current) { …`) 앞에 삽입:

```ts
    // Liquify(Push) 드래그 종료 — 누적된 좌표로 변위 필드를 계산해 backward mapping으로 굽는다.
    if (liquifyDragRef.current) {
      const session = liquifyDragRef.current;
      liquifyDragRef.current = null;
      if (session.points.length >= 2) void bakeLiquifyStroke(session);
      return;
    }
```

`session.points.length >= 2` 가드는 성능/명확성을 위한 얕은 사전 체크일 뿐이다 — 실제로는
`buildLiquifyDisplacementField`가 점<2일 때 이미 안전하게 null을 반환하므로 생략해도 정확성엔 문제
없다(smudge의 `>= 2` 체크와 동일한 이유로 넣었다).

## 10. 굽기(bake) 함수 — heal-clone 굽기 함수 바로 다음에 추가

앵커: `async function bakeHealCloneDragStroke(session: {…}) { … }` 정의가 끝나는 지점(`// ── 페인트
통 결과 커밋…` 주석 앞).

```ts
// ── Liquify(Push) 브러시 스트로크 굽기 — 스트로크 종료마다 자동 실행(붓처럼 즉시 반영, heal-clone/
// smudge와 동일한 "제스처 1회 = 커밋 1회" 관례). 원본 자연 해상도로 변위 필드를 계산해 backward
// mapping으로 굽고, 결과를 data URL로 교체(patchEl)해 히스토리 1건(⌘Z 1회)으로 남긴다. target은
// elementById에서 다시 읽는다(session.elId 기준) — await 사이 selected가 바뀌어도 정확한 요소에
// 적용된다.
async function bakeLiquifyStroke(session: { elId: string; frame: SelectionFrame; points: SelPoint[] }) {
  const target = elementById.get(session.elId);
  if (!target || target.type !== "image") return;
  setLiquifyBusy(true);
  try {
    const img = await loadPixelEditImage(target.src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const flipX = target.flipped ?? false;
    const flipY = target.flippedY ?? false;
    const pixelPoints: LiquifyPixelPoint[] = session.points.map((p) => {
      const unflipped = flipNormalizedPoint(p, flipX, flipY);
      return { x: unflipped.x * w, y: unflipped.y * h };
    });
    const radiusPxDevice = liquifyRadius * (target.width > 0 ? w / target.width : 1);
    const out = bakeLiquifyStrokeToCanvas(
      img,
      w,
      h,
      pixelPoints,
      radiusPxDevice,
      liquifyStrength / 100,
      createPixelEditCanvas
    );
    if (!out) return; // 변화 없음(짧은 스트로크 등) — 무변화 히스토리를 만들지 않는다.
    const src = (out as HTMLCanvasElement).toDataURL("image/png");
    patchEl(target.id, { src } as Partial<El>);
    setError(null);
  } catch (err) {
    console.error("Failed to apply liquify stroke:", err);
    setError(err instanceof Error ? err.message : "Liquify 브러시를 적용하지 못했습니다.");
  } finally {
    setLiquifyBusy(false);
  }
}
```

## 11. 커서 숨김 함수 + `onMouseLeave` 배선

### 11-1. 앵커: `function hideLayerMaskCursor() { … }` 바로 다음(커서 숨김 함수 그룹 마지막), `//
드래그 중 정렬 스냅…` 주석 앞.

```ts
function hideLiquifyCursor() {
  const cursorNode = liquifyCursorRef.current;
  if (cursorNode && cursorNode.visible()) {
    cursorNode.visible(false);
    cursorNode.getLayer()?.batchDraw();
  }
}
```

### 11-2. `<Stage … onMouseLeave={() => { hideBrushCursor(); hideSmudgeCursor();
hideHealCloneCursors(); hideLayerMaskCursor(); }}>` 블록에 한 줄 추가:

```ts
onMouseLeave={() => {
  hideBrushCursor();
  hideSmudgeCursor();
  hideHealCloneCursors();
  hideLayerMaskCursor();
  hideLiquifyCursor(); // ← 추가
}}
```

## 12. 커서 오버레이 Konva Layer(JSX)

앵커: heal-clone 커서 `<Layer>`(`{!isExporting && healCloneArmed && ( <Layer listening={false}> <KCircle
ref={healCloneCursorRef} … /> <KCircle ref={healCloneSourceCursorRef} … /> </Layer> )}`) 바로 다음,
마퀴 rect `<Layer>`(`{!isExporting && marqueeRect && (…)}`) 앞에 삽입.

```tsx
{!isExporting && liquifyArmed && (
  <Layer listening={false}>
    <KCircle
      ref={liquifyCursorRef}
      visible={false}
      radius={Math.max(1.5, liquifyRadius)}
      stroke="#f472b6"
      strokeWidth={1.25 / effScale}
      dash={[3 / effScale, 3 / effScale]}
      opacity={0.9}
    />
  </Layer>
)}
```

`radius`를 smudge/layer-mask 커서와 동일하게 **`effScale`로 나누지 않는다** — §14(스케치 대비 편차)에
이유를 적었다(heal-clone 커서만 나누는 기존 불일치 발견, 다수결로 smudge/layer-mask 패턴을 따름).
색상(`#f472b6`, 핑크)은 기존 커서들과 구분되도록 새로 골랐다(smudge=보라 `#7c5cff`,
layer-mask=황색 `#eab308`, heal=녹색 `#22c55e`/clone=파랑 `#38bdf8`).

## 13. 요소 드래그/클릭선택 잠금 — `renderEl` 안 `draggable`/`onSelect` 두 곳에 `!liquifyArmed` 추가

**이 항목을 놓치면 브러시가 무장된 채로 캔버스를 드래그했을 때 "브러시질" 대신 이미지 요소 자체가
이동해버리는 버그가 생긴다** — heal-clone/smudge/layer-mask 셋 다 이미 이 두 곳에 자신의 armed 상수를
추가해뒀다(§13의 목적은 그 넷째 자리를 채우는 것뿐이다).

앵커 1(`draggable` 계산, `!layerMaskPaintArmed;`로 끝나는 조건):

```ts
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
  !liquifyArmed; // ← 추가
```

앵커 2(`onSelect` 계산, `!layerMaskPaintArmed && setSelectedId(el.id);`로 끝나는 조건):

```ts
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
      !liquifyArmed && // ← 추가
      setSelectedId(el.id);
```

(이 두 곳 바로 위 한글 주석 "픽셀 선택/크롭/패널 컷/노드 편집/문지르기/복구브러시 무장 중엔…"도
"…Liquify…"를 언급하도록 고치면 좋다 — 텍스트 정확도 문제일 뿐, 동작에는 영향 없음.)

## 14. 패널 마운트 — "선택한 이미지" 사이드바 그룹

앵커: `<StudioLayerMaskPanel …/>` 가 끝나는 지점(`/>` 닫는 줄), `{/* 이미지 크롭 — … */}` 주석과
`<StudioCropPanel …>` 시작 사이. (heal-clone/smudge/layer-mask와 같은 `selected.type === "image"`
분기 안, 크롭 패널 바로 앞 — "이 배치에서 마지막으로 추가된 픽셀 브러시 도구"라는 순서 그대로.)

```tsx
<StudioLiquifyPanel
  active={liquifyPaintActive}
  radius={liquifyRadius}
  strength={liquifyStrength}
  busy={liquifyBusy}
  onToggleActive={() =>
    setLiquifyPaintActive((v) => {
      const next = !v;
      if (next) disarmAllPixelTools();
      return next;
    })
  }
  onRadiusChange={setLiquifyRadius}
  onStrengthChange={setLiquifyStrength}
/>
```

## 15. 통합 후 수동 QA 체크리스트

- [ ] 이미지 요소를 선택 → "Liquify" 패널의 "밀어서 왜곡하기" 토글 → 캔버스 위 드래그 → 손을 떼면
      드래그 방향으로 픽셀이 밀린 결과가 반영되고, 상단바 "적용하는 중…" 스피너가 잠깐 보인다.
- [ ] ⌘Z로 정확히 스트로크 이전 상태로 되돌아간다(히스토리 1건).
- [ ] 무장 중 다른 픽셀 브러시(문지르기/복구 브러시/레이어 마스크 붓/픽셀 선택/크롭)를 켜면
      liquify가 자동으로 꺼진다(반대 방향도 동일 — `disarmAllPixelTools` 상호배제).
- [ ] Liquify 무장 중 캔버스를 드래그해도 이미지 요소 자체는 이동하지 않는다(§13 확인).
- [ ] Esc 키로 liquify 무장이 꺼진다.
- [ ] 반전(flip)된 이미지에서도 드래그 방향과 실제로 밀리는 방향이 화면 기준으로 일치한다(flip
      되돌리기 로직 확인 — heal-clone과 동일 테스트 이미 존재, 수동으로도 한 번 확인 권장).
- [ ] 브러시 반경/강도 슬라이더를 바꾸면 커서 원 크기/다음 스트로크의 밀림 정도가 그에 맞게 바뀐다.
- [ ] 짧은 탭(드래그 없이 클릭만)은 아무 변화도 만들지 않는다(무변화 히스토리 없음).

## 16. 스케치 대비 편차(§5, 의도적 스코프 축소·구현 선택)

1. **Push 모드만 구현했다.** Procreate의 Twirl(회전 왜곡)/Pinch(수축)/Bloat(팽창) 등은 이번 배치에서
   의도적으로 생략했다 — 요청 프롬프트가 "Push 모드 하나만 최소 스코프로 구현해도 충분"이라고
   명시했다. 후속 확장 시 `buildLiquifyDisplacementField`의 세그먼트별 변위 계산 부분만 교체하면 된다
   (falloff·backward-mapping 렌더·굽기 orchestration은 모드 무관하게 재사용 가능하도록 이미 분리해
   뒀다 — `applyLiquifyDisplacement`/`bakeLiquifyStrokeToCanvas`는 "변위 필드"라는 인터페이스만 알고
   그 필드가 어떻게 계산됐는지는 모른다).
2. **실시간 픽셀 미리보기 없음.** 드래그 중엔 브러시 반경 커서만 보이고, 실제 왜곡 결과는 스트로크
   종료(pointerup) 시 한 번에 계산해 반영한다 — smudge/heal-clone/layer-mask와 동일한 기존 관례를
   그대로 따른 것이다(라이브 프리뷰를 만들려면 매 프레임 변위 필드 재계산 + 캔버스 재렌더가 필요해
   프레임레이트 비용이 커진다).
3. **falloff는 가우시안이 아니라 코사인(Hann window)을 택했다.** 가우시안은 이론상 반경 밖에서도
   완전히 0이 되지 않아(꼬리가 무한히 남음) 변위 필드의 바운딩박스 경계에서 미세한 불연속(seam)이
   남을 수 있다 — 코사인 raised-cosine은 정확히 반경에서 0으로 수렴하고 그 지점의 미분도 0이라(양쪽
   끝 다 매끈) 필드 경계 이음매 문제가 원천적으로 없다. 프롬프트의 "가우시안/코사인 falloff" 요구
   사항 중 코사인 쪽을 택한 것 — 시각적 결과는 두 falloff가 사실상 구분하기 어렵다.
4. **변위는 단순 합산이며 상한(클램프)을 두지 않았다.** 같은 자리를 여러 번 오가며 스크럽하면
   변위가 계속 누적돼 강하게 밀린다 — "완벽한 유체 시뮬레이션이 아니다, 단순 합산으로 충분하다"는
   요청사항을 그대로 따랐다. `sampleBilinearClamped`가 항상 클램프-투-엣지로 샘플링하므로 변위가
   아무리 커져도 크래시나 undefined 픽셀은 생기지 않는다(시각적으로는 극단적인 경우 가장자리
   픽셀이 "늘어나 보이는" 정도로 그친다).
5. **변위 필드는 스트로크 바운딩박스로 국한된 국소 그리드다**(캔버스 전체 크기의 `Float32Array`를
   만들지 않는다) — 메모리·연산량 모두 스트로크가 실제로 닿은 영역에 비례한다. 이 최적화는 알고리즘
   정확도에 영향이 없다(바운딩박스 밖은 falloff가 이미 0이므로 원본과 결과가 같다 — §1 참고).
6. **heal-clone 커서(`healCloneCursorRef`)만 `effScale`로 나누고 smudge/layer-mask 커서는 안 나누는
   기존 불일치를 발견했다.** liquify 커서는 다수결(2/3)로 smudge/layer-mask 쪽(나누지 않음, 정적
   JSX `radius` prop)을 따랐다 — heal-clone 쪽 기존 동작을 "고치는" 결정은 이번 스코프 밖이라 그냥
   기록만 해둔다.
7. **색상 휠 롱프레스 가드의 기존 갭**(§7-1 참고 — `layerMaskPaintActive`가 원래 그 조건 목록에
   빠져 있음)은 liquify와 무관한 기존 문제라 고치지 않았다. liquify 자신의 `!liquifyPaintActive`는
   추가했다(그 목록의 다른 항목들과 동일한 이유로 필요하다고 판단했다).
8. **강도(strength) 단위는 %(0..100, 코어엔 /100)로 smudge 관례를 따랐다** — heal-clone의
   opacity(0..1)나 layer-mask의 strength(0.05..1) 방식도 이 저장소에 공존하므로 어느 쪽을 따라도
   무방했으나, liquify가 개념적으로 smudge(방향성 있는 브러시 블렌드)에 가장 가까워 그 관례를
   골랐다.
9. **(사후 발견·수정) 회귀 검증 리뷰 세션에서 실제 픽셀 손상 버그를 하나 찾아 고쳤다.**
   `buildLiquifyDisplacementField`는 원래 바운딩박스 계산 루프에서만 비유한(NaN/Infinity) 좌표를
   방어적으로 걸러내고, 가중치 누적 루프에서는 걸러내지 않았다 — 스트로크 중간에 비유한 점이 하나만
   섞여도(정상 사용에선 발생하지 않지만, 프레임 크기 0 등 상위 계층의 다른 버그가 있으면 이론상
   가능) `clampInt`/`clampFloat`가 NaN 입력에 자신의 `min` 인자로 폴백하는 특성과 맞물려 변위
   필드의 한 행/열 전체가 NaN으로 오염되고, 렌더링 시 그 줄 전체가 원본의 (0,0) 픽셀 색으로 잘못
   칠해지는 **조용한 이미지 손상**(크래시가 아니라 값이 틀리는 것이라 더 위험)으로 이어졌다.
   end-to-end 재현 스크립트로 실제 발생을 확인한 뒤 `resampleLiquifyPath`(모든 하류 함수의 유일한
   공통 입구)가 비유한 점을 입력 단계에서 걸러내도록 고쳤다 — 기존 24개 테스트는 전부 그대로
   통과하고(동작 변화 없음, 모든 기존 테스트 입력이 이미 유한이었으므로), 이 버그를 정확히 잡아내는
   회귀 테스트 6개를 추가해 30개가 됐다(§0 참고). 정상적인 UI 경로(실제 마우스/터치 좌표)에서는
   거의 트리거되지 않는 방어적 강화이지만, 코드 자신의 docstring이 이미 "비유한 좌표는 방어적으로
   건너뛴다"고 명시하고 있었던 만큼 그 약속을 실제로 지키도록 고치는 것이 맞다고 판단했다.
