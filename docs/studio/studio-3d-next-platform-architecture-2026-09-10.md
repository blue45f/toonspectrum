# ToonStudio 3D Next Platform — 2026-09-10

## 1. Product target

ToonStudio 3D is rebuilt as one scene product, not four unrelated tools. The user flow is:

`장면 만들기 → 캐릭터 추가/제작 → 배경/소품 → 포즈·손·접촉 → 카메라·조명 → Webtoon render → 현재 컷에 Smart Layer로 삽입`

The user must not need to understand Character Shaper, VRM Poser, Mannequin, BG3D, Hybrid DCC, renderer backends, canonical manifests, or asset compatibility grades before making a panel.

The product authority is the new `StudioScene3dDocumentV1`. Character-specific authoring remains in `CharacterDocumentV2` and is referenced by a Scene3D character entity. Runtime engines never own persistent product state.

## 2. Competitive bar

### SHAPER strengths that become baseline

- visual part presets for face/eyes/iris/nose/mouth/ears/hair/body/clothes/shoes/accessories
- direct drawing on the 3D character
- reference-image AI preset recommendations
- photo/camera pose recognition
- transparent output
- layer-separated PSD

ToonStudio must match those interactions, then add non-destructive precision editing, authored mesh parts, automatic fitting/collision, explicit hand/prop contact, scene/background composition, semantic render passes, reusable shots and Smart Layer round-trip editing.

### VRoid strengths to absorb

- approachable slider and preset character creation
- direct texture painting
- brush/guide-driven hair creation
- clothing templates and reusable avatar ecosystem

### Clip Studio strengths to absorb

- artist-first posing and camera manipulation
- pose scan / hand scan
- 3D drawing reference and line/tone extraction
- manga production integration rather than isolated avatar creation

### Character Creator / MetaHuman class quality bar

- high-quality authored meshes and morph ranges
- automatic clothing/hair fitting
- robust skinning and corrective deformation
- LOD and material quality management
- DCC-grade source pipeline and validation

## 3. Engine decision

### 3.1 Primary runtime: Three WebGPU + TSL

Use Three's `WebGPURenderer` as the next-generation primary renderer. Keep WebGL2 fallback through the same product boundary. Do not fork the product into a WebGPU edition and a legacy edition.

Reasons:

- current runtime already owns Three/R3F/VRM/BVH scene state
- Three WebGPU supports WebGPU with WebGL2 fallback
- TSL gives one shader authoring layer targeting WGSL/GLSL
- RenderPipeline/MRT can capture beauty, normal, depth and semantic buffers efficiently
- current Three TSL includes WebGPU-era SSGI, SSS, DoF and temporal/upscaling nodes
- WebGPU compute can host cloth/hair XPBD, GPU fitting helpers, thumbnail baking and image kernels

WebGPU is not universally Baseline, so WebGL2 remains mandatory compatibility fallback.

References:
- https://threejs.org/manual/en/webgpurenderer
- https://threejs.org/docs/TSL.html
- https://threejs.org/docs/pages/TAAUNode.html
- https://threejs.org/docs/pages/CSMShadowNode.html

### 3.2 Babylon.js: specialist, not second product authority

The repository already ships Babylon. Keep it lazy and isolated for specialist CAD/BIM/import/runtime paths where its broader engine feature surface is beneficial. Do not let Babylon own scene persistence, character state, UI state or normal character/background rendering.

Reference: https://www.babylonjs.com/specifications/

### 3.3 PlayCanvas / SuperSplat: Gaussian Splat specialist

Use a specialist PlayCanvas boundary only for Gaussian Splat scenes/captured locations. This is valuable for high-fidelity reference backgrounds where editable mesh topology is not required.

- PlayCanvas supports WebGPU/WebGL and compute
- GPU-sorted Gaussian Splats are available on WebGPU
- SuperSplat editor/viewer/tooling is open source and useful as implementation reference

Do not replace the primary Three scene with PlayCanvas. A splat is a Scene3D entity rendered through a specialist adapter.

References:
- https://developer.playcanvas.com/user-manual/graphics/
- https://developer.playcanvas.com/user-manual/gaussian-splatting/rendering-architecture/renderers/
- https://developer.playcanvas.com/user-manual/supersplat/

### 3.4 Do not adopt Godot Web as the embedded editor engine

Godot 4 web export remains WebGL2 compatibility rendering and does not provide the WebGPU path required by this product architecture. Its WASM application/runtime ownership would also duplicate React/Studio state.

Reference: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html

### 3.5 Filament: reference PBR model, not embedded product engine

Filament is an excellent PBR/material/lighting reference and WebGL2 renderer, but embedding another complete scene renderer would duplicate the Three authority without solving ToonStudio's character/scene integration problem.

Reference: https://google.github.io/filament/main/filament.html

## 4. Geometry and asset kernels

### 4.1 three-mesh-bvh — ship

Keep and expand for raycast, brush picking, contact candidates, collision queries, triangle/barycentric Surface Ink anchors and scene culling helpers.

### 4.2 Rapier deterministic — ship

Keep for rigid-body/collider authority. Do not try to turn rigid-body physics into production cloth/hair.

### 4.3 WebGPU XPBD — build

Implement an application-owned XPBD solver for secondary hair and cloth:

- distance constraints
- bending constraints
- attachment constraints
- body/self collision constraints
- deterministic fixed timestep
- quality tiers controlling iterations/substeps
- WebGPU compute path
- bounded CPU fallback for low-complexity cases

Collision geometry comes from BVH/Rapier-compatible collider proxies. Persistent documents store authored physics parameters, never GPU buffers.

### 4.4 Manifold — ship

Keep for robust boolean/manifold operations where a browser-safe deterministic mesh result is required.

### 4.5 xatlas — ship

Keep for UV unwrap/atlas derivative generation. Run in Worker, never pointer hot paths.

### 4.6 OpenSubdiv — laboratory → gated production

Pixar OpenSubdiv is the preferred high-quality subdivision kernel. A WASM integration is worth evaluating for face/body/garment authoring and export previews, but it must stay lazy and Worker-owned until memory, topology and browser soak tests pass.

Primary upstream: https://github.com/PixarAnimationStudios/OpenSubdiv

### 4.7 libigl — laboratory → specialist deformation kernel

Evaluate WASM bindings for ARAP/biharmonic deformation and handle-based shape editing. This is a precision modeling kernel, not a render engine. Use it to replace naive scale-based deformations in advanced face/body/hair/garment editing where appropriate.

Reference: https://libigl.github.io/tutorial/

### 4.8 OpenCascade / rhino3dm / web-ifc — specialist only

The repository already has CAD/NURBS/BIM kernels. Keep them in Hybrid DCC adapters. Scene3D receives verified derivatives, not engine-native runtime objects.

## 5. Delivery pipeline

### 5.1 meshoptimizer/gltfpack — promote to direct production toolchain

Use meshoptimizer for:

- vertex cache optimization
- vertex fetch optimization
- attribute-aware simplification
- seam/border protected LOD generation
- EXT/KHR meshopt compression

Use gltfpack in release tooling, not interactive pointer paths.

Reference: https://github.com/zeux/meshoptimizer

### 5.2 KTX2/Basis Universal — production texture standard

Production 3D textures should have KTX2 derivatives. Prefer UASTC for hero character/skin/hair/material assets and ETC1S where size matters more than artifact-free gradients. Preserve source originals in authoring storage; runtime consumes device-appropriate compressed derivatives.

References:
- https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets
- https://threejs.org/docs/pages/KTX2Loader.html

### 5.3 glTF Transform — ship

Use for deterministic inspect/transform/release receipts, but never mutate the canonical edit authority silently.

## 6. Render architecture

`SceneGraph → Visibility/LOD → Skin/Morph/XPBD → Material/Toon → Shadow → MRT G-buffer → Semantic passes → Post → Output`

### Preview renderer

- WebGPU/TSL when supported
- WebGL2 fallback
- dynamic resolution
- TAAU on supported WebGPU devices
- CSM for large scenes
- SSGI/SSS only by quality tier
- contact shadows for readable feet/props
- semantic toon lines

### Webtoon render profile

- stable value ramp instead of unstable photoreal shading
- face-shadow correction masks
- authored semantic lines first
- silhouette/inverted-hull or screen-space edge fallback
- hair highlight controls
- skin SSS kept intentionally subtle
- ground/contact shadows readable in grayscale

### Output renderer

Do not screenshot the live canvas. Create an explicit render target at requested output dimensions and pixel ratio, render from the same Scene3D camera, preserve sRGB/alpha contracts, and produce semantic passes from the same frame state.

This addresses the current '3D background looks soft after canvas insertion' class of bugs. Live viewport DPR and output resolution must be unrelated.

### High-quality still path

For now use deterministic high-resolution raster + SSAA/TAA accumulation. Do not promote an unstable path tracer to product authority. `three-gpu-pathtracer` is transitioning from WebGL toward WebGPU in 2026; reevaluate after a stable WebGPU release and ToonStudio's visual corpus passes.

Reference: https://github.com/gkjohnson/three-gpu-pathtracer

## 7. Unified product data model

`StudioScene3dDocumentV1`

- coordinate system: meter / right-handed / Y-up / -Z forward
- AssetGraph
  - character
  - mesh
  - environment
  - gaussian-splat
- EntityGraph
  - CharacterEntity → CharacterDocumentV2 id/revision
  - ModelEntity
  - GaussianSplatEntity
- CameraGraph
- LightGraph
- Environment
- Render settings
- Output settings
- Shots

The scene document owns placement, camera, lighting and output. CharacterDocument owns identity, parts, morphs, expression, pose, hand state and surface drawing. Runtime engines own no canonical data.

## 8. Asset quality admission

A production asset is not admitted because a file exists or metadata says 'high quality'. `evaluateStudioScene3dAssetAdmission` requires actual evidence.

Hard blockers include:

- quality acceptance below 95
- missing commercial/redistribution/derivative rights
- fewer than six actual golden rendered views
- any severe hair/body/clothing/prop intersection
- silhouette score below 95
- material score below 92
- deformation score below 92
- thumbnail below 512px
- fewer than three LODs for character/mesh assets

Warnings requiring review include missing KTX2, missing geometry compression, oversized textures and excessive draw calls.

Low-quality assets are hidden from the production catalog. They may remain in quarantine/source storage for re-authoring but are not shown to users.

## 9. Character quality architecture

### Face/body

`base topology → identity morph → semantic part morph → corrective morph → expression → pose`

Do not mix identity and expression morphs. Use authored safe ranges and symmetry/lock tools.

### Hair

`guide curves → authored clumps/cards/mesh → scalp fit cage → collision relief → LOD → XPBD secondary motion`

No primitive hair in the production catalog.

### Garment

`canonical garment → body fit cage → skin transfer → body-region hide mask → corrective morph → pose deformation → collision correction → optional XPBD`

No destructive body polygon deletion.

### Hand + prop

`prop grip profile → palm target → wrist IK → finger target curves → per-finger contact solve → collision correction`

A grip preset that only rotates finger bones is insufficient. Every production prop that can be held needs authored grip anchors and contact envelopes. Two-handed props need independent primary/secondary anchors.

## 10. UX architecture

One visible product: **3D 장면 만들기**.

Left rail:
- 장면
- 캐릭터
- 배경
- 소품

Center:
- one Scene3D viewport

Right inspector:
- only selected entity properties

Bottom mode shelf:
- 포즈
- 손/접촉
- 카메라
- 조명
- 렌더/출력

Quick-start cards may open the same editor with intent presets:
- 캐릭터 만들기
- 포즈 잡기
- 배경과 캐릭터 합성
- 웹툰 컷 만들기

The cards must not launch four unrelated persistent states.

## 11. Template switching contract

Template apply is an atomic SceneDocument transaction:

1. cancel preview/loading operations
2. resolve and quality-check all referenced assets
3. build a complete next SceneDocument off-screen
4. preload minimum visible LODs/textures
5. commit one scene revision
6. swap runtime projection
7. release old GPU resources after the new frame is presented

Failure leaves the previous scene untouched and shows a reason. This eliminates the 'select another template and nothing happens' class of bugs.

## 12. GPU lifecycle

- one primary renderer per Scene3D session
- specialist renderer only when an entity requires it
- content-addressed AssetCache with ref counts and GPU byte accounting
- explicit dispose for geometry/material/texture/render targets
- abortable loaders and preview tasks
- no synchronous pixel read in pointer hot paths
- no per-modal renderer creation
- no texture clone per preset unless mutation requires ownership
- thumbnail rendering is scheduled/backpressured
- output/PSD encoding moves off the interaction thread where possible

Soak gates:

- repeated open/close with no persistent GPU growth
- repeated template switch with stable GPU memory
- 30+ minute editing soak
- 5-hour long soak on CI/nightly tier

## 13. Promotion order

1. Scene3D document/runtime policy
2. output-quality and asset-admission gates
3. current BG3D + Character projection adapters
4. one shared viewport and camera/light authority
5. atomic template switching
6. high-DPI Smart Layer canvas output
7. production asset quarantine/rebuild
8. hand/prop contact solver
9. authored hair/garment fit
10. WebGPU/TSL render graph
11. KTX2 + meshopt release derivatives
12. GPU XPBD hair/cloth
13. Gaussian Splat specialist backgrounds
14. OpenSubdiv/libigl advanced modeling promotion after soak and visual gates

## 14. Completion definition

Do not claim completion until:

- user can complete a 3D panel from one entry point without knowing the old four tools
- character and background share camera/light/ground/shadow
- every template switch visibly commits or visibly fails
- canvas insertion matches explicit output resolution and remains sharp at 2K/4K
- production catalog contains no visually rejected asset
- hand/prop golden poses show stable palm/finger contact
- hair/clothes show no severe penetration in representative body/pose corpus
- direct 3D ink follows deformation
- transparent PNG and semantic PSD/pass output match the same frame
- scene can reopen and reproduce entity transforms/camera/light/render state
- GPU memory returns to baseline after repeated scene/asset churn
- WebGPU and WebGL2 compatibility paths both pass browser visual regression
