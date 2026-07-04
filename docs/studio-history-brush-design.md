# Studio History Brush — 설계 문서 (StudioPage.tsx / StudioHistoryPanel.tsx 통합 지침)

> 이 문서가 다루는 범위: **새 파일 4개는 이미 작성·테스트 완료됨** —
> `src/domains/creator/studio-history-brush.ts`(순수 로직 + 28개 유닛 테스트),
> `src/domains/creator/StudioHistoryBrushOverlay.tsx`(Konva 오버레이),
> `src/domains/creator/StudioHistoryBrushPanel.tsx`(인스펙터 패널).
> 이 세션에서는 **`StudioPage.tsx`와 `StudioHistoryPanel.tsx`를 의도적으로 건드리지 않았다** —
> 아래 내용은 후속 통합 패스가 정확히 어디에 무엇을 추가해야 하는지에 대한 지시서다. 라인 번호는
> 이 문서 작성 시점(`StudioPage.tsx` 15,047줄, `StudioHistoryPanel.tsx` 129줄) 기준이며,
> `StudioPage.tsx`는 계속 자라는 단일 거대 파일이라 통합 시점엔 몇 줄 어긋나 있을 수 있다 — 각
> 항목의 "앵커 텍스트"(정확히 일치해야 하는 기존 코드 조각)로 검색해 위치를 재확인할 것.

## 0. 한 줄 요약

Photoshop History Brush 대응 — 사용자가 브러시로 이미지 위를 드래그하면, 그 영역만 "지정해 둔
과거 시점의 픽셀"로 되돌아간다(전체 Undo가 아니라 국소적/선택적 복원). 대상은 이미지 레이어
(`el.src`) 하나. **소스 지정 방식**을 쓴다(heal-clone 의 Alt+클릭 소스 앵커 지정과 유사한 "2단계
상호작용" 정신은 유지하되, 지정 제스처 자체는 완전히 다른 곳 — 캔버스가 아니라 **작업 내역
(History) 패널**에서 일어난다): 사용자가 먼저 작업 내역 패널에서 시점 하나를 고르고 그 행의 붓
아이콘을 누르면, 그 시점의 `pagesHistory` 스냅샷에서 지금 선택된 이미지와 같은 id 를 가진 요소를
찾아 그 `src` 를 "히스토리 소스"로 저장한다(같은 id 가 그 시점에 없으면 UI 가 명확히 비활성화를
알린다). 그 다음 히스토리 브러시를 켜고 브러시로 드래그하면, heal-clone 의 "소스 이미지 → dab
계획 → 캔버스에 굽기" 패턴을 재사용하되 오프셋이 없는(같은 좌표를 그대로 읽고 쓰는) 단순화된
버전으로 굽는다.

---

## 1. 새로 만든 파일 3개

### 1.1 `src/domains/creator/studio-history-brush.ts` (순수 로직)

| 구분 | export |
|---|---|
| 상수 | `HISTORY_BRUSH_RADIUS_RANGE`(6~160,step1)/`_DEFAULT`(32), `HISTORY_BRUSH_HARDNESS_RANGE`(0~1)/`_DEFAULT`(0.55), `HISTORY_BRUSH_OPACITY_RANGE`(0.05~1)/`_DEFAULT`(1) |
| 타입 | `HistoryBrushSettings`, `HistoryBrushElementLike`, `HistoryBrushPageLike`, `HistoryBrushSnapshot`, `HistoryBrushSourceResult`, `HistoryBrushDab`, `HistoryBrushCtx2DLike`, `HistoryBrushCanvasFactory` |
| (A) 소스 해석 | `resolveHistoryBrushSource(snapshot, pageId, elementId)`, `computeHistoryBrushAvailability(history, pageId, elementId)` |
| (B) 기하 | `planHistoryBrushDabs(destPointsNorm, imageW, imageH, opts?)` |
| (C) 픽셀 알고리즘 | `stampHistoryBrushDab`, `applyHistoryBrushDabs` |
| (D) 캔버스 팩토리 오케스트레이션 | `bakeHistoryBrushStrokeToCanvas(historySource, currentSource, width, height, dabs, brush, createCanvas)` |

핵심 설계 결정(자세한 근거는 파일 상단 주석 참고):

- **오프셋이 없다** — heal-clone 의 `HealCloneDab`(srcX/srcY/destX/destY 4필드)과 달리
  `HistoryBrushDab`은 좌표 하나(`{x,y}`)뿐이다. 소스(과거 시점 이미지)와 목적지(지금 이미지)를
  **정확히 같은 정규화 좌표**로 읽고 쓰기 때문 — heal-clone 의 Alt+클릭으로 "다른 위치"를
  지정하는 단계 자체가 이 기능엔 없다.
- **heal 모드(로컬 평균 톤매칭)가 없다** — "그 시점 픽셀을 있는 그대로" 복원하는 게 기능의
  본질이라 색을 이동시키면 목적에 어긋난다. 항상 heal-clone 의 "clone" 모드에 해당하는 리터럴
  복사만 한다(알파 채널도 시프트 없이 그대로).
- **소스 해석은 "지정 시점에 1회만" 일어난다** — `resolveHistoryBrushSource`는 순수 함수이고
  아무것도 기억하지 않는다. 호출자(StudioPage)가 반환된 `src` 문자열을 즉시 상태로 저장해야
  한다. 이후 `pagesHistory` 배열이 어떻게 변하든(예: 다른 시점으로 undo 후 새로 커밋해 배열이
  트렁케이트됨) 이미 저장해 둔 `src` 문자열 자체는 영향받지 않는다 — heal-clone 의 "Alt+클릭
  순간에 오프셋을 1회 계산해 두고 이후엔 그 값만 쓴다"는 관례와 동일한 정신.
- **masterEditMode 를 위한 별도 가드가 필요 없다** — 문서 마스터 요소는 애초에 `pagesHistory`
  에 들어가지 않으므로, 마스터 편집 중 선택된 요소의 id 는 어떤 히스토리 스냅샷에서도
  `resolveHistoryBrushSource` 가 자연스럽게 `element-not-found`로 판정한다.
- **historySource/currentSource 자연 해상도가 달라도 크래시하지 않는다** — 그 사이 크롭이
  있었다면 두 이미지의 자연 픽셀 크기가 다를 수 있다. `bakeHistoryBrushStrokeToCanvas`는 항상
  **currentSource 기준 크기(w,h)**로 결과 캔버스를 만들고, `historySource`는 4-인자
  `drawImage(image, 0, 0, w, h)`로 그 크기에 맞춰 늘려/줄여 그린다 — 완벽한 정합은 아니지만(§5
  알려진 한계) 정규화 좌표 매핑이 계속 들어맞고 크래시 없이 그럴듯한 결과를 낸다.

`createPixelEditCanvas`(StudioPage.tsx, 라인 2104)는 **수정 없이 그대로**
`HistoryBrushCanvasFactory` 로 넘길 수 있다 — 진짜 `CanvasRenderingContext2D.drawImage` 는
2/4/9-인자 오버로드를 전부 지원해 `HistoryBrushCtx2DLike`(4-인자 스케일 그리기 포함)를 구조적으로
만족한다(heal-clone 의 `HealCloneCtx2DLike`와 동일한 관례, 메서드 바이베리언스로 컴파일 검증됨).

### 1.2 `src/domains/creator/StudioHistoryBrushOverlay.tsx` (Konva 오버레이)

`StudioHealCloneOverlay`보다 더 단순하다 — **소스 앵커 크로스헤어가 없다**(소스는 캔버스 위의 한
점이 아니라 "작업 내역 패널에서 고른 시점의 이미지 전체"라 캔버스에 표시할 단일 좌표가 없다).
브러시 스트로크 궤적(진행 중 미리보기 선) 하나만 그린다. `scale`(effScale) prop 도 없다 —
heal-clone 오버레이가 scale 로 나누는 대상은 전부 "화면에서 항상 일정 크기로 보여야 하는 UI
마커"(소스 크로스헤어)뿐인데 이 오버레이엔 그런 마커가 없다.

Props: `frame`(`SelectionFrame`), `drag`(`{points: SelPoint[]} | null`, RAF 스로틀된 진행 중
스트로크), `radiusPx`.

### 1.3 `src/domains/creator/StudioHistoryBrushPanel.tsx` (패널)

`StudioSmudgePanel`과 동일한 "무장 토글 + 반경/경도/불투명도 슬라이더" 골격에, heal-clone 의
"소스 지정 상태 안내 + 소스 해제 버튼" 개념을 붙였다. heal-clone 과 다른 점: "Alt+클릭으로
지정하세요" 대신 "작업 내역 패널에서 지정하세요" 안내, 그리고 그 패널을 곧장 열 수 있는 지름길
버튼(`onOpenHistoryPanel`, 선택적 — 작업 내역 패널이 이미 열려 있으면 StudioPage 가 이 prop을
넘기지 않아도 된다).

Props: `active`, `radiusPx`, `hardness`, `opacity`, `hasSource`, `busy?`, `onToggleActive`,
`onRadiusChange`, `onHardnessChange`, `onOpacityChange`, `onClearSource`, `onOpenHistoryPanel?`.

완전히 controlled — 내부 비즈니스 상태 없음(StudioSmudgePanel/StudioHealClonePanel 과 동일 관례).

---

## 2. `StudioHistoryPanel.tsx` 통합 지점 (실제 수정은 후속 패스가 수행)

작업 내역 패널에 "이 시점을 브러시 소스로 지정" 버튼을 추가하는 부분 — Photoshop 의 History
패널이 각 행 왼쪽에 "히스토리 브러시 소스" 열을 두는 것과 동일한 UX. **StudioHistoryPanel 은
계속 완전히 상태 없는 프레젠테이션 컴포넌트로 남는다** — 소스 해석(같은 id 이미지 찾기)은
StudioPage 가 이미 계산해 배열/콜백으로 내려준다.

### 2.1 Props 3개 추가

`StudioHistoryPanelProps`(현재 라인 17-25)에 추가:

```tsx
export type StudioHistoryPanelProps = {
  history: readonly HistorySnapshot[];
  currentIndex: number;
  onJumpTo: (index: number) => void;
  onClose: () => void;
  /** 히스토리 브러시 소스 지정 콜백 — StudioPage 가 선택된 요소가 이미지일 때만 전달한다(그 외엔
   * undefined 로 넘겨 아래 붓 아이콘 열 자체를 숨긴다). */
  onDesignateBrushSource?: (index: number) => void;
  /** 지금 지정된 소스 행(하이라이트용) — onDesignateBrushSource 가 있을 때만 의미 있다. */
  brushSourceIndex?: number | null;
  /** index별 지정 가능 여부(studio-history-brush 의 computeHistoryBrushAvailability 결과를 그대로
   * 받는다) — 배열 인덱스가 entry.index 와 같은 좌표계. 없으면(undefined) 전부 지정 가능으로
   * 취급(disabled 없음). */
  brushSourceAvailability?: readonly boolean[];
};
```

import 추가: `import { Paintbrush } from "lucide-react";`(기존 `History as HistoryIcon, X` 옆에
알파벳 순서상 추가).

### 2.2 각 행(`<li>`)에 붓 아이콘 버튼 추가 — 정확한 최소 diff

현재 구조(라인 90-116):

```tsx
{newestFirst.map((entry) => {
  const isCurrent = entry.index === currentIndex;
  const isRedoSide = entry.index > currentIndex;
  return (
    <li key={entry.index}>
      <button
        type="button"
        ref={isCurrent ? currentItemRef : undefined}
        onClick={() => jump(entry.index)}
        aria-current={isCurrent ? "step" : undefined}
        title={isCurrent ? "현재 시점" : "이 시점으로 이동"}
        className={cx(
          "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[0.72rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          isCurrent ? "..." : isRedoSide ? "..." : "..."
        )}
      >
        <span className="w-6 shrink-0 text-right tabular-nums text-fg-3">{entry.ordinal}</span>
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {isCurrent && (<span ...>현재</span>)}
      </button>
    </li>
  );
})}
```

`<button>` 안에 새 `<button>` 을 중첩할 수 없으므로(무효 HTML), `<li>` 를 flex 컨테이너로 바꾸고
기존 점프 버튼과 새 붓 아이콘 버튼을 **형제**로 둔다. 필요한 변경은 딱 3곳:

1. `<li key={entry.index}>` → `<li key={entry.index} className="flex items-center gap-1">`
2. 기존 점프 `<button>` 의 className 첫 클래스 `"flex w-full items-center gap-2 ..."` →
   `"flex min-w-0 flex-1 items-center gap-2 ..."`(`w-full` 을 `min-w-0 flex-1` 로 — 형제 버튼이
   들어갈 자리를 만들며 텍스트가 안전하게 축소·말줄임되게 한다). 그 외 className 삼항식(현재/
   redo/기본 색상 분기)은 완전히 그대로.
3. 점프 버튼 `</button>` 바로 뒤(같은 `<li>` 안), `</li>` 바로 앞에 새 버튼 추가:

```tsx
{onDesignateBrushSource && (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onDesignateBrushSource(entry.index);
    }}
    disabled={brushSourceAvailability ? !brushSourceAvailability[entry.index] : false}
    aria-pressed={brushSourceIndex === entry.index}
    title={
      brushSourceAvailability && !brushSourceAvailability[entry.index]
        ? "이 시점엔 같은 레이어가 없어 지정할 수 없어요."
        : brushSourceIndex === entry.index
          ? "히스토리 브러시 소스로 지정됨"
          : "이 시점을 히스토리 브러시 소스로 지정"
    }
    className={cx(
      "grid size-6 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
      brushSourceIndex === entry.index
        ? "border-accent bg-accent text-on-accent"
        : "border-line text-fg-3 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-3"
    )}
  >
    <Paintbrush size={12} aria-hidden />
  </button>
)}
```

`e.stopPropagation()`은 실질적 안전장치라기보다 습관적 방어(두 버튼이 이제 형제라 클릭 버블링이
점프 버튼으로 넘어갈 일 자체가 없다) — 그래도 향후 리팩터에 대비해 명시적으로 남겨 둔다.

### 2.3 하단 안내 문구(라인 124-126)에 한 문장 추가(선택)

```tsx
<p className="border-t border-line/60 px-3 py-1.5 text-[0.72rem] leading-snug text-fg-3">
  항목을 누르면 그 시점으로 즉시 이동해요 · ⌘Z 실행취소 · ⇧⌘Z 다시실행
  {onDesignateBrushSource && " · 붓 아이콘으로 히스토리 브러시 소스 지정"}
</p>
```

---

## 3. `StudioPage.tsx` 통합 지점 (실제 수정은 후속 패스가 수행)

### 3.1 import 추가 (2곳)

**(a) 순수 로직 import** — heal-clone import 블록(라인 197-206) 바로 뒤에 삽입(알파벳 순서상
`./studio-history-brush`는 `./studio-heal-clone` 다음, `./studio-history-labels` — 이건
import 되어 있지 않다, StudioHistoryPanel.tsx 가 직접 import — 앞):

```tsx
import {
  bakeHistoryBrushStrokeToCanvas,
  planHistoryBrushDabs,
  resolveHistoryBrushSource,
  computeHistoryBrushAvailability,
  HISTORY_BRUSH_HARDNESS_DEFAULT,
  HISTORY_BRUSH_OPACITY_DEFAULT,
  HISTORY_BRUSH_RADIUS_DEFAULT,
} from "./studio-history-brush";
```

**(b) 오버레이 컴포넌트 import** — `StudioHealCloneOverlay`(라인 431)처럼 lazy-load 하지
않고(Stage 트리 밖 포탈 불가) 일반 import. 알파벳 순서상 `StudioHealCloneOverlay`(431)와
`StudioIsometricGridOverlay`(432) **사이**:

```tsx
import { StudioHistoryBrushOverlay } from "./StudioHistoryBrushOverlay";
```

**(c) 패널은 lazy-load** — 다른 픽셀 도구 패널들과 같은 블록에, `StudioHealClonePanel`(라인
618-621) 바로 뒤·`StudioLayerMaskPanel`(라인 622) 바로 앞에 삽입:

```tsx
const StudioHistoryBrushPanel = lazyRetry(
  () => import("./StudioHistoryBrushPanel").then((mod) => ({ default: mod.StudioHistoryBrushPanel })),
  "StudioHistoryBrushPanel"
);
```

`StudioHistoryPanel` 자신은 이미 라인 518-521에서 lazy-load 되고 있다 — 이 배치에서 새로
건드릴 필요 없음(§2 의 props 확장만 그 파일 안에서 일어난다).

### 3.2 상태 선언

heal-clone 상태 블록(라인 3967-4022) 바로 뒤에 삽입 — heal-clone 과 형제 브러시 도구라 인접
배치:

```tsx
// ── 히스토리 브러시 — studio-history-brush 통합 상태 ──
// 모드 없음(항상 단일 "복원" 동작) — active 만 있으면 된다(heal-clone 의 mode 와 달리 heal/clone
// 두 갈래가 없다). 소스(sourceIndex/sourceSrc)는 pixelSel/cropRect 와 마찬가지로 "선택된 이미지
// 요소 1개 귀속"이라 요소가 바뀌면 해제한다(§3.7 useEffect 참고).
const [historyBrushActive, setHistoryBrushActive] = useState(false);
const [historyBrushRadius, setHistoryBrushRadius] = useState(HISTORY_BRUSH_RADIUS_DEFAULT);
const [historyBrushHardness, setHistoryBrushHardness] = useState(HISTORY_BRUSH_HARDNESS_DEFAULT);
const [historyBrushOpacity, setHistoryBrushOpacity] = useState(HISTORY_BRUSH_OPACITY_DEFAULT);
// 표시용(작업 내역 패널의 하이라이트 행) — 실제 굽기엔 안 쓰인다. pagesHistory 가 트렁케이트되면
// 가리키는 의미가 사라질 수 있어 별도 useEffect(§3.8)로 함께 정리한다.
const [historyBrushSourceIndex, setHistoryBrushSourceIndex] = useState<number | null>(null);
// 실제 굽기에 쓰이는 데이터 — 지정 시점에 resolveHistoryBrushSource 로 1회 해석해 둔 결과(그
// 이후 pagesHistory 가 어떻게 변하든 이 문자열 자체는 영향받지 않는다).
const [historyBrushSourceSrc, setHistoryBrushSourceSrc] = useState<string | null>(null);
const [historyBrushBusy, setHistoryBrushBusy] = useState(false);
// 진행 중 드래그 — healCloneDragRef 와 동일 패턴(frame 은 드래그 시작 스냅샷). offset 이 없어
// healCloneDragRef 보다 필드가 하나 적다.
const historyBrushDragRef = useRef<{
  elId: string;
  frame: SelectionFrame;
  radiusNorm: number;
  points: SelPoint[];
} | null>(null);
const historyBrushRafRef = useRef<number | null>(null);
const pendingHistoryBrushDragRef = useRef<{ points: SelPoint[] } | null>(null);
const [historyBrushDragPreview, setHistoryBrushDragPreview] = useState<{ points: SelPoint[] } | null>(null);
// 브러시 원 호버 커서 — healCloneCursorRef 와 동일 기법(ref 직접 갱신, React 리렌더 없음). 소스
// 크로스헤어가 없어 healCloneSourceCursorRef 에 대응하는 두 번째 ref 는 없다.
const historyBrushCursorRef = useRef<Konva.Circle>(null);
const scheduleHistoryBrushDragPreview = (next: { points: SelPoint[] } | null) => {
  pendingHistoryBrushDragRef.current = next;
  if (historyBrushRafRef.current !== null) return;
  historyBrushRafRef.current = globalThis.requestAnimationFrame(() => {
    historyBrushRafRef.current = null;
    setHistoryBrushDragPreview(pendingHistoryBrushDragRef.current);
  });
};
const clearHistoryBrushDragPreview = () => {
  pendingHistoryBrushDragRef.current = null;
  if (historyBrushRafRef.current !== null) {
    globalThis.cancelAnimationFrame(historyBrushRafRef.current);
    historyBrushRafRef.current = null;
  }
  setHistoryBrushDragPreview(null);
};
useEffect(() => () => {
  if (historyBrushRafRef.current !== null) globalThis.cancelAnimationFrame(historyBrushRafRef.current);
}, []);
// 선택 요소가 바뀌면 소스·진행 중 드래그·busy 를 해제(모드는 유지 — heal-clone 과 동일 정책).
useEffect(() => {
  void selectedId;
  historyBrushDragRef.current = null;
  clearHistoryBrushDragPreview();
  setHistoryBrushSourceIndex(null);
  setHistoryBrushSourceSrc(null);
  setHistoryBrushBusy(false);
}, [selectedId]);
// pagesHistory 가 트렁케이트/갱신되어 지정해 둔 인덱스가 더는 그 스냅샷을 가리키지 않게 되면
// 하이라이트만 조용히 해제한다(실제 굽기용 historyBrushSourceSrc 는 이미 해석 완료된 문자열이라
// 영향받지 않지만, "하이라이트된 행"이 엉뚱한 스냅샷을 가리키는 건 혼란스러우므로 인덱스만 함께
// 정리한다 — src 는 유지해 사용자가 계속 그 색으로 칠할 수 있게 둔다).
useEffect(() => {
  if (historyBrushSourceIndex !== null && historyBrushSourceIndex >= pagesHistory.length) {
    setHistoryBrushSourceIndex(null);
  }
}, [pagesHistory.length, historyBrushSourceIndex]);
```

### 3.3 armed 계산식

`healCloneArmed`(라인 4174) 근처, 다른 armed 상수들 옆에 추가:

```tsx
const historyBrushArmed = historyBrushActive && selected?.type === "image";
```

### 3.4 `disarmAllPixelTools()` 업데이트 (필수 — 누락 시 다른 배치들에서 실제로 재발했던 버그)

`disarmAllPixelTools()`(라인 4855-4867) 안에 한 줄 추가(소스는 유지 — 다른 도구로 잠깐 전환했다
돌아와도 지정해 둔 소스가 날아가지 않게, heal-clone 의 `healCloneSourceAnchor`가 disarm 으로는
안 지워지고 요소 전환/명시적 해제로만 지워지는 것과 동일 정책):

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
  setHistoryBrushActive(false); // ← 추가(소스 지정 상태는 그대로 둔다)
}
```

### 3.5 onStageDown — 새 분기 1개 (Move/Up 은 아래 §3.6/§3.9 참고)

heal-clone 분기(라인 6941-6977) 바로 뒤, 픽셀 선택 도구 분기(라인 6981) 바로 앞에 삽입. Alt+클릭
분기가 없다 — 지정은 항상 작업 내역 패널에서 일어나므로 onStageDown 은 일반 드래그 하나만
처리하면 된다(heal-clone 보다 분기가 훨씬 단순):

```tsx
// 히스토리 브러시 무장 중: 소스가 지정돼 있으면 일반 드래그로 스트로크 좌표를 누적한다(오프셋
// 없음 — heal-clone 과 달리 Alt+클릭 지정 단계가 없다, 소스는 작업 내역 패널에서 이미 골랐다).
if (
  historyBrushArmed &&
  !historyBrushBusy &&
  selected?.type === "image" &&
  !isSpacePressed &&
  !(e.target.getParent() instanceof KonvaRuntime.Transformer)
) {
  if (!historyBrushSourceSrc) return; // 패널 상태 문구가 이미 "작업 내역에서 먼저 지정하세요" 안내 중.
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
  const radiusNorm = historyBrushRadius / Math.max(1, selected.width);
  historyBrushDragRef.current = { elId: selected.id, frame, radiusNorm, points: [p] };
  scheduleHistoryBrushDragPreview({ points: [p] });
  return;
}
```

### 3.6 onStageMove — 좌표 누적 + 커서 갱신 함수 + else-if 커서 체인에 분기 추가

**(a) 커서 갱신 함수** — `updateHealCloneCursorNodes`(라인 7071-7089) 바로 뒤에 추가(소스
크로스헤어가 없어 heal-clone 버전보다 짧다):

```tsx
// 히스토리 브러시 호버 커서(브러시 원) — healCloneCursorRef 와 동일하게 ref 를 직접 갱신해
// 리렌더 없이 따라오게 한다.
function updateHistoryBrushCursorNode(destNorm: SelPoint, frame: SelectionFrame) {
  const cursor = historyBrushCursorRef.current;
  if (!cursor) return;
  cursor.position(normalizedPointToCanvas(destNorm, frame));
  cursor.radius(historyBrushRadius / effScale);
  if (!cursor.visible()) cursor.visible(true);
  cursor.getLayer()?.batchDraw();
}
```

**(b) 드래그 좌표 누적** — heal-clone 드래그 누적 블록(라인 7201-7214) 바로 뒤, 마퀴 드래그
블록(라인 7216) 바로 앞에 삽입:

```tsx
// 히스토리 브러시 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터 —
// appendBrushPoint 재사용, heal-clone 과 동일 패턴).
if (historyBrushDragRef.current) {
  const pos = e.target.getStage()?.getRelativePointerPosition();
  if (pos) {
    const session = historyBrushDragRef.current;
    const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
    updateHistoryBrushCursorNode(p, session.frame);
    const nextPoints = appendBrushPoint(session.points, p, session.radiusNorm);
    if (nextPoints !== session.points) {
      session.points = nextPoints;
      scheduleHistoryBrushDragPreview({ points: nextPoints });
    }
  }
  return;
}
```

**(c) 커서 프리뷰 else-if 체인** — "커서 프리뷰" 블록(라인 7229-7265)의 `healCloneArmed` 분기
(7245-7256) 바로 뒤, `tool === "draw"` 분기(7257) 바로 앞에 추가:

```tsx
} else if (historyBrushArmed && selected?.type === "image") {
  const pos = e.target.getStage()?.getRelativePointerPosition();
  if (pos) {
    const frame: SelectionFrame = {
      x: selected.x,
      y: selected.y,
      width: selected.width,
      height: selected.height,
      rotation: selected.rotation,
    };
    updateHistoryBrushCursorNode(canvasPointToNormalized(pos.x, pos.y, frame), frame);
  }
}
```

(기존 `else if (tool === "draw") { ... }` 앞의 `}`를 이 새 블록의 여는 `{`로 이어붙이는 형태 —
smudge/layerMask/healClone 이 이미 하고 있는 것과 동일한 사슬 확장.)

### 3.7 onStageUp — 새 분기 1개

heal-clone 드래그 종료 블록(라인 7492-7498) 바로 뒤, 마퀴 드래그 종료 블록(라인 7500) 바로 앞에
삽입:

```tsx
// 히스토리 브러시 드래그 종료 — 누적된 좌표로 dab 목록을 계산해 굽는다.
if (historyBrushDragRef.current) {
  const session = historyBrushDragRef.current;
  historyBrushDragRef.current = null;
  clearHistoryBrushDragPreview();
  if (session.points.length > 0) void bakeHistoryBrushDragStroke(session);
  return;
}
```

### 3.8 소스 지정 핸들러 + 굽기 함수

`bakeHealCloneDragStroke`(라인 6564-6603) 바로 뒤에 추가. 소스 지정 핸들러가 먼저, 굽기 함수가
그 다음(굽기 함수가 소스 지정 결과인 `historyBrushSourceSrc` 를 읽으므로 순서는 무관하지만 읽기
흐름상 자연스럽다):

```tsx
// ── 히스토리 브러시 소스 지정 — 작업 내역 패널에서 행의 붓 아이콘을 누르면 호출된다. ──
// resolveHistoryBrushSource 는 순수 함수라 아무것도 기억하지 않는다 — 이 함수가 결과를 즉시
// 상태로 저장한다(heal-clone 의 Alt+클릭 핸들러가 오프셋을 1회 계산해 두는 것과 동일한 정신).
function designateHistoryBrushSource(index: number) {
  if (masterEditMode || selected?.type !== "image") return;
  const snapshot = pagesHistory[index];
  if (!snapshot) return;
  const result = resolveHistoryBrushSource(snapshot, activePage.id, selected.id);
  if (!result.ok) {
    setError("이 시점엔 같은 레이어가 없어 히스토리 브러시 소스로 지정할 수 없습니다.");
    return;
  }
  setHistoryBrushSourceIndex(index);
  setHistoryBrushSourceSrc(result.src);
  setError(null);
}

// ── 히스토리 브러시 스트로크 굽기 — 스트로크 종료마다 자동 실행(heal-clone 과 동일하게 별도
// "적용" 버튼 없음, 붓처럼 즉시 반영). historySource(지정해 둔 과거 이미지)와 currentSource(지금
// 이미지) 둘 다 로드해야 한다는 점이 heal-clone(같은 이미지 하나만 로드)과 다르다. ──
async function bakeHistoryBrushDragStroke(session: {
  elId: string;
  frame: SelectionFrame;
  radiusNorm: number;
  points: SelPoint[];
}) {
  const target = elementById.get(session.elId);
  if (!target || target.type !== "image") return;
  const historySrc = historyBrushSourceSrc;
  if (!historySrc) return; // 굽는 사이 소스가 해제됐으면(요소 전환 등) 조용히 무시 — 방어적.
  setHistoryBrushBusy(true);
  try {
    const [historyImg, currentImg] = await Promise.all([
      loadPixelEditImage(historySrc),
      loadPixelEditImage(target.src),
    ]);
    const w = currentImg.naturalWidth || currentImg.width;
    const h = currentImg.naturalHeight || currentImg.height;
    const dabs = planHistoryBrushDabs(session.points, w, h, {
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (dabs.length === 0) return;
    const radiusPxDevice = historyBrushRadius * (target.width > 0 ? w / target.width : 1);
    const out = bakeHistoryBrushStrokeToCanvas(
      historyImg,
      currentImg,
      w,
      h,
      dabs,
      { radiusPx: radiusPxDevice, hardness: historyBrushHardness, opacity: historyBrushOpacity },
      createPixelEditCanvas
    );
    if (!out) throw new Error("히스토리 브러시 결과를 만들지 못했습니다.");
    const src = (out as HTMLCanvasElement).toDataURL("image/png");
    patchEl(target.id, { src } as Partial<El>);
    setError(null);
  } catch (err) {
    console.error("Failed to bake history brush stroke:", err);
    setError(err instanceof Error ? err.message : "히스토리 브러시 적용에 실패했습니다.");
  } finally {
    setHistoryBrushBusy(false);
  }
}
```

### 3.9 커서 숨김 함수 + `onMouseLeave` 등록

`hideHealCloneCursors`(라인 7544-7550) 바로 뒤에 추가:

```tsx
function hideHistoryBrushCursor() {
  const cursor = historyBrushCursorRef.current;
  if (cursor?.visible()) cursor.visible(false);
  cursor?.getLayer()?.batchDraw();
}
```

`<Stage onMouseLeave={...}>`(라인 9974-9979) 안, `hideHealCloneCursors();`(9977) 바로 뒤에 추가:

```tsx
onMouseLeave={() => {
  hideBrushCursor();
  hideSmudgeCursor();
  hideHealCloneCursors();
  hideHistoryBrushCursor(); // ← 추가
  hideLayerMaskCursor();
}}
```

### 3.10 기존 요소 `draggable`/`onSelect` 가드에 `!historyBrushArmed` 추가 (필수 — 빠뜨리면 드래그가 이미지를 같이 움직인다)

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
  !historyBrushArmed; // ← 추가
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
      !historyBrushArmed && // ← 추가
      setSelectedId(el.id);
```

이 두 곳을 빠뜨리면: 히스토리 브러시가 무장된 상태에서 이미지를 드래그해 칠하려 할 때, Konva
`Image` 노드 자체가 `draggable=true`라 브러시 스트로크 대신(혹은 동시에) 이미지가 이동하는 버그가
생긴다 — 다른 6개 픽셀 도구가 이미 이 두 체인에 자기 armed 플래그를 추가해 둔 것과 정확히 같은
이유(puppet-warp 설계 문서 §2.6과 동일한 함정).

### 3.11 Konva 커서 Layer 마운트

heal-clone 커서 Layer 블록(라인 10930-10941) 바로 뒤, 마퀴 블록(10942) 바로 앞에 삽입:

```tsx
{!isExporting && historyBrushArmed && (
  <Layer listening={false}>
    <KCircle
      ref={historyBrushCursorRef}
      visible={false}
      radius={Math.max(1.5, historyBrushRadius)}
      stroke="#ec4899"
      strokeWidth={1.5 / effScale}
      dash={[3 / effScale, 2 / effScale]}
    />
  </Layer>
)}
```

색상 `#ec4899`(핑크)는 다른 브러시류(smudge `#7c5cff`, layer-mask `#eab308`, heal `#22c55e`/clone
`#38bdf8`)와 겹치지 않게 골랐다 — `StudioHistoryBrushOverlay`의 `STROKE_COLOR`와 색조를 맞춘다.

### 3.12 Konva 오버레이(스트로크 미리보기) 마운트

heal-clone 오버레이 블록(라인 10991-11002) 바로 뒤, layer-mask 오버레이 블록(11003) 바로 앞에
삽입:

```tsx
{!isExporting && historyBrushArmed && pixelOverlayFrame && historyBrushDragPreview && (
  <Layer listening={false}>
    <StudioHistoryBrushOverlay
      frame={pixelOverlayFrame}
      drag={historyBrushDragPreview}
      radiusPx={historyBrushRadius}
    />
  </Layer>
)}
```

`pixelOverlayFrame`(라인 4154-4157)은 이미 crop/heal-clone/layer-mask 오버레이가 공유하는
"선택된 이미지 요소의 `SelectionFrame`" 계산값 — 그대로 재사용한다.

### 3.13 작업 내역 패널에 새 props 배선

`<StudioHistoryPanel .../>` 마운트(라인 11359-11368) 수정:

```tsx
{historyPanelOpen && (
  <Suspense fallback={null}>
    <StudioHistoryPanel
      history={pagesHistory}
      currentIndex={pagesHi}
      onJumpTo={jumpToHistoryIndex}
      onClose={() => setHistoryPanelOpen(false)}
      onDesignateBrushSource={
        !masterEditMode && selected?.type === "image" ? designateHistoryBrushSource : undefined
      }
      brushSourceIndex={historyBrushSourceIndex}
      brushSourceAvailability={
        !masterEditMode && selected?.type === "image"
          ? computeHistoryBrushAvailability(pagesHistory, activePage.id, selected.id)
          : undefined
      }
    />
  </Suspense>
)}
```

`computeHistoryBrushAvailability` 는 매 렌더마다 `pagesHistory` 전체를 훑지만(§5 알려진 한계),
이 블록 자체가 `historyPanelOpen && selected?.type==="image"`일 때만(패널이 실제로 열려 있고
이미지가 선택돼 있을 때만) 실행되므로 상시 비용이 아니다.

### 3.14 히스토리 브러시 패널 마운트

`<StudioHealClonePanel .../>`(라인 13513-13537) 바로 뒤, `<StudioLayerMaskPanel .../>`(13538)
바로 앞에 삽입:

```tsx
<StudioHistoryBrushPanel
  active={historyBrushActive}
  radiusPx={historyBrushRadius}
  hardness={historyBrushHardness}
  opacity={historyBrushOpacity}
  hasSource={historyBrushSourceSrc !== null}
  busy={historyBrushBusy}
  onToggleActive={() =>
    setHistoryBrushActive((v) => {
      const next = !v;
      if (next) {
        disarmAllPixelTools();
        return true;
      }
      return false;
    })
  }
  onRadiusChange={setHistoryBrushRadius}
  onHardnessChange={setHistoryBrushHardness}
  onOpacityChange={setHistoryBrushOpacity}
  onClearSource={() => {
    setHistoryBrushSourceIndex(null);
    setHistoryBrushSourceSrc(null);
  }}
  onOpenHistoryPanel={historyPanelOpen ? undefined : () => setHistoryPanelOpen(true)}
/>
```

`onToggleActive`의 "자기 자신을 끄는 `disarmAllPixelTools()`를 자기 토글 안에서 호출하는" 패턴은
smudge/layer-mask/heal-clone 이 이미 쓰고 있는 검증된 관례를 그대로 따른 것 — `disarmAllPixelTools`
자체도 `setHistoryBrushActive(false)`를 포함하지만(§3.4), 이 정확히 같은 패턴이 다른 5개 도구
토글에서 이미 문제없이 동작하고 있으므로 그대로 신뢰해도 된다(원리를 다시 검증할 필요 없음 —
기존 관례를 정확히 복제하는 것이 이 배치의 원칙).

### 3.15 Esc 키 체인

전역 단축키 핸들러의 Escape 분기(라인 5766-5799)에서, `healCloneTool` 분기(라인 5782-5785) 바로
뒤·`smudgeActive` 분기(라인 5786) 바로 앞에 추가:

```tsx
} else if (healCloneTool) {
  setHealCloneTool(null);
  healCloneDragRef.current = null;
  clearHealCloneDragPreview();
} else if (historyBrushActive) {
  // 소스 지정(historyBrushSourceIndex/Src)은 crop rect 와 달리 Esc 로 폐기하지 않는다 — 다시
  // 켰을 때 같은 소스로 이어서 칠할 수 있어야 사용자가 반복 작업하기 편하다(heal-clone 의
  // Alt+클릭 오프셋도 disarm 으로는 안 지워지고 요소 전환/명시적 해제로만 지워지는 것과 동일 정책).
  setHistoryBrushActive(false);
  historyBrushDragRef.current = null;
  clearHistoryBrushDragPreview();
} else if (smudgeActive) {
  setSmudgeActive(false);
} else if (layerMaskPaintActive) {
  ...
```

---

## 4. 통합 체크리스트 (후속 패스용)

- [ ] `StudioHistoryPanel.tsx`: props 3개 추가(§2.1) + `<li>`/버튼 구조 변경(§2.2) + 하단 문구
      한 줄(§2.3, 선택)
- [ ] `StudioPage.tsx` import 3곳(§3.1a/b/c)
- [ ] 상태 선언 블록(§3.2) — useEffect 2개(선택 전환 정리, pagesHistory 트렁케이트 정리) 포함
- [ ] `historyBrushArmed` 계산식(§3.3)
- [ ] `disarmAllPixelTools()`에 1줄 추가(§3.4) — **가장 잊기 쉬운 지점**
- [ ] `onStageDown` 새 분기 1개(§3.5)
- [ ] `onStageMove`: 커서 함수 + 드래그 누적 + else-if 커서 체인 분기(§3.6, 3곳)
- [ ] `onStageUp` 새 분기 1개(§3.7)
- [ ] 소스 지정 핸들러 `designateHistoryBrushSource` + 굽기 함수
      `bakeHistoryBrushDragStroke`(§3.8)
- [ ] 커서 숨김 함수 + `onMouseLeave` 등록(§3.9)
- [ ] `draggable`/`onSelect` 체인에 `!historyBrushArmed` 추가(§3.10) — **두 번째로 잊기 쉬운 지점**
- [ ] Konva 커서 Layer 마운트(§3.11)
- [ ] Konva 오버레이 마운트(§3.12)
- [ ] `StudioHistoryPanel` 마운트에 새 props 배선(§3.13)
- [ ] `StudioHistoryBrushPanel` 마운트(§3.14)
- [ ] Esc 체인(§3.15)
- [ ] 수동 QA: 이미지 몇 번 편집(예: 필터 2~3개 적용) → 작업 내역 패널 열기 → 편집 전 시점 행의
      붓 아이콘 클릭(하이라이트 확인) → 히스토리 브러시 켜기 → 최근 편집 부위를 드래그 →
      지정한 과거 시점 픽셀로 그 부분만 복원되는지(나머지는 최신 편집 유지) → ⌘Z 로 되돌리기 →
      선택 요소를 다른 이미지로 바꿨다가 원래 이미지로 되돌아오면 소스가 해제돼 있는지(§3.2 정책)
      → 다른 이미지를 선택한 채 작업 내역 패널을 열면 "같은 레이어가 없는" 시점의 붓 아이콘이
      disabled 로 보이는지 → 좌우 반전된 이미지에서도 정상 동작하는지(flipX 경로) → 다른 도구
      (예: 스포이드) 클릭 시 히스토리 브러시가 자동으로 꺼지는지(소스는 유지되는지)

---

## 5. 스케치 대비 편차 · 알려진 한계 (필수 명시 섹션)

1. **heal 모드(로컬 평균 톤매칭)가 없다.** heal-clone 은 heal/clone 두 모드를 제공하지만, 히스토리
   브러시는 "그 시점 픽셀을 있는 그대로" 복원하는 것이 기능의 정의 자체라 톤을 이동시키는 옵션이
   의미가 없다고 판단해 아예 빼뒀다. 필요하다면 추후 `stampHistoryBrushDab`에 heal-clone 의
   `localMeanColor` 기반 시프트 계산을 그대로 이식해 넣을 수 있다(구조가 거의 동일해 이식
   비용은 낮다).

2. **historySource/currentSource 자연 해상도가 다르면 완벽히 정합하지 않는다.** 그 사이 크롭이
   있었다면 두 이미지의 자연 픽셀 크기가 달라진다 — `bakeHistoryBrushStrokeToCanvas`는 히스토리
   이미지를 목적지 크기로 늘려/줄여 그려 크래시 없이 그럴듯한 결과를 내지만, 크롭으로 프레이밍
   자체가 바뀌었다면 "정규화 좌표 (0.3, 0.4)"가 가리키는 실제 피사체 위치가 두 시점에서 달라져
   있을 수 있다 — 이 경우 브러시가 "비슷하지만 정확히는 아닌" 위치의 픽셀을 복원한다. 완전한
   해결(크롭 변환을 역산해 좌표를 재정렬하는 것)은 스코프 밖으로 명시적으로 뺐다 — 실무에서는
   "크롭 직후"가 아니라 "같은 프레이밍으로 계속 편집하던 도중" 되돌리려는 경우가 압도적으로
   많아, 이 한계가 실제로 체감될 상황은 드물다.

3. **과거 시점의 flip(좌우/상하 반전) 상태는 추적하지 않는다.** dab 계획은 항상 **지금** 선택된
   요소의 `flipped`/`flippedY`를 히스토리 소스에도 그대로 적용한다 — 만약 사용자가 그 시점 이후
   반전 상태를 바꿨다면(드물지만 가능) 히스토리 브러시가 복원하는 픽셀이 거울상으로 어긋날 수
   있다. `flipped`/`flippedY`는 `El`의 표시 속성이라 `pagesHistory`의 각 스냅샷에도 실제로
   저장돼 있으므로 이론적으로는 `resolveHistoryBrushSource`가 그 시점의 flip 값도 함께 반환해
   dab 계획 시 두 flip 상태를 각각 적용할 수 있지만(소스는 그 시점 flip, 목적지는 지금 flip),
   이렇게 하려면 `HistoryBrushElementLike`에 `flipped`/`flippedY` 필드를 추가하고
   `HistoryBrushSourceResult`도 함께 확장해야 한다 — v1에서는 "반전 상태를 바꾸는 동안 히스토리
   브러시를 쓰는" 경우가 드물다고 보고 스코프에서 뺐다(추가는 국소적인 후속 패치로 가능).

4. **소스는 "선택된 이미지 요소 1개 귀속"이며 다중 소스 슬롯이 없다.** Photoshop 은 히스토리
   브러시 소스를 요소별로 별도 관리하지 않고 전역 하나만 유지하는 것과 달리, 이 구현은 애초에
   요소가 바뀌면 소스를 해제한다(§3.2 useEffect) — 이미지 A 에서 소스를 지정해 두고 이미지 B 로
   전환했다가 다시 A 로 돌아와도 소스가 남아있지 않다(crop/heal-clone 의 "요소 전환 시 도구별
   임시 상태 해제" 기존 관례를 그대로 따른 것 — 새로 만든 문제가 아니다).

5. **`computeHistoryBrushAvailability`는 매번 전체 히스토리를 다시 훑는다(메모이제이션 없음).**
   작업 내역 패널이 열려 있고 이미지가 선택돼 있을 때만 계산되므로 상시 비용은 아니지만, 히스토리
   가 수백 스텝 이상 쌓인 문서에서는 매 리렌더마다 O(히스토리 길이 × 페이지당 요소 수) 비용이
   든다 — `StudioHistoryPanel`의 기존 `buildHistoryTimeline`(diff 라벨링, 항목당 비용이 이보다
   훨씬 크다)과 같은 비용 특성이라 실질적 병목으로 보긴 어렵다고 판단해 캐싱을 추가하지 않았다.

6. **작업 내역 패널을 닫으면 지정 UI 자체가 사라진다(재지정하려면 다시 열어야 한다).** Photoshop
   은 히스토리 패널이 최소화돼 있어도 브러시 소스 아이콘 위치가 유지되지만, 이 구현은 애초에
   `StudioHistoryPanel`이 조건부 마운트(`historyPanelOpen &&`)라 완전히 언마운트된다 — 이미
   지정해 둔 소스(`historyBrushSourceSrc`)는 패널을 닫아도 그대로 유지되므로 실제 브러시 사용에는
   지장이 없고, 단지 "다른 시점으로 소스를 바꾸려면" 패널을 다시 열어야 한다는 정도의 사소한
   불편이다 — `StudioHistoryBrushPanel`의 `onOpenHistoryPanel` 지름길 버튼이 이 마찰을 줄인다.

7. **실시간 픽셀 미리보기가 없다.** heal-clone 과 동일하게, 드래그 중엔 오버레이의 벡터 스트로크
   궤적(핑크 반투명 선)만 보이고 실제 픽셀 복원은 드래그(스트로크) 종료 시 한 번에 적용된다 —
   heal-clone/smudge 가 이미 채택한 "제스처 1회 = 커밋 1회" 관례를 그대로 따른 것.
