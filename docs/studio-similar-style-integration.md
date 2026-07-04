# 비슷한 스타일 더보기(카테고리 기반 유사 항목 추천) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **StudioPage.tsx는 이 세션에서 수정하지 않았다.** 순수 로직 신규 파일
> (`studio-similar-style.ts`, `studio-similar-style.test.ts`)만 실제로 만들었고(테스트 17개 전부 통과,
> `tsc --noEmit`/`eslint` 클린), 아래는 후속 통합 패스가 정확히 어디에 무엇을 넣어야 하는지에 대한
> 지시서다. 라인 번호는 **커밋 `79359be0dd41beefa446a5ee8a81b73c54d47b88` 기준**(이 저장소는 병렬
> 세션이 `StudioPage.tsx`를 동시에 건드릴 수 있어 라인이 밀렸을 수 있다 — 각 절의 "앵커 텍스트"(따옴표
> 안 실제 코드 문자열)로 실제 위치를 다시 찾아라. 인용한 각 앵커 문자열은 이 커밋 기준 파일 안에서
> 유일하다).

## 0. 새로 만든 파일

- `src/domains/creator/studio-similar-style.ts` — 순수 로직(DOM/Konva/React 의존 없음). `category`
  필드가 있는 카탈로그라면 무엇에든 재사용 가능한 제네릭 헬퍼 2개(`sameCategoryItems`,
  `hasSameCategorySiblings`)만 export한다.
- `src/domains/creator/studio-similar-style.test.ts` — 유닛 테스트 14개(합성 픽스처) + 실제 카탈로그
  연동 테스트 3개 = 17개, 전부 통과.
  ```bash
  npx vitest run src/domains/creator/studio-similar-style.test.ts
  # Test Files  1 passed (1) / Tests  17 passed (17)
  ```

이 상태(기존 파일 무수정)에서 아래 둘 다 클린 통과 확인 완료:

```bash
npx tsc --noEmit -p .            # 출력 없음(에러 0)
npx eslint src/domains/creator/studio-similar-style.ts src/domains/creator/studio-similar-style.test.ts
# 출력 없음(경고/에러 0)
```

## 1. 배경 — 무엇을 벤치마킹했고, 어떤 카탈로그가 대상인지

미리캔버스의 "비슷한 요소 찾기"(일관된 스타일의 캐릭터·요소를 계속 찾아 쓰게 해주는 기능)를
벤치마킹한다. **완전한 비주얼 유사도 검색(이미지 임베딩 AI)은 스코프 밖**이다 — 대신 이 앱 카탈로그가
이미 갖고 있는 `category` 필드로 근사한다: "지금 보고 있는 항목과 같은 category인 다른 항목들"을
빠르게 보여준다.

이번 스코프에서 지시받은 3개 카탈로그를 감사한 결과:

| 카탈로그 | 파일 | `category` 필드 | 스코프 |
|---|---|---|---|
| 이메레스 스케치 틀(25종) | `studio-emeres-templates.ts` | `category: EmeresCategory`("관계"\|"감정"\|"일상"\|"액션") — 이미 있음, `emeresSections()`가 이미 이 필드로 그룹핑 중 | **포함** |
| 장면 템플릿(21종) | `studio-scene-templates.ts` | `category: string`(school/romance/action/fantasy/daily/narrative, `SCENE_TEMPLATE_CATEGORIES`에 라벨 매핑 존재) | **포함** |
| 프롭 스티커(59종) | `studio-prop-stickers.ts` | **없음** — `FxOverlay = { id, label, svg, width, height }`. 소스 파일 안 `// ── 디지털·기기 (8) ──` 같은 구분은 사람이 읽는 섹션 주석일 뿐 런타임 데이터 필드가 아니다 | **제외**(§10-1) |

두 카탈로그 모두 이미 `{ id: string; category: string }` 모양을 만족하므로, 새 카탈로그 필드를
추가하지 않고 바로 `sameCategoryItems()`를 적용할 수 있다. 카테고리당 항목 수(현재 데이터, §4-2의
`limit` 값 근거):

- 이메레스: 관계 7 · 감정 7 · 일상 6 · 액션 5 (합계 25)
- 장면 템플릿: action 5 · romance 4 · school 3 · daily 3 · fantasy 3 · narrative 3 (합계 21)

## 2. `studio-similar-style.ts` — 순수 로직 API(구현 완료)

```ts
export interface CategorizedCatalogItem {
  id: string;
  category: string;
}

export function sameCategoryItems<T extends CategorizedCatalogItem>(
  catalog: readonly T[],
  currentId: string,
  limit?: number
): T[]

export function hasSameCategorySiblings<T extends CategorizedCatalogItem>(
  catalog: readonly T[],
  currentId: string
): boolean
```

계약:

- `sameCategoryItems`는 `currentId` 자기 자신을 제외하고, `catalog` 원본 순서를 그대로 유지한 채
  같은 `category`인 항목들을 반환한다. `currentId`가 `catalog`에 없으면 빈 배열(호출부가 "찾았는지"
  방어 코드를 따로 안 짜도 됨). `limit`을 넘기면 앞에서부터 그만큼만 자르고(음수는 0으로 클램프),
  안 넘기면 전부 반환한다. 순수 함수 — 입력을 변형하지 않고, 같은 입력엔 항상 같은 출력.
- `hasSameCategorySiblings`는 `sameCategoryItems(...).length > 0`과 결과는 같지만 배열을 새로 만들지
  않고 첫 매치에서 순회를 끊는다 — "버튼을 아예 보여줄지"만 알고 싶은 렌더 분기에 쓴다.
- 제네릭 `T extends CategorizedCatalogItem`이라 `EmeresTemplate`(`category: EmeresCategory`, 리터럴
  유니언이라 `string`의 서브타입이라 구조적으로 그대로 대입 가능)과 `SceneTemplate`(`category: string`)
  모두 타입 인자 없이 바로 넘길 수 있다. StudioPage.tsx 쪽의 로컬 미러 타입
  `StudioEmeresTemplate`(1052번 줄, `category: string`)도 동일하게 호환된다.
- 카탈로그 크기가 25/21개뿐이라(§1) `O(n)` 선형 스캔을 카드당 한 번씩 불러도 비용은 무시할 수 있는
  수준이다 — 메모이즈가 필요 없다. **이 프로젝트는 React Compiler가 활성화돼 있으므로(`AGENTS.md`
  참고) 아래 §4의 파생 값에 수동 `useMemo`를 달지 마라** — 어차피 불필요하기도 하고, 프로젝트 컨벤션
  위반이다.

## 3. import 추가

앵커: 알파벳 순서 정적 import 블록, `} from "./studio-selection-tools";` 바로 다음,
`import { normalizeSkewPatch, toKonvaSkewAttrs } from "./studio-skew";` 바로 앞(모듈 경로 알파벳 순:
`selection-tools` < `similar-style` < `skew`가 정확한 자리).

```ts
import { hasSameCategorySiblings, sameCategoryItems } from "./studio-similar-style";
```

`studio-emeres-templates.ts`/`studio-scene-templates.ts`처럼 지연 로드하지 않는다 — 이 모듈은 데이터
없이 순수 함수 2개뿐이라 무겁지 않고, 이미 정적 import된 다른 소형 순수 로직 모듈(`studio-selection.ts`,
`studio-assets.ts`의 `filterAssetsByLabel` 등)과 동일한 취급이 맞다.

## 4. 상태 훅 + 파생 값 추가

이메레스/장면 피커 각각에 "지금 어느 카드를 기준으로 비슷한 스타일을 보여줄지" 앵커 state 1개와,
그 앵커로부터 실제 목록을 뽑는 파생 값들을 추가한다. 아래 두 블록은 **파일에 실제로 나타나는 순서
그대로**다(하나는 기존 이메레스 상태 클러스터 안, 다른 하나는 그 클러스터가 끝나는 지점 바로 다음).

### 4-1. 이메레스 — 기존 상태 클러스터 안에 이어 붙이기

앵커: `// 이메레스(스케치 밑그림) 피커 검색/카테고리 상태` 주석 블록, 기존
`const [emeresCategoryFilter, setEmeresCategoryFilter] = useState("all");` 바로 다음(기존
`const emeresSectionsFiltered = emeresMenuOpen ? ...` 정의 앞)에 state 1줄을 끼워 넣는다:

```ts
// 비슷한 스타일 더보기 — 지금 이 카드와 같은 category 항목들을 보여줄 때 그 "기준" 카드의 id.
// null이면 스트립을 숨긴다. 카드별로 독립된 open/close가 아니라 피커당 슬롯 1개를 공유한다(한 번에
// 하나만 보여준다 — 다른 카드에서 다시 누르면 그 카드 기준으로 갈아탄다. §10-5).
const [emeresSimilarAnchorId, setEmeresSimilarAnchorId] = useState<string | null>(null);
```

그다음, 기존 `emeresSectionsFiltered` 정의(`: EMPTY_STUDIO_OPTIONAL_ASSETS.emeresSections;`로 끝나는
줄) 바로 다음에 파생 값 3개를 추가한다:

```ts
// 비슷한 스타일 더보기 — emeresSections는 카테고리별로 이미 그룹돼 있어(§1) 평평한 배열로 한 번
// 풀어야 sameCategoryItems 제네릭 헬퍼(studio-similar-style.ts)에 그대로 넘길 수 있다.
const emeresFlatCatalog = studioOptionalAssets.emeresSections.flatMap((section) => section.templates);
const emeresSimilarAnchor = emeresSimilarAnchorId
  ? (emeresFlatCatalog.find((t) => t.id === emeresSimilarAnchorId) ?? null)
  : null;
const emeresSimilarSiblings = emeresSimilarAnchor
  ? sameCategoryItems(emeresFlatCatalog, emeresSimilarAnchor.id, 8)
  : [];
```

### 4-2. 장면 템플릿 — 새 로컬 state 클러스터(이 피커의 첫 번째 로컬 UI state)

장면 피커는 지금 검색/카테고리 필터 state가 아예 없다(전체 카테고리를 섹션 헤더로 나눠 항상 다
보여줄 뿐이라 필터링 개념 자체가 없었다) — 그래서 아래 3줄이 그 피커의 첫 로컬 UI state가 된다.
앵커: 바로 위 §4-1에서 추가한 `emeresSimilarSiblings` 정의가 끝나는 줄 다음(같은 "피커 로컬 UI 상태"
구역에 나란히 둔다 — 새 `useState`와 그 파생 값을 분리하지 않고 한 덩어리로 둔 이유는 장면 피커
전체에서 이게 유일한 로컬 state라 따로 멀리 떨어뜨릴 이유가 없어서다).

```ts
// 장면 템플릿 피커 — 이메레스(§4-1)와 동일한 패턴의 "비슷한 스타일" 앵커 state + 파생 값.
const [sceneSimilarAnchorId, setSceneSimilarAnchorId] = useState<string | null>(null);
const sceneSimilarAnchor = sceneSimilarAnchorId
  ? (sceneTemplates.templates.find((t) => t.id === sceneSimilarAnchorId) ?? null)
  : null;
const sceneSimilarSiblings = sceneSimilarAnchor
  ? sameCategoryItems(sceneTemplates.templates, sceneSimilarAnchor.id, 8)
  : [];
```

`limit`을 8로 고정한 이유: 현재 데이터에서 카테고리당 최대 항목 수가 7(이메레스 "관계"/"감정")이라
8이면 사실상 "그 카테고리의 나머지 전부"가 잘림 없이 다 보인다(§1 참고 — 향후 카탈로그가 늘어나면
자연히 캡이 걸린다).

## 5. JSX 변경 — 이메레스 피커

### 5-1. 카드 재구성 — 삽입 버튼과 "비슷한 스타일" 버튼을 분리

**문제**: 지금 카드 전체가 `<button onClick={() => addEmeresTemplate(t)}>` 하나다. "비슷한 스타일
더보기"를 위한 두 번째 클릭 타깃을 넣으려면 `<button>` 안에 또 `<button>`을 넣어야 하는데 이는
유효하지 않은 HTML/접근성 위반이다(인터랙티브 컨트롤 중첩 금지). 그래서 카드의 바깥 래퍼를
`<button>`에서 비인터랙티브 `<div>`로 바꾸고, 그 안에 독립된 `<button>` 2개(삽입 / 비슷한 스타일
더보기)를 형제로 넣는다.

앵커: `{emeresSectionsFiltered.map((section) => (` 블록 안, `{section.templates.map((t) => (` 부터
그 바로 앞 `))}`까지(즉 `section.templates.map`의 콜백 전체).

**기존:**

```tsx
{section.templates.map((t) => (
  <button
    key={t.id}
    type="button"
    title={`${t.label} — ${t.tip}`}
    onClick={() => addEmeresTemplate(t)}
    className="group relative overflow-hidden rounded-lg border border-line bg-card p-1 text-left hover:border-accent/50"
  >
    <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.96_0.006_78)] p-1">
      <img src={svgToDataUrl(t.svg)} alt={t.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
    </div>
    <span className="mt-1 block truncate text-center text-[0.66rem] font-medium text-fg-2">{t.label}</span>
  </button>
))}
```

**교체 후:**

```tsx
{section.templates.map((t) => (
  <div
    key={t.id}
    className="group relative overflow-hidden rounded-lg border border-line bg-card p-1 text-left hover:border-accent/50"
  >
    <button
      type="button"
      title={`${t.label} — ${t.tip}`}
      onClick={() => addEmeresTemplate(t)}
      className="block w-full"
    >
      <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.96_0.006_78)] p-1">
        <img src={svgToDataUrl(t.svg)} alt={t.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
      </div>
      <span className="mt-1 block truncate text-center text-[0.66rem] font-medium text-fg-2">{t.label}</span>
    </button>
    {hasSameCategorySiblings(emeresFlatCatalog, t.id) && (
      <button
        type="button"
        onClick={() => setEmeresSimilarAnchorId(t.id)}
        aria-controls="emeres-similar-strip"
        className="mt-0.5 block w-full truncate text-center text-[0.6rem] font-medium text-accent hover:underline"
      >
        비슷한 스타일 더보기
      </button>
    )}
  </div>
))}
```

변경 요약: `<button>` → `<div>`(className 문자열은 그대로 재사용, `text-left`도 유지), 원래
내용물(썸네일+라벨)을 새 내부 `<button onClick={addEmeresTemplate}>`으로 감싸고(className만
`"block w-full"`로 단순화 — 정렬은 이미 안쪽 `<span>`의 `text-center`가 담당), 형제로 조건부
"비슷한 스타일 더보기" `<button>`을 추가. `group`/`group-hover:scale-105`는 CSS 하위 선택자 관계라
중간에 `<button>`이 하나 더 껴도 그대로 동작한다(변경 불필요).

`hasSameCategorySiblings`로 감싼 이유: 카테고리에 자기 혼자뿐인 항목엔 눌러도 아무 의미 없는 버튼을
보여주지 않기 위함(현재 데이터엔 그런 카테고리가 없지만 — §1, 모든 카테고리가 5개 이상 — 향후
카탈로그가 줄어들 가능성에 대비한 방어 렌더링).

### 5-2. 공용 "비슷한 스타일" 스트립 — 검색창 위, 안내 문구 바로 아래에 삽입

**왜 이 위치인가**: 이 팝업의 바깥 컨테이너(`<div className="fixed inset-x-2 ... overflow-y-auto ...">`)
자체가 모바일 뷰포트에서 스크롤 컨테이너다(데스크톱 `lg:`에서는 안쪽 `max-h-64 overflow-y-auto`만
스크롤). 스트립을 안내 문구 바로 아래(검색창·카테고리 칩·결과 그리드보다 위)에 두면, 결과를 스크롤해서
내려간 상태에서 카드를 눌러도 스트립은 항상 팝업 최상단 근처에 뜬다 — 모바일에서 아주 깊이 스크롤한
채로 트리거하면 스트립이 화면 밖일 수 있다는 잔여 한계는 있다(§10-4, 의도적으로 자동 스크롤은 안 넣음).

앵커: 안내 문구 `<p>`가 끝나는 지점, 검색 입력 wrapper 시작 지점 사이.

**기존(그대로):**

```tsx
<p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
  선택한 틀이 반투명·잠금 밑그림으로 깔리고 펜 모드로 바뀌어요. 그 위에 따라 그린 뒤, 레이어 패널에서 밑그림을 숨기거나 지우세요.
</p>
<div className="relative mb-2">
```

**이 두 줄 사이에 삽입:**

```tsx
{emeresSimilarAnchor && (
  <div id="emeres-similar-strip" className="mb-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
    <div className="mb-1 flex items-center justify-between gap-2">
      <p className="truncate text-[0.66rem] font-semibold text-fg-2">
        &ldquo;{emeresSimilarAnchor.label}&rdquo;과(와) 비슷한 스타일
      </p>
      <button
        type="button"
        onClick={() => setEmeresSimilarAnchorId(null)}
        aria-label="비슷한 스타일 닫기"
        className="shrink-0 p-0.5 text-fg-3 hover:text-fg-2"
      >
        <X size={12} />
      </button>
    </div>
    {emeresSimilarSiblings.length === 0 ? (
      <p className="text-[0.64rem] text-fg-3">같은 카테고리의 다른 틀이 없어요.</p>
    ) : (
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {emeresSimilarSiblings.map((sib) => (
          <button
            key={sib.id}
            type="button"
            title={`${sib.label} — ${sib.tip}`}
            onClick={() => addEmeresTemplate(sib)}
            className="w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-card p-1 hover:border-accent/50"
          >
            <div className="flex h-12 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.96_0.006_78)]">
              <img src={svgToDataUrl(sib.svg)} alt={sib.label} className="h-full w-full object-contain" />
            </div>
            <span className="mt-0.5 block truncate text-center text-[0.58rem] text-fg-3">{sib.label}</span>
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

`X` 아이콘은 이미 이 파일 상단에서 import돼 있다(같은 팝업의 "검색어 지우기" 버튼이 `<X size={12} />`를
이미 씀) — 새 import 불필요. `emeresSimilarSiblings.length === 0` 분기는 사실상 도달 불가능한 방어
코드다(스트립은 `hasSameCategorySiblings`가 true인 카드에서만 열리므로) — 그래도 카탈로그가 나중에
바뀌어 빈 스트립이 뜨는 것보다 안내 문구가 낫다고 판단해 남겨뒀다.

`addEmeresTemplate(sib)`를 그대로 재사용한다 — 스트립의 항목을 눌러도 기존과 완전히 동일하게
(프레임 선택 여부에 따른 배치 로직, `opacity`, `locked: true`, 펜 모드 전환까지) 캔버스에 들어가고
`setMenu(null)`로 메뉴가 닫힌다. 스트립 전용 삽입 로직은 만들지 않는다.

## 6. JSX 변경 — 장면 템플릿 피커

### 6-1. 카드 재구성 — §5-1과 동일한 이유·동일한 패턴

앵커: `{sceneTemplates.categories.map((cat) => { ... })}` 블록 안, `{items.map((t) => (` 부터 그 바로
앞 `))}`까지.

**기존:**

```tsx
{items.map((t) => (
  <button
    key={t.id}
    type="button"
    onClick={() => addSceneTemplate(t)}
    className="rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-raised"
  >
    <span className="block text-xs font-semibold text-fg">{t.label}</span>
    <span className="block text-[0.68rem] text-fg-3">{t.description}</span>
  </button>
))}
```

**교체 후:**

```tsx
{items.map((t) => (
  <div
    key={t.id}
    className="rounded-lg border border-line bg-card px-2 py-1.5 transition-colors hover:border-accent/50 hover:bg-raised"
  >
    <button type="button" onClick={() => addSceneTemplate(t)} className="block w-full text-left">
      <span className="block text-xs font-semibold text-fg">{t.label}</span>
      <span className="block text-[0.68rem] text-fg-3">{t.description}</span>
    </button>
    {hasSameCategorySiblings(sceneTemplates.templates, t.id) && (
      <button
        type="button"
        onClick={() => setSceneSimilarAnchorId(t.id)}
        aria-controls="scene-similar-strip"
        className="mt-1 block text-[0.62rem] font-medium text-accent hover:underline"
      >
        비슷한 스타일 더보기
      </button>
    )}
  </div>
))}
```

### 6-2. 공용 "비슷한 스타일" 스트립 — §5-2와 동일한 이유·동일한 위치 규칙

앵커: 안내 문구 `<p>`가 끝나는 지점, 결과 리스트 wrapper 시작 지점 사이.

**기존(그대로):**

```tsx
<p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
  프레임·말풍선·효과를 미리 조합한 연출을 한 번에 추가해요. 추가한 뒤 대사와 위치만 다듬으면 끝나요.
</p>
<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
```

**이 두 줄 사이에 삽입:**

```tsx
{sceneSimilarAnchor && (
  <div id="scene-similar-strip" className="mb-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
    <div className="mb-1 flex items-center justify-between gap-2">
      <p className="truncate text-[0.66rem] font-semibold text-fg-2">
        &ldquo;{sceneSimilarAnchor.label}&rdquo;과(와) 비슷한 장면
      </p>
      <button
        type="button"
        onClick={() => setSceneSimilarAnchorId(null)}
        aria-label="비슷한 스타일 닫기"
        className="shrink-0 p-0.5 text-fg-3 hover:text-fg-2"
      >
        <X size={12} />
      </button>
    </div>
    {sceneSimilarSiblings.length === 0 ? (
      <p className="text-[0.64rem] text-fg-3">같은 카테고리의 다른 장면 템플릿이 없어요.</p>
    ) : (
      <div className="grid gap-1">
        {sceneSimilarSiblings.map((sib) => (
          <button
            key={sib.id}
            type="button"
            onClick={() => addSceneTemplate(sib)}
            className="rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-raised"
          >
            <span className="block text-xs font-semibold text-fg">{sib.label}</span>
            <span className="block text-[0.68rem] text-fg-3">{sib.description}</span>
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

`addSceneTemplate(sib)`를 그대로 재사용 — `runStudioPageAddSceneTemplate` 경로(패널에 안 맞으면
"이 컷에 맞출 수 없습니다" 에러)까지 기존과 동일하게 동작한다.

## 7. `disarmAllPixelTools()` / armed 상태 — 변경 없음(확인만)

이 기능엔 캔버스 드래그를 가로채는 "무장(armed)" 상태가 없다 — 카드 클릭(삽입)과 "비슷한 스타일
더보기" 클릭(앵커 전환) 전부 메뉴 팝업 안의 단발 클릭뿐이고, 삽입 경로는 기존 `addEmeresTemplate`/
`addSceneTemplate`를 그대로 재사용해 새 armed 플래그를 만들지 않는다(이 둘은 지금까지도
`disarmAllPixelTools()` 목록에 없었다). **`disarmAllPixelTools()` 함수 본문·armed 상태 카운트 주석·
Escape 키 핸들러 모두 손댈 필요가 없다.**

## 8. 다른 통합 설계 문서와의 앵커 중복 주의

`docs/studio-emeres-library-integration.md`(§4·§5)도 **정확히 같은 지점**(`emeresCategoryFilter`
바로 다음 / `emeresSectionsFiltered` 정의 바로 다음)에 자기 자신의 상태(`emeresLibraryTab`)와 파생 값
(`emeresUnderlayCount`)을 꽂도록 설계돼 있다. 이 세션이 확인한 시점(위 커밋 기준) 기준 그 통합은 아직
`StudioPage.tsx`에 반영되지 않은 상태다(`emeresLibraryTab`/`emeresUnderlayCount`/
`StudioEmeresLibraryPanel` 마운트 어느 것도 파일에 없음 — 직접 grep으로 재확인 후 이 문서를 썼다).

두 문서 다 반영하는 통합 패스는 순서만 지키면 충돌하지 않는다:

- **상태 훅(§4-1)**: `emeresLibraryTab`(다른 문서)과 `emeresSimilarAnchorId`(이 문서)는 서로 값이
  다른 독립 `useState` 줄이라 어느 순서로 이어 붙여도 상관없다 — 그냥 둘 다
  `emeresCategoryFilter` 다음, `emeresSectionsFiltered` 앞에 나란히 넣으면 된다.
- **파생 값(§4-1)**: `emeresUnderlayCount`(다른 문서, `elements.filter(...)` 기반)와
  `emeresFlatCatalog`/`emeresSimilarAnchor`/`emeresSimilarSiblings`(이 문서, `studioOptionalAssets`
  기반)도 서로 다른 소스를 읽어 독립적이다 — 순서 무관.
- **JSX(다른 문서 §8-2 / 이 문서 §5-2)**: 다른 문서는 안내 문구를 새 문구로 **교체**하고 그 다음에
  "일괄삭제 버튼 → 탭 2개 → `{emeresLibraryTab === "catalog" && (...)}` 래퍼"를 씌운다. 이 문서의
  스트립은 그 안내 문구 바로 다음, 기존 검색창 바로 앞에 낀다. **두 문서를 모두 적용한다면**: 다른
  문서의 탭 래퍼 `{emeresLibraryTab === "catalog" && ( <> ... </> )}` 안쪽, 그 Fragment의 맨 앞(검색창
  블록보다 먼저)에 이 문서의 스트립을 넣으면 된다 — "카탈로그 탭에서만 비슷한 스타일을 보여준다"는
  것도 자연스럽다("내가 만든 틀" 탭은 카테고리 필터 자체가 없으므로 §10-2).

## 9. 통합 후 수동 QA 체크리스트

- [ ] 이메레스 메뉴 → 카테고리에 형제가 있는 카드에만 "비슷한 스타일 더보기"가 보인다.
- [ ] 그 버튼 클릭 → 안내 문구 바로 아래 "OOO과(와) 비슷한 스타일" 스트립이 뜨고, 같은 카테고리의
      다른 틀 썸네일이 가로 스크롤 목록으로 보인다(클릭한 카드 자신은 목록에 없음).
- [ ] 검색어를 입력해 카드가 1개만 보이는 상태에서도 그 카드의 "비슷한 스타일 더보기"를 누르면,
      검색으로 숨겨진 같은 카테고리의 다른 항목들이 스트립에 나타난다(스트립은 전체 카탈로그 기준이라
      현재 검색/카테고리 필터와 무관하게 항상 같은 결과).
- [ ] 스트립의 항목 클릭 → 기존 `addEmeresTemplate`과 동일하게 캔버스에 배치되고 메뉴 전체가 닫힌다.
- [ ] 스트립의 × 버튼 클릭 → 스트립만 닫히고 메뉴는 열린 채 유지된다.
- [ ] 장면 메뉴에서도 동일하게: 카드 "비슷한 스타일 더보기" → 스트립 표시 → 스트립 항목 클릭 시
      `addSceneTemplate`로 배치되고 메뉴가 닫힌다(패널 미선택/부적합 시 기존과 동일하게 "이 컷에
      맞출 수 없습니다" 에러도 그대로 발생할 수 있다).
- [ ] 이메레스 카테고리 칩("전체"/"관계"/"감정"/"일상"/"액션")을 눌러 필터를 바꿔도 이미 열려 있던
      스트립 내용은 그대로 유지된다(스트립은 카테고리 필터와 독립적으로 전체 카탈로그를 본다).
- [ ] 키보드만으로(Tab) 카드의 삽입 버튼과 "비슷한 스타일 더보기" 버튼에 각각 독립적으로
      포커스/Enter로 접근 가능하다(중첩 버튼이 아니므로 포커스 순회가 정상적으로 둘 다 지나간다).
- [ ] ⌘Z — 스트립에서 삽입해도 `commit` 호출 경로가 기존 `addEmeresTemplate`/`addSceneTemplate`
      그대로라 정확히 1건의 history로 기록된다(별도 조치 불필요, 확인만).
- [ ] 메뉴를 닫았다 다시 열어도 직전 앵커가 남아 있으면 스트립이 다시 보인다(§10-6, 의도적으로
      메뉴 닫을 때 리셋하지 않음).

## 10. 스케치 대비 편차(§5, 의도적 스코프 축소·구현 선택)

1. **`PROP_STICKERS`(프롭 스티커 59종, `studio-prop-stickers.ts`)는 스코프에서 뺐다.** 이 카탈로그의
   타입 `FxOverlay`(`studio-fx-assets.ts`)는 `{ id, label, svg, width, height }`뿐이라 `category` 필드
   자체가 없다. 소스 파일 안 "// ── 디지털·기기 (8) ──"/"// ── 음식·음료 (11) ──"/"// ── 학용품·문구
   (8) ──"/"// ── 생활·소품 (12) ──"/"// ── 자연·날씨 (10) ──"(+마지막 미분류 판타지·RPG 소품
   10개) 같은 구분은 사람이 코드를 읽기 쉽게 나눠 놓은 **주석**일 뿐 배열 원소의 실제 필드가
   아니다 — `sameCategoryItems`가 읽을 수 있는 데이터가 없다. 이 주석 구획을 실제 `category` 필드로
   승격하려면 59개 항목 전부에 필드를 하나씩 채워 넣어야 하는데, 이는 로직 추가가 아니라 콘텐츠
   재작업이라 이번 스코프 밖이다. 참고로 같은 `FxOverlay` 모양(= `category` 없음)을 공유하는 형제
   카탈로그가 더 있다 — `COMIC_VECTOR_STICKERS`/`CREATURE_STICKERS`/`FX_OVERLAYS`(전부
   `studio-fx-assets.ts`/`studio-creature-stickers.ts`) 등, StudioPage.tsx의 `StudioFxAsset` 로컬
   타입(1050번 줄)으로 묶여 전부 라벨 텍스트 검색(`filterAssetsByLabel`)만 지원한다. 이 앱엔 이미
   `FxPickerSection`(전체/효과음/이모지/만화 스티커/동물·캐릭터/소품·오브젝트/선 효과/특수 효과)이라는
   더 굵은 단위의 "카탈로그 종류" 점프 칩이 있지만, 이건 "프롭 스티커 안에서 스타일이 비슷한 것끼리"가
   아니라 "완전히 다른 스티커 묶음 사이를 건너뛰기"용이라 이 기능이 대체하는 개념이 아니다.
2. **`StudioEmeresLibraryItem`(사용자가 직접 그린/업로드한 "내가 만든 틀", `studio-emeres-library.ts`)엔
   이 기능을 적용하지 않았다.** 이 타입도 `category?: EmeresCategory`(선택 필드)를 갖고 있어 구조적으론
   `sameCategoryItems`에 바로 넣을 수 있지만, 이번 작업 지시가 명시한 3개 카탈로그(프롭 스티커·이메레스
   카탈로그·장면 템플릿)에 포함되지 않았고, `studio-emeres-library.ts` 자체 주석이 이미 밝히듯("카테고리
   칩은 카탈로그 탭 전용") 개인 라이브러리는 항목 수가 적어 카테고리 필터 UI조차 아직 없다 — 필터가
   없는 곳에 "필터링된 결과에서 숨겨진 형제를 찾아준다"는 이 기능의 핵심 가치(§9 세 번째 체크리스트
   항목)가 성립하지 않는다. 나중에 개인 라이브러리가 커져 카테고리 필터가 생기면, §5/§6과 동일한
   패턴(카드에 `hasSameCategorySiblings` 버튼 + 공용 스트립)을 그대로 복제하면 된다.
3. **`SfxPreset`(효과음 프리셋, `studio-sfx-presets.ts`)도 `category` 필드가 있는 걸 확인했지만
   손대지 않았다.** `StudioSfxPacks.categories: Array<{ id: SfxPreset["category"]; label: string }>`
   구조로 봐서 이것도 구조적으로 호환되지만, 지시받은 3개 카탈로그에 없었고 이번 세션에서 그 피커
   UI(효과 피커 안 효과음 섹션)의 검색/필터 흐름을 감사하지 않았다 — 다음 확장 후보로만 남겨둔다.
4. **모바일에서 팝업을 결과 리스트 깊숙이 스크롤한 채로 "비슷한 스타일 더보기"를 누르면, 스트립이
   화면 밖(팝업 상단)에 뜰 수 있다.** 스트립을 항상 안내 문구 바로 아래(§5-2/§6-2)에 고정했기 때문에
   나는 현상인데, `scrollIntoView`로 자동 스크롤시키는 것도 고려했지만 ref 배선과 "몇 번째로 열렸을 때
   스크롤할지"에 대한 추가 판단이 필요해 이번 스코프에서는 넣지 않았다 — 결과 리스트 자체가
   `max-h-64`/`max-h-72`로 그리 길지 않아(카테고리 4~6개, 카드 5~25개) 실사용에서 이 경로를 타는
   빈도는 낮을 것으로 본다.
5. **카드별 독립 열림 상태가 아니라 피커당 공용 슬롯 1개(`emeresSimilarAnchorId`/
   `sceneSimilarAnchorId`)다.** 카드마다 인라인으로 펼쳐지는 아코디언 대신 이 방식을 택한 이유: (a)
   인라인 아코디언은 이메레스 쪽이 `grid grid-cols-2`라 특정 카드만 펼쳐질 때 그리드 셀 스팬 계산이
   따라붙어(형제 Fragment로 빼지 않으면 중첩 grid 안에서 다른 열의 카드가 어색하게 밀린다) 구현
   복잡도가 올라간다. (b) 공용 슬롯은 두 피커 모두 완전히 동일한 패턴(같은 코드 모양, 다른 카탈로그)이
   돼 통합 패스가 한쪽을 이해하면 다른 쪽은 거의 복붙이다. (c) 사용자 입장에서도 "지금 이 카드
   기준으로 본다"는 개념이 한 번에 하나씩이 자연스럽다(미리캔버스도 "비슷한 요소 찾기"를 한 번에
   하나의 기준 요소에 대해서만 보여준다).
6. **메뉴를 닫아도(`setMenu(null)`) 앵커 state를 리셋하지 않는다.** `emeres-library-integration.md`
   §13-7이 `emeresLibraryTab`에 대해 남긴 선례와 동일한 이유다 — 리셋하려면 `setMenu(null)`을 호출하는
   모든 경로(다른 메뉴 클릭, 바깥 클릭, Esc 등 여러 곳)에 빠짐없이 추가해야 해서 하나라도 놓치면
   미묘한 불일치가 생기기 쉽고, "다시 열었을 때 방금 보던 비슷한 스타일이 그대로 있다"는 것도 사용자
   입장에서 나쁘지 않은 기본값이라 판단했다.
7. **`aria-controls="emeres-similar-strip"`/`"scene-similar-strip"`는 카드마다 여러 버튼이 같은 id를
   가리키는 N:1 관계다.** 엄격한 ARIA 저작 관행은 보통 1:1 관계를 가정하지만, "이 버튼들 중 아무거나
   눌러도 같은 위치에 갱신되는 패널을 연다"는 이 기능의 실제 동작을 근사하기엔 충분하고 대부분의
   스크린 리더/보조 기술이 문제없이 처리하는 흔한 완화 패턴이다 — 더 엄격하게 하고 싶다면
   (예: `aria-live="polite"`를 스트립 컨테이너에 추가해 갱신을 능동적으로 알리는 것) 선택적 후속
   폴리시로 남겨둔다(필수 아님).
8. **기존 DOM 구조에 의존하는 테스트는 없음을 확인했다** — `StudioPage.tsx`를 렌더링해 DOM을
   조회하는 테스트 파일(`StudioPage.test.tsx` 등)이 이 저장소에 없고, "이메레스"/"장면 템플릿"을
   언급하는 기존 테스트(`studio-emeres-templates.test.ts`, `studio-comipo-insert.test.ts`)는 전부 순수
   데이터/로직 레벨이라 §5-1/§6-1의 `<button>` → `<div>` 카드 재구성이 기존 테스트를 깨뜨릴 위험은
   없다.
