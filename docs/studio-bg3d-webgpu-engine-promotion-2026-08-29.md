# BG3D 차세대 3D 엔진 승격 — Three WebGPU (2026-08-29)

- 상태: 승격 완료. `three-webgpu`가 production runtime이며, WebGL2가 기준선(fallback)이다.
- 대체하는 결정: [3D 엔진·전문 런타임 확장 검토](./studio-3d-engine-specialist-topology-2026-07-18.md)의
  "Three WebGPU는 격리 lab" 항목과
  [하이브리드 DCC 엔진 아키텍처](./studio-hybrid-dcc-engine-architecture-2026-08-02.md)의
  "기본 제품 renderer라고 표시 금지" 항목.
- 구현 계약: `studio-bg3d-webgpu-capability.ts`, `studio-bg3d-inapp-browser.ts`
  (판별은 `src/compat/in-app-browser.ts` 재사용, 여기서는 GPU 신뢰도만 결정),
  `studio-bg3d-engine-selection.ts`, `studio-bg3d-three-webgpu-entry.ts`
  (→ `-renderer.ts`, `-capture.ts`), `useStudioBg3dEngineRuntime.ts`,
  `StudioBg3dEnginePanel.tsx`.
- 실측 검증: `pnpm run verify:studio-bg3d-webgpu-engine`.

## 결정

BG3D 배경 편집기의 대화형 renderer를 세션마다 정책으로 고른다. Three WebGPU는 더 이상 별도
Canvas의 lab이 아니라 편집 Canvas를 소유할 수 있는 production runtime이고, WebGL2는 항상
도달 가능한 기준선으로 남는다. 어느 backend가 소유하든 **capture 결과는 같아야 하며**, 그
동등성은 실제 브라우저에서 측정한다.

lab을 남겨두고 production 경로를 따로 만들지 않았다. 저장소의 인플레이스 교체 원칙대로
`studio-bg3d-three-webgpu-lab.ts`와 `three-webgpu-lab` runtime id는 제거했다.

## 왜 정책이 필요한가

WebGPU를 "지원되면 쓴다"로 켜면 한국 트래픽의 대부분인 인앱 브라우저에서 깨진다.

1. 인앱 WebView의 GPU 프로세스는 호스트 앱이 소유하고 메모리 압박에서 회수된다. probe가
   성공해도 작업 중간에 device가 사라질 수 있다.
2. 사용자가 devtools를 열거나 렌더러를 바꿀 수 없고, 새로고침하면 호스트 컨텍스트를 잃는다.
3. `navigator.gpu`가 존재해도 embedder가 실제 device를 주지 않는 경우가 있다.

그래서 `studio-bg3d-engine-selection.ts`는 **모르는 것은 WebGL2로 내려간다**를 원칙으로 삼고,
모든 결정에 기계가 읽는 사유와 사용자에게 보여줄 한국어 문장을 함께 붙인다.

호스트 **판별 자체는 새로 만들지 않고** 모바일 셸이 이미 쓰는 `src/compat/in-app-browser.ts`의
`diagnoseStudioInAppBrowser`를 재사용한다. UA 정규식을 두 벌 두면 반드시 어긋나고, 그쪽은
전용 route sweep 게이트로 검증된다. `studio-bg3d-inapp-browser.ts`는 그 판별이 답하지 않는
것 — **이 호스트를 WebGPU 디바이스로 얼마나 믿을 수 있는가** — 만 결정한다. 덕분에 틱톡·위챗
처럼 이 정책이 따로 열거한 적 없는 호스트도 이미 분류된 채로 들어온다.

| 호스트 | `auto` | 명시 선택 시 | 이유 |
| --- | --- | --- | --- |
| 일반 브라우저 | WebGPU | WebGPU | `auto-webgpu-promoted` |
| 카카오톡·네이버·라인·밴드·다음·틱톡·위챗, 일반 WebView | WebGL2 | WebGPU 가능 | `inapp-browser-opt-in-required` |
| 인스타그램·페이스북·스레드 | WebGL2 | 거부 | `inapp-browser-blocked` |
| 데이터 절약 모드 / 4GB 미만 모바일 | WebGL2 | WebGPU 가능 | `save-data-enabled`, `low-device-memory` |
| WebGPU 초기화 2회 연속 실패 | WebGL2 | 거부(세션 한정) | `repeated-webgpu-failure` |
| 몰입형(WebXR) 세션 진행 중 | WebGL2 | 거부 | `webgl-only-webxr` |

### WebGL2 전용 기능

하나는 **선호가 아니라 렌더 불가**라서 명시 선택도 거부한다.

- **WebXR**: 몰입형 세션 브리지가 `WebGLRenderer.xr`을 구동한다. Three의 WebGPU XR 경로가
  이 브리지와 동등해질 때까지 유지한다.

관측은 **세션 동안 latch**한다. 세션을 나갔다고 엔진을 되돌리면 Canvas를 두 번째로 remount
하게 되고, 몰입형을 드나들 때마다 뷰포트가 재생성된다.

### VRM 캐릭터는 이제 WebGPU에서도 그려진다

처음 설계에서 VRM은 두 번째 차단 대상이었다. MToon 외형이 `ShaderMaterial`이라 WebGPU renderer가
셰이더를 빌드하지 못했기 때문이다. **막는 대신 올바른 재질을 로드하도록 바꿨다** — KTX2 때와 같은
판단이다.

`@pixiv/three-vrm`은 같은 명세의 두 구현을 배포한다. `MToonMaterial`(WebGL 전용 `ShaderMaterial`)과
`MToonNodeMaterial`(WebGPU 전용 TSL 노드 포트)이며, **둘 다에서 동작하는 재질은 없다.** 그래서
`StudioBg3dSharedVrmCharacter`가 자신을 그릴 renderer(`useThree`의 `gl`)를 보고 재질을 정한다 —
선호가 아니라 **누가 그리는가**의 문제다. 엔진이 폴백하면 Canvas가 remount되고, 그 remount가 이
컴포넌트를 다시 마운트해 교체된 renderer에 맞는 빌드로 다시 로드한다.

재질 **클래스는 주입한다.** `loadStudioVrmAsset`은 `mtoonMaterialType`을 인자로 받을 뿐 스스로
고르지 않는다. 이 모듈은 VRM 포저와 공유하는 리프이고, 여기서 `@pixiv/three-vrm/nodes`(또는 그것을
re-export하는 승인된 WebGPU entry)를 import하면 **포저의 청크까지 Three의 WebGPU 그래프에 묶인다** —
포저는 그 재질을 영원히 요청하지 않는데도. 그래서 동적 import는 BG3D 쪽
(`studio-bg3d-shared-vrm-runtime.ts`)에만 있다.

두 클래스는 유니폼 이름(`shadeColorFactor`, `outlineColorFactor`, `parametricRimColorFactor`,
`rimLightingMixFactor` …)이 완전히 같고 **브랜드 플래그만 다르다**(`isMToonMaterial` 대
`isMToonNodeMaterial`). 브랜드 하나만 보던 가드는 WebGPU 캐릭터에서 오류 없이 조용히 아무 일도
하지 않는다 — 외곽선·셰이드·림이 안 먹는데 예외는 없고, 그건 LT 선화 추출 결과가 통째로 달라진다는
뜻이다. 판정은 `studio-vrm-mtoon-brand.ts` 한 곳으로 모았다.

`MToonNodeMaterial`은 승인된 WebGPU 지연 entry에서 re-export한다. `@pixiv/three-vrm/nodes`가
`three/webgpu`를 정적으로 import하므로 별도 청크를 주면 Three의 WebGPU 빌드에 두 번째 정적 소유자가
생겨 번들 경계가 깨진다. 실제 비용은 minify 기준 약 12 KiB이고, 정책이 WebGPU를 고른 뒤에만 받는다.

그 결과 승인된 entry의 동적 import 지점이 하나에서 셋(뷰포트·공유 캐릭터·모델 썸네일)으로 늘었다.
번들 검사는 "동적 import가 정확히 하나"를 요구했지만, 그 숫자는 지키려던 성질을 대신 세지 못한다 —
편집기 안의 두 번째 정당한 호출 지점과, 무관한 기능이 두 번째 렌더러 그래프를 통째로 끌어오는 경우가
숫자로는 똑같이 보인다. 그래서 규칙을 **도달 가능성**으로 바꿨다: 승인된 부모에서 한 홉으로 닿아야
하고(워터폴 금지), 모든 직접 동적 import 지점은 그 부모의 그래프 안에 있어야 한다. 정적 소유자 검사는
그대로라 "편집기 없이는 이 그래프를 내려받지 않는다"는 보장은 유지된다.

검증은 실측이다(`verify:studio-bg3d-webgpu-engine`). 번들된 `AliciaSolid.vrm`을 두 backend로 각각
로드해 재질 브랜드와 캡처 커버리지를 함께 본다.

| backend | MToon 재질 | 커버리지 |
| --- | --- | --- |
| WebGPU | `MToonNodeMaterial` 35개, `MToonMaterial` 0개 | 1,874 / 6,144 px |
| WebGL2 | `MToonMaterial` 35개, `MToonNodeMaterial` 0개 | 1,874 / 6,144 px |

커버리지가 같은 값이라는 게 핵심이다. 잘못된 빌드를 고르면 예외 없이 캐릭터만 프레임에서 빠지므로,
"오류가 없었다"가 아니라 **실루엣이 같다**를 게이트로 삼았다.

> **후속 정정.** 실루엣은 같지만 **색은 같지 않다.** 이 게이트는 래스터를 비교하지 않고 덮인
> 픽셀 수만 봤고, 뒤에 같은 harness로 색을 비교해 보니 두 MToon 구현이 표면 전체에서 어긋난다
> (WebGPU가 평균 휘도 5.7% 어둡고, 림 하이라이트는 최대 169/255 차이). 그래서 캐릭터가 있는
> 장면은 다시 baseline으로 고정한다 — 로드가 안 돼서가 아니라 납품 색이 머신마다 달라지기
> 때문이다. 측정과 결정은
> `studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md`.

### 모델 썸네일도 renderer를 가리지 않는다

썸네일 캡처는 편집기의 renderer를 빌려 쓴다. 그 renderer가 WebGPU가 될 수 있게 된 순간
`isWebGLRenderer !== true` 가드는 타입 정제가 아니라 **조용한 회귀**가 됐다 — 호출부가 썸네일 실패를
best-effort로 삼키므로, WebGPU 세션에서 가져온 모델은 오류 없이 영원히 플레이스홀더로 남았다.
두 renderer가 같은 접근자를 제공하므로 상태 펜스를 backend 중립으로 다시 썼고, 캡처 어댑터는
`StudioBg3dCaptureBridge`와 같은 방식으로 renderer의 브랜드를 보고 고른다.

KTX2 압축 텍스처는 처음엔 WebGL2 전용으로 막으려 했으나, `KTX2Loader.detectSupport()`가
`isWebGPURenderer`를 분기해 GPU feature 이름으로 포맷을 고르므로 **막는 대신 우리 쪽 가드를
넓혔다.** 이제 두 backend 모두 압축 텍스처 모델을 연다.

아티스트 선택은 SQLite/OPFS 환경설정에 남고, 뷰 패널의 "3D 렌더 엔진" 카드가 현재 backend,
사유, 선택지, 그리고 **측정된 뷰포트 프레임 시간**을 함께 보여준다. 숫자가 없으면 두 선택지가
모두 그냥 "3D"라고만 말하므로 아티스트가 선택을 검증할 수 없다. 값은 이미 적응형 DPR
governor가 계산하는 smoothed frame time을 0.5초마다 보고한 것이며, warm-up 전과 캡처·몰입형
세션으로 governor가 멈춘 동안에는 오해를 부르지 않도록 표시하지 않는다. WebGPU를 쓸 수 없는 호스트에서도 선택지를 숨기지 않고
비활성 상태로 남겨 이유를 읽을 수 있게 한다.

## Capture 동등성

`three-webgpu`는 `capture-rgba-depth` capability를 주장하므로, 선화/톤 파이프라인과 스튜디오
삽입 흐름이 backend와 무관하게 같은 결과를 받아야 한다. 두 가지가 다르고, 둘 다 처리했다.

1. `WebGPURenderer.readRenderTargetPixelsAsync()`는 호출자 버퍼를 채우지 않고 새 버퍼를
   돌려주며, 행이 256바이트로 정렬돼 있다. adapter가 계약 레이아웃으로 정규화한다.
2. WebGPU는 **출력 타겟에만** tone mapping과 transfer function을 적용한다. capture 타겟은
   linear working space로 남으므로, WebGL adapter가 `OutputPass`에서 얻는
   straight-alpha 복원 → tone map → sRGB 변환을 TSL로 동일하게 수행한다.

깊이는 Three의 `RGBADepthPacking` 바이트 레이아웃을 그대로 쓴다. `MeshDepthMaterial`은
node material 대응물이 없으므로 `packing.glsl.js`의 `packDepthToRGBA`를 TSL로 옮겼고,
두 backend가 하나의 `decodeStudioBg3dThreeRgbaDepth`로 디코딩한다.

### 실측 결과 (headless Chromium, SwiftShader WebGPU)

같은 장면을 두 backend로 캡처해 비교한다.

| 항목 | 불투명 배경 | 투명 배경 |
| --- | --- | --- |
| RGBA 최대 채널 차 | 0 | 205 (알파 0 픽셀의 정의되지 않은 RGB) |
| 알파 최대 차 | 0 | 0 |
| 합성(premultiplied) 최대 차 | 0 | 0 |
| 깊이 최대 차 | 1.8e-7 | 1.8e-7 |

투명 배경의 원시 채널 차 205는 알파가 0인 픽셀에서만 나온다. straight-alpha 계약에서 그
RGB는 정의되지 않으므로, 게이트는 **알파와 합성 결과**가 담당한다. 둘 다 비트 동일하다.

검증 장면에는 capture-excluded 기즈모와 depth-excluded 접지 그림자가 기하 앞에 놓여 있다.
두 pass는 어느 readback도 await하기 전에 모두 제출되므로 제외 객체가 색과 깊이 draw 양쪽에
걸쳐 계속 숨겨진다. 사이에서 되살리면 기즈모가 깊이 raster에 구워져 선화 출력에 기하처럼
나타난다. 위 수치는 이 객체들이 장면에 있는 상태의 결과다.

KTX2 transcoder runtime도 두 renderer 각각에 대해 실제로 초기화해 본다. 넓힌 가드는 실제
`WebGPURenderer`가 `detectSupport()`의 feature 질의에 답할 수 있어야만 의미가 있고, stub은
그걸 증명하지 못한다.

검증 스크립트는 같은 페이지를 카카오톡·네이버앱·인스타그램 user agent로 다시 열어
분류와 정책이 실제 `navigator.userAgent`에서도 의도대로 동작하는지 확인한다.

## 번들 경계

WebGPU 엔진은 승인된 지연 entry 하나(`studio-bg3d-three-webgpu-entry.ts`, 측정 604 KiB raw)에
모여 있고, 정책이 WebGPU를 고를 때만 내려받는다. `three.webgpu`/`three.tsl`을 manualChunks로
이름 붙이는 시도는 되돌렸다: 이들은 leaf가 아니라 `three.core`를 WebGL 빌드와 공유하므로,
이름을 붙이면 rolldown이 그 공유 그래프의 집을 새 청크로 만들어 모든 three 소비자가
897 KiB 청크를 정적으로 끌어오고 BG3D 편집기 활성화가 gzip 68 KiB 늘어났다.

## 승격 직후 잡은 결함 — canvas 아이덴티티가 동적이 되면서 생긴 이음매

`canvasKey` 를 도입해 Canvas 가 세션 중에 remount 될 수 있게 되자, **renderer 아이덴티티나 세션
상태에 걸려 있던 코드가 전부 새로운 의미를 갖게 됐다.** 승격 자체와 달리 이 이음매들은 감사하지
않았고, 넷 다 예외를 던지지 않는다.

### 편집 내용이 사라지던 경로 (가장 심각)

`useStudioBg3dEditorRestoreEffects` 의 초기 장면 복원 effect 는 `modelRenderer` 를 의존성으로
가진다. 승격 전에는 그 아이덴티티가 세션 중에 바뀌지 않았으므로 무해했다. 이제는 엔진 선호
변경·WebGPU 폴백·디바이스 손실 복구가 전부 새 renderer 를 만들고, 그때마다 이 effect 가 다시 돌아
**히스토리를 비우고 모델 캐시를 dispose 하고 모달을 열었던 시점의 장면으로 되돌린다.** 편집 도중
엔진을 바꾼 아티스트는 그동안의 작업을 잃는다.

의존성 자체가 틀린 게 아니다 — KTX2 는 backend 마다 지원 포맷이 달라 transcode 대상이 갈리므로
모델 캐시는 실제로 renderer 에 묶여 있다. 그래서 **무엇을 다시 만드는지**를 갈랐다: 모달 세션과
초기 장면 입력이 그대로인데 renderer 만 새것이면 remount 로 보고, 캐시만 **현재 문서** 기준으로
다시 채운다. 인스턴스는 `modelId` 로 캐시를 조회하므로 같은 키로 다시 채우면 장면 그래프가 다음
렌더에서 새 root 를 집어 간다. 히스토리·프리미티브·문서는 건드리지 않는다.

### 첫 몰입형 시도가 취소되던 경로

WebXR latch 는 `webXrSessionState.status !== "idle"` 에서 파생된다. 그 상태는 `controller.start()`
가 **이미** WebGPU canvas 의 controller 로 네이티브 세션을 요청한 뒤에만 참이 된다. 그러면 latch
가 WebGL2 를 고르고, `canvasKey` 가 바뀌고, 요청 중이던 controller 가 파괴된다.

remount 를 먼저 하고 `start()` 를 부르는 것도 답이 아니다 — 그 사이에 클릭의 user activation 이
사라져 `requestSession` 이 거부된다. 그래서 **시작 자체를 막는다**: WebGPU 가 canvas 를 소유하는
동안 `webXrDisabledReason` 이 "보기 탭에서 WebGL2 를 고른 뒤 다시 시도" 라고 답한다. latch 는 그대로
두되(세션 중 WebGPU 로 바꾸는 것은 여전히 막아야 한다) 이제 remount 를 유발하지 않는다.

### 배너가 실제 결정과 달랐던 것

WebGPU 초기화 실패 배너가 첫 실패부터 "WebGL2 로 전환합니다" 라고 말했다. 한계는 2회이므로 첫
실패 뒤에는 **WebGPU canvas 가 다시 뜨고** 배지도 WebGPU 를 가리킨다. 이제 호출부는 원인만
보고하고, 문장의 결과 부분은 실제로 일어날 결정에서 파생한다.

### 재오픈 중 저장한 선택이 덮이던 것

유지된 편집기를 닫았다 열면 부트스트랩이 다시 도는데 `phase` 가 리셋되지 않아 엔진 버튼이 계속
활성 상태였다. 그 사이 고른 선호를, 먼저 시작돼 있던 `loadPreference()` 가 나중에 돌아와 덮었다.
이제 실제 닫힘→열림 전이에서만 `phase` 를 되돌리고(불안정한 콜백 아이덴티티로 effect 가 재실행될
때는 되돌리지 않는다 — 그러면 ready↔probing 이 무한 진동한다), 명시적 선택마다 올라가는 revision
과 대조해 오래된 복원값은 버린다.

## 남은 작업

- VRM 포저(`StudioVrmPoserViewport`)는 여전히 자체 `WebGLRenderer`를 소유한다. 이번 변경은 BG3D
  공유 스테이지의 캐릭터 경로만 backend를 따라가게 했다. 포저까지 옮기려면 그 뷰포트의 renderer
  수명 자체를 정책 아래로 넣어야 하므로 별도 작업이다. **다만 시급하지는 않다**: 캐릭터가 있는
  장면이 baseline으로 고정되면서 포저(WebGL2)와 출력이 이미 같은 경로가 됐다. 포저 이관은 상류
  MToon이 수렴한 뒤에 다시 볼 문제다.
- WebXR: Three의 WebGPU XR 경로가 현재 WebGL 세션 브리지와 동등해질 때까지 `three-webgpu`의
  capability 목록에서 제외한다.
- 실기기 GPU 계측(프레임 타임·입력 지연)은 `studio-bg3d-engine-benchmark-contract.ts`의
  런을 실제 단말에서 수집한 뒤 별도로 기록한다. 이번 승격은 정확성 동등성까지만 증명한다.
- capture마다 straight-alpha 출력 quad의 node material을 새로 만든다(WebGL adapter가 매번
  `OutputPass`를 만드는 것과 같은 모양). WebGPU는 파이프라인 생성 비용이 더 크므로 shot batch
  같은 연속 캡처에서 문제가 될 수 있다. 추측으로 캐시를 넣기보다, 실제 batch 지연을 먼저
  측정한 뒤 대상 크기별 target/quad 재사용을 검토한다.
