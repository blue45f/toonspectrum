# BG3D 차세대 3D 엔진 승격 — Three WebGPU (2026-08-29)

- 상태: 승격 완료. `three-webgpu`가 production runtime이며, WebGL2가 기준선(fallback)이다.
- 대체하는 결정: [3D 엔진·전문 런타임 확장 검토](./studio-3d-engine-specialist-topology-2026-07-18.md)의
  "Three WebGPU는 격리 lab" 항목과
  [하이브리드 DCC 엔진 아키텍처](./studio-hybrid-dcc-engine-architecture-2026-08-02.md)의
  "기본 제품 renderer라고 표시 금지" 항목.
- 구현 계약: `studio-bg3d-webgpu-capability.ts`, `studio-bg3d-inapp-browser.ts`,
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

| 호스트 | `auto` | 명시 선택 시 | 이유 |
| --- | --- | --- | --- |
| 일반 브라우저 | WebGPU | WebGPU | `auto-webgpu-promoted` |
| 카카오톡·네이버앱·라인·밴드·토스·쿠팡·다음, 일반 WebView | WebGL2 | WebGPU 가능 | `inapp-browser-opt-in-required` |
| 인스타그램·페이스북·스레드 | WebGL2 | 거부 | `inapp-browser-blocked` |
| 데이터 절약 모드 / 4GB 미만 모바일 | WebGL2 | WebGPU 가능 | `save-data-enabled`, `low-device-memory` |
| WebGPU 초기화 2회 연속 실패 | WebGL2 | 거부(세션 한정) | `repeated-webgpu-failure` |
| VRM 캐릭터가 있는 장면 | WebGL2 | 거부 | `webgl-only-vrm-characters` |
| 몰입형(WebXR) 세션 진행 중 | WebGL2 | 거부 | `webgl-only-webxr` |

### WebGL2 전용 기능

두 가지는 **선호가 아니라 렌더 불가**라서 명시 선택도 거부한다.

- **VRM 캐릭터**: VRM/MToon 외형은 `ShaderMaterial`이고 Three의 node material 라이브러리에
  변환이 없다. WebGPU renderer는 셰이더를 빌드하지 못한다. 공유 3D 스테이지 캐릭터가 장면에
  들어오면 정책이 WebGL2를 고른다.
- **WebXR**: 몰입형 세션 브리지가 `WebGLRenderer.xr`을 구동한다.

관측은 **세션 동안 latch**한다. 캐릭터를 지웠다고 엔진을 되돌리면 Canvas를 두 번째로 remount
하게 되고, 캐릭터를 껐다 켤 때마다 뷰포트가 재생성된다.

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

## 남은 작업

- VRM: `@pixiv/three-vrm`은 `three-vrm/nodes` 빌드를 제공한다. 이를 채택하면 VRM 장면도
  WebGPU로 갈 수 있지만, 공유 스테이지 전체의 머티리얼 경로를 바꾸는 별도 작업이다.
- WebXR: Three의 WebGPU XR 경로가 현재 WebGL 세션 브리지와 동등해질 때까지 `three-webgpu`의
  capability 목록에서 제외한다.
- 실기기 GPU 계측(프레임 타임·입력 지연)은 `studio-bg3d-engine-benchmark-contract.ts`의
  런을 실제 단말에서 수집한 뒤 별도로 기록한다. 이번 승격은 정확성 동등성까지만 증명한다.
- capture마다 straight-alpha 출력 quad의 node material을 새로 만든다(WebGL adapter가 매번
  `OutputPass`를 만드는 것과 같은 모양). WebGPU는 파이프라인 생성 비용이 더 크므로 shot batch
  같은 연속 캡처에서 문제가 될 수 있다. 추측으로 캐시를 넣기보다, 실제 batch 지연을 먼저
  측정한 뒤 대상 크기별 target/quad 재사용을 검토한다.
