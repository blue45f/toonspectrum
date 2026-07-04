# Studio PSD 레이어 가져오기(Import) — StudioPage.tsx 통합 설계

> 이 문서만 작성 대상이다 — **이 세션에서는 새 파일을 만들지도, `StudioPage.tsx`를 수정하지도
> 않았다.** 순수 설계 문서이며, 아래는 후속 구현·통합 패스가 정확히 어떤 파일을 어떤 데이터 모델로
> 만들고 기존 파일 어디에 무엇을 추가해야 하는지에 대한 지시서다. 라인 번호는 이 문서 작성 시점
> (`StudioPage.tsx` 15,050줄) 기준이며, 병렬 세션이 동시에 파일을 건드릴 수 있어 통합 시점엔 몇 줄
> 어긋나 있을 수 있다 — 각 항목의 "앵커 텍스트"로 위치를 재확인할 것.

## 0. 배경 — 왜 이 기능인가, 기존 export의 "거울"인가

저장소에 `ag-psd@31.0.1`이 이미 의존성으로 있고 `studio-psd-export.ts`가 `writePsd`(레이어별 PSD
내보내기)만 쓰고 있다 — `readPsd`는 어디서도 호출되지 않고, 기존 모든 업로드 input이
`accept="image/*"`라 `.psd`는 애초에 파일 선택 대화상자에서 선택조차 안 된다. **왕복(round-trip)의
절반만 있는 상태다.**

CSP·MediBang·Procreate 등은 모두 PSD 임포트를 지원하며(업계 표준 상호운용 포맷), 2026 작가 인터뷰
(Tabstory)에서도 "no single platform covers all her needs"라는 **ecosystem fragmentation**(여러 툴
병용) 문제가 지적된다 — 팀 작업(밑그림/채색/배경 분업) 파이프라인에서 컬러리스트·배경작가가
포토샵에서 만든 파일을 그대로 받아오는 협업 시나리오에 실질적이다.

**스코프**: 단순 래스터 레이어 평탄화 임포트로 한정한다. 조정 레이어·스마트 오브젝트·레이어
이펙트(그림자 등)·레이어 마스크의 완전한 재현은 명시적으로 제외한다(§6). 각 PSD 레이어는 캔버스
좌표/크기/불투명도/기본 블렌드 모드가 보존된 **하나의 `image` 요소**가 된다 —
`studio-psd-export.ts`의 정확히 반대 방향이며, 그 파일의 `BLEND_MODE_MAP`/z-order 반전 로직을
거울처럼 참고한다(한 글자도 수정하지 않고 옆에 나란히 새 파일을 둔다).

## 1. 새로 만들 파일 — `src/domains/creator/studio-psd-import.ts` (설계, 미구현)

`ag-psd`의 `readPsd`(`import { readPsd, type BlendMode, type Layer, type Psd } from "ag-psd";`)와
`studio-image-utils.ts`의 `downscaleDataUrl`(webp 재인코딩, 알파 보존 — JPEG이 아니라 WebP라 투명
배경이 있는 레이어도 안전하다)을 재사용한다.

```ts
import { downscaleDataUrl } from "./studio-image-utils";
import { readPsd, type BlendMode, type Layer, type Psd } from "ag-psd";

// ── 결과 타입 ──────────────────────────────────────────────────────────────
/** El("image" 변형)과 구조 호환되는 최소 형태 — StudioPage가 그대로 El[]에 스프레드한다. */
export interface PsdImportedElement {
  id: string;
  type: "image";
  src: string; // downscaleDataUrl을 거친 최종 data URL(webp, maxW=1280 — onPickImage와 동일 관례)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
  opacity?: number; // 그룹×자신 누적 불투명도(0..1). 1이면 필드 생략(El 관례 — 미설정=불투명).
  blendMode?: string; // studio El.blendMode 문자열. "source-over"(기본)면 필드 생략.
  name?: string; // PSD 레이어 이름. 없으면 "레이어 N"(N=1부터, 평탄화 순서).
  hidden?: true; // 자신 또는 조상 그룹이 숨김이면 true. 아니면 필드 자체를 생략(El 관례).
}

export interface PsdImportResult {
  /** Studio z-order(뒤→앞, elements[0]=맨 뒤)로 이미 정렬된 상태. */
  elements: PsdImportedElement[];
  /** 원본 PSD 캔버스 크기(스케일 반영 전) — 새 페이지 생성 시 canvasH 계산에 필요. */
  sourceWidth: number;
  sourceHeight: number;
  /** 실제 적용된 배치 스케일(targetWidth / sourceWidth). */
  scale: number;
  /** 재현 불가/제외 항목 고지 — studio-psd-export.ts의 skipped와 동일한 정직성 규약. */
  skipped: string[];
}

// ── 테스트 주입 지점 — studio-brand-kit.ts류 DI 패턴, export 모듈보다 한 걸음 더 테스트 가능하게 ──
export interface PsdImportDeps {
  /** 기본 ag-psd readPsd. 테스트에서 손으로 만든 Psd 픽스처를 즉시 반환하도록 모킹. */
  readPsdImpl?: (buffer: ArrayBuffer) => Psd;
  /** 기본 studio-image-utils.downscaleDataUrl. 테스트에서 입력을 그대로 반환하도록 모킹(canvas/Image
   *  DOM 의존을 배치·스케일 계산 테스트에서 분리). */
  downscaleImpl?: (dataUrl: string, maxW: number) => Promise<string>;
}

// ── 메인 진입점(비동기, File 전체를 다룸) ────────────────────────────────
/**
 * .psd 파일을 파싱해 레이어별 이미지 요소 배열로 변환한다.
 * @param file 사용자가 고른 .psd 파일.
 * @param targetWidth 배치될 캔버스 폭(보통 CANVAS_W=720) — PSD 폭에 맞춰 균일 스케일한다.
 * 실패(손상된 파일 등)는 throw한다(한국어 메시지) — exportPagePsd의 실패 계약과 동일(그쪽은
 * writePsd 실패 시 throw, 이쪽은 readPsd 실패 시 throw — 대칭적).
 */
export async function importPsdFile(
  file: File,
  targetWidth: number,
  deps?: PsdImportDeps
): Promise<PsdImportResult>;

// ── 순수 하위 함수(단위테스트 핵심 — DOM/File 없이 동작) ─────────────────
export interface FlattenedPsdLayer {
  layer: Layer; // canvas/imageData 원본 참조(래스터화는 importPsdFile이 처리)
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 그룹 체인을 따라 곱연산으로 누적된 불투명도(0..1). */
  opacity: number;
  /** 그룹 체인을 따라 OR로 누적된 숨김 여부. */
  hidden: boolean;
  /** 이 레이어를 건너뛰어야 하는 이유(있으면 canvas를 읽지 않고 skipped에만 기록). */
  skipReason?: "adjustment" | "no-canvas" | "empty-bounds";
}

/**
 * psd.children(중첩 그룹 트리, ag-psd 관례상 [0]=포토샵 패널 맨 위)을 재귀적으로 평탄화해
 * **Studio 순서(뒤→앞, 배열 앞쪽이 배경)로 이미 뒤집힌** 리프 레이어 목록을 반환한다
 * (studio-psd-export.ts가 반대 방향으로 하는 `[...layers].reverse()`와 정확히 대칭).
 * adjustment 레이어(layer.adjustment 존재)는 래스터 내용이 없으므로 skipReason:"adjustment"로
 * 표시하고 canvas를 읽지 않는다(빈 이미지 요소를 만들지 않기 위한 필수 가드).
 */
export function flattenPsdLayers(psd: Psd): FlattenedPsdLayer[];

/** ag-psd BlendMode → Studio El.blendMode(CSS globalCompositeOperation) 문자열.
 *  studio-psd-export.ts의 BLEND_MODE_MAP을 역방향으로 뒤집은 표 — 그 파일을 import하지 않고
 *  이 파일에 독립적으로 정의한다(§5-3 근거: 기존 파일 무수정 원칙 유지, 두 표는 주석으로
 *  상호 참조해 드리프트를 막는다). 매핑 없는 값은 "source-over"로 방어. */
export function mapPsdBlendMode(mode: BlendMode | undefined): string;

/** 레이어의 PSD 좌표(left/top/width/height)를 targetWidth 기준 균일 스케일로 변환.
 *  scale = min(1, targetWidth / psdWidth) — onPickImage/createCanvasImageElement와 동일하게
 *  "확대는 하지 않고 축소만"(1 초과 스케일 방지, 저해상도 PSD가 억지로 커지지 않게). */
export function placementForLayer(
  bounds: { left: number; top: number; width: number; height: number },
  psdWidth: number,
  targetWidth: number
): { x: number; y: number; width: number; height: number; scale: number };

/** 결과 요약 한 줄(상태 배너용) — psdExportResultMessage와 동일한 톤. */
export function psdImportResultMessage(result: PsdImportResult): string;
```

### 1.1 플랫튼 알고리즘 상세(재귀·불투명도 누적)

```
flatten(layers: Layer[], inheritedOpacity: number, inheritedHidden: boolean):
  for layer in layers (PSD 순서, [0]=맨 위부터):
    opacity = inheritedOpacity * clamp01(layer.opacity ?? 1)
    hidden  = inheritedHidden || !!layer.hidden
    if layer.children (그룹):
      flatten(layer.children, opacity, hidden)  # 그룹 자신은 레이어를 만들지 않음
    elif layer.adjustment:
      skipped.push(`${name}: 조정 레이어라 제외됨`)
    else:
      leaf 레이어로 push (opacity, hidden 그대로 leaf에 적용)
```

그룹 자신의 `blendMode`는 상속하지 않는다(leaf 자신의 blendMode만 사용, 기본 "normal") —
포토샵의 중첩 그룹 격리 블렌딩을 완전히 재현하려면 오프스크린 합성이 필요해 "단순 평탄화" 스코프를
넘어선다. 이 근사(그룹 불투명도는 반영하되 그룹 블렌드 모드는 반영하지 않음)는 `skipped` 목록에
그룹 단위로 한 번만 고지한다(그룹 안에 레이어가 여러 개여도 중복 고지하지 않음).

### 1.2 레이어 마스크·이펙트·스마트 오브젝트 — v1 명시적 제외

- **레이어 마스크**(`layer.mask`/`LayerMaskData.canvas`)는 반영하지 않는다 — 마스크 적용 **전**
  원본 그대로 가져온다. 이유: `LayerMaskData`는 자신만의 `top/left/right/bottom`(레이어 bounds와
  다를 수 있음)과 그레이스케일 캔버스를 갖고 있어, 정확히 합성하려면 좌표 정렬 + 휘도→알파 변환이
  필요하다 — 이번 스코프 밖.
  **흥미로운 확장 지점**: Studio 자체에 이미 `El.maskSrc`/`maskEnabled`(경쟁사 2차 배치, "자유형
  페인터블 레이어 마스크", `studio-layer-mask.ts`)가 있고, 그 인코딩이 정확히 "RGB 흰색 고정 +
  알파 채널=가시성"이다. 즉 향후 "휘도→알파 변환" 함수 하나만 추가하면 PSD 마스크를
  `maskSrc`로 자연스럽게 이어붙일 수 있다 — 이번 v1은 이 배선을 만들지 않고 skipped 목록에만
  고지한다: `"${name}: 레이어 마스크는 반영되지 않고 원본 그대로 가져왔어요"`.
- **레이어 이펙트**(그림자/외곽선 등, `layer.effects`) — 반영 안 함, 고지만:
  `"${name}: 레이어 스타일(그림자 등)은 반영되지 않아요"`.
- **스마트 오브젝트**(`layer.placedLayer`) — PSD가 보관한 래스터 미리보기(canvas)는 그대로
  가져오되(내용이 비지 않게), 고지: `"${name}: 스마트 오브젝트는 편집 가능한 원본이 아니라 미리보기
  이미지로 가져왔어요"`.
- **텍스트 레이어**(`layer.text` 존재) — ag-psd가 디코딩한 래스터 `canvas`를 그대로 이미지로
  가져온다(편집 가능한 글자가 아님), 고지: `"${name}: 텍스트 레이어는 편집 가능한 글자가 아니라
  이미지로 가져왔어요"`. `studio-psd-export.ts`가 쓰기 방향에서 이미 "ag-psd가 편집 가능한 텍스트
  레이어 기록을 신뢰성 있게 지원하지 않는다"고 명시한 것과 대칭적인 읽기 방향 결정이다.

## 2. 데이터 모델 — 신규 필드 없음(El/PageState 무수정)

이 기능은 **새 요소 타입도, `El`/`PageState` 필드 추가도 필요 없다** — 결과가 전부 기존 `image`
타입 El이기 때문이다(§0 스코프 결정과 직접 연결). 유일하게 "새로 생기는 데이터"는 캔버스에 추가되는
평범한 `El[]` 배열뿐이라, 기존 histories/undo/직렬화(.json 백업)/모든 내보내기 파이프라인이
**전혀 인지할 필요 없이** 그대로 호환된다 — 이번 세 갭 중 통합 리스크가 가장 낮다.

## 3. `StudioPage.tsx`에 추가할 것

### 3-1. import — 값 import 블록에 추가. 앵커: 기존 `import { createCanvasImageElement } from
"./studio-image-placement";`(207행 부근) 다음 줄.

```ts
import { importPsdFile, psdImportResultMessage } from "./studio-psd-import";
```

`FileUp`(또는 `Loader2` 재사용 — 이미 import돼 있음) 아이콘 하나만 추가 필요. 앵커: lucide-react
import 블록 안 `Upload,`(52행) 다음 줄.

```ts
  Upload,
  FileUp, // ← 추가(PSD 가져오기 버튼 아이콘)
```

### 3-2. 상태 훅 — "복구 (.json)" 관련 상태 근처에 추가할 자리가 마땅치 않으므로(그쪽은 상태 없이
`handleImportProject` 함수 하나뿐), `error` 상태(3325행 부근) 바로 다음에 추가.

```ts
const [error, setError] = useState<string | null>(null);
// PSD 레이어 가져오기 — studio-psd-import.ts 통합 상태(§4-3에서 사용하는 tri-tone 배너,
// StudioExportMenuPanel의 psdStatus/svgStatus/pdfStatus와 동일한 { tone, text } 관례).
const [psdImportBusy, setPsdImportBusy] = useState(false);
const [psdImportStatus, setPsdImportStatus] = useState<{ tone: "good" | "warn"; text: string } | null>(null);
```

### 3-3. 핸들러 함수 — `handleImportProject` 함수가 끝나는 지점 바로 다음에 추가.

**앵커**: `handleImportProject`의 닫는 `}`(8191행 부근), `return (` 시작 전.

```ts
// PSD 레이어 가져오기 — ag-psd로 파싱해 레이어별 이미지 요소로 캔버스에 배치한다.
// "새 페이지로" vs "현재 페이지 맨 위에 얹기" 두 방식을 확인창 하나로 고른다 — handleDownloadAll의
// "확인=A/취소=B" confirm() 분기 관례를 그대로 따른다(전용 모달 컴포넌트를 새로 만들지 않는다).
async function handleImportPsd(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  setPsdImportBusy(true);
  setPsdImportStatus(null);
  try {
    const result = await importPsdFile(file, CANVAS_W);
    if (result.elements.length === 0) {
      setPsdImportStatus({ tone: "warn", text: psdImportResultMessage(result) });
      return;
    }
    const asNewPage = globalThis.confirm(
      `PSD에서 레이어 ${result.elements.length}개를 찾았어요.\n` +
        `확인: 새 페이지로 추가 / 취소: 현재 페이지 맨 위에 얹기`
    );
    if (asNewPage) {
      const targetH = Math.max(1, Math.round(result.sourceHeight * result.scale));
      const idx = findPageIndexInPages(activePage.id) + 1; // 기존 로컬 헬퍼 재사용(5253행 부근)
      const withPage = insertBlankPageAt(pages, idx, uid, targetH);
      const finalPages = withPage.map((p, i) =>
        i === idx ? { ...p, elements: result.elements as El[] } : p
      );
      commitPages(finalPages);
      setCurrentPageId(withPage[idx].id);
    } else {
      commit([...elements, ...(result.elements as El[])]); // 기존 요소 위(앞)에 얹는다.
    }
    setPsdImportStatus({
      tone: result.skipped.length > 0 ? "warn" : "good",
      text: psdImportResultMessage(result),
    });
  } catch (err) {
    setPsdImportStatus({
      tone: "warn",
      text: err instanceof Error ? err.message : "PSD 파일을 읽지 못했어요.",
    });
  } finally {
    setPsdImportBusy(false);
  }
}
```

`insertBlankPageAt`은 이미 `StudioPage.tsx`에 import돼 있다(318행 부근, `movePageToTop`류 기존
페이지 삽입 로직이 이미 쓰는 중) — 추가 import 불필요. 페이지 인덱스 조회도 `studio-pages.ts`의
순수 함수 `findPageIndex(pages, id)`를 새로 import하는 대신, 이미 있는 로컬 헬퍼
`findPageIndexInPages(pageId)`(5253행 부근, `pages` 클로저를 이미 잡고 있어 인자가 하나뿐)를
그대로 재사용한다 — 기존 `movePageToTop`/`movePageToBottom` 등과 동일한 호출 관례.

### 3-4. 툴바 버튼 — "복구 (.json)" 버튼 바로 다음(둘 다 "가져오기" 액션이라 인접시킨다).

**앵커**(8291~8294행 부근):

```tsx
          <label className={cn(buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" }), "cursor-pointer")} title="백업해둔 .json 파일을 불러와 작업을 이어함">
            <Upload size={14} /> 복구 (.json)
            <input type="file" accept=".json" className="hidden" onChange={handleImportProject} />
          </label>
```

바로 다음에 추가:

```tsx
          <label
            className={cn(
              buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" }),
              "cursor-pointer",
              psdImportBusy && "pointer-events-none opacity-60"
            )}
            title="포토샵(.psd) 파일의 레이어를 이미지 요소로 가져와요(래스터 평탄화, 편집 가능한 텍스트/조정 레이어는 재현되지 않음)"
          >
            {psdImportBusy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
            PSD 가져오기
            <input
              type="file"
              accept=".psd,image/vnd.adobe.photoshop"
              className="hidden"
              disabled={psdImportBusy}
              onChange={(e) => void handleImportPsd(e)}
            />
          </label>
          {psdImportStatus && (
            <span
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] leading-snug",
                psdImportStatus.tone === "good" && "border-good/40 bg-good/10 text-good",
                psdImportStatus.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
              )}
            >
              {psdImportStatus.text}
            </span>
          )}
```

`Loader2`는 이미 import돼 있다(9046행 근처 등에서 이미 사용 중). tone 클래스는
`StudioExportMenuPanel.tsx`의 `psdStatus`/`svgStatus`/`pdfStatus` tri-tone 배너와 동일한
`border-good/40 bg-good/10 text-good` / `border-warn/40 bg-warn/10 text-warn` 클래스 문자열을
그대로 재사용한 것이다(새 색상 토큰을 만들지 않는다).

## 4. 정책·스코프 결정 사항

1. **"새 페이지로" vs "현재 페이지에 얹기"는 `confirm()` 하나로 분기한다.** 전용 선택 모달을 만들지
   않는 이유는 `handleDownloadAll`이 이미 동일한 이진 분기를 `globalThis.confirm()`으로 처리하는
   정확한 선례가 있기 때문이다(§3-3). 새 UI 컴포넌트를 만드는 대신 기존 관례를 그대로 재사용해
   통합 규모를 작게 유지한다.
2. **레이어는 항상 `image` 타입으로만 임포트된다.** 벡터 마스크·텍스트 레이어라도 예외 없이
   래스터 이미지가 된다(§1.2) — "빠르고 예측 가능한 v1"을 "완전한 포토샵 호환"보다 우선했다.
3. **PSD 그룹은 Studio의 레이어 그룹(`groups: LayerGroup[]`, 폴더)으로 매핑하지 않는다.** 매핑을
   시도하면 (a) `LayerGroup`이 평면 배열이라 PSD의 다중 중첩을 그대로 표현할 수 없고(한 단계만
   접힘), (b) 그룹 자체 표시/숨김/블렌드를 어떻게 개별 요소에 반영할지 추가 설계가 필요해 스코프가
   커진다. 이번엔 완전히 평탄화하고, 그룹 정보는 불투명도 누적에만 쓴 뒤 버린다(§1.1).
4. **확대는 하지 않는다(스케일 상한 1).** 저해상도 PSD를 캔버스 폭에 맞춰 억지로 키우면 화질이
   깨진다 — `onPickImage`/`createCanvasImageElement`와 동일한 "축소만" 원칙(§1 `placementForLayer`).
5. **모든 임포트 이미지는 webp로 재인코딩되고 1280px로 다운스케일된다.** 이 앱의 기존 이미지 저장
   관례(`downscaleImageFile`/`downscaleDataUrl`)를 그대로 따른다 — PSD 특유의 초고해상도 원본을
   그대로 localStorage/히스토리에 쌓으면 다른 모든 이미지 요소와 다른 예외가 생긴다.
6. **`readPsd`는 `skipCompositeImageData: true`로 호출한다.** 합성 미리보기(전체 평탄화 썸네일)는
   쓰지 않으므로 디코딩을 생략한다 — `studio-psd-export.ts`가 "합성 썸네일 생성 때문에 내보내기가
   90초 넘게 걸렸다"고 문서화한 것과 정확히 같은 이유로, **읽기 쪽에서도 같은 함정을 미리 피한다.**

## 5. 이미 있음 / 스코프 밖 (재검토 방지)

- **PSD 레이어별 내보내기(export)** — 이미 구현 완료(`studio-psd-export.ts`, CSP 갭 인접 기능
  아님, 별도 기존 기능). 이 문서는 정확히 그 반대 방향이다.
- **조정 레이어/스마트 오브젝트/레이어 이펙트의 완전한 재현** — 조사 단계에서 이미 명시적으로
  스코프 제외 확정. 이 문서도 동일하게 제외를 유지(§1.2).
- **레이어 마스크의 실제 합성** — 이번 v1 제외, `El.maskSrc`로 이어붙일 수 있는 확장 지점만
  문서화(§1.2). 별도 세션에서 "휘도→알파 변환" 유틸이 필요할 때 재검토.
- **PSD 그룹 → Studio 레이어 그룹 매핑** — 스코프 밖으로 확정(§4-3). 향후 필요해지면 별도 설계
  문서로 다룰 것(이 문서를 다시 열지 말 것).

## 6. 통합 후 수동 QA 체크리스트

- [ ] 툴바 "PSD 가져오기" 버튼 → 파일 선택 대화상자가 `.psd` 확장자로 필터링된다.
- [ ] 레이어 5개 안팎의 간단한 PSD(텍스트 레이어 1개, 그룹 1개, 조정 레이어 1개 포함)를 가져오면:
      확인창에서 "새 페이지로" 선택 시 새 페이지가 생성되고 그 레이어들이 원본 배치를 유지한 채
      들어간다.
- [ ] 같은 파일을 "현재 페이지에 얹기"로 가져오면 기존 요소 위(앞)에 추가되고, 기존 요소는
      그대로 남는다.
- [ ] 가져오기 완료 후 상태 배너에 "레이어 N개" + 조정 레이어/텍스트 레이어 관련 알림(warn 톤,
      노란색)이 보인다. 알림이 없는 단순 PSD는 good 톤(초록색)으로 뜬다.
- [ ] 그룹 안에 넣어 불투명도 50%로 설정한 레이어가 캔버스에서 실제로 반투명하게 보인다(그룹
      불투명도 누적 확인).
- [ ] 멀티플라이 등 블렌드 모드를 쓴 레이어가 캔버스에서 같은 블렌드 모드로 보인다.
- [ ] 손상된/빈 .psd 파일을 선택하면 앱이 죽지 않고 warn 톤 에러 배너가 뜬다.
- [ ] 가져온 레이어를 ⌘Z로 되돌리면(새 페이지 모드) 페이지 자체가 사라지고, (얹기 모드) 얹은
      요소만 사라지고 기존 요소는 그대로다.
- [ ] 가져온 이미지 요소를 다시 선택해 이동/크기조절/PNG 내보내기 등 기존 image 요소 편집 기능이
      전부 정상 동작한다(새 요소 타입이 아니므로 회귀 없어야 함).
