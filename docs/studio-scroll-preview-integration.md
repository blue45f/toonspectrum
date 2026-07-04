# Studio 세로 스크롤 미리보기(폰 프레임 시뮬레이션) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **이 세션에서는 새 파일을 만들지도, `StudioPage.tsx`를 수정하지도
> 않았다.** 순수 설계 문서이며, 아래는 후속 구현·통합 패스가 정확히 어떤 파일을 어떤 데이터 모델로
> 만들고 기존 파일 어디에 무엇을 추가해야 하는지에 대한 지시서다. 라인 번호는 이 문서 작성 시점
> (`StudioPage.tsx` 15,050줄) 기준이며, 병렬 세션이 동시에 파일을 건드릴 수 있어 통합 시점엔 몇 줄
> 어긋나 있을 수 있다 — 각 항목의 "앵커 텍스트"로 위치를 재확인할 것.

## 0. 배경 — 무엇이 갭이고, 무엇과 겹치지 않는가

CSP 공식 기능 소개(clipstudio.net/en/comics-manga/)는 "with the smartphone view, you can see
precisely how your webtoon will look in different screen ratios"를 명시한다. 이 앱은 지금 편집
캔버스(개별 페이지 단위, 데스크톱 뷰) 또는 "PDF 콘택트시트"/"스토리보드 그리드"(여러 페이지를
**작은 썸네일 격자**로 훑어보기)만 있고, **실제 독자가 보는 것과 같은 연속 세로 스크롤**로 텍스트
가독성·컷-컷 간 호흡(간격/타이밍)을 확인할 방법이 없다.

**이미 있는 것과의 구분(중요 — 재검토 방지)**:
- "웹툰 연합 스크롤" 다운로드(`handleDownloadAll`, 8798행 부근 버튼) — 이건 **파일로 내보내는**
  기능이다(여러 페이지를 이어 붙인 PNG를 PC에 저장). 이 문서의 기능은 **에디터를 떠나지 않고
  화면에서 바로 확인**하는 인터랙티브 토글이다. 다운로드하지 않고도 즉시 확인 가능하다는 게 핵심
  가치.
- "스토리보드 그리드"(`StudioStoryboardGridPanel`) — 여러 페이지를 **작은 격자 썸네일**로
  나란히 비교하는 라이트테이블 모드(이미 구현 완료, 경쟁사 2차 인접). 이 문서의 기능은 격자가
  아니라 **좁은 폭 + 세로 연속 스크롤**로, "가독성/스크롤 리듬"이라는 완전히 다른 질문에 답한다 —
  둘 다 `StudioPageThumbnail`을 재사용하지만 레이아웃과 목적이 다르다.
- CSP의 "companion mode"(스마트폰 실기기 페어링·실시간 미러링)는 **명시적으로 채택하지 않는다** —
  네트워크/기기 페어링이 필요해 "$0 서버비용" 원칙과 스코프를 넘어선다. 이 문서는 "화면비 시뮬레이션"
  부분만 채택한다.

## 1. 데이터 모델 — 변경 없음

이 기능은 **`El`/`PageState`에 새 필드가 전혀 필요 없다.** 순수하게 기존 데이터를 다르게
보여주는 읽기 전용 뷰이기 때문이다 — 이번 세 갭 중 가장 리스크가 낮다(PSD 임포트와 함께 "데이터
모델 무변경" 갭).

## 2. 새로 만들 파일 — `src/domains/creator/StudioScrollPreviewPanel.tsx` (설계, 미구현)

`StudioStoryboardGridPanel.tsx`와 동일한 뼈대(전체화면 오버레이, `role="dialog"`/`aria-modal`,
Esc로 닫힘, 스크림 클릭으로 닫힘)를 그대로 재사용한다. 페이지 렌더는 `studio-page-thumbs.ts`의
`buildThumbNodes`를 통해 이미 만들어진 **`StudioPageThumbnail` 컴포넌트를 그대로 재사용**한다(새
SVG 렌더 스위치문을 다시 만들지 않는다) — `className` prop으로 그 컴포넌트의 기본
`h-24 overflow-hidden rounded border` 클래스를 재정의한다(이 저장소의 `cn` = `twMerge(clsx(...))`
이므로 뒤에 오는 `h-auto`/`rounded-none`/`border-0`가 충돌하는 앞쪽 클래스를 올바르게 덮어쓴다 —
`lib/utils.ts` 확인 완료).

```ts
export interface StudioScrollPreviewPanelProps {
  open: boolean;
  onClose: () => void;
  /** composeThumbPage(master, p)가 이미 적용된 상태로 호출측(StudioPage)이 전달 — 이 패널은
   *  DocumentMaster 타입을 몰라도 된다(StudioStoryboardGridPanel과 동일 계약). */
  pages: ThumbPageLike[];
  /** 현재 편집 중인 페이지 — 열릴 때 그 페이지로 자동 스크롤한다. */
  currentPageId: string;
  /** 페이지 클릭 시 그 페이지로 점프 + 패널 닫기(StoryboardGrid의 onSelectPage와 동일 관례).
   *  선택 사항 — 순수 열람만 원하면 생략 가능. */
  onSelectPage?: (pageId: string) => void;
}
```

### 2.1 레이아웃

- 중앙 정렬된 고정 폭 컬럼(폰 콘텐츠 폭 시뮬레이션) 안에 페이지들을 세로로 이어 붙인다. 각 페이지는
  `<section aria-label="{n}/{총}페이지">`로 감싸고, `style={{ aspectRatio: `${CANVAS_W} / ${page.canvasH}` }}`를
  줘서 `StudioPageThumbnail`의 SVG(`preserveAspectRatio="xMidYMid meet"`)가 레터박스 없이 정확히
  채워지게 한다.
- 페이지 사이 간격은 **24px**(CSS px) — "웹툰 연합 스크롤" 다운로드의 기본 간격(`handleDownloadAll(24)`
  호출부의 매직넘버)과 같은 값을 의도적으로 맞춰, "화면에서 본 것"과 "다운로드한 것"의 리듬이
  최대한 비슷하게 느껴지도록 한다(완전히 동일한 스케일 공간은 아니라 절대 픽셀이 100% 일치하진
  않음 — 어디까지나 "같은 정신적 리듬"을 주기 위한 근사).
- 각 페이지 좌상단에 작은 칩으로 `pageDisplayName(page, index)` 표시(스토리보드 그리드의 이름
  표기 관례 재사용).
- 상단 고정 바: "닫기" 버튼, 프레임 폭 프리셋(§2.2), "현재 페이지로 이동" 버튼(`scrollIntoView`).
- 페이지 클릭 시(내용 자체가 아니라 페이지 블록 어디든) `onSelectPage?.(page.id)` 호출 후
  `onClose()` — 클릭 한 번으로 "이 컷을 마저 편집하기" 흐름을 지원(선택적 prop이라 안 넘기면
  클릭 핸들러 자체가 안 붙는다).

### 2.2 프레임 폭 컨트롤 — 자체 완결 로컬 상태(데이터 영향 없는 순수 표시 취향)

`StudioStoryboardGridPanel`의 "칸 크기 S/M/L"과 동일한 성격("이 패널 자신은 상태를 소유하지
않는다 — 칸 크기만 예외") — 여기서도 프레임 폭은 이 컴포넌트 로컬 `useState`로 충분하고
`StudioPage.tsx`로 끌어올릴 필요가 없다.

```ts
const FRAME_WIDTH_PRESETS = [
  { id: "narrow", label: "좁게", px: 360 },
  { id: "normal", label: "보통", px: 400 },
  { id: "wide", label: "넓게", px: 480 },
] as const;
```

**주의(통합 시 혼동 방지)**: 이 값들은 실제 모바일 브라우저/앱 CSS 뷰포트 폭을 근사하는
숫자다 — `studio-webtoon-guides.ts`의 `WEBTOON_WIDTH_STANDARDS`(690/720/800/1080)와는 **의미가
다르다**. 그쪽은 "작가가 작업/연재하는 캔버스 원본 해상도"(authoring 폭)이고, 이쪽은 "독자의 실제
화면에 물리적으로 몇 CSS px로 보이는가"(device 폭)다. Studio의 캔버스 폭은 항상
`CANVAS_W=720`으로 고정이라(매직 리사이즈도 높이만 바꾼다) `WEBTOON_WIDTH_STANDARDS`를 이 컨트롤에
재사용하는 것은 **잘못된 재사용**이니 시도하지 말 것 — 이미 검토했고 기각했다(§4-2).

## 3. `StudioPage.tsx`에 추가할 것

### 3-1. 지연(lazy) 패널 import — `StudioBrushLibraryPanel` lazyRetry 블록 바로 다음(다른 두 갭
문서도 같은 자리를 앵커로 쓴다 — 세 기능이 모두 통합되면 이 지점에 3개가 나란히 쌓인다, 순서는
무관). 앵커(630~636행 부근):

```ts
const StudioBrushLibraryPanel = lazyRetry(
  () => import("./StudioBrushLibraryPanel").then((mod) => ({ default: mod.StudioBrushLibraryPanel })),
  "StudioBrushLibraryPanel"
);
const StudioScrollPreviewPanel = lazyRetry(       // ← 추가
  () => import("./StudioScrollPreviewPanel").then((mod) => ({ default: mod.StudioScrollPreviewPanel })),
  "StudioScrollPreviewPanel"
);
function loadStudioReferencePanel() {
```

### 3-2. 상태 훅 — `storyboardGridOpen` 선언 바로 다음.

**앵커**: `const [storyboardGridOpen, setStoryboardGridOpen] = useState(false);`(3254행 부근).

```ts
const [storyboardGridOpen, setStoryboardGridOpen] = useState(false);
const [scrollPreviewOpen, setScrollPreviewOpen] = useState(false); // ← 추가
```

### 3-3. 로딩 오버레이 — `StoryboardGridLoadingOverlay` 함수 바로 다음(동일한 형태를 그대로
복제, 문구만 교체).

**앵커**(1974~1983행 부근):

```ts
function StoryboardGridLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>스토리보드 그리드를 여는 중</span>
      </div>
    </div>
  );
}
```

바로 다음에 추가:

```ts
function ScrollPreviewLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>스크롤 미리보기를 여는 중</span>
      </div>
    </div>
  );
}
```

### 3-4. 툴바 버튼 — "스토리보드 그리드 보기" 버튼 바로 다음(같은 "여러 페이지 한 번에 보기" 그룹).

**앵커**(9332~9340행 부근):

```tsx
        <button
          type="button"
          onClick={() => setStoryboardGridOpen(true)}
          aria-label="스토리보드 그리드 보기 (전체 페이지 한눈에 비교)"
          className={toolBtn(false)}
          title="스토리보드 그리드 보기 — 전체 페이지를 격자로 한눈에 비교"
        >
          <LayoutGrid size={14} />
        </button>
```

바로 다음에 추가:

```tsx
        <button
          type="button"
          onClick={() => setScrollPreviewOpen(true)}
          aria-label="세로 스크롤 미리보기 (모바일 폭으로 이어서 확인)"
          className={toolBtn(false)}
          title="세로 스크롤 미리보기 — 실제 독자처럼 좁은 폭에서 이어서 확인"
        >
          <Smartphone size={14} />
        </button>
```

`Smartphone` 아이콘은 아직 import돼 있지 않다 — lucide-react import 블록에 추가 필요. 앵커:
`LayoutGrid,`(84행 부근) 다음 줄.

```ts
  LayoutGrid,
  Smartphone, // ← 추가(세로 스크롤 미리보기 버튼)
```

### 3-5. 패널 마운트 — 기존 `StudioStoryboardGridPanel`의 `<Suspense>` 블록이 끝나는 지점 바로
다음.

**앵커**(14837~14856행 부근):

```tsx
      <Suspense fallback={<StoryboardGridLoadingOverlay />}>
        {storyboardGridOpen ? (
          <StudioStoryboardGridPanel
            open
            onClose={() => setStoryboardGridOpen(false)}
            pages={pages.map((p) => composeThumbPage(master, p))}
            currentPageId={currentPageId}
            dnd={pageDnd}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setStoryboardGridOpen(false);
            }}
            onAddPage={addPage}
            onDuplicatePage={duplicatePage}
            onDeletePage={deletePage}
            canDelete={pages.length > 1}
            onShotTagChange={(pageId, patch) => commitShotTag(pageId, patch)}
          />
        ) : null}
      </Suspense>
```

바로 다음에 추가:

```tsx
      <Suspense fallback={<ScrollPreviewLoadingOverlay />}>
        {scrollPreviewOpen ? (
          <StudioScrollPreviewPanel
            open
            onClose={() => setScrollPreviewOpen(false)}
            pages={pages.map((p) => composeThumbPage(master, p))}
            currentPageId={currentPageId}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setScrollPreviewOpen(false);
            }}
          />
        ) : null}
      </Suspense>
```

`composeThumbPage`는 이미 import돼 있다(261행 부근, 스토리보드 그리드가 이미 쓰고 있음) — 추가
import 불필요. `pages.map((p) => composeThumbPage(master, p))`를 매 렌더마다 새로 만드는 것도
기존 스토리보드 그리드 호출부와 동일한 패턴이라 새로운 성능 특성이 아니다.

## 4. 정책·스코프 결정 사항

1. **v1은 SVG 근사 렌더만 지원한다(픽셀 완전 일치 아님).** `buildThumbNodes`는 자기 문서에
   "지우개 스트로크/픽셀 필터/패널 클리핑 등 래스터 전용 효과는 생략하거나 CSS로 근사한다"고
   명시한다 — 그러나 이 기능의 목적(텍스트 가독성·컷 간 호흡 확인)엔 정확히 부합한다: 생략되는
   항목들은 전부 "스크롤 리듬"과 무관한 픽셀 디테일이고, 텍스트(`<text>`/`<tspan>`)·말풍선
   (`bubblePathData` 재사용)·프레임·이미지는 이미 충실히 렌더된다. 완전 일치가 필요해지면
   `handleCapturePagesForPreset`(순차적으로 페이지를 전환하며 `stage.toCanvas()`로 래스터화하는
   기존 파이프라인, PDF 콘택트시트·모션 프리셋이 이미 사용 중)을 재사용하는 "정확한 픽셀 모드"
   토글을 추가할 수 있다 — 이번 스코프에선 채택하지 않는다(다른 배치들과 비슷한 규모를 유지하기
   위한 의도적 축소).
2. **`WEBTOON_WIDTH_STANDARDS` 재사용을 검토했으나 기각했다.** §2.2에서 상세 근거 — 의미가 다른
   두 "폭" 개념(저작 해상도 vs 독자 화면 물리 폭)을 섞으면 향후 통합 담당자가 혼동할 위험이 커서,
   차라리 새 작은 상수 배열을 만드는 편이 안전하다고 판단했다.
3. **기기 실제 페어링(CSP companion mode)은 채택하지 않는다.** 네트워크/기기 인증 인프라가
   필요해 "$0 서버비용" 원칙과 이번 스코프를 모두 벗어난다.
4. **가상화(virtualization) 없이 전체 페이지를 한 번에 마운트한다.** `StudioStoryboardGridPanel`이
   이미 문서화한 것과 동일한 판단 — "도킹된 페이지 목록도 오늘 이미 전체 페이지 수만큼 마운트하고
   있고, react-window 등 가상화 라이브러리는 이 코드베이스 어디에도 없다." 수백 페이지급 성능
   이슈가 실제로 생기면 `StudioPageThumbnails.tsx`까지 포함한 횡단 개선 사안이라 이 패널 단독
   스코프가 아니다(그 문서의 표현을 그대로 승계).

## 5. 이미 있음 / 스코프 밖 (재검토 방지)

- **"웹툰 연합 스크롤" 다운로드**(`handleDownloadAll`) — 이미 구현 완료. 파일 내보내기이지 화면
  미리보기가 아니다(§0에서 구분 확정).
- **스토리보드 그리드**(`StudioStoryboardGridPanel`) — 이미 구현 완료(경쟁사 2차 인접). 격자
  레이아웃이지 세로 연속 스크롤이 아니다(§0에서 구분 확정).
- **PDF 콘택트시트**(`StudioContactSheetPanel`/`studio-pdf-contact-sheet.ts`) — 이미 구현 완료.
  인쇄용 콘택트시트 문서 생성이지 화면 스크롤 시뮬레이션이 아니다.
- **CSP 컴패니언 모드(실기기 미러링)** — 명시적으로 스코프 밖(§0/§4-3). 서버·기기 페어링 인프라
  필요.
- **리더 참여도 분석**(스크롤 히트맵 등) — 조사 단계에서 이미 "실 데이터 수집 인프라 필요 + 캔버스
  에디터 범주 밖"으로 스코프 제외 확정. 이 기능과 무관.

## 6. 통합 후 수동 QA 체크리스트

- [ ] 툴바 "세로 스크롤 미리보기" 버튼(스토리보드 그리드 버튼 옆) 클릭 → 전체화면 오버레이가
      열리고, 현재 편집 중이던 페이지 위치로 자동 스크롤돼 있다.
- [ ] 페이지 3개 이상인 문서에서 스크롤하면 각 페이지가 24px 간격을 두고 이어져 보인다(경계에
      끊김/겹침 없음).
- [ ] 프레임 폭 "좁게/보통/넓게" 전환 시 레이아웃이 즉시 반응하고, 텍스트/말풍선 비율이 유지된다
      (레터박스나 잘림 없음 — aspectRatio 래퍼 확인).
- [ ] 페이지 클릭 → 해당 페이지로 편집 화면이 전환되고 오버레이가 닫힌다.
- [ ] Esc 키 및 스크림(배경) 클릭으로 오버레이가 닫힌다.
- [ ] 문서 마스터(반복 요소)가 설정된 프로젝트에서, 마스터 요소가 각 페이지 미리보기에도 함께
      보인다(`composeThumbPage` 적용 확인) — 단, `hideMaster: true`인 페이지는 제외된다.
- [ ] 페이지 그레이드(색보정)가 적용된 페이지는 미리보기에도 같은 필터가 적용돼 보인다
      (`StudioPageThumbnail`의 기존 grade 반영 로직 그대로 상속 확인).
- [ ] 매직 리사이즈로 canvasH가 페이지마다 다른 문서에서도 각 페이지가 자기 비율대로 정확히
      보인다(레터박스 없음).
- [ ] 페이지가 1개뿐인 문서에서도 정상 동작(간격 로직이 0개 gap에서 에러 없음).
