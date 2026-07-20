# Studio 3D 런타임 지연 로딩·WebGPU 단계 도입 벤치마크

작성일: 2026-07-13
대상: `/studio` 초기 정적 JavaScript, 3D 배경 편집기 활성화 경계, WebGPU/Babylon 도입 결정

## 결론

프로덕션 3D 엔진은 **Three.js + React Three Fiber(R3F)를 유지하되 사용 시점에만 로드**한다.
3D 캡처 이미지의 도구·장면 메타데이터는 렌더러 무의존 모듈로 분리했고, 실제 primitive 생성과
`StudioBackground3D`, R3F, Three.js는 3D 배경 조작 의도가 생기기 전까지 Studio 정적 import
폐쇄에 포함되지 않는다.

WebGPU는 즉시 기본 렌더러로 전환하지 않는다. 렌더러와 무관한 비동기 캡처 어댑터와 WebGL 기준
pixel diff를 먼저 구축한 뒤, 대표 장면에서 Three `WebGPURenderer`를 점진적으로 비교한다. Babylon.js는
[기존 격리 번들 ADR](./studio-babylonjs-adoption-evaluation-2026-07-11.md)의 이중 엔진 비용이 해소되지
않았으므로 프로덕션 의존성에 추가하지 않고 lab-only 후보로 유지한다.

## production manifest 실측

동일한 Vite 8 production manifest에서 `StudioPage.tsx`를 루트로 잡고 `imports`만 재귀 순회했다.
`dynamicImports`는 초기 정적 폐쇄에서 제외했으며, 각 방출 JS 파일의 실제 byte와 Node.js gzip 결과를
합산했다.

| 구분 | 직전 배치 | 3D 분리 후 | 변화 | CI 예산 |
| --- | ---: | ---: | ---: | ---: |
| Studio 정적 청크 수 | 125 | **124** | -1 | 정보값 |
| Studio raw | 2,948,329B | **2,224,416B** | -723,913B (-24.6%) | 2,350,000B |
| Studio gzip | 893,614B | **710,284B** | -183,330B (-20.5%) | 750,000B |
| 앱 공통 청크 수 | — | **6** | — | 정보값 |
| 앱 공통 raw | 442,894B | **443,257B** | +363B | 500,000B |
| 앱 공통 gzip | 143,863B | **143,956B** | +93B | 170,000B |

Studio 예산은 새 측정값보다 raw 125,584B(5.6%), gzip 39,716B(5.6%)의 작은 변동 여유를 둔다.
초기 모바일 경로에서 제거한 raw 723,913B와 gzip 183,299B를 일반 기능 증가가 다시 소비하지 못하게
하는 수준이다.

이 수치는 네트워크 캐시, HTTP 압축 헤더, 런타임 파싱 시간, GPU 프레임 시간을 대신하지 않는다.
초기 정적 의존성 회귀를 검출하는 repeatable build 지표이며, 3D 도구를 실제로 열었을 때의 성능은
별도 상호작용 계측 대상으로 남는다.

## 로딩 경계

1. `studio-background-3d-metadata.ts`는 장면 타입, primitive 기본값, 캡처 해시 encode/parse만
   소유하며 Three.js, React, DOM을 import하지 않는다.
2. Studio 셸은 저장된 이미지가 VRM 포저인지 3D 배경인지 판별할 때 이 경량 모듈만 사용한다.
3. `studio-background-3d-loader.ts`의 literal `import("./StudioBackground3D")`는 하나의 promise를
   공유해 hover/focus/click의 중복 요청을 합친다.
4. 3D 배경 버튼의 `pointerenter`, `pointerdown`, `focus`는 best-effort intent preload를 실행한다.
   첫 클릭 지연은 줄이되 사용자가 3D 기능에 접근하지 않으면 런타임을 요청하지 않는다.
5. preload 실패는 삼키고 캐시를 비운다. 이후 명시적 활성화는 다시 import할 수 있으므로 오래된 배포
   청크나 일시적 네트워크 실패가 영구적인 기능 고장으로 고정되지 않는다.

## CI 회귀 가드

`pnpm run check:studio-bundle`은 크기 예산과 함께 Studio 정적 폐쇄에서 다음 식별자가 발견되면
실패한다.

- `studio-background-3d-primitives`
- `StudioBackground3D`
- `react-three-fiber`
- `three.module`

SVG/PSD 엔진과 앱 공통 인트로의 기존 정적 유입 가드도 유지한다. 이름 가드는 작은 청크 재배치로 총
크기가 예산 아래에 남는 경우에도 잘못된 static import를 즉시 설명하고, byte 예산은 이름이 바뀌거나
새 대형 의존성이 유입되는 경우를 함께 막는다.

## WebGPU 단계 도입 결정

Three.js의 공식 [WebGPURenderer 안내](https://threejs.org/manual/en/webgpurenderer)는 WebGPU를 우선
사용하고 필요할 때 WebGL 2로 폴백하는 렌더러, 비동기 초기화와 새 셰이딩 경로를 설명한다. R3F의 공식
[Canvas 문서](https://r3f.docs.pmnd.rs/api/canvas)는 `gl` 팩토리가 promise를 반환할 수 있으며
`WebGPURenderer`를 `await renderer.init()` 뒤 제공하는 구성을 예시한다. 따라서 현재 R3F 씬을 버리고
두 번째 프레임워크를 도입하지 않아도 격리된 WebGPU 실험이 가능하다.

다만 현재 3D 배경의 제품 계약은 단순 화면 표시가 아니라 PNG 캡처, 선화 결과, 장면 해시 round-trip,
undo/redo, 모바일 WebGL fallback까지 포함한다. 다음 순서를 통과하기 전에는 렌더러를 바꾸지 않는다.

1. 캡처 호출을 `Promise` 기반 renderer-independent adapter로 추출한다.
2. 대표 primitive·커스텀 모델·조명 장면의 WebGL 기준 이미지를 만들고 pixel diff 허용치를 고정한다.
3. 같은 문서에서 캡처, 재편집 해시, undo/redo 결과가 렌더러에 관계없이 동일한지 검증한다.
4. 지원 브라우저에서는 Three WebGPU를 비동기 초기화하고, 초기화·장치 손실 실패 시 사용자 데이터
   손실 없이 WebGL로 복구한다.
5. 실기기 frame time, 메모리, 캡처 시간과 활성화 시 다운로드 비용이 기존 WebGL 경로보다 유의하게
   나을 때만 점진 배포한다.

## Babylon.js 경계

Babylon의 공식 [WebGPU 지원 문서](https://doc.babylonjs.com/setup/support/webGPU/)는 비동기 엔진
초기화와 WebGPU 지원 범위를 제공하고, 공식 [ES6 패키지 문서](https://doc.babylonjs.com/setup/frameworkPackages/es6Support)는
모듈 단위 import와 tree-shaking 구성을 안내한다. 엔진 자체의 기능 부족이 보류 이유는 아니다.

현재 저장소의 격리 PoC에서는 Babylon creator WebGL 시작 경로가 1,278,690B raw / 305,625B gzip,
WebGPU-only 시작 경로가 1,127,507B / 270,933B였다. 이미 Three/R3F/VRM 생태계를 유지해야 하는
프로덕션에 이를 병행하면 두 씬 그래프와 렌더러가 공존한다. 그러므로 Babylon은 다음 조건에서만
`/labs` 독립 번들로 재검토한다.

- Babylon 고유 WebGPU/compute 기능이 구체적인 제품 장면에서 필요함
- 기존 Three 경로를 한 하위 시스템 전체에서 제거할 수 있음
- 동일 캡처·round-trip·fallback 계약을 지키면서 ADR의 성능/번들 채택 기준을 통과함

프로덕션 결론은 **Three/R3F on-demand**, WebGPU는 **캡처 어댑터와 pixel diff 이후 단계 도입**,
Babylon은 **lab-only**다.

## 비동기 캡처 경계 구현 완료

3D 런타임 지연 로딩 다음 단계였던 renderer-independent 비동기 캡처 경계를 구현했다.

- `StudioBg3dCaptureAdapter`는 `backend`, `getSourceSize()`, 비동기 `capture()`만 공개한다.
- 요청은 해상도·배경색·알파·깊이 필요 여부를 포함하고, 결과는 정확히 같은 해상도의 top-down
  RGBA8과 선택적인 `[0, 1]` `Float32Array` 깊이로 정규화된다.
- 요청을 불변 snapshot으로 전달하고 검증된 RGBA/depth를 Studio 소유 배열로 방어 복사한다. 향후
  WebGPU mapped buffer나 renderer pool이 재사용돼도 이미 시작한 LT 변환 입력은 바뀌지 않는다.
- 잘못된 크기, 픽셀 예산 초과, RGBA/depth 타입·길이·범위 불일치는 엔진 결과가 LT 단계에
  들어가기 전에 실패한다.
- 현재 Three/WebGL 어댑터는 기존 컬러 출력의 canvas scaling과 `getImageData()` 알고리즘을 보존하면서
  깊이 읽기를 `readRenderTargetPixelsAsync()`로 전환했다.
- 그리드·편집 edge overlay·TransformControls는 모듈 비공개 `WeakSet<Object3D>`에 viewport-only
  identity로 등록하고, 어댑터가 컬러 렌더와 깊이 readback 제출 동안 엔진 레벨에서 숨긴다. React의
  캡처 상태 commit 시점과 무관하게 편집용 보조물이 결과 PNG에 구워지지 않으며, 원래 숨겨진
  오브젝트의 상태도 그대로 복원한다. GLTF `extras`가 같은 문자열 metadata를 가져도 캡처 정책을
  위조할 수 없다.
- GPU fence를 기다리기 전에 scene override material, render target, clear color/alpha, `autoClear`, XR
  상태를 즉시 복원한다. 임시 depth target/material은 readback 성공·실패가 결정된 뒤 항상 폐기한다.
- 캡처 전후로 같은 adapter identity를 확인하므로 모달을 닫거나 Canvas가 교체된 동안 완료된 오래된
  GPU 결과는 문서에 삽입되지 않는다.
- 잠금·사라진 대상·오래된 mutation ticket·LT 계획 실패는 `false`를 반환해 3D 모달과 편집 상태를
  유지한다. 모달 안에도 다시 열기·잠금·선택 상태 확인 안내를 표시해 조용한 실패와 무의미한 반복
  시도를 막는다.

프로덕션 manifest에서 Studio 초기 정적 폐쇄는 124 chunks, 2,224,416B raw / 710,284B gzip으로
유지됐고 Three/R3F/3D editor 식별자는 0개다. 새 계약·정규화기는 사용 시점의
`StudioBackground3D` 청크에만 포함되며 현재 181,486B raw / 49,759B gzip이다.

375×812 production preview에서 상자와 평면을 배치하고 `깊이선 검출`을 켠 616×640 LT 캡처를
실행했다. 실제 WebGL2 비동기 깊이 readback, 컬러·깊이 LT 변환, 레이어 삽입과 모달 닫힘이 273ms의
단일 smoke run에서 완료됐고 콘솔 오류는 0건이었다. 이 값은 성능 분포가 아니라 기능 회귀 확인용이며,
삽입 결과는 undo로 제거했다.

추가로 원격 `.env.local` DB를 사용하지 않고 로컬 PostgreSQL 컨테이너와 별도 4011/5181 서버를 띄워
375×812 격리 브라우저에서 실제 회원가입 계정을 만들었다. 서명 세션과 `/api/me` 200을 확인한 뒤
모바일 집중 모드의 사이트 header/footer 언마운트, 367×582 작업 캔버스, 상자+평면 깊이선 삽입,
undo, 원고 생성·재편집, Socket.IO 실시간 연결, 팀 패널의 소유자·공동 저장 권한까지 검증했다.

첫 계정 실행에서 React 캡처 상태가 commit되기 전 편집 그리드와 TransformControls가 PNG에 들어가는
시각 회귀를 발견했다. viewport-only 표식을 엔진 어댑터에서도 숨기도록 수정한 뒤 같은 계정 흐름에서
그리드·기즈모가 없는 결과를 다시 캡처했다. 임시 작품과 계정은 각각 DELETE API 200으로 정리했고
테스트 DB 컨테이너도 제거했다. 로컬 OAuth 허용 origin이 아닌 5181에서 Google GIS가 남긴 오류와 일반
사용자의 의도된 `/api/admin/me` 403 권한 probe 외에 Studio 기능 예외는 없었다.

WebGLRenderer 공식 문서는 동기 읽기보다
[`readRenderTargetPixelsAsync()`](https://threejs.org/docs/pages/WebGLRenderer.html#readRenderTargetPixelsAsync)를
권장한다. 현재 구현은 이 API를 사용하면서 라이브 R3F 장면 상태를 Promise 대기 밖으로 복원한다.

### WebGPU 어댑터 전에 고정한 호환 조건

같은 이름의 WebGPU/common Renderer readback은 WebGL과 호출 계약이 다르다. WebGL은 호출자가 결과
buffer를 넘기지만, [common Renderer API](https://threejs.org/docs/pages/Renderer.html#readRenderTargetPixelsAsync)는
새 typed array를 반환한다. 두 경로를 하나의 union 메서드 호출로 섞지 않고 backend별 어댑터에서
현재의 packed raster 계약으로 정규화한다.

Three r184 WebGPU backend는 GPU copy 규칙 때문에 row stride를 256 byte로 맞춘다. 따라서 RGBA8
너비가 64의 배수가 아닌 63·65·257·375px 캡처는 padding 제거가 필요하다. tight/WebGPU-aligned
layout을 판별하고 padding 제거와 선택적 Y flip을 수행하는 순수 정규화기 및 위 경계값 테스트를
구현했다. 이 동작은
[공식 WebGPUTextureUtils 구현](https://github.com/mrdoob/three.js/blob/r184/src/renderers/webgpu/utils/WebGPUTextureUtils.js#L639-L691)을
기준으로 한다. WebGL readback은 bottom-up, WebGPU는 top-down이므로 클래스명이 아니라
[`renderer.coordinateSystem`](https://threejs.org/docs/pages/Renderer.html#coordinateSystem)으로 Y축
정규화를 결정한다.

현재 깊이 패스의 `MeshDepthMaterial + RGBADepthPacking`은 r184 WebGPU 노드 라이브러리에서 그대로
매핑되지 않는다. [r184 StandardNodeLibrary](https://github.com/mrdoob/three.js/blob/r184/src/renderers/webgpu/nodes/StandardNodeLibrary.js)를
기준으로 WebGPU용 TSL RGBA depth packing 재질을 별도로 구현하고 기존 디코더와 pixel diff 해야 한다.
컬러 캡처도 presentation canvas 복사 대신
[`setOutputRenderTarget()`](https://threejs.org/docs/pages/Renderer.html#setOutputRenderTarget)을 사용해야
화면과 같은 tone mapping/output color-space 경로를 유지할 수 있다.

R3F는 공식 [Canvas WebGPU 예제](https://r3f.docs.pmnd.rs/api/canvas#webgpu)처럼 Promise를 반환하는
`gl` factory와 `await renderer.init()`을 지원한다. 다만 초기 WebGPU 실패의 WebGL2 fallback과 실행 중
device loss는 별개다. 실행 중 손실은 [Renderer `onDeviceLost`](https://threejs.org/docs/pages/Renderer.html#onDeviceLost)를
통해 Canvas subtree를 새 key로 재생성하고, 반복 손실 때 `forceWebGL`로 복구해야 한다.

WebGL output render target 컬러 readback과 `preserveDrawingBuffer` 제거는 배경 캡처와 VRM 포저에
모두 반영됐다. 배경 batch는 `readRenderTargetPixelsAsync()`, VRM 단일 컷은 작은 동기 GPU readback
뒤 기존 OffscreenCanvas PNG Worker를 공유하며, 압축·data URL 직렬화 대기 동안 캡처 보조물 lease를
유지하지 않는다. 다음 구현 순서는 feature flag 아래 WebGPU renderer factory, TSL depth pass,
device-loss remount, WebGL/WebGPU golden pixel 비교와 저사양 실기기의 readback/방어 복사 peak
working-set 측정이다.
