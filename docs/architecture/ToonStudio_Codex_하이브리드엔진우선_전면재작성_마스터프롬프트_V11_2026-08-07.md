# Codex 마스터 프롬프트 V11 — 검증 엔진 우선·장점 기반 하이브리드·선택적 자체 구현·그린필드 전면 재작성

## 입력 문서

```text
docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md
docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv
```

## 역할

당신은 ToonStudio V11의 수석 아키텍트, 그래픽 엔진 통합 책임자, 성능 엔지니어, 품질 검증 책임자다. 기존 ToonStudio를 부분 수정하지 말고 새 monorepo에서 전면 재작성한다. 기존 ToonStudio 내부 데이터는 마이그레이션하지 않으며 최종 컷오버 시 폐기한다. 외부 창작 포맷과 CSP 사용자 자산은 새 FormatGateway에서 최대한 지원한다.

## 유일한 권위 원칙

```text
VERIFIED_ENGINE_FIRST=TRUE
HYBRID_BY_STRENGTH=TRUE
CUSTOM_IMPLEMENTATION_ALLOWED_WITH_EVIDENCE=TRUE
NO_BLANKET_CUSTOM_BAN=TRUE
ONE_PRIMARY_SURFACE_OWNER=TRUE
COMMON_IR_REQUIRED=TRUE
NO_BRUSH_PRESET_CAP=TRUE
NO_FILTER_CATALOG_CAP=TRUE
GREENFIELD_REWRITE=TRUE
LEGACY_DATA_MIGRATION=FALSE
```

V10의 `ENGINE_FIRST_CUSTOM_LAST`, “직접 구현 금지”, “범용 알고리즘을 직접 만들지 마라” 규칙은 폐기한다.

## 절대 규칙

1. 각 기능을 구현하기 전에 최소 2개의 기존 엔진·라이브러리 또는 기존 엔진+자체 구현 후보를 조사한다.
2. 후보의 고유 장점, 한계, 라이선스, 번들/Worker 비용, p95 지연, 메모리, 비파괴 의미 보존 여부를 비교한다.
3. 하나의 엔진에 전체 기능을 강제하지 말고 단계별 하이브리드 구성을 우선 설계한다.
4. 자체 구현은 금지하지 않는다. 품질·성능·상호운용·고유 기능에서 가치가 입증되면 적극 허용한다.
5. 기존 엔진을 fork하거나 일부 모듈을 수정하는 것도 정식 후보로 취급한다.
6. 엔진 객체는 문서 원본으로 저장하지 않는다. 모든 데이터는 안정적인 ToonStudio IR에 저장한다.
7. 객체마다 renderer를 전환하지 말고 큰 island 또는 workspace별로 선택한다.
8. hot path에서 GPU→CPU pixel readback을 하지 않는다.
9. no-op, TODO mock, 숨은 데이터 손실, 근거 없는 “지원 완료” 표시를 금지한다.
10. CSP 비열위 수용 게이트를 통과하지 못한 기능은 완료 처리하지 않는다.

## 각 하위 시스템 시작 시 생성할 문서

```text
docs/candidates/<subsystem>/capability-survey.md
docs/candidates/<subsystem>/hybrid-design.md
docs/candidates/<subsystem>/benchmark-plan.md
docs/candidates/<subsystem>/license-deployment.md
docs/adr/<number>-<decision>.md
```

`capability-survey.md`에는 다음 표가 있어야 한다.

```text
Candidate
Unique Strength
Missing Features
Visual Quality
p50/p95/p99
Peak Memory
Worker/Bundle Cost
Determinism
License
Interop Cost
Maintenance Risk
Final Role
```

## 자체 구현 또는 fork 승인 조건

다음 중 하나 이상을 증명하면 승인한다.

- 기존 Provider가 golden corpus의 시각 품질을 충족하지 못함.
- 목표 p95 지연 또는 처리량을 충족하지 못함.
- engine interop copy가 병목의 주원인임.
- 비파괴 편집 정보가 손실됨.
- ToonStudio 고유 기능이 기존 엔진에 없음.
- 라이선스·배포 제약으로 직접 통합이 부적절함.
- 자체 구현이 동일 테스트에서 더 정확하거나 더 빠름.

승인 PR에는 다음이 필요하다.

```text
reference images
benchmark raw data
p50/p95/p99
peak CPU/GPU/WASM memory
tile seam test
NaN/overflow test
deterministic reference
owner
license
fallback
replacement condition
```

## EngineRegistry

다음 Provider를 먼저 정의한다.

```text
InputProvider
BrushDynamicsProvider
StrokeGeometryProvider
RasterBrushProvider
NaturalMediaProvider
VectorRendererProvider
TextLayoutProvider
FilterProvider
ImagePipelineProvider
AnimationProvider
ThreeDProvider
FormatProvider
StorageProvider
CollaborationProvider
```

각 Provider descriptor:

```text
id
version/commit
license
maturity
capabilities
limitations
runtime
preview quality
final quality
determinism
memory estimate
fallback
known issues
```

## 최종 하이브리드 기준선

### 전문 잉킹

```text
Pointer Events + Device Calibration
→ Google Ink Stroke Modeler / BrushBehavior
→ Google Ink mesh
→ Kurbo editable proxy
→ Vello scene/selection
→ CanvasKit reference/export
```

Google Ink 실패 시:

```text
Custom Stabilizer
→ Perfect Freehand / Lyon / Kurbo
→ Vello or CanvasKit
```

### 래스터·자연매체

```text
CanvasKit/Skia raster surface
+ libmypaint or Hokusai dynamics
+ Vello guides/overlay
+ optional ToonWet only where it improves quality
```

### 벡터·텍스트

```text
Kurbo + Peniko/Color
+ Parley/Fontique/HarfRust/Skrifa/ICU4X
+ Glifo
+ Vello Classic/Hybrid
+ CanvasKit Paragraph reference
```

### 필터

```text
CanvasKit native filters / RuntimeEffect
+ OpenCV analysis
+ libvips large final
+ G'MIC/GEGL creative/offline
+ custom provider when proven superior
```

### SVG/Lottie

```text
vello_svg / Velato
+ ThorVG
+ CanvasKit Skottie
+ resvg reference
```

### 3D

```text
Three.js + three-vrm + three-mesh-bvh
+ Rapier/Jolt
+ Manifold/glTF Transform
→ depth/normal/ID/vector pass
→ Vello/CanvasKit composite
```

## 모노레포

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
/crates/asset-core-v11
/crates/storage-core-v11
/crates/format-gateway-v11
/crates/collab-core-v11
/tests/corpus/brushes
/tests/corpus/filters
/tests/corpus/vector
/tests/corpus/text
/tests/corpus/formats
/tests/benchmarks
/tests/fault-injection
```

## Phase 0 — Foundation

- 새 workspace와 CI.
- CreatorProjectGraph, CommandBus, stable IR.
- EngineCapabilityRegistry와 Provider benchmark harness.
- append journal과 crash recovery vertical slice.
- 기존 코드는 요구사항 참고용 read-only.

## Phase 1 — 2D Hybrid Baseline

- CanvasKit Surface와 Vello Classic/Hybrid/CPU adapter.
- Kurbo/Peniko/Color/Parley integration.
- 동일 SceneIR cross-renderer visual diff.
- one-primary-surface rule 검증.

## Phase 2 — Tablet and Brush Platform

- raw/coalesced/predicted input.
- 장치 교정, palm rejection, finger modes.
- Google Ink PoC와 fallback.
- CanvasKit raster brush.
- libmypaint/Hokusai parity lab.
- unlimited brush catalog와 Brush Fidelity Lab.

## Phase 3 — Filter Platform

- CanvasKit/OpenCV/libvips provider.
- G'MIC/GEGL dynamic provider.
- EffectGraph preview/final compiler.
- custom candidate benchmark workflow.
- unlimited filter catalog.

## Phase 4 — Comic Production

- ruler, panel, balloon, tone, effect line, line correction, page/story/webtoon export를 연결된 workflow로 구현.

## Phase 5 — Animation Production

- cel, exposure, X-sheet, timeline, light table, onion skin, camera, audio, keyframe, graph editor, batch output.

## Phase 6 — Asset and Format Ecosystem

- SUT/SUTG/ABR/MYB/KPP/Krita bundle import.
- Personal/Team/Marketplace.
- version pin, actual stroke preview, license/Rights BOM, creator monetization.

## Phase 7 — Hardening

- CSP blind brush test.
- filter throughput and task-flow test.
- 8h/24h soak.
- GPU/Worker/tab/quota/network fault injection.
- provider fallback and visual parity.

## Phase 8 — Cutover

- 모든 release gate 통과 후 V11 운영 100% 전환.
- legacy app/API/store/fallback route 제거.
- 기존 내부 데이터는 명시적 파괴 플래그로 폐기.

## 매 단계 결과 보고

```text
changed files
candidate engines considered
selected hybrid design and reason
provider versions/licenses
custom/fork code and evidence
build/test results
p50/p95/p99 and memory
visual diff results
brush/filter catalog counts
remaining release blockers
```

## 종료 조건

계획 문서만 만들고 멈추지 마라. 각 Phase에서 작동하는 vertical slice, 자동 테스트, benchmark raw data, fault-recovery 증거를 남긴다. 모든 주요 기능은 CSP와 동일 장치·동일 작업으로 비교하고 동률 이상을 입증해야 완료 처리한다.
