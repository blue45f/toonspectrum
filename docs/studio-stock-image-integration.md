# Studio 스톡 사진 검색(Unsplash BYOK) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **StudioPage.tsx는 이 세션에서 수정하지 않았다.** 순수 로직/프레젠테이션
> 신규 파일(`studio-stock-image-client.ts`, `studio-stock-image-client.test.ts`,
> `StudioStockImagePanel.tsx`)만 만들고 전부 통과시켰으며(§1), 아래는 후속 통합 패스가 정확히
> 어디에 무엇을 넣어야 하는지에 대한 지시서다. 라인 번호는 **커밋
> `79359be0dd41beefa446a5ee8a81b73c54d47b88` 기준**(이 저장소는 병렬 세션이 `StudioPage.tsx`를
> 동시에 건드릴 수 있어 라인이 밀렸을 수 있다 — 각 절의 "앵커 텍스트"로 실제 위치를 다시 찾아라).
> `docs/studio-ai-assist-integration.md`(AI 어시스트 BYOK 통합 설계)도 아직 통합 전이므로, 두 문서의
> 통합 패스가 어느 순서로 적용되든 서로 충돌하지 않도록 각 절에서 명시적으로 짚어 둔다.

## 0. 배경 — 이 기능은 무엇이고, 무엇과 다른가

사용자가 명시한 제약(§는 원 지시서 절 번호):

1. Canva/미리캔버스가 강조하는 "방대한 무료 스톡 이미지 라이브러리"를 이 앱이 직접 자체 호스팅하는
   건 저장공간·라이선스 문제로 불가능하다 → **Unsplash API를 BYOK(사용자가 자기 Access Key를 직접
   입력)로 클라이언트에서 직접 호출**하는 검색 패널로 대체한다.
2. **API 키는 서버로 절대 전송하지 않는다** — `localStorage`에만 저장하고, 브라우저 → Unsplash로
   직접 `fetch`한다(이 앱 백엔드를 거치지 않음 — "$0 서버비용" 원칙).
3. `studio-ai-client.ts`(이미 존재하는 BYOK 패턴)와 **정확히 동일한 아키텍처**로 만들되, localStorage
   네임스페이스 전략은 같은 계열(`toonspectrum-studio-*` 접두사)을 따르면서 키 이름은 별도로 둔다.
4. Unsplash API 이용약관(API Guidelines)이 요구하는 **(a) download_location 엔드포인트 트리거**와
   **(b) 작가/Unsplash 크레딧 표시**를 설계에 반영한다(§5).

**중요 — `studio-ai-client.ts`("AI 어시스트")와는 완전히 별개의 독립 경로다.** 그 기능은 생성형
AI(OpenAI 호환 API)로 이미지를 **새로 만드는** 기능이라 "생성형 AI 최초 사용 고지" 모달
(`aiNoticeOpen`/`runWithAiNotice`, `docs/studio-ai-assist-integration.md` §2-2·§2-3)로 게이팅된다.
이번 기능은 **실사진(라이선스 사진)을 검색해 그대로 쓰는** 기능이라 AI 생성물이 아니다 —
**통합 시 이 고지 모달을 절대 재사용하지 않는다.** 대신 Unsplash 고유의 출처 표시 의무(§5)를 진다.
두 기능은 코드도 공유하지 않는다(`studio-stock-image-client.ts`는 `studio-ai-client.ts`를 import하지
않는다 — 완전히 독립된 타입/저장 키를 쓴다).

## 1. 새로 만든 파일(전부 이 세션에서 작성·검증 완료)

- `src/domains/creator/studio-stock-image-client.ts` — 순수 로직(DOM/Konva 의존 없음, 단
  `inlineStockPhotoForCanvas` 하나만 예외 — §5-2). Access Key 저장/조회
  (`loadStudioStockImageAccessKey`/`saveStudioStockImageAccessKey`/`isStudioStockImageConfigured`),
  검색(`searchStockPhotos(query, accessKey, opts?)` — Unsplash `GET /search/photos`), 다운로드 트리거
  (`triggerStockImageDownload(downloadLocationUrl, accessKey)`), 캔버스 삽입용 인라인 변환
  (`inlineStockPhotoForCanvas(url, opts?)`). 모든 async 함수는 **throw하지 않고**
  `StudioStockImageResult<T>`(`{ok:true,data}`/`{ok:false,code,error}`)를 resolve한다 — 키
  미설정·빈 검색어는 fetch를 호출하지 않고 즉시 `ok:false`를 반환한다.
- `src/domains/creator/studio-stock-image-client.test.ts` — 21개 유닛 테스트, 전부 통과
  (`npx vitest run src/domains/creator/studio-stock-image-client.test.ts`). fetch는 전부 모킹(실제
  네트워크 호출 없음) — 키 없을 때/빈 검색어일 때 호출 자체가 안 나가는지, 키 있을 때 정확한
  URL(`https://api.unsplash.com/search/photos?query=...&page=...&per_page=20&content_filter=low`)/
  헤더(`Authorization: Client-ID {key}`, `Accept-Version: v1`)로 나가는지, 응답 매핑(사진
  URL·작가명·크레딧 링크의 UTM 파라미터)이 올바른지, 지저분한 응답 항목 하나가 검색 전체를 실패시키지
  않는지, 4xx/rate-limit(403)/네트워크 예외/비-JSON 응답 각각의 에러 코드를, `download_location`
  트리거의 요청 형태를 검증한다. **`inlineStockPhotoForCanvas`는 의도적으로 이 스위트에 없다** —
  `Image`/`canvas` 픽셀 디코딩에 의존해 jsdom으로 검증할 수 없다(기존 `studio-image-utils.ts`의
  `downscaleImageFile`/`downscaleDataUrl`도 테스트가 없는 것과 동일한 처지 — 파일 하단 주석 참고).
- `src/domains/creator/StudioStockImagePanel.tsx` — 검색 UI 전체(Access Key 입력 `<details>` +
  검색창 + 결과 그리드 + "더 보기" + 크레딧 표시). **자기완결형(self-contained)**이다 — `settings`
  같은 prop을 받지 않고, Access Key/검색어/결과/busy/error를 전부 내부 `useState`로 소유하며,
  `searchStockPhotos`/`inlineStockPhotoForCanvas`/`triggerStockImageDownload`도 전부 내부에서 직접
  호출한다. 부모가 받는 건 `onInsert(photo, dataUrl, width, height)` 콜백 **하나뿐**이다(§7-1 설계
  결정 참고). 팝오버 위치/크기 클래스(`fixed inset-x-2 top-48 ... sm:w-80 ...`)까지 이 컴포넌트
  자신의 루트에 포함돼 있다 — `StudioAssetMenuPanel.tsx`와 동일한 관례(§7-2).
- `docs/studio-stock-image-integration.md` — 이 문서.

전부 이 상태(기존 파일 무수정)에서 `npx tsc --noEmit -p .`(전체 프로젝트, 에러 0건) / `npx eslint
src/domains/creator/studio-stock-image-client.ts src/domains/creator/studio-stock-image-client.test.ts
src/domains/creator/StudioStockImagePanel.tsx`(경고 0건) / `npx vitest run src/domains/creator`
(132개 파일 · 3084개 테스트 전부 통과, 기존 테스트 포함 — 회귀 없음) 클린 통과했다.

## 2. `StudioPage.tsx`에 추가할 것

이 기능은 `docs/studio-ai-assist-integration.md`보다 **통합 표면이 훨씬 작다** — 패널이
자기완결형이라 `StudioPage.tsx`가 `studio-stock-image-client.ts`에서 **값(함수)을 단 하나도
import하지 않는다.** 필요한 건 타입 2개(`ImageEl` 필드 정의용) + 캔버스 삽입 함수 1개 + 메뉴 배선
뿐이다.

### 2-1. 타입 전용 import — 두 곳

**(a)** 앵커: `import type { Sketch } from "./studio-sketch";`(469행)와 `import type { Stylize }
from "./studio-stylize";`(470행) 사이(파일명 알파벳순 — "sketch" < "stock-image-client" <
"stylize"). 새 줄 삽입:

```ts
import type { StudioStockImageCredit, StudioStockPhoto } from "./studio-stock-image-client";
```

**(b)** 앵커: `import type { StudioExportMenuPanelProps } from "./StudioExportMenuPanel";`(478행)
다음, `import type { GeneratedAssetQuality, ...} from "@/src/infrastructure/creator-client";`(479행
시작 블록) 앞. 새 줄 삽입:

```ts
import type { StudioStockImagePanelProps } from "./StudioStockImagePanel";
```

(이 타입은 아래 §3의 지연 로드 모듈 타입 선언에 필요하다 — `StudioAssetMenuPanelProps`/
`StudioExportMenuPanelProps`와 동일한 이유.)

### 2-2. `lucide-react` 아이콘 — `Images` 추가

앵커: 아이콘 destructure 블록 안 `Image as ImageIcon,`(53행) 다음 줄에 삽입:

```ts
  Images,
```

(`Search`/`Loader2`/`Eye`/`EyeOff` 등은 새 패널 내부에서만 쓰고 그 파일 자신이 독립적으로
import하므로 `StudioPage.tsx` 쪽 아이콘 목록은 `Images` 하나만 추가하면 된다 — 툴바 버튼 아이콘
용도.)

### 2-3. `ImageEl`에 스톡 사진 크레딧 필드 추가(기존 인터페이스 확장)

앵커: `export interface ImageEl { ... }`(812~887행)의 마지막 필드
`activeFrameId?: string;`(886행) 다음, 인터페이스를 닫는 `}`(887행) 앞. 삽입:

```ts
  // 스톡 사진(Unsplash) 삽입 출처 — StudioStockImagePanel에서 삽입한 이미지에만 설정된다.
  // Unsplash API Guidelines가 요구하는 "사진 사용 시 작가·Unsplash 크레딧 표시"를 삽입 이후에도
  // (예: 선택된 이미지 사이드바에서) 다시 보여줄 수 있도록 요소에 영구 보존한다 — §5 참고.
  stockImageCredit?: StudioStockImageCredit;
```

다른 모든 선택적 보정 필드(`colorToAlpha`/`autoAdjust`/`outline` 등)와 동일하게 완전히 부가적
(additive)인 변경이다 — 기존 어떤 코드 경로도 이 필드를 읽지 않던 상태에서 새로 읽기 시작하는 것뿐,
기존 동작에 영향 없음.

### 2-4. 캔버스 삽입 함수 — `addRenderedImage` 옆에 추가(기존 함수는 무수정)

**앵커**: `function addRenderedImage(src: string, width: number, height: number) { ... }`의 닫는
`}`(현재 5287행) 다음, `function splitFrameSelected(...)`(5288행) 앞. 새 함수 삽입(기존
`addRenderedImage`는 한 글자도 건드리지 않는다 — 별도 함수를 나란히 추가):

```ts
// 스톡 사진(Unsplash) 삽입 — addRenderedImage와 동일한 배치 정책(createCanvasImageElement로 캔버스
// 중앙에 맞춰 배치)이되, 크레딧 메타데이터를 함께 얹는다는 점만 다르다. StudioStockImagePanel이 이미
// (1) 데이터 URL로 인라인 변환하고 (2) download_location 트리거를 쐈으므로, 여기서는 캔버스 배치만
// 신경 쓰면 된다.
function insertStockImage(photo: StudioStockPhoto, dataUrl: string, width: number, height: number) {
  setError(null);
  const base = createCanvasImageElement({
    id: uid(),
    src: dataUrl,
    canvasWidth: CANVAS_W,
    canvasHeight: canvasH,
    sourceWidth: width,
    sourceHeight: height,
  });
  addEl({ ...base, stockImageCredit: photo.credit });
}
```

### 2-5. "선택한 이미지" 사이드바 — 크레딧 표시(순수 추가 JSX, 기존 줄 무수정)

**앵커**: `selected.type === "image"` 분기 안, `<StudioBgRemoveButton .../>`가 끝나는 지점(현재
13448~13451행)과 `{/* 주요 색상 추출 ... */}` 주석(13452행) 사이. 그 사이에 새 조건부 블록을
끼워 넣는다(전후 기존 줄은 그대로):

```tsx
                  {selected.stockImageCredit && (
                    <p className="rounded-md border border-line bg-card/50 px-2 py-1 text-[0.6rem] leading-relaxed text-fg-3">
                      출처:{" "}
                      <a
                        href={selected.stockImageCredit.photographerProfileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-fg-2"
                      >
                        {selected.stockImageCredit.photographerName}
                      </a>{" "}
                      ·{" "}
                      <a
                        href={selected.stockImageCredit.unsplashPhotoPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-fg-2"
                      >
                        Unsplash
                      </a>
                    </p>
                  )}
```

이 블록이 없어도 기능은 정상 동작한다(§5 최소 요건은 검색 패널 자체의 크레딧 표시로 이미 충족 —
이건 "삽입 이후에도 크레딧을 다시 확인할 수 있게" 하는 부가 개선이다). 통합 리소스가 빠듯하면
2-5는 생략하고 2-1~2-4·3~5만 적용해도 §5 요건은 충족된다(단, `ImageEl.stockImageCredit` 필드
자체는 §2-3에서 계속 채워 두는 것을 권장 — 나중에 export/내보내기 크레딧 페이지 등을 붙일 때 다시
파싱할 필요 없이 바로 쓸 수 있다).

## 3. 지연(lazy) 패널 import

**앵커**: `function preloadStudioAssetMenuPanel(): void { void loadStudioAssetMenuPanel(); }`가
끝나는 지점(현재 660행) 다음, `type StudioExportMenuPanelModule = ...`(662행) 앞. 새 블록 삽입:

```ts
type StudioStockImagePanelModule = { default: ComponentType<StudioStockImagePanelProps> };
let studioStockImagePanelPromise: Promise<StudioStockImagePanelModule> | null = null;

function loadStudioStockImagePanel(): Promise<StudioStockImagePanelModule> {
  studioStockImagePanelPromise ??= import("./StudioStockImagePanel").then((mod) => ({
    default: mod.StudioStockImagePanel,
  }));
  return studioStockImagePanelPromise;
}

const StudioStockImagePanel = lazyRetry(loadStudioStockImagePanel, "StudioStockImagePanel");

function preloadStudioStockImagePanel(): void {
  void loadStudioStockImagePanel();
}
```

(`StudioAssetMenuPanel`과 동일한 "캐시된 프로미스 + 호버/포커스 프리로드" 패턴을 그대로 따른다 —
이 패널도 검색창+결과 그리드로 무게감이 비슷하고, 툴바에서 바로 옆에 놓이므로 동일한 프리로드 UX를
주는 것이 자연스럽다. `docs/studio-ai-assist-integration.md`의 4개 AI 패널은 반대로 더 가벼운
`lazyRetry(() => import(...).then(...), "Name")` 인라인 축약형을 썼다 — 이 문서와 그 문서의 통합
패스가 어느 순서로 적용되든 서로 다른 앵커/블록이라 충돌하지 않는다.)

## 4. `StudioMenu` 타입 — 새 메뉴 종류 추가

**앵커**(1048행): `type StudioMenu = "template" | "bubble" | "sticker" | "char" | "bgScene" |
"asset" | "emeres" | "tone" | "scene" | "clip" | "palette" | "brandKit";`

```ts
type StudioMenu =
  | "template" | "bubble" | "sticker" | "char" | "bgScene" | "asset" | "emeres" | "tone" | "scene"
  | "clip" | "palette" | "brandKit" | "stockImage"; // ← 추가
```

`docs/studio-ai-assist-integration.md`가 먼저 적용되어 이 줄에 이미 `| "aiAssist"`가 붙어 있어도
그 뒤에 `| "stockImage"`를 이어 붙이기만 하면 된다(유니온 타입이라 순서는 의미 없음).

## 5. 툴바 진입점 — "스톡 사진" 버튼 + 팝오버

**메뉴 위치 결정**: 이 기능은 "AI로 새로 만들기"가 아니라 "이미 있는 사진을 찾아 넣기"라, 생성형
AI 그룹("AI 어시스트")보다 **"내 에셋"(로컬/커뮤니티 이미지 라이브러리) 바로 옆**에 두는 것이 더
알맞다고 판단했다 — 사용자 입장에서 "캔버스에 사진을 넣는 방법"이 내 에셋 → **스톡 사진(신규)** →
직접 업로드 순으로 한 그룹에 모인다. `StudioAssetMenuPanel.tsx`의 prop 인터페이스(19개 prop)를
확장해 3번째 탭으로 끼워 넣는 대신 **독립된 툴바 버튼 + 독립된 패널 파일**로 분리했다 — 그 컴포넌트는
이미 복잡하고 활발히 쓰이는 기존 파일이라, 굳이 건드리지 않아도 되는 이번 기능 때문에 그 prop
인터페이스를 넓히는 리스크를 감수할 이유가 없었다(§7-3 참고).

**앵커**: `menu === "asset"` 블록이 끝나는 지점(현재 9092행의 닫는 `</div>`) 다음,
`<label className={cn(toolBtn(false), "cursor-pointer")} title="이미지 추가 ...">`(9093행, 일반
업로드 버튼) 앞. 새 블록 삽입:

```tsx
<div ref={menu === "stockImage" ? menuRef : undefined} className="relative">
  <button
    type="button"
    onClick={() => {
      preloadStudioStockImagePanel();
      setMenu(menu === "stockImage" ? null : "stockImage");
    }}
    onMouseEnter={preloadStudioStockImagePanel}
    onFocus={preloadStudioStockImagePanel}
    aria-haspopup="menu"
    aria-expanded={menu === "stockImage"}
    className={toolBtn(menu === "stockImage")}
    title="Unsplash 무료 사진 검색해 삽입(내 Access Key로, 서버 비용 없음)"
  >
    <Images size={14} /> 스톡 사진
  </button>
  {menu === "stockImage" && (
    <Suspense
      fallback={
        <div className="fixed inset-x-2 top-48 z-30 max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-xl border border-line bg-panel p-3 text-xs text-fg-3 shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 sm:w-80 sm:max-h-none sm:overflow-visible">
          스톡 사진 패널을 여는 중...
        </div>
      }
    >
      <StudioStockImagePanel onInsert={insertStockImage} />
    </Suspense>
  )}
</div>
```

`StudioStockImagePanel` 자신의 루트가 이미 `fixed inset-x-2 top-48 ... sm:w-80 ...` 위치/크기
클래스를 포함하므로(§1), 위 `Suspense`의 `fallback`만 같은 클래스를 복제해 두면 된다 — `asset` 메뉴의
구조(`StudioAssetMenuPanel` 자신이 루트를 그리고, `StudioPage.tsx`는 `Suspense`만 감싼다)와 완전히
동일한 관례다(반대로 `docs/studio-ai-assist-integration.md`의 `aiAssist` 메뉴는 `StudioPage.tsx`가
직접 위치 wrapper `<div>`를 그리고 그 **안에** 3개 패널을 쌓는 방식이라 다르다 — 그 문서는 형제
패널이 여러 개라 공유 wrapper가 필요했고, 이 문서는 패널이 하나뿐이라 asset 메뉴 방식이 더
간단하다).

바깥 클릭/Esc로 닫히는 것은 기존 `menuRef` 아웃사이드클릭 핸들러(`if
(!menuRef.current?.contains(e.target as Node)) setMenu(null);`)가 `menu` 상태 하나만 보고 동작하므로
**추가 배선 없이 그대로 적용된다**(다른 모든 메뉴와 동일).

## 6. 통합 후 수동 QA 체크리스트

- [ ] 툴바 "내 에셋" 바로 오른쪽에 "스톡 사진" 버튼이 보인다. 클릭 → 팝오버가 열린다.
- [ ] Access Key 미입력 상태: `<details>`가 펼쳐진 채로 보이고, 검색창/검색 버튼이 비활성화된다
      (네트워크 탭에 요청이 전혀 안 나감을 확인).
- [ ] Access Key 입력 → `<details>`를 닫지 않아도 곧바로 검색창이 활성화된다(같은 컴포넌트 내부
      state라 리렌더만으로 반영 — stale-read 문제 자체가 구조적으로 없음).
- [ ] 검색어 입력 후 Enter 또는 "검색" 버튼 → 결과 그리드가 뜬다. 그리드 각 칸 아래에 작가명·
      "Unsplash" 두 링크가 보이고, 새 탭에서 각각 작가 프로필/사진 페이지로 열린다(URL에
      `utm_source=toonspectrum&utm_medium=referral`이 붙어 있는지 확인).
- [ ] 응답 헤더에 `X-Ratelimit-*`가 있으면 "이번 시간 남은 검색 한도: N/50" 문구가 보인다.
- [ ] 결과 사진 클릭 → 잠깐 스피너(해당 칸만) → 캔버스에 이미지로 삽입된다(패널/프레임 선택 여부와
      무관하게 새 이미지 요소로 캔버스 중앙에 추가 — `addRenderedImage`와 동일 배치 규칙).
      **생성형 AI 고지 모달이 뜨지 않는다**(뜨면 버그 — §0 참고).
- [ ] 삽입된 이미지를 선택 → "선택한 이미지" 사이드바에 "출처: {작가명} · Unsplash" 링크가 보인다
      (§2-5 적용 시).
- [ ] 브라우저 개발자 도구 네트워크 탭에서: 검색은 `api.unsplash.com/search/photos`로, 삽입 직후
      `api.unsplash.com/photos/{id}/download`(download_location)로 각각 요청이 나가는 것을 확인한다
      (이 앱 자체 오리진을 거치지 않는다는 원칙 검증).
- [ ] "더 보기" → 다음 페이지 결과가 기존 그리드 아래에 이어 붙는다(교체 아님).
- [ ] ⌘Z로 삽입한 스톡 이미지를 되돌리면 캔버스에서 사라진다(일반 이미지 삽입과 동일한 히스토리
      동작 — 별도 배선 불필요).
- [ ] localStorage `studio_unsplash_access_key`를 개발자 도구에서 지우고 새로고침하면 패널이 다시
      미설정 상태(`<details>` 펼쳐짐, 검색 비활성화)로 돌아온다.
- [ ] 잘못된 Access Key로 검색 시 Unsplash의 에러 메시지("Invalid access token" 등)가 그대로 보인다.
- [ ] 무료 티어 한도(시간당 50회)를 넘기면 403 에러 메시지("Rate Limit Exceeded")가 보인다(재현이
      번거로우면 스킵 가능 — 유닛 테스트에서 이미 이 파싱 경로를 검증했다).

## 7. 설계 결정 · 스케치 대비 편차(§5 포함, 의도적 스코프/구현 선택)

1. **별도 "설정 패널" 컴포넌트를 만들지 않았다.** `StudioAiSettingsPanel`이 별도 컴포넌트인 이유는
   그 설정(baseURL·API 키·이미지/텍스트 모델·엔드포인트 경로 4~7개 필드)을 **형제 패널 4개**(설정
   자신 + 배경생성 + 채색 + 구도제안)가 공유해야 해서였다(부모가 단일 진실 공급원으로 끌어올려야
   stale-read를 피할 수 있음). Unsplash 설정은 필드가 Access Key 1개뿐이고, 이걸 보는 패널도
   `StudioStockImagePanel` 하나뿐이라 — 공유할 대상이 없다. 그래서 `StudioAiCompositionPanel`(형제
   패널이 없어 자기완결형인 경우)과 같은 이유로, Access Key 입력 UI를 검색 UI와 같은 컴포넌트 안에
   `<details>`로 접어 넣었다. 사용자 지시서가 새 패널 파일을 정확히 하나(`StudioStockImagePanel.tsx`)
   만 지정한 것도 이 판단과 일치한다.
2. **패널이 자기 위치 클래스(`fixed inset-x-2 top-48 ... sm:w-80 ...`)를 스스로 갖는다.** 이
   저장소에는 두 가지 팝오버 관례가 있다 — (a) `StudioPage.tsx`가 위치 wrapper를 그리고 그 **안에**
   형제 패널 여러 개를 쌓는 방식(`aiAssist`, 다중 패널 공유 wrapper가 필요할 때), (b) 패널 자신이
   위치 클래스를 포함한 루트를 반환하고 `StudioPage.tsx`는 `Suspense`만 씌우는 방식(`asset`, 패널이
   하나뿐일 때). 이 기능은 패널이 하나뿐이라 (b)를 따랐다 — `asset` 메뉴 바로 옆에 놓이므로 시각적
   일관성도 (b) 쪽이 더 잘 맞는다(같은 `top-48`/`sm:` 브레이크포인트 공식).
3. **`StudioAssetMenuPanel`의 3번째 탭으로 넣지 않고 독립 툴바 버튼으로 분리했다.** "내 에셋" 패널은
   이미 19개 prop을 가진, 활발히 쓰이는 기존 컴포넌트다. 이번 기능을 탭으로 끼워 넣으려면 그 prop
   인터페이스를 검색어/결과/Access Key 등으로 넓혀야 하는데, 병렬 세션이 동시에 작업 중인 저장소에서
   굳이 필요하지 않은 기존 파일 편집 표면을 늘리고 싶지 않았다. 독립 버튼으로 분리하면 통합 패스가
   `StudioAssetMenuPanel.tsx`를 단 한 줄도 건드리지 않고 새 기능을 추가할 수 있다.
4. **크레딧 표시는 두 지점에 둔다 — (a) 검색 결과 그리드(필수), (b) 선택한 이미지 사이드바(권장,
   §2-5).** Unsplash API Guidelines는 "사진을 사용하는 모든 곳에" 작가·Unsplash 크레딧을 요구한다.
   검색 결과 그리드에서 사진마다 캡션으로 보여주는 것으로 API 사용 시점의 크레딧 표시 요건은
   충족되지만, 캔버스에 삽입한 뒤에는 그 캡션이 더 이상 따라오지 않는다 — 그래서
   `ImageEl.stockImageCredit`에 크레딧을 영구 보존해(§2-3) 나중에라도(선택 시 사이드바 등) 다시 보여줄
   수 있게 했다. **이번 통합 스코프에는 넣지 않은 것**: PNG/PDF/PSD 등 내보내기 결과물에 자동으로
   크레딧 페이지/워터마크를 붙이는 것 — 여러 내보내기 모듈(`studio-psd-export.ts`/
   `studio-svg-export.ts`/`studio-pdf-export.ts`/`studio-pdf-contact-sheet.ts`/
   `studio-motion-export.ts`)을 전부 건드려야 하는 훨씬 큰 스코프라, `stockImageCredit` 필드를 미리
   심어 두는 선까지만 하고 실제 내보내기 크레딧 자동 삽입은 후속 과제로 남긴다.
5. **`download_location` 트리거는 fire-and-forget이다.** Unsplash API Guidelines는 "사용자가 사진을
   다운로드(에 준하는 행위)할 때" 이 엔드포인트를 호출하라고 요구하지만, 이 요청의 성공/실패가 사용자
   경험에 영향을 줘서는 안 된다고 판단했다 — 그래서 `StudioStockImagePanel.onPick`은 캔버스 삽입을
   먼저 완료(`onInsert` 호출)한 뒤 `void triggerStockImageDownload(...)`로 결과를 기다리지 않고
   쏜다. 이 호출이 실패해도(네트워크 문제 등) 사용자의 삽입 동작 자체는 이미 끝나 있다.
6. **"다운로드" 이벤트 = 데이터 URL로 인라인 변환하는 순간(캔버스 삽입 시점)이지, 검색 결과에 표시되는
   시점이 아니다.** Unsplash CDN(imgix)이 이미지 URL 자체에 CORS 헤더를 보내므로, 검색 결과 그리드는
   `thumbUrl`(`urls.small`)을 그냥 원격 URL로 `<img src>`에 걸어 보여주기만 한다(별도 fetch·인라인
   변환 없음 — 미리보기일 뿐 "사용"이 아니다). 실제 "사용"은 사용자가 사진을 클릭해 캔버스에 넣기로
   결정한 순간이고, 그 순간에만 `inlineStockPhotoForCanvas`(데이터 변환)와
   `triggerStockImageDownload`(다운로드 트리거)가 함께 실행된다 — 두 동작이 정확히 같은 트리거에
   묶여 있어 "다운로드 이벤트가 실제 사용과 어긋난다"는 모호함이 없다.
7. **원격 URL을 그대로 `ImageEl.src`에 넣는(hotlink) 방식 대신, data: URL로 인라인 변환하는 방식을
   선택했다 — 이 저장소의 기존 렌더링 코드에 실제로 존재하는 gap 때문이다.** 캔버스에 실제 이미지
   노드를 렌더하는 `UrlImage` 컴포넌트(현재 2414~2442행)의 이미지 로드 이펙트는:
   ```ts
   const im = new globalThis.Image();
   im.src = el.src;
   im.onload = () => setImg(im);
   ```
   **`crossOrigin` 을 전혀 설정하지 않는다** — 같은 파일의 픽셀 편집 전용 로더
   `loadPixelEditImage`(2117~2125행)는 `if (!src.startsWith("data:")) img.crossOrigin =
   "anonymous";`로 이미 이 문제를 인지하고 처리하는데, 실제 화면에 그리는 `UrlImage`는 그렇게 하지
   않는다. `crossOrigin`을 안 걸고 원격 이미지를 로드하면, 그 노드에 필터(Konva `.cache()`)를 걸거나
   페이지를 내보낼 때(`stage.toCanvas()`/`toDataURL()`) **"tainted canvas" `SecurityError`가
   조용한 시한폭탄처럼 나중에 터진다**(사진을 넣을 땐 멀쩡히 보이다가, 밝기 조정을 걸거나 PNG로
   내보내는 순간 실패). 이걸 고치려면 `UrlImage`의 로드 이펙트에도 `crossOrigin="anonymous"` 분기를
   추가해야 하는데, 이건 **캔버스 렌더링 핵심 경로의 실제 동작 변경**이라 이번 세션에서 손대지 않기로
   한 "기존 파일 무수정" 원칙과 정면으로 부딪힌다. 반면 `inlineStockPhotoForCanvas`로 삽입 시점에
   미리 data: URL로 변환해 두면, 캔버스 렌더링 경로는 기존 그대로(항상 data: URL이 온다는 불변식
   유지)이고 `UrlImage`를 단 한 줄도 고칠 필요가 없다 — 저장 용량은 조금 더 쓰지만(AI 배경 생성이
   이미 같은 트레이드오프를 감수하고 있다 — `docs/studio-ai-assist-integration.md` §9-4), 훨씬 안전한
   선택이다. **후속 작업 후보**: `UrlImage`에 `crossOrigin` 분기를 추가하고 나면(별도 작업으로) 이
   기능을 hotlink 방식으로 전환해 저장 용량을 아낄 수 있다 — 그 전까지는 인라인 변환이 맞다.
8. **삽입 해상도는 `urls.regular`(약 1080px 폭)만 쓴다.** `urls.raw`/`urls.full`(수천~수만 px)은
   이 앱이 삽입하는 웹툰 캔버스 해상도엔 과하고, 인라인 변환 시 어차피
   `STUDIO_STOCK_IMAGE_MAX_INSERT_DIM`(1280px, `studio-image-utils.ts` `downscaleImageFile`과 동일
   상한)으로 다시 축소되므로 처음부터 작은 걸 받는 게 낫다.
9. **`content_filter=low`를 명시적으로 고정했다** — Unsplash 기본값과 같은 값이라 새로운 제약을
   추가하는 게 아니라, 향후 Unsplash가 기본값을 바꾸더라도 이 앱의 동작이 조용히 바뀌지 않도록
   방어적으로 명시해 둔 것이다. 별도의 "세이프서치 끄기" 설정 UI는 만들지 않았다(스코프 최소화).
10. **검색은 실시간(입력마다) 호출이 아니라 명시적 제출(Enter/버튼)로만 나간다.** `AGENTS.md`가
    사이트 전역 `/api/search` 커맨드 팔레트는 "키 입력마다 네트워크 요청을 쏘고 `useDeferredValue`로
    debounce하지 않는다"고 명시하는데, 이건 **자체 백엔드(무제한/무료)** 엔드포인트라 성립하는
    얘기다. Unsplash 무료 티어는 **시간당 50회**로 엄격히 제한되므로, 같은 정책을 여기 적용하면
    사용자가 검색어를 다 치기도 전에 몇 글자 칠 때마다 호출이 나가 할당량이 순식간에 소진된다 —
    그래서 이 패널만 예외적으로 "명시적 제출" 방식을 쓴다(AGENTS.md 정책과 모순되는 게 아니라, 그
    정책이 전제하는 "무제한 자체 API"라는 조건이 여기선 성립하지 않기 때문).
11. **Access Key 저장은 JSON 블롭이 아니라 원문 문자열이다(`studio_unsplash_access_key` 키에 직접
    저장).** `studio-ai-client.ts`의 `STUDIO_AI_SETTINGS_KEY`는 필드가 6개라 JSON 직렬화 +
    필드별 관대한 폴백 파싱이 필요했다. 여기는 필드가 Access Key 1개뿐이라 그 정도 방어가
    불필요한 의례다고 판단했다 — `getItem`이 그대로 문자열을 돌려주고, 빈 문자열/부재는 동일하게
    "미설정"으로 취급한다.
