# Studio Panel Auto-Fit(이미지 드롭 → 패널 자동 맞춤) — StudioPage.tsx 통합 설계

> **이 문서만 작성 대상이다 — `StudioPage.tsx`는 이 세션에서 의도적으로 수정하지 않았다.** 새로
> 만든 순수 로직 파일(`studio-panel-autofit.ts`, `studio-panel-autofit.test.ts`)만 있고, 아래는
> 후속 통합 패스가 정확히 어디에 무엇을 넣어야 하는지에 대한 지시서다. 라인 번호는 **커밋
> `79359be0dd41beefa446a5ee8a81b73c54d47b88` 기준**(`StudioPage.tsx` 15,052줄) — 이 저장소는
> 병렬 세션이 `StudioPage.tsx`를 동시에 건드릴 수 있어 통합 시점엔 몇 줄 어긋나 있을 수 있다.
> 각 절의 "앵커"(정확히 일치해야 하는 기존 코드 조각)로 검색해 실제 위치를 재확인할 것.
>
> **이 기능은 다른 배치들과 달리 "무장식(armed) 도구"가 아니다.** 새 토글 버튼/패널/커서
> 오버레이가 없고, 기존 "이미지 요소를 드래그해서 놓는" 제스처의 **종료 시점**에 사후 처리 로직
> 하나를 끼워 넣을 뿐이다. 따라서 `disarmAllPixelTools()`/armed 변수 목록/Esc 키 체인/
> `draggable`·`onSelect` 가드 체인(`!xxxArmed`)/커서 `<Layer>` 같은, 다른 통합 문서(예:
> `studio-liquify-integration.md`, `studio-puppet-warp-design.md`)의 필수 체크리스트 항목은
> **이 기능에는 해당사항이 없다** — 빠뜨린 게 아니라 애초에 적용 대상이 아니다.

## 0. 한 줄 요약

이미지 요소를 드래그해서 기존 패널(`FrameEl`) 위에 놓으면(중심이 그 패널 안에 있고 겹침 비율이
50% 이상), 놓자마자 자동으로 그 패널을 cover 방식(비율 유지, 넘치는 부분은 클립)으로 꽉 채우도록
이미지의 x/y/width/height 를 다시 계산해 적용한다. Canva 컷툰 에디터의 "그리드에 이미지를 끌어다
놓으면 자동으로 칸에 맞춰진다"를 재현한다.

## 1. 새로 만든 파일

- `src/domains/creator/studio-panel-autofit.ts` — 순수 로직(DOM/Konva 의존 없음). 사각형 겹침 비율
  계산 + 드롭 대상 프레임 판정 + 자격(eligibility) 판정 + `studio-fit.ts` 의 `coverFitInFrame` 을
  재사용한 최종 patch 계산.
- `src/domains/creator/studio-panel-autofit.test.ts` — 26개 유닛 테스트, 전부 통과
  (`npx vitest run src/domains/creator/studio-panel-autofit.test.ts`).

둘 다 이 상태(기존 파일 무수정)에서 `npx tsc --noEmit -p .` / `npx eslint
src/domains/creator/studio-panel-autofit.ts src/domains/creator/studio-panel-autofit.test.ts` 클린
통과했다.

`export` 목록:

| 구분 | export |
|---|---|
| 타입 | `FitBox`(studio-fit.ts 재수출) |
| 상수 | `PANEL_AUTOFIT_OVERLAP_THRESHOLD`(0.5) |
| 겹침 판정 | `rectOverlapRatio`, `isCenterInside` |
| 대상 선택 | `findBestAutoFitFrame` |
| 자격 판정 | `isEligibleForPanelAutoFit` |
| 최종 patch | `computePanelAutoFitPatch` |

---

## 2. 왜 이렇게 설계했는가 — 선행 조사 결과 + 원 지시서 대비 편차 1가지(중요, 먼저 읽을 것)

작업 지시서(design 요청 프롬프트)는 새 순수 함수가 "cropX,cropY,cropWidth,cropHeight 등 Konva의
Image cropping 옵션에 대응하는 값"을 계산하길 제안했다. **코드베이스를 먼저 조사한 결과, 이 방향을
의도적으로 택하지 않았다** — 이유를 아래에 남긴다(다음에 이 문서를 읽는 사람이 "왜 크롭 필드가
없지?"라고 의아해하지 않도록).

1. **"패널에 꽉 채우기(cover)"는 이미 존재하는 기능이었다.** `StudioPage.tsx` 의
   `fitSelectedToFrame()`(라인 6106-6115, 사이드바 "패널에 꽉 채우기" 버튼이 호출)이 이미
   `studio-fit.ts` 의 `coverFitInFrame(el, frame)` 을 써서 선택된 이미지를 "들어있는 패널
   (`containingPanel()`) 또는 캔버스"에 cover 로 맞춘다. 이 기존 함수는 **Konva 네이티브 crop 을
   전혀 쓰지 않는다** — 원본 종횡비를 유지한 채 **확대한 박스**를 프레임 중앙에 배치해서 돌려줄
   뿐이고, 그 박스 자체의 주석이 명시하듯("넘치는 부분은 패널 클립이 가린다") **렌더러가 이미 갖고
   있는 `containingPanel()`/`panelClip` 클리핑**(§2.1)에 크롭을 위임한다. 즉 "cover 맞춤"은 이미
   `{x, y, width, height}` 만으로 100% 구현 가능했고, `ImageEl` 스키마에 크롭 필드를 추가할 필요가
   전혀 없었다.
2. 이 기존 함수(`coverFitInFrame`)를 그대로 재사용하지 않고 Konva 의 `crop`/`cropX`/`cropY`/
   `cropWidth`/`cropHeight`(모두 `Image.js` 팩토리가 실제로 지원하는 속성 — 확인함,
   `node_modules/konva/lib/shapes/Image.js` 의 `Factory.addGetterSetter(Image, 'cropX', ...)` 등)
   방식으로 **별도의 두 번째 cover 구현**을 새로 만들었다면: (a) `ImageEl` 에 4개 필드를 새로
   추가해야 하고(스키마 변경), (b) `UrlImage`(§3.4)의 `<KImage>` JSX 에 크롭 prop 배선이
   필요하고, (c) 크롭 좌표는 **원본 자연 픽셀 크기**(`naturalWidth`/`naturalHeight`) 기준이라
   `e.target.image()` 로 로드된 이미지/캔버스에서 그때그때 읽어야 하며, (d) 다중 프레임 셀
   애니메이션(§2.3)처럼 프레임마다 원본 해상도가 다를 수 있는 경우 크롭 좌표가 셀마다 달라져야
   하는 문제가 새로 생긴다 — 그러면서도 **이미 셰이핑된 기존 매커니즘과 시각적으로 똑같은
   결과**를 만드는 것뿐이라 실익이 없었다. "이미 있는 로직이 있으면 재사용하라"는 원칙을 그대로
   따라 `coverFitInFrame` 을 재사용하기로 했다 — 이 판단이 원 지시서의 문면(cropX 등)과 다른
   유일한 지점이다.
3. 이 모듈이 **새로** 만든 것은 원 지시서가 요구한 다른 절반, 즉 **"드롭 위치가 어느 프레임을
   향한 것인지" 판정**(사각형 겹침 비율 계산)이다 — 이건 코드베이스 어디에도 없었다(§2.2).

### 2.1 기존 클립 매커니즘과의 관계(충돌 없음 확인)

`StudioPage.tsx` 의 `renderEl`(라인 10075 부근) 안에서, 모든 비-frame 요소는 렌더마다
`containingPanel(el, elements)`(라인 1205-1223)를 호출해 "중심이 어떤 프레임 안에 있고, 그
프레임보다 1.4배 이상 크지 않으면" 그 프레임의 `{x,y,width,height}` 로 `<Group clipX clipY
clipWidth clipHeight>` 를 씌운다(라인 10109-10132, `panelClip`/`wrapClip`). 이 기능이 적용한
결과(`computePanelAutoFitPatch`)의 `x/y/width/height` 는 **그 값을 계산에 쓴 바로 그 프레임과
정확히 중심이 일치**(`coverFitInFrame` 이 프레임 중앙 정렬로 계산)하므로, 다음 렌더에서
`containingPanel` 이 같은 프레임을 다시 찾아 클립을 씌운다 — **크롭이 실제로 시각화되는 지점은
바로 이 기존 클립이다.** 새 코드는 이 매커니즘에 아무것도 추가하거나 바꾸지 않는다(그냥 이미
동작하던 걸 다시 트리거할 뿐).

**알려진(그리고 물려받은) 한계**: 이미지 종횡비와 프레임 종횡비 차이가 극단적이면(예: 폭이 매우
넓은 파노라마 사진을 정사각형에 가까운 패널에) `coverFitInFrame` 이 만드는 확대 박스가 프레임의
1.4배를 넘을 수 있고, 그러면 `containingPanel` 이 그 프레임을 "포함 패널"로 인정하지 않아(라인
1215: `if (b.w > f.width * 1.4 || b.h > f.height * 1.4) continue;`) 클립이 적용되지 않는다(이미지가
잘리지 않고 그대로 넘쳐 보인다). **이건 이 기능이 새로 만든 버그가 아니라 기존 수동 "패널에 꽉
채우기" 버튼이 이미 갖고 있던 한계**다 — 같은 `coverFitInFrame` + `containingPanel` 조합을 쓰는 한
동일하게 물려받는다. 고치려면 `containingPanel` 의 1.4배 휴리스틱 자체를 바꿔야 하는데, 그건 이
기능 하나만이 아니라 클립을 쓰는 모든 요소 타입에 영향을 주는 별개 스코프라 이번 작업에서는 손대지
않았다.

### 2.2 새로 만든 것 — 겹침 비율(코드베이스에 없었음, 직접 확인)

기존 코드에서 "겹침"과 관련된 걸 전부 찾아봤다:

- `containingPanel()`(라인 1205-1223) — "중심이 프레임 안 + 요소가 프레임의 1.4배 이내"라는
  **다른** 휴리스틱이다. 비율이 아니라 boolean 에 가까운 판정이고, 렌더링(클립 적용 대상 선택)
  목적이라 이 기능(드롭 판정)에 그대로 쓰기엔 정책이 다르다(예: 사용자가 명시적으로 "여기 넣고
  싶다"는 드롭 제스처는 1.4배보다 관대한 기준이어도 될 수 있다 — 실제로 이 기능은 넘침 배율이
  아니라 겹침 "비율"로 판정한다).
- `captureAnimFrame()` 안의 지역 클로저 `overlaps`(라인 4979-4980) — AABB 교차 여부만 boolean 으로
  따지는 지역 함수, export 되지 않고 비율도 없다.

**겹침 비율(intersection area / min(areaA, areaB)) 계산 함수는 어디에도 없었다** — 그래서
`rectOverlapRatio` 를 새로 만들었다. 분모를 union(IoU)이 아니라 두 사각형 중 **더 작은 쪽의
면적**으로 둔 이유: 이 기능은 "캔버스 전체를 덮는 큰 배경 사진 vs 작은 컷 패널"처럼 크기 차이가
아주 큰 두 사각형을 자주 비교해야 한다. IoU 라면 한쪽이 다른 쪽을 완전히 포함해도 크기 차이가 크면
비율이 낮게 나와 "겹침"이라는 직관과 어긋난다(예: 패널을 완전히 뒤덮는 배경 사진은 IoU 로는
프레임 면적/이미지 면적 ≈ 0에 가까울 수 있다). min-area 분모(오버랩 계수)는 "이미지가 패널을
덮었다"/"패널이 이미지 안에 쏙 들어왔다" 두 경우 모두 1.0 에 가깝게 나와 이 용도에 맞는다.

### 2.3 다중 프레임 셀 애니메이션은 왜 제외했는가

`ImageEl.frames`(셀 애니메이션, `StudioAnimFrame[]`)가 2개 이상이면 자동맞춤을 시도하지 않는다
(`isEligibleForPanelAutoFit` 의 `frameCount` 가드). `coverFitInFrame` 은 **현재 표시 중인 셀의
width/height** 만 보고 계산하는데, 애니메이션의 다른 셀들은 원본 종횡비가 다를 수 있다(사용자가
손그림으로 셀마다 다른 캔버스에 그렸을 가능성). 자동맞춤을 반복 적용하면 사용자가 프레임별로 공들여
맞춰둔 배치를 드래그할 때마다 조용히 덮어써 버릴 위험이 있어, 이번 스코프에서는 배제했다(§7 "알려진
한계" 에도 다시 정리).

---

## 3. StudioPage.tsx 통합 지점 (실제 수정은 후속 패스가 수행)

총 5곳이다 — 다른 배치(퍼펫 워프 11곳, 리퀴파이 10곳 이상)보다 훨씬 적다. 이 기능이 armed 도구가
아니라 기존 드래그 제스처 하나의 종료 핸들러만 바꾸는 최소 스코프이기 때문이다.

### 3.1 import 추가 (1곳)

알파벳 순서상 `./studio-pages`(라인 310-321)와 `./studio-panel-shot-tags`(라인 322) **사이**에
삽입한다. 앵커: `} from "./studio-pages";` 바로 다음 줄, `import { shotTagBadgeText, ...} from
"./studio-panel-shot-tags";` 바로 앞.

```tsx
import { computePanelAutoFitPatch, isEligibleForPanelAutoFit } from "./studio-panel-autofit";
```

`FitBox` 타입은 **StudioPage.tsx 에 import 할 필요가 없다** — 아래 §3.3/§3.4 에서 이미 로컬로 있는
`FrameEl`(구조적으로 `{x,y,width,height}` 를 만족)을 그대로 넘기기 때문이다(구조적 타이핑, 캐스트
불필요 — `FrameEl` 을 `export` 할 필요도 없다).

### 3.2 `renderEl` 앞에 후보 프레임 계산 1줄 추가 (hoist)

`renderEl` 안에서 이미지 요소마다 매번 `elements.filter(...)` 를 다시 돌리지 않도록, 렌더당 한 번만
계산해 둔다. 앵커: `const timelineComposite = timelinePlaying ? resolveTimelineComposite(...) : null;`
(라인 10070-10072) 바로 다음, `const renderEl = (el: El, idx: number, opts: {...} = {}) => {` (라인
10075) 바로 앞.

```tsx
                // 이미지 드래그-드롭 패널 자동맞춤(studio-panel-autofit) 후보 프레임 — renderEl 안에서
                // 이미지 요소마다 매번 다시 필터링하지 않도록 렌더당 한 번만 계산한다. hidden 프레임은
                // containingPanel()과 동일하게 제외한다(자동맞춤 결과도 결국 그 클립 메커니즘에
                // 기대므로 대상이 일치해야 한다 — §2.1 참고). locked 프레임은 제외하지 않는다
                // (containingPanel()도 프레임의 locked 여부를 보지 않는다 — "잠금"은 프레임 자체가
                // 옮겨지지 않게 하는 것이지 다른 요소가 그 위에 도킹되는 걸 막는 개념이 아니다).
                const autoFitFrameCandidates = elements.filter((e): e is FrameEl => e.type === "frame" && !e.hidden);
```

기존 코드에 `elements.filter((e): e is FrameEl => e.type === "frame")` 형태의 타입가드 필터가 이미 2곳
(`addFrame()` 라인 6038, `addDiagonalSplit()` 라인 6060)에 있다 — 위 코드는 그 관용구에 `&&
!e.hidden` 만 덧붙인 것이다.

### 3.3 `el.type === "image"` 분기 — 자격 판정 + prop 전달

앵커(현재 코드, 라인 10133-10159):

```tsx
                if (el.type === "image") {
                  const isAnimTarget = frameAnimOpen && el.id === frameAnimTargetId && el.frames && el.frames.length > 1;
                  const onion = isAnimTarget
                    ? onionSkinLayers(el.frames!, clampFrameIndex(el.frames!, frameIndexOf(el.frames!, el.activeFrameId ?? null)), onionSkin)
                    : [];
                  // 단일-셀 온스킨(isAnimTarget)과 다중-트랙 재생 미리보기가 같은 요소를 동시에
                  // 건드리면 두 오버레이가 정의되지 않은 방식으로 충돌한다 — 패널의 eligible 계산이
                  // 이미 두 시스템을 UI 레벨에서 상호배제하지만(같은 요소는 frames.length>1 이면
                  // 트랙 추가가 애초에 막힘), 여기서도 방어적으로 한 번 더 가드한다.
                  const timelineOverride = isAnimTarget ? undefined : timelineComposite?.get(el.id);
                  const effectiveEl = timelineOverride ? ({ ...el, src: timelineOverride.src } as ImageEl) : el;
                  return wrapClip(
                    <Fragment key={el.id}>
                      {onion.map((layer) => (
                        <OnionSkinImage key={`onion-${el.id}-${layer.frame.id}`} el={el} layer={layer} />
                      ))}
                      <UrlImage
                        el={effectiveEl}
                        draggable={draggable}
                        innerRef={setRef}
                        onSelect={onSelect}
                        onChange={(patch) => patchEl(el.id, patch)}
                        dragBoundFunc={snapBoundFunc}
                      />
                    </Fragment>
                  );
                }
```

`effectiveEl` 계산(마지막 줄, `const effectiveEl = ...`) 다음, `return wrapClip(` 앞에 삽입하고,
`<UrlImage>` 에 `autoFitFrames` prop 을 추가한다:

```tsx
                  const timelineOverride = isAnimTarget ? undefined : timelineComposite?.get(el.id);
                  const effectiveEl = timelineOverride ? ({ ...el, src: timelineOverride.src } as ImageEl) : el;
                  // 패널 자동맞춤(studio-panel-autofit) — 이 이미지가 드래그 종료 시 자동맞춤을
                  // 시도해도 되는지 여기서 전부 판정해 autoFitFrames 하나로 UrlImage 에 넘긴다.
                  // null 이면 UrlImage 는 시도조차 하지 않고 기존과 완전히 동일하게 {x,y}만 패치한다.
                  //
                  // isGroupDragMember 가드는 필수다 — 다중 선택(marqueeIds.length > 1)으로 이 이미지를
                  // 포함해 여러 요소를 함께 끌면, onStageDragEnd(라인 7714 부근)가 드래그 시작 시점의
                  // stale elements 스냅샷 + 델타로 marqueeIds 전원을 별도로 한 번 더 commit 한다 —
                  // 이 자동맞춤이 먼저 커밋한 결과(오버사이즈 박스)를 그 델타 커밋이 곧바로 덮어써
                  // 버려(원래의 "옮겨진 원본 위치 + 델타"로 되돌아감) 화면이 한 프레임 반짝인 뒤
                  // 자동맞춤이 무효화되는 버그가 된다(§3.5에 원인을 상세히 기록). 그룹 드래그 중엔
                  // 이 기능을 아예 끄는 것으로 피한다 — 사용자 의도도 "이 이미지를 패널에 맞추기"가
                  // 아니라 "선택한 여러 요소를 함께 옮기기"이므로 자연스러운 선택이기도 하다.
                  //
                  // isEligibleForPanelAutoFit 은 회전/기울임/다중 프레임 셀 애니메이션/noClip 을
                  // 걸러낸다 — 각 사유는 studio-panel-autofit.ts 의 isEligibleForPanelAutoFit
                  // docstring 및 이 문서 §2.3/§7 참고.
                  const isGroupDragMember = marqueeIds.length > 1 && marqueeIds.includes(el.id);
                  const autoFitFrames =
                    !isGroupDragMember &&
                    autoFitFrameCandidates.length > 0 &&
                    isEligibleForPanelAutoFit({
                      rotation: el.rotation,
                      skewX: el.skewX,
                      skewY: el.skewY,
                      frameCount: el.frames?.length,
                      noClip: el.noClip,
                    })
                      ? autoFitFrameCandidates
                      : null;
                  return wrapClip(
                    <Fragment key={el.id}>
                      {onion.map((layer) => (
                        <OnionSkinImage key={`onion-${el.id}-${layer.frame.id}`} el={el} layer={layer} />
                      ))}
                      <UrlImage
                        el={effectiveEl}
                        draggable={draggable}
                        innerRef={setRef}
                        onSelect={onSelect}
                        onChange={(patch) => patchEl(el.id, patch)}
                        dragBoundFunc={snapBoundFunc}
                        autoFitFrames={autoFitFrames}
                      />
                    </Fragment>
                  );
                }
```

**왜 `isEligibleForPanelAutoFit` 을 `UrlImage` 안이 아니라 여기서 호출하는가**: `UrlImage` 의 `el`
prop 타입은 `ImageEl`(§3.4) 인데, `noClip` 은 `ImageEl` 자체 인터페이스(라인 812-887)에는 없고
`El` 교차 타입(라인 1047, `& { ... noClip?: boolean ... }`)에만 있는 필드다. 이 `if (el.type ===
"image")` 분기 안에서는 `el` 이 아직 `El`(교차 포함)로 좁혀져 있어 `el.noClip` 에 바로 접근할 수
있지만, `UrlImage` 내부의 `el: ImageEl` 로는 접근할 수 없다(타입 에러) — 그래서 자격 판정은
접근 가능한 이 지점에서 미리 끝내고, `UrlImage` 에는 "시도해도 되는 후보 목록(또는 null)"이라는
이미 걸러진 결과만 넘긴다.

### 3.4 `UrlImage` — prop 추가 + `onDragEnd` 오버라이드

**(a) 함수 시그니처.** 앵커(현재 코드, 라인 2414-2428):

```tsx
function UrlImage({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
}: {
  el: ImageEl;
  draggable: boolean;
  innerRef: (n: Konva.Image | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ImageEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
}) {
```

`autoFitFrames` 를 구조분해 목록과 타입 양쪽에 추가한다:

```tsx
function UrlImage({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
  autoFitFrames,
}: {
  el: ImageEl;
  draggable: boolean;
  innerRef: (n: Konva.Image | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ImageEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
  autoFitFrames: FrameEl[] | null;
}) {
```

(`FrameEl` 은 같은 파일에 이미 로컬로 정의돼 있으니 새 import 불필요.)

**(b) `<KImage>` JSX — `onDragEnd` 오버라이드.** 앵커(현재 코드, 라인 2513-2539, 파일 끝
`resizableNodeProps` 스프레드 줄까지 그대로):

```tsx
  return (
    <KImage
      studioElementId={el.id}
      ref={(n) => {
        imageRef.current = n;
        innerRef(n);
      }}
      image={displayImg}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      filters={filters}
      {...filterAttrs}
      shadowColor={el.shadowColor}
      shadowEnabled={!!el.shadowColor}
      shadowBlur={el.shadowBlur ?? 0}
      shadowOffsetX={el.shadowOffsetX ?? 0}
      shadowOffsetY={el.shadowOffsetY ?? 0}
      shadowOpacity={el.shadowOpacity ?? 1}
      cornerRadius={el.cornerRadius ?? 0}
      {...toKonvaSkewAttrs(el)}
      {...resizableNodeProps<Partial<ImageEl>>({ draggable, dragBoundFunc, onSelect, onChange })}
    />
  );
}
```

`{...resizableNodeProps(...)}` 스프레드 **다음 줄**(닫는 `/>` 앞)에 명시적 `onDragEnd` 를 추가한다
— JSX 에서 스프레드 다음에 오는 명시적 prop 이 같은 키를 덮어쓰므로(스프레드가 제공하는 `draggable`/
`dragBoundFunc`/`onMouseDown`/`onTap`/`onTransformEnd` 는 그대로 유지되고 `onDragEnd` 만 바뀐다),
`studio-node-props.ts`(공용 파일, 이번에 손대지 않음)는 전혀 건드릴 필요가 없다:

```tsx
      {...resizableNodeProps<Partial<ImageEl>>({ draggable, dragBoundFunc, onSelect, onChange })}
      onDragEnd={(e) => {
        // 패널 자동맞춤(studio-panel-autofit) — resizableNodeProps 의 기본 onDragEnd({x,y}만
        // 패치)를 이 이미지 한정으로 덮어쓴다. autoFitFrames 는 호출부(renderEl, §3.3)가 이미
        // "그룹 드래그 중이 아니고 자격도 있음"까지 걸러서 넘긴다 — null 이거나 빈 배열이면
        // 시도조차 하지 않고 기존과 완전히 동일하게 동작한다.
        const draggedX = e.target.x();
        const draggedY = e.target.y();
        const fit =
          autoFitFrames && autoFitFrames.length > 0
            ? computePanelAutoFitPatch(
                { x: draggedX, y: draggedY, width: el.width, height: el.height },
                autoFitFrames
              )
            : null;
        onChange(fit ?? { x: draggedX, y: draggedY });
      }}
```

`e.target.x()`/`e.target.y()` 는 `resizableNodeProps` 의 기존 `onDragEnd`(`studio-node-props.ts`
라인 30)와 완전히 같은 접근이라 새로운 타입 리스크가 없다 — `Konva.Node` 기본 클래스의 메서드라
`e.target` 이 정확히 `Konva.Image` 로 좁혀지지 않아도 컴파일된다.

### 3.5 (필독) 다중 선택 그룹 드래그와의 상호작용 — 놓치면 재현하기 어려운 버그가 생긴다

`StudioPage.tsx` 에는 마퀴(박스) 다중 선택 후 그 중 하나를 끌면 나머지도 함께 따라오는 기존
기능이 있다(`marqueeIds: string[]`, 라인 3083). 동작 원리:

- `onStageDragMove`(라인 7561-7713) — Stage 에 버블된 단일 핸들러. 끄는 노드가 `marqueeIds` 의
  일원이면(`marqueeIds.length > 1 && marqueeIds.includes(draggedId)`, 라인 7571), 매 프레임 그
  노드의 이동량(delta)을 `groupDragRef` 에 누적하고, **나머지 선택 노드들의 Konva 좌표를 직접
  imperatively**(`other.x(other.x() + ddx)`) 옮긴다(리액트 상태 변경 없음, 그냥 시각적 미리보기).
- `onStageDragEnd`(라인 7714-7736) — 드래그가 끝나면 `groupDragRef` 에 쌓인 총 델타(`dx = dnode.x()
  - g.x0`)를 **`marqueeIds` 전원**(끈 노드 본인 포함, 라인 7726: `mv = new Set(marqueeIds)`)에
  적용해 **한 번에 commit** 한다. 이때 `next` 계산은 이 시점의 (아직 이전 렌더의) `elements`
  클로저를 기준으로 한다.

Konva 이벤트는 기본적으로 버블링되므로, 이 이미지 하나를 끌어 그룹 드래그를 했을 때 `dragend`
이벤트는 (1) `UrlImage` 의 `<KImage>` 자신의 `onDragEnd`(§3.4, `patchEl` 호출) → (2) Stage 의
`onStageDragEnd` 순서로 **같은 동기 이벤트 디스패치 안에서 두 번** 발화한다. 두 핸들러 모두 커밋
시점의 `elements` 클로저가 아직 (1)의 `setState` 를 반영하지 않은 **stale 값**을 본다 — 일반
이동(`{x,y}` 만 패치)에서는 (2)가 "stale x + 총 델타"로 계산해도 결국 (1)이 만든 최종 좌표와 같은
값에 도달하므로 눈에 보이는 문제가 없다.

**그런데 이 기능이 (1)에서 `{x, y}` 대신 자동맞춤 결과(`{x, y, width, height}` — 프레임 크기에 맞춰
확대/재배치된 값)를 커밋하면, (2)는 여전히 "stale x(자동맞춤 전 원래 좌표) + 총 델타"만 계산해서
`marqueeIds` 전원(이 이미지 포함)에 다시 commit 한다** — 이 두 번째 commit 은 (1)이 만든 결과를
전혀 모르는 채로 **완전히 새 `nextPages` 배열**을 쌓으므로, 히스토리 스택에서 (1)의 자동맞춤
결과를 그대로 덮어써 버린다. 최종적으로 이미지는 프레임에 맞춰지지 않고 "원래 크기 그대로, 델타만
이동한" 위치에 남는다(짧은 순간 자동맞춤이 적용됐다가 바로 원상복구되는 것처럼 보일 수 있다).

**해결책은 이 기능을 그룹 드래그 중엔 아예 끄는 것이다**(§3.3 의 `isGroupDragMember` 가드) —
`cancelBubble` 을 설정하는 방식은 **쓰지 않는다**: `onDragEnd` 에서 `e.cancelBubble = true` 를 하면
`onStageDragEnd` 로의 버블링 자체가 막혀 **그 제스처가 실제로 그룹 드래그였을 때 다른 선택 요소들의
위치가 전혀 커밋되지 않는** 회귀가 생긴다(자동맞춤이 적용되지 않는 케이스에서도 마찬가지로 막혀
버리므로). `isGroupDragMember` 가드로 애초에 자동맞춤을 시도하지 않으면 이 이미지의 `onDragEnd`
도 기존과 똑같이 `{x, y}` 만 패치하고, 버블링도 전혀 건드리지 않으므로 그룹 드래그 커밋 로직은
100% 기존 그대로 동작한다.

(참고: 단일 요소 드래그일 때도 `dragend` 는 여전히 `onStageDragEnd` 로 버블되지만, 그때는
`marqueeIds.length > 1` 이 거짓이라 `onStageDragEnd` 안의 그룹 커밋 블록이 그냥 no-op 이다 — 오늘도
이미 이렇게 동작하고 있어 이 기능과 무관하다.)

---

## 4. 겹침 판정 임계값 설계

- **조건 (AND)**: (a) 이미지 중심이 프레임 경계 안(포함) + (b) `rectOverlapRatio(movedImageBounds,
  frame) >= 0.5`. 프롬프트가 예시로 든 정책 그대로다.
- **왜 두 조건 다 필요한가**: 비율만 보면, 아주 큰 이미지가 작은 프레임을 완전히 뒤덮되 그
  이미지의 중심 자체는 그 프레임에서 멀리 떨어진 경우에도 비율이 1.0 이 나올 수 있다(프레임이
  이미지에 완전히 포함되면 min-area 분모상 비율은 항상 1) — 이런 경우까지 "드롭 대상"으로 잡으면
  사용자가 의도하지 않은 먼 패널이 갑자기 자동맞춤될 수 있다. 중심-포함 조건이 이걸 막는다(유닛
  테스트 `findBestAutoFitFrame > 겹침 비율은 높아도(포함) 중심이 프레임 밖이면 null` 참고).
- **여러 프레임이 동시에 조건을 만족하면**(겹치거나 인접한 패널 사이에 드롭): 겹침 비율이 더 큰
  쪽 → 동률이면 면적이 더 작은 쪽(더 안쪽 패널). `containingPanel()` 의 "가장 작은 패널이 이긴다"
  타이브레이크와 같은 방향으로 맞춰, 두 판정 로직의 결과가 최대한 어긋나지 않게 했다.
- **threshold 는 하드코딩하지 않고 `PANEL_AUTOFIT_OVERLAP_THRESHOLD`(기본 0.5)로 노출**했다 —
  나중에 UX 튜닝(예: 사용자 테스트 결과 0.5가 너무 민감/둔감하면)이 필요하면 이 상수 하나만
  바꾸면 된다. `findBestAutoFitFrame`/`computePanelAutoFitPatch` 둘 다 세 번째 인자로 override
  가능(옵션 인자, 기본값 = 이 상수).

---

## 5. 통합 체크리스트 (후속 패스용)

- [ ] import 1곳(§3.1)
- [ ] `autoFitFrameCandidates` hoist 1줄(§3.2)
- [ ] `el.type === "image"` 분기에 자격 판정 + `autoFitFrames` prop 전달(§3.3)
- [ ] `UrlImage` 함수 시그니처에 `autoFitFrames` 추가(§3.4a)
- [ ] `UrlImage` 의 `<KImage>` 에 `onDragEnd` 오버라이드 추가(§3.4b) — **`{...resizableNodeProps(...)}`
      스프레드 다음 줄에 넣어야 오버라이드가 먹는다(순서 중요)**
- [ ] §3.5 의 그룹 드래그 가드(`isGroupDragMember`)가 실제로 들어갔는지 재확인 — **이게 없으면
      다중 선택 드래그 중 이 이미지가 우연히 어떤 패널과 50% 이상 겹쳤을 때만 재현되는, 찾기
      어려운 "자동맞춤이 적용됐다가 바로 원복되는" 버그가 생긴다**
- [ ] `npx tsc --noEmit -p .` / `npx eslint` 클린
- [ ] `npx vitest run src/domains/creator/studio-panel-autofit.test.ts` 통과(이미 확인됨, 통합 후
      재확인 목적)

## 6. 수동 QA 체크리스트

- [ ] 빈 캔버스에 패널(프레임) 하나를 추가 → 이미지 요소를 그 패널 중앙 근처로 드래그해서 놓으면
      즉시 패널을 꽉 채우도록 크기/위치가 바뀐다(넘치는 부분은 패널 경계에서 잘려 보인다).
- [ ] 이미지를 패널 가장자리에 살짝만 겹치게(중심은 안이지만 겹침 <50%) 놓으면 자동맞춤이
      적용되지 **않고** 원래 크기 그대로 그 자리에 놓인다.
- [ ] 이미지를 패널 밖 빈 캔버스에 놓으면 자동맞춤이 적용되지 않는다(기존과 동일).
- [ ] 패널 두 개가 인접한 경계 부근에 드롭 → 겹침 비율이 더 큰(또는 더 작은) 쪽 패널에 맞춰진다.
- [ ] `⌘Z` 로 되돌리면 자동맞춤 이전(드래그 시작 전 원래 크기/위치)으로 정확히 복원된다(히스토리
      1건).
- [ ] 이미지를 회전(rotation ≠ 0)시킨 뒤 패널 위로 드래그 → 자동맞춤이 적용되지 **않고** 단순
      이동만 된다(§7 참고).
- [ ] 다중 선택(마퀴)으로 이미지 포함 2개 이상을 함께 드래그해 패널 위에 놓아도, 이미지가
      자동으로 크기 변경되지 않고(그룹 이동만) 나머지 선택 요소들도 정상적으로 함께 이동/커밋된다
      (§3.5의 핵심 회귀 시나리오).
- [ ] 셀 애니메이션(다중 프레임)으로 설정된 이미지는 패널 위에 드래그해도 자동맞춤이 적용되지
      않는다(§2.3).
- [ ] `noClip` 이 설정된 이미지는 패널 위에 드래그해도 자동맞춤이 적용되지 않는다.

---

## 7. 스케치 대비 편차 · 알려진 한계

1. **크롭 필드(cropX/Y/W/H)를 추가하지 않았다.** §2 에서 상세히 근거를 남겼다 — 이미 존재하는
   `coverFitInFrame`(확대+중앙정렬 + 기존 패널 클립에 위임) 방식을 재사용하는 게 스키마 변경 없이
   동일한 시각적 결과를 내는 더 단순한 경로였다.
2. **회전(rotation)·기울임(skewX/skewY)이 있는 이미지는 자동맞춤 대상에서 제외했다.**
   `coverFitInFrame` 이 반환하는 박스는 축이 맞는(axis-aligned) `x/y/width/height` 이고 프레임도
   회전 필드가 없다 — 이미 회전/기울임이 적용된 이미지에 이 박스를 그대로 대입하면 시각적으로
   프레임과 맞아떨어지지 않는다(참고로 기존 수동 "패널에 꽉 채우기" 버튼도 rotation 을 건드리지
   않아 같은 한계가 있다). 자동으로(사용자가 명시적으로 누르지 않았는데) 회전된 배치의 rotation
   을 조용히 무시하거나 리셋하는 "놀람"을 피하려고, 드래그-자동 버전은 아예 배제하는 쪽을
   택했다 — 회전된 이미지에 대해서도 cover 맞춤을 원하면 기존 수동 버튼(선택 후 "패널에 꽉
   채우기")을 쓰면 된다(그 버튼도 결과가 완벽히 정렬되진 않지만, 사용자가 명시적으로 요청한
   동작이라 자동 트리거보다 놀람이 훨씬 적다).
3. **다중 프레임 셀 애니메이션은 배제했다**(§2.3) — 셀마다 원본 종횡비가 다를 수 있어 반복 적용
   시 사용자가 맞춰둔 프레임별 배치를 덮어쓸 위험이 있다.
4. **`noClip` 요소는 배제했다** — 이 기능의 "크롭"은 전부 기존 패널 클립 매커니즘에 위임하므로,
   그 클립이 애초에 적용되지 않는 요소에 오버사이즈 박스만 만들면 이미지가 잘리지 않고 그대로
   넘쳐 보이는 명백한 회귀가 된다.
5. **극단적 종횡비 불일치 시 1.4배 클립 컷오프를 물려받는다**(§2.1) — 새로 만든 버그가 아니라
   기존 수동 버튼과 공유하는 한계이며, `containingPanel()` 자체를 바꾸는 건 이번 스코프 밖이다.
6. **다중 선택 그룹 드래그 중엔 기능을 끈다**(§3.5) — 이건 "덜 만들어서 생긴 한계"가 아니라
   `onStageDragEnd` 의 stale-closure 델타 커밋과의 상호작용을 분석한 결과 나온 **의도적이고 필수적인
   가드**다. 그룹 드래그에도 자동맞춤을 지원하려면 `onStageDragEnd` 자체를 다시 설계해야 하는데
   (예: 그룹 내 개별 요소가 만든 patch 를 인식하고 그 위에 델타만 더하는 방식), 그건 이 기능
   하나가 아니라 그룹 드래그 커밋 로직 전체에 영향을 주는 별개의 더 큰 스코프라 손대지 않았다.
7. **드래그 중 실시간 "이 프레임에 맞춰질 예정" 미리보기(하이라이트)는 만들지 않았다.** 이 기능은
   `onDragEnd`(놓는 순간)에만 개입하고, `onStageDragMove`(드래그 중, 라인 7561)에는 아무것도
   추가하지 않았다 — 프롬프트가 요청한 범위가 "드롭했을 때"였다. Canva 처럼 드래그 중에 대상
   패널을 하이라이트하고 싶다면, `onStageDragMove` 안에서 이 모듈의 `findBestAutoFitFrame` 을 매
   프레임 호출해 대상 프레임 id 를 하이라이트 상태로 저장하는 방식으로 확장할 수 있다(이 모듈이
   이미 그 판정 함수를 독립적으로 export 해 뒀으므로 재사용 가능) — 이번 스코프에서는 구현하지
   않았다.
8. **잠긴(locked) 프레임도 자동맞춤 대상에서 제외하지 않는다**(§3.2) — `containingPanel()` 도
   프레임의 `locked` 여부를 클립 대상 판정에 쓰지 않으므로 일관성을 위해 그대로 따랐다. 다르게
   하고 싶다면(잠긴 패널엔 자동으로 도킹되지 않게) `autoFitFrameCandidates` 필터에 `&&
   !e.locked` 를 추가하면 된다 — 사용자 피드백 없이 선제적으로 넣지는 않았다.
