# 설계 문서 — 콘텐츠 인식으로 채우기(Content-Aware Fill)

> 상태: **코어 로직 + 유닛 테스트 완료, 회의적 검토 패스로 버그 2건 발견·수정 완료(main 미통합)**.
> `StudioPage.tsx`/`StudioSelectionToolsPanel.tsx`는 이 세션에서도 의도적으로 건드리지 않았다(병렬
> 워크플로가 같은 파일에 충돌하는 사고를 막기 위한 세션 규칙). §4의 지침대로 후속 패스가 두 파일을
> 수정해 실제로 연결해야 기능이 UI에 나타난다. 검토 패스에서 실제 함수를 스크립트로 실행해 §5-2/§5-4에
> 표시된 두 가지 실제 버그(문맥 SSD 경계 밖 읽기, BFS filled 오표시로 인한 폴백 무력화)를 발견하고
> 고쳤다 — 자세한 내용과 회귀 테스트는 해당 절과 §6-1 참고.

## §1. 개요

Photoshop의 "내용 인식 채우기"에 대응하는 기능. 사용자가 이미지 요소 위에 기존 픽셀 선택 도구
(사각/타원/올가미/브러시/마술봉 — 전부 `studio-selection-tools.ts`)로 영역을 지정한 뒤 새 버튼을
누르면, 그 영역이 삭제되는 대신 주변 텍스처를 참고한 근사 텍스처로 채워진다.

**완전한 PatchMatch/텍스처 합성은 스코프 밖**이라는 전제하에, 아래 §2 알고리즘으로 "실용적으로
동작하는 근사"를 구현했다. 대상 시나리오는 하늘/벽/종이/스크린톤처럼 비교적 단순·균일한 배경에서
작은 티끌·워터마크·불필요한 소품을 지우는 것 — 세밀하고 복잡한 텍스처(예: 정교한 배경화)에서는
품질이 Adobe 수준에 못 미친다(§5에 구체적으로 명시).

## §2. 알고리즘 — 타일 기반 근사 + BFS 전파 + 문맥 SSD 매칭

파일: `src/domains/creator/studio-content-aware-fill.ts` (신규, 기존 파일 무수정)

1. **타일 그리드**: 선택 알파(`mask`, `rasterizeSelectionMask` 결과)의 bbox를 구하고 한 타일
   두께(`tilePx`, 기본 12px, 범위 8~16px)만큼 패딩한다. 이 패딩 덕분에 그리드 가장자리 링은
   시작부터 전부 "구멍이 아닌(실제 픽셀)" 타일이 되어 BFS 시작 프론티어를 보장한다.
2. **BFS 파동 전파**: 그리드 가장자리에서 시작해, "이웃 타일 중 하나라도 이미 알려진(비-구멍이거나
   이미 처리 완료)" 구멍 타일만 큐에 넣는 방식으로 안쪽으로 파동을 그린다(Criminisi류
   exemplar-based inpainting의 "신뢰도 전파" 개념을 그리드 단위로 단순화한 버전).
3. **후보 탐색(진짜 PatchMatch 아님)**: 각 타일마다 **8방향 × 반경 1~6타일**로 미리 정의한 최대
   48개 오프셋 중 이미지 경계 안이고 완전히 알려진 후보만, 최대 **16개**까지만 실제로 비교한다
   (전수탐색이 아니라 "소수 후보만 비교" — 성능/품질 실용적 타협, §5 참고).
4. **문맥 가중 SSD**: 타일 코어뿐 아니라 바깥 3px 여백까지 포함해 SSD(제곱오차합)를 재고, 가중치는
   "그 픽셀이 지금 시점에 얼마나 알려져 있는가"(`1-알파`, 단 이미 처리된 이웃 타일은 무조건 1)로
   준다. 이 덕분에 타일 전체가 선택 영역 안에 완전히 파묻혀 자체 신호가 0이어도, 이미 처리된 이웃의
   실제 픽셀이 여백 안에 들어와 방향성 있는 매칭이 가능해진다(핵심 트릭 — 없으면 안쪽 타일은 항상
   임의의 고정 순서로만 후보를 고르게 된다).
5. **복사**: 최소 SSD 후보의 픽셀을, 타깃 픽셀 자신의 선택 알파 비율로 원본과 블렌드하며 복사한다
   (`applySelectionAdjustToCanvas`의 delete/adjust와 동일한 알파 합성 규약 — feather는 자동으로
   부드러운 경계가 된다).
6. **폴백**: BFS가 끝내 닿지 못한 구멍 타일(고립된 선택, 이미지 전체 선택 등 병적인 경우)은 이미지의
   평균 알려진 색으로 평탄하게 채운다 — 스펙이 제시한 "더 단순한 폴백(확산/평균)" 방향을 여기서
   안전망으로 결합했다.
7. **이음매 완화**: 타일 그리드 내부 경계선에 걸친 선택 픽셀만(폭 1px) 3×3 평균으로 살짝 매끈하게
   만든다(선형 페더링의 매우 단순화된 버전 — 진짜 최소오차경계컷/그래프컷 아님).

**결정론**: 랜덤 없음, `Date` 없음 — 같은 입력은 항상 같은 출력. 유닛 테스트로 검증(§6).

## §3. 신규 파일 · 공개 API

| 파일 | 역할 |
|---|---|
| `src/domains/creator/studio-content-aware-fill.ts` | 순수 코어 + 캔버스 orchestration(신규) |
| `src/domains/creator/studio-content-aware-fill.test.ts` | 유닛 테스트 18건(신규, 검토 패스에서 4건 추가) |
| `docs/design-content-aware-fill.md` | 본 문서(신규) |

공개 export:

```ts
// 상수
export const CONTENT_AWARE_FILL_TILE_PX_RANGE = { min: 8, max: 16, step: 1 };
export const CONTENT_AWARE_FILL_TILE_PX_DEFAULT = 12;

// 순수 코어 — DOM 없음, source/mask를 변경하지 않고 새 StudioImageDataLike를 반환.
export type ContentAwareFillOptions = { tilePx?: number };
export function contentAwareFillPixels(
  source: StudioImageDataLike,
  mask: StudioImageDataLike,
  opts?: ContentAwareFillOptions
): StudioImageDataLike;

// mask에 실제로 채울 알파(>0)가 있는지 빠르게 확인(선택적 가드 — §4 참고).
export function contentAwareFillHasWork(mask: StudioImageDataLike): boolean;

// 캔버스 orchestration — bakeHealCloneStrokeToCanvas와 동일 관례(DOM은 호출자가 createCanvas로 주입).
export type ContentAwareFillCtx2DLike = MaskCtx2DLike & {
  getImageData(sx: number, sy: number, sw: number, sh: number): StudioImageDataLike;
  putImageData(imageData: StudioImageDataLike, dx: number, dy: number): void;
};
export type ContentAwareFillCanvasFactory = (
  width: number,
  height: number
) => { canvas: MaskCanvasLike & MaskImageSource; ctx: ContentAwareFillCtx2DLike } | null;
export function bakeContentAwareFillToCanvas(
  source: MaskImageSource,
  mask: MaskImageSource,
  width: number,
  height: number,
  opts: ContentAwareFillOptions | undefined,
  createCanvas: ContentAwareFillCanvasFactory
): (MaskCanvasLike & MaskImageSource) | null;
```

`ContentAwareFillCanvasFactory`는 `HealCloneCanvasFactory`/`SelectionCanvasFactory`와 구조가
동일하다 — `StudioPage.tsx`의 `createPixelEditCanvas`를 **수정 없이 그대로** 넘길 수 있다(구조적
호환, 메서드 바이베리언스로 컴파일 검증됨 — heal-clone/layer-mask와 동일 패턴).

## §4. `StudioPage.tsx` / `StudioSelectionToolsPanel.tsx` 통합 지점(후속 패스가 수행)

이 세션은 아래 변경을 **적용하지 않았다** — 정확히 어디에 무엇을 넣을지만 지시한다.

### 4-1. import 추가 (`StudioPage.tsx`)

값 import 블록은 모듈명 알파벳 순으로 정렬돼 있다. `studio-comipo-shipped`(150번째 줄 `} from
"./studio-comipo-shipped";`)와 `studio-crop`(151번째 줄 `import { applyCropAspect, ...`) 사이,
**정확히 150번째 줄 뒤**에 새 블록을 추가한다:

```ts
import { bakeContentAwareFillToCanvas } from "./studio-content-aware-fill";
```

(`contentAwareFillHasWork`/타입들은 StudioPage에서 직접 쓸 필요가 없으면 생략 — §4-3 참고.)

### 4-2. 새 비동기 액션 함수 (`StudioPage.tsx`)

`applyPixelSelectionAdjust` 함수(현재 6427~6463번째 줄, "── 픽셀 선택 한정 조정 적용" 주석으로
시작) **바로 뒤, 6465번째 줄의 "// 문지르기 브러시" 주석 앞**에 거의 동일한 구조로 새 함수를
추가한다 — `applySelectionAdjustToCanvas(img, w, h, mask, plan, factory)` 대신
`bakeContentAwareFillToCanvas(img, mask, w, h, undefined, factory)`를 호출하는 것이 유일한 실질적
차이다:

```ts
// ── 콘텐츠 인식으로 채우기 — 선택 영역을 지우고 주변 텍스처 근사로 채워 원본 픽셀에 굽는다.
// applyPixelSelectionAdjust와 동일한 구조(원본 자연 해상도로 마스크 래스터 → 합성 → data URL 교체)
// 이되, studio-content-aware-fill.ts의 bakeContentAwareFillToCanvas를 호출한다. 선택 영역은
// 유지된다(delete/adjust와 동일한 관례 — 같은 자리에 다시 조정을 가할 수 있게).
async function applyContentAwareFill() {
  if (pixelBusy) return;
  if (selected?.type !== "image" || !pixelSel || !isSelectionUsable(pixelSel)) return;
  const target = selected; // await 사이 선택 변경에 흔들리지 않게 스냅샷.
  const sel = pixelSel;
  setPixelBusy(true);
  try {
    const img = await loadPixelEditImage(target.src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const maskPlan = buildSelectionMaskPlan(sel, w, h, {
      featherScale: target.width > 0 ? w / target.width : 1,
      flipX: target.flipped,
      flipY: target.flippedY,
    });
    if (!maskPlan) return;
    const mask = rasterizeSelectionMask(maskPlan, createPixelEditCanvas);
    const out = mask && bakeContentAwareFillToCanvas(img, mask, w, h, undefined, createPixelEditCanvas);
    if (!out) throw new Error("채우기 캔버스를 만들지 못했습니다.");
    const src = (out as HTMLCanvasElement).toDataURL("image/png");
    patchEl(target.id, { src } as Partial<El>);
    setError(null);
  } catch (err) {
    console.error("Failed to apply content-aware fill:", err);
    setError(err instanceof Error ? err.message : "콘텐츠 인식 채우기에 실패했습니다.");
  } finally {
    setPixelBusy(false);
  }
}
```

`pixelBusy`/`createPixelEditCanvas`/`loadPixelEditImage`/`buildSelectionMaskPlan`/
`rasterizeSelectionMask`는 전부 이미 존재하는 것을 그대로 재사용한다 — **새 state는 필요 없다.**

### 4-3. `disarmAllPixelTools()`에 새 armed 상태를 추가할 필요 **없음**

일반 지침은 "새 armed 상태를 반드시 `disarmAllPixelTools()`에 포함시켜라"였지만, 이 기능은
**armed(무장) 상태가 아니다** — 이미 만들어진 `pixelSel`(사각/타원/올가미/브러시/마술봉으로 이미
확정된 선택)에 대해 **버튼 클릭 한 번으로 즉시 실행**되는 파괴적 액션이다. 기존 코드베이스에서
정확히 같은 클래스인 예: `StudioSelectionToolsPanel`의 "선택 영역 삭제" 버튼(`onApplyAdjust`),
"밝기/색조 적용" 버튼 — 모두 포인터 제스처를 새로 캡처하지 않고, 이미 있는 선택에 즉시 적용하고
끝난다. 그러므로 `cropRect`/`pixelTool`/`healCloneTool` 같은 11개 armed state 목록에 이 기능을
위한 새 state를 추가하지 않는다(추가하면 오히려 "무엇을 끄는 토글인지" 불명확한 죽은 상태가 된다).

### 4-4. `StudioSelectionToolsPanel.tsx` — prop 추가 + 버튼 삽입

**Props 타입**(현재 48~75번째 줄 `StudioSelectionToolsPanelProps`)에 `onApplyAdjust` 바로 뒤,
마지막 prop으로 추가:

```ts
/** 선택 영역을 지우고 콘텐츠 인식(타일 기반 근사)으로 채운다 — delete와 동일한 파괴적 작업. */
onContentAwareFill: () => void;
```

함수 시그니처(현재 77~91번째 줄)의 구조 분해에도 `onApplyAdjust` 뒤에 `onContentAwareFill`을
추가한다.

**import 아이콘** — 현재 15번째 줄:
```ts
import { Circle, Eraser, Lasso, Paintbrush, RotateCcw, Square, Undo2 } from "lucide-react";
```
을 다음으로 바꾼다(알파벳 순, `WandSparkles`가 마지막):
```ts
import { Circle, Eraser, Lasso, Paintbrush, RotateCcw, Square, Undo2, WandSparkles } from "lucide-react";
```
(`WandSparkles`는 이미 `CreateWorkPage.tsx`/`CreateFeaturedSections.tsx`에서 "AI/스마트 자동화"
느낌으로 쓰인 아이콘 — 마술봉 선택 도구가 이미 쓰는 `Wand2`와 겹치지 않게 구분.)

**버튼 삽입 위치** — 현재 258~267번째 줄의 "선택 영역 삭제" 버튼 **바로 뒤**(같은
`space-y-1.5 border-t border-line/40 pt-2` 블록 안, 마지막 항목으로):

```tsx
<button
  type="button"
  onClick={onContentAwareFill}
  disabled={!canAdjust}
  className={cn(buttonClass({ size: "sm", variant: "outline" }), "w-full gap-1")}
  title="선택 영역을 지우고 주변 텍스처를 참고해 자연스럽게 채웁니다(타일 기반 근사라 복잡한 배경은 이음매가 살짝 보일 수 있어요)."
>
  <WandSparkles className="size-3.5" aria-hidden />
  {busy ? "채우는 중..." : "콘텐츠 인식으로 채우기"}
</button>
```

`canAdjust`(= `usable && !busy`)는 이미 이 컴포넌트 안에 있는 로컬 변수 — 그대로 재사용한다(새
prop 없이 기존 "삭제" 버튼과 동일한 활성/비활성 로직).

### 4-5. 호출부 배선 (`StudioPage.tsx`, `<StudioSelectionToolsPanel>` JSX)

현재 13466~13483번째 줄의 `<StudioSelectionToolsPanel ... onApplyAdjust={...} />` 바로 뒤에 한 줄
추가:

```tsx
onApplyAdjust={(plan) => void applyPixelSelectionAdjust(plan)}
onContentAwareFill={() => void applyContentAwareFill()}
```

이게 전부다 — 새 state, 새 armed 토글, `disarmAllPixelTools()` 변경 전부 불필요하다.

## §5. 스케치 대비 편차(의도적 단순화 — 정직하게 명시)

1. **진짜 PatchMatch 아님**: randomized nearest-neighbor 반복 전파 대신, 타일마다 **미리 정의한
   8방향 × 반경 1~6 오프셋(최대 48개) 중 최대 16개만** 비교한다. 전체 이미지 전수탐색을 하지
   않으므로 아주 먼 곳에 더 잘 맞는 텍스처가 있어도 찾지 못할 수 있다(성능과 품질의 실용적 타협 —
   일반적인 웹툰 배경/사진 배경 규모에서는 충분히 빠르고 충분히 그럴듯하다).
2. **타일이 선택 영역에 완전히 파묻히면 방향 신호가 약하다**: 3px 문맥 여백이 이미 처리된 이웃의
   실제 픽셀을 잡아주지만, 그 여백조차 전부 미해결이면(이미지 전체 선택 등 극단 케이스) SSD가
   모든 후보에서 0으로 동률이 되어 **고정 순서상 가장 가까운 후보**로 타이브레이크한다 — 색상
   기반이 아니라 순서 기반 결정이다(결정적이지만 "그럴듯함"을 보장하진 않는다).
   > **검토 단계에서 발견·수정한 버그**: `contextWeightedSsd`가 문맥 여백 좌표를 계산할 때 **타깃**
   > rect의 여백(marginLeft/Top, 이미지 경계까지 거리로 계산됨)을 **후보** 쪽 좌표 이동에도 그대로
   > 재사용했다. 타깃이 이미지 안쪽에 있어 여백이 꽉 차 있어도(예: marginRight=3) 후보 코어 자신은
   > 이미지 경계에 바싹 붙어 있을 수 있어(예: 후보 코어 오른쪽 끝이 정확히 width와 같음), 그 여백만큼
   > shift한 후보 쪽 좌표(cx/cy)가 이미지 밖으로 나가는 경우가 있었다. 그 자리를 그대로 읽으면 배열
   > 끝을 넘어 `undefined`를 읽어 SSD가 `NaN`이 되거나(→ `NaN < Infinity`는 항상 거짓이라 그 후보가
   > 통째로 버려짐), 다음 행의 무관한 픽셀을 잘못 읽어(랩어라운드) 매칭 품질이 조용히 나빠졌다.
   > `width=30,height=10,tilePx=10`으로 직접 좌표를 손으로 추적해 실제로 후보 하나가 인덱스 1200(길이
   > 1200 배열의 끝)을 읽으려 시도하는 것을 확인했고, tsx로 실제 함수를 실행해 재현했다(80/100 구멍
   > 픽셀이 원본의 "지워야 할" 색 그대로 남는 것을 확인). 수정: 후보 쪽 cx/cy가 `[0,width)×[0,height)`
   > 밖이면 그 위치를 가중치 0(스킵)으로 취급 — 타깃 쪽 미해결 픽셀을 스킵하는 것과 대칭적인 처리다.
   > 회귀 테스트: `describe("contextWeightedSsd — 문맥 여백이 이미지 경계 밖으로 나가는 후보 방어")`.
3. **이음매 완화는 매우 단순하다**: Image Quilting의 최소오차경계컷(dynamic programming)이나
   그래프컷 같은 정교한 봉합은 구현하지 않았다. 타일 그리드 내부 경계선 1px 폭만 3×3 평균으로
   살짝 매끈하게 만드는 게 전부다 — **세밀하고 고주파(high-frequency)인 복잡한 텍스처
   배경에서는 타일 격자 이음매가 옅게 보일 수 있다.** 하늘/벽/종이/스크린톤처럼 균일하거나
   완만한 그라데이션 배경에서는 거의 티가 나지 않는다(의도한 타깃 시나리오).
4. **극단 케이스는 텍스처 합성 대신 평균색 폴백**: 선택이 이미지 전체를 덮거나 BFS가 고립된 구멍에
   닿지 못하면, 이미 알려진("선택 안 된") 픽셀들의 평균 RGB로 평탄하게 채운다(GIMP 초기 "Heal
   Selection"류 확산/평균 폴백과 동급 품질 — Photoshop 수준의 그럴듯함은 기대할 수 없다).
   > **주의(§design 최초 작성 시 누락됐던 하위 케이스)**: 선택이 **이미지 전체**를 덮으면 "선택 안
   > 된" 픽셀이 정의상 하나도 없어 `meanKnownColor`가 평균을 계산하지 못하고 `null`을 반환한다 —
   > 이 경우 이미지에서 유도한 값이 아니라 **하드코드된 중립 회색(200,200,200)** 으로 떨어진다(코드
   > `meanKnownColor(...) ?? { r: 200, g: 200, b: 200 }`). "이미 알려진 픽셀들의 평균"이라는 위 설명은
   > 부분 선택(선택 밖에 진짜 배경이 남아있는 경우)에만 정확하고, 100% 전체 선택에는 애초에 참조할
   > 데이터가 없으므로 적용되지 않는다 — 회귀 테스트가 이 정확한 값(200,200,200,255)을 검증한다.
   >
   > **검토 단계에서 발견·수정한 별개의 버그**: 이 폴백 경로 자체가 예전에는 전체 선택처럼 진짜
   > 알려진 타일이 하나도 없는 상황에서 **전혀 발동하지 않았다**. 원인은 메인 BFS 루프가
   > `pickBestCandidateCore`가 `null`을 반환해도(=이 타일은 채울 후보를 못 찾음) `grid.filled[idx]=1`을
   > 무조건 찍었기 때문 — (a) 그 타일은 실제로는 원본(구멍) 픽셀 그대로인데도 이후 다른 타일들의
   > SSD 비교·복사가 "이미 처리된 신뢰 가능한 문맥"으로 오판해 그 미해결 원본 내용을 그대로 베껴가는
   > 연쇄(오염 전파)로 이어졌고, (b) 폴백 스윕(`remaining`)은 `filled===0`인 타일만 골라내므로 이렇게
   > 잘못 찍힌 타일은 평균색 폴백 대상에서도 영영 빠졌다. 실측 재현: 좌(빨강)/우(초록) 두 색으로 된
   > 이미지 **전체**를 선택하면(바로 이 항목이 말하는 시나리오), 결과가 균일한 폴백 회색이 아니라
   > 그리드에서 가장 먼저 처리된(그러나 실제로는 하나도 안 채워진) 타일의 원본 색 하나로 전체가
   > 뒤덮여 버리는 것을 tsx로 실행해 확인했다. 수정: `best`를 실제로 찾았을 때만(= `copyTileFill`을
   > 실제로 호출했을 때만) `grid.filled[idx]=1`을 찍는다 — 실패한 타일은 정직하게 "아직 미해결"로
   > 남아 신뢰 전파에 끼지 않고, 마지막 폴백 스윕에 정확히 걸린다. 정상적인(비병적) 선택에서는 BFS
   > 준비 조건 자체가 항상 실제 인접 타일(ring-1 후보 중 하나)을 가리키므로 이 변경이 관찰 가능한
   > 회귀를 만들지 않음을 별도 스크립트로 확인(모서리만 닿은 선택·색 경계를 가로지르는 내부 선택·
   > 적응형 tilePx 대형 선택 모두 문맥 인식 채우기가 정상 동작). 회귀 테스트:
   > `describe("BFS filled 플래그 — best를 못 찾은 타일은 신뢰 가능/폴백 대상에서 빠지면 안 된다")`.
5. **거대 선택 성능 안전판**: 타일 총수가 20,000개를 넘으면 `tilePx`를 자동으로 키운다(최대
   128px까지, 1회 조정). 매우 큰 선택/이미지에서 응답성을 지키기 위해 그만큼 품질이 거칠어지는
   것을 감수한 결정이다.
6. **메인 스레드 동기 실행**: heal-clone/smudge/layer-mask/adjust와 동일하게 Web Worker를 쓰지
   않는다. 다만 이 알고리즘은 타일마다 문맥 SSD(최대 16후보 × 문맥 영역 픽셀수) 비교가 있어 다른
   브러시 도구보다 픽셀당 연산이 더 많다 — 매우 큰 선택(수백×수백 px)에서는 버튼을 누른 뒤 짧은
   지연(체감상 수십~수백 ms대, §5-5의 안전판이 상한을 막아준다)이 있을 수 있다.
7. **RGB만 비교, 알파는 매칭 기준에서 제외**: SSD는 R/G/B 채널만 쓴다(복사 자체는 알파 포함
   4채널 전부). 선택 주변에 의미 있는 반투명 영역이 섞여 있으면 아주 드물게 색은 비슷하지만
   투명도가 다른 타일을 고를 수 있다 — 스튜디오에서 다루는 이미지 대부분(웹툰 컷/사진)은 이 영역이
   불투명이라 실무 영향은 낮다.
8. **선택 유지 여부**: 채우기 후에도 `pixelSel`을 그대로 둔다(삭제/밝기/색조와 동일 관례 — 같은
   영역에 다시 조정할 수 있게). Photoshop도 내용 인식 채우기 후 선택을 유지하는 것과 같은 동작.
9. `contentAwareFillHasWork`는 내보내지만 §4의 통합 경로에서 **필수는 아니다** — 버튼은 패널의
   기존 `canAdjust`(= `isSelectionUsable(selection)`)로 이미 충분히 가드되므로, 이 헬퍼는
   대칭성(다른 `is*NoOp` 계열 가드와 동일한 자리)과 향후 방어적 용도를 위해 남겨둔 것이다.

## §6. 테스트 커버리지

`studio-content-aware-fill.test.ts` — **18건**(최초 작성 14건 + §5-2 버그 수정 시 추가된 2건 +
회의적 검토 패스가 §5-4 버그 회귀 방지로 추가한 2건), 전부 결정적(랜덤/시간 없음), `pnpm exec vitest
run` 통과 확인 완료. 기존 "전체 선택" 테스트도 "안 던지는지"만 보던 데서 실제 픽셀 값 검증으로
강화했다(같은 `it` 블록, 새 테스트로 세지 않음). 핵심:

- **결정론 필수 케이스(스펙 요구사항)**: 단색 배경 위 선택 영역이 **정확히 같은 색으로 완벽하게**
  채워짐(경계 포함) — feather(부분 알파)가 있어도 동일.
- **콘텐츠 인식 검증**: 좌(빨강)/우(초록) 두 색 경계에 걸친 선택 → 채운 결과가 각자 원래 위치에
  가까운 색 성향을 유지(단순 타이브레이크가 아니라 실제로 문맥 매칭이 동작함을 증명).
- **방어**: mask 크기 불일치·전체 선택·비정상 `tilePx`(0/999/NaN) 모두 크래시 없이 처리, 선택 없음은
  원본 복제 no-op, source/mask 원본 버퍼 불변.
- **orchestration**: `bakeContentAwareFillToCanvas`가 캔버스 3개(source/mask/결과)를 정확한 순서로
  만들고, 결과가 `contentAwareFillPixels` 직접 호출과 정확히 일치(오케스트레이션이 알고리즘을
  바꾸지 않음을 검증) + 캔버스 생성 실패/비정상 크기 방어.
- **문맥 SSD 경계 방어(회귀, §5-2)**: 유일한 후보가 이미지 경계에 걸치는 배치에서도 실제로 채워짐을
  손으로 좌표를 추적해(width=30,height=10,tilePx=10) 검증 — 고치기 전엔 이 정확한 배치에서 타일이
  전혀 채워지지 않고 원본이 남는 것을 확인한 뒤 고쳤다(수정 되돌리기→실패 재현→복원 순으로 검증).
- **BFS filled 플래그 회귀(§5-4)**: 좌/우 두 색 이미지를 **전체 선택**하면 한쪽 원본 색으로 뒤덮이지
  않고 균일한 폴백 회색(200,200,200,255)이 되어야 한다(전체 선택 테스트를 "안 던지는지"만 보던 데서
  실제 픽셀 값 검증으로 강화) + 대조군(가장자리 한쪽만 닿은 선택은 회색이 아니라 실제 배경색으로
  채워짐 — 폴백 과잉 발동이 아님을 확인).

전체 회귀: `pnpm exec vitest run src/domains/creator` → 116 파일 / 2756 테스트 전부 통과, 전체
`pnpm exec vitest run` → 173 파일 / 3180 통과·8 skip(기존 테스트 무영향 확인). `pnpm exec tsc -p
tsconfig.json --noEmit` / `pnpm exec eslint` 둘 다 클린.

### §6-1. 검토 단계에서 발견된 버그 — 요약

구현 단계 완료 보고는 §5-2의 경계 버그를 "발견·수정했다"고 주장했지만, 회의적 검증(스크립트로 실제
함수를 실행해 픽셀 값 확인) 결과 **그 수정이 실제로 존재하지 않는 사본**(공유 체크아웃에 반영된 버전)
과 **수정이 실제로 존재하는 사본**(구현 단계가 작업한 워크트리)이 서로 달랐다 — 이 검토 패스는 후자를
기준으로 다시 채택하고, 독립적으로 §5-4의 **두 번째 버그**(구현 단계 보고에 없던, 별도로 발견한 것)를
찾아 고쳤다. 두 버그 모두 진짜 스크립트 실행(수정 되돌리기→실패 재현→복원)으로 검증했다:

1. **§5-2**: `contextWeightedSsd`가 후보 쪽 문맥 좌표에 경계 검사 없이 접근 — 이미지 경계 밖/랩어라운드
   읽기로 SSD가 `NaN`이 되거나 조용히 오염됨.
2. **§5-4**: 메인 BFS 루프가 후보를 못 찾은 타일도 무조건 `filled=1`로 찍어, 미해결 원본 내용이 이후
   타일들에 "신뢰 가능한 문맥"으로 잘못 전파되고 최종 폴백 스윕에서도 빠짐 — 이미지 전체 선택 시
   전체가 원본 색 하나로 뒤덮이는 결과로 실측.
