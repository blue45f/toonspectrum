# ToonStudio Scene3D 장기 플랫폼 고도화 — 2026-09-19

> **Wave B 후속 구현:** 실제 HDR/4K 컬러 캡처, renderer별 자원 풀, R3F/device 수명 연결 및 검증 결과는
> [캡처 구현 보고서](../reports/studio-scene3d-capture-wave-b-2026-09-19.md)를 따른다.
> 이는 전체 MRT/NPR·자산 eviction·새 엔진 승격 완료를 의미하지 않는다.

## 1. 목표

ToonStudio의 3D 기능을 새 엔진 하나로 교체하는 프로젝트로 보지 않는다.

장기 목표는 다음 하나다.

```text
StudioScene3dDocumentV1
        │
        ├─ Three primary renderer (WebGPU / WebGL2 compatibility)
        ├─ renderer-neutral NPR / output contract
        ├─ CharacterDocumentV2 projection
        ├─ bounded specialist kernels
        └─ explicit promotion gates
```

BG3D, VRM Poser, Character Shaper, Hybrid DCC, 향후 3D Virtual Studio는 서로 다른 영구
scene authority를 만들지 않는다. Runtime 엔진과 WASM/GPU 객체는 언제나 canonical document의
projection 또는 derivative다.

## 2. 2026-09-19 코드 감사에서 확인한 핵심 병목

### 2.1 설계가 실제 pixel path보다 앞서 있었다

`studio-scene3d-runtime-policy.ts`는 과거 WebGPU device가 있다는 이유만으로 MRT, CSM,
TAAU, SSGI, SSS 등을 사용 가능한 feature로 표시했다. 하지만 제품 코드 검색 기준 실제
Scene3D pixel runtime으로 승격된 구현은 아니었다.

이 브랜치부터 device capability와 product-admitted software capability를 분리한다.

- device capability: WebGPU, compute, texture compression, limits
- software capability: 실제 제품 runtime/provider + 검증이 존재하는 기능
- candidate: 문서/라이브러리 조사만 존재하며 product support가 아님

### 2.2 존재하지 않는 Gaussian Splat runtime을 계획하고 있었다

기존 runtime policy는 splat asset이 있으면 자동으로 `playcanvas-gsplat` specialist를
선택했다. 저장소에는 실제 PlayCanvas adapter가 없었다.

이 브랜치부터:

1. Three native splat이 실제 provider로 승격되면 primary 내부에서 우선 사용
2. 필요 시 Spark specialist
3. 그래도 측정 우위가 있을 때만 PlayCanvas/SuperSplat specialist
4. 아무 provider도 admission되지 않았으면 fail-closed

순으로 관리한다.

### 2.3 BG3D shadow projection이 실제 renderer보다 앞서 있었다

현재 BG3D directional shadow는 단일 orthographic shadow frustum이다. 과거 Scene3D
projection은 이를 `CSM / cascades=3`으로 기록했다.

이 브랜치부터 현재 사실대로 `standard / cascades=1`로 projection한다. 실제 cascaded
shadow 구현과 visual corpus가 들어오는 변경에서만 CSM capability를 승격한다.

## 3. 변경 불가능한 플랫폼 원칙

1. **한 세션에 하나의 primary scene renderer**
2. specialist는 canonical scene/UI/undo/storage authority를 가질 수 없음
3. candidate package 설치만으로 capability를 true로 만들지 않음
4. hidden renderer fallback 금지
5. GPU buffer/WASM pointer/engine-native scene object 저장 금지
6. pointer hot path의 동기 GPU readback 금지
7. 모든 고급 기능은 visual corpus + resource lifecycle + soak를 통과한 뒤 승격
8. WebGL2 compatibility path는 WebGPU 기능과 별개의 명시 경로로 유지
9. 최종 출력은 live canvas screenshot이 아니라 explicit render target job
10. 자산 최적화 결과는 canonical source가 아니라 content-addressed derivative

## 4. 기술 승격 체계

코드의 단일 원장은:

`apps/web/src/domains/creator/scene3d/studio-scene3d-platform-evolution.ts`

이다.

각 후보는 다음을 가진다.

- maturity: next / evaluate / research
- host: Three primary / Worker kernel / specialist renderer / offline toolchain / solver
- authority policy
- package candidates
- 적용 조건
- promotion gate

공통 gate:

- renderer-neutral authority
- golden visual parity
- capture contract
- memory stability / explicit dispose
- 30분 soak
- 필요 시 WebGPU/WebGL compatibility
- mobile browser
- p95 input/frame budget
- bundle budget
- asset round-trip
- license review

## 5. P0 — Scene3D authority와 editor 구조 수렴

### 5.1 canonical state

완료 목표:

```text
BG3D document ─┐
VRM/Character ─┼─> StudioScene3dDocumentV1
Hybrid DCC ────┘
                      │
                      └─ RuntimeProjection
```

해야 할 일:

- `useStudioBg3dEditorState`의 persistent document와 transient runtime state 완전 분리
- BG3D history command가 Scene3D command로 투영 가능한 범위 확대
- VRM linked character transform/shot/camera/light의 단일 authority화
- Hybrid DCC 결과는 verified derivative + command로만 Scene3D에 반입
- Linked 3D Layer round-trip receipt를 모든 3D 삽입 경로에 공통 적용

### 5.2 거대 Editor host 해체

현재 위험:

- `StudioBg3dEditorViewport.tsx`의 `@ts-nocheck`
- 거대한 `h` host bag
- `studio-bg3d-editor-runtime-bindings.ts`의 대형 re-export closure

목표 구조:

```text
scene3d/
  authority/
  runtime/
  renderer/
  camera/
  lighting/
  selection/
  transform/
  physics/
  character/
  capture/
  output/
  assets/
  specialists/
```

UI component는 renderer object를 직접 소유하지 않고 typed controller/command를 소비한다.

## 6. P0 — Three WebGPU / TSL 실제 RenderGraph

현재 `studio-scene3d-npr-render-graph.ts`는 pass planner다. 이를 실제 GPU graph와 연결한다.

목표:

```text
Scene projection
   │
Visibility / LOD / Skin / Morph
   │
MRT
   ├─ beauty base
   ├─ depth
   ├─ normal
   ├─ object id
   ├─ material id
   ├─ emission
   └─ velocity
       │
       ├─ shadows
       ├─ AO / SSGI
       ├─ semantic line
       ├─ tone / hatch
       ├─ selective SSS
       └─ bloom / DoF
              │
          TAA / TAAU
              │
          final output
```

승격 순서:

1. MRT attachment contract
2. depth/normal/object/material ID exactness
3. deterministic line/tone compositor
4. actual cascaded shadows
5. TAA
6. TAAU
7. SSGI
8. character-only SSS
9. bloom / DoF
10. velocity 기반 temporal rejection

각 기능은 `StudioScene3dSoftwareCapabilities`의 자기 bit를 별도 변경에서만 true로 만든다.

## 7. P0 — 자산 release pipeline 기본 강제

이미 존재하는 것:

- Meshopt decoder
- KTX2/Basis validation/transcoder/runtime
- glTF Transform provider
- asset admission model
- GPU budget evidence

정체 원인은 존재 여부가 아니라 “모든 production asset의 기본 release path”가 아니라는 점이다.

목표 pipeline:

```text
source
  │
rights + structural validation
  │
visual quality corpus
  │
LOD0 / LOD1 / LOD2+
  │
mesh optimization / compression
  │
KTX2 texture derivatives
  │
thumbnail + six-view golden
  │
GPU memory / draw-call receipt
  │
content hash
  │
production catalogue admission
```

정적 GLB와 VRM pipeline을 분리한다. VRM extension/metadata/humanoid/expression/MToon을
보존하지 못하는 최적화 도구는 VRM에 적용하지 않는다.

## 8. P1 — 성능 고도화

### 8.1 WebGPU Render Bundle

대상:

- 건물
- 가구
- 반복 소품
- 편집 중 변하지 않는 environment subtree

캐릭터, 선택 객체, gizmo, live deformation은 bundle 밖에 둔다.

승격 기준:

- large corpus CPU frame submission 유의미 개선
- editing invalidation 비용 악화 없음
- device loss 후 resource recreation
- GPU memory 지속 증가 없음

### 8.2 three-mesh-bvh GPU batch path

CPU BVH는 유지한다.

GPU 후보:

- 대량 Surface Ink 후보
- multi-object lasso
- placement/contact batch query
- cloth/body collision broad candidate
- large scene surface sampling

단일 pointer ray는 GPU readback 비용 때문에 무조건 GPU로 옮기지 않는다.

### 8.3 LOD / instancing / residency

- static compatible mesh instancing
- camera + projected-size LOD
- texture residency budget
- thumbnail/render-job backpressure
- inactive asset GPU eviction
- explicit ref-counted asset cache

### 8.4 GPU profiler

WebGPU timestamp-query가 허용되는 장치에서는 pass별 GPU 시간을 별도 receipt로 수집한다.

- warmup / steady-state 구분
- shadow / G-buffer / line / post / capture 구분
- wall-clock만으로 feature 승격 결정 금지
- profiler가 renderer 선택이나 document state를 바꾸지 않음

### 8.5 GPU-driven culling / indirect draw

Render Bundle만으로 CPU 제출 병목이 충분히 줄지 않을 때 평가한다.

- compute frustum candidate
- optional Hi-Z/occlusion candidate
- compact visible instance list
- indirect draw command generation
- selected/gizmo/live-deformed entity는 보수적으로 CPU-visible lane 유지

### 8.6 Mesh cluster / hierarchical LOD

대형 구조화 mesh 환경에는 release 단계에서 cluster/LOD derivative를 생성하는 방안을 평가한다.
원본 topology는 보존하고 runtime derivative만 교체 가능하게 만든다.

### 8.7 Tangent / animation release quality

- MikkTSpace-compatible tangent derivative로 normal-map seam/backend 차이를 고정
- VRM humanoid retarget receipt
- animation resample/keyframe optimization
- clip quality tier / animation LOD
- 원본 clip과 retargeted/compressed clip의 hash/version 분리

### 8.8 Off-main-thread output

2K/4K still, thumbnail, shot batch는 immutable Scene3D snapshot을 Worker에 넘겨 main-thread long task를 줄이는
방향을 평가한다. UI/input renderer를 Worker로 강제 이동하지 않고 output job부터 분리한다.

## 9. P1 — 캐릭터 품질

### 9.1 generalized IK

현재 two-bone/full-body 코드를 유지하면서 `closed-chain-ik-js`를 golden pose corpus와 A/B한다.

필수 fixture:

- 두 손으로 긴 소품 잡기
- 양발 고정 + 골반 이동
- 한 손 벽 접촉
- 앉기
- palm target + finger contact
- shoulder/elbow/wrist limits

외부 solver가 pose authority를 갖지 않는다. 결과는 bounded Character command다.

### 9.2 GPU XPBD

현재 CPU XPBD constraint 정의를 canonical contract로 유지한다.

GPU lane:

- distance
- bending
- attachment
- body collision
- self collision
- deterministic fixed timestep
- quality-tier iterations/substeps

GPU buffer는 persist하지 않는다.

### 9.3 변형

순서:

1. authored morph/corrective
2. fit cage
3. collision correction
4. libigl ARAP/biharmonic specialist 평가
5. OpenSubdiv specialist 평가

libigl/OpenSubdiv native object는 Scene3D에 저장하지 않는다.

## 10. P1 — Modeling / Hybrid DCC

### Boolean

```text
drag preview -> three-bvh-csg candidate
commit       -> Manifold canonical result
```

interactive preview가 실패해도 canonical Boolean 품질은 낮추지 않는다.

### CAD/NURBS/BIM

계속 specialist로 유지:

- OpenCascade
- rhino3dm
- web-ifc
- xatlas

Scene3D는 verified mesh/metadata derivative만 받는다.

## 11. P1/P2 — Gaussian Splat

승격 순서:

### A. Three native

첫 후보. primary scene 안에 머물 수 있으면 가장 단순하다.

검증:

- camera parity
- alpha/color contract
- crop
- output capture
- memory
- large corpus sorting
- device loss

### B. Spark

native Three가 large splat streaming/LOD에서 부족할 때 비교한다.

### C. PlayCanvas / SuperSplat

projection/culling/compaction/sort에서 측정 우위가 클 때만 specialist로 도입한다.

어느 경우에도 mesh의 line/material-ID/collision 의미를 splat이 자동 대체한다고 보지 않는다.

## 12. P2 — 대형 환경

구조화 mesh world에는 3D Tiles를 평가한다.

```text
captured photogrammetry -> Gaussian Splat
structured city/building -> 3D Tiles
editable hero props      -> normal Scene3D mesh
```

3D Tiles residency/traversal은 transient runtime이다. 저장 문서에는 stable environment reference만 남긴다.

## 13. P2 — 3D Virtual Studio

현재 Phaser Virtual Studio는 2D/2.5D 제품으로 유지한다.

진짜 3D 공간으로 전환하는 시점에는 Phaser에 3D engine을 중첩하지 않는다.

목표:

```text
Scene3D / Three  -> scene rendering
Rapier           -> collision / rigid physics
Recast / Detour  -> navmesh / pathfinding / crowd
Presence layer   -> multiplayer authority
```

2D Virtual Studio와 3D Virtual Studio는 같은 presence/product concepts를 공유할 수 있지만
renderer state를 공유하지 않는다.

## 14. P3 — 고품질 still / reference

path tracing은 interactive authority 후보가 아니다.

저장소에는 이미 renderer-neutral `studio-pathtrace-scene`, CPU progressive renderer,
BVH/BSDF/integrator와 WebGPU runtime/WGSL이 있다. 이를 버리고 외부 엔진부터 넣지 않는다.

```text
preview          -> raster
webtoon output   -> high-res deterministic raster + accumulation
reference still  -> internal Studio Path Tracer reference
                         ↓ same Scene3D corpus
                    external path tracer A/B
```

승격 순서:

1. 기존 Studio Path Tracer를 Scene3D immutable snapshot/output job에 연결
2. texture/UV, TLAS/instancing, emissive triangle, transmission/SSS 등 결손을 corpus로 명시
3. CPU reference와 WebGPU 결과 parity
4. cancellation/device-loss/resource lifecycle
5. 외부 `three-gpu-pathtracer`와 같은 scene/material/output 계약으로 A/B
6. visual·성능·bundle 우위가 있을 때만 external specialist를 선택적으로 채택

material/VRM/toon/alpha/semantic pass parity가 준비되지 않으면 research 상태를 유지한다.

## 15. 의존성 업그레이드 전략

업그레이드는 architecture PR과 분리한다. package.json만 바꾸고 lockfile을 손으로 맞추지 않는다.

검토 wave:

1. Three minor revision
2. three-mesh-bvh
3. Rapier deterministic
4. three-vrm
5. glTF Transform

각 wave마다:

- frozen lockfile install
- typecheck
- unit/integration
- Studio 3D visual corpus
- WebGPU/WebGL capture parity
- KTX2/Meshopt/VRM corpus
- 30분 soak
- bundle diff

를 통과한다.

## 16. 구현 단계

### Wave A — 이번 브랜치

- software capability / device capability 분리
- candidate evolution registry
- nonexistent Splat provider 자동 선택 제거
- unsupported advanced render feature의 readiness gate
- Scene3D/BG3D 기본 shadow/effect projection을 실제 구현 상태와 맞춤
- architecture tests

### Wave B — dependency + foundation

- Three upgrade branch
- BVH/Rapier/three-vrm/glTF Transform 검증 업그레이드
- TSL render target/MRT foundation
- GPU timestamp profiler
- resource owner/cache + texture residency
- Mikk tangent / animation derivative contract

### Wave C — pixel quality

- semantic ID/depth/normal exact pass
- CSM
- TAA
- line/tone GPU graph
- TAAU
- SSGI/SSS

### Wave D — asset + large scene

- release derivative pipeline
- render bundles
- GPU BVH batch
- cluster/hierarchical LOD
- GPU-driven culling/indirect draw A/B
- native splat A/B
- 3D Tiles experiment
- offscreen output worker

### Wave E — character

- generalized IK experiment
- GPU XPBD
- fitting/collision
- libigl/OpenSubdiv evaluation

### Wave F — product convergence

- BG3D/VRM/DCC unified workspace
- Linked 3D round-trip
- one camera/light/output authority
- optional 3D Virtual Studio runtime
- path-traced reference still experiment

## 17. 완료 정의

새 기술을 설치한 것으로 완료 처리하지 않는다.

완료는 다음 결과로 판단한다.

- 사용자 관점의 하나의 Scene3D workspace
- renderer를 몰라도 작업 가능
- same document -> reproducible camera/light/entity state
- output pass alignment
- no hidden fallback
- high-DPI 2K/4K output
- stable asset LOD/compression policy
- character contact golden corpus
- cloth/hair representative corpus
- scene churn 후 GPU memory baseline 복귀
- context/device loss 후 document authority 보존
- WebGPU/WebGL compatibility visual regression
- 30분 이상 interactive soak
- 모든 specialist의 explicit dispose/cancel/backpressure
