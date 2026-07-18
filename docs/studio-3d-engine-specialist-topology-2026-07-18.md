# ToonSpectrum Studio 3D 엔진·전문 런타임 확장 검토

- 작성일: 2026-07-18
- 상태: 엔진 중립 경계·Three WebGPU 격리 lab 구현, 프로덕션 기본은 Three/R3F 유지
- 연계 ADR: [Babylon.js 도입 평가](./studio-babylonjs-adoption-evaluation-2026-07-11.md), [3D 런타임 지연 로딩·WebGPU 벤치마크](./studio-3d-runtime-loading-benchmark-2026-07-13.md)
- 구현 계약: `studio-bg3d-runtime-topology.ts`, `studio-bg3d-runtime-adapter.ts`,
  `studio-bg3d-three-webgpu-lab.ts`

## 결론

한 Canvas와 한 mutable scene graph를 두 엔진이 동시에 소유하게 만들지는 않는다. 이 구조는 선택,
기즈모, 애니메이션, GPU 자원 소유권, 캡처 시점과 dispose 책임이 충돌하고 같은 GLB를 두 번 디코딩한다.
대신 다음의 **단일 소유자 + 격리 전문 런타임** 구조를 사용한다.

1. Three/R3F가 현재 대화형 편집 장면의 유일한 소유자다.
2. 모든 영속 상태는 엔진 객체가 아닌 `StudioBg3dSceneDocument`에 저장한다.
3. 업로드는 Worker에서 검증·정규화된 canonical GLB 스냅샷만 런타임에 전달한다.
4. 두 번째 엔진은 물리 bake, WebGPU 비교, 3D Tiles/BIM/볼륨/스플랫 미리보기처럼 첫 엔진에 없는
   전문 작업에만 별도 Canvas 또는 headless job으로 활성화한다.
5. 엔진 간 전달값은 SceneDocument + verified GLB bytes + 명시적인 결과 DTO뿐이다. Three Object3D,
   Babylon Node, texture/material, object URL, GPU buffer는 절대 공유하지 않는다.
6. 전문 작업 결과가 다시 문서에 들어올 때에는 transform, animation, pose, morph, baked collision 등
   엔진 중립 패치로 검증한 뒤 하나의 undo command로 반영한다.
7. 모바일·저메모리 환경에서는 누적 활성화 gzip/힙 예산 때문에 두 번째 엔진을 거부한다.

이 방식이면 “둘 다 사용”할 수 있지만, 장점이 없는 중복 렌더링 비용은 지불하지 않는다.

## 현재 구현된 공통 기반

- SceneDocument v2: 카메라, 조명, 출력, 품질, attachment, transform, 재질 override, animation,
  additive joint pose, additive morph layer를 엔진 중립 데이터로 왕복한다.
- GLB 신뢰 경계: SHA-256, 컨테이너/chunk, 외부 URI, bufferView/accessor/sparse 범위, texture decoded
  memory, animation/skin/joint/morph/accessor 예산을 Worker에서 검사한다.
- 다중 형식 입력: GLB, glTF, OBJ/MTL, FBX, DAE, STL, PLY, 3DS를 canonical self-contained GLB로
  변환한 뒤 동일 검증 경계에 넣는다.
- Three 사후 실측: 실제 scene graph, draw call, triangle, material/texture, animation track, skeleton,
  morph, decoded array를 다시 측정한다.
- 런타임 topology 정책: production/lab, WebGPU 지원, capability, 최초 활성화 gzip, specialist job을
  함께 평가하고 하나의 interactive owner만 허용한다.
- 전문 런타임 경계: factory가 만든 canonical document + verified GLB 스냅샷만 허용하고 위조된
  구조적 복사본을 거부한다. 엔진별 작업은 직렬화하며 활성·대기 작업을 모두 비운 뒤 dispose한다.
  캡처는 16Mpx, metric/transform DTO는 길이·수치·quaternion 범위로 제한한다.
- Three WebGPU lab: secure context/API/실제 adapter limits를 사전 검사하고 `three/webgpu`를 완전
  지연 로드한다. Three의 WebGL2 자동 fallback을 비활성화하고 실제 WebGPU backend가 아닐 때
  실패 폐쇄한다. 현재 측정된 동적 청크는 197,119 gzip bytes이며 정책 예산은 210,000 bytes다.
- 계층/제약: primitive와 model이 섞인 실제 렌더 트리, 순환·고아 부모 복구, 월드 구도를 보존하는
  재부모화, 서로 다른 부모를 가진 다중 선택의 월드 행렬 delta, 애니메이션·포즈 뒤 비파괴 joint
  aim constraint를 제공한다.
- 런타임 부하 제어: 숨김/프러스텀 밖 애니메이션은 정지하고 먼 모델은 20/10Hz로 낮추되 절대 Studio
  시간에서 다시 샘플해 드리프트를 없앤다. 선택한 모델과 캡처 프레임은 항상 최신 자세를 사용한다.
- Worker 풀: GLB 신뢰 경계는 단일 파일에서 Worker 하나만 지연 생성하고, 여러 파일 검사가 실제로
  겹칠 때에만 기기 코어·메모리 신호에 따라 최대 2개로 확장한다. 저사양/정보 미확인 환경은 1개다.
- 정적 렌더 최적화: 동일 프리미티브 kind는 editor-local geometry/edge GPU buffer를 공유하고,
  선택되지 않은 루트는 local matrix를 고정한다. 문서 transform 변경 때 matrix를 즉시 갱신하며
  선택/TransformControls 진입 시 자동 행렬 갱신을 되살린다.
- WebGPU lab: GPUDevice를 만들지 않는 보수적 capability/limit probe와 완전 지연
  `three/webgpu` renderer factory를 별도 Canvas 계약으로 구현했다. 현재 WebGL 편집 Canvas를 소유하거나
  자동 교체하지 않는다.

## 엔진 및 프레임워크 비교

| 후보 | 확인된 웹 강점 | ToonSpectrum에 가져올 장점 | 채택 위치 | 결론 |
| --- | --- | --- | --- | --- |
| **Three.js + R3F** | 현재 앱의 GLTF/OBJ, VRM, 포즈, 캡처, React UI와 직접 통합 | 가장 작은 증분 비용, 기존 VRM/선화/캡처 자산 재사용 | 기본 편집·캡처 | **프로덕션 유지** |
| **Babylon.js** | WebGL/WebGPU, AssetContainer, thin instances, 물리/XR, instrumentation, progressive glTF | 대규모 반복 배경, 물리 sandbox, WebGPU 실기기 비교 | 완전 지연 `/labs`; 필요 시 격리 specialist | **조건부 2순위**. 일반 편집 병행은 금지 |
| **PlayCanvas Engine 2** | 공식 문서상 WebGL2 + WebGPU(beta) 자동 fallback, compute, skin/morph, batching/instancing, Gaussian Splat; GLB 권장 | Babylon보다 웹 중심인 WebGPU/compute·스플랫 비교 후보 | 스플랫/compute lab specialist | **새 PoC 우선순위 높음**. 범용 편집 교체는 A/B 후 |
| **Spark** | Three scene 안에서 동작하는 Gaussian Splat renderer, 정렬된 splat을 instanced draw로 결합 | 두 번째 범용 엔진 없이 기존 R3F 장면에 splat 배경을 넣을 수 있음 | 격리 splat corpus 후 Three 확장 | **스플랫 1순위**. PlayCanvas와 품질·정렬·메모리 A/B |
| **Google Filament WASM** | 모바일 지향 PBR, WebGL2 브라우저 backend, glTF/GLB·Draco·KTX2·meshopt, skin/morph animation | 재질/PBR 기준 렌더와 glTF 호환성 골든 비교 | headless/격리 material conformance viewer | **편집 엔진 아님**. 품질 검증 specialist 후보 |
| **CesiumJS** | WebGL 기반 WGS84 globe, terrain/imagery, 3D Tiles streaming·metadata styling, glTF model | 도시·거리·지형을 대규모로 스트리밍하고 카메라 구도를 추출 | GIS/3D Tiles 소재 브라우저 | **지리 장면 전용 specialist** |
| **xeokit** | 고정밀 BIM/engineering, XKT·IFC 변환 생태계, CityJSON/glTF/LAZ/OBJ, semantic graph | 건축 배경의 층/부재/속성 검색, section plane, 대형 BIM 표시 | BIM import/selection workspace | **기술 적합**, AGPL 또는 상용 라이선스 검토 필수 |
| **Potree** | Three 기반 대규모 WebGL point-cloud viewer, octree/LOD와 LAS/LAZ 변환 생태계 | 스캔 배경·LiDAR 소재를 메시로 전환하지 않고 탐색·구도 추출 | point-cloud workspace | **포인트클라우드 전용 specialist**. 기존 Three 버전/자원 소유 충돌은 격리 |
| **deck.gl + luma.gl** | binary attribute, 대규모 데이터 layer, picking/instrumentation, WebGL2와 단계적 WebGPU API | 수십만 지리 객체·포인트·경로를 데이터 중심으로 표시 | geospatial data-layer workspace | **데이터 시각화 specialist**. 공식 문서상 WebGPU는 아직 production-ready 아님 |
| **MapLibre GL JS** | WebGL vector-tile 지도, 지도 camera와 depth를 공유하는 custom 3D layer | 배경 지도/건물/경로를 스트리밍하고 Studio 카메라·배치로 변환 | vector-map workspace | **지도 전용 specialist**. 일반 3D 편집 엔진으로 사용하지 않음 |
| **VTK.js** | GPU volume rendering, scalar/vector/tensor/medical pipeline, widgets, WebGL 및 WebGPU 경로 | CT/과학·볼륨 소재가 제품 범위가 될 경우 독보적 | 과학/의료 시각화 workspace | **현재 범위 밖 specialist** |
| **Wonderland Engine** | web-focused 경량 engine, desktop editor, WebAssembly runtime, WebXR | 독립 XR 체험과 저지연 WASM runtime 비교 | 별도 published XR experience | **내장 편집기 교체 부적합**. XR 산출물 specialist 후보 |
| **Needle Engine** | Three 기반 component system, Rapier physics/XR/networking, Blender·Unity authoring/압축 pipeline | 작가가 DCC에서 상호작용 장면을 만들고 web asset/package로 전달 | 외부 DCC authoring/export bridge | **런타임 병행보다 파이프라인 참고**. Three fork/버전 중복 검증 필요 |
| **Verge3D** | Blender/3ds Max/Maya 연계, visual scripting, material/physics/XR, glTF 기반 web publishing | 비개발자용 외부 interactive scene 제작 | 외부 출판/가져오기 bridge | **상용 DCC pipeline 후보**, Studio 핵심 런타임에는 부적합 |
| **Bevy (Rust/WASM)** | Rust ECS, WASM release size 최적화 프로필, 네이티브와 웹 코드 공유 | 대규모 ECS simulation/오프라인 physics를 Rust로 공유할 때 가치 | 별도 WASM simulation lab | **React 편집기 대체 부적합**. 구체적 simulation 요구 때만 |
| **Godot 4 Web** | 완전한 게임 엔진을 WASM/WebGL2로 export, single-thread web export | 게임형 인터랙션 prototype을 독립 제작 | iframe/별도 published experience | **내장 편집 런타임 부적합**. 공식 문서상 WebGPU 미지원 |
| **Unity Web** | 성숙한 DCC·게임 제작 생태계, WebAssembly 빌드 | 서버/오프라인에서 미리 만든 체험형 콘텐츠 | 독립 export 또는 서버 렌더 | **클라이언트 편집기 병행 부적합**. 큰 runtime/브리지 비용 |
| **Unreal Pixel Streaming** | 고품질 native renderer를 서버 GPU에서 실행하고 브라우저에 영상/입력을 스트리밍 | 클라이언트 GPU 한계를 넘는 최종 품질 preview | 선택적 서버 렌더 서비스 | **웹 엔진이 아님**. 비용·지연·개인정보 때문에 일반 편집에는 부적합 |
| **A-Frame** | Three 위의 선언형 ECS와 폭넓은 WebXR headset/controller 편의 | 빠른 XR prototype과 교육용 scene authoring | XR prototype | **별도 렌더 엔진 이점 없음**. Three를 이미 사용 |
| **`<model-viewer>`** | GLB 표시, camera controls, 모바일 AR 진입을 웹 컴포넌트로 제공 | 라이브러리 카드의 안전한 단일 모델/AR 미리보기 | 읽기 전용 asset preview | **편집 엔진 아님**, AR handoff 후보 |

### 공식 근거

- PlayCanvas graphics는 WebGL2와 WebGPU(beta) fallback, compute, instancing, skin/morph, Gaussian
  Splat을 명시한다: [Graphics](https://developer.playcanvas.com/user-manual/graphics/),
  [Compute Shaders](https://developer.playcanvas.com/user-manual/graphics/shaders/compute-shaders/).
- PlayCanvas import pipeline은 GLB를 권장하고 FBX/DAE를 GLB로 변환하며 OBJ를 지원한다:
  [Supported Formats](https://developer.playcanvas.com/user-manual/assets/supported-formats/),
  [Building Models](https://developer.playcanvas.com/user-manual/assets/models/building/).
- Filament는 WASM/JavaScript API와 브라우저 WebGL2 backend, glTF animation 및 여러 압축 확장을
  제공한다: [Filament Introduction](https://google.github.io/filament/),
  [gltfio](https://google.github.io/filament/dup/gltfio.html).
- CesiumJS는 WebGL 기반 globe/지도, terrain/3D Tiles를 위한 엔진이다:
  [CesiumJS Fundamentals](https://cesium.com/learn/cesiumjs-fundamentals/),
  [3D Tiles](https://cesium.com/why-cesium/3d-tiles).
- xeokit은 BIM/engineering 모델과 semantic data에 특화되어 있고 SDK 페이지에 AGPL/상용 이중
  라이선스를 명시한다: [xeokit SDK](https://xeokit.github.io/xeokit-sdk/),
  [SDK 3 Whitepaper](https://xeokit.github.io/sdk/userguide/whitepaper/index.html).
- VTK.js는 volume/scientific visualization pipeline을 제공한다:
  [VTK.js Overview](https://kitware.github.io/vtk-js/docs/index.html),
  [Volume API](https://kitware.github.io/vtk-js/api/Rendering_Core_Volume.html).
- Spark는 Three scene 내부 renderer이며 splat을 정렬해 하나의 instanced geometry draw로 결합한다:
  [Spark](https://sparkjs.dev/), [System Design](https://sparkjs.dev/docs/system-design/).
- Potree는 Three를 기반으로 한 대규모 WebGL point-cloud viewer이고 multi-resolution octree를 쓴다:
  [Potree](https://github.com/potree/potree),
  [PotreeConverter](https://potree.org/downloads/converter_documentation.pdf).
- deck.gl은 luma.gl 기반 데이터 layer를 제공하지만 현재 WebGPU는 production-ready가 아니라고 명시한다:
  [deck.gl WebGPU](https://deck.gl/docs/developer-guide/webgpu),
  [Primitive Layers](https://deck.gl/docs/developer-guide/custom-layers/primitive-layers).
- MapLibre GL JS는 WebGL vector-tile map과 depth를 공유할 수 있는 3D custom layer 계약을 제공한다:
  [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs),
  [CustomLayerInterface](https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/).
- Wonderland는 desktop editor와 WebAssembly runtime을 갖춘 web/WebXR engine이다:
  [Wonderland Engine Documentation](https://wonderlandengine.com/documentation/).
- Needle은 Three 기반이며 Blender/Unity authoring, Rapier, XR, networking, asset optimization을 묶는다:
  [Needle + Three](https://engine.needle.tools/docs/three/),
  [Needle Getting Started](https://engine.needle.tools/docs/getting-started/).
- Verge3D는 Blender/3ds Max/Maya 및 glTF 기반의 visual authoring/publishing 기능을 제공한다:
  [Verge3D Features](https://www.soft8soft.com/docs/manual/en/introduction/Features.html).
- Bevy 공식 setup은 Rust/WASM 배포와 별도 size optimization profile을 안내한다:
  [Bevy Setup](https://bevy.org/learn/quick-start/getting-started/setup/).
- Godot 4.5 web export는 WASM + WebGL2이고 현재 WebGPU를 지원하지 않는다고 명시한다:
  [Godot Web Export](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html).
- A-Frame은 Three 기반 ECS/WebXR 프레임워크다: [A-Frame Introduction](https://aframe.io/docs/),
  [ECS](https://aframe.io/docs/1.8.0/introduction/entity-component-system.html).
- `<model-viewer>`는 GLB/AR 표시를 위한 웹 컴포넌트다: [model-viewer](https://modelviewer.dev/).

## 우선순위별 실제 도입안

### P0 — 현재 Three 경로에서 바로 얻을 수 있는 이득

- Web Worker: hash/GLB JSON/accessor/complexity 검사, 텍스트 파서 전처리, 썸네일용 CPU 작업.
- canonical GLB: 모든 입력 형식을 한 번 변환하고 렌더러별 loader 중복을 제거.
- Meshopt: 구현 완료. GLB 검증기가 압축 원본 범위와 디코딩 논리 범위를 따로 검사하고, 디코딩 출력은
  기존 geometry memory budget에 포함한다. Three의 WASM 디코더는 기기 코어 수에 따라 최대 2개
  Worker로 제한하며 CSP가 blob Worker를 막으면 비동기 WASM 경로로 안전하게 폴백한다.
- KTX2/BasisU·Draco: transcoder/decoder asset 무결성, Worker 수명주기, 디코딩 메모리·시간 예산을
  먼저 만든 뒤 canonical allowlist에 추가한다.
- LOD/instance: geometry 공유와 정적 root matrix 고정은 구현 완료. 다음은 안전한 반복 객체만 묶는
  instancing(비애니메이션·비skin/morph·동일 material), 저작 LOD attachment와 카메라 투영 크기 전환이다.
- WebGPU: Three WebGPURenderer 격리 lab/probe는 구현했다. 다음 게이트는 feature flag UI와 동일
  SceneDocument·capture golden 실기기 비교이며, 통과 전에는 기본 편집기를 교체하지 않는다.
- animation/rig: clip layer, pose/morph, IK, retarget, root motion, constraints를 문서 레이어로 확장.

### P1 — PlayCanvas와 Babylon의 경쟁 PoC

둘 다 앱 의존성에 상시 추가하지 않고 별도 Vite entry에서 동일한 verified GLB corpus를 재생한다.

- Babylon: thin instances + physics + WebGPU instrumentation 대표 장면.
- PlayCanvas: WebGPU compute 기반 선화/thumbnail, Gaussian Splat, clustered lighting 대표 장면.
- 측정: cold activation bytes/requests, p50/p95 frame time, JS/WASM heap, GPU memory proxy, context loss,
  30분 편집, capture pixel diff, input latency.
- 승자는 특정 specialist job 하나를 소유한다. “기능이 많다”는 채택 근거가 아니다.

### P2 — 전문 데이터가 제품 요구가 될 때만

- 3D Tiles/지형/도시: Cesium이 구도·선택 결과를 SceneDocument primitive/model placement로 반환.
- BIM/IFC: xeokit이 부재 선택과 section 결과를 canonical mesh/metadata package로 반환.
- scientific volume: VTK.js가 raster/depth 또는 iso-surface GLB를 반환.
- AR 상품 미리보기: model-viewer가 별도 read-only route에서 verified GLB를 사용.

## 공통 어댑터 계약

향후 실제 어댑터는 다음 최소 기능을 구현해야 한다.

```ts
interface StudioBg3dRuntimeAdapter {
  readonly id: StudioBg3dRuntimeId;
  initialize(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<void>;
  load(document: StudioBg3dSceneDocument, assets: readonly VerifiedGlbSnapshot[]): Promise<void>;
  applyDocumentPatch(patch: StudioBg3dDocumentPatch): Promise<void>;
  pick(point: readonly [number, number]): Promise<StudioBg3dPickResult | null>;
  capture(request: StudioBg3dCaptureRequest): Promise<StudioBg3dCaptureResult>;
  metrics(): Promise<StudioBg3dRuntimeMetrics>;
  dispose(): Promise<void>;
}
```

실제 인터페이스를 확정하기 전 golden test가 먼저 필요하다. 특히 selection identity, skin/joint와
morph ordinal, color-space/tone mapping, camera projection, transparent/depth capture가 엔진마다 달라질
수 있으므로 단순한 이름 일치만으로 호환을 선언하지 않는다.

현재 specialist 경계는 그보다 좁게 먼저 구현했다. runtime catalog는 Babylon, PlayCanvas WebGL/WebGPU,
Spark, Filament, Cesium, xeokit, Potree, deck.gl, MapLibre, Wonderland, VTK.js를 기능 단위로 등록할 수
있고 adapter registry는 엔진별 작업을 직렬화한다.
어댑터에는 canonical SceneDocument 문자열과 호출마다 새로 복사한 verified GLB만 주며, 반환값도 bounded
metrics/capture/transform DTO로 재검사한다. 엔진 scene/node/material/GPU 객체는 경계를 통과할 수 없다.

## 채택 게이트

두 번째 엔진/전문 런타임은 아래를 모두 통과해야 한다.

1. 해당 작업에서 Three 기준 대비 p95 frame time 25% 개선 또는 처리 가능 장면 규모 2배.
2. 전문 런타임을 닫은 뒤 JS/WASM heap과 GPU 자원이 기준선 근처로 복귀.
3. cold activation과 누적 runtime gzip이 기기별 예산 안에 있음.
4. SceneDocument round-trip, attachment hash, undo/redo, pose/morph/animation identity가 보존됨.
5. RGBA/depth capture golden이 허용 pixel diff 안에 있음.
6. Worker/WASM panic, WebGPU init/device loss, context loss에서 Three/WebGL로 데이터 손실 없이 복귀.
7. 라이선스·상용 배포·decoder/loader 보안 정책을 통과.

이 게이트를 통과하지 못한 엔진은 “기능 목록이 더 많다”는 이유만으로 프로덕션에 포함하지 않는다.
