# ToonStudio V12 — Vello·차세대 엔진 공격적 활용·CSP 초월 인플레이스 최종 아키텍처

- 기준일: **2026-08-08**
- 문서 상태: **V11.1을 대체하는 차세대 렌더링·성능 정책 권위본**
- 개발 방식: **현재 저장소·현재 `/studio` 경계 안에서 인플레이스 전면 교체**
- 데이터 정책: **기존 ToonStudio 내부 창작 데이터 폐기, migration·legacy shim 미구현**
- 포맷 정책: PSD·PSB·ORA·SUT·SUTG·ABR·MYB·Krita 번들·SVG·PDF·영상·3D 등 **외부 포맷 호환은 최대화**
- 핵심 정책: **Frontier-first, Vello-primary, Benchmark-promoted, Failure-contained**

> V12와 V11.1 이하 문서가 충돌하면 V12를 우선한다. V11.1의 CSP 비열위 기능·인플레이스 교체·데이터 폐기·외부 포맷 최대 호환 요구는 유지한다. 변경되는 것은 차세대 엔진의 위험 허용 수준이다. V12에서는 업계 전반의 검증을 기다리지 않고, ToonStudio 내부 품질·성능·안정성 게이트를 통과한 차세대 엔진을 기본 경로로 적극 승격한다.

---

# 0. 최종 결정

## 0.1 모험의 방향

```text
검증된 엔진 우선 조사
+ 차세대 엔진을 동등한 후보가 아니라 적극적 challenger로 편성
+ 동일 문서·동일 장치에서 실측 경쟁
+ 외부 검증 이력이 부족해도 내부 CSP 승리 게이트를 통과하면 기본값 승격
+ 실패 범위는 provider·render island 단위로 격리
+ 문서·Undo·저장·복구는 엔진과 분리
= CSP를 이길 수 있는 공격적이면서 회복 가능한 아키텍처
```

## 0.2 폐기하는 보수적 원칙

```text
알파이므로 보조 기능에만 사용
업계 검증 전까지 production default 금지
CanvasKit이 항상 기준이고 Vello는 옵션
WebGPU 고급 기능은 호환성 때문에 사용 보류
차세대 엔진은 전체 제품 완성 뒤 검토
```

## 0.3 새 원칙

```text
VELLO_PRIMARY_2D_HUB=TRUE
SPARSE_STRIPS_FIRST=TRUE
RUNTIME_RENDERER_TOURNAMENT=TRUE
SHADOW_RENDERING=TRUE
VENDOR_AND_FORK_ALLOWED=TRUE
WGPU30_INTEROP_TRACK=TRUE
SKIA_GRAPHITE_CHALLENGER=TRUE
XILEM_CANVAS_UI_EXPERIMENT=TRUE
WESL_SHADER_PLATFORM=TRUE
CUSTOM_IMPLEMENTATION_ALLOWED_WITH_EVIDENCE=TRUE
IN_PLACE_GREENFIELD_REWRITE=TRUE
NEW_MONOREPO=FALSE
PARALLEL_STUDIO_APP=FALSE
LEGACY_DATA_MIGRATION=FALSE
```

## 0.4 모험과 무모함의 차이

V12는 실험 엔진을 무조건 사용자에게 노출하지 않는다. **외부 검증이 부족해도 내부 증거가 충분하면 승격한다**는 정책이다. 다음은 타협하지 않는다.

- 문서 원본은 특정 엔진 객체가 아니다.
- renderer crash가 command journal을 손상시켜서는 안 된다.
- 엔진 교체 때문에 Undo 결과가 달라져서는 안 된다.
- 시각 결과가 기준 renderer와 허용 오차를 넘으면 자동 격리한다.
- 성능 회귀가 확인되면 서버 배포 없이 원격 kill switch로 provider를 강등한다.
- 하나의 실험이 전체 Studio 출시를 막지 않도록 feature island를 분리한다.

---

# 1. 2026-08-08 차세대 엔진 기준선


| 엔진 | V12 배치 | 강점 | 주의점 |
| --- | --- | --- | --- |
| Vello Hybrid / Sparse Strips 0.2 | Studio Max 기본 2D 허브 후보 | 혼합 장면, 외부 texture, layer/filter | 초기·API 불안정 |
| Vello Classic 0.9 | Path-heavy 가속기 | 대량 선화·효과선·가이드 | 알파 |
| Vello CPU 0.2 | 결정적 기준 렌더 | 골든 이미지·복구·headless | 광범위 사용 가능·API 불안정 |
| wgpu 30 fork track | 단일 GPU fabric | zero-copy·pipeline cache·profiling | Vello upstream 29와 분기 |
| Google Ink | 전문 잉킹 | mesh stroke·BrushBehavior | 웹 포팅 필요 |
| Skia Graphite/Dawn | 고위험 raster challenger | 오버드로우·멀티스레드·effect-heavy | WASM/WebGPU 실험 |
| CanvasKit/Ganesh | 안정 기준선 | SkSL·ImageFilter·Paragraph·출력 | 검증됨 |
| ThorVG.Web | 경량 벡터/Lottie challenger | partial redraw·WebGPU/WebGL | WebGPU 일부 실험 |


## 1.1 Vello 최신 흐름을 반영한 판단

- Vello 0.9 계열은 대량 2D 장면을 GPU compute로 처리하는 Classic 경로다.
- Sparse Strips 0.2 계열은 Vello CPU와 CPU 전처리·GPU raster를 결합한 Vello Hybrid를 제공한다.
- Hybrid 0.2는 외부 texture를 WebGPU뿐 아니라 WebGL 경로에서도 바인딩할 수 있고, atlas·중간 texture 진단을 강화했다.
- Vello CPU는 광범위하게 사용할 수 있는 기준 renderer로 발전했지만 API 안정성은 아직 보장하지 않는다.
- Vello Hybrid는 빠르게 발전 중이나 CPU와 완전한 기능 동등성을 이루지 못했으므로 workload별 경쟁이 필요하다.
- Glifo 0.3 계열은 glyph cache를 Vello 공통 자원 계층과 맞추는 방향으로 발전하고 있다.

따라서 V12는 `Vello 하나를 모든 곳에 고정`하지 않고, **Vello 계열 내부에서도 Classic·Hybrid·CPU를 경쟁시키며 전체 2D scene의 중심 소유권은 Vello Hub에 준다.**

---

# 2. 최종 상위 구조

```text
현재 /studio React Shell
├─ 접근성 DOM·메뉴·패널·IME
├─ CommandRegistry
├─ Workspace Profiles
└─ Capability / Quality UI
                    │
                    ▼
CreatorProjectGraph — 영구 원본
├─ StrokeIR / BrushProgramIR
├─ PathIR / ShapeIR / PaintIR / TextIR
├─ LayerGraphIR / EffectGraphIR
├─ ComicGraph / AnimationGraph
├─ AssetGraph / FormatInteropIR
├─ Scene3DIR / MotionCaptureIR
└─ CommandJournal / RecoveryIR
                    │
                    ▼
FrontierExecutionPlanner
├─ RenderIslandCompiler
├─ RendererTournament
├─ EngineCapabilityRegistry
├─ DeviceWorkloadProfiler
├─ ShadowRenderer
├─ VisualEquivalenceGate
├─ PromotionRegistry
└─ ResourceResidencyManager
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ StudioGpuFabric — 가능한 한 하나의 WebGPU Device/Queue      │
│                                                              │
│ toon-vello Hybrid / Classic / CPU                            │
│ Vello Sparse Shaders / Glifo                                 │
│ WESL Shader Modules / Naga validation                        │
│ External Texture Registry / Pipeline Cache / GPU Telemetry   │
└──────────────────┬───────────────────────────────────────────┘
                   │ 동일 device 또는 큰 island 결과
┌──────────────────┼──────────────────┬────────────────────────┐
│ Google Ink WASM  │ Skia Graphite    │ CanvasKit / ThorVG     │
│ Emdawnwebgpu     │ Dawn challenger  │ stable/reference       │
└──────────────────┼──────────────────┴────────────────────────┘
                   │
        Feature Providers / Workers
        libmypaint · Hokusai · OpenCV · libvips
        G’MIC/GEGL · Three.js/Rapier · codecs
                   │
                   ▼
OPFS Journal + CAS + SQLite WASM + encrypted cloud backup
```

## 2.1 영구 원본과 실험 renderer 분리

다음 객체는 저장 원본이 아니다.

```text
vello::Scene
vello_hybrid::Scene
CanvasKit SkPath / SkImage
Google Ink PartitionedMesh
ThorVG Paint tree
THREE.Object3D
GPUTexture / GPUBuffer
```

이 객체들은 `CreatorProjectGraph`에서 재생성 가능한 캐시다. 실험 renderer를 교체하거나 fork를 업데이트해도 문서 의미는 유지된다.

---

# 3. Vello Hub — ToonStudio 2D 장면의 기본 소유자

## 3.1 Vello를 최대한 사용하는 범위


| 기능 | Vello 사용 방식 | 주 백엔드 | 데이터 흐름 |
| --- | --- | --- | --- |
| 벡터 선화 | 직접 | Vello Classic/Hybrid | StrokeIR 중심선·외곽선·Scene Fragment |
| 컷·말풍선·자·효과선 | 직접 | Hybrid/Classic | 대량 path와 clip/layer |
| 텍스트 | 직접 | Parley + Glifo + Vello | CJK·말풍선·효과음 |
| SVG | 직접/조건부 | vello_svg | feature scanner, resvg 기준 비교 |
| Lottie | 직접/조건부 | Velato | 미지원 노드는 ThorVG/Skottie |
| 래스터 타일 | 직접 합성 | External Texture/Image | 타일 계산은 다른 provider 가능 |
| 단순 Blur/Shadow/Flood | 직접 우선 | Vello Hybrid/CPU | capability와 시각 diff 통과 시 |
| 복합 마스크·고급 EffectGraph | 외부 계산 후 재편입 | Custom wgpu/CanvasKit/GEGL | 결과 texture를 Vello 최종 합성 |
| Google Ink mesh | 별도 pass + Vello 합성 | Google Ink WGSL | 중심선·선택 proxy는 Kurbo/Vello |
| 3D pass | 직접 합성 | Three.js depth/normal/ID texture | Vello 텍스트·선화·UI와 결합 |
| 캔버스 UI | 직접 | Vello UI scene | 커서·핸들·HUD·onion skin·light table |


## 3.2 Vello가 최종 합성 허브인 이유

1. 벡터 path, image, gradient, glyph, clip, layer를 동일 scene 언어로 표현할 수 있다.
2. Classic과 Hybrid라는 서로 다른 가속 전략을 같은 Linebender 기하·paint 생태계에서 비교할 수 있다.
3. 외부 GPU texture를 scene에 배치할 수 있어 raster·자연매체·3D 결과를 다시 Vello로 모을 수 있다.
4. Vello CPU를 시각 기준선과 장애 복구 경로로 함께 둘 수 있다.
5. Kurbo·Peniko·Color·Parley·Glifo와 데이터 표현이 자연스럽게 연결된다.
6. Vello Scene Fragment를 캔버스 UI에도 사용하면 그림과 선택 핸들·가이드·onion skin 사이의 좌표·AA·zoom 정책을 통일할 수 있다.

## 3.3 Vello Direct와 External Compute의 경계

```text
Vello Direct
- path fill/stroke
- image/gradient/glyph
- clip/layer/blend subset
- blur/shadow/flood subset
- SVG/Lottie supported subset
- vector UI overlays

External Compute
- raster dab and smudge
- wet media and pigment
- large particle systems
- complex masks and multi-input EffectGraph
- OpenCV analysis
- Google Ink mesh rendering
- 3D auxiliary passes

External result
→ shared GPUTexture 또는 large-island texture
→ Vello draw_texture_rects / image
→ text·vector·UI와 최종 합성
```

## 3.4 Vello Scene Sharding

문서 전체를 매 프레임 하나의 Scene으로 다시 작성하지 않는다.

```text
Viewport
├─ Visible Shards: full quality, immediate compile
├─ Near Shards: low-priority precompile
├─ Far Shards: proxy recording
└─ Offscreen Shards: GPU residency 해제 가능

Shard keys
- SurfaceId
- LayerId
- PanelId
- AnimationFrameRange
- TextParagraphId
- EffectIslandId
- ViewportGridCell
```

각 shard는 다음 캐시를 가진다.

```text
SceneFragment / Recording
Path fingerprint
Paint resource fingerprint
Glyph atlas dependencies
External texture handles
Bounds and dirty region
Renderer winner and confidence
Last GPU/CPU timings
Visual reference hash
```

## 3.5 Scene Fragment와 Recording

- 변경되지 않은 벡터 레이어, 말풍선, 컷 프레임, 자, 효과선, SVG 하위 트리, Lottie 정적 부분은 recording으로 유지한다.
- stroke 하나가 바뀌어도 전체 scene을 재구축하지 않고 관련 fragment만 교체한다.
- Vello API가 recording을 충분히 제공하지 않는 구간은 ToonStudio의 `RecordedSceneIR`로 감싸고 compile cache를 유지한다.
- Classic의 `Scene::append`가 O(N)이므로 대형 scene에서 매 프레임 append하는 구조는 피하고 encoding fragment 또는 viewport shard를 사용한다.

---

# 4. Renderer Tournament — 검증되지 않은 엔진을 기본값으로 만드는 안전한 방법

## 4.1 정적 라우팅을 폐기

`벡터=Vello`, `텍스트=CanvasKit`처럼 이름만으로 고정하지 않는다. 동일한 RenderIsland를 여러 provider가 컴파일할 수 있게 한다.


| Workload | 1순위 challenger | 안정 기준 | 선택 신호 |
| --- | --- | --- | --- |
| 대량 path, 이미지 적음, 매 프레임 변형 | Vello Classic | Vello Hybrid | path count·change rate·GPU time |
| 이미지·텍스트·레이어·필터 혼합 | Vello Hybrid 0.2 | CanvasKit | atlas·filter memory·p95 |
| 정적 SVG 정확성 | resvg | Vello SVG | feature coverage·pixel diff |
| 대화형 SVG | vello_svg + Vello | ThorVG | edit latency·unsupported nodes |
| Lottie UI/효과 | Velato 또는 ThorVG | Skottie | feature scanner·frame time |
| 래스터 필터-heavy | Graphite challenger 또는 CanvasKit | Custom wgpu | overdraw·pass count·compile jank |
| 전문 G펜 | Google Ink + WGSL | Kurbo/Perfect Freehand + Vello | latency·blind preference·editability |
| 자연매체 | Hokusai 또는 libmypaint | ToonWet extension | brush-specific benchmark |
| 결정적 export | Vello CPU/Skia CPU/resvg | libvips | hash·visual diff·memory |


## 4.2 Scene Fingerprint

```rust
struct SceneFingerprint {
    path_count: u32,
    curve_segment_count: u64,
    changed_path_ratio: f32,
    glyph_count: u32,
    unique_font_count: u16,
    image_count: u32,
    external_texture_count: u16,
    gradient_count: u32,
    layer_count: u16,
    mask_depth: u16,
    filter_nodes: u16,
    max_filter_radius: f32,
    visible_bounds_ratio: f32,
    animation_rate: f32,
    expected_overdraw: f32,
}
```

## 4.3 Device·Workload Profile

결정은 다음 키로 저장한다.

```text
GPU adapter/vendor/device
browser engine/build
OS
engine commit/hash
shader package hash
scene fingerprint bucket
viewport resolution and DPR
color space
quality profile
```

첫 실행의 소형 microbenchmark, 실제 작업 프레임, canary shadow render를 결합해 winner를 갱신한다.

## 4.4 Hysteresis

- 예상 이득이 12% 미만이면 현재 provider를 유지한다.
- 최소 120 frame 또는 명시적 scene boundary 전에는 교체하지 않는다.
- pen-down 동안 provider를 바꾸지 않는다.
- provider 교체는 동일 texture boundary에서만 수행한다.
- 3회 연속 회귀 또는 1회 correctness blocker가 발생하면 자동 격리한다.

## 4.5 Shadow Rendering

Production 사용자에게는 winner 결과만 표시한다. 다음 조건에서 대체 renderer를 저빈도로 실행한다.

```text
개발 빌드: 10~100%
내부 canary: 5%
일반 Studio Max: 0.1~1%, 유휴 시간·사용자 opt-in
```

비교 결과:

- pixel/SSIM/edge diff
- glyph 위치 diff
- blend·premultiply diff
- GPU time·CPU preparation time
- peak allocation·atlas fragmentation
- error scope·device loss

사용자 작품 원본이나 협업 결과에는 shadow output을 사용하지 않는다.

---

# 5. `toon-vello` 공격적 fork 전략

## 5.1 fork를 숨은 임시 패치가 아니라 정식 제품 자산으로 관리

현재 저장소 안에 새 monorepo가 아닌 다음 경계를 둔다.

```text
<existing-studio-root>/vendor/vello-upstream/
<existing-studio-root>/patches/vello/
<existing-studio-root>/engines/vello-adapter/
<existing-studio-root>/tests/vello-corpus/
```

Git submodule 여부는 현재 저장소 정책에 맞추되, 빌드에는 정확한 commit과 patch hash가 기록되어야 한다.

## 5.2 두 빌드 트랙

```text
Track A — upstream-compatible
Vello 0.9 / Sparse Strips 0.2 / wgpu 29
→ 기준·빠른 업데이트·문제 분리

Track B — toon-vello-next
Sparse Strips 중심 + wgpu 30 rebase
→ WebGPU interop·pipeline cache·allocator report·HDR 연구
```

두 트랙을 한 화면에 상주시킬 필요는 없다. CI와 benchmark에서 둘을 만들고, 배포 artifact는 선택된 track만 동적 로드한다.

## 5.3 우선 patch backlog

1. 기존 `GPUDevice/GPUQueue` 주입 또는 underlying WebGPU handle 안정 노출.
2. 외부 `GPUTexture` import/export와 명확한 lifetime callback.
3. external texture format·color space·premultiplication metadata.
4. scene fragment/recording의 증분 compile API.
5. viewport shard와 dirty bounds 기반 submit.
6. mask/filter node hook과 custom pass boundary.
7. image/glyph atlas residency·fragmentation telemetry.
8. pipeline cache key와 shader variant telemetry.
9. device-lost 이후 renderer·resources 재구성.
10. timestamp query 기반 pass별 GPU profiler.
11. deterministic probe와 Vello CPU cross-check.
12. panic 가능 입력을 Result/capability error로 전환.
13. large path count에서 encoding memory estimate와 admission control.
14. worker thread pool reset·document switch safety.
15. WebGPU/WebGL external texture path의 동일 API adapter.

## 5.4 upstream 원칙

- 일반적인 수정은 작은 PR로 upstream 제안한다.
- ToonStudio 전용 의미는 adapter에 유지한다.
- fork diff를 분기 하나의 거대한 patch로 만들지 않는다.
- 매 upstream release마다 자동 rebase test와 visual corpus를 실행한다.
- fork가 90일 이상 upstream에서 멀어지면 기술 부채 경고를 띄운다.

---

# 6. StudioGpuFabric와 zero-copy interop

## 6.1 단일 device 소유권

가능하면 Rust/wgpu가 browser `GPUDevice`와 `GPUQueue`를 생성·소유한다.

```text
wgpu Device/Queue
→ as_webgpu()로 JS GPUDevice/GPUQueue 노출
→ Emdawnwebgpu C++ provider에 같은 handle 전달
→ provider가 만든 GPUTexture를 반환
→ create_texture_from_webgpu_handle()로 wgpu Texture에 무복사 래핑
→ Vello/Final compositor가 사용
```

이 경로는 wgpu 30의 WebGPU handle API를 이용하는 **고위험·고보상 PoC**다. 성공하면 Google Ink, ThorVG WebGPU, Skia Graphite 실험 결과를 CPU readback 없이 같은 GPU fabric에 연결할 수 있다.

## 6.2 GpuInteropBroker

```rust
struct ExternalTextureDescriptorIR {
    provider: ProviderId,
    device_epoch: u64,
    width: u32,
    height: u32,
    format: TextureFormatIR,
    color_space: ColorSpaceIR,
    alpha_mode: AlphaModeIR,
    usage: TextureUsageIR,
    lifetime: LifetimePolicy,
    completion: GpuFenceIR,
}
```

Broker가 담당하는 것:

- same-device 확인
- texture usage·format 검증
- command submission 순서
- provider별 resource quota
- drop callback·pool slot 반환
- device epoch 변경 시 invalidation
- color/premultiply contract
- cross-provider hazard 방지
- GPU 오류와 provider 격리

## 6.3 실패 시 폴백 순서

```text
L4 same GPUDevice + shared GPUTexture
L3 same GPUDevice + GPU copyTextureToTexture
L2 ImageBitmap / VideoFrame transfer
L1 SharedArrayBuffer tile upload
L0 CPU readback — export/diagnostic 외 금지
```

L4가 실패해도 provider 하나의 객체마다 L2/L1을 수행하지 않는다. 큰 render island의 결과만 저빈도로 교환한다.

---

# 7. Linebender 공통 언어

## 7.1 Kurbo

Kurbo는 다음의 공통 geometry engine이다.

- Bezier fitting·flattening·subdivision
- stroke outline·dash·variable width 후처리
- 교차점·trim·split·join
- 패턴 brush arc-length placement
- 자·투시자·말풍선 꼬리
- 3D 선화 curve fitting
- XPBD ribbon의 vector bake
- Google Ink mesh의 편집 중심선 proxy

복잡 Boolean은 Manifold/Clipper/flatten-js 등 별도 provider와 교차 검증한다.

## 7.2 Peniko + Color

- PaintIR를 Peniko brush·gradient·image·blend와 매핑한다.
- 작업 내부는 linear-light·premultiplied alpha를 기본으로 한다.
- UI는 OKLab/OKLCH 중심 조절을 제공한다.
- Display P3/extended sRGB/HDR surface는 capability와 장치 검증 후 Studio Max에서 사용한다.
- 인쇄 CMYK·ICC soft proof는 OCIO/LCMS 별도 파이프라인으로 유지한다.

## 7.3 Parley + Glifo

```text
TextIR
→ Fontique font discovery
→ HarfRust shaping
→ Skrifa outlines/metrics
→ ICU4X segmentation
→ Parley paragraph layout
→ Glifo glyph cache
→ Vello glyph runs
```

추가 기능:

- CJK line breaking과 사용자 override
- 불규칙 말풍선 내부 exclusion region
- 번역 후 자동 reflow
- 효과음 outline·gradient/image fill
- Ruby·세로쓰기·금칙은 `TextExtensionIR`로 구현하고 HarfBuzz/CanvasKit reference와 비교
- 같은 문단을 Vello와 CanvasKit에서 shadow render하여 glyph 위치 회귀를 탐지

---

# 8. Xilem·Masonry를 웹 Studio에서 공격적으로 활용하는 방법

## 8.1 React 전체 교체는 하지 않는다

React DOM은 다음에 남긴다.

- 메뉴·패널·폼·IME
- 스크린 리더와 접근성
- 브라우저 파일·클립보드·권한 UI
- 결제·계정·협업 관리

## 8.2 `CanvasWidgetIsland`

Xilem의 view diff와 Masonry retained tree 개념을 Rust/WASM 캔버스 UI에 적용한다.

```text
CanvasWidgetIR
├─ BrushCursor
├─ TransformHandles
├─ VectorAnchors
├─ SelectionHUD
├─ PerspectiveRuler
├─ OnionSkinControls
├─ LightTableOverlay
├─ TimelineScrubber
├─ CameraSafeArea
├─ MiniMap
└─ CollaborationPresence
```

이 widget은 Vello scene fragment로 렌더하므로 그림과 동일한 좌표·zoom·AA를 사용한다.

## 8.3 Pen Display Surface Mode

키보드가 없는 액정 태블릿에서 다음을 실험한다.

- Vello 기반 방사형 HUD
- 손가락·펜 역할 분리
- dwell·barrel button·chord gesture
- timeline·layer mini-controls를 캔버스 가까이에 배치
- Xilem/Masonry diff로 변경된 widget만 invalidation

승격 조건:

- React overlay 대비 pointer latency 동률 이상
- focus·IME·screen reader 회귀 없음
- 120Hz에서 UI repaint budget 충족
- 이벤트 replay test가 결정적

미달이면 Xilem은 architecture reference로 남고 React+Vello overlay가 production이다.

---

# 9. WESL Shader Platform

## 9.1 목적

BrushGraph와 EffectGraph가 수백·수천 프리셋으로 늘어날 때 거대한 단일 WGSL 문자열을 생성하지 않는다.

```text
WESL packages
├─ brush/input
├─ brush/dab
├─ brush/pigment
├─ effect/color
├─ effect/blur
├─ effect/tone
├─ compositor/blend
├─ particles
└─ diagnostics
```

## 9.2 컴파일 흐름

```text
Typed BrushGraph / EffectGraph
→ constant folding
→ node fusion
→ WESL imports + @if specialization
→ WGSL generation
→ Naga validation/reflection
→ browser shader compilation
→ pipeline cache
→ device-specific benchmark
```

## 9.3 shader 안전

- plugin shader는 임의 bind group을 만들지 못한다.
- input/output format, workgroup, memory budget, bounds, determinism을 manifest에 선언한다.
- loop·storage write·texture access policy를 정적 검사한다.
- NaN/Inf·out-of-bounds·tile seam corpus를 통과해야 한다.
- pipeline variant 수에 budget을 두고 compile jank를 기록한다.
- 잘못된 shader는 provider만 격리하고 문서는 CPU/reference path로 재렌더한다.

---

# 10. Skia Graphite·Dawn Challenger Lane

## 10.1 왜 포함하는가

Graphite는 현대 GPU API, multithreaded Recorders, depth 기반 overdraw 감소, pipeline 수 통합을 목표로 한다. Chrome의 특정 Apple Silicon benchmark에서 의미 있는 개선을 보였으므로 ToonStudio의 raster·filter-heavy 장면에서 시험할 가치가 있다. 단, CanvasKit/Graphite WebGPU WASM은 아직 build·device-loss 위험이 있어 연구 lane으로 시작한다.

## 10.2 구성

```text
Custom Skia Build
+ Graphite
+ Dawn / Emdawnwebgpu
+ same browser GPUDevice PoC
+ Recorder per raster/effect island
+ Vello final composition
```

## 10.3 우선 workload

- 이미지·레이어·clip이 많은 2D raster scene
- 대형 UI tile·thumbnail
- CanvasKit ImageFilter와 SkSL effect graph
- overdraw가 큰 말풍선·패널·UI scene
- multi-threaded recording이 유리한 정적 layer

## 10.4 승격 조건

- Ganesh/CanvasKit보다 p95 20% 이상 우위 또는 같은 성능에 메모리 20% 절감
- 동일 GPUDevice texture 교환 성공
- 8시간 device-loss 0 blocker
- golden visual diff 통과
- pipeline warmup 이후 사용자 입력 중 compile stall 없음
- WASM artifact·startup budget 통과

미달이면 Graphite는 계속 Shadow/Lab에 머물고 Ganesh·Vello가 production을 담당한다.

---

# 11. Google Ink·Vello 전문 잉킹

## 11.1 최종 파이프라인

```text
Pointer raw/coalesced/predicted samples
→ Device Calibration
→ Google Ink Stroke Modeler
→ BrushBehavior
→ InProgressStroke incremental mesh
→ Google Ink WGSL / shared WebGPU texture
→ Vello final scene

동시에
→ Kurbo editable centerline
→ Vello selection proxy·anchor·ruler interaction
```

## 11.2 단계별 포팅

1. Google Ink geometry·brush·stroke·storage 모듈만 C++ WASM으로 빌드.
2. Android Mesh rendering 유틸은 사용하지 않는다.
3. 초기에는 mesh delta를 Rust wgpu buffer로 upload.
4. 다음 단계에서 Emdawnwebgpu로 같은 device와 buffer/texture 공유.
5. BrushBehavior를 ToonStudio `BrushProgramIR`에 round-trip 매핑.
6. 압력·tilt·azimuth·twist·velocity·distance·time·tool type을 보존.
7. partial erase·split·selection·serialization을 `StrokeEditIR`로 노출.

## 11.3 Vello와 역할 중복 금지

Google Ink mesh를 매 프레임 Vello path로 tessellate하지 않는다.

- mesh 본체: Google Ink render pass
- 편집 중심선·bounding outline: Kurbo/Vello
- final layer·text·mask·UI: Vello
- export: mesh 유지 또는 high-quality raster/vector approximation

## 11.4 승격 게이트

- 최신 안정 CSP와 전문 G펜 20종 blind preference 동률 이상
- input→preview p95 8ms 이하
- 120Hz pen display에서 frame miss budget 통과
- mesh delta가 전체 mesh 재전송 대비 명확한 우위
- 장치 6종 이상 pressure/tilt calibration
- 8시간 continuous inking에서 메모리 증가 한도 통과

---

# 12. 브러시 시스템 — 수량 제한 없이 차세대 engine composition

## 12.1 Provider가 아니라 `Brush Program`을 제품 단위로 본다

```text
BrushProgram
├─ Input Model
├─ Stabilizer
├─ Dynamics Graph
├─ Geometry Generator
├─ Tip/Texture Material
├─ Color/Pigment Model
├─ Physics/Wet Media
├─ Renderer
├─ Composite Policy
├─ Editability Policy
└─ Export Policy
```

하나의 브러시는 여러 provider를 사용할 수 있다.

## 12.2 대표 공격적 조합


| 브러시 | Studio Max 조합 | 안정 경로 |
| --- | --- | --- |
| G펜·매핑펜 | Google Ink model/mesh + Kurbo centerline + Vello UI/composite | Perfect Freehand/Lyon + Vello |
| 캘리그래피 | Google Ink BrushBehavior + tilt/twist + multi-coat + Vello | Kurbo nib outline + CanvasKit |
| 모노라인·기술펜 | Kurbo/Lyon + Vello Classic | CanvasKit |
| 연필·샤프 | Graphite/CanvasKit raster challenger + paper material + Vello overlay | libmypaint/Hokusai |
| 색연필·목탄 | libmypaint/Hokusai dynamics + spectral/paper + Vello texture composite | CanvasKit textured dab |
| 수채·수묵 | Hokusai/libmypaint injection + ToonWet optional compute + Vello final | static natural-media bake |
| 유화·과슈 | libmypaint pickup/deposit + optional viscosity/height extension + Vello | Hokusai |
| 스머지·믹서 | libmypaint/Hokusai + multi-layer texture references | CanvasKit/custom gather |
| 장식·패턴 | Kurbo arc-length + vello_svg/ThorVG + Vello recording | CanvasKit image stamps |
| 파티클 | GPU provider + Vello vector/texture composite | ThorVG/Pixi fallback |
| 리본·헤어·로프 | XPBD guide curve + Kurbo fitting + Vello bake | spring spline |
| 텍스트 브러시 | Parley glyph run + Glifo + Vello | CanvasKit Paragraph |
| 3D 표면 브러시 | Three.js hit/UV + GPU texture + Vello overlay | UV image edit |


## 12.3 Golden Set과 무제한 Catalog

- Golden Set 128~200개: 장치·엔진·버전 회귀 시험 묶음.
- 공식 Catalog: 품질 게이트를 통과하는 한 수량 제한 없음.
- 외부 Pack/Marketplace: SUT·SUTG·ABR·MYB·Krita bundle 등 제한 없음.
- Catalog 수를 늘리기 위해 엔진을 복제하지 않고 BrushProgram 조합과 parameter space를 사용한다.
- 모든 preset에는 실제 획 sheet, 장치별 결과, provider 버전, 라이선스, visual diff가 붙는다.

## 12.4 Vello 활용 확대

- 벡터/패턴/장식/텍스트 브러시는 Vello scene fragment로 직접 캐시한다.
- raster·자연매체는 Vello 외부 texture로 들어오되 transform·clip·blend·text와 최종 합성은 Vello가 맡는다.
- brush cursor, pressure preview, stabilizer rope, predicted/actual diff도 Vello overlay다.
- 같은 브러시의 vector centerline과 raster material을 하나의 StrokeIR로 연결한다.

---

# 13. 필터 시스템 — Vello native subset을 최대한 넓히고 나머지만 island화

## 13.1 EffectGraph Compiler

```text
EffectGraphIR
→ type/color-space propagation
→ bounds/halo analysis
→ Vello-native subsequence detection
→ pass fusion
→ renderer tournament
→ preview/final variants
→ cache/residency plan
```

## 13.2 Provider 배치


| 필터군 | 공격적 우선 경로 | 기준/폴백 |
| --- | --- | --- |
| Solid/Gradient/Image/Opacity/기본 blend | Vello native | CanvasKit |
| Gaussian blur·Flood·Drop shadow·Inset shadow 근사 | Vello Hybrid/CPU 우선 | CanvasKit ImageFilter |
| Color matrix·Exposure·HSL·LUT | CanvasKit SkSL 또는 WESL custom | GEGL/G’MIC |
| 대형 blur·bloom | Graphite/CanvasKit 또는 specialized wgpu | libvips final |
| Canny·contour·morphology | OpenCV | GEGL/custom Rust |
| Liquify·mesh warp | GPU effect provider | CanvasKit/custom |
| 스크린톤·망점·속도 효과 | Vello geometry + shader/image material | CanvasKit |
| 복합 multi-input DAG | GEGL/custom EffectGraph island | CanvasKit |
| 예술·복원 600+ 계열 | G’MIC dynamic provider | GEGL |
| 초대형 export·resize | libvips | Skia CPU |
| SVG 기준 렌더 | resvg | Vello SVG |
| Depth/Normal/ID 효과 | Three.js pass + Vello composite | CanvasKit |


## 13.3 Vello native segment fusion

EffectGraph 전체를 Vello 밖으로 빼지 않는다.

```text
Vello native nodes A-B-C
→ External complex node D-E
→ Vello native nodes F-G
```

컴파일 결과:

```text
Vello Scene Fragment A-C
→ external texture island D-E
→ Vello Scene Fragment F-G + final layer composition
```

Vello native 구간은 scene fragment와 filter output cache를 재사용한다.

## 13.4 Shader Tournament

같은 blur, tone, LUT도 한 구현에 고정하지 않는다.

- Vello Hybrid
- CanvasKit/SkSL
- Graphite challenger
- WESL custom provider
- libvips final

장치·반경·해상도·색공간별 winner를 저장한다.

---

# 14. 만화 제작·애니메이션에서의 Vello 우위 활용

V11.1의 CSP 비열위 요구를 유지하면서 Vello를 연결 엔진으로 사용한다.

## 14.1 만화 제작 Transaction

```text
Panel Create
→ Panel Folder
→ Clip/Mask
→ 2D/3D Camera
→ Reading Order Node
→ Tone/Effect Scope
→ Balloon Scope
→ Export Region
```

Vello가 담당:

- panel border·gutter preview
- 투시·대칭·어안·특수 자
- 속도선·집중선·flash
- 말풍선·꼬리·텍스트
- vector tone mask와 모아레 preview
- reading-order overlay
- webtoon spacing heatmap
- selection/edit handles

## 14.2 Animation Scene Fragments

각 cel·drawing level은 Vello Scene Fragment 또는 raster texture reference를 유지한다.

```text
Cel
├─ Vector Recording
├─ Raster Tile Set
├─ Text/Balloon Recording
└─ Effect Island Cache
```

Vello가 담당:

- onion skin tint·opacity·blend
- light table image transform·clip
- camera frame·safe area·multiplane overlay
- keyframe path·motion trail
- timeline thumbnail vector overlay
- guide·registration peg·field chart

## 14.3 세부 동선

- 셀 생성 시 exposure와 drawing level을 분리하고 안정 ID를 부여한다.
- Timeline·X-sheet·Graph Editor가 같은 command를 실행한다.
- light table 이미지는 transform·opacity·tint·pin을 비파괴 저장한다.
- onion skin은 이전/다음 N개, 선택 셀, motion-aware alignment를 지원한다.
- camera는 2D·multiplane·3D를 같은 CameraGraph로 관리한다.
- 오디오는 waveform proxy, scrub, marker, lip timing, keyframed volume을 제공한다.
- batch output은 Vello CPU/Skia/libvips/WebCodecs provider를 job별로 선택한다.

---

# 15. 소재 생태계와 차세대 engine metadata

AssetPackage에는 단순 파일뿐 아니라 engine compatibility를 저장한다.

```text
AssetPackage
├─ source format/original blob
├─ normalized IR
├─ provider requirements
├─ renderer variants
├─ real-stroke previews
├─ device profiles
├─ visual equivalence report
├─ license/SPDX/provenance
├─ semver/dependencies
└─ marketplace metadata
```

Vello 관련 소재:

- Scene Fragment brush stamp
- SVG decorative pack
- Lottie/Velato effect pack
- Vello shader-compatible gradient/image materials
- Parley text styles·balloon layouts
- Kurbo ruler/panel geometry recipes

Marketplace는 stable path와 Studio Max path의 결과를 모두 미리 보여준다.

---

# 16. 성능 아키텍처

## 16.1 Frame Budget

```text
Input capture                  0.3~0.5ms target
Preview geometry/model         1~2ms
GPU submit preparation         1~2ms
GPU render/composite           remaining budget
Storage/telemetry              frame 밖 비동기
```

60Hz 16.67ms와 120Hz 8.33ms를 별도 profile로 관리한다.

## 16.2 Vello-specific 최적화

- Hybrid image/glyph atlas를 document session 동안 유지한다.
- image/gradient/glyph resource fingerprint로 중복 upload를 막는다.
- 외부 texture는 tile atlas page 단위로 등록한다.
- blur/shadow bounds를 정확히 계산해 intermediate texture를 줄인다.
- scene reset/reuse와 resize를 구분한다.
- CPU preprocessing은 WASM threads를 사용하되 pen-down critical path와 분리한다.
- changed path ratio가 낮으면 recording 재사용, 높으면 Classic full GPU path를 고려한다.
- font/glyph cache는 language·size·variation coordinate별로 shard한다.

## 16.3 wgpu 30 연구 기능

- pipeline cache로 첫 도구 사용 시 compile jank 감소.
- allocator report로 GPU 메모리 누수·fragmentation 진단.
- device-lost callback과 error scope를 provider boundary에 연결.
- surface color-space capability로 P3/HDR Studio Max profile 실험.
- browser WebGPU에 없는 native-only 기능은 critical path에서 사용하지 않는다.
- experimental feature는 device capability와 shader corpus를 통과한 경우만 활성화한다.

## 16.4 엔진 상주 제한

한 surface에서 동시에 활성화할 큰 엔진의 기본 상한:

```text
Vello Hub 1
+ raster/natural provider 1
+ optional 3D provider 1
+ background reference/export provider 1
```

Graphite·CanvasKit·ThorVG·Google Ink를 모두 매 프레임 전체 화면 renderer로 실행하지 않는다.

---

# 17. 안정성과 실험 격리

## 17.1 Provider Fault Domain

각 실험 provider는 다음 중 하나로 격리한다.

- Rust module with Result boundary
- dedicated WASM Worker
- C++ WASM Worker
- render island with replaceable texture
- export job process/ToonBridge

## 17.2 Hot Failover

```text
provider error/device loss/visual gate fail
→ current command transaction 보류
→ last valid island texture 유지
→ stable provider로 동일 IR 재컴파일
→ 화면 교체
→ journal commit
```

사용자가 그린 stroke의 원본 sample과 command는 provider error 전에 journal에 staging되어 있어야 한다.

## 17.3 Device Loss

- GPU resource는 `device_epoch`로 표시한다.
- device가 바뀌면 external texture·pipeline·atlas를 모두 invalid 처리한다.
- Vello SceneIR와 tile blobs에서 재구성한다.
- device loss 도중 생성된 command는 CPU staging queue에 보관한다.
- 복구 실패 시 Vello CPU/CanvasKit software read-only-safe mode로 문서를 연다.

## 17.4 장시간 시험

- 8시간 일반 작화
- 24시간 animation·audio·3D 혼합
- 100만 stroke command replay
- 1,000회 renderer switch
- 1,000회 document open/close
- GPU device loss 100회
- Worker kill 1,000회
- atlas exhaustion·storage quota·corrupt blob fault injection

---

# 18. 차세대 엔진 승격 단계


| 단계 | 사용 범위 | 필수 보호장치 |
| --- | --- | --- |
| L0 연구 | 독립 PoC·feature flag | 제품 문서/저장 원본과 분리 |
| L1 계측 | 실제 Studio corpus 렌더 | 성능·메모리·시각 로그 수집 |
| L2 Shadow | 사용자에게 stable 결과 표시, 차세대 경로를 백그라운드 저빈도로 비교 | 문서 영향 없음 |
| L3 Opt-in | Studio Max 실험 옵션 | kill switch·즉시 fallback |
| L4 기본 | 해당 workload에서 기본 provider | 내부 CSP/기준 엔진 승리 게이트 통과 |
| L5 Core | 장기 기본 경로 | 2개 릴리스·8/24시간 soak·crash budget 통과 |


## 18.1 내부 검증이 외부 검증을 대체하는 조건

차세대 엔진은 GitHub star, 대기업 채택, 장기간 업계 사용을 기다리지 않는다. 다음이 있으면 승격할 수 있다.

- ToonStudio 실제 문서 corpus
- 최신 안정 CSP 직접 비교
- stable reference renderer와 시각 동등성
- p50/p95/p99 latency와 throughput
- GPU/CPU memory와 allocation trace
- device/driver/browser matrix
- 장시간 soak와 fault injection
- 원격 kill switch와 자동 fallback

## 18.2 연구 예산

각 release engineering budget 권장:

```text
55% production/core hardening
35% promoted frontier engines
10% high-risk lab
```

제품 runtime은 이 비율대로 엔진을 동시에 실행하는 것이 아니다. 개발 투자와 검증 예산 배분이다.

---

# 19. CSP 초월 승리 게이트


| 평가 | V12 출시/승격 기준 |
| --- | --- |
| G펜 입력→첫 표시 p95 | 8ms 이하이며 동일 장치 최신 안정 CSP보다 동률 이상 |
| 대형 1000px 브러시 | 동일 corpus에서 CSP 대비 20% 이상 처리량 우위 목표 |
| 벡터 Path 10만/100만 | 편집·pan/zoom p95와 메모리에서 CSP 우위 |
| 4K 필터 chain | 10개 비파괴 노드 연속 조절 60fps 목표 |
| 8K·100 레이어 | 기본 작화·탐색·Undo·autosave 비차단 |
| 30,000px 웹툰 | viewport shard·타일 편집 지속 |
| 만화 핵심 30개 동선 | 클릭·포인터 이동·완료 시간 CSP 이하 |
| 애니메이션 핵심 20개 동선 | 셀·라이트테이블·onion·camera·audio·batch output CSP 이하 |
| 장시간 안정성 | 8시간/24시간 soak, GPU device loss·Worker kill·tab crash 무손실 복구 |
| 시각 품질 | 브러시 100+ Golden set 블라인드 선호 동률 이상 |


## 19.1 비교 규칙

- 비교 시점의 최신 안정 CSP를 사용한다.
- 같은 PC·GPU·태블릿·해상도·색공간·레이어 수를 사용한다.
- cold/warm 상태와 60/120Hz를 분리한다.
- 평균만 보지 않고 p50/p95/p99를 기록한다.
- 내부 timestamp와 GPU query를 사용한다.
- 브러시 품질은 블라인드 평가와 실제 작업 완료 시간을 함께 측정한다.
- 기능 수가 많아도 작업 동선이 길면 실패다.

---

# 20. 기존 Studio 인플레이스 전면 교체 단계

## Phase 0 — 현재 경계와 기준 측정

- 실제 Studio route/build/deploy/auth/storage/worker 경계를 기록한다.
- 기존 코어 중 재사용·삭제 대상을 분류한다.
- 최신 안정 CSP와 현재 ToonStudio benchmark corpus를 고정한다.
- 새 monorepo·새 route·병렬 Studio를 만들지 않는다.

## Phase 1 — 영구 IR와 Journal

- CreatorProjectGraph
- CommandRegistry/Undo
- StrokeIR/PathIR/PaintIR/TextIR
- LayerGraph/EffectGraph
- append-only journal/snapshot/CAS
- 구 schema migration은 만들지 않는다.

## Phase 2 — Vello Hub vertical slice

```text
한 획 입력
→ Kurbo path
→ Vello Hybrid/Classic 후보 compile
→ Renderer Tournament 선택
→ Vello texture present
→ journal 저장
→ reload 복구
```

- Vello CPU golden output도 함께 만든다.
- `/studio`가 새 vertical slice를 직접 실행한다.

## Phase 3 — Sparse Strips·recording·external texture

- Vello Hybrid 0.2 integration
- scene shard/recording cache
- external raster tile texture
- Glifo/Parley text
- SVG/Lottie feature scanner

## Phase 4 — toon-vello-next / wgpu 30

- upstream-compatible build 유지
- wgpu 30 rebase branch
- GpuInteropBroker
- zero-copy texture PoC
- pipeline cache·allocator report·device-loss telemetry

## Phase 5 — Google Ink·WESL

- C++ WASM stroke core
- mesh delta path
- WESL Brush/Effect modules
- CSP professional inking gates

## Phase 6 — Graphite/Xilem frontier

- Skia Graphite+Dawn challenger
- CanvasWidgetIsland
- Pen Display Surface Mode
- shadow rendering과 promotion registry

## Phase 7 — 무제한 브러시·필터·소재

- libmypaint/Hokusai
- CanvasKit/ThorVG/G’MIC/GEGL/OpenCV/libvips
- Brush Fidelity Lab
- Asset Marketplace metadata

## Phase 8 — 만화·애니메이션 완성

- ruler/panel/balloon/tone/effect/story workflow
- cel/light table/onion/camera/audio/keyframe/batch output
- Vello scene fragment 기반 작업 동선 최적화

## Phase 9 — 운영 컷오버와 구 시스템 제거

- 기존 `/studio` 100% 새 구현
- legacy renderer/storage/worker/API/fallback 제거
- 기존 내부 Studio 데이터 명시적 파괴 초기화
- 외부 format import/export 유지
- 모든 CSP 승리·안정성 gate 통과

---

# 21. 현재 Studio 내부 권장 모듈 경계

```text
<existing-studio-root>/
├─ core/
│  ├─ project-graph
│  ├─ command-registry
│  ├─ scene-ir
│  ├─ brush-ir
│  ├─ effect-ir
│  ├─ comic
│  ├─ animation
│  ├─ asset-graph
│  └─ recovery
├─ engines/
│  ├─ vello-hub
│  ├─ vello-adapter
│  ├─ google-ink
│  ├─ skia
│  ├─ graphite-lab
│  ├─ thorvg
│  ├─ mypaint
│  ├─ hokusai
│  ├─ opencv
│  └─ large-image
├─ gpu/
│  ├─ fabric
│  ├─ interop-broker
│  ├─ shader-platform
│  ├─ texture-registry
│  ├─ profiler
│  └─ device-recovery
├─ planner/
│  ├─ render-islands
│  ├─ tournament
│  ├─ shadow-renderer
│  └─ promotion-registry
├─ workers/
├─ ui/
│  ├─ react-shell
│  └─ canvas-widget-islands
└─ tests/
   ├─ csp-corpus
   ├─ visual-golden
   ├─ engine-tournament
   ├─ fault-injection
   └─ soak
```

실제 폴더명은 현재 저장소 관례에 맞춘다. 버전 접미사나 병렬 app root를 만들지 않는다.

---

# 22. 위험 레지스터


| 위험 | 대응 |
| --- | --- |
| Vello API·출력 변화 | pinned commit, adapter, scene IR, fork patch queue, golden diff |
| Vello Hybrid가 특정 workload에서 느림 | Renderer Tournament가 Classic/CanvasKit/CPU로 자동 선택 |
| wgpu 30 fork 장기 유지비 | upstream 29 build를 항상 빌드 가능 상태로 유지하고 patch를 작은 단위로 upstream |
| 동일 GPUDevice 공유 실패 | 큰 island 단위 texture copy; per-object/매-frame CPU readback 금지 |
| Graphite WASM compile/device-loss | Lab track; release blocker 아님; Ganesh fallback |
| Google Ink 웹 포팅 지연 | mesh generation CPU/WASM만 먼저 사용; stable vector path fallback |
| Xilem/Masonry accessibility 부족 | DOM shell 유지; canvas-native island만 승격 |
| shader variant 폭증 | WESL compile-time specialization, pipeline cache, variant budget |
| 실험 엔진 crash | provider worker/island quarantine, command journal, hot failover |
| 성능 최적화가 문서 의미를 훼손 | CreatorProjectGraph가 원본; engine cache는 삭제·재생성 가능 |


---

# 23. 완료의 정의

V12는 다음 상태에서만 완료다.

```text
기존 /studio가 새 CreatorProjectGraph와 Vello Hub를 직접 실행
별도 monorepo/parallel Studio/legacy route 없음
Vello Hybrid·Classic·CPU tournament가 실제 계측으로 동작
Studio Max에서 Vello가 기본 2D scene hub
Google Ink 또는 동등 잉킹 경로가 CSP gate 통과
브러시·필터 catalog에 수량 하드 캡 없음
만화·애니메이션 핵심 동선이 CSP 동률 이상
asset ecosystem과 long-session recovery가 release blocker gate 통과
provider 실패 시 문서 손실 없이 hot failover
기존 내부 Studio 데이터 폐기 완료
외부 창작 포맷 호환은 유지·확대
```

# 24. 최종 판단

CSP를 이기기 위해서는 안정된 엔진만 조립하는 것보다 **차세대 renderer를 실제 제품의 기본 경로로 승격할 수 있는 구조**가 필요하다. Vello를 최대한 활용하는 올바른 방식은 Vello가 할 수 없는 계산까지 억지로 넣는 것이 아니라 다음과 같다.

```text
Kurbo·Peniko·Color·Parley·Glifo로 공통 2D 언어를 만든다
→ Vello Hybrid/Classic/CPU가 scene의 기본 소유자가 된다
→ Google Ink·Graphite·ThorVG·자연매체 엔진은 같은 GPU fabric 또는 큰 island로 연결한다
→ 모든 결과를 Vello 최종 scene으로 다시 합친다
→ runtime tournament가 workload별 승자를 선택한다
→ shadow rendering이 아직 검증되지 않은 경로를 실제 문서에서 안전하게 학습시킨다
→ 내부 CSP 승리 게이트를 통과하면 외부 검증을 기다리지 않고 기본값으로 승격한다
```

이 구조는 보수적인 호환성 중심 설계보다 위험이 크다. 그러나 위험을 문서 모델과 분리하고 provider 단위로 격리했기 때문에, **제품 전체를 걸지 않고도 Vello·Sparse Strips·Graphite·Google Ink의 성능 상한을 적극적으로 탐색할 수 있다.**

---

# 25. 공식 출처 원장


| 주제 | 공식 출처 |
| --- | --- |
| Vello releases / Sparse Strips / Glifo | https://github.com/linebender/vello/releases |
| Vello repository and alpha status | https://github.com/linebender/vello |
| Vello Hybrid docs | https://docs.rs/vello_hybrid/latest/vello_hybrid/ |
| Vello 0.9 Scene API | https://docs.rs/vello/latest/vello/struct.Scene.html |
| Xilem/Masonry releases | https://github.com/linebender/xilem/releases |
| Parley releases | https://github.com/linebender/parley/releases |
| Kurbo | https://github.com/linebender/kurbo |
| Peniko | https://github.com/linebender/peniko |
| Linebender Color | https://github.com/linebender/color |
| Vello SVG | https://github.com/linebender/vello_svg |
| Velato | https://github.com/linebender/velato |
| wgpu releases | https://github.com/gfx-rs/wgpu/releases |
| wgpu WebGPU interop Device docs | https://docs.rs/wgpu/latest/wasm32-unknown-unknown/wgpu/struct.Device.html |
| WESL compiler | https://github.com/webgpu-tools/wesl-rs |
| Google Ink | https://github.com/google/ink |
| CanvasKit | https://skia.org/docs/user/modules/canvaskit/ |
| Skia Graphite Chromium launch | https://blog.chromium.org/2025/07/introducing-skia-graphite-chromes.html |
| Dawn Emdawnwebgpu | https://dawn.googlesource.com/dawn/+/refs/heads/main/src/emdawnwebgpu/ |
| ThorVG Web | https://github.com/thorvg/thorvg.web |


---

# 부록 A — V11.1 인플레이스 전면 교체·하이브리드 기본 설계

> 아래 부록은 기능·CSP 비열위·인플레이스 교체 요구를 보존하기 위한 참고본이다. 차세대 엔진의 승격·Vello 배치·위험 허용 정책은 V12 본문을 우선한다.


# ToonStudio V11.1 — 기존 Studio 인플레이스 전면 교체·검증 엔진 우선·하이브리드 최종 아키텍처

- 기준일: **2026-08-07**
- 문서 상태: **V11의 엔진 정책을 유지하면서 배포·저장소 전략을 인플레이스 교체로 정정한 권위본**
- 개발 방식: **현재 저장소·현재 Studio 경계 안에서 인플레이스 전면 재작성**, 기존 ToonStudio 내부 창작 데이터 폐기
- 유지되는 원칙: 브러시·필터 카탈로그 하드 캡 없음, CSP 비열위 만화·애니메이션·소재·안정성 요구, 외부 창작 포맷 최대 호환
- 새 핵심 정책: **Verified-first, Hybrid-by-strength, Evidence-driven Custom**

> V11.1과 V11/V10/V9가 충돌하면 V11.1을 우선한다. V11의 엔진·품질 원칙은 유지하고, 새 monorepo·병렬 앱·별도 Studio 버전 경로 전제만 폐기한다. V10의 “직접 구현 금지” 또는 “Custom-last” 표현은 폐기한다. 검증된 엔진·라이브러리를 먼저 평가하고 적극 활용하되, 품질·성능·비파괴 의미·확장성·상호운용성이 부족하면 자체 구현·fork·혼합 구현을 허용한다.

---

# 0. 최종 결정

## 0.1 정확한 원칙

```text
검증된 엔진과 라이브러리를 우선 조사한다
→ 각 엔진의 강점을 기능 단계별로 분해한다
→ 공통 IR 아래에서 최적 조합을 만든다
→ 실제 문서와 장치에서 품질·지연·메모리를 비교한다
→ 기존 엔진이 목표를 만족하면 재사용·확장한다
→ 만족하지 못하면 fork·adapter·선택적 자체 구현을 채택한다
→ 자체 구현이 우수함을 입증하면 주력 Provider로 승격한다
```

이 정책은 자체 개발을 억제하기 위한 것이 아니다. **이미 검증된 기능을 무의미하게 중복 개발하지 않으면서, ToonStudio의 경쟁 우위가 필요한 곳에는 적극적으로 맞춤 구현하는 정책**이다.

## 0.2 폐기하는 표현

다음 표현은 더 이상 사용하지 않는다.

```text
범용 알고리즘을 직접 다시 만들지 않는다
직접 구현 금지
Custom-last
Custom kernel은 틈새에만 허용
기존 엔진이 있으면 자체 구현 불가
```

다음 표현으로 통일한다.

```text
검증 엔진 우선 평가
장점별 하이브리드 조합
증거 기반 선택적 자체 구현
Provider와 자체 구현의 지속적 경쟁
품질·성능 우위가 입증된 구현을 최종 채택
```

## 0.3 변하지 않는 제품 목표

- 브러시와 필터 수에 하드 캡을 두지 않는다.
- Golden Master는 수량 제한이 아니라 회귀 시험 묶음이다.
- 대표 브러시의 손맛·대형 브러시 처리량·필터 실시간성에서 CSP 동급 이상을 출시 게이트로 둔다.
- 만화·애니메이션·소재·장시간 안정성은 엔진 데모가 아니라 연결된 제작 흐름으로 구현한다.
- 기존 내부 데이터 마이그레이션은 하지 않는다. 외부 창작 포맷 호환은 최대화한다.


## 0.4 저장소·배포 전략의 최종 정정

```text
새 monorepo를 만들지 않는다
새 /studio-v11 또는 병렬 Studio 앱을 만들지 않는다
현재 저장소의 기존 Studio 엔트리포인트와 /studio 경로를 그대로 사용한다
기존 Studio 구현은 같은 경계 안에서 삭제·교체한다
유효한 플랫폼 인프라는 감사 후 재사용한다
기존 Studio 내부 창작 데이터는 마이그레이션하지 않고 파괴 초기화한다
외부 창작 파일과 자산 포맷 가져오기는 새 FormatGateway로 유지·확대한다
```

이 문서에서 **전면 재작성**은 새 제품을 옆에 만드는 그린필드 병렬 개발을 뜻하지 않는다. 현재 Studio 패키지·라우트·배포 산출물의 내부 구현을 비우고 새 코어로 교체하는 **인플레이스 그린필드 교체**를 뜻한다.

재사용 가능한 주변 인프라는 다음과 같다.

- 기존 도메인과 `/studio` URL
- 인증·세션·사용자·조직 연동
- 결제·권한·플랜 연동
- 배포 파이프라인·환경 변수·관측 인프라
- CDN·오브젝트 스토리지·업로드 게이트웨이
- 공통 디자인 토큰 중 새 접근성·성능 기준을 통과한 부분

재사용이 금지되는 것은 “기존이라는 이유만으로 유지하는 것”이다. 기존 편집 코어, 렌더 루프, 문서 모델, 로컬 저장 스키마, Undo 구조, 브러시·필터 파이프라인은 V11.1 수용 기준을 통과하지 못하면 같은 경로에서 삭제하고 대체한다.

---

# 1. 하이브리드 아키텍처의 의미

## 1.1 엔진을 많이 상주시키는 구조가 아니다

```text
넓은 후보 포트폴리오
+ 좁은 활성 런타임
+ 기능 단계별 Provider
+ 공통 IR
+ 큰 Render/Compute Island
+ Preview/Final 분리
= 품질과 성능을 동시에 얻는 하이브리드 구조
```

한 화면에서 CanvasKit, Vello, ThorVG, OpenCV, G’MIC, Three.js를 모두 매 프레임 전체 화면 렌더러로 실행하지 않는다. **한 Surface 또는 큰 Island에 주 소유자 하나**를 두고 다른 엔진은 path, mesh, mask, tile, texture, scene fragment, command buffer 같은 중간 결과를 전달한다.

## 1.2 하이브리드 결합 유형

1. **순차 파이프라인**: Google Ink 입력 모델 → Vello scene → CanvasKit export.
2. **Preview/Final 분리**: CanvasKit proxy → G’MIC/GEGL final.
3. **편집/출력 분리**: Vello interactive → resvg/Skia CPU deterministic export.
4. **분석/합성 분리**: OpenCV mask → CanvasKit/Vello composite.
5. **동역학/재질 분리**: libmypaint dynamics → ToonWet 확장 → Skia composite.
6. **기하/렌더 분리**: Kurbo/PathOps geometry → Vello/CanvasKit render.
7. **기능 탐지형 라우팅**: Velato·ThorVG·Skottie 중 Lottie 파일별 최적 엔진 선택.
8. **교차 검증**: Hokusai와 libmypaint, Vello와 CanvasKit을 같은 corpus로 비교.
9. **선택적 자체 구현**: 기존 엔진의 공백만 구현하거나, 실제 우위가 확인되면 기존 기능까지 교체.

---

# 2. 최종 시스템 구조

```text
React 19 Web Shell
├─ React Aria / Radix / XState
├─ CommandRegistry
└─ CSP-compatible Workspace Profiles
                 │
                 ▼
CreatorProjectGraph + Stable IR
├─ InputIR / StrokeIR / BrushProgramIR
├─ PathIR / ShapeIR / TextIR / PaintIR
├─ LayerGraphIR / EffectGraphIR
├─ ComicGraph / AnimationGraph
├─ Scene3DIR / MotionCaptureIR
├─ AssetPackageIR / FormatInteropIR
└─ CommandJournal / RecoveryIR
                 │
                 ▼
HybridExecutionPlanner
├─ CapabilityRegistry
├─ ProviderBenchmarkRegistry
├─ QualityOrchestrator
├─ RenderIslandCompiler
├─ EffectGraphCompiler
├─ PreviewFinalScheduler
└─ ResourceResidencyManager
                 │
       ┌─────────┼──────────┬──────────┐
       ▼         ▼          ▼          ▼
CanvasKit     Vello Hub   Feature     Bridge/Final
Skia Surface Classic/    Workers     Providers
              Hybrid/CPU  Google Ink  libvips
                           MyPaint     G'MIC/GEGL
                           Hokusai     FFmpeg
                           OpenCV      OCIO/LCMS
       └─────────┴──────────┴──────────┘
                 │
                 ▼
OPFS + SQLite WASM + CAS + Cloud Backup
```

## 2.1 저장 원본과 실행 엔진 분리

`SkPath`, `vello::Scene`, `GeglNode`, `cv::Mat`, `THREE.Object3D`를 프로젝트 원본으로 저장하지 않는다. 원본은 안정적인 ToonStudio IR이고, 엔진 객체는 재생성 가능한 cache다.

## 2.2 Provider 인터페이스

```rust
pub trait EngineProvider {
    fn descriptor(&self) -> ProviderDescriptor;
    fn capabilities(&self) -> CapabilitySet;
    fn estimate(&self, job: &JobIR, device: &DeviceProfile) -> CostEstimate;
    fn compile(&self, job: &JobIR) -> Result<CompiledJob>;
    fn execute(&mut self, job: CompiledJob, ctx: &ExecutionContext) -> Result<JobOutput>;
    fn validate(&self, corpus: &CorpusRef) -> ValidationReport;
}
```

Provider는 다음을 반드시 선언한다.

```text
version / commit
license / attribution
maturity
supported features
unsupported features
preview quality
final quality
determinism
memory estimate
input/output format
thread/worker requirements
fallback
known bugs
```

---

# 3. 엔진 선택 알고리즘

## 3.1 라이선스·안전성 하드 게이트

- 상용 배포 가능 여부
- 사용자 파일의 서버 전송 여부
- copyleft 격리 요구
- codec·asset의 별도 라이선스
- 메모리 안전성과 sandbox 가능성
- 원본 데이터 손실 가능성

하드 게이트를 통과한 후보만 품질 점수를 계산한다.

## 3.2 품질·성능 점수

```text
Visual / Stroke Quality       30
Input Latency                 15
Interactive Throughput        15
Large-document Throughput     10
Memory / Residency             8
Correctness / Determinism      8
Extensibility / Composability  8
Maturity / Maintenance         6
총점                          100
```

CSP와 직접 비교하는 브러시·만화 동선·애니메이션 기능은 단순 가중치가 아니라 **최소 통과 조건**을 별도로 둔다.

## 3.3 자체 구현을 선택하는 조건

다음 중 하나 이상을 벤치마크와 시각 자료로 입증하면 자체 구현·fork·modified engine을 허용한다.

1. 기존 Provider가 목표 시각 품질을 재현하지 못한다.
2. p95 지연 또는 처리량이 목표보다 유의하게 낮다.
3. 엔진 간 복사 비용 때문에 전체 파이프라인이 느려진다.
4. 비파괴 편집 의미를 기존 엔진이 보존하지 못한다.
5. CSP를 넘어서는 고유 기능이 기존 엔진에 없다.
6. 라이선스·배포 방식 때문에 직접 통합할 수 없다.
7. 장기 유지보수 또는 장애 복구에 구조적 문제가 있다.
8. 자체 구현이 reference corpus에서 더 정확하고 더 빠르다.

자체 구현은 “최후 수단”이 아니라 **비교를 통과한 하나의 후보 Provider**다.

---

# 4. 엔진·라이브러리 장점과 최종 배치

| 엔진·라이브러리 | 핵심 장점 | 최적 역할 | 하이브리드 연결 | 판정 |
| --- | --- | --- | --- | --- |
| Skia / CanvasKit | Path, Canvas, Paint, Paragraph, ImageFilter, RuntimeEffect, Skottie를 하나의 성숙한 그래픽 코어에서 제공한다. 일반 레이어 합성·마스크·텍스트·기준 출력의 안전한 기준선이다. | 기본 페인팅 Surface, 일반 래스터 브러시, 텍스트, 마스크, 혼합, 실시간 필터, 기준 출력 | Vello 벡터 아일랜드·Google Ink 메시·libmypaint 타일을 이미지/텍스처로 받아 최종 합성한다. OpenCV의 마스크와 libvips의 최종 결과도 연결한다. | 생산 기준선 |
| Vello Classic | Rust/wgpu 기반 GPU compute 중심 렌더러로 복잡한 path가 많고 자주 바뀌는 장면의 처리 상한이 높다. Kurbo·Peniko와 직접 결합된다. | 선화, 컷, 말풍선, 효과선, 가이드, 선택 오버레이, 대규모 벡터 장면 | Parley가 만든 glyph run, Kurbo path, Peniko paint를 렌더하고, 래스터·자연매체·3D 결과는 이미지/texture island로 합성한다. | 조건부 가속기 |
| Vello Hybrid | 경로 준비와 GPU 렌더링의 역할을 나누고 이미지 atlas·texture binding과 결합할 수 있어 일반 편집 장면의 균형형 후보다. | 이미지·텍스트·벡터가 혼합된 장면, 저전력 벡터 편집, texture island 합성 | Classic과 문서별 벤치마크로 선택하고, 미지원 마스크·복합 필터 구간은 CanvasKit 또는 EffectProvider 결과를 재주입한다. | 조건부 가속기 |
| Vello CPU | GPU와 분리된 CPU 기준 결과를 제공해 시각 회귀, 썸네일, 장애 복구, 서버 렌더에 활용할 수 있다. | cross-renderer diff, golden image, GPU 장애 복구, 백그라운드 export | CanvasKit Software·resvg·tiny-skia와 교차 기준을 구성한다. | 필수 기준선 |
| Kurbo | Rust 기반 Bézier curve와 vector path 구조·연산을 제공하고 Vello 생태계와 자연스럽게 연결된다. | 중심선, outline 후처리, arc-length, path split, guide, balloon tail, ribbon bake | Google Ink/Perfect Freehand의 결과를 편집 가능한 PathIR로 정리하고 Vello/CanvasKit에 전달한다. Boolean은 Skia PathOps·Clipper2 같은 보완 엔진과 결합한다. | 핵심 기하 계층 |
| Peniko + Linebender Color | Vello 계열에서 색·그라데이션·이미지·혼합 표현을 공통 언어로 사용할 수 있다. | PaintIR, gradient, image brush, blend mapping, wide-gamut UI 연결 | CanvasKit/Skia 색 모델과 ColorIR을 매핑하고 cross-renderer 색상 차이를 자동 검사한다. | 핵심 스타일 계층 |
| Parley + Fontique + HarfRust + Skrifa + ICU4X | shaping, line breaking, bidi, selection/editing을 Rust 계층에서 조합하며 복잡한 다국어 문단을 다룬다. | 한중일 말풍선, 문단, 효과음, 세로쓰기 기반, 번역 재배치, 텍스트 편집 | Parley 레이아웃을 Vello/Glifo로 실시간 렌더하고 CanvasKit Paragraph를 기준선·폴백으로 사용한다. | 조건부 핵심 |
| Glifo | 반복 glyph outline/image/hint 캐시로 텍스트가 많은 캔버스의 렌더 비용을 낮출 수 있다. | 말풍선·자막·페이지·협업 UI의 glyph atlas | Parley의 glyph run을 Vello에 전달하고 CanvasKit Paragraph와 결과를 비교한다. | 실험적 보조 |
| Google Ink | 원시 입력을 모델링하고 brush effect를 적용해 mesh 기반 vector stroke를 생성한다. pressure·tilt·speed 등 풍부한 동역학에 적합하다. | G펜, 매핑펜, 붓펜, 캘리그래피, 마커, 손가락 필기, 부분 획 편집 | 입력·BrushBehavior·mesh는 Google Ink, 중심선/선택은 Kurbo·Vello, 최종 기준 출력은 CanvasKit으로 조합한다. | PoC 후 주력 후보 |
| Perfect Freehand + Lyon | Perfect Freehand는 압력 기반 outline 생성이 간단하고, Lyon은 Rust path tessellation에 강하다. | Google Ink 폴백, 기술 펜, 경량 vector stroke, deterministic export geometry | 자체 stabilizer·Kurbo fitting·Vello/CanvasKit 렌더와 결합한다. | 안정 폴백 |
| libmypaint | MyPaint와 여러 페인팅 프로그램이 사용한 brush dynamics, tiled surface, smudge, .myb 생태계를 제공한다. | 연필, 색연필, 수채, 유화, 혼색, smudge, MYB 호환 | libmypaint가 dynamics/dab를 계산하고 CanvasKit/Skia tile surface로 합성하며, Vello는 guides·vector overlay를 담당한다. ToonWet은 부족한 습식 현상만 추가한다. | 자연매체 기준선 |
| Hokusai | libmypaint에서 영감을 받은 순수 Rust 브러시 엔진으로 WASM/native를 목표로 하고 .myb 호환을 지향한다. | Rust-only 자연매체, 웹 worker 통합, pressure/tilt 기반 MyPaint 계열 | libmypaint와 동일 입력·동일 preset corpus로 비교해 더 빠르거나 유지보수성이 좋은 경로를 선택한다. | 품질 게이트 후보 |
| ThorVG | retained scene, blending, masks, text, effects, Lottie, partial rendering과 CPU/WebGL/WebGPU backends를 제공한다. | SVG/Lottie asset, animated brush tip, UI motion, lightweight vector island, low-power profile | Vello/Velato/Skottie와 파일별 feature scanner로 라우팅하고 resvg를 정적 기준선으로 사용한다. | 생산 보조 |
| vello_svg + Velato | SVG/Lottie를 Vello scene fragment로 직접 연결해 벡터 장면과 편집 overlay를 같은 renderer에서 합성한다. | 웹툰 장식, motion asset, vector brush stamp, Vello-native animation island | ThorVG·Skottie를 기능 폴백으로, resvg를 정확한 정적 reference로 둔다. | 조건부 보조 |
| resvg + tiny-skia | 정적 SVG 렌더와 CPU 기준 이미지를 만들기 좋고 서버·테스트에서 결정적 기준을 제공한다. | SVG import preview, golden image, export validation, GPU 장애 복구 | vello_svg/ThorVG의 실시간 결과와 pixel diff를 수행한다. | 필수 기준선 |
| OpenCV / OpenCV.js | threshold, morphology, gradients, Canny, contours, transforms 등 검증된 computer vision/image processing 기능을 폭넓게 제공한다. | 마술봉, line extraction, dust removal, gap analysis, inpainting 보조, camera tracking 보조 | 분석과 mask 생성은 OpenCV, 실시간 합성·미리보기는 CanvasKit/Vello, 대형 최종 처리는 libvips/G’MIC과 결합한다. | 생산 분석 계층 |
| libvips / wasm-vips | demand-driven, horizontally threaded 처리로 큰 이미지에서 빠르고 메모리 사용이 낮은 것을 목표로 한다. | 8K/초장축 export, resize, pyramid, batch conversion, thumbnail, format pipeline | 편집 중 preview는 CanvasKit/Vello, 최종 대형 출력은 libvips, 색 관리는 OCIO/LCMS로 분리한다. | 대형 처리 주력 |
| G'MIC / libgmic | 공식 GUI 기준 640개 이상의 필터와 자체 확장 언어·multi-threaded library를 제공한다. | 예술 효과, 복원, 패턴, color grading, 실험 필터, marketplace recipe bootstrap | 저해상도 proxy는 CanvasKit/OpenCV, 고품질 final은 Local ToonBridge/격리 provider의 G’MIC, 결과는 EffectGraph node로 저장한다. | 동적 확장 |
| GEGL | operation graph와 loadable operation API를 제공해 image processing pipeline과 자동 UI 생성에 적합하다. | 고급 non-destructive filter graph, GIMP 계열 연산, offline final pipeline | Toon EffectGraphIR을 GEGL chain으로 컴파일하고 interactive subset은 CanvasKit/OpenCV가 preview한다. | 동적 확장 |
| OpenColorIO + LittleCMS + skcms | 영화·인쇄·브라우저/Skia 색상 변환을 각각 강하게 지원하는 검증된 색관리 도구다. | ICC, soft proof, OCIO config, display transform, export color conversion | CanvasKit/Vello 내부 선형 합성 뒤 export/display 경계에서 선택하고 cross-engine color chart로 검증한다. | 생산 필수 |
| Three.js + three-vrm + three-mesh-bvh | 웹 3D 생태계, VRM, fast raycast/BVH, render target와 후처리를 결합하기 쉽다. | 3D pose, camera, background, depth/normal/ID pass, surface paint | Rapier physics, Manifold boolean, glTF Transform optimization을 붙이고 2D 결과는 Vello/CanvasKit에 texture/vector로 전달한다. | 생산 3D 계층 |
| Rapier + Jolt + Manifold | Rapier는 강체/충돌, Jolt는 고급 물리 후보, Manifold는 견고한 mesh boolean에 강점이 있다. | 3D 배치, pose contact, cloth/soft-body 선택 기능, room/model boolean | 브러시모는 경량 XPBD, 장면 강체는 Rapier, 고급 cloth는 Jolt, mesh boolean은 Manifold로 분리한다. | 기능별 선택 |
| WebCodecs + Mediabunny + FFmpeg | 브라우저 하드웨어 codec, JS media container, 범용 codec/format bridge를 단계적으로 조합할 수 있다. | animation playback, audio waveform, recording, proxy, batch output | WebCodecs 우선, container는 Mediabunny, 미지원 codec/final batch는 FFmpeg bridge로 전환한다. | 생산 미디어 계층 |
| Yjs 또는 Loro | 의미 객체·텍스트·트리의 local-first 협업과 undo/presence/version 기능을 제공한다. | 레이어·벡터·텍스트·댓글·컷·키프레임 협업 | 대형 raster tile/asset은 content-addressed binary storage로 분리하고, 시뮬레이션은 command+seed+bake만 동기화한다. | 생산 협업 계층 |
| OPFS + SQLite WASM | 대형 파일·타일을 브라우저 로컬 파일로 저장하고 metadata/index/journal을 구조화할 수 있다. | append journal, snapshot, tile chunks, asset index, crash recovery | OPFS는 blob·tile, SQLite는 metadata·관계·검색, cloud object storage는 백업·협업을 담당한다. | 생산 저장 계층 |
| React Aria + Radix + XState | 접근 가능한 DOM 입력, 메뉴/팝오버 primitives, 명시적 tool state machine을 제공한다. | 패널, 메뉴, 폼, 접근성, onboarding, workspace, command UI | 캔버스 내부 고빈도 HUD·guide·selection은 Vello가 그리고 DOM UI와 동일 CommandRegistry를 공유한다. | 생산 웹 UI |
| Xilem + Masonry | Xilem은 선언형 reactive view diff, Masonry는 retained widget tree·event/update/layout/paint pass를 제공한다. | 향후 native Studio Max shell, UI invalidation/test architecture 참고 | 현재 웹은 React를 유지하고 캔버스 UI는 Vello, 향후 동일 Rust ProjectGraph 위에 Xilem/Masonry shell을 선택적으로 구축한다. | 연구·네이티브 후보 |
| wgpu / WebGPU + ToonGpuExtensions | 검증 엔진 결과를 같은 frame graph에 연결하고, sparse tile·진단·고유 자연매체처럼 제품 특화 공백을 채울 수 있다. | texture interop, sparse tile residency, final composite, ToonWet, unique particle collision, diagnostics | 범용 기능은 기존 엔진을 먼저 사용하고, 부족한 pass만 작은 custom module로 끼워 넣는다. | 필수 얇은 확장 |

---

# 5. 기능별 권장 하이브리드 조합

| 기능 | 권장 파이프라인 | 설계 의도 |
| --- | --- | --- |
| 전문 G펜·매핑펜 | Pointer Events/장치 교정 → Google Ink Stroke Modeler·BrushBehavior → mesh → Vello 선택·편집 overlay → CanvasKit/Skia 기준 출력 | Google Ink의 입력·브러시 동역학, Vello의 장면 처리, Skia의 안정 출력 장점을 결합한다. Google Ink 포팅 실패 시 Perfect Freehand+Kurbo+Vello로 자동 폴백한다. |
| 정밀 기술 펜·자 | 자체 저지연 stabilizer → Kurbo/Lyon 중심선·outline → Vello 또는 CanvasKit | 예측을 최소화하고 도형·자 constraint를 먼저 적용해 정확도를 우선한다. |
| 일반 래스터·이미지 팁 | CanvasKit/Skia batched dab → sparse tile surface → Vello overlay | Skia의 안정된 blend/mask/image 기능을 쓰고, ToonStudio는 batching·tile scheduling·preset graph에 집중한다. |
| 연필·색연필 | libmypaint 또는 Hokusai dynamics → paper texture/height → CanvasKit tile → Vello guide | 자연스러운 dynamics는 검증 엔진, 종이·재질은 조합 가능한 texture provider로 분리한다. |
| 수채·수묵 | libmypaint/Hokusai로 brush pickup·deposit → 선택적 ToonWet wet-tile simulation → CanvasKit composite → Vello vector/text | 기본 수채는 검증 엔진으로 구현하고 backrun·granulation·건조 타임라인처럼 차별화된 현상만 자체 확장한다. |
| 유화·임파스토 | libmypaint/Hokusai mixing → 선택적 height/normal extension → Skia/CanvasKit lighting | 색 혼합과 브러시 dynamics를 재사용하고 재질 높이 표현만 제품 고유 확장으로 둔다. |
| 스머지·믹서 | libmypaint smudge 또는 Skia image sampling → multi-layer reference adapter → CanvasKit composite | 기본 smudge는 검증 엔진, 다중 레이어 비파괴 참조는 ToonStudio 문서 계층이 확장한다. |
| 벡터 선화·컷·말풍선 | Kurbo/Peniko → Parley text → Vello Classic/Hybrid → CanvasKit export reference | Vello 사용률을 높이되 텍스트·필터가 불리한 경우 큰 island만 Skia로 넘긴다. |
| Path boolean·선 수정 | Kurbo edit model + Skia PathOps/Clipper2 boolean + Vello render | 한 라이브러리에 모든 기하 연산을 강요하지 않고 강건성이 높은 엔진별로 역할을 나눈다. |
| SVG·장식 자산 | vello_svg 실시간 scene fragment ↔ ThorVG feature-rich renderer ↔ resvg reference | 파일별 capability scan으로 가장 높은 사양 커버리지와 성능을 선택한다. |
| Lottie·애니메이션 팁 | Velato/Vello 또는 ThorVG/Skottie → frame cache → Vello/CanvasKit scene | 표현 기능·파일 크기·동시 애니메이션 수에 따라 엔진을 선택한다. |
| 실시간 색·블러·그림자 | CanvasKit ImageFilter/RuntimeEffect → EffectGraph cache | 일반 필터는 Skia를 우선하고 Vello native가 더 빠른 단순 벡터 효과는 Vello를 쓴다. |
| 엣지·형태학·먼지 제거 | OpenCV analysis/mask → CanvasKit interactive composite → libvips/G’MIC final | 분석·미리보기·최종 품질을 각 엔진의 강점에 맞춰 분리한다. |
| 창작 필터 600+ | G’MIC/GEGL final provider + CanvasKit/OpenCV proxy preview → EffectGraph recipe | 대규모 필터 카탈로그를 빠르게 확보하되 UX·진행률·취소·비파괴 저장은 ToonStudio가 통제한다. |
| 초대형 이미지·일괄 출력 | CanvasKit/Vello preview → libvips pyramid/batch → OCIO/LCMS color → target encoder | 편집 renderer에 대형 export 부담을 주지 않는다. |
| 한중일 말풍선 | ICU4X/HarfRust/Skrifa/Parley layout → Glifo/Vello render → CanvasKit Paragraph validation | 전문 shaping과 Vello 장면 결합, Skia 기준 검증을 함께 사용한다. |
| 3D 포즈·배경 | Three.js/three-vrm → Rapier contact → BVH raycast → depth/normal/ID → Vello/CanvasKit 2D composite | 3D 엔진의 장점을 유지하면서 2D 편집기로 의미 있는 보조 패스를 전달한다. |
| 3D 표면 페인팅 | Three.js hit/UV → CanvasKit/Skia tile paint 또는 thin WebGPU adapter → glTF texture update | 표면 hit와 scene은 Three.js, 2D 페인트 품질은 검증 2D 엔진을 활용한다. |
| 애니메이션·오디오 | AnimationGraph → WebCodecs preview → Mediabunny container → FFmpeg final bridge | 브라우저 하드웨어 가속을 먼저 쓰고 미지원 codec만 bridge로 보완한다. |
| 협업·복구 | Yjs/Loro semantic ops + OPFS journal/CAS + binary tile store + cloud backup | CRDT에 픽셀 전체를 넣지 않고 의미 객체와 command만 동기화한다. |
| 캔버스 UI | React Aria/Radix DOM shell + Vello canvas HUD + XState tool state | 접근성 UI와 고빈도 GPU UI를 분리하되 CommandRegistry는 하나로 통일한다. |
| 소재 마켓 | Format importers → Brush/Effect/Asset IR → engine-specific preview matrix → signed package | 여러 엔진에서의 실제 결과를 보여주고 패키지에 provider/version/license를 고정한다. |

---

# 6. 브러시 아키텍처

## 6.1 프리셋은 무제한, 실행 Provider는 관리 가능하게

```text
Official Catalog
Imported Catalog
Personal Catalog
Team Catalog
Marketplace Catalog
```

프리셋 수는 제한하지 않지만 동일 동작을 수백 개의 엔진으로 구현하지 않는다. 모든 프리셋은 `BrushProgramIR`로 변환되고, Provider가 컴파일한다.

```rust
pub struct BrushProgramIR {
    pub input_graph: InputGraph,
    pub stabilizer: StabilizerGraph,
    pub dynamics: DynamicsGraph,
    pub geometry: GeometryGraph,
    pub tip: TipGraph,
    pub texture: TextureGraph,
    pub mixing: MixingGraph,
    pub material: MaterialGraph,
    pub physics: Option<PhysicsGraph>,
    pub output: BrushOutputPolicy,
}
```

## 6.2 Brush Provider 조합

- `GoogleInkProvider`: 전문 잉킹 mesh와 BrushBehavior.
- `VelloVectorProvider`: path-heavy vector stroke·effect line.
- `SkiaRasterProvider`: 일반 dab·image tip·mask·blend.
- `MyPaintProvider`: 검증된 자연매체와 MYB.
- `HokusaiProvider`: Rust/WASM 자연매체 후보.
- `ThorVGStampProvider`: SVG/Lottie animated stamp.
- `OpenCVRetouchProvider`: 분석 기반 clone/heal/dust.
- `PixelProvider`: 정수 좌표·palette·dither.
- `Material3DProvider`: base color·normal·height·roughness.
- `ToonWetProvider`: 검증 엔진에 없는 습식 현상 또는 명확한 품질 우위가 입증된 경우.

## 6.3 자체 구현 가능 범위

다음은 금지가 아니라 비교 대상이다.

- custom dab renderer
- custom stabilizer
- custom wet-media solver
- custom smudge/multi-layer transport
- custom particle/SDF brush
- custom vector stroke mesh
- custom paper/material model

기존 엔진보다 우수하다는 결과가 나오면 주력 Provider로 승격한다. 반대로 차이가 없으면 유지보수 비용을 줄이기 위해 검증 엔진을 선택한다.

## 6.4 품질 카탈로그 정책

- Golden Master: 128개 이상으로 확장 가능.
- 공식 카탈로그: 300개 이상 목표이지만 품질 통과분만 공개.
- 외부·마켓 프리셋: 수량 제한 없음.
- 장치별 Wacom·Apple Pencil·S Pen·Surface Pen·Huion·XP-Pen 시험.
- 각 preset에 provider, version, source app, original payload, resource hash, license, calibration profile 저장.

---

# 7. 필터 아키텍처

## 7.1 무제한 카탈로그

```text
Core Interactive
Professional Analysis
Creative Extensions
Comic/Animation Specific
3D-aware Effects
User/Marketplace Recipes
```

## 7.2 Provider 조합

- CanvasKit ImageFilter/RuntimeEffect: 실시간 기본 효과.
- Vello native effects: 벡터 scene 내부에서 이점이 있는 단순 효과.
- OpenCV: edge, morphology, contour, mask, tracking, restoration analysis.
- libvips: 초대형 이미지, pyramid, batch, export.
- G’MIC: 대규모 창작·복원·패턴 효과.
- GEGL: 비파괴 operation DAG와 final provider.
- OCIO/LCMS/skcms: 색관리.
- Custom Provider: pass fusion, 고유 웹툰 효과, GPU 병목 해소, 기존 엔진보다 높은 품질/성능이 입증된 경우.

## 7.3 EffectGraph 컴파일

```text
EffectGraphIR
→ type / color-space validation
→ ROI / halo / temporal dependency
→ Provider candidate discovery
→ native-node grouping
→ cross-provider copy cost 계산
→ preview graph와 final graph 생성
→ cache / tile / cancellation plan
```

같은 효과를 여러 Provider가 지원하면 문서·기기·품질 프로필에 따라 선택한다. 예를 들어 Gaussian blur도 작은 반경의 interactive path는 CanvasKit, 대형 final은 libvips, 특정 vector shadow는 Vello, 특수 bokeh는 custom/G’MIC으로 달라질 수 있다.

---

# 8. Vello 활용도를 높이는 정확한 방법

Vello를 모든 기능의 유일한 엔진으로 만들지 않고 **2D 장면 허브와 대량 vector 가속기**로 최대한 사용한다.

## Vello 우선 영역

- 대규모 선화·가변 폭 path
- 컷·말풍선·꼬리·효과선
- 투시·대칭·어안·특수 자와 가이드
- 선택 윤곽·앵커·transform handle
- Parley text와 glyph run
- SVG/Lottie scene fragment
- raster/natural-media/3D texture island 배치
- 협업 cursor·review overlay
- 애니메이션 vector scene

## 다른 엔진과의 조합

```text
Kurbo → path geometry
Peniko/Color → paint
Parley/Glifo → text
Google Ink → professional stroke mesh
CanvasKit → mask/filter/reference/export
ThorVG/Velato → SVG/Lottie
OpenCV → mask/analysis
libmypaint/Hokusai → natural-media tile
Three.js → 3D auxiliary pass
Vello → final interactive vector scene hub
```

Vello의 알파 상태와 현행 제한 때문에 기능을 숨기지 않는다. CapabilityRegistry가 불안정한 구간만 다른 Provider로 보낸다.

---

# 9. 성능 아키텍처

## 9.1 활성 런타임 제한

- 한 Surface의 주 compositor는 하나.
- 대형 WASM Provider는 lazy load하고 Worker 종료로 메모리 회수.
- 엔진 전환은 객체별이 아니라 Island별.
- hot path에서 GPU→CPU pixel readback 금지.
- per-dab JS/WASM 호출 대신 batch command.
- Preview와 Final 분리.
- dirty tile, scene fragment, glyph, tip, LUT, pipeline cache.

## 9.2 복사 비용 우선순위

```text
동일 GPU texture/view
→ encoded command buffer / external texture
→ ImageBitmap / VideoFrame
→ SharedArrayBuffer tile
→ CPU readback and re-upload
```

## 9.3 성능 게이트

- 입력→첫 preview p50 4ms 이하, p95 8ms 이하 목표.
- 일반 편집 GPU→CPU readback 0회.
- 1,000px 브러시와 4K filter interaction을 CSP와 동일 장치에서 비교.
- 8K·100 layer, 30,000px webtoon strip 편집 유지.
- 4시간·24시간 soak와 context-loss·worker-crash 복구.
- Provider별 p50/p95/p99·peak memory·cache hit rate 기록.

---

# 10. CSP 비열위 기능 유지

## 10.1 태블릿·손그림

장치 교정, pressure/tilt/azimuth/twist, coalesced/predicted input, palm rejection, pen/finger profile, temporary tool switch, radial HUD를 유지한다.

## 10.2 만화 제작 연결

```text
컷 생성
→ 컷 폴더·마스크 생성
→ 2D/3D 카메라 연결
→ 말풍선 독서 순서
→ 대사·캐릭터 연결
→ 톤·효과선의 컷 경계 인식
→ 웹툰 스크롤 리듬 분석
→ 페이지·웹툰 규격별 일괄 출력
```

투시·대칭·어안·특수 자, 속도선·집중선, 컷, 말풍선·꼬리, 스크린톤, 선 수정, 먼지 제거, Page Manager, Story Editor를 하나의 ComicGraph로 연결한다.

## 10.3 애니메이션

Cel, Drawing Level, Exposure, Timeline, X-sheet, Light Table, Onion Skin, Camera, Audio, Keyframe, Graph Editor, Batch Output을 같은 AnimationGraph에 연결한다.

## 10.4 소재 생태계

SUT/SUTG/ABR/MYB/KPP/Krita bundle import, Brush Fidelity Lab, Personal/Team/Marketplace, 실제 획 preview, version pin, license/Rights BOM, creator monetization을 유지한다.

## 10.5 장시간 안정성

Append-only journal, immutable CAS, snapshot, two-slot superblock, CRC/BLAKE3, OPFS working store, cloud backup, tab/GPU/Worker/quota/network/collab fault injection을 release blocker로 유지한다.

---

# 11. 라이선스와 배포

- permissive 엔진은 browser/worker 직접 통합을 우선한다.
- LGPL/CeCILL/GPL-compatible 계층은 정적 링크를 무조건 금지하는 대신 **실제 라이선스 의무에 맞는 배포 방식**을 법무 검토해 결정한다.
- G’MIC·GEGL은 Local ToonBridge·격리 Provider·서버 실행을 기본 후보로 두되, 허용되는 형태가 확인되면 WASM/직접 통합도 비교한다.
- Krita GPL 코어는 현재 상용 웹 번들에 바로 혼합하지 않고 format/behavior reference와 ToonBridge 경로를 우선한다.
- 모든 asset·brush·font·3D·AI model은 Rights BOM을 가진다.

---

# 12. 기존 Studio 인플레이스 전면 교체 지침

## 12.1 금지 사항

- 새 monorepo 생성
- `/apps/studio-web-v11`, `/studio-v11`, 별도 V11 도메인 같은 병렬 제품 생성
- 구 Studio와 새 Studio를 장기간 동시에 유지하는 dual-runtime
- legacy 문서 모델을 새 코어에 끌고 들어오는 compatibility shim
- 기존 Studio 내부 데이터 migration
- 구 렌더러·구 Undo·구 저장소로 되돌아가는 운영 fallback route

Git branch·worktree·임시 빌드 산출물은 개발 격리를 위해 사용할 수 있지만, 최종 제품 구조와 배포 단위는 반드시 기존 Studio 하나여야 한다.

## 12.2 Codex가 먼저 발견해야 할 경계

Codex는 경로를 추측해 새 앱을 만들지 말고 현재 저장소를 검사해 다음 값을 확정한다.

```text
REPO_ROOT
STUDIO_APP_ROOT
STUDIO_ROUTE_ENTRY
STUDIO_BUILD_TARGET
STUDIO_DEPLOY_TARGET
AUTH_SESSION_BOUNDARY
SHARED_UI_BOUNDARY
API_BOUNDARY
CURRENT_STORAGE_BOUNDARY
CURRENT_WORKER_BOUNDARY
```

결과는 `docs/rewrite/current-studio-boundary.md`에 파일 경로와 의존성 그래프로 기록한다.

## 12.3 논리 모듈은 현재 Studio 안에 배치

아래는 새 저장소 경로가 아니라 **논리적 모듈 경계**다. Codex는 현재 프로젝트의 언어·패키지 관리자·workspace 관례에 맞춰 기존 Studio 루트 아래에 배치한다. 이름에 `v11` 접미사를 붙이지 않는다.

```text
<existing-studio-root>/
├─ core/
│  ├─ project-model
│  ├─ command-registry
│  ├─ hybrid-planner
│  ├─ engine-registry
│  ├─ comic
│  ├─ animation
│  ├─ assets
│  ├─ storage
│  └─ format-gateway
├─ engines/
│  ├─ skia
│  ├─ vello
│  ├─ google-ink
│  ├─ mypaint
│  ├─ hokusai
│  ├─ thorvg
│  ├─ opencv
│  ├─ vips
│  ├─ gmic-gegl-bridge
│  └─ toon-gpu-extensions
├─ workers/
├─ ui/
├─ tests/
│  ├─ corpus
│  ├─ benchmarks
│  ├─ visual
│  └─ fault-injection
└─ docs/
```

현재 저장소가 이미 monorepo라면 그 구조를 유지한다. 현재 저장소가 단일 앱이면 단일 앱을 유지한다. **구조를 바꾸는 것이 목표가 아니라 기존 Studio를 대체하는 것이 목표**다.

## 12.4 교체 방식

```text
현재 Studio 인벤토리·측정
→ 유지할 플랫폼 경계와 폐기할 편집 경계 분류
→ 기존 Studio 루트 안에 새 ProjectGraph·CommandBus 구축
→ 기존 렌더·저장·UI 코드를 기능 단위가 아니라 계층 단위로 제거
→ 같은 /studio 엔트리포인트를 새 Shell에 연결
→ 새 데이터 스키마만 초기화
→ CSP 비교·안정성 게이트 통과
→ 구 소스·구 API·구 Worker·구 데이터 스토어 완전 제거
```

기존 UI를 한 화면씩 덧대는 방식은 허용하지 않는다. 다만 인증, 업로드, 권한, 결제처럼 Studio 편집 코어 밖의 검증된 서비스는 계약 테스트를 통과하면 그대로 연결한다.

## 12.5 데이터 폐기 범위

다음 Studio 내부 데이터는 migration 없이 폐기한다.

- 기존 프로젝트·문서·레이어 데이터
- 기존 OPFS·IndexedDB·localStorage의 Studio 데이터
- 기존 Undo/redo journal·snapshot·cache
- 기존 브러시·필터 사용자 프리셋과 workspace 설정
- 기존 협업 문서 상태와 legacy asset index

사용자 계정·인증·결제·조직처럼 Studio 창작 데이터가 아닌 플랫폼 데이터는 별도 서비스 경계로 보고 자동 삭제하지 않는다.

파괴 초기화는 환경 오인으로 실행되지 않도록 명시적 플래그와 대상 확인을 요구하되, migration 경로를 만들기 위한 안전장치는 아니다.

```text
RESET_EXISTING_STUDIO_DATA=YES
RESET_TARGET=<verified deployment id>
RESET_CONFIRMATION=REPLACE_CURRENT_TOONSTUDIO_IN_PLACE
```

## 12.6 외부 파일 호환은 유지

기존 내부 데이터 폐기와 외부 사용자 파일 호환은 별개다. PSD·PSB·ORA·SVG·PDF·SUT·SUTG·ABR·MYB·Krita bundle·glTF·VRM·영상·오디오 등은 새 `FormatGateway`로 가져오기·내보내기 범위를 최대화한다.

---

# 13. 구현 단계

## Phase 0 — 기존 Studio 경계 감사·후보 검증 기반

- 현재 저장소·Studio 엔트리포인트·배포·인증·API·저장 경계 문서화
- 기존 코드의 유지/폐기 결정표와 삭제 목록
- 새 monorepo·병렬 앱 생성 금지 검사
- EngineCapabilityRegistry
- 동일 Scene/Stroke/Filter corpus
- provider license manifest
- benchmark harness
- visual diff

## Phase 1 — CanvasKit·Vello 기준선

- 동일 ToonSceneIR을 CanvasKit과 Vello에서 렌더
- Parley text와 Kurbo path
- cross-renderer diff
- one-primary-surface 규칙

## Phase 2 — 입력·브러시 Provider

- tablet/finger pipeline
- Google Ink PoC와 fallback
- Skia raster brush
- libmypaint/Hokusai parity
- unlimited preset catalog

## Phase 3 — Filter Provider

- CanvasKit/OpenCV/libvips
- G’MIC/GEGL dynamic provider
- preview/final scheduler
- custom candidate benchmark path

## Phase 4 — Comic Production

- CSP 비열위 end-to-end task flow

## Phase 5 — Animation Production

- cell/light table/onion/camera/audio/keyframe/batch output

## Phase 6 — Asset/Format Ecosystem

- marketplace, importers, fidelity lab, rights

## Phase 7 — Hardening

- CSP blind test
- long-session stability
- fault injection
- all-provider fallback

## Phase 8 — 동일 Studio 경로 인플레이스 교체

- 기존 `/studio` 빌드 타깃을 새 구현으로 직접 교체
- 별도 V11 route·앱·배포가 존재하지 않음을 검사
- legacy source/API/Worker/store/fallback 제거
- 명시적 기존 Studio 내부 데이터 파괴 초기화
- 기존 도메인·인증·권한·배포 계약 테스트
- 새 Studio만 포함된 배포 산출물 검증

---

# 14. 최종 판정

가장 좋은 구조는 “직접 구현하지 않는 구조”도, “모든 것을 직접 만드는 구조”도 아니다.

> **각 엔진의 검증된 장점을 최대한 활용해 하이브리드 파이프라인을 만들고, 품질·성능·비파괴 의미·확장성에서 부족한 부분은 자체 구현 또는 fork로 보완하며, 실제 benchmark에서 가장 좋은 구현을 주력으로 선택하는 구조**가 최종안이다.

이 원칙을 적용하면 기능 확장 속도와 검증된 품질을 얻으면서도 ToonStudio가 CSP를 넘어설 수 있는 자연매체, 통합 vector/raster stroke, comic workflow, 고성능 filter graph, material brush 같은 차별화 영역을 제한하지 않는다.

---

# 15. 공식 기준 자료

- CanvasKit / Skia: https://skia.org/docs/user/modules/canvaskit/
- Vello: https://github.com/linebender/vello
- Vello Hybrid: https://docs.rs/vello_hybrid/latest/vello_hybrid/
- Google Ink: https://github.com/google/ink
- libmypaint: https://github.com/mypaint/libmypaint
- Hokusai: https://github.com/reearth/hokusai
- ThorVG: https://www.thorvg.org/about
- OpenCV image processing: https://docs.opencv.org/5.0/tutorials/imgproc/table_of_content_imgproc.html
- libvips: https://libvips.github.io/libvips/
- G’MIC: https://gmic.eu/
- GEGL: https://gegl.org/
- Parley: https://github.com/linebender/parley
- Kurbo: https://github.com/linebender/kurbo
- Xilem/Masonry: https://github.com/linebender/xilem
