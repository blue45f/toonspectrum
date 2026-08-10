# Codex 마스터 프롬프트 V11.1 — 기존 Studio 인플레이스 전면 교체·하이브리드 엔진 우선

## 입력 문서

```text
docs/architecture/ToonStudio_기존스튜디오_인플레이스전면교체_하이브리드최종아키텍처_V11.1_2026-08-07.md
docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv
```

## 역할

당신은 ToonStudio V11.1의 수석 아키텍트, 그래픽 엔진 통합 책임자, 성능 엔지니어, 품질 검증 책임자다. 새 monorepo나 병렬 Studio 앱을 만들지 말고 현재 저장소의 기존 Studio 경계와 기존 `/studio` 배포 경로 안에서 구현을 전면 교체한다. 기존 Studio 내부 창작 데이터는 마이그레이션하지 않고 파괴 초기화한다. 외부 창작 포맷과 CSP 사용자 자산은 새 FormatGateway에서 최대한 지원한다.

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
IN_PLACE_GREENFIELD_REWRITE=TRUE
NEW_MONOREPO=FALSE
PARALLEL_STUDIO_APP=FALSE
SAME_STUDIO_ROUTE=TRUE
LEGACY_DATA_MIGRATION=FALSE
```

V10의 `ENGINE_FIRST_CUSTOM_LAST`, “직접 구현 금지”, “범용 알고리즘을 직접 만들지 마라” 규칙은 폐기한다.

## 절대 규칙

0. 현재 저장소를 먼저 조사하고 기존 Studio 루트·라우트·빌드·배포 경계를 확정한다. 경로를 추측해 새 앱을 만들지 않는다.
0.1. `/apps/studio-web-v11`, `/studio-v11`, 별도 V11 배포, 별도 monorepo를 생성하지 않는다.
0.2. 기존 Studio와 새 Studio를 동시에 운영하는 장기 dual-runtime을 만들지 않는다.
0.3. 기존 Studio 소스는 같은 경계에서 삭제·교체할 수 있다. 인증·세션·결제·권한·업로드 등 주변 인프라는 감사와 계약 테스트 후 재사용한다.
0.4. 기존 Studio 내부 데이터 migration·legacy reader·compatibility shim을 구현하지 않는다. 외부 파일 포맷 importer/exporter는 이 규칙의 대상이 아니다.
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

## 기존 저장소 통합·교체 규칙

Codex는 먼저 다음을 탐색하고 `docs/rewrite/current-studio-boundary.md`에 실제 경로를 기록한다.

```text
REPO_ROOT
STUDIO_APP_ROOT
STUDIO_ROUTE_ENTRY
STUDIO_BUILD_TARGET
STUDIO_DEPLOY_TARGET
AUTH_SESSION_BOUNDARY
API_BOUNDARY
CURRENT_STORAGE_BOUNDARY
CURRENT_WORKER_BOUNDARY
```

다음 경로를 새로 만들지 않는다.

```text
/apps/studio-web-v11
/apps/asset-market-v11
/apps/benchmark-lab-v11
/studio-v11
별도 V11 monorepo
```

현재 저장소가 monorepo이면 기존 workspace에 통합하고, 단일 앱이면 단일 앱을 유지한다. 아래는 실제 경로를 강제하지 않는 논리 모듈이다.

```text
<existing-studio-root>/
├─ core/project-model
├─ core/command-registry
├─ core/hybrid-planner
├─ core/engine-registry
├─ core/comic
├─ core/animation
├─ core/assets
├─ core/storage
├─ core/format-gateway
├─ engines/skia
├─ engines/vello
├─ engines/google-ink
├─ engines/mypaint
├─ engines/hokusai
├─ engines/thorvg
├─ engines/opencv
├─ engines/vips
├─ engines/gmic-gegl-bridge
├─ engines/toon-gpu-extensions
├─ workers
├─ ui
└─ tests/{corpus,benchmarks,visual,fault-injection}
```

버전 접미사를 소스 경로와 런타임 식별자에 붙이지 않는다. 최종 배포 산출물은 기존 Studio 하나이며 기존 `/studio` 엔트리포인트가 새 구현을 직접 로드해야 한다.

## Phase 0 — Existing Studio Boundary and Foundation

- 현재 저장소·Studio 루트·라우트·빌드·배포·인증·API·저장 경계를 실제 파일 기준으로 감사한다.
- 유지할 플랫폼 인프라와 삭제할 편집 코어를 구분하고 삭제 목록을 만든다.
- 기존 package manager·workspace·CI를 유지하되 필요한 작업만 추가한다.
- 기존 Studio 루트 안에 CreatorProjectGraph, CommandBus, stable IR을 구축한다.
- EngineCapabilityRegistry와 Provider benchmark harness를 구축한다.
- append journal과 crash recovery vertical slice를 기존 `/studio` 진입점에서 실행한다.
- 기존 편집 코어는 요구사항 참고 후 삭제·교체하며 새 병렬 앱을 만들지 않는다.

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

## Phase 8 — In-place Replacement

- 모든 release gate 통과 후 기존 `/studio` 빌드 타깃을 새 구현으로 직접 교체한다.
- 별도 V11 앱·라우트·배포가 존재하지 않음을 자동 검사한다.
- legacy source/API/Worker/store/fallback route를 제거한다.
- 기존 Studio 내부 데이터는 명시적 파괴 플래그로 폐기한다.
- 인증·세션·권한·결제·업로드·배포 계약 테스트를 통과한다.
- 최종 번들에 구 Studio 코드와 legacy schema 접근이 0건임을 증명한다.

## 매 단계 결과 보고

```text
changed files
existing Studio paths replaced/deleted
proof that no parallel app/route/monorepo was created
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

계획 문서만 만들고 멈추지 마라. 각 Phase에서 기존 `/studio` 진입점으로 실행되는 vertical slice, 자동 테스트, benchmark raw data, fault-recovery 증거를 남긴다. 모든 주요 기능은 CSP와 동일 장치·동일 작업으로 비교하고 동률 이상을 입증해야 완료 처리한다. 완료 시점에는 별도 V11 앱이 존재하지 않고 기존 Studio 경로가 새 구현으로 완전히 대체되어야 한다.
