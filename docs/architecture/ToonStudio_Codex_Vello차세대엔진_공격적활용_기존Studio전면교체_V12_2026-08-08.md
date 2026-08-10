# ToonStudio Codex 마스터 프롬프트 V12 — Vello·차세대 엔진 공격적 활용, 기존 Studio 인플레이스 전면 교체

## 0. 실행 선언

당신은 기존 ToonStudio 저장소에서 현재 `/studio` 구현을 **같은 경로·같은 배포 단위 안에서 전면 교체**한다. 계획서만 작성하고 멈추지 말고 실제 코드, 빌드, 테스트, benchmark, 문서, 제거 작업까지 수행한다.

```text
IN_PLACE_GREENFIELD_REWRITE=TRUE
NEW_MONOREPO=FALSE
PARALLEL_STUDIO_APP=FALSE
SAME_STUDIO_ROUTE=TRUE
LEGACY_DATA_MIGRATION=FALSE
DISCARD_EXISTING_STUDIO_DATA=TRUE
EXTERNAL_FORMAT_INTEROP_MAX=TRUE
VELLO_PRIMARY_2D_HUB=TRUE
SPARSE_STRIPS_FIRST=TRUE
RUNTIME_RENDERER_TOURNAMENT=TRUE
SHADOW_RENDERING=TRUE
VENDOR_AND_FORK_ALLOWED=TRUE
WGPU30_INTEROP_TRACK=TRUE
SKIA_GRAPHITE_CHALLENGER=TRUE
XILEM_CANVAS_UI_EXPERIMENT=TRUE
WESL_SHADER_PLATFORM=TRUE
NO_BRUSH_PRESET_CAP=TRUE
NO_FILTER_CATALOG_CAP=TRUE
```

권위 문서:

```text
docs/architecture/ToonStudio_Vello차세대엔진_공격적활용_CSP초월_인플레이스최종아키텍처_V12_2026-08-08.md
docs/architecture/ToonStudio_V12_차세대엔진_승격게이트_매트릭스.csv
```

저장소에 문서가 없다면 제공된 원문을 해당 경로에 복사한다.

---

## 1. 절대 금지

- 새 monorepo 생성
- `/studio-v12`, `/next-studio`, 별도 도메인·병렬 앱 생성
- legacy document migration, compatibility shim, old reader 작성
- 새 renderer가 실패할 때 구 Studio로 돌아가는 운영 fallback 유지
- `vello::Scene`, `SkPath`, GPUTexture를 영구 문서 원본으로 저장
- React state에 pointer sample, particle, bristle, pixel tile 저장
- GPU 결과를 일반 편집 중 매 frame CPU readback
- 모든 engine을 동시에 전체 화면 renderer로 상주
- benchmark 없이 “빠르다”, “CSP보다 우수하다” 완료 처리
- fake adapter, TODO-only provider, mock benchmark로 phase 완료 표시
- 아키텍처 문서만 만들고 실제 vertical slice를 생략

---

## 2. 저장소 감사

첫 작업으로 현재 저장소를 읽고 다음을 `docs/rewrite/current-studio-boundary.md`에 기록한다.

```text
REPO_ROOT
STUDIO_APP_ROOT
STUDIO_ROUTE_ENTRY
STUDIO_BUILD_TARGET
STUDIO_DEPLOY_TARGET
PACKAGE_MANAGER
EXISTING_WORKSPACE_LAYOUT
AUTH_SESSION_BOUNDARY
SHARED_UI_BOUNDARY
API_BOUNDARY
CURRENT_RENDER_BOUNDARY
CURRENT_STORAGE_BOUNDARY
CURRENT_WORKER_BOUNDARY
CURRENT_TEST_COMMANDS
CURRENT_DEPLOY_COMMANDS
```

기존 구조가 monorepo면 기존 workspace만 사용한다. 단일 앱이면 단일 앱을 유지한다. 경로를 추측해 새 구조를 만들지 않는다.

다음 세 목록을 만든다.

1. 플랫폼 인프라로 재사용: auth/session/user/org/billing/deploy/CDN/observability 중 gate를 통과한 것.
2. 읽기 전용 참고: 기존 UI 흐름·기능·테스트·파일 포맷 지식.
3. 삭제 대상: 기존 document model, renderer loop, brush/filter core, Undo/storage schema, legacy workers/API/routes.

---

## 3. 문서 원본 코어를 먼저 구축

구현 순서:

```text
CreatorProjectGraph
CommandRegistry / CommandBus
StrokeIR / BrushProgramIR
PathIR / ShapeIR / PaintIR / TextIR
LayerGraphIR / EffectGraphIR
ComicGraph / AnimationGraph
AssetGraph / FormatInteropIR
Append-only CommandJournal / Snapshot / CAS
```

수용 기준:

- renderer를 완전히 제거해도 command replay와 document validation이 된다.
- 모든 ID가 안정적이다.
- schema version과 migration framework는 V12 이후를 위한 것이며 legacy data reader가 아니다.
- Undo는 전체 canvas snapshot이 아니라 command + tile/object delta다.
- 자동 저장은 input/render frame을 block하지 않는다.

---

## 4. Vello Hub를 기본 2D 경로로 구현

### 4.1 baseline pin

- Vello Classic 0.9.x compatible commit
- Sparse Strips/Vello Hybrid/Vello CPU 0.2.x compatible commit
- Glifo 0.3.x compatible commit
- Kurbo 0.13.1
- Peniko 0.6.1
- Linebender Color 0.3.3
- Parley 0.11.x

정확한 commit, Cargo.lock, source URL, license를 `docs/engines/vello-baseline.md`에 기록한다.

### 4.2 VelloHub interface

```rust
trait VelloBackend {
    fn capabilities(&self) -> CapabilitySet;
    fn compile(&mut self, scene: &ToonSceneIR, shard: &SceneShard) -> Result<CompiledIsland>;
    fn render(&mut self, job: &CompiledIsland, target: &TextureTarget) -> Result<RenderStats>;
    fn reset_device(&mut self, epoch: DeviceEpoch) -> Result<()>;
}
```

구현:

- HybridWgpuBackend
- ClassicWgpuBackend
- CpuReferenceBackend
- HybridWebGlBackend는 호환성 보조이며 Studio Max 설계를 제한하지 않는다.

### 4.3 첫 vertical slice

```text
pointer input
→ StrokeIR
→ Kurbo path
→ Hybrid와 Classic compile 후보
→ microbenchmark winner 선택
→ Vello render
→ journal commit
→ forced reload
→ 무손실 복구
```

이 vertical slice는 기존 `/studio` route에서 실행해야 한다.

---

## 5. Renderer Tournament를 실제 구현

다음을 코드로 만든다.

```text
SceneFingerprint
DeviceWorkloadProfile
ProviderCostModel
WinnerCache
HysteresisPolicy
ShadowRenderer
VisualEquivalenceGate
PromotionRegistry
RemoteKillSwitch
```

후보는 단순 이름으로 선택하지 않는다. 실제 scene metrics와 warm/cold timings를 사용한다.

필수 로그:

- CPU preparation p50/p95/p99
- GPU pass time
- peak texture/buffer bytes
- atlas occupancy/fragmentation
- path/glyph/image/filter counts
- visual diff to reference
- device/browser/engine hash
- error/device-loss count

winner는 pen-down 중 전환하지 않는다. 12% 미만 예상 이득에는 hysteresis를 적용한다.

Shadow renderer는 production output에 절대 영향을 주지 않는다.

---

## 6. `toon-vello` fork와 wgpu 30 track

현재 저장소 안에서 관리한다. 새 repo/monorepo를 만들지 않는다.

```text
vendor/vello-upstream
patches/vello
engines/vello-adapter
```

두 CI build를 유지한다.

```text
upstream-compatible: Vello upstream + wgpu 29
next: toon-vello patches + wgpu 30
```

우선 구현/검증:

1. existing GPUDevice/Queue handoff 또는 raw handle 접근.
2. external GPUTexture import/export.
3. `Device::as_webgpu`, `Queue::as_webgpu`, `create_texture_from_webgpu_handle` PoC.
4. lifetime/drop callback/resource epoch.
5. scene fragment/recording incremental cache.
6. dirty viewport shard.
7. device lost recreation.
8. allocator report, timestamp query, error scopes.
9. pipeline cache.
10. panic-prone feature calls를 capability error로 변환.

각 patch는 독립 commit과 upstream 가능성 메모를 가져야 한다.

---

## 7. GpuInteropBroker

한 browser GPUDevice를 가능한 한 공통 사용한다.

- Rust/wgpu가 device/queue를 소유한다.
- underlying JS GPUDevice/GPUQueue를 C++/JS providers에 전달한다.
- 같은 device에서 생성된 GPUTexture만 zero-copy로 래핑한다.
- texture format, usage, color space, alpha mode, lifetime을 검증한다.
- central submit epoch로 queue ordering을 관리한다.
- provider별 GPU budget을 강제한다.
- same-device PoC가 실패하면 large island 결과만 transfer한다.
- per-object, per-dab, per-frame CPU readback fallback은 금지한다.

fault tests:

- provider가 texture를 먼저 destroy
- wrong device texture
- wrong usage/format
- device loss during submit
- provider worker termination
- queue submit order inversion

---

## 8. WESL shader platform

WESL/wesl-rs를 조사·pin하고 다음 pipeline을 구현한다.

```text
Typed BrushGraph/EffectGraph
→ constant folding
→ node fusion
→ WESL module/import/@if
→ WGSL
→ Naga validation/reflection
→ browser compile
→ pipeline cache
```

shader manifest 필수:

- input/output formats
- bind groups
- workgroup size
- storage writes
- bounds/halo
- determinism
- memory estimate
- time dependency
- preview/final variants
- license/provenance

plugin shader는 sandbox/budget을 통과하지 못하면 실행하지 않는다.

---

## 9. Google Ink 공격적 통합

- Google Ink C++ core를 pinned commit으로 vendoring한다.
- 필요한 color/types/geometry/brush/strokes/storage만 빌드한다.
- Android Mesh renderer는 직접 의존하지 않는다.
- C ABI를 얇게 만든다.
- first stage: mesh delta → Rust wgpu buffer upload.
- second stage: Emdawnwebgpu same-device interop.
- centerline/edit proxy는 Kurbo/Vello로 유지한다.
- mesh를 매 frame Vello path로 재-tessellate하지 않는다.

필수 corpus:

- G-pen, mapping pen, calligraphy, marker
- slow/fast/taper/corner/loop
- pressure/tilt/azimuth/twist
- Wacom/Apple Pencil/S Pen/Surface/Huion/XP-Pen

CSP 최신 안정판 blind preference와 latency gate를 통과해야 default가 된다.

---

## 10. Skia Graphite challenger

Graphite를 stable dependency로 가정하지 말고, 실제 C++ WASM build를 시도한다.

```text
Skia Graphite
+ Dawn/Emdawnwebgpu
+ same GPUDevice experiment
+ Recorder/Recording workload
+ Vello final composition
```

비교 대상:

- CanvasKit Ganesh
- Vello Hybrid
- custom wgpu provider

비교 workload:

- raster brush tile
- filter-heavy layer
- image/clip/overdraw-heavy scene
- multi-threaded recording

WASM compile failure, device-loss, visual mismatch는 기록하고 Graphite lane만 강등한다. 전체 Studio phase를 막지 않는다.

---

## 11. Xilem/Masonry CanvasWidgetIsland

React shell을 제거하지 않는다. Xilem/Masonry는 캔버스 고주파 UI에 실제 PoC한다.

구현 대상:

- brush cursor
- transform handles
- vector anchors
- selection HUD
- perspective rulers
- onion skin/light table controls
- timeline scrubber
- camera safe area
- minimap/presence

React/Vello overlay와 latency·accessibility·IME·testability를 비교한다. 이기면 Pen Display Surface Mode에서 기본값으로 승격한다.

---

## 12. 브러시·필터 무제한 확장

preset/filter 수에 cap을 두지 않는다.

브러시는 `BrushProgramIR`로 provider를 조합한다.

```text
Google Ink
Vello/Kurbo/Lyon
CanvasKit/Graphite
libmypaint/Hokusai
ThorVG/vello_svg
XPBD/particle/3D providers
```

필터는 `EffectGraphIR`을 segment한다.

```text
Vello native subset
CanvasKit/SkSL
Graphite challenger
OpenCV
libvips
G’MIC/GEGL
WESL custom provider
```

필터 하나가 Vello에 없다고 전체 layer를 Vello 밖으로 빼지 않는다. 미지원 segment만 external texture island로 처리하고 Vello scene에 재주입한다.

---

## 13. CSP 비열위 기능을 release blocker로 유지

다음은 후순위가 아니다.

### Tablet/brush

- raw/coalesced/predicted input
- pressure/tilt/azimuth/twist calibration
- pen/finger/palm separation
- 100+ Golden brush set
- Brush Fidelity Lab

### Manga

- perspective/symmetry/fisheye/special rulers
- panels/folders/masks/camera/reading order linked transaction
- balloons/tails/dialogue-character linkage
- tones, speed/focus lines, dust removal, line correction
- multi-page/story editor/webtoon spacing/export

### Animation

- cel/drawing level/exposure
- timeline/x-sheet/graph editor
- light table/onion skin
- 2D/3D camera
- audio waveform/scrub/lip timing
- keyframes/tangents/interpolation
- batch output/OTIO

### Assets

- SUT/SUTG/ABR/MYB/Krita bundles
- personal/team/public marketplace
- license/provenance/version pin
- engine/device preview
- creator monetization

### Reliability

- append-only journal + immutable blobs + snapshots
- tab crash, worker kill, device loss, quota, network, collaboration faults
- 8h/24h soak
- import/export loss report

완료 표시는 CSP 동선·품질·성능 gate를 통과한 뒤에만 한다.

---

## 14. Phase 순서

1. Repo/Studio boundary audit.
2. ProjectGraph/Command/Journal.
3. Vello Hub vertical slice on existing `/studio`.
4. Sparse Strips 0.2 + Vello CPU golden.
5. Renderer Tournament + Shadow Renderer.
6. toon-vello/wgpu30/GpuInteropBroker.
7. Parley/Glifo/vello_svg/Velato.
8. Google Ink + WESL.
9. Graphite + Xilem/Masonry frontier.
10. Brushes/filters/assets.
11. Manga/animation completion.
12. Stability/fault/soak/CSP benchmarks.
13. Existing internal Studio data destructive reset.
14. Legacy code/routes/workers/storage removal and 100% in-place cutover.

각 phase마다:

- code
- tests
- benchmark JSON
- visual artifacts
- ADR
- license record
- deletion list
- next risk

을 커밋한다.

---

## 15. 완료 보고 형식

각 실행 응답은 다음만 보고하고 실제 파일 경로·명령 결과를 포함한다.

```text
Implemented
Deleted/Replaced
Build/Test/Benchmark commands
Measured results
Visual correctness results
Known failures and quarantined providers
CSP gate status
Next executable step
```

“설계했습니다”, “향후 구현할 수 있습니다”만으로 완료하지 않는다.

---

## 16. 파괴 초기화

legacy migration은 하지 않는다. 그러나 잘못된 환경 삭제를 막기 위해 다음 명시적 조건 없이는 실행하지 않는다.

```text
RESET_EXISTING_STUDIO_DATA=YES
RESET_TARGET=<verified deployment id>
RESET_CONFIRMATION=REPLACE_CURRENT_TOONSTUDIO_IN_PLACE_V12
```

이 안전장치는 migration을 위한 것이 아니라 우발적 운영 삭제를 막기 위한 것이다.

파괴 초기화 후 검증:

- old schema access 0
- old OPFS/IndexedDB/localStorage data 0
- old renderer/worker/API/fallback 0
- auth/session/org/billing platform data preserved
- external file import works
- new V12 project create/save/recover works

---

## 17. 최종 목표

아키텍처의 목표는 단순히 Vello를 사용하는 것이 아니다.

```text
Vello가 기본 2D scene hub
+ Sparse Strips/Classic/CPU runtime competition
+ Google Ink professional mesh inking
+ Graphite/Dawn raster challenger
+ WESL shader ecosystem
+ Xilem/Masonry canvas-native UI
+ stable providers and hot failover
+ CSP victory benchmarks
```

이 조합을 현재 `/studio` 내부에 실제로 구현하고, 최신 안정 CSP와 직접 비교해 이긴 경로를 기본값으로 승격하라.
