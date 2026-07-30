# ADR — ToonSpectrum Studio의 Babylon.js 도입 평가

- 결정일: 2026-07-11
- 상태: **기본 3D 편집 엔진 교체 보류 / 격리 Webtoon FX specialist 계약 승인**
- 평가 버전: `@babylonjs/core@9.16.1`, `@babylonjs/loaders@9.16.1`, Vite `8.0.16`
- 2026-07-31 재검토 후보: `@babylonjs/core@9.19.0`, `@babylonjs/loaders@9.19.0`
- 범위: 3D 배경 도구, VRM 포저, 모바일 편집 성능, 번들/로더 비용
- 제품 활용 전수 검토:
  [studio-babylonjs-product-utilization-matrix-2026-07-31.md](./studio-babylonjs-product-utilization-matrix-2026-07-31.md)

## 결정

현재 Three.js + React Three Fiber(R3F) + `@pixiv/three-vrm` 구현을 대화형 편집 장면의 유일한
소유자로 유지한다. Babylon.js를 같은 Canvas/scene graph의 두 번째 소유자로 추가하지 않는다.

Babylon.js는 WebGPU, 성능 계측, AssetContainer, 다양한 로더와 대규모 씬 최적화 수단이 잘 갖춰진 엔진이다. 그러나 현재 Studio의 핵심 3D 기능은 이미 Three 생태계에 깊게 구현되어 있고, Babylon을 병행하면 **3D 배경 도구를 열 때 최소 1,278,690 B min / 305,625 B gzip의 별도 런타임**이 추가된다. glTF를 처음 활성화하면 여기에 **767,936 B min / 178,632 B gzip**이 더 필요하다. 현재 Studio 안에서 Three 기반 3D 배경 도구를 여는 증분은 **267,763 B min / 79,398 B gzip**, glTF 로더는 추가 **44,288 B min / 13,063 B gzip**이다.

또한 현재 VRM 포저는 포즈, 표정, MToon, 스프링본, 의상, 소품, 웹캠 추적과 캡처/복원을 `@pixiv/three-vrm` 위에 구현한다. Babylon 공식 문서가 안내하는 VRM 경로는 코어 기능이 아니라 **community-made `babylon-vrm-loader`**이므로, 이 기능군을 동등하게 이전할 근거가 아직 부족하다. 따라서 Babylon은 특정 WebGPU 워크로드가 실제 제품 벤치마크에서 명확히 이길 때만 격리 실험으로 재검토한다.

## 2026-07-31 재결정 — 웹툰 배경·멀티패스 FX specialist

Babylon을 “범용 필터 엔진”으로 추가하지는 않는다. 레벨·커브·색상 행렬·일반 블러처럼 평면
RGBA만 필요한 필터는 현재 canonical RGBA16F 타일/WebGPU·Worker 경로가 문서 저장, 마스크,
실행 취소, 라이브/내보내기 동일성 면에서 더 직접적이다.

대신 **3D 장면의 깊이·노멀·재질·오브젝트·발광·모션 정보를 함께 써야 하는 효과**는 Babylon
격리 specialist의 승인 대상이다. Babylon은 WebGPU 엔진과 compute shader를 지원하고
[Node Material](https://doc.babylonjs.com/typedoc/classes/BABYLON.NodeMaterial)로 WebGPU WGSL,
post-process, depth pre-pass와 다중 렌더 타깃용 재질을 구성할 수 있다.
[WebGPU 초기화](https://doc.babylonjs.com/setup/support/webGPU/)는 비동기이며 실패할 수 있으므로
WebGL 또는 기존 Three 캡처로 데이터 손실 없이 복귀해야 한다.

승인한 1차 효과군은 다음과 같다.

| 효과군 | Babylon specialist가 맡는 계산 | Studio에 돌아오는 결과 |
| --- | --- | --- |
| 툰 선화 | depth/normal 불연속, 재질·오브젝트 경계, 화면 크기 독립 선 굵기 | 투명 RGBA 선화 또는 beauty 합성 |
| 공간 분위기 | 깊이 안개·원근 대기·열 아지랑이·색 번짐 | RGBA + 정규화 depth |
| 렌즈·조명 | emissive bloom, glow, god ray, lens flare, DOF/bokeh | RGBA + 효과 recipe/hash |
| 날씨·입자 | 비·눈·꽃잎·먼지·불씨, 바람장, depth occlusion | 결정적 seed/time의 RGBA 프레임 |
| 웹툰 연출 | 속도선·집중선·충격파·네온·발광 간판·물결 | 투명 FX 레이어 또는 beauty 합성 |
| 제작 보조 pass | normal, velocity, object/material ID, shadow, emission | 검증된 typed-array 또는 lossless pass |

기본 리더의 소수 Canvas2D 입자는 그대로 유지한다. Babylon은 여러 장면 pass나 depth occlusion이
필요한 “시네마틱 FX” 프리셋을 열 때만 완전 지연 로드한다. 라이브 미리보기와 export는 동일 seed,
고정 timestep, 동일 canonical recipe를 사용해야 하며 wall-clock time을 입력으로 쓰지 않는다.

### 구현 경계

현재 제품 코드에는 다음 최소 계약을 추가했다.

- `StudioBg3dRuntimeCapability`의 `webtoon-scene-fx`
- Babylon WebGL/WebGPU lab descriptor의 FX/capture capability
- `StudioBg3dWebtoonFxCaptureRequest` v1: 최대 8개 pass, 결정적 time/seed, preview/final 품질
- `beauty`/`lt-source` 출력 의도, 선택적 base-scene depth, 버전이 고정된 top-down RGBA8/depth profile
- 1차 pass: toon outline, depth atmosphere, emissive bloom, depth of field,
  weather particles, speed lines
- preview 4Mpx, final beauty 16Mpx, LT source 8Mpx, 수치·색상·seed·effect count fail-closed 검증
- LT source에는 depth를 강제하고 bloom·DOF·입자처럼 선화 입력을 훼손하는 pass를 거부

입력은 canonical `StudioBg3dSceneDocument`와 검증된 GLB byte snapshot뿐이다. Babylon Node,
Material, Texture, GPUBuffer, object URL은 경계를 통과하지 않는다. 출력은 기존 runtime adapter가
방어 복사하는 RGBA/depth DTO이며, 최종 합성은 Studio 소유 필터/레이어 경로가 수행한다.

```text
SceneDocument + verified GLB + bounded FX recipe
  → isolated Babylon WebGPU/WebGL job
  → internal MRT / pre-pass / particle / post-process
  → top-down RGBA + requested normalized base-scene depth
  → Studio canonical filter/mask/layer commit
```

이 경계는 Babylon의 [Frame Graph custom post-process](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphExamples/frameGraphExampleCustomPostProcess),
[Geometry Buffer](https://doc.babylonjs.com/typedoc/classes/BABYLON.GeometryBufferRenderer),
[PrePass Renderer](https://doc.babylonjs.com/typedoc/classes/BABYLON.PrePassRenderer),
[Particle System](https://doc.babylonjs.com/typedoc/classes/BABYLON.ParticleSystem)을 한 작업 내부에서
활용하되 Studio 문서 권위는 넘기지 않도록 한다.

### 프로덕션 어댑터 구현 전 PoC 순서

1. 동일 canonical scene으로 Three beauty/depth와 Babylon beauty/depth를 캡처한다.
2. Babylon WebGPU에서 outline + depth atmosphere + bloom을 하나의 대표 장면에 구현한다.
3. rain/snow/petals를 seed + fixed timestep으로 300프레임 반복해 byte-identical replay를 확인한다.
4. normal/object/material ID pass를 LT 선화, 마스크 선택, 레이어 분리에 소비한다.
5. device loss, WebGPU 초기화 실패, abort, resize, dispose 뒤 Three 편집 장면이 손실 없이 유지되는지
   검증한다.

채택 기준은 FX 미사용 시 Babylon chunk/network/GPU context가 0이고, 대표 1080p preview p95가
16.7ms(또는 현재 기준 대비 25% 개선), 입력·출력 byte budget 준수, 30분 soak 후 지속 heap/GPU
증가 없음, 같은 seed/time의 라이브·export pixel diff 0, beauty/depth 골든 허용 오차 통과다.

## 현재 3D 파이프라인

### 3D 배경

`StudioBackground3D.tsx`는 R3F `Canvas`, Drei `OrbitControls`/`TransformControls`, Three.js를 사용한다. 현재 제공 범위는 다음과 같다.

- 프리미티브, 복합 오브젝트, 완성형 씬 템플릿
- 위치/회전/크기 기즈모, 카메라 프리셋, 선화 미리보기
- 신규 사용자 입력은 GLB/glTF, OBJ/MTL, FBX, DAE, STL, PLY, 3DS와 연결 리소스를 받아 자체 포함 `.glb` 2.0으로 정규화하며, 검증을 통과한 모델만 IndexedDB 라이브러리에 저장
- 동일 모델 재배치 시 씬그래프만 복제하고 geometry/material을 공유하는 캐시
- 도형과 커스텀 모델을 함께 다루는 undo/redo
- 투명 PNG 캡처와 PNG hash에 씬 메타데이터를 넣는 재편집 round-trip

Babylon `AssetContainer.instantiateModelsToScene()`은 모델 풀/복제에 좋은 API지만, 현재 구현도 모델별 파싱 캐시와 공유 geometry/material 복제를 이미 수행한다. 따라서 AssetContainer만으로는 엔진을 추가할 만큼 큰 기능 격차가 아니다. Babylon의 AssetContainer 동작은 [공식 Asset Containers 문서](https://doc.babylonjs.com/features/featuresDeepDive/importers/assetContainers/)를 기준으로 평가했다.

### VRM 포저

`StudioVrmPoser.tsx`는 `GLTFLoader` + `@pixiv/three-vrm`을 지연 로드하고 다음 계약을 갖는다.

- VRM 0/1 로드, humanoid bone 포즈, 손가락, look-at
- 표정/깜빡임, MToon/재질 효과, 조명
- 스프링본 물리, 커스텀 의상/워드로브, bone 부착 소품
- 얼굴·손·몸 웹캠 추적과 적응형 품질 제어
- PNG 썸네일/캡처와 전체 포저 상태 복원

Babylon 문서의 VRM 통합은 [community extension과 외부 `babylon-vrm-loader`를 사용](https://doc.babylonjs.com/communityExtensions/Babylon.js%2BExternalLibraries/BabylonJS_and_VRM/)한다. 단순 glTF 표시와 달리 위 기능의 완전한 이전에는 humanoid 매핑, blend shape/표정, MToon, secondary animation, 버전 호환, dispose/복원 동작을 모두 다시 검증해야 한다. 현재로서는 프로덕션 마이그레이션의 가장 큰 차단 요인이다.

### 로딩 구조

`StudioPage.tsx`는 `StudioBackground3D`와 `StudioVrmPoser`를 각각 `lazyRetry()`로 지연 로드한다. 현재 신규 가져오기 UI는 GLB/glTF, OBJ/MTL, FBX, DAE, STL, PLY, 3DS와 연결 파일을 동적 Three 로더로 해석하고, 런타임·저장 경계에는 자체 포함 GLB 2.0만 넘긴다. `three-vrm`도 사용 시점에 동적 import한다. 다만 `IntroSplash.tsx`가 Three.js를 정적 import하므로 Three 코어의 상당 부분은 현재 앱 진입 chunk에 포함된다. Babylon을 3D 배경에만 도입하면 VRM과 인트로 때문에 Three를 제거할 수 없고, 두 엔진의 코드/파싱/캐시 비용이 공존한다.

## 공식 기능 적합성

| 요구 | Babylon.js 강점 | ToonSpectrum에서의 실제 의미 |
| --- | --- | --- |
| WebGPU | WebGPU와 WebGL을 나란히 지원하고 WebGPU 초기화는 `await engine.initAsync()`를 사용한다. [공식 WebGPU 문서](https://doc.babylonjs.com/setup/support/webGPU/) | 큰 씬·고급 셰이더에는 잠재력이 있다. 현재 선화/블록아웃/PNG 캡처 워크로드에서 우위는 아직 측정되지 않았다. 모바일에서는 WebGL fallback이 필수다. |
| 기즈모·씬 그래프 | 카메라, picking, gizmo, 재질, 애니메이션, PBR, WebGPU 등을 한 엔진에서 제공한다. [공식 사양](https://www.babylonjs.com/specifications/) | 현재 OrbitControls/TransformControls와 기능이 겹친다. 새 기능보다 기존 편집/undo/캡처 코드를 재작성하는 비용이 먼저 발생한다. |
| 모델 라이브러리 | AssetContainer로 씬에서 자산을 분리하고 템플릿처럼 인스턴스화할 수 있다. | 현재 모델 캐시 + `Object3D.clone()` 공유가 같은 핵심 효율을 이미 제공한다. |
| 파일 형식 | glTF/GLB, OBJ, STL, splat 계열을 로더 플러그인으로 제공하며 dynamic registration도 지원한다. [공식 Loading Any File Type 문서](https://doc.babylonjs.com/features/featuresDeepDive/importers/loadingFileTypes/) | STL/splat는 확장 기회지만 현 제품 필수 형식은 glTF/OBJ다. glTF 활성화 번들 비용은 PoC에서 컸다. |
| 점진적 glTF | `MSFT_lod` + HTTP Range Request로 낮은 LOD부터 표시할 수 있다. [공식 progressive glTF 문서](https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF/progressiveglTFLoad/) | 현재 VRM/GLB를 그대로 넣는 것만으로 얻는 이점이 아니다. LOD 저작, contiguous range 배치, 서버 range 지원이 함께 필요하다. |
| 성능 제어 | material/world matrix/active mesh freeze, instances, pointer-move picking 중단, performance priority, Engine/Scene instrumentation을 제공한다. [공식 최적화 문서](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene) | 정적인 배경에는 유용하다. 편집 중에는 picking·bounding update·transform이 필요하므로 선택되지 않은 정적 자산에만 선별 적용해야 한다. Aggressive 모드를 전역 적용하면 편집 동작이 깨질 수 있다. |
| 코드 분할 | 셰이더·로더를 async chunk로 나누는 구조를 제공한다. [공식 bundler/chunks 문서](https://doc.babylonjs.com/setup/support/chunksFun/) | 초기 전송량은 줄일 수 있지만 creator PoC는 242개 JS chunk를 방출했다. 모두 한 번에 받는 것은 아니어도 모바일 고지연 환경의 요청/캐시 복잡성을 관리해야 한다. |
| VRM | 커뮤니티 확장을 통해 로드 가능하다. | Three 전용 `@pixiv/three-vrm` 기반 기능을 동등하게 대체하는 공식 코어 경로가 아니다. |

## 격리 Vite PoC

PoC는 저장소를 수정하지 않고 `/tmp/toonspectrum-babylon-poc`에서 실행했다. 저장소와 동일한 Vite `8.0.16`을 고정했고, Babylon 패키지는 평가일의 npm 버전 `9.16.1`을 고정했다. Babylon의 전체 barrel 대신 ESM deep import를 사용해 tree-shaking에 유리한 조건을 줬다.

세 가지 변형을 별도 Vite root로 빌드했다.

1. `basic`: WebGL Engine/Scene, ArcRotateCamera, light, box
2. `creator-webgl`: 위 구성 + GizmoManager, SceneInstrumentation, AssetContainer loader API, 클릭 시 glTF/OBJ 동적 import
3. `webgpu`: WebGPUEngine, ArcRotateCamera, light, box

### 측정 방법

- min: Vite production minification 후 JS 파일 바이트
- gzip: 각 고유 JS chunk에 `gzip -9`을 적용한 바이트의 합
- initial: manifest entry에서 정적 `imports`로 도달하는 고유 JS chunk 합
- loader activated: initial과 해당 동적 loader entry의 정적 의존성 합
- all emitted JS: 상호 배타적인 WebGL/WGSL 셰이더와 각종 지연 모듈까지 포함한 배포 산출물 총합. 실제 첫 화면 전송량이 아니다.

| PoC 시나리오 | JS chunk | min bytes | gzip bytes | min KiB | gzip KiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Babylon basic WebGL initial | 7 | 930,939 | 220,273 | 909.1 | 215.1 |
| Babylon creator WebGL initial | 27 | 1,278,690 | 305,625 | 1,248.7 | 298.5 |
| creator + glTF 최초 활성화 | 44 | 2,046,626 | 484,257 | 1,998.7 | 472.9 |
| glTF 활성화 증분 | 17 | 767,936 | 178,632 | 749.9 | 174.4 |
| creator + OBJ 최초 활성화 | 29 | 1,314,163 | 314,826 | 1,283.4 | 307.4 |
| OBJ 활성화 증분 | 2 | 35,473 | 9,201 | 34.6 | 9.0 |
| Babylon WebGPU initial | 20 | 1,127,507 | 270,933 | 1,101.1 | 264.6 |

참고로 all-emitted JS는 basic `1,058,273 / 262,252 B gzip`, creator WebGL `3,632,801 / 895,268 B gzip`, WebGPU `1,317,538 / 329,199 B gzip`이었다. creator의 큰 총량은 glTF의 PBR/OpenPBR/animation/flow-graph 경로와 WebGL/WGSL 셰이더가 지연 chunk로 방출된 결과다.

WebGPU-only 변형은 basic WebGL보다 initial gzip이 50,660 B 더 컸다. 이 수치는 WebGL fallback을 같은 제품 경로에 함께 넣지 않은 **하한**이다. 실제 프로덕션 구현은 브라우저/드라이버 감지, 실패 fallback, 동일 캡처 결과 검증을 추가해야 한다.

### 현재 산출물과 비교

현재 `dist/assets`를 같은 `gzip -9` 방식으로 측정했다. 아래 “Studio에서 열기 증분”은 이미 Studio 기본 chunk가 로드된 상태에서 새로 필요한 정적 JS의 합이다.

| 현재 Three 경로 | min bytes | gzip bytes | min KiB | gzip KiB |
| --- | ---: | ---: | ---: | ---: |
| 앱 초기 정적 JS 합 | 1,170,078 | 327,880 | 1,142.7 | 320.2 |
| Studio에서 3D 배경 열기 증분 | 267,763 | 79,398 | 261.5 | 77.5 |
| 3D 배경에서 GLTFLoader 활성화 증분 | 44,288 | 13,063 | 43.3 | 12.8 |
| 3D 배경에서 OBJLoader 활성화 증분 | 8,603 | 2,836 | 8.4 | 2.8 |
| Studio에서 VRM 포저 열기 증분 | 497,210 | 135,133 | 485.6 | 132.0 |
| VRM 모델 로드 시 GLTF + three-vrm 증분 | 186,947 | 46,470 | 182.6 | 45.4 |

주요 개별 chunk는 `StudioBackground3D` 95,236/24,799 B gzip, R3F 155,603/49,062 B gzip, `StudioVrmPoser` 255,513/58,944 B gzip, `three-vrm` 142,659/33,407 B gzip, `GLTFLoader` 44,288/13,063 B gzip이다.

현재 구조에 Babylon creator 경로를 병행하면 3D 배경 도구의 시작 JS gzip은 약 **3.85배**(`305,625 / 79,398`)가 된다. glTF까지 처음 사용한 누적 경로는 Babylon 약 `484,257 B gzip`, 현재 Three 경로 약 `92,461 B gzip`이다. 이는 “Babylon이 나쁜 엔진”이라는 의미가 아니라, **이미 Three 코어와 R3F/VRM 생태계를 보유한 앱에 두 번째 완전한 엔진을 추가하는 비용**이다.

## 모바일·성능 위험

1. **이중 엔진 코드와 힙**: Three를 인트로/VRM에서 계속 쓰면서 Babylon을 배경에 추가하면 두 씬 그래프, 재질/텍스처 캐시, 셰이더, 로더 코드가 공존한다. 두 Canvas를 동시에 보이지 않게 해도 JS 파싱·캐시 비용은 남는다.
2. **캡처 비용**: 현재 3D 배경과 VRM 포저는 별도 output render target에서 픽셀을 읽어 `preserveDrawingBuffer`를 사용하지 않고, PNG 압축은 OffscreenCanvas Worker로 넘긴다. Babylon으로 옮겨도 동일 해상도의 GPU readback·RGBA working set·압축 비용 자체는 사라지지 않으므로 저사양 기기에서 같은 캡처 계약으로 비교해야 한다.
3. **WebGPU fallback**: Babylon WebGPU 초기화는 비동기이며 WebGL을 병행 지원한다. 모바일 브라우저/드라이버별 실패를 고려해 WebGL fallback과 동일 결과를 검증해야 하므로 WebGPU-only 번들 수치는 제품 비용의 하한이다.
4. **편집과 aggressive optimization의 충돌**: 전역 freeze, `isPickable=false`, `skipPointerMovePicking`, bounding sync 중단은 뷰어에는 유리하지만 선택·hover·transform이 핵심인 편집기에 그대로 적용할 수 없다.
5. **자산이 더 큰 병목**: 현재 샘플 VRM은 대략 1.5–19 MB다. 엔진 전환보다 LOD, texture compression, 필요 시점 로드, 썸네일 선로딩 금지가 모바일 체감에 먼저 영향을 준다. Babylon의 progressive glTF도 현재 파일을 자동 최적화하는 기능이 아니라 별도 LOD 저작/서버 구성이 필요하다.
6. **chunk 수**: creator PoC의 initial은 27개, 전체 산출물은 242개 JS chunk였다. HTTP/2에서도 저속·고지연 모바일의 최초 loader 활성화와 cache churn을 측정해야 한다.

## 재검토를 위한 단계와 통과 기준

### 0단계 — 현재 결정

- 앱 의존성에 Babylon을 추가하지 않는다.
- Three/R3F/three-vrm 기능 고도화를 계속한다.
- 당장 필요한 모바일 최적화는 엔진 교체가 아니라 모델/텍스처 예산, 선택 외 객체 freeze, DPR 동적 조절, 컨텍스트 해제 검증으로 수행한다.

### 1단계 — 엔진 중립 경계만 정리

새 엔진을 설치하지 않고 다음 계약을 인터페이스/골든 테스트로 고정한다.

- 씬 document ↔ runtime scene 변환
- select/move/rotate/scale/duplicate/delete command
- 모델 library load/instantiate/dispose
- 투명 PNG 캡처
- PNG hash 기반 재편집 복원
- undo/redo 한 단계의 의미

이 작업은 Babylon 도입과 무관하게 현재 3D 코드의 테스트 가능성을 높인다.

### 2단계 — 제품 밖 격리 실험

다음 중 하나처럼 Babylon만의 가설이 생겼을 때 `/labs` 또는 별도 실험 번들에서 실행한다.

- WebGPU compute/Node Material이 필요한 선화·조명 처리
- 수천 개 반복 배경 오브젝트에서 thin instances/AssetContainer가 필요한 장면
- `MSFT_lod` + range request를 실제로 적용한 대형 배경 스트리밍

기존 Studio route에는 포함하지 않고 feature flag와 완전한 lazy boundary를 사용한다. barrel import 대신 deep import를 유지하며, 프로덕션 CDN에 실험용 전체 chunk를 배포하지 않는다.

### 3단계 — 실기기 A/B 기준

대표 장면(소형/중형/대형), 중급 Android Chrome, 지원 대상 iPhone Safari, 데스크톱에서 Three와 같은 입력/출력을 비교한다. 아래를 모두 만족해야 다음 단계로 간다.

- 대형 대표 씬에서 p95 frame time을 **25% 이상 개선**하거나, 같은 30 FPS/메모리 한도에서 편집 가능한 객체 수를 **2배 이상** 늘린다.
- 선택/기즈모 입력 p95가 100 ms 이내이고, 30분 편집 중 지속적인 메모리 증가나 context loss가 없다.
- PNG pixel-diff, scene round-trip, undo/redo, GLB/GLTF/OBJ 골든 테스트가 모두 통과한다.
- WebGPU 실패 시 WebGL fallback이 사용자 데이터 손실 없이 동작한다.
- 대체되는 Three chunk를 제거한 뒤의 **도구-open gzip 총량**이 현재보다 15% 이상 나빠지지 않는다.
- glTF 첫 사용 시 loader 활성화 요청 수와 전송량이 목표 모바일 네트워크 예산을 통과한다.

### 4단계 — 교체만 허용

프로덕션 채택은 Babylon이 한 하위 시스템 전체를 대체할 때만 허용한다. 동일 기능에서 Three와 Babylon을 영구 병행하지 않는다.

VRM 포저까지 이전하려면 아래 추가 조건이 필요하다.

- VRM 0/1 humanoid, expression/blend shape, MToon, spring bone 기능 동등성
- 현재 포즈/표정/의상/소품/웹캠 추적 preset과 저장 형식의 완전 호환
- community VRM loader의 버전/보안/유지보수 정책과 Babylon 9.x 호환성 검증
- 기존 VRM 샘플 전체 회귀와 dispose/context restore 테스트

## 재검토 신호

다음 중 하나가 실제 제품 요구로 확정될 때 이 ADR을 다시 연다.

- Three WebGL 경로로 목표 모바일 성능을 달성하지 못하고 Babylon WebGPU PoC가 위 A/B 기준을 통과함
- 대형 3D 배경/3D Tiles/Gaussian Splat/WebXR이 핵심 유료 기능이 됨
- 공식 또는 충분히 검증된 Babylon VRM 경로가 현재 `@pixiv/three-vrm` 기능을 동등하게 제공함
- 3D 배경과 VRM을 하나의 Babylon runtime으로 통합해 Three를 완전히 제거할 수 있음

## 재현 명령

PoC 경로는 저장소 밖 `/tmp/toonspectrum-babylon-poc`이며 앱 코드와 `package.json`은 수정하지 않았다.

```bash
npm view @babylonjs/core version dist.unpackedSize
npm view @babylonjs/loaders version dist.unpackedSize
pnpm install

pnpm exec vite build variants/basic --config vite.config.ts --outDir ../../dist/basic --emptyOutDir
pnpm exec vite build variants/creator-webgl --config vite.config.ts --outDir ../../dist/creator-webgl --emptyOutDir
pnpm exec vite build variants/webgpu --config vite.config.ts --outDir ../../dist/webgpu --emptyOutDir

node measure.mjs
```

`measure.mjs`는 Vite manifest의 정적 import graph와 동적 glTF/OBJ entry graph를 따라 고유 chunk를 합산하고, 각 chunk에 gzip level 9를 적용했다. 현재 ToonSpectrum chunk도 같은 스크립트/압축 방식으로 비교했다.
