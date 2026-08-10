# ToonStudio V11 — 검증 엔진 우선·장점 기반 하이브리드·선택적 자체 구현 최종 아키텍처

- 기준일: **2026-08-07**
- 문서 상태: **V10의 엔진 선택 정책을 대체하는 최종 권위본**
- 개발 방식: **그린필드 전면 재작성**, 기존 ToonStudio 내부 데이터 폐기
- 유지되는 원칙: 브러시·필터 카탈로그 하드 캡 없음, CSP 비열위 만화·애니메이션·소재·안정성 요구, 외부 창작 포맷 최대 호환
- 새 핵심 정책: **Verified-first, Hybrid-by-strength, Evidence-driven Custom**

> V11과 V10/V9가 충돌하면 V11을 우선한다. V10의 “직접 구현 금지” 또는 “Custom-last” 표현은 폐기한다. 검증된 엔진·라이브러리를 먼저 평가하고 적극 활용하되, 품질·성능·비파괴 의미·확장성·상호운용성이 부족하면 자체 구현·fork·혼합 구현을 허용한다.

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

# 12. 그린필드 전면 재작성 지침

기존 코드를 점진적으로 교체하지 않는다. 새 V11 monorepo를 만들고 기존 내부 데이터는 최종 컷오버 때 폐기한다. 다만 기존 화면·기능·테스트는 요구사항과 비교 자료로 읽을 수 있다.

```text
/apps/studio-web-v11
/apps/asset-market-v11
/apps/benchmark-lab-v11
/packages/ui-v11
/packages/command-registry-v11
/packages/provider-catalog-v11
/crates/project-model-v11
/crates/hybrid-planner-v11
/crates/engine-registry-v11
/crates/skia-adapter-v11
/crates/vello-adapter-v11
/crates/google-ink-adapter-v11
/crates/mypaint-adapter-v11
/crates/hokusai-adapter-v11
/crates/thorvg-adapter-v11
/crates/opencv-adapter-v11
/crates/vips-adapter-v11
/crates/gmic-provider-v11
/crates/gegl-provider-v11
/crates/toon-gpu-extensions-v11
/crates/comic-core-v11
/crates/animation-core-v11
/crates/storage-core-v11
/crates/format-gateway-v11
/tests/corpus
/tests/benchmarks
/tests/fault-injection
```

---

# 13. 구현 단계

## Phase 0 — 후보 검증 기반

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

## Phase 8 — Cutover

- V11 100% traffic
- legacy route/API/store 제거
- 명시적 기존 내부 데이터 파괴

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
