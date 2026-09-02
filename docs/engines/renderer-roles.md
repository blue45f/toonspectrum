<!-- GENERATED FILE — DO NOT EDIT BY HAND. -->
<!-- Source of truth: packages/studio-engine-registry/src/renderer-roles.ts (STUDIO_RENDERER_ROLE_LEDGER) -->
<!-- Regenerate: pnpm generate:studio-renderer-roles -->
<!-- Verify: pnpm verify:studio-renderer-roles -->

# Studio 렌더러/엔진 역할 원장

이 문서는 손으로 쓰지 않는다. `packages/studio-engine-registry/src/renderer-roles.ts` 의
`STUDIO_RENDERER_ROLE_LEDGER` 에서 `scripts/generate-studio-renderer-roles.mts` 가 생성하며,
디스크 내용이 원장과 다르면 테스트가 깨진다. 엔진 역할을 바꾸려면 문서가 아니라
원장을 고쳐야 한다.

## 역할 정의

| 역할 | 뜻 |
| --- | --- |
| `primary` | 제품 권위(authority)를 단독으로 소유한다. 오늘의 기본 엔진. |
| `provider` | 제품에 배선돼 있지만 명시적으로 선택되는 게이트형 엔진. 단독 권위 없음. |
| `reference` | 제품 픽셀 경로에 없다. parity/golden/비교 전용. |
| `lab` | 구현은 있으나 제품 호출부가 0건이다. import 스캐너가 강제한다. |

기계 검사 불변식:

1. 모든 권위는 정확히 하나의 `primary` 소유자를 가진다(아래 "소유자 없는 권위" 예외).
2. `provider`/`reference`/`lab` 은 권위를 가질 수 없다.
3. `lab` 엔진의 모듈 지정자·심볼은 `src/`, `apps/` 비테스트 소스에 0건이어야 한다.
4. 모든 근거 경로는 디스크에 실제로 존재해야 한다.

## 원장

| id | 역할 | 목표 역할 | 권위 | 근거 경로 | 후보ID | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| `babylon`<br>Babylon.js | primary (단독 소유) | — | `scene-3d-specialist` | `src/domains/creator/bg3d/studio-bg3d-babylon-specialist-entry.ts`<br>`src/domains/creator/bg3d/studio-bg3d-babylon-normal-capture.ts`<br>`src/domains/creator/bg3d/studio-bg3d-babylon-artifact-capture.ts` | — | normal/stable-id/artifact capture 같은 전문 pass 의 명시 진입점. ADR-0018 §6 에 따라 Three 실패 뒤 자동으로 mount 되지 않는 독립 엔진이다. |
| `canvas2d-draw-node`<br>Canvas2D StudioDrawNode (Konva 노드) | primary (단독 소유) | — | `raster-brush-commit` | `src/domains/creator/brush/StudioDrawNode.tsx`<br>`src/domains/creator/brush/studio-stroke-route-tournament.ts`<br>`src/domains/creator/brush/studio-stroke-surface-route.ts` | — | fail-visible 종단 경로. pointer-down admission gate 는 living-ink → hokusai → stamp → gpu → live-ink → wet-ink → dynamic → konva 순으로 레인을 고르고, 마지막 `konva` 레인이 Konva 호스트 위 Canvas2D 커밋이다. 획 시작 시 하나로 고정되며(ADR-0018) 실패해도 다른 레인으로 넘기지 않는다. |
| `canvaskit`<br>Skia / CanvasKit (WebGL 빌드) | primary (단독 소유) | — | `path-ops-quality` | `src/domains/creator/render/studio-canvaskit-adapter.ts`<br>`src/domains/creator/render/studio-canvaskit-quality-engine.ts`<br>`src/domains/creator/studio-quality-worker-entry.ts` | `E01` | Skia PathOps / stroke expansion 품질 엔진으로 Worker 에 배선돼 있다. 문서나 라이브 프레임 권위가 아니다. 고정된 canvaskit-wasm@0.41.1 은 WebGL 빌드이고 GPU island 은 ADR-0018 기준 probe-only 다. 저장 문서에는 CanvasKit 객체나 WASM 포인터가 남지 않는다(portable SVG path data 왕복). |
| `hokusai-wasm`<br>Hokusai WASM (Rust 자연매체) | primary (단독 소유) | — | `natural-media` | `packages/studio-hokusai-wasm`<br>`src/domains/creator/render/studio-hokusai-natural-media.worker.ts`<br>`src/domains/creator/render/studio-hokusai-live-brush.worker.ts` | `E12` | 자연매체(연필·목탄·유화·수채) 권위. `.myb` 페이로드가 provider-native 정본이며 Dedicated Worker 가 pkg/studio_hokusai_wasm.js 를 동적 import 한다. stroke route 의 `hokusai` 레인. |
| `konva`<br>Konva / react-konva | primary (단독 소유) | — | `document-display`<br>`pointer-input`<br>`selection-transform-chrome` | `src/domains/creator/canvas/StudioCanvasViewport.tsx`<br>`src/domains/creator/canvas/StudioCanvasViewportStageHost.tsx` | — | Konva `<Stage>` 가 문서 표시와 pointer 입력, 선택/변형 chrome 을 소유한다. ADR-0018 은 Konva 를 제거 후보로 두지만 현재 단계에서는 입력·hit-test 와 선택/변형 chrome 경계를 계속 맡는다. |
| `perfect-freehand`<br>perfect-freehand | primary (단독 소유) | — | `stroke-geometry` | `src/domains/creator/studio-perfect-freehand.ts`<br>`src/domains/creator/hybrid-dcc/studio-hybrid-brush-filter-edit-runtime.ts` | `E10` | `getStroke()` 로 pressure outline 을 만드는 결정적 stroke 기하 소유자. 정적 import 이며 hybrid-DCC 브러시/필터 편집 런타임도 같은 경로를 쓴다. |
| `pixi`<br>PixiJS | primary (단독 소유) | — | `selection-overlay-island` | `src/domains/creator/render/studio-pixi-scene-provider.ts`<br>`src/domains/creator/StudioPixiSceneOverlayHost.tsx` | — | Konva stage 위에 상시 마운트되는 선택 가능 scene 오버레이 호스트. 투명하고 pointer-events:none 이라 브러시 픽셀이나 hit-test 권위를 갖지 않는다. ADR-0018 §7 에 따라 호출자가 WebGPU 또는 WebGL 중 하나만 허용 목록으로 넘긴다(현재 제품 호스트는 WebGPU 명시 선택). 선택이 비면 렌더러를 아예 만들지 않는다. |
| `roughjs`<br>Rough.js | primary (단독 소유) | — | `shape-sketch` | `src/domains/creator/studio-rough-shape.ts`<br>`src/domains/creator/studio-rough-svg-parity.ts` | — | 손그림 느낌 도형(sketch presentation) 전용 소유자. generator 는 `import("roughjs/bin/generator")` 로 지연 로드되고, SVG parity 모듈이 같은 generator 로 출력 동등성을 확인한다. |
| `three`<br>Three.js + @pixiv/three-vrm | primary (단독 소유) | — | `scene-3d` | `src/domains/creator/vrm`<br>`src/domains/creator/bg3d`<br>`src/domains/creator/studio-background-3d-model.ts` | `E21` | 3D 장면·VRM 마네킹·raycast·표면 페인트의 기본 소유자. VRM 표면 브러시는 R3F pointer workflow 로 bounded transaction 을 만든다. |
| `vello-classic-gpu`<br>Vello Classic GPU (studio-vello-hub) | primary (단독 소유) | — | `document-vector-island` | `src/domains/creator/render/studio-vello-hub.ts`<br>`src/domains/creator/render/studio-vello-hub-capability.ts`<br>`src/domains/creator/render/studio-vello-hub-surface.tsx`<br>`src/domains/creator/render/studio-vello-hub-canvas-target.ts` | `E02` | `studio-vello-hub-document-hybrid-v13` capability 는 기본 활성이고 scope 는 `document-vector-hybrid`, documentAuthority=true, inputAuthority=false, brushPixelAuthority=false, canonicalDocumentAuthority=false 다. productWidePromotionRequiresSoak=true, persistentWinnerStorage=false 이므로 전체 문서 컷오버가 아니다. ADR-0018 은 Vello WebGPU/WASM 을 2D 문서 픽셀 권위의 목표 엔진으로 두고, 자동 폴백을 금지한다. |
| `p5-brush`<br>p5.brush standalone | provider (명시 선택) | — | — | `src/domains/creator/brush/studio-p5-brush-standalone-runtime-adapter.ts`<br>`src/domains/creator/studio-procedural-artistic-brush-provider.ts` | — | 절차적 아티스틱 브러시(수채 fill, flowfield)의 게이트형 provider. Dedicated Worker 안 private OffscreenCanvas 에서만 `p5.brush/standalone` 을 동적 import 하며, 계약 모듈 자체는 라이브러리 없이 컴파일된다. CI 잡 `verify:studio-p5-brush-real-runtime` 가 실런타임을 검증한다. |
| `paper-js`<br>Paper.js | provider (명시 선택) | — | — | `src/domains/creator/render/studio-engine-vector-geometry-provider.ts` | — | 벡터 기하 provider 안에서 지연 로드되는 경로 연산 백엔드다(`paperLibraryPromise ??= import("paper")`). 값 import 가 아니라 타입 import + 동적 import 라서 초기 정적 그래프를 오염시키지 않는다. 단독 authority 는 없다 — 2026-09-02 리뷰 시점에 "의존성만 있고 호출부 없음"으로 알려졌으나 실제로는 제품 호출부가 있어 lab 이 아니라 provider 로 판정한다. |
| `webgpu-brush-runtime`<br>전용 WebGPU 브러시 런타임 | provider (명시 선택) | primary (단독 소유) | — | `src/domains/creator/render/studio-engine-webgpu-brush-runtime.ts`<br>`src/domains/creator/render/studio-engine-vnext-brush-provider-gpu-boundary.ts`<br>`src/domains/creator/render/studio-engine-webgpu-tile-provider-v1.ts` | `E28` | stroke route 의 `gpu` 레인. 2026-09-02 아키텍처 리뷰의 목표는 이 런타임이 raster-brush-commit 의 primary 가 되는 것이지만, 오늘은 명시 선택형 provider 이고 종단 커밋 권위는 Canvas2D 가 가진다. |
| `libmypaint-wasm`<br>libmypaint WASM | reference (비교 전용) | — | — | `packages/studio-brush-platform/src/libmypaint/index.ts`<br>`packages/studio-brush-platform/src/__tests__/libmypaint-parity.test.ts` | `E11` | Hokusai 자연매체 dab 수학의 parity/golden 기준. `src/` 에서 `loadLibMypaint` 호출부는 0건이고, src 의 libmypaint 언급은 커널 출처 문자열(.myb 레시피 attribution)뿐이다. |
| `vello-cpu`<br>Vello CPU | reference (비교 전용) | — | — | `packages/studio-engine-vello`<br>`crates/studio-engine-vello`<br>`docs/engines/vello-baseline.md` | `E04` | 결정적 벡터 기준. cross-renderer diff, golden image, 명시 선택 CPU reference 로만 쓰인다. ADR-0018 §13 에 따라 GPU 실패 뒤 자동으로 호출되지 않는다. |
| `velato-lottie`<br>Velato (Vello Lottie) | lab (제품 호출부 0) | — | — | `packages/studio-engine-vello/src/lottie.ts`<br>`crates/studio-engine-vello/Cargo.toml` | `E14` | Rust `lottie` feature 가 Lottie JSON 을 Vello scene 으로 낮추고 TS 가 `renderLottieToPixelsGpu()` 를 export 하지만, 비테스트 `src/`·`apps/` 에 호출부가 0건이다. 현재 Studio Lottie 표면은 Velato 를 쓰지 않는다. |
| `vello-hybrid-sparse`<br>Vello Hybrid sparse-strip GPU (upstream) | lab (제품 호출부 0) | — | — | `src/domains/creator/render/studio-vello-hub-capability.ts` | `E03` | `STUDIO_VELLO_HYBRID_SPARSE_CANDIDATE` 는 status=`unavailable-upstream-api`, eligible=false 다. 고정된 vello 0.9 Classic 브라우저 아티팩트가 upstream vello_hybrid 0.2 sparse-strip GPU 를 채택하지 않았다. 제품의 "V13 Hybrid" 는 이 크레이트가 아니라 Classic + StudioFrameGraphCompositor 다. |
| `wesl`<br>WESL shader linker | lab (제품 호출부 0) | — | — | `packages/studio-engine-registry/src/wesl-compile.ts` | — | `compileWeslVariant()` 가 `*.wesl?raw`, `link()`, `@if`, virtual schedule module 로 WGSL variant 를 만들지만 비테스트 `src/` 호출부가 0건이다. 제품 shader 기본은 정적 WGSL / 기존 생성기다. |

## 권위별 단독 소유자

| 권위 | primary 소유자 |
| --- | --- |
| `document-display` | `konva` |
| `pointer-input` | `konva` |
| `selection-transform-chrome` | `konva` |
| `raster-brush-commit` | `canvas2d-draw-node` |
| `document-vector-island` | `vello-classic-gpu` |
| `selection-overlay-island` | `pixi` |
| `natural-media` | `hokusai-wasm` |
| `stroke-geometry` | `perfect-freehand` |
| `shape-sketch` | `roughjs` |
| `path-ops-quality` | `canvaskit` |
| `scene-3d` | `three` |
| `scene-3d-specialist` | `babylon` |

## 소유자 없는 권위

| 권위 | 이유 |
| --- | --- |
| `image-filter-island` | 필터 island 는 렌더러가 아니라 planner 가 작업 단위로 provider 를 하나 고른다(src/domains/creator/filter/studio-filter-island-plan.ts 의 one-provider planning boundary). WebGPU/dedicated worker/WASM 레인은 packages/studio-engine-registry/src/filter-providers.ts 의 descriptor 로 등록되므로, 이 원장의 어떤 단일 렌더러도 상시 소유자가 아니다. |

## lab 엔진 스캔 대상

아래 지정자·심볼은 `src/`, `apps/` 의 비테스트 `.ts`/`.tsx`/`.mts` 에서
0건이어야 한다. 위반은 테스트가 파일 단위로 보고한다.

| id | 모듈 지정자 | 제품 심볼 |
| --- | --- | --- |
| `velato-lottie` | — | `renderLottieToPixelsGpu` |
| `vello-hybrid-sparse` | `vello_hybrid` | — |
| `wesl` | `wesl` | `compileWeslVariant` |
