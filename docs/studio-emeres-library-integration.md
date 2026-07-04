# 이메레스 개인 보관함 — StudioPage.tsx 통합 가이드

이 문서는 `studio-emeres-library.ts` / `StudioEmeresLibraryPanel.tsx`(순수 로직 + 프레젠테이션, 이미
구현·테스트 완료)를 `StudioPage.tsx`에 실제로 배선하는 **다음 통합 패스**를 위한 지시서다. 이번 패스는
새 파일만 추가했고 `StudioPage.tsx`는 의도적으로 건드리지 않았다.

- 기준 커밋: `6285df150aea7ddbb52855686c3e0f8c2f06b06c` (라인 번호는 이 커밋 기준 근사치 — 그 사이
  다른 패스가 머지되면 라인이 밀릴 수 있으니, 라인 번호보다 **식별자/함수명으로 찾아** 앵커링할 것)
- 새로 추가된 모듈: `src/domains/creator/studio-emeres-library.ts`, `src/domains/creator/StudioEmeresLibraryPanel.tsx`
- 기존에 이미 있는 것(재사용 대상): `src/domains/creator/studio-emeres-templates.ts`(`EmeresCategory`,
  `EMERES_CATEGORIES`, `EmeresTemplate`, `emeresSections`), `StudioPage.tsx`의 `addEmeresTemplate`,
  `elBounds`, `captureAnimFrame`/`saveSelectionAsClip`(캡처 패턴), `contextMenu`/`contextMenuEl` 상태,
  `lazyRetry`(다른 무거운 패널들과 동일 로딩 관례)

## 1. `El` 타입에 출처 마커 필드 추가

`StudioPage.tsx:1047`의 교차 타입에 선택 필드 하나만 추가한다:

```ts
export type El = (ImageEl | TextEl | BubbleEl | StickerEl | DrawEl | FrameEl | FocusLinesEl | SpeedLinesEl) & {
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  noClip?: boolean;
  opacity?: number;
  blendMode?: string;
  lockAspect?: boolean;
  groupId?: string;
  clipBelow?: boolean;
  alphaLocked?: boolean;
  maskSrc?: string;
  maskEnabled?: boolean;
  /** 이 요소가 이메레스 밑그림 틀로 삽입됐는지 + 어디서 왔는지 표식.
   *  카탈로그 틀: t.id 그대로("emeres_face_each_other" 등). 개인 보관함 항목: `custom:${item.id}`
   *  (접두사로 구분 가능하지만 현재는 어떤 소비자도 접두사를 파싱하지 않음 — 두 출처 모두
   *  "이메레스에서 온 요소"라는 사실 자체만으로 일괄 삭제 대상이 된다). */
  emeresSourceId?: string;
};
```

`addEmeresTemplate`(현재 `~6153`)이 만드는 두 `el` 리터럴(프레임 안/밖 분기) 모두에
`emeresSourceId: t.id`를 추가한다.

## 2. 캔버스 삽입 — `addEmeresLibraryItem`

`addEmeresTemplate` 바로 아래(또는 옆)에 대응 함수를 추가한다. 카탈로그 버전과 거의 동일하되,
`t.svg`를 `svgToDataUrl`로 변환하는 대신 이미 래스터 dataURL인 `item.src`를 그대로 쓴다:

```ts
// 개인 보관함(studio-emeres-library) 항목을 캔버스에 삽입 — addEmeresTemplate과 배치 로직은
// 동일하되, svgToDataUrl 변환이 없고(item.src가 이미 dataURL) emeresSourceId에 `custom:` 접두사를 붙인다.
function addEmeresLibraryItem(item: StudioEmeresLibraryItem) {
  setMenu(null);
  const src = item.src;
  const opacity = studioOptionalAssets.emeresUnderlayOpacity;
  let el: El;
  if (selected?.type === "frame") {
    const fit = Math.min(selected.width / item.width, selected.height / item.height) * 0.94;
    const w = Math.round(item.width * fit);
    const h = Math.round(item.height * fit);
    el = {
      id: uid(),
      type: "image",
      src,
      x: Math.round(selected.x + (selected.width - w) / 2),
      y: Math.round(selected.y + (selected.height - h) / 2),
      width: w,
      height: h,
      rotation: 0,
      opacity,
      locked: true,
      emeresSourceId: `custom:${item.id}`,
    };
  } else {
    el = {
      ...createCanvasImageElement({
        id: uid(),
        src,
        canvasWidth: CANVAS_W,
        canvasHeight: canvasH,
        sourceWidth: item.width,
        sourceHeight: item.height,
        horizontalInset: 80,
      }),
      opacity,
      locked: true,
      emeresSourceId: `custom:${item.id}`,
    };
  }
  commit([...elements, el]);
  setSelectedId(null);
  setTool("draw");
  setDrawMode("pen");
}
```

`studio-emeres-library`에서 `type StudioEmeresLibraryItem`을 import해야 한다.

## 3. 우클릭 컨텍스트 메뉴 — "이메레스로 저장"

컨텍스트 메뉴는 `contextMenu.elId`가 있을 때(`~14909`) `vrm-poser`/`bg3d` 조건부 항목 →
복제/정렬 항목 순으로 렌더된다. 그 사이(정렬 항목들 앞, 또는 vrm-poser/bg3d 블록 바로 다음)에
새 항목을 추가한다. 캡처 로직은 `captureAnimFrame`(`~4963`)의 `stage.toDataURL` + 회전 가드 패턴을
그대로 재사용하되, "프레임에 합성"이 아니라 "새 독립 보관함 항목 생성"이라 저장 흐름은
`saveSelectionAsClip`(`~6242`)의 `globalThis.prompt` 이름 입력 흐름에 더 가깝다:

```ts
// 우클릭한 요소를 이메레스 개인 보관함에 저장 — captureAnimFrame의 stage.toDataURL + 회전 가드
// 패턴을 재사용하되, 프레임에 합성하지 않고 독립 StudioEmeresLibraryItem으로 저장한다.
// captureAnimFrame과 달리 draw 스트로크 "소거" 로직은 없다(이건 새 프레임을 만드는 게 아니라
// 기존 요소를 그대로 참고 이미지로 복사하는 것 — 캔버스의 다른 요소는 전혀 건드리지 않는다).
async function saveElementAsEmeresLibraryItem(elId: string) {
  const el = elementById.get(elId);
  if (!el) return;
  // "rotation" in el 가드가 필수다 — El은 (ImageEl | TextEl | BubbleEl | StickerEl | DrawEl |
  // FrameEl | FocusLinesEl | SpeedLinesEl) & {...} 유니언이고, DrawEl/FrameEl은 rotation 필드가
  // 아예 없다(둘 다 좌표/폭·높이 또는 points 자체로 형태를 표현해 "전체 회전" 개념이 없음).
  // captureAnimFrame처럼 el.type !== "image"로 좁히지 않고 모든 타입을 받는 함수라 el.rotation을
  // 바로 접근하면 "Property 'rotation' does not exist on type 'El'"로 컴파일이 깨진다(DrawEl/FrameEl
  // 분기에서). "rotation" in el로 먼저 좁히면 그 필드가 없는 타입은 자연히 회전 0°로 취급돼
  // (프레임·드로잉은 애초에 회전 개념이 없으니) 안전하게 저장을 허용한다.
  if ("rotation" in el && el.rotation) {
    setError("회전이 0°인 요소만 이메레스로 저장할 수 있어요.");
    return;
  }
  if (el.groupId) {
    setError("그룹에 속한 요소는 이메레스로 저장할 수 없어요. 그룹을 해제한 뒤 다시 시도하세요.");
    return;
  }
  const stage = stageRef.current;
  if (!stage) return;
  const bounds = elBounds(el);
  setSelectedId(null); // Transformer 핸들 캡처 방지(captureAnimFrame과 동일 관행)
  await new Promise((r) => setTimeout(r, 60)); // 재렌더 대기(captureAnimFrame과 동일 관행)
  const src = stage.toDataURL({ x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, pixelRatio: 2 / effScale });
  const name = globalThis.prompt("틀 이름을 정해주세요", "내 이메레스 틀")?.trim();
  setContextMenu((prev) => ({ ...prev, visible: false }));
  if (!name) return;
  try {
    const { createEmeresLibraryItem, saveEmeresLibraryItem } = await import("./studio-emeres-library");
    const created = createEmeresLibraryItem(name, { src, width: Math.round(bounds.w), height: Math.round(bounds.h) });
    saveEmeresLibraryItem(globalThis.localStorage, created);
  } catch (err) {
    console.error("Failed to save emeres library item:", err);
    setError("이메레스로 저장하지 못했습니다.");
  }
}
```

메뉴 항목(Save 아이콘 등 이미 임포트된 lucide 아이콘 재사용, 예: `ImagePlus`):

```tsx
<button
  type="button"
  onClick={() => void saveElementAsEmeresLibraryItem(contextMenu.elId!)}
  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
>
  <ImagePlus size={12} />
  이메레스로 저장
</button>
<div className="my-1 h-px bg-line" />
```

**타입 제약 없음** — `captureAnimFrame`은 `el.type !== "image"`을 막지만, 이건 "밑그림 참고 이미지로
박제"하는 것이라 텍스트/말풍선/스티커/그림 등 모든 타입에 열려 있다(회전 0°, 비그룹 제약만 유지).
배치 위치는 vrm-poser/bg3d 조건부 블록 다음, 복제(⌘D) 항목 앞을 권장 — "이 요소로 할 수 있는
특수 동작"과 "일반 정렬/변형 동작" 사이의 기존 구분 관례를 따른다.

`studio-emeres-library`는 이미 lazy import(`await import(...)`)로만 참조한다 — 컨텍스트 메뉴는
드물게 쓰이므로 이 모듈을 정적 import에 추가할 필요가 없다(patternized after `saveSelectionAsClip`'s
`await import("./studio-clips")`).

## 4. 일괄 삭제 — `removeEmeresUnderlays`

이메레스 메뉴 헤더에 "밑그림 전부 지우기" 버튼 + 실시간 개수를 추가한다. §1의 `emeresSourceId` 덕분에
필터만 하면 된다:

```ts
const emeresUnderlayCount = elements.filter((e) => e.emeresSourceId != null).length;

function removeEmeresUnderlays() {
  if (emeresUnderlayCount === 0) return;
  if (!globalThis.confirm(`이메레스 밑그림 ${emeresUnderlayCount}개를 전부 지울까요? 그 위에 그린 펜 선은 지워지지 않아요.`)) return;
  commit(elements.filter((e) => e.emeresSourceId == null));
}
```

메뉴 헤더(현재 `~8613`의 안내 문구 `<p>` 바로 아래)에 조건부로 추가:

```tsx
{emeresUnderlayCount > 0 && (
  <button
    type="button"
    onClick={removeEmeresUnderlays}
    className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-bad/40 py-1 text-[0.64rem] font-semibold text-bad transition-colors hover:bg-bad/10"
  >
    <Trash2 size={11} /> 밑그림 전부 지우기 ({emeresUnderlayCount})
  </button>
)}
```

이게 기존에 문서화된 "레이어 패널에서 직접 지우세요" 안내(`~8615`의 `<p>` 문구)를 대체하진 않는다 —
그 문구는 "숨기기"까지 포함한 일반 안내라 그대로 두고, 이 버튼은 "한 번에 다 지우기"라는 빠른 경로만
추가한다.

## 5. 탭 — "기본 틀" / "내가 만든 틀"

새 상태 하나: `const [emeresTab, setEmeresTab] = useState<"catalog" | "mine">("catalog");`
(다른 로컬 메뉴 상태들 옆에 배치. 메뉴를 닫아도 리셋하지 않음 — 스코프 축소 §13 참고.)

이메레스 드롭다운(`menu === "emeres"`, `~8611`~`8690`) 내부에서, 안내 문구 `<p>` 아래·검색창 위에
세그먼트 탭을 추가하고, 기존 검색창+카테고리 칩+그리드 블록 전체를 `emeresTab === "catalog"`
조건부로 감싼다:

```tsx
<div className="mb-2 flex rounded-lg border border-line bg-card p-0.5">
  {(["catalog", "mine"] as const).map((tab) => (
    <button
      key={tab}
      type="button"
      onClick={() => setEmeresTab(tab)}
      aria-pressed={emeresTab === tab}
      className={cn(
        "flex-1 rounded-md py-1 text-[0.64rem] font-semibold transition-colors",
        emeresTab === tab ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
      )}
    >
      {tab === "catalog" ? "기본 틀" : "내가 만든 틀"}
    </button>
  ))}
</div>

{emeresTab === "catalog" ? (
  <>
    {/* 기존 검색창 + 카테고리 칩 + emeresSectionsFiltered 그리드 블록을 그대로 이 안으로 이동 */}
  </>
) : (
  <Suspense fallback={<StudioPanelLoading label="내가 만든 틀을 여는 중..." />}>
    <StudioEmeresLibraryPanel onPickItem={addEmeresLibraryItem} />
  </Suspense>
)}
```

`StudioPanelLoading`은 다른 lazy 패널(예: 톤 패널 `~8600`)이 이미 쓰는 fallback 컴포넌트를 그대로
재사용한다.

## 6. lazyRetry 등록

다른 무거운 패널들(`~630` 부근)과 같은 자리에:

```ts
const StudioEmeresLibraryPanel = lazyRetry(
  () => import("./StudioEmeresLibraryPanel").then((mod) => ({ default: mod.StudioEmeresLibraryPanel })),
  "StudioEmeresLibraryPanel"
);
```

`StudioBrushLibraryPanel`(`~630-633`)과 완전히 동일한 슬롯 클러스터. `menu === "emeres"`이고
`emeresTab === "mine"`일 때만 마운트되므로(§5), 청크는 실제로 그 탭을 열 때만 로드된다.

## 7. `disarmAllPixelTools()` — 변경 불필요

이번 기능 전체(캡처 저장, 캔버스 삽입, 일괄 삭제, 개인 보관함 패널)는 캔버스 포인터 제스처를
가로채는 도구가 아니다 — 기존 `addEmeresTemplate`이 이미 `disarmAllPixelTools()` 대상이 아닌 것과
동일한 이유(요소를 추가/삭제할 뿐 캔버스 위에서 직접 그리기/스포이드 같은 armed 상태를 만들지
않는다). `StudioEmeresLibraryPanel`도 브러시/팔레트 라이브러리 패널과 동일하게 이 목록에서 제외된다.

## 8. 테스트 갱신

- `StudioPage.tsx`에 로직을 추가하는 이번 통합 패스 자체에는 새 유닛 테스트가 필요 없다(순수 로직은
  이미 `studio-emeres-library.test.ts`가 커버함). 다만 이 저장소에 `StudioPage.tsx`용 통합/스모크
  테스트가 이미 있다면, "이메레스 메뉴에 탭 2개가 보인다"/"내가 만든 틀 탭 진입 시 빈 상태 문구가
  보인다" 정도의 렌더 스모크 테스트를 고려할 것.
- 기존 이메레스 카탈로그 동작(검색·카테고리 칩·`addEmeresTemplate` 배치)은 마크업 위치만 탭 안으로
  이동할 뿐 로직은 손대지 않으므로 회귀가 없어야 한다 — 통합 후 카탈로그 탭이 기본 선택 상태로
  기존과 동일하게 동작하는지 수동 확인 권장.

## 9. 권장 적용 순서

1. §1 `El` 타입 확장(다른 모든 변경의 전제)
2. §6 lazyRetry 등록 + §5 탭 상태/UI(카탈로그 블록은 그대로 두고 감싸기만)
3. §2 `addEmeresLibraryItem` + `StudioEmeresLibraryPanel` 마운트 배선(pick 동작 완성)
4. §3 컨텍스트 메뉴 저장 항목(저장 경로 완성 — 이제 캡처→저장→"내가 만든 틀"에서 확인 가능)
5. §4 일괄 삭제 버튼(마지막 — 가장 파괴적인 동작이라 앞의 모든 경로가 검증된 뒤 추가)

## 13. 이번 패스 스코프에서 제외한 것들

- **내보내기/가져오기 없음**: 팔레트(.gpl)·브러시(.json)와 달리 개인 보관함 항목에는 파일
  내보내기/가져오기가 없다. 이미지 데이터 자체가 곧 포맷이라 별도 상호운용 포맷을 만들 유인이
  적고, 로컬 전용 스크랩북 성격이 강하다고 판단했다. 필요해지면 `studio-brush-library.ts`의
  `writeBrushJson`/`importBrushFromJson` 패턴(kind 필드로 매직 체크)을 그대로 재사용하면 된다.
- **단일 요소만 저장**: `captureAnimFrame`처럼 회전 0°만 허용하고, 그룹(`groupId`)에 속한 요소는
  거부한다(§3). 여러 요소를 한 번에 하나의 참고 이미지로 합성하려면 먼저 그룹 해제 후 개별
  저장하거나, `saveSelectionAsClip`처럼 그룹 전체를 감싸는 bbox 캡처로 확장해야 하는데, 이번
  패스에서는 "요소 하나 = 참고 이미지 하나"로 단순화했다.
- **회전 미지원**: 위와 동일한 이유로 회전된 요소는 캡처를 거부한다(`captureAnimFrame`의 기존
  가드와 동일 — 회전된 bbox 캡처는 여백/왜곡 문제가 있어 별도 처리가 필요하다).
- **개인 보관함에는 검색/카테고리 칩 없음**: `category`를 셀렉트로 붙일 수는 있지만(태그 용도),
  카탈로그처럼 검색창이나 "전체/관계/감정/일상/액션" 필터 칩으로 걸러보는 UI는 없다. 항목이
  최대 30개뿐이라 그리드 스크롤만으로 충분하다고 판단했다 — 필요해지면 `emeresSectionsFiltered`가
  하는 것과 동일한 `.filter()` 한 줄만 `StudioEmeresLibraryPanel` 내부에 추가하면 된다.
- **탭 상태는 메뉴를 닫아도 리셋되지 않음**: `emeresTab`은 컴포넌트 최상위 상태라 이메레스 메뉴를
  닫았다 다시 열어도 마지막으로 보던 탭이 유지된다(의도적 — 카탈로그 검색어(`emeresSearchQuery`)도
  이미 메뉴를 닫아도 유지되는 기존 관례와 일관됨).
- **일괄 삭제는 실행취소(⌘Z) 지원 대상이지만 별도 확인 다이얼로그가 있음**: `commit()`을 거치므로
  히스토리에는 들어가지만(⌘Z로 되돌릴 수 있음), 그 사실을 안내 문구에 명시하진 않는다 —
  `globalThis.confirm()` 문구는 "그 위에 그린 펜 선은 지워지지 않아요"만 강조한다(가장 흔한
  오해 지점). 필요하면 "⌘Z로 되돌릴 수 있어요" 한 줄을 추가해도 좋다.
- **`emeresSourceId`의 `custom:` 접두사는 현재 어디서도 파싱하지 않음**: 카탈로그 틀과 개인 보관함
  틀을 구분할 수 있게 접두사만 붙여뒀을 뿐, 일괄 삭제(§4)를 포함해 모든 현재 소비자는
  `emeresSourceId != null`로만 판단한다(출처 구분이 필요 없음). 나중에 "카탈로그 틀만 지우기"
  같은 세분화가 필요해지면 접두사를 파싱하면 된다.
