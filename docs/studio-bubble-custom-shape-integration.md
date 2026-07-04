# 말풍선 커스텀 모양(폴리곤 점 편집) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **StudioPage.tsx / studio-svg-export.ts / studio-bubble-anchor 연동
> 함수는 이 세션에서 수정하지 않았다.** 순수 로직/테스트/프레젠테이션 신규 파일만 만들었고, 아래는
> 후속 통합 패스가 정확히 어디에 무엇을 넣어야 하는지에 대한 지시서다. 라인 번호는 **커밋
> `e9b4338bd14d1af01e5a3d7253b348a44ea2d403` 기준 작업트리(다수의 미커밋 변경 포함)** — 이 저장소는
> 병렬 세션이 `StudioPage.tsx`를 동시에 건드릴 수 있어 라인이 밀렸을 수 있다(실제로 이 세션 중에도
> liquify/puppet-warp/bg3d/emeres/kaleidoscope 등 다른 배치의 미통합 파일이 워킹트리에 이미 존재했다)
> — 각 절의 "앵커 텍스트"로 실제 위치를 다시 찾아라.

## 0. 새로 만든 파일

- `src/domains/creator/studio-bubble-custom-shape.ts` — 순수 코어(DOM/Konva 의존 없음). 테마·꼬리
  설정 → 지오메트리 파라미터 계산(`computeBubbleShapeGeometry`), `bubblePathData`/`bubblePathDataMulti`
  결과(d 문자열)를 폴리곤 점으로 샘플링(`sampleBubbleOutlineToPolygon`, 내부에 전용 SVG path 워커
  포함), 역변환(`polygonPointsToPathData`), 정규화(`normalizeCustomShapePoints`), 핸들 목록
  (`bubbleShapePointHandles`), 좌표 변환(`bubbleShapeCanvasPointToLocal`/`bubbleShapeLocalPointToCanvas`).
  `studio-node-edit.ts`의 점 이동 인프라(`beginNodeDrag`/`updateNodeDragMove`/`withPointMoved`/
  `hitTestNodeHandle`)를 그대로 재수출해 호출자가 이 모듈 하나만 보고 편집 세션을 열 수 있다.
- `src/domains/creator/studio-bubble-custom-shape.test.ts` — 20개 유닛 테스트, 전부 통과(`npx vitest
  run src/domains/creator/studio-bubble-custom-shape.test.ts`). 아크 샘플링 좌표를 해석적으로 검증하는
  테스트 포함(우상단 코너 중심에서 반지름만큼 떨어진 위치에 샘플점이 오는지 수치 확인).
- `src/domains/creator/StudioBubbleShapePanel.tsx` — 무상태 프레젠테이션 패널(`StudioNodeEditPanel.tsx`
  와 동일한 fully-controlled 관례: 전환 버튼 / 편집 토글 / 되돌리기 버튼 / 상태 문구).

셋 다 `npx tsc --noEmit -p tsconfig.json`/`npx eslint`를 이 상태(기존 파일 무수정)에서 클린 통과했다.

## 1. 알고리즘 요약(왜 이렇게 만들었는지는 `studio-bubble-custom-shape.ts` 모듈 docstring에 상세 기술)

1. "커스텀 모양으로 전환"은 새 벡터 펜 도구가 아니다 — 현재 말풍선의 테마(`webtoonTheme`)·꼬리
   설정으로 이미 계산되는 `bubblePathData`/`bubblePathDataMulti` 의 **d 문자열을 그대로 재사용**해,
   그 안의 제한된 명령 집합(`M/L/H/V/A/Q/Z`)만 이해하는 초소형 워커로 곡선(모서리 아크·꼬리 베지어)을
   `samplesPerCurve`(기본 6)개 점으로 근사한다. 기하 공식을 중복 구현하지 않는다 — path 문자열이
   바뀌면(다른 라디우스/꼬리 조합) 워커가 자동으로 그 모양을 따라간다.
2. 아크 샘플링은 SVG 스펙 F.6.5 "엔드포인트→중심" 파라미터화를 x축회전=0(이 파일이 항상 그렇게만
   낸다)으로 특수화했다. 베지어는 표준 De Casteljau. 둘 다 끝점을 포함해서 emit하고, 연속 중복점은
   제거한다(닫는 Z가 시작점과 겹치는 마지막 점도 제거 — Konva `<Line closed>`/SVG `<polygon>` 은 첫
   점이 중복되면 안 된다).
3. 나온 폴리곤 점 배열은 그 자체로 최종 데이터다(베지어 핸들이 아니라 순수 점 목록) — 이후 편집은
   `studio-node-edit.ts` 의 "점 이동" 인프라를 그대로 재사용한다(핸들 히트테스트 → 드래그 세션 시작
   → 매 틱 `updateNodeDragMove` → 종료 시 `withPointMoved` 로 불변 배열 갱신 → `patchEl` 커밋). 자유선
   드래그와 다른 점은 **좌표계뿐**이다 — `DrawEl.points` 는 이미 페이지 절대좌표라 정규화가 필요
   없지만, `BubbleEl` 은 `x/y/rotation` 요소라 폴리곤 점은 "말풍선 로컬(비스케일)" 좌표다. 이 변환은
   `studio-selection-tools.ts` 의 `canvasPointToNormalized`/`normalizedPointToCanvas` 를
   `width=height=1` 로 특수화해 재사용한다(새 삼각함수 코드 없음).
4. 렌더은 Konva `<Line points={...} closed>` 로 폴리곤 점 배열을 **그대로** 넘긴다 — path 문자열 왕복이
   필요 없다(`polygonPointsToPathData` 는 이 렌더 경로에는 안 쓰인다 — §13 참고).

## 2. `BubbleEl` 타입 필드 추가

앵커: `interface BubbleEl { … shadowOpacity?: number; }` 의 마지막 필드(`shadowOpacity?: number;`,
현재 958행) 바로 다음, 닫는 `}` (959행) 앞.

```ts
  /** 커스텀 폐곡선 점 배열(요소 로컬 0,0~width,height — bubblePathData 와 동일 좌표계, 짝수 길이
   *  [x0,y0,x1,y1,...], 최소 3점/6칸). 있으면 렌더는 variant별 모양(둥근사각형·별·하트·구름 등)
   *  대신 이 폴리곤을 그린다(studio-bubble-custom-shape.ts). "커스텀 모양으로 전환" 버튼이
   *  bubblePathData/Multi 결과를 샘플링해 채운다 — tailDirection/tailXRatio/tailHeight/extraTails
   *  값 자체는 보존되지만(되돌리기용) 이 필드가 있는 동안은 렌더에 반영되지 않는다(꼬리가 이미
   *  폴리곤에 구워져 있다). */
  customShapePoints?: number[];
```

## 3. import 추가

### 3-1. 순수 로직 import — 앵커: `import { resolveAnchorTargetPoint, computeBubbleAnchorTail, type
AnchorTargetBounds } from "./studio-bubble-anchor";` 바로 다음, `import { BUBBLE_MAX_TAILS,
bubblePathData, …} from "./studio-bubble-path";` 바로 앞(알파벳 순 `bubble-anchor` < `bubble-custom-shape`
< `bubble-path`).

```ts
import {
  bubbleShapeCanvasPointToLocal,
  bubbleShapePointHandles,
  computeCustomShapePointsForBubble,
  hasCustomBubbleShape,
  normalizeCustomShapePoints,
  type BubbleShapeGeometryInput,
} from "./studio-bubble-custom-shape";
```

`beginNodeDrag`/`hitTestNodeHandle`/`updateNodeDragMove`/`withPointMoved`/`NodeDragSession`/
`NodeEditHandle` 은 이미 §의 `studio-node-edit` import 블록에서 들여오고 있으므로(자유선 노드 편집용)
**새로 추가하지 않는다** — 그대로 재사용한다(이 모듈들은 `DrawEl`에 묶여 있지 않은 범용 점배열
함수라 `BubbleEl`에도 그대로 쓸 수 있다).

### 3-2. 패널 정적 import — 앵커: `import { StudioBgRemoveButton } from "./StudioBgRemoveButton";` 바로
다음, `import { colorBlindFilterStyle, … } from "./StudioColorBlindPreview";` 앞(알파벳 순
`BgRemoveButton` < `BubbleShapePanel` < `ColorBlindPreview`). `StudioNodeEditPanel`(비슷한 "점 편집"
패널)도 이 구역에 정적 import 돼 있어 같은 관례를 따른다(지연 로딩 아님 — 패널 자체가 가볍다).

```ts
import { StudioBubbleShapePanel } from "./StudioBubbleShapePanel";
```

## 4. 상태 훅 — `nodeEditDraft` 관련 `useEffect`(선택 변경 시 리셋, 현재 3966행 `}, [selectedId]);`)
바로 다음, `// ── 복구 브러시/도장(heal/clone) …` 주석(현재 3967행) 앞에 삽입.

노드 편집과 동일한 "커밋된 el 기준 매 틱 재계산 + rAF 배칭 draft" 패턴을 그대로 따른다(폴리곤 점이
적어(~20~40개) 매번 setState 해도 저렴하지만, 일관성·기존 관례 재사용을 우선했다 — §스케치 편차 참고).

```ts
// ── 말풍선 커스텀 모양(폴리곤 점 편집) — studio-bubble-custom-shape 통합 상태. nodeEditDraft와
// 동일한 구조(드래그 세션 ref + rAF 배칭 draft) — 좌표계만 다르다(말풍선 로컬, 회전 포함).
const [bubbleShapeEditActive, setBubbleShapeEditActive] = useState(false);
const bubbleShapeDragRef = useRef<{ elId: string; session: NodeDragSession } | null>(null);
const bubbleShapeRafRef = useRef<number | null>(null);
const pendingBubbleShapeDraftRef = useRef<{ elId: string; points: number[] } | null>(null);
const [bubbleShapeDraft, setBubbleShapeDraft] = useState<{ elId: string; points: number[] } | null>(null);
const scheduleBubbleShapeDraft = (next: { elId: string; points: number[] }) => {
  pendingBubbleShapeDraftRef.current = next;
  if (bubbleShapeRafRef.current !== null) return;
  bubbleShapeRafRef.current = globalThis.requestAnimationFrame(() => {
    bubbleShapeRafRef.current = null;
    if (pendingBubbleShapeDraftRef.current) setBubbleShapeDraft(pendingBubbleShapeDraftRef.current);
  });
};
useEffect(() => () => {
  if (bubbleShapeRafRef.current !== null) globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
}, []);
useEffect(() => {
  void selectedId;
  bubbleShapeDragRef.current = null;
  pendingBubbleShapeDraftRef.current = null;
  if (bubbleShapeRafRef.current !== null) {
    globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
    bubbleShapeRafRef.current = null;
  }
  setBubbleShapeDraft(null);
  setBubbleShapeEditActive(false);
}, [selectedId]);
```

## 5. `bubbleShapeArmed`/`bubbleShapeHandles` 파생 상수 — 앵커: `const nodeEditArmed = …` /
`const nodeEditHandles: NodeEditHandle[] = …`(현재 4165~4172행) 바로 다음, `const smudgeArmed = …` 앞.

```ts
// 말풍선 커스텀 모양 점 편집 무장(bubble 선택 + customShapePoints 존재 + 편집 토글 on) — crop/
// node-edit 과 동일한 정책. decimateStrokeHandles 대신 전부를 핸들로(폴리곤은 이미 성글다).
const bubbleShapeArmed =
  bubbleShapeEditActive && selected?.type === "bubble" && hasCustomBubbleShape(selected.customShapePoints);
const bubbleShapeHandles: NodeEditHandle[] =
  bubbleShapeArmed && selected?.type === "bubble"
    ? bubbleShapePointHandles(
        bubbleShapeDraft?.elId === selected.id ? bubbleShapeDraft.points : (selected.customShapePoints ?? [])
      )
    : [];
```

## 6. `disarmAllPixelTools()` — 12번째 armed 상태로 추가

앵커: 함수 본문 마지막 줄 `setLayerMaskPaintActive(false);`(현재 4866행) 바로 다음(닫는 `}` 직전,
4867행).

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
    setBubbleShapeEditActive(false); // ← 추가
  }
```

이 함수 바로 위 주석의 "11종"을 "12종"으로 고쳐라(개수가 실제로 바뀐다). **주의**: 다른 미통합
배치(예: liquify)도 이 함수에 자기 항목을 추가하려 할 수 있다 — 병합 시 두 항목 모두 남기고
"N종" 숫자를 그에 맞게 조정할 것.

## 7. Escape 키 핸들러 — `nodeEditTool` 분기 다음, `healCloneTool` 분기 앞에 삽입

앵커(현재): `} else if (nodeEditTool) { setNodeEditTool(null); } else if (healCloneTool) {` 사이.

```ts
} else if (bubbleShapeEditActive) {
  setBubbleShapeEditActive(false);
  bubbleShapeDragRef.current = null;
} else if (healCloneTool) {
```

## 8. `onStageDown` — 새 브랜치 삽입(핸들 히트테스트 → 드래그 세션 시작)

앵커: 벡터 노드 편집 브랜치(`if (nodeEditArmed && selected?.type === "draw" && … ) { … return; }`,
현재 6882~6897행)가 끝난 다음, 문지르기 브랜치(`if (smudgeArmed && …`) 앞.

```ts
    // 말풍선 커스텀 모양 점 편집 무장 중: 포인터를 말풍선 로컬좌표로 변환해(회전 포함)
    // 노드 편집과 동일한 히트테스트/드래그 개시 로직을 재사용한다. 무장 중엔 핸들 밖 클릭도
    // 다른 제스처를 막는다 — crop/node-edit과 동일 정책.
    if (
      bubbleShapeArmed &&
      selected?.type === "bubble" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const local = bubbleShapeCanvasPointToLocal(pos.x, pos.y, {
        x: selected.x,
        y: selected.y,
        rotation: selected.rotation,
      });
      const tolerance = 14 / effScale; // crop/node-edit과 동일한 화면 14px 히트 여유
      const hitIdx = hitTestNodeHandle(local, bubbleShapeHandles, tolerance);
      if (hitIdx !== null) {
        const session = beginNodeDrag(selected.customShapePoints ?? [], undefined, hitIdx, "move", local);
        if (session) bubbleShapeDragRef.current = { elId: selected.id, session };
      }
      return;
    }
```

## 9. `onStageMove` — 드래그 중 점 위치 초안 갱신

앵커: 벡터 노드 편집 드래그 갱신 블록(`if (nodeEditDragRef.current) { … return; }`, 현재
7134~7158행)이 끝난 다음, 픽셀 선택 드래그 블록(`if (pixelDragRef.current) {`) 앞.

```ts
    // 말풍선 커스텀 모양 점 드래그 중이면 위치 초안을 갱신한다. nodeEdit과 동일하게 "커밋된
    // el.customShapePoints 기준 매 틱 재계산"(직전 draft 아님) — updateNodeDragMove의 시작
    // 스냅샷+델타 설계와 일치, 무누적오차.
    if (bubbleShapeDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const { elId, session } = bubbleShapeDragRef.current;
        const el = elementById.get(elId);
        if (el && el.type === "bubble" && hasCustomBubbleShape(el.customShapePoints)) {
          const local = bubbleShapeCanvasPointToLocal(pos.x, pos.y, { x: el.x, y: el.y, rotation: el.rotation });
          const { x, y } = updateNodeDragMove(session, local);
          scheduleBubbleShapeDraft({ elId, points: withPointMoved(el.customShapePoints, session.pointIndex, x, y) });
        }
      }
      return;
    }
```

## 10. `onStageUp` — 드래그 종료 시 커밋

앵커: 벡터 노드 편집 드래그 종료 블록(`if (nodeEditDragRef.current) { … return; }`, 현재
7453~7467행)이 끝난 다음, 픽셀 선택 드래그 종료 블록(`if (pixelDragRef.current) {`) 앞.

```ts
    // 말풍선 커스텀 모양 점 드래그 종료 — nodeEdit과 동일하게 이 pointerup 틱에서 ref로 바로
    // 커밋한다(state는 비동기라 마지막 프레임을 놓칠 수 있다).
    if (bubbleShapeDragRef.current) {
      const { elId } = bubbleShapeDragRef.current;
      bubbleShapeDragRef.current = null;
      if (bubbleShapeRafRef.current !== null) {
        globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
        bubbleShapeRafRef.current = null;
      }
      const finalDraft = pendingBubbleShapeDraftRef.current;
      pendingBubbleShapeDraftRef.current = null;
      setBubbleShapeDraft(null);
      if (finalDraft && finalDraft.elId === elId && elementById.get(elId)?.type === "bubble") {
        patchEl(elId, { customShapePoints: finalDraft.points } as Partial<El>);
      }
      return;
    }
```

## 11. 새 오버레이 컴포넌트 — `StudioNodeEditOverlay` 바로 다음에 추가

앵커: `function StudioNodeEditOverlay({ … }) { … }` 정의가 끝나는 지점(현재 2379행의 닫는 `}`)
바로 다음, `// 프레임 애니메이션 어니언스킨 …` 주석(`OnionSkinImage` 앞, 현재 2381행) 앞.

```tsx
// 말풍선 커스텀 모양 오버레이 — 폴리곤 점 핸들. DrawEl(페이지 절대좌표) 용인 StudioNodeEditOverlay와
// 달리 BubbleEl은 x/y/rotation 요소라, 점은 로컬(비스케일) 좌표 그대로 두고 Group에 x/y/rotation을
// 줘서 Konva가 회전·이동을 자동 적용하게 한다(호출부에서 좌표를 캔버스로 미리 변환할 필요 없음 —
// 히트테스트/드래그 쪽만 bubbleShapeCanvasPointToLocal로 역변환한다, §8 참고).
function StudioBubbleShapeOverlay({
  frame,
  handles,
  scale,
  activeHandleIndex,
}: {
  frame: { x: number; y: number; rotation: number };
  handles: NodeEditHandle[];
  scale: number;
  activeHandleIndex: number | null;
}) {
  return (
    <Group x={frame.x} y={frame.y} rotation={frame.rotation} listening={false}>
      {handles.map((h) => (
        <KCircle
          key={h.pointIndex}
          x={h.x}
          y={h.y}
          radius={5 / scale}
          fill={activeHandleIndex === h.pointIndex ? "#7c5cfc" : "#ffffff"}
          stroke="#18181b"
          strokeWidth={1.25 / scale}
        />
      ))}
    </Group>
  );
}
```

## 12. 오버레이 JSX 마운트

앵커: 벡터 노드 편집 오버레이 블록(`{!isExporting && nodeEditArmed && selected?.type === "draw" &&
(… <StudioNodeEditOverlay …/> …)}`, 현재 10980~10990행)이 끝난 다음, heal-clone 오버레이 블록
(`{!isExporting && healCloneArmed && …`) 앞.

```tsx
{/* 말풍선 커스텀 모양 오버레이 — 폴리곤 점 핸들(로컬좌표, Group이 x/y/rotation 자동 적용). */}
{!isExporting && bubbleShapeArmed && selected?.type === "bubble" && (
  <Layer listening={false}>
    <StudioBubbleShapeOverlay
      frame={{ x: selected.x, y: selected.y, rotation: selected.rotation }}
      handles={bubbleShapeHandles}
      scale={effScale}
      activeHandleIndex={bubbleShapeDragRef.current?.session.pointIndex ?? null}
    />
  </Layer>
)}
```

## 13. 렌더 로직 — `customShapePoints`가 있으면 variant 대신 폴리곤을 그린다

### 13-1. 라이브 오버라이드 변수 — 앵커: `const bubbleExtraTails = normalizeExtraTails(el.extraTails);`
(현재 10398행) 바로 다음, `const speechPathData = …`(현재 10399행) 앞.

```ts
                // 드래그 중이면 미확정 draft를(커밋 전 실시간 미리보기), 아니면 저장된 값을 쓴다 —
                // StudioDrawNode의 nodeEditDraft 병합과 동일한 관례.
                const liveCustomShapePoints =
                  bubbleShapeDraft?.elId === el.id ? bubbleShapeDraft.points : el.customShapePoints;
                const showCustomShape = hasCustomBubbleShape(liveCustomShapePoints);
```

### 13-2. tailHandle 억제 — 앵커: `const tailHandle = selectedId === el.id && showTail && !isExporting && (`
(현재 10516행). 커스텀 모양이 활성이면 꼬리가 이미 폴리곤에 구워져 있어 별도 꼬리 드래그 핸들이
쓸모없다(움직여도 화면에 반영 안 되는 죽은 컨트롤이 되므로 아예 숨긴다).

```ts
                const tailHandle = selectedId === el.id && showTail && !isExporting && !showCustomShape && (
```

### 13-3. 렌더 분기 — 앵커: 변형 삼항 체인의 첫 조건(`{el.variant === "shout" ? (`, 현재 10611행)
바로 앞에 새 조건 하나를 끼워 넣는다(체인 나머지는 그대로 — 삼항 연쇄라 앞에 하나 추가해도 뒤쪽
괄호는 안 바뀐다).

```tsx
                    {showCustomShape ? (
                      <Line
                        points={liveCustomShapePoints}
                        closed
                        fill={el.fill}
                        stroke={bStroke}
                        strokeWidth={bStrokeW}
                        lineJoin="round"
                        lineCap="round"
                      />
                    ) : el.variant === "shout" ? (
```

(기존 `el.variant === "shout" ? ( … ) : el.variant === "thought" ? ( … ) : … : ( <Path
data={speechPathData} … /> )` 체인은 한 글자도 바꾸지 않는다 — `showCustomShape ? (...) : ` 를 맨
앞에 붙이기만 하면 된다.)

`Line`은 이미 이 파일에서 import돼 쓰이고 있다(예: `scaredTailPts`/`phoneTailPts` 렌더) — 새 import
불필요.

## 14. 요소 드래그/클릭선택 잠금 — `draggable`/`onSelect` 두 곳에 `!bubbleShapeArmed` 추가

**이 항목을 놓치면 점 편집이 무장된 채로 캔버스를 드래그했을 때 "점 이동" 대신 말풍선 요소 자체가
이동해버리는 버그가 생긴다.**

앵커 1(`draggable` 계산, `!layerMaskPaintArmed;`로 끝나는 조건, 현재 10076~10086행):

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
                  !bubbleShapeArmed; // ← 추가
```

앵커 2(`onSelect` 계산, `!layerMaskPaintArmed && setSelectedId(el.id);`로 끝나는 조건, 현재
10090~10101행):

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
                      !bubbleShapeArmed && // ← 추가
                      setSelectedId(el.id);
```

## 15. 속성 패널 마운트 — "선택한 말풍선" 사이드바 그룹

### 15-1. 패널 삽입 지점 — 앵커: `selected.type === "bubble" && ( <> … </div> </> )}` 블록(말풍선
그림자 설정까지, 현재 12088~12276행)이 끝난 바로 다음, 꼬리 위치/방향 블록(`{selected.type ===
"bubble" && selected.variant !== "shout" && selected.variant !== "box" && (`, 현재 12277행) 앞에
삽입.

```tsx
              {selected.type === "bubble" && (
                <StudioBubbleShapePanel
                  hasCustomShape={hasCustomBubbleShape(selected.customShapePoints)}
                  active={bubbleShapeArmed}
                  pointCount={bubbleShapeHandles.length || Math.floor((selected.customShapePoints?.length ?? 0) / 2)}
                  onConvert={() => {
                    const input: BubbleShapeGeometryInput = {
                      width: selected.width,
                      height: selected.height,
                      theme: webtoonTheme,
                      tail: selected.tail,
                      tailDirection: selected.tailDirection,
                      tailXRatio: selected.tailXRatio,
                      tailHeight: selected.tailHeight,
                      extraTails: normalizeExtraTails(selected.extraTails),
                    };
                    const points = computeCustomShapePointsForBubble(input);
                    patchEl(selected.id, { customShapePoints: points } as Partial<El>);
                  }}
                  onToggleEdit={() => {
                    if (bubbleShapeEditActive) {
                      setBubbleShapeEditActive(false);
                      return;
                    }
                    disarmAllPixelTools();
                    setBubbleShapeEditActive(true);
                  }}
                  onRevert={() => {
                    setBubbleShapeEditActive(false);
                    patchEl(selected.id, { customShapePoints: undefined } as Partial<El>);
                  }}
                />
              )}
```

`pointCount`는 편집 모드가 꺼져 있을 때도(`bubbleShapeHandles`가 `[]`) 안내 문구에 쓸 점 개수를
보여주기 위해 `selected.customShapePoints`에서 직접 폴백 계산한다.

### 15-2. 꼬리 컨트롤 3곳을 커스텀 모양일 때 숨긴다 — 커스텀 모양이 활성화되면 꼬리가 이미 폴리곤에
구워져 있어 이 컨트롤들을 움직여도 화면에 반영되지 않는 죽은 UI가 된다.

세 곳 모두 조건 앞에 `!hasCustomBubbleShape(selected.customShapePoints) &&` 를 추가한다(현재
12277행, 12337행, 12356행 — 셋 다 `selected.type === "bubble" && selected.variant !== "shout" &&
selected.variant !== "box" &&` 로 시작하는 동일한 패턴):

```ts
{selected.type === "bubble" &&
  selected.variant !== "shout" &&
  selected.variant !== "box" &&
  !hasCustomBubbleShape(selected.customShapePoints) && (
```

## 16. `studio-svg-export.ts` — 내보내기 반영

### 16-1. 타입 필드 — 앵커: `SvgBubbleElLike` 의 마지막 필드(`shadowOpacity?: number;`, 현재 155행)
바로 다음, 닫는 `}`(156행) 앞.

```ts
  customShapePoints?: number[];
```

### 16-2. 렌더 분기 — 앵커: `if (el.variant === "shout" || el.variant === "angry") {`(현재 984행)
**를 `else if`로 바꾸고** 그 앞에 새 첫 분기를 추가한다. `pointsToPathD`는 이 파일에 이미 있는
private 헬퍼(예: scared 변형 꼬리 렌더에 이미 쓰인다, 현재 1041행)이므로 새 import가 필요 없다 —
**`studio-bubble-custom-shape.ts`의 `polygonPointsToPathData`는 여기서 쓰지 않는다**(§17-2 참고,
숫자 포맷 컨벤션을 이 파일 자체(`fmt()`)와 통일하기 위해).

```ts
  if (el.customShapePoints && el.customShapePoints.length >= 6) {
    body.push(
      `<path d="${pointsToPathD(el.customShapePoints, true)}" fill="${escapeXml(el.fill)}"${strokeAttrs} stroke-linejoin="round" stroke-linecap="round"/>`
    );
  } else if (el.variant === "shout" || el.variant === "angry") {
```

(체인의 나머지 `else if`들은 손대지 않는다 — 맨 위에 분기 하나 추가 + 기존 첫 줄의 `if`를 `else
if`로 바꾸는 것뿐이다.)

## 17. `studio-bubble-anchor` 연동 — 죽은 재계산 방지(선택적이지만 권장)

앵커: `applyBubbleAnchors` 함수의 첫 줄(`if (e.type !== "bubble" || (!e.tailAnchorId &&
!e.tailAnchorPoint)) return e;`, 현재 1176행).

```ts
    if (
      e.type !== "bubble" ||
      (!e.tailAnchorId && !e.tailAnchorPoint) ||
      hasCustomBubbleShape((e as { customShapePoints?: number[] }).customShapePoints)
    )
      return e;
```

이유: 이 함수는 매 커밋마다 부착된 말풍선의 `tailDirection`/`tailXRatio`/`tailHeight`를 앵커 대상
쪽으로 재계산한다 — 커스텀 모양이 활성화되면 그 필드들은 더 이상 렌더에 쓰이지 않으므로(꼬리가
폴리곤에 이미 구워짐) 재계산은 순수 낭비 연산이자, devtools/히스토리에서 "안 쓰는데 왜 계속
바뀌지?" 하는 혼란만 만든다. `applyBubbleAnchors`는 `studio-bubble-anchor.ts`가 아니라
`StudioPage.tsx` 안에 있는 함수이므로(1170행), import 추가 없이 `hasCustomBubbleShape`를 §3-1에서
이미 들여온 것을 그대로 쓰면 된다. `BubbleEl`을 이 함수의 파라미터 타입(`El[]`)이 아직 모르는 좁은
타입 캐스팅이 어색하면, `BubbleEl` 자체를 쓸 수 있는 위치이므로 캐스팅 없이 `e.customShapePoints`로
바로 접근해도 된다(위 스니펫의 캐스팅은 이 문서만 보고 타입 좁히기 맥락 없이 옮겨 적을 상황을
대비한 방어적 표기일 뿐이다).

## 18. 통합 후 수동 QA 체크리스트

- [ ] 말풍선 선택 → "커스텀 모양" 패널의 "커스텀 모양으로 전환" 클릭 → 현재 둥근 모서리·꼬리 위치가
      그대로인 폴리곤 윤곽으로 바뀐다(시각적으로 튀지 않아야 한다).
- [ ] 전환 직후 "편집 시작" → 폴리곤 위에 점 핸들이 촘촘히 나타난다 → 점 하나를 끌면 그 지점만
      움직이고 나머지는 고정된다(둥근 모서리는 각지게 변함 — 의도된 스코프, §스케치 편차 참고).
- [ ] 점 편집 무장 중 캔버스를 드래그해도 말풍선 요소 자체는 이동하지 않는다(§14 확인).
- [ ] ⌘Z로 각 점 이동이 히스토리 1건씩 정확히 되돌아간다.
- [ ] 회전된 말풍선(Transformer로 돌린 뒤)에서도 점 핸들이 화면상 올바른 위치에 보이고, 드래그 방향과
      실제 이동 방향이 화면 기준으로 일치한다(§8/§11의 로컬↔캔버스 변환 확인).
- [ ] "되돌리기" → `customShapePoints`가 지워지고 원래 variant(별/하트/구름 등)이 다시 보인다.
- [ ] 별(shout)/하트/생각(thought) 등 특수 variant에서 전환하면 그 실루엣이 아니라 둥근사각형(+꼬리)
      베이스 모양이 나타난다(의도된 축소 — §스케치 편차 1항).
- [ ] 커스텀 모양 활성 중엔 "꼬리 위치 & 방향"/앵커 부착 패널이 숨겨진다(§15-2).
- [ ] Esc 키로 점 편집 무장이 꺼진다. 다른 픽셀 도구(크롭/문지르기/복구브러시 등)를 켜면 점 편집이
      자동으로 꺼진다(`disarmAllPixelTools` 상호배제, §6).
- [ ] PNG/SVG 내보내기 둘 다에서 커스텀 모양이 반영된다(SVG는 §16, 캔버스 PNG는 기존 Konva 렌더
      파이프라인을 그대로 타므로 별도 확인 불필요 — 같은 `<Layer>` 트리를 내보낸다).
- [ ] `npx vitest run src/domains/creator/studio-bubble-custom-shape.test.ts` 그린 상태 유지,
      `npx tsc --noEmit -p tsconfig.json` / `npx eslint` 전체 클린.

## 19. 스케치 대비 편차(§5, 의도적 스코프 축소·구현 선택)

1. **완전한 베지어 핸들 편집이 아니라 폴리곤 점 편집이다.** 전환 시점에 둥근 모서리·꼬리 곡선을
   직선 세그먼트로 근사(`samplesPerCurve`개 점)한다 — 이후 점을 옮기면 그 근방은 각지게 보인다(다시
   둥글게 만들려면 사용자가 점을 더 세밀하게 옮겨야 한다). 점 추가/삭제 기능은 없다(위치 이동만) —
   프롬프트가 명시한 "완전한 베지어 핸들 편집이 아니라 폴리곤 점 편집" 스코프를 그대로 따른 것이다.
2. **variant의 고유 실루엣(별/하트/구름/시스템 패널 등)은 폴리곤화 대상이 아니다.** "커스텀 모양으로
   전환"은 항상 그 시점의 테마·꼬리 설정으로 계산한 **둥근사각형(+꼬리) 베이스 모양**(=speech/whisper
   변형이 그리는 것과 동일한 윤곽)에서 시작한다 — shout/thought/heart/system/scared/phone/angry에서
   전환해도 별/하트 모양 자체가 아니라 이 베이스 모양이 나타난다. 프롬프트가 "기존 bubblePathData
   결과를 샘플링"이라고 명시적으로 지정했으므로, 특수 실루엣 variant마다 별도 폴리곤화 로직을 만드는
   대신 이 쪽으로 스코프를 좁혔다 — 사용자가 원하는 형태는 전환 후 점을 옮겨 직접 조각하면 된다
   (애초에 이 기능의 목적이 "자유 조각"이라 베이스가 특수 실루엣이 아니어도 결과물엔 지장 없다).
3. **곡선 근사 워커는 SVG path 문자열을 직접 파싱한다**(코너/노치 기하 공식을 별도로 재구현하지
   않음) — `bubblePathData`/`bubblePathDataMulti`가 실제로 내는 명령 집합(`M/L/H/V/A/Q/Z`)만 이해하는
   전용 미니 파서다(범용 SVG path 파서가 아니다). 이 방식은 코너 개수·꼬리 개수(0~3개, 다중 꼬리
   포함)를 하나의 코드 경로로 자동 처리하고, 향후 `bubblePathData` 내부 구현이 바뀌어도(같은 명령
   집합을 유지하는 한) 자동으로 맞는 모양을 샘플링한다는 장점이 있다. 반대로 향후 그 함수가 새로운
   SVG 명령(예: 3차 베지어 `C`)을 쓰게 되면 이 워커도 함께 갱신해야 한다(동기화 계약 — 모듈
   docstring에 명시).
4. **`computeBubbleShapeGeometry`는 StudioPage 렌더 루프의 기존 인라인 테마 파라미터 계산(bRadius/
   bTailLen/bTailBase 등, 현재 10327~10398행)과 별개로 동일 공식을 담고 있다 — 리팩터로 완전히
   통합(렌더 루프가 이 함수를 직접 호출하도록 교체)하지 않았다.** 그 인라인 블록은 `bStroke`/
   `bShadowColor` 등 색상·그림자 파라미터와 하나의 if/else 사슬에 뒤섞여 있어, 통합하려면 기존
   렌더링에 실질적인 회귀 위험을 지는 리팩터가 필요하다 — "전환" 버튼 하나를 위해 그 위험을 지는
   대신, 동일 수식을 복제해 두는 쪽을 택했다(두 계산 모두 이 문서 작성 시점 기준 검증된 동일
   숫자를 낸다 — §1-4). **향후 렌더 루프의 테마 공식이 바뀌면 `computeBubbleShapeGeometry`도 함께
   고쳐야 한다**(그렇지 않으면 "전환" 버튼이 그 순간 화면에 보이는 모양과 미세하게 다른 폴리곤을
   만들 수 있다) — 이 동기화 부담이 부담스러우면, 후속 리팩터로 렌더 루프 쪽을 이 함수 호출로
   바꾸는 것을 권장한다(위험을 감수할 가치가 있다고 판단되면).
5. **드래그 중 실시간 rAF 배칭(`bubbleShapeDraft`)은 사실 폴리곤 점이 적어(~20~40개) 없어도 될
   만큼 저렴하지만, `nodeEditDraft`와 동일한 패턴을 그대로 따랐다** — 이 코드베이스의 기존 관례
   일관성을 우선했다(다른 점편집형 기능도 전부 이 패턴이라, 다르게 하면 오히려 유지보수 시
   혼란스럽다).
6. **핸들 표시는 전부(decimate 없음)다.** `studio-node-edit.ts`의 `decimateStrokeHandles`는 자유선의
   수백~수천 점을 성기게 솎아내기 위한 것이라 여기 맞지 않는다 — 애초에 샘플링 단계에서 이미 성기게
   (곡선당 6점 안팎) 만들어지므로 전부 노출해도 화면이 복잡해지지 않는다.
7. **"되돌리기"는 `customShapePoints`를 완전히 지운다**(원래 폴리곤을 어딘가 보관해 "다시 전환"
   시 이전 편집 내용을 복원하는 기능은 없음) — 되돌린 뒤 다시 "커스텀 모양으로 전환"을 누르면 매번
   그 시점의 테마·꼬리 설정 기준 새 폴리곤이 만들어진다(이전 편집 내용은 사라진다, ⌘Z로만 복구
   가능). 실행 취소 스택이 이미 이 역할을 하므로 별도 "이전 커스텀 모양 기억" 기능은 과한 스코프로
   판단해 생략했다.
8. **SVG 내보내기의 `pointsToPathD`(studio-svg-export.ts 기존 private 함수)와 이 배치의
   `polygonPointsToPathData`(studio-bubble-custom-shape.ts)는 기능이 겹친다.** 의도적으로 통합하지
   않았다 — 전자는 그 파일의 숫자 포맷 컨벤션(`fmt()`, 소수 둘째 자리+ 꼬리 0 제거)을 쓰고 후자는
   이 배치 자체의 포맷(`Math.round(n*100)/100`)을 쓴다, 미세하게 다르다. `studio-svg-export.ts`를
   이 세션에서 수정하지 않기로 한 원칙과 별개로, 두 함수를 하나로 합치는 리팩터는 이번 스코프
   밖이라 판단했다(둘 다 정답이고, 결과 문자열이 시각적으로 동일한 path를 그린다).
