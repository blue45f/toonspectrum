# Studio Animated GIF Upload — 설계 문서 (StudioPage.tsx 통합 지침)

> 이 문서가 다루는 범위: **새 파일 2개는 이미 작성·테스트·검증 완료됨** —
> `src/domains/creator/studio-gif-element.ts`(순수 로직, DOM 임포트 없음),
> `src/domains/creator/studio-gif-element.test.ts`(28개 유닛 테스트, 전부 통과 확인 — 최초 23개 +
> 회의적 검증 패스에서 추가된 방어적 분기 5개: 알 수 없는 블록 도입자·Image Descriptor 자체 잘림·
> LZW 바이트 앞 잘림·이미지 데이터 서브블록 조기 잘림·`GIF_SCAN_BYTE_LIMIT` 스캔 상한의 실제
> 차단 동작).
> `pnpm vitest run`·`tsc --noEmit`·`eslint`·`node scripts/validate-architecture.mjs` 전부 클린.
> 이 세션에서는 **`StudioPage.tsx`를 의도적으로 건드리지 않았다** — 이 저장소는 지금 다른
> 세션/워크플로가 동시에 그 파일을 수정 중이기 때문이다. 아래 내용은 후속 통합 패스가 정확히
> 어디에 무엇을 추가해야 하는지에 대한 지시서다. 라인 번호는 이 문서 작성 시점
> (`StudioPage.tsx` 15,052줄) 기준이며, 파일이 계속 자라는 단일 거대 파일이라 통합 시점엔 몇 줄
> 어긋나 있을 수 있다 — 각 항목의 "앵커 텍스트"(정확히 일치해야 하는 기존 코드 조각)로 검색해
> 위치를 재확인할 것.

## 0. 한 줄 요약

미리캔버스의 "움직이는 GIF 추가" 대응. 사용자가 외부에서 만든 `.gif` 파일을 업로드하면, 이 앱
자신의 셀 애니메이션(`frames`)처럼 여러 장의 정적 이미지로 분해하지 **않고**, 원본 GIF 바이트를
그대로 `src`에 담아 캔버스에 올린다. 브라우저의 `<img>`/`HTMLImageElement`가 GIF 디코딩·프레임
재생을 전부 알아서 하므로, 이 앱이 새로 구현해야 하는 건 딱 두 가지뿐이다.

1. 업로드된 파일이 "애니메이션 GIF"인지 판별하는 것(디코딩 없이 바이너리 헤더만 가볍게 스캔 —
   `studio-gif-element.ts`, 이미 완료).
2. 그 판정 결과를 `ImageEl.isAnimatedGif` 플래그로 저장하고, Konva `<Image>` 노드가 그 플래그를
   보고 주기적으로 `getLayer().batchDraw()`를 호출해 "브라우저가 그 순간 디코딩해 둔 프레임"을
   캔버스에 반영하는 것(§2.5).

**새 npm 의존성 없음.** GIF 프레임을 실제로 디코딩(LZW 압축 해제·팔레트 합성)하는 코드는 이
배치에 전혀 없다 — 그 일은 전부 브라우저에 위임한다.

---

## 1. 새로 만든 파일 2개

### 1.1 `src/domains/creator/studio-gif-element.ts` (순수 로직)

| 구분 | export |
|---|---|
| 상수 | `GIF_SCAN_BYTE_LIMIT`(8MiB — 방어적 스캔 상한) |
| 타입 | `GifFileLike`(`{name: string; type?: string}` — 실제 `File`이 구조적으로 만족) |
| (1) 파일명/MIME 감지 | `isGifFile(file: GifFileLike): boolean` |
| (2) 애니메이션 감지 | `isAnimatedGifBytes(input: Uint8Array \| ArrayBuffer): boolean` |
| 접착 헬퍼 | `gifBytesFromDataUrl(dataUrl: string): Uint8Array \| null`, `isAnimatedGifDataUrl(dataUrl: string): boolean` |

핵심 설계 결정(자세한 근거는 파일 상단 주석 참고):

- **GIF를 전혀 디코딩하지 않는다.** "애니메이션 GIF인가?"를 "**Graphic Control
  Extension(GCE) 블록이 하나라도 있는가?**"로 치환한다 — 프레임 지연시간(delay)을 지정하려면
  거의 모든 실사용 인코더(포토샵/ffmpeg/브라우저/Giphy 등)가 GCE를 반드시 넣으므로, 이 신호는
  실무적으로 매우 신뢰도 높다(완전한 형식적 보증은 아니다 — §5-1 참고). GIF89a 블록 구조(Header
  6B → Logical Screen Descriptor 7B → [Global Color Table] → 블록 나열)를 도입자 바이트로만
  따라가며 각 블록의 **선언된 길이만큼 건너뛰기**만 한다 — 픽셀 데이터(LZW) 자체는 절대 읽지
  않는다.
- **실패 시 항상 `false`로 안전하게 닫힌다(fail-closed).** 버퍼가 잘렸거나, 알 수 없는 블록
  도입자를 만나거나, 스캔 상한(8MiB)을 넘으면 예외를 던지지 않고 `false`를 반환한다 — 최악의
  결과는 "진짜 애니메이션 GIF를 정적으로 오판정"뿐이며(캔버스에 첫 프레임만 그려짐), 업로드
  자체나 다른 기능을 절대 깨뜨리지 않는다.
- **DOM 임포트 없음**(`studio-skew.ts`와 동일한 관례). 유일한 전역 의존은 `atob`인데, 브라우저와
  Node 16+(이 저장소 요구 버전은 24+) 양쪽에 표준으로 존재해 Vitest(`environment: "node"`)에서도
  폴리필 없이 그대로 동작함을 확인했다.
- **파일명/MIME 감지(`isGifFile`)와 바이트 감지(`isAnimatedGifBytes`)는 별개 관문이다.**
  `isGifFile`은 "캔버스 다운스케일 재인코딩 경로를 건너뛰어도 되는 후보"를 빠르게(동기, I/O 없음)
  솎아내는 1차 관문일 뿐이고, 실제 "이 파일이 진짜 GIF이고 그중 애니메이션인가"는 반드시
  `isAnimatedGifBytes`/`isAnimatedGifDataUrl`(바이트를 실제로 읽어야 하는 2차 관문)이 확정한다.
  `isGifFile`이 과다 판정(false-positive)해도 실질적 피해가 없다 — 그 다음 바이트 스캔이 진짜
  여부를 다시 정확히 가르기 때문(§2.3).
- **테스트가 검증한 것**: 정적 GIF(GCE 없음) 4종(단순/Local Color Table 포함/Comment
  Extension만/Application Extension만) → `false`, 애니메이션 GIF 3종(단순/Global Color Table
  포함/두 번째 프레임 앞의 GCE) → `true`, 방어적 케이스 11종(PNG 시그니처·6바이트 미만·LSD 잘림·
  Extension Introducer 직후 잘림·ArrayBuffer 입력·상수 sanity·알 수 없는 블록 도입자·Image
  Descriptor 자체 잘림·LZW 바이트 앞 잘림·이미지 데이터 서브블록 조기 잘림·`GIF_SCAN_BYTE_LIMIT`
  스캔 상한의 실제 차단 동작) + `isGifFile` 4종 + `gifBytesFromDataUrl`/`isAnimatedGifDataUrl`
  6종 = 총 28개, 전부 통과.

### 1.2 왜 이런 스코프인가 (반복하지 않을 결정 근거)

GIF는 여러 프레임을 담은 바이너리 포맷이라 완전한 디코딩(팔레트 합성 → `ImageData` 프레임 배열)은
상당한 스코프고, 이 배치는 새 npm 의존성 추가가 금지돼 있어 `gifuct-js` 같은 라이브러리도 쓸 수
없다. 하지만 브라우저의 `<img src="data:image/gif...">` 자체가 이미 GIF 애니메이션을 네이티브로
재생하므로, 이 앱이 만들 것은 "지금 이 이미지가 애니메이션 GIF다"라는 판정 하나와, 그 판정에 따라
Konva 캔버스를 주기적으로 다시 그리는 루프 하나뿐이다 — 나머지(디코딩·프레임 타이밍·루프 재생)는
전부 브라우저 엔진이 대신한다.

---

## 2. `StudioPage.tsx` 통합 지점 (실제 수정은 후속 패스가 수행)

### 2.1 import 추가 (1곳)

알파벳 순서상 `./studio-frame-animation`(라인 178-189, 셀 애니메이션 시스템 — 공교롭게도
개념적으로 가장 가까운 이웃)과 `./studio-gradient-engine`(라인 190-195) **사이**, 즉 라인 189
(`} from "./studio-frame-animation";`) 바로 뒤에 삽입:

```tsx
import { isAnimatedGifDataUrl, isGifFile } from "./studio-gif-element";
```

(`GifFileLike`/`gifBytesFromDataUrl`/`GIF_SCAN_BYTE_LIMIT`는 StudioPage가 직접 쓸 일이 없다 —
실제 `File` 객체를 그대로 `isGifFile`에 넘기면 구조적 타이핑으로 충분하고, 바이트↔dataURL 변환은
`isAnimatedGifDataUrl` 안에서만 필요하다.)

### 2.2 `ImageEl` 타입 확장 — `frames`와는 다른 축(중요)

`ImageEl` 인터페이스(라인 812부터 시작)의 마지막 필드 `activeFrameId?: string;`(라인 886) 바로
뒤, 인터페이스를 닫는 `}`(라인 887) 바로 앞에 추가:

```tsx
  // 애니메이션 GIF 업로드 — 있으면 src 자체가 data:image/gif인 다중 프레임 GIF이고, 브라우저가
  // <img> 소스를 내부적으로 계속 재생한다(디코딩은 이 앱이 하지 않는다 — studio-gif-element.ts
  // 참고). 위 frames(셀 애니메이션)와는 서로 다른 축이다: frames는 이 앱이 여러 장의 정적 src를
  // 프레임으로 넘겨가며 재생하는 것이고, isAnimatedGif는 단일 src 하나를 브라우저가 자체
  // 재생하는 것 — 실질적으로 상호배타적으로 취급한다(§2.5 UrlImage 리렌더 루프의 가드 참고).
  isAnimatedGif?: boolean;
```

**주의**: 이 필드는 `El` 교차 타입(라인 1047, `name?`/`hidden?`/`locked?`/`maskSrc?` 등 모든
요소 타입에 공통인 필드 모음)이 아니라 **`ImageEl` 자체**에 추가한다 — GIF는 항상
`type: "image"` 요소로만 존재하므로 텍스트/말풍선/스티커 등 다른 타입에는 의미가 없는 필드다.

이 필드는 El이 이미 따르는 관례(옵셔널 필드는 생성/패치/저장/실행취소 등 범용 경로를 전부
그대로 통과한다 — `{...el, ...patch}` 스프레드, `JSON.stringify` 직렬화, `patchEl`이 이미
El을 불투명한 데이터로 다룬다)를 그대로 따르므로, 아래 §2.3~§2.5 외에는 추가로 손댈 곳이 없다.

### 2.3 GIF 전용 파일 로더 — `downscaleImageFile` 옆에 신규 함수 추가

`downscaleImageFile`(라인 2063-2084, **이 함수 자체는 수정하지 않는다** — 일반 이미지 경로는
그대로 유지) 바로 뒤, `downscaleDataUrl`(라인 2086) 바로 앞에 두 함수를 추가:

```tsx
// GIF 파일 전용 읽기 — downscaleImageFile과 달리 캔버스에 그려 재인코딩하지 않는다(애니메이션
// GIF를 캔버스에 한 번 그리면 그 순간의 프레임 하나만 캡처되어 애니메이션이 사라진다).
function readGifFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("GIF 파일을 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

// 이미지 업로드 통합 진입점 — GIF가 아니면 기존 downscaleImageFile 그대로, GIF인데 정적(GCE
// 없음)이어도 손실이 없으므로 마찬가지로 downscaleImageFile(용량 최적화 혜택을 그대로 받는다).
// 진짜 애니메이션 GIF일 때만 캔버스 왕복 없이 원본 바이트를 그대로 보존한다(§5-4의 용량 트레이드
// 오프 참고). onPickImage(§2.4)가 우선 사용하고, onWrapDrop/paste/onUploadAsset(§2.4 각주)도
// 같은 함수로 교체하면 네 진입점 전부가 일관되게 동작한다.
async function loadImageFileForCanvas(
  file: File
): Promise<{ src: string; width: number; height: number; isAnimatedGif: boolean }> {
  if (!isGifFile(file)) {
    const r = await downscaleImageFile(file);
    return { ...r, isAnimatedGif: false };
  }
  const rawDataUrl = await readGifFileAsDataUrl(file);
  if (!isAnimatedGifDataUrl(rawDataUrl)) {
    // 정적 GIF(애니메이션 없음) — 잃을 게 없으므로 기존 최적화 경로로 되돌아간다.
    const r = await downscaleImageFile(file);
    return { ...r, isAnimatedGif: false };
  }
  // 진짜 애니메이션 GIF — 원본 바이트를 그대로 src로 사용(재생 보존이 용량 최적화보다 우선).
  const { naturalWidth, naturalHeight } = await new Promise<{ naturalWidth: number; naturalHeight: number }>(
    (resolve, reject) => {
      const img = new globalThis.Image();
      img.onload = () =>
        resolve({ naturalWidth: img.naturalWidth || img.width, naturalHeight: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error("GIF 크기를 확인하지 못했습니다."));
      img.src = rawDataUrl;
    }
  );
  return { src: rawDataUrl, width: naturalWidth, height: naturalHeight, isAnimatedGif: true };
}
```

이 함수 하나가 "GIF 감지 → (정적이면 기존 경로 / 애니메이션이면 원본 보존)"이라는 분기를
캡슐화한다 — 아래 §2.4의 `onPickImage`가 이 함수를 호출하는 유일한 필수 통합 지점이고, 나머지
3개 업로드 경로(§2.4 각주)는 같은 함수로 갈아 끼우기만 하면 되는 선택적 확장이다.

### 2.4 `onPickImage` 통합 (주 대상, 라인 6380-6401)

**Before**(현재):

```tsx
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { src, width, height } = await downscaleImageFile(file);
      const fit = Math.min(1, (CANVAS_W - 80) / width);
      setError(null);
      addEl({
        id: uid(),
        type: "image",
        src,
        x: (CANVAS_W - width * fit) / 2,
        y: 80,
        width: Math.round(width * fit),
        height: Math.round(height * fit),
        rotation: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 추가 실패");
    }
  }
```

**After**:

```tsx
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { src, width, height, isAnimatedGif } = await loadImageFileForCanvas(file);
      const fit = Math.min(1, (CANVAS_W - 80) / width);
      setError(null);
      addEl({
        id: uid(),
        type: "image",
        src,
        x: (CANVAS_W - width * fit) / 2,
        y: 80,
        width: Math.round(width * fit),
        height: Math.round(height * fit),
        rotation: 0,
        ...(isAnimatedGif ? { isAnimatedGif: true } : {}), // studio-skew.ts와 동일한 관례: 항등값(false)은 저장하지 않는다.
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 추가 실패");
    }
  }
```

diff는 딱 두 줄이다: `downscaleImageFile(file)` → `loadImageFileForCanvas(file)`(그리고 구조
분해에 `isAnimatedGif` 추가), `addEl({...})`에 조건부 필드 한 줄 추가.

**각주 — 같은 패턴이 적용 가능한 나머지 3개 업로드 경로(선택적 확장, 이 배치의 필수 범위 밖)**:
이 문서의 원 지시는 "이미지 업로드 시 gif 감지 지점" 단수형이라 위 `onPickImage`를 주 대상으로
전부 상세 설계했다. 하지만 `downscaleImageFile`을 직접 호출하는 곳이 이 저장소에 3곳 더 있다 —
완전한 기능 동등성을 원한다면 이들도 같은 함수로 교체해야 한다(그러지 않으면 이 3개 경로로 올린
GIF는 여전히 정적 webp로 굳는다):

- `onWrapDrop`(라인 3677-3710) — 캔버스에 파일을 끌어다 놓기. 라인 3704의
  `downscaleImageFile(imageFile)`을 `loadImageFileForCanvas(imageFile)`로 교체하고,
  `placeAt(src, width, height)` 헬퍼(라인 3690-3699)도 `isAnimatedGif` 인자를 받아
  `addEl({...})`에 조건부로 반영하도록 확장.
- 클립보드 붙여넣기(⌘V, 라인 5887-5895) — 라인 5889의 `downscaleImageFile(file)` 교체 후
  `addRenderedImage(src, width, height)`(라인 5275-5287, `createCanvasImageElement` 호출)도
  `isAnimatedGif`를 받아 넘기도록 확장 필요.
- `onUploadAsset`(라인 4551-4564, "내 에셋" 라이브러리 업로드) — 라인 4555 교체 후, 저장 대상인
  `StudioAsset`(`studio-asset-library.ts`)도 `isAnimatedGif?: boolean` 필드를 추가해야 에셋
  라이브러리에서 다시 캔버스에 놓을 때(그 배치 경로도 결국 `createCanvasImageElement`를 거친다)
  플래그가 살아남는다 — 이건 `studio-asset-library.ts`라는 별도 기존 파일을 건드려야 하므로 이
  설계 문서의 1차 스코프보다 한 단계 더 넓은 확장이다.

세 곳 모두 "같은 패턴을 반복 적용"이라 별도로 상세 설계하지 않았다 — 후속 패스가 필요성을 판단할
선택 사항으로 남긴다.

### 2.5 `UrlImage` 컴포넌트 통합 (라인 2414-2540) — 이 배치의 핵심

세 가지를 이 컴포넌트 안에서 처리한다: (a) 플립-굽기 우회, (b) 필터 캐시 가드, (c) 신규 주기적
리렌더 루프. 셋 다 기존 함수 시그니처·props는 전혀 바꾸지 않는다(`el: ImageEl`에 새 옵셔널
필드가 하나 생겼을 뿐이므로 호출부 무변경).

#### (a) 플립-굽기 우회 — 라인 2444-2469의 `useEffect`

**현재 동작**: `el.flipped`/`el.flippedY`가 있으면 `img`(브라우저가 계속 재생 중인 라이브
`HTMLImageElement`)를 한 번 캔버스에 그려 좌우/상하 반전된 **정적** 캔버스를 만들고, 그 결과를
`displayImg`로 쓴다. 이 캔버스는 그리는 순간의 프레임 한 장을 고정 픽셀로 캡처한 것이라, GIF에
이 경로를 그대로 태우면 **반전은 되지만 애니메이션이 영구히 멈춘다**(그 순간의 프레임에).

**변경**: 애니메이션 GIF는 이 굽기 경로를 건너뛰고 항상 라이브 `img`를 그대로 `displayImg`로
쓴다 — 즉 **v1에서는 애니메이션 GIF 요소에 좌우/상하 반전이 적용되지 않는다**(§5-2에 명시).
기존 useEffect 맨 앞에 한 줄만 추가:

```tsx
  useEffect(() => {
    if (!img) {
      setDisplayImg(undefined);
      return;
    }
    if (el.isAnimatedGif) {
      // 반전은 캔버스에 한 프레임을 구워야만 가능한데, 그러면 애니메이션이 멈춘다 — 재생 보존이
      // 우선이므로 이 경로를 건너뛰고 항상 라이브 img를 그대로 쓴다(§5-2, 알려진 한계).
      setDisplayImg(img);
      return;
    }
    const scaleX = el.flipped ? -1 : 1;
    const scaleY = el.flippedY ? -1 : 1;
    // ...(이하 기존 로직 그대로, 변경 없음)
```

#### (b) 필터 캐시 가드 — 라인 2498-2509의 `useEffect`

**현재 동작**: 이미지에 필터(흐림/그레이스케일/세피아/보정 등, `hasActiveImageFilters`)가
하나라도 켜져 있으면 `node.cache(...)`로 Konva 노드를 오프스크린 비트맵으로 캐시한다. **Konva는
필터를 캐시된 노드에만 적용하므로**(캐시 없이는 `filters` prop 자체가 아무 효과가 없다), 이건
불가피한 요구사항이다. 문제는 캐시가 "그 순간의 픽셀 스냅샷"을 굳힌다는 것 — 필터가 걸린 GIF
요소는 캐시된 순간의 프레임에 멈춘 채로 반복 그려진다(§2.5-(c)의 리렌더 루프가 `batchDraw()`를
아무리 호출해도, Konva는 그 정적 캐시 비트맵만 다시 그릴 뿐 `img`의 최신 프레임을 다시 샘플링하지
않는다).

**변경**: `isAnimatedGif`면 캐시를 아예 만들지 않는다 — 결과적으로 **v1에서는 필터가 설정된
애니메이션 GIF 요소는 필터가 조용히 적용되지 않는다**(멈추는 것보다 덜 혼란스러운 실패 모드로
판단, §5-3에 명시). 조건식에 한 항목만 추가:

```tsx
      if (hasFilters && filterModule && !el.isAnimatedGif) {
        node.cache(cachePad > 0 ? { offset: cachePad } : undefined);
      }
```

#### (c) 신규 — 주기적 리렌더 루프

라인 2509(`}, [displayImg, el.width, el.height, filterCacheKey, hasFilters, filterModule,
cachePad]);`, 필터 캐시 effect가 끝나는 지점) 바로 뒤, 라인 2511(`if (!displayImg) return
null;`) 바로 앞에 새 `useEffect`를 추가한다.

**기존 관례를 그대로 따른다** — `grep "requestAnimationFrame" StudioPage.tsx`로 찾은 기존
사례 중 가장 가까운 것은 `StudioSelectionAntsOverlay`(라인 2195-2219, "마칭앤츠" 점선 오버레이)와
`timelinePlaying` 재생 루프(라인 3296-3316)다. 다만 이 둘은 **React 상태(`setElapsedMs`/
`setTimelinePreviewFrame`)를 갱신해 리렌더를 유도**하는 반면, 여기서는 React를 완전히 우회해
Konva 노드를 직접 다시 그리기만 하면 된다 — 이건 오히려 `updateHealCloneCursorNodes`류(heal-clone
커서, "ref를 직접 갱신해 리렌더 없이 따라오게 한다")와 같은 부류의 "명령형 Konva 갱신" 패턴에
더 가깝다. 따라서 **rAF 루프 자체의 lifecycle(마운트 시 시작·언마운트/의존성 변경 시
`cancelAnimationFrame`으로 정지)은 두 기존 루프와 동일하게 따르되, 내부에서 하는 일은
React state가 아니라 `node.getLayer()?.batchDraw()` 직접 호출**이라는 점만 다르다:

```tsx
  // 애니메이션 GIF 주기적 리렌더 — 브라우저가 img(HTMLImageElement)를 내부적으로 계속
  // 디코딩·재생하지만(studio-gif-element.ts 헤더 참고), Konva는 그리기 시점의 스냅샷만 캔버스에
  // 굽는다. displayImg가 라이브 img 그 자체를 가리키는 동안(§2.5-(a): 플립 없음, 또는
  // isAnimatedGif라 플립 우회) 주기적으로 getLayer().batchDraw()를 호출해 "그 순간 브라우저가
  // 디코딩해 둔 프레임"을 다시 그리게 한다.
  // el.frames(다중 프레임 셀 애니메이션, §2.2)와는 상호배타적으로 취급한다 — 온스킨/타임라인
  // 재생 미리보기가 이미 같은 KImage 노드를 건드리는 상황과 겹치면 정의되지 않은 방식으로
  // 충돌하므로, frames가 실질적으로 여러 장(2장 이상)이면 이 루프를 아예 돌리지 않는다(그 경우
  // frames 쪽 렌더링이 이 요소를 담당 — StudioPage 라인 10134의 isAnimTarget과 동일한 조건식).
  useEffect(() => {
    if (!el.isAnimatedGif || !displayImg) return;
    if (el.frames && el.frames.length > 1) return;
    const node = imageRef.current;
    if (!node) return;
    // ≈12fps 스로틀 — 대다수 GIF 인코더의 실제 프레임 속도 근방이라 시각적으로 놓치는 프레임이
    // 사실상 없으면서, 60fps rAF 그대로 부르는 것 대비 풀 레이어 batchDraw 호출을 약 80% 줄인다
    // (§5-5, 이 KImage가 속한 Layer는 페이지의 모든 요소를 함께 담는 단일 메인 레이어라 배치
    // 하나당 비용이 작지 않다).
    const FRAME_INTERVAL_MS = 80;
    let raf = 0;
    let lastDrawAt = 0;
    const tick = (now: number) => {
      if (now - lastDrawAt >= FRAME_INTERVAL_MS) {
        lastDrawAt = now;
        node.getLayer()?.batchDraw();
      }
      raf = globalThis.requestAnimationFrame(tick);
    };
    raf = globalThis.requestAnimationFrame(tick);
    return () => globalThis.cancelAnimationFrame(raf);
  }, [el.isAnimatedGif, el.frames, displayImg]);
```

`displayImg`를 의존성에 넣는 이유: 마운트 직후(이미지 로드 전) `displayImg`는 `undefined`라
`imageRef.current`도 아직 `null`이다(컴포넌트가 `if (!displayImg) return null;`로 아무것도
렌더하지 않으므로) — 이미지 로드가 끝나 `displayImg`가 채워지고 나서야 `<KImage ref=.../>`가
실제로 마운트되어 `imageRef.current`가 채워진다. 이 effect가 `displayImg` 변경에 반응해 다시
실행돼야 그 시점에 `imageRef.current`를 정확히 붙잡을 수 있다 — 기존 필터 캐시 effect(§2.5-b)가
`displayImg`를 의존성에 넣는 것과 정확히 같은 이유다.

React Compiler(AGENTS.md) 관련: 이 useEffect는 항상 무조건 호출되고(Rules of React 위반 없음),
내부 로직만 조건에 따라 조기 반환한다 — 같은 컴포넌트의 다른 effect들(예: 플립-굽기 effect의
`if (!img) { ...; return; }`)과 동일한 형태라 새로운 패턴이 아니다.

---

## 3. 통합 체크리스트 (후속 패스용)

- [ ] import 1곳(§2.1)
- [ ] `ImageEl.isAnimatedGif?: boolean` 필드 추가(§2.2) — `El` 교차 타입이 아니라 `ImageEl`
      자체에
- [ ] `readGifFileAsDataUrl`/`loadImageFileForCanvas` 신규 함수 2개(§2.3) —
      `downscaleImageFile` 자체는 무수정
- [ ] `onPickImage` 교체(§2.4) — diff 2줄
- [ ] `UrlImage`: 플립-굽기 effect에 `isAnimatedGif` 조기 반환 1줄(§2.5-a)
- [ ] `UrlImage`: 필터 캐시 조건에 `&& !el.isAnimatedGif` 1항목(§2.5-b)
- [ ] `UrlImage`: 신규 주기적 리렌더 `useEffect` 추가(§2.5-c) — **이 배치의 핵심 기능**
- [ ] (선택, 완전 동등성 원하면) `onWrapDrop`/paste/`onUploadAsset` 3곳도 `loadImageFileForCanvas`로
      교체(§2.4 각주) — `onUploadAsset`은 `studio-asset-library.ts`의 `StudioAsset` 타입 확장도
      필요
- [ ] 수동 QA: 애니메이션 GIF 업로드(예: 짧은 반복 루프 GIF) → 캔버스에서 실제로 여러 프레임에
      걸쳐 재생되는지 육안 확인(§5-6, detached `HTMLImageElement` 애니메이션 진행은 브라우저마다
      미세하게 다를 수 있어 실제 확인이 중요 — 만약 첫 프레임에 멈춰 있다면 §5-6의 대응 방법
      참고) → 정적 GIF(애니메이션 없는 GIF, 예: 단일 프레임으로 저장된 파일) 업로드 시 여전히
      기존 webp 다운스케일 경로를 타는지(파일 크기가 원본보다 작아지는지로 간접 확인) → GIF
      요소를 좌우 반전해도 애니메이션이 유지되는지(반전 자체는 적용 안 됨이 정상, §5-2) → GIF
      요소에 흐림 필터를 걸어도 앱이 크래시하지 않는지(필터 미적용이 정상, §5-3) → 페이지를 PNG로
      내보내면 그 순간의 프레임 한 장만 캡처되는지(§5-1) → GIF 요소를 몇 개 더 추가해도 캔버스
      조작(드래그/줌/다른 요소 편집)이 눈에 띄게 끊기지 않는지(§5-5 성능 여유 확인)

---

## 4. 기존 애니메이션 시스템(셀 애니메이션/타임라인)과의 관계

이 저장소엔 이미 이미지 하나를 "시간에 따라 변하는 것"으로 다루는 시스템이 둘 있다 —
`el.frames`(셀 애니메이션, 온스킨 미리보기 포함)와 다중 레이어 타임라인(`animTimeline`,
`timelinePlaying`이면 `timelinePreviewFrame`에 따라 `el.src`를 override). `isAnimatedGif`는
이 둘과 **개념적으로 다른 층**에 있다 — 앞의 둘은 "이 앱이 여러 장의 정적 이미지를 프레임으로
넘겨가며 재생"하는 것이고, `isAnimatedGif`는 "이미지 하나(GIF 컨테이너)를 브라우저가 자체
재생"하는 것이다.

StudioPage 라인 10133-10159의 렌더 분기(`if (el.type === "image") { ... }`)를 보면
`isAnimTarget`(온스킨)과 `timelineOverride`(타임라인 재생)가 이미 `el.effectiveEl`이라는 하나의
`ImageEl`을 만들어 `<UrlImage el={effectiveEl} .../>`에 넘긴다 — `isAnimatedGif` 플래그는 이
`effectiveEl`을 통해 자연스럽게 전달되므로 이 렌더 분기 자체는 손댈 필요가 없다. 다만
§2.5-(c)의 리렌더 루프는 `el.frames && el.frames.length > 1`(2장 이상의 셀 애니메이션으로 쓰이고
있는 경우)이면 스스로 멈춘다 — 온스킨/타임라인 미리보기가 이미 같은 요소를 자신들의 방식대로
다시 그리는 중일 때 GIF 리렌더 루프가 끼어들어 정의되지 않은 방식으로 충돌하는 것을 막기 위한
방어적 가드다(puppet-warp 설계 문서의 "온스킨/타임라인 상호배제" 원칙과 동일).

실무적으로는 "업로드한 GIF에 셀 애니메이션 프레임을 추가로 얹는" 조합은 아주 드문 사용 패턴이라
(둘 다 "시간에 따라 변한다"는 같은 목적을 다른 방식으로 이미 달성하므로), 이 가드가 실제로
발동하는 경우는 거의 없을 것으로 예상한다.

---

## 5. 스케치 대비 편차 · 알려진 한계 (필수 명시 섹션)

1. **GCE 존재 여부는 "애니메이션"의 완벽한 형식적 정의가 아니다.** 이론적으로는 GCE 없이도 여러
   Image Descriptor를 나열해 애니메이션을 만들 수 있고(각 프레임이 기본 지연시간 0으로 재생),
   반대로 단일 프레임 GIF도 투명색 지정을 위해 GCE 하나를 가질 수 있다(이 경우는 뒤이어 Image
   Descriptor가 하나뿐이라도 이 구현은 "GCE가 있다"는 이유만으로 애니메이션으로 오판정한다 —
   실무에서는 이런 "GCE 있지만 프레임 1장"인 GIF가 드물어서, 설령 오판정되어도 결과는 그저
   "정적 이미지에 불필요한 리렌더 루프가 돈다"는 무해한 낭비일 뿐이다). 완전한 판정은 Image
   Descriptor 개수를 실제로 세야 하는데, 그러려면 각 프레임의 로컬 컬러테이블·이미지 데이터
   서브블록까지 정확히 다 건너뛰어야 해서 지금 구현과 사실상 같은 비용이라 이득이 적다 — 스펙상
   GCE는 89a 전용이고 실사용 인코더가 프레임 지연을 위해 항상 넣는다는 점에서, "GCE 존재"를
   "애니메이션"의 대리 신호로 쓰는 것은 실용적으로 충분히 정확하다고 판단해 확정했다.

2. **애니메이션 GIF 요소는 좌우/상하 반전(flip)이 적용되지 않는다.** 반전은 캔버스에 한 프레임을
   구워야만 가능한데, 그러면 애니메이션이 그 순간에 멈춘다(§2.5-a). `flipped`/`flippedY` 필드
   자체는 여전히 저장/토글할 수 있지만(패널 UI를 막지 않는다 — 이 배치는 패널 쪽을 손대지
   않는다), 애니메이션 GIF 요소에서는 시각적으로 아무 효과가 없다. 완전한 해결(Konva 노드
   레벨에서 `scaleX`/`scaleY`+`offsetX`로 반전해 라이브 img를 그대로 유지하는 방식)은 기술적으로
   가능하지만, 이는 일반(비-GIF) 이미지의 반전 처리 방식 자체를 건드리지 않고 GIF 전용 분기를
   추가하는 형태가 되어 `UrlImage`에 두 가지 서로 다른 반전 기법이 공존하게 된다 — 이 배치의
   "새 필드 하나 + 최소 분기"라는 스코프를 넘어서므로 후속 패스로 미룬다. 필요해지면 이 문서의
   접근(§2.5-a)을 그 방식으로 교체하면 된다.

3. **필터(흐림/그레이스케일/보정 등)가 설정된 애니메이션 GIF는 필터가 조용히 적용되지 않는다.**
   Konva는 캐시된 노드에만 필터를 적용하는데, 캐시는 "그 순간의 정적 스냅샷"이라 애니메이션과
   상충한다(§2.5-b). 두 실패 모드(a. 캐시를 만들어 필터는 보이지만 애니메이션이 멈춘다 / b.
   캐시를 안 만들어 애니메이션은 유지되지만 필터가 안 보인다) 중 이 설계는 b를 택했다 — "GIF를
   업로드하는 목적 자체가 움직임을 보존하는 것"이라는 이 기능의 핵심 의도에 더 부합한다고
   판단했기 때문이다. 후속 개선으로 필터/보정 패널이 `el.isAnimatedGif`일 때 필터 컨트롤을
   비활성화(또는 "필터는 애니메이션에는 적용되지 않아요" 안내)하는 UX 보완을 고려할 수 있으나,
   이 배치는 패널 쪽을 손대지 않으므로 범위 밖으로 남긴다.

4. **레이어 마스크(`maskSrc`)가 걸린 애니메이션 GIF도 3번과 동일한 이유로 멈출 수 있다 —
   기존 컴포넌트(`ClipMaskGroup.tsx`)의 사전 동작이며, 이 배치가 만든 문제가 아니다.**
   `ClipMaskGroup`(합성 격리를 위해 자식을 통째로 `node.cache()`하는 범용 컴포넌트,
   `ClipMaskGroup.tsx` 라인 41-65)은 `cacheKey`가 바뀔 때만 재캐시한다. StudioPage가 이미지
   마스크·`clipBelow` 알파 클리핑에 쓰는 캐시 키(라인 10817의 `mck`, 라인 10827-10839의 `ck`)는
   `el.id`/`maskSrc`/바운즈/회전으로만 구성되고 애니메이션 진행 상태를 반영하지 않으므로, GIF가
   재생되는 동안 캐시 키가 그대로 유지돼 마스크가 적용된 합성 결과가 캐시된 순간에 고정된다 —
   이 캐시는 `ImageEl`이 이미지 마스크·`clipBelow`를 쓸 때 항상 존재해 온 기존 메커니즘이고,
   애니메이션 GIF가 그 위에 새로 얹히면서 처음으로 드러나는 상호작용일 뿐이다. `ClipMaskGroup`에
   `isAnimatedGif`일 때만 주기적으로 재캐시하는 옵션을 추가하는 것도 이론적으로 가능하지만,
   그 컴포넌트는 이미지 외에도 쓰이는 범용 컴포넌트라 이 배치의 "새 필드 + 최소 분기" 스코프
   밖으로 명시적으로 뺐다 — 마스크 없는 애니메이션 GIF(가장 흔한 사용 패턴)는 이 문제와
   무관하다.

5. **여러 애니메이션 GIF가 동시에 캔버스에 있으면 각자 독립된 타이머로 `batchDraw()`를
   호출한다.** `UrlImage`는 요소마다 별도 컴포넌트 인스턴스이므로, GIF 요소가 N개면 독립적으로
   80ms 간격을 재는 타이머가 N개 생긴다. Konva의 `Layer.batchDraw()`는 같은 애니메이션 프레임
   안의 중복 호출을 자체적으로 합치지만(내부적으로 다음 프레임에 딱 한 번만 실제로 그린다),
   N개의 독립 타이머가 서로 다른 rAF 틱에 걸리도록 시간이 어긋나면 초당 실제 전체 레이어 재그리기
   횟수가 늘어날 수 있다(최악의 경우 N×12/sec에 근접). 이 KImage 노드들은 페이지의 모든 요소를
   함께 담는 단일 메인 콘텐츠 `<Layer>`(라인 10024) 안에 있으므로, `batchDraw()` 한 번이 그
   페이지의 텍스트·말풍선·다른 이미지까지 전부 다시 그린다는 뜻이다 — 그래서 80ms(≈12fps)로
   스로틀했다(60fps로 그대로 rAF마다 부르는 것 대비 약 80% 감소). 페이지 하나에 GIF가 아주 많이
   (수십 개) 배치되는 극단적 케이스가 아니라면 실무적으로 체감되는 문제는 아닐 것으로 판단했다 —
   필요해지면 모듈 스코프의 싱글턴 스케줄러(레이어당 타이머 하나만 유지하고 모든 GIF 인스턴스가
   구독)로 통합하는 후속 최적화가 가능하다(v1 스코프 밖).

6. **detached `HTMLImageElement`가 실제로 계속 애니메이션을 진행하는지는 이 배치에서 실제 브라우저로
   검증하지 못했다(설계 문서 작성 세션이라 StudioPage.tsx를 실행할 수 없었다) — 통합 후 반드시
   수동 QA할 것(§3 체크리스트).** `UrlImage`의 기존 로딩 effect(라인 2434-2442)는
   `new globalThis.Image()`로 만든 `<img>`를 문서(DOM)에 **붙이지 않고** 순수 JS 참조로만 들고
   있다가 `ctx.drawImage()`(Konva 내부)로 캔버스에 그리는 용도로만 쓴다. 정적 이미지는 이래도
   전혀 문제없지만, 애니메이션 GIF의 경우 "문서에 붙어 있지 않은 `<img>`가 계속 프레임을
   진행하는가"는 브라우저 엔진마다 미묘하게 다를 수 있는 영역이다(널리 쓰이는 패턴이라고
   알려져 있지만 100% 보증되지는 않는다). **만약 통합 후 QA에서 GIF가 첫 프레임에 멈춰 있는
   것이 관찰되면**, `UrlImage`의 로딩 effect를 `el.isAnimatedGif`일 때만 그 `<img>`를
   `document.body`에 화면 밖 절대좌표로(`position: fixed; left: -99999px; top: -99999px; width:
   1px; height: 1px; overflow: hidden` 등, `display:none`은 일부 엔진에서 디코딩 자체를 멈출 수
   있어 피할 것) 붙였다가 언마운트 시 제거하는 방어 코드를 추가하는 것으로 거의 항상 해결된다 —
   이 경우가 아니면 이 추가 DOM 조작은 불필요한 복잡도이므로, 먼저 붙이지 않는 단순한 버전(현재
   설계)으로 QA해 보고 필요할 때만 추가하길 권장한다.

7. **다운로드/내보내기는 항상 첫 프레임(또는 캡처 시점의 프레임)만 캡처된다.** `stage.toDataURL
   (...)` 기반의 내보내기/저장/공유 경로(예: 라인 4974·5015·7795)는 Konva 캔버스를 그 순간
   동기적으로 스냅샷하므로, 애니메이션 GIF 요소가 있어도 PNG(및 PSD/SVG 내보내기 — 둘 다 결국
   `el.src` 하나만 읽는 경로라 별도 대응 없이 동일하게 동작한다) 결과물엔 그 순간 브라우저가
   그리고 있던 프레임 한 장만 고정되어 담긴다. GIF 자체를 다시 GIF로(또는 여러 프레임을 유지한
   포맷으로) 내보내는 기능은 이 배치의 스코프 밖이다(원 지시에도 명시됨) — 사용자가 "움직이는
   결과물"을 원한다면 이 앱이 이미 가진 셀 애니메이션/타임라인 기능으로 직접 프레임을 구성하는
   것이 현재 유일한 경로다.

8. **업로드된 애니메이션 GIF는 이 앱의 통상적인 용량 최적화 파이프라인을 타지 않는다.** 일반
   이미지는 `downscaleImageFile`이 최대 1280px로 축소하고 webp로 재인코딩하지만, 애니메이션
   GIF는(정의상 캔버스 왕복을 할 수 없으므로) 원본 파일 크기 그대로 `src`에 저장된다 — 문서
   저장/실행취소 히스토리에 큰 GIF 파일이 여러 번 복제되어 들어갈 수 있다는 뜻이다. 파일 크기
   상한(예: 5-10MB 초과 시 경고 또는 거부)을 두는 방어적 UX는 이 배치에 포함하지 않았다 — 필요성
   판단과 구현은 후속 패스로 남긴다.

9. **`isGifFile`이 파일 확장자/MIME 중 하나만 보고 관대하게 판정하므로**, 실제로는 GIF가 아닌데
   `.gif` 확장자만 붙은 파일(극히 드문 사용자 실수)은 `readGifFileAsDataUrl`로 원본 그대로
   읽히고, 그 다음 `isAnimatedGifDataUrl`이 GIF 시그니처 자체가 없음을 확인해 `false`를
   반환하므로 `loadImageFileForCanvas`가 정상적으로 `downscaleImageFile` 폴백 경로로 넘어간다 —
   즉 이 경우 최종 결과는 일반 이미지와 동일하게 처리되어 실질적 피해가 없다(1차 관문의 과다
   판정이 2차 관문에서 항상 정확히 걸러진다, §1.1).
