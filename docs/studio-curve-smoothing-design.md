# Studio Curve Smoothing("스무딩" 노드 편집 3번째 도구) — 설계 문서

> 이 문서가 다루는 범위: **새 파일 2개는 이미 작성·테스트 완료됨** —
> `src/domains/creator/studio-curve-smoothing.ts`(순수 로직, 25개 유닛 테스트 전부 통과),
> `src/domains/creator/studio-curve-smoothing.test.ts`.
> 이 세션에서는 **`StudioPage.tsx`·`studio-node-edit.ts`·`StudioNodeEditPanel.tsx` 를 의도적으로
> 건드리지 않았다**(프로젝트 규칙 — 병렬 워크플로가 같은 파일명으로 서로 다른 구현을 만드는 사고를
> 막기 위해 이 세션은 새 파일만 만든다). 아래 내용은 후속 통합 패스가 정확히 어디에 무엇을
> 추가해야 하는지에 대한 지시서다. 라인 번호는 이 문서 작성 시점(`StudioPage.tsx` 15,047줄,
> `studio-node-edit.ts` 292줄, `StudioNodeEditPanel.tsx` 109줄) 기준이며, 특히 `StudioPage.tsx`는
> 계속 자라는 단일 거대 파일이라 통합 시점엔 몇 줄 어긋나 있을 수 있다 — 각 항목의 "앵커
> 텍스트"(정확히 일치해야 하는 기존 코드 조각)로 검색해 위치를 재확인할 것.

## 0. 한 줄 요약

기존 `studio-node-edit`("이동"/"굵기" 2개 도구)에 세 번째 도구 **"스무딩"**을 추가한다. 사용자가
선 위의 한 점(anchor)을 고르면, 그 점 앞뒤로 호길이 60px 반경 안의 인접 점들을 창(window)으로
묶고, 그 창을 대표하는 축소된 Catmull-Rom 목표 곡선을 한 번 계산한 뒤, 창 안의 모든 점을 원본
위치→목표 곡선 위 대응 위치 사이에서 강도(strength 0..1, 슬라이더+세로 드래그로 조절)만큼
선형 블렌드한다. **완전한 벡터 펜 도구(앵커+접선 핸들 드래그)가 아니라 Illustrator "패스
단순화(Simplify)"에 가까운 사후 스무딩**이다 — §5 참고.

---

## 1. 새로 만든 파일 2개

### 1.1 `src/domains/creator/studio-curve-smoothing.ts` (순수 로직)

| 구분 | export |
|---|---|
| 타입 | `Point2`, `SmoothWindow`, `SmoothPointsOptions` |
| 상수 | `NODE_SMOOTH_RADIUS_PX`(60), `NODE_SMOOTH_MIN_WINDOW_POINTS`(5), `NODE_SMOOTH_KEY_DIVISOR`(4), `NODE_SMOOTH_MIN_KEY_POINTS`(3), `NODE_SMOOTH_DRAG_RANGE_PX`(160), `NODE_SMOOTH_DEFAULT_STRENGTH`(0.4) |
| Catmull-Rom 공식 | `catmullRomPoint`(4점 3차 보간), `evaluateCatmullRomChain`(제어점 배열 위 전체 파라미터 평가, clamped/열린 곡선) |
| 창 산정 | `findSmoothWindow`(anchor 기준 앞뒤 호길이 반경 스캔) |
| 메인 진입점 | `smoothPointsAroundIndex(points, anchorIndex, strength, opts?)` → **새** points 배열(불변, 길이 항상 원본과 동일) |
| 드래그 스칼라 갱신 | `updateSmoothStrengthDrag(baselineStrength, startPointerY, pointerY, rangePx?)` |

`studio-node-edit.ts` 의 `nodeEditPointCount`/`pointAt` 를 그대로 재사용(import, 그 파일은 수정
안 함). DOM/Konva 의존성 없음.

**핵심 설계 결정(자세한 근거는 파일 상단 주석 참고, 특히 초기 구현에서 실제로 잡은 버그인 4번은
절대 되돌리지 말 것)**:

1. **목표 곡선(target)은 strength 와 무관하게 창 하나당 정확히 한 번만 계산된다.** strength 는
   원본과 목표 곡선 사이의 선형 블렌드 비율일 뿐이다 — 그래서 슬라이더를 움직이는 동안 모든 점이
   완전히 선형(=매끄럽고 단조적)으로 움직인다.
2. **창 경계(lo/hi)는 항상 원래 위치 그대로 고정된다** — Catmull-Rom 은 자신의 제어점을 정확히
   지나가는 보간 스플라인이고, 제어점 목록에 항상 창의 첫/끝 원본 점을 포함시키므로 t=0/t=1 에서
   목표 곡선이 원본 lo/hi 와 정확히 같아진다. 스무딩 구간과 창 밖 나머지 스트로크 사이에 꺾임
   (seam)이 생기지 않는 이유다.
3. **점 개수(및 `pressures` 배열 인덱스 정렬)를 절대 바꾸지 않는다** — 창 안의 점 개수 그대로
   유지한 채 각 점의 (x,y)만 새로 계산해 덮어쓴다. `withPressureEdited`/`decimateStrokeHandles` 등
   `studio-node-edit` 의 나머지 코드가 전부 "pointIndex 는 고정 인덱스"라고 가정하기 때문이다.
4. **목표 곡선의 제어점 후보에서 anchor 자신의 원본 좌표는(창 경계가 아닌 한) 항상 제외한다.**
   `findSmoothWindow` 는 anchor 로부터 앞뒤로 대칭에 가깝게 스캔하므로, 균일한 간격의 프리핸드
   스트로크에서는 anchor 가 거의 항상 창의 "중앙" 인덱스가 된다. 초기 구현(제어점 개수를 strength
   에 따라 줄이는 방식)에서는 이 중앙 슬롯이 하필 anchor 자신과 정확히 겹치는 경우가 흔해,
   "사용자가 스무딩하려는 바로 그 점"이 목표 곡선의 제어점이 되어버려 strength 를 아무리 올려도
   전혀 안 움직이는 역설이 실제로 재현됐다(유닛 테스트로 잡았다 — 아래 §1.1a 참고). anchor 를
   후보 풀에서 제외하면 목표 곡선이 그 위치에서 항상 "이웃들이 암시하는" 값을 지나가 anchor 도
   다른 점들과 똑같이 단조적으로 움직인다.

#### §1.1a 유닛 테스트로 실제로 잡은 회귀(후속 패스가 이 파일을 건드릴 때 절대 깨면 안 되는 것)

`studio-curve-smoothing.test.ts` 의 "톱니 스파이크 한 점은 강도가 커질수록 기준선에 더
가까워진다" 테스트가 정확히 위 4번 문제를 검증한다 — 직선 폴리라인 중앙에 y 값만 튀는 점 하나를
넣고, strength=0.2 일 때보다 strength=1 일 때 그 점이 기준선(y=0)에 더 가까워지는지 확인한다.
"제어점 개수를 strength 에 따라 줄이는" 초기 버전에서는 이 테스트가 **실패**했다(strength=1 에서
스파이크가 전혀 안 움직이는데 strength=0.2 에서는 움직이는 역전 현상). 지금 구현(제어점 개수는
창 크기로만 고정, anchor 는 후보에서 제외)은 이 테스트를 포함해 25개 테스트 전부 통과한다.

### 1.2 `src/domains/creator/studio-curve-smoothing.test.ts`

`studio-node-edit.test.ts` 와 동일한 스타일(`straightLinePoints` 헬퍼 재사용 패턴)로 25개 케이스:
Catmull-Rom 보간 성질(t=0/1 정확히 제어점과 일치, 등간격 공선 제어점은 순수 선형과 일치), 창
산정의 경계, `smoothPointsAroundIndex` 의 불변성(strength=0 무변화·길이 불변·창 경계 고정·창 밖
무변화·범위 밖 anchor 방어·결정성·strength 클램프), 스파이크 회귀 테스트(§1.1a), 드래그 스칼라
갱신의 부호 규약·클램프. `npx vitest run src/domains/creator/studio-curve-smoothing.test.ts` 로
확인 완료(25 passed).

---

## 2. `studio-node-edit.ts` 통합 지점 (실제 수정은 후속 패스가 수행)

### 2.1 `NodeEditTool` 타입 확장 — 라인 20

```ts
export type NodeEditTool = "move" | "width";
```
을
```ts
export type NodeEditTool = "move" | "width" | "smooth";
```
로 바꾼다. **이 타입 변경 하나가 나머지 통합의 대부분을 "그냥 컴파일되게" 만든다** —
`beginNodeDrag`/`NodeDragSession`/`updateNodeDragMove`/`updateNodeDragWidth` 는 전부 `tool` 필드를
그저 보관/전달만 할 뿐 그 값으로 분기하지 않으므로(분기는 전부 `StudioPage.tsx` 쪽에 있다) 이
파일의 나머지 코드는 **손댈 필요가 없다**.

### 2.2 `NODE_EDIT_TOOLS` 배열에 항목 추가 — 라인 45-48

```ts
export const NODE_EDIT_TOOLS: { id: NodeEditTool; label: string; tip: string }[] = [
  { id: "move", label: "이동", tip: "핸들을 끌어 그 지점의 위치를 옮깁니다." },
  { id: "width", label: "굵기", tip: "핸들을 위아래로 끌어 그 지점의 필압(굵기)을 조절합니다." },
  {
    id: "smooth",
    label: "스무딩",
    tip: "핸들을 위로 끌거나 강도 슬라이더를 올려 그 점 주변 구간을 부드럽게 다듬습니다.",
  },
];
```

`StudioNodeEditPanel.tsx` 의 도구 칩 목록은 이 배열을 그대로 `.map()` 하므로(§4.2 참고), **이
한 줄만 추가하면 칩 UI 자체는 패널 파일을 건드리지 않고도 이미 생긴다** — 패널 쪽 수정은
강도 슬라이더 UI(§4)만 남는다.

---

## 3. `StudioPage.tsx` 통합 지점

### 3.1 import 추가 — 라인 168(`} from "./studio-crop";`) 뒤, 라인 169
(`import {\n  applyDialogueTextEdit,`) 앞. 알파벳 순서상 `studio-crop`과 `studio-dialogue-batch`
사이(`studio-curve-smoothing` < `studio-dialogue-batch`):

```tsx
import {
  NODE_SMOOTH_DEFAULT_STRENGTH,
  NODE_SMOOTH_DRAG_RANGE_PX,
  smoothPointsAroundIndex,
  updateSmoothStrengthDrag,
} from "./studio-curve-smoothing";
```

(`studio-node-edit`import 블록, 현재 라인 269-286, 은 `type NodeEditTool` 를 이미 import 하고
있으므로 그쪽은 손댈 필요 없다 — §2.1 의 타입 확장은 그 export 를 그대로 다시 export 하는
것이므로 import 구문 자체는 그대로 유효하다.)

### 3.2 상태 선언 — 라인 3956-3966 의 기존 `useEffect`(selectedId 변경 시 `nodeEditDraft`/
`nodeEditTool` 리셋) **바로 뒤**, 라인 3967(`// ── 복구 브러시/도장...`) **바로 앞**에 삽입:

```tsx
// 벡터 노드 편집 "스무딩" 도구 전용 상태 — studio-curve-smoothing 통합.
// nodeSmoothStrength 는 healCloneRadius/Hardness/Opacity 와 동일한 "사용자 선호값" 관례를 따른다
// (요소·선택이 바뀌어도 리셋하지 않는다 — 그래서 위 useEffect 의 selectedId 리셋 목록에 넣지
// 않았다: 사용자가 이전에 맞춘 강도를 다음 스트로크에도 그대로 이어 쓰길 기대한다).
const [nodeSmoothStrength, setNodeSmoothStrength] = useState(NODE_SMOOTH_DEFAULT_STRENGTH);
// "스무딩" 핸들 드래그 시작 시점의 강도 스냅샷 — updateSmoothStrengthDrag 의 기준선(baseline).
// NodeDragSession.startPressure 는 "너비" 도구의 필압 개념이라 스무딩 강도를 담을 자리가 없어
// (studio-node-edit.ts 는 이 배치에서 수정하지 않는다) 별도 ref 로 스냅샷한다.
const nodeSmoothStrengthAtDragStartRef = useRef(NODE_SMOOTH_DEFAULT_STRENGTH);
```

### 3.3 `nodeEditArmed`/`nodeEditHandles`(라인 4165-4172) — **변경 없음.**
`nodeEditTool !== null` 판정과 `decimateStrokeHandles` 호출 둘 다 어떤 하위 도구인지 신경 쓰지
않는다 — "smooth" 도 그대로 무장되고 핸들도 그대로 뽑힌다.

### 3.4 `disarmAllPixelTools()`(라인 4855-4867) — **변경 없음(중요).**
"스무딩"은 새로운 armed 불리언 상태가 아니라 **기존 `nodeEditTool` 의 세 번째 값**이므로,
이미 있는 `setNodeEditTool(null);` 한 줄이 "스무딩" 모드도 그대로 끈다. 함수 상단 주석의
"도구 11종"이라는 개수도 그대로 유지된다(새 도구가 아니라 기존 도구의 하위 모드 추가이기
때문). **새 `setXxx(null)` 줄을 여기 추가하려는 유혹을 참을 것** — 추가할 게 없다는 것 자체가
이 통합의 특징이다(퍼펫 워프 배치의 "onStageMove/Up 변경 없음"과 같은 종류의 의도적 무변경).

### 3.5 onStageDown — 기존 히트테스트 블록(라인 6880-6897) 안에 **3줄 변경**(1줄 스냅샷 추가,
그 결과로 단일 구문이 블록으로 바뀜):

```tsx
    // 벡터 노드 편집 무장 중: 핸들 히트테스트 후 드래그 세션을 연다. 무장 중엔 핸들 밖 클릭도
    // 마퀴 등 다른 제스처를 막는다 — crop/pixel 과 동일 정책.
    if (
      nodeEditArmed &&
      selected?.type === "draw" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const tolerance = 14 / effScale; // 화면 14px, crop 의 hitTolerance 관례와 동일
      const hitIdx = hitTestNodeHandle(pos, nodeEditHandles, tolerance);
      if (hitIdx !== null) {
        const session = beginNodeDrag(selected.points, selected.pressures, hitIdx, nodeEditTool!, pos);
        if (session) {
          nodeEditDragRef.current = { elId: selected.id, session };
          // ← 추가: "스무딩" 드래그의 강도 기준선을 스냅샷(다른 도구에선 참조되지 않아 무해).
          nodeSmoothStrengthAtDragStartRef.current = nodeSmoothStrength;
        }
      }
      return;
    }
```

(기존엔 `if (session) nodeEditDragRef.current = { elId: selected.id, session };` 단일 구문이었던
것을 블록으로 바꾸고 스냅샷 한 줄을 추가하는 것뿐이다.)

### 3.6 onStageMove — `nodeEditDragRef.current` 블록(라인 7134-7158) 안의 분기 확장:

현재:
```tsx
          if (session.tool === "move") {
            const { x, y } = updateNodeDragMove(session, pos);
            scheduleNodeEditDraft({
              elId,
              points: withPointMoved(el.points, session.pointIndex, x, y),
              pressures: el.pressures ?? [],
            });
          } else {
            const pressure = updateNodeDragWidth(session, pos, NODE_EDIT_WIDTH_DRAG_RANGE_PX / effScale);
            scheduleNodeEditDraft({
              elId,
              points: el.points,
              pressures: withPressureEdited(el.pressures, Math.floor(el.points.length / 2), session.pointIndex, pressure),
            });
          }
```

를 (마지막 `else` 를 `else if (session.tool === "width")` 로 명시하고, "smooth" 전용 `else`
분기를 새로 추가):

```tsx
          if (session.tool === "move") {
            const { x, y } = updateNodeDragMove(session, pos);
            scheduleNodeEditDraft({
              elId,
              points: withPointMoved(el.points, session.pointIndex, x, y),
              pressures: el.pressures ?? [],
            });
          } else if (session.tool === "width") {
            const pressure = updateNodeDragWidth(session, pos, NODE_EDIT_WIDTH_DRAG_RANGE_PX / effScale);
            scheduleNodeEditDraft({
              elId,
              points: el.points,
              pressures: withPressureEdited(el.pressures, Math.floor(el.points.length / 2), session.pointIndex, pressure),
            });
          } else {
            // "smooth" — 세로 드래그는 위치가 아니라 강도(0..1)를 조절한다("굵기"와 동일한 부호
            // 규약: 위로 끌수록 값 증가). 드래그 시작 시점 강도(nodeSmoothStrengthAtDragStartRef)를
            // 기준선으로 매 틱 다시 계산한다 — updateNodeDragWidth 가 session.startPressure 를
            // 기준선으로 삼는 것과 동일한 "무누적오차" 패턴(el.points 도 매 틱 커밋된 원본에서
            // 다시 계산하므로 스무딩이 이전 틱의 결과 위에 누적되지 않는다).
            const strength = updateSmoothStrengthDrag(
              nodeSmoothStrengthAtDragStartRef.current,
              session.startPointerY,
              pos.y,
              NODE_SMOOTH_DRAG_RANGE_PX / effScale
            );
            setNodeSmoothStrength(strength); // 패널 슬라이더도 실시간으로 같은 값을 보여준다.
            scheduleNodeEditDraft({
              elId,
              points: smoothPointsAroundIndex(el.points, session.pointIndex, strength),
              pressures: el.pressures ?? [],
            });
          }
```

**주의**: `el.points`(커밋된 원본, `elementById.get(elId)` 로 매 틱 새로 읽음)를 기준으로
`smoothPointsAroundIndex` 를 매번 다시 계산해야 한다 — `nodeEditDraft`(직전 미리보기, 이미
스무딩이 일부 적용된 상태)를 기준으로 계산하면 스무딩이 프레임마다 중첩 적용되어 강도를 낮춰도
원래대로 안 돌아가는 버그가 생긴다. 이미 위 코드가 `elementById.get(elId)` 에서 얻은 `el.points`
를 쓰고 있으므로(기존 move/width 분기와 동일하게) 이 함정은 자동으로 피해진다 — 새로 추가하는
분기가 실수로 `nodeEditDraft?.points` 를 참조하지 않도록만 주의하면 된다.

### 3.7 onStageUp 커밋 블록(라인 7450-7467) — **변경 없음.**
이 블록은 `nodeEditDragRef.current` 가 있으면 그 안의 `elId` 로 `pendingNodeEditDraftRef.current`
를 읽어 `patchEl(elId, { points, pressures })` 하나만 호출한다 — `session.tool` 이 무엇인지 전혀
보지 않는 완전히 제네릭한 커밋이라 "스무딩"도 이미 그대로 동작한다.

### 3.8 Esc 키 체인(라인 5766-5799 안의 5780-5781) — **변경 없음.**
```tsx
} else if (nodeEditTool) {
  setNodeEditTool(null);
```
이미 "어떤 하위 도구든" 끄는 제네릭 분기라 손댈 필요 없다.

### 3.9 `draggable`/`onSelect` 가드 체인(라인 10076-10101) — **변경 없음.**
`!nodeEditArmed` 하나로 세 하위 도구를 전부 커버한다(§3.3 과 같은 이유).

### 3.10 `StudioNodeEditOverlay`(라인 2347-2379) — 핸들 색상에 "스무딩" 분기 추가:

현재:
```tsx
        const isActive = activeHandleIndex === h.pointIndex;
        const r = tool === "width" ? (4 + pressureAt(pressures, h.pointIndex) * 8) / scale : 5 / scale;
        return (
          <KCircle
            key={h.pointIndex}
            x={h.x}
            y={h.y}
            radius={r}
            fill={tool === "width" || isActive ? "#7c5cfc" : "#ffffff"}
            stroke="#18181b"
            strokeWidth={1.25 / scale}
          />
        );
```

를:
```tsx
        const isActive = activeHandleIndex === h.pointIndex;
        const r = tool === "width" ? (4 + pressureAt(pressures, h.pointIndex) * 8) / scale : 5 / scale;
        // "스무딩" 은 핸들 크기로 표현할 스칼라가 없다(강도는 도구 전역 값이지 핸들별 값이 아니다)
        // — 색만 청록(#14b8a6)으로 구분해 "굵기"(보라)와 헷갈리지 않게 한다.
        const fill = isActive
          ? tool === "smooth"
            ? "#0f766e"
            : "#7c5cfc"
          : tool === "width"
            ? "#7c5cfc"
            : tool === "smooth"
              ? "#14b8a6"
              : "#ffffff";
        return (
          <KCircle
            key={h.pointIndex}
            x={h.x}
            y={h.y}
            radius={r}
            fill={fill}
            stroke="#18181b"
            strokeWidth={1.25 / scale}
          />
        );
```

로 바꾼다. (선택사항·스코프 아님: 창(lo..hi) 범위를 드래그 중에 옅게 하이라이트하는 것도 가능하지만,
`StudioNodeEditOverlay` 는 현재 `points`/반경 옵션을 받지 않으므로 새 prop 이 필요해진다 — §5.6 에서
의도적으로 스코프 밖으로 뺐다.)

### 3.11 오버레이 마운트(라인 10979-10990) — **변경 없음.** `tool={nodeEditTool!}` 를 그대로
넘기고 있어 §3.10 의 내부 분기가 알아서 처리한다.

### 3.12 패널 마운트(라인 12015-12033) — `<StudioNodeEditPanel>` 호출에 props 2개 추가:

현재:
```tsx
                      <StudioNodeEditPanel
                        active={nodeEditTool !== null}
                        tool={nodeEditTool ?? "move"}
                        handleCount={nodeEditHandles.length}
                        widthModeSupported={isPressureWidthBrush(selected.brush, selected.mode)}
                        onToggle={() => {
                          if (nodeEditTool) {
                            setNodeEditTool(null);
                            return;
                          }
                          disarmAllPixelTools();
                          setNodeEditTool("move");
                        }}
                        onToolChange={(t) => setNodeEditTool(t)}
                      />
```

를:
```tsx
                      <StudioNodeEditPanel
                        active={nodeEditTool !== null}
                        tool={nodeEditTool ?? "move"}
                        handleCount={nodeEditHandles.length}
                        widthModeSupported={isPressureWidthBrush(selected.brush, selected.mode)}
                        smoothStrength={nodeSmoothStrength}
                        onSmoothStrengthChange={setNodeSmoothStrength}
                        onToggle={() => {
                          if (nodeEditTool) {
                            setNodeEditTool(null);
                            return;
                          }
                          disarmAllPixelTools();
                          setNodeEditTool("move");
                        }}
                        onToolChange={(t) => setNodeEditTool(t)}
                      />
```

---

## 4. `StudioNodeEditPanel.tsx` 통합 지점

### 4.1 Props 타입 확장 — 라인 18-29 `StudioNodeEditPanelProps`:

```tsx
export type StudioNodeEditPanelProps = {
  active: boolean;
  tool: NodeEditTool;
  handleCount: number;
  widthModeSupported: boolean;
  /** "스무딩" 도구의 현재 강도(0..1) — 강도 슬라이더의 값이자, 다음 캔버스 드래그의 시작
   * 기준선이기도 하다(StudioPage 의 nodeSmoothStrength 상태를 그대로 반영). */
  smoothStrength: number;
  onToggle: () => void;
  onToolChange: (tool: NodeEditTool) => void;
  onSmoothStrengthChange: (strength: number) => void;
};
```

(alphabetical/논리적 위치는 자유 — 기존 필드 순서를 크게 흩트리지 않는 선에서 `widthModeSupported`
바로 뒤에 두는 것을 권장.)

### 4.2 함수 시그니처(라인 31-38)에 `smoothStrength`/`onSmoothStrengthChange` 추가:

```tsx
export function StudioNodeEditPanel({
  active,
  tool,
  handleCount,
  widthModeSupported,
  smoothStrength,
  onToggle,
  onToolChange,
  onSmoothStrengthChange,
}: StudioNodeEditPanelProps): ReactElement {
```

### 4.3 도구 칩 목록(라인 61-80) — **변경 없음.** `NODE_EDIT_TOOLS.map(...)` 가 `studio-node-edit.ts`
§2.2 에서 추가한 "스무딩" 항목을 그대로 렌더링한다. `disabled = t.id === "width" && !widthModeSupported`
조건도 `"smooth"` 에는 적용되지 않아(항상 활성) 그대로 둔다.

### 4.4 강도 슬라이더 — `widthModeSupported` 안내 블록(현재 라인 83-88, `{!widthModeSupported && (...)}`)
**바로 앞**에 삽입(즉, 도구 칩 `<div>` 를 닫는 라인 81 `</div>` 바로 뒤):

```tsx
          {tool === "smooth" && (
            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              스무딩 강도
              <span className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={smoothStrength}
                  onChange={(e) => onSmoothStrengthChange(Number(e.target.value))}
                  className="w-24 accent-accent cursor-pointer"
                  aria-label="스무딩 강도"
                />
                <span className="w-8 text-right text-[10px] tabular-nums text-fg-3">
                  {smoothStrength.toFixed(2)}
                </span>
              </span>
            </label>
          )}
```

(스타일 클래스는 `StudioBlurPanel.tsx`/`StudioLineCleanupPanel.tsx` 등 기존 슬라이더 관례에서 그대로
가져온 것 — 이 패널만의 새 스타일을 만들 필요 없다.)

이 슬라이더는 **"다음 드래그의 시작 강도"를 설정하는 컨트롤**이지, 지금 당장 캔버스의 점을
움직이는 컨트롤이 아니다(핸들을 아직 안 골랐으면 아무 시각적 변화가 없다 — 정상). 실제로 점을
움직이는 건 언제나 "핸들을 세로로 드래그"하는 캔버스 제스처뿐이다(§5.2 참고, 크롭/heal-clone과
달리 "적용" 버튼이 없는 node-edit 의 기존 정책과 일관되게, 그 드래그 자체가 즉시 반영+커밋된다).

### 4.5 안내 문구(라인 90-100) — `handleCount < 2` 안내와 별개로, `tool === "smooth"` 일 때 힌트 문장
한 줄을 추가하는 것을 권장(필수는 아님):

```tsx
          {tool === "smooth" && handleCount >= 2 && (
            <p className="text-[0.68rem] text-fg-3">
              핸들을 고른 뒤 위로 끌면 더 부드럽게, 아래로 끌면 원본에 가깝게 다듬어집니다. 슬라이더는
              다음 드래그의 시작 강도를 정합니다.
            </p>
          )}
```

---

## 5. 스케치 대비 편차 · 알려진 한계 (필수 명시 섹션)

1. **완전한 벡터 펜 도구(앵커+접선 핸들 드래그)가 아니다.** 사용자가 직접 진입/이탈 접선 핸들을
   잡고 당겨 곡률을 만드는 Illustrator 펜 도구 방식은 스코프 밖으로 명시적으로 뺐다(원 지시에서도
   이 방향을 명시함). 대신 "이 구간을 얼마나 부드럽게 만들지"를 스칼라 하나로 조절하는 방식 —
   Illustrator의 "패스 단순화(Simplify)" 슬라이더에 더 가깝다. 곡선의 정확한 접선 방향/길이를
   직접 지정할 수 없다.

2. **"핸들을 직접 드래그하는" 제스처가 완전히 사라진 건 아니다 — 의미가 다르다.** §3.6 처럼
   캔버스에서 핸들을 세로로 끄는 동작 자체는 남아 있지만(굵기 도구와 동일한 상호작용 패턴 재사용,
   학습 비용 최소화), 그 드래그는 핸들을 실제로 옮기는 게 아니라 강도 스칼라 하나를 조절할 뿐이다.
   패널의 강도 슬라이더는 그 값을 미리 설정/미세조정하는 보조 컨트롤이다. "핸들을 드래그해도 그
   지점이 자유 곡선으로 재형성되는 게 아니라 강도만 바뀐다"는 점이 처음 쓰는 사용자에게는 약간
   비직관적일 수 있다 — 패널 힌트 문구(§4.5)로 이를 보완했다.

3. **창 반경(60px)은 고정 상수다 — 사용자가 "스무딩 범위"를 직접 조절할 수 없다.** 원 지시가
   슬라이더 하나("스무딩 강도")만 요구했으므로, 반경까지 슬라이더 2개로 늘리는 대신 상수로
   고정했다. 반경을 넓히고 싶으면(예: 아주 거친 스캔 선화) 지금은 코드 상수
   (`NODE_SMOOTH_RADIUS_PX`)를 바꿔야 한다.

4. **창이 좁으면(스트로크 끝 근처, 또는 점이 극단적으로 성긴 스트로크) 스무딩이 조용히
   생략된다.** `NODE_SMOOTH_MIN_WINDOW_POINTS`(5) 미만이면 원본을 그대로 반환하는데, 이때 UI에
   별다른 경고가 없다 — 사용자는 슬라이더를 올려도 그 핸들 근처에서 아무 변화가 없는 걸로만
   알아챈다. crop 도구의 "너무 작은 영역은 적용 비활성" 같은 명시적 피드백은 스코프 밖으로 뺐다.

5. **제어점을 "솎아내는" 방식이지 최소자승 곡선맞춤(least-squares fit)이 아니다.** 살아남은
   제어점(anchor 를 제외한 나머지 원본 점 중 균등 추출된 것들)은 목표 곡선이 정확히 지나간다 —
   즉 그 생존 지점 자체에 노이즈가 있으면 목표 곡선도 그 노이즈를 그대로 반영한다. anchor 자신은
   §1 "핵심 설계 결정 4"로 이 문제를 피했지만, 창 안의 **다른** 점 하나가 우연히 노이즈가 크고
   하필 생존 제어점으로 뽑히는 경우까지는 방지하지 않는다(실사용 범위에서는 이웃 여러 점이 함께
   평균적으로 곡선에 반영되므로 체감상 충분히 매끄럽다).

6. **핸들 오버레이에 "이번에 스무딩될 창(lo..hi) 범위"를 시각적으로 강조하지 않는다.** 사용자는
   지금 핸들 색(청록)으로만 "스무딩 모드"임을 알 수 있을 뿐, 정확히 어느 점들까지 영향을 받을지는
   드래그해 보기 전엔 알 수 없다. `StudioNodeEditOverlay` 에 `points`+반경을 prop 으로 추가로
   넘겨 창 구간에 옅은 선/음영을 덧그리는 건 자연스러운 후속 확장이지만, 이 배치에서는 prop
   시그니처를 건드리지 않는 선(§3.10)에서 색상 구분만으로 최소 스코프를 지켰다.

7. **강도 슬라이더는 "다음 드래그의 시작 기준선"일 뿐, 핸들 없이 슬라이더만 움직여서는 어떤
   점도 바뀌지 않는다.** crop 의 "미리보기→적용" 패턴이나 heal-clone의 "브러시 크기 슬라이더"와
   달리, 이 슬라이더 자체에는 커밋 로직이 없다(§4.4). 슬라이더만으로 즉시 스무딩을 미리보기하고
   싶다면(핸들 드래그 없이) 별도의 세션/스냅샷 관리가 필요해지는데, 그 복잡도(창 스냅샷을 슬라이더
   조작 동안 별도로 들고 있어야 함)를 이번 배치에서는 의도적으로 피했다 — "핸들 드래그가 유일한
   실제 조작 경로"로 단순화했다.

8. **Undo(⌘Z) 단위는 드래그 제스처 1회당 1건**이다(기존 move/width 와 동일한 `patchEl` 커밋
   관례, §3.7). 슬라이더만 만지작거리다가(점이 안 바뀐 채로) 핸들을 짧게 드래그해 강도를 살짝만
   적용해도 그 자체로 히스토리 1건이 생긴다 — crop 처럼 "취소" 버튼으로 무효화하는 경로가 없다
   (에디터 전체의 노드 편집 도구 공통 정책이라 이 배치에서 새로 생긴 제약은 아니다).
