# ToonStudio 최종 공유본 V5

## 초확장 멀티엔진·경쟁제품 기능·CSP 전환·Google Ink·자연매체·필터·3D·모션캡처·최대 포맷·웹 UI/UX·성능·품질 통합 아키텍처

- 기준일: **2026-08-07**
- 대상: `https://www.toonstudio.cloud/studio`
- 문서 성격: 이번 프로젝트에서 공유할 **최종 권위본(authoritative master)**
- 원칙: 기능 후보는 넓게 조사하되, 실제 런타임은 좁고 예측 가능하게 구성
- 주의: 외부에서 접근 가능한 사이트는 클라이언트 렌더링 중심이므로 현재 내부 렌더러·메모리·문서 구조를 완전히 감사할 수 없다. 구현 착수 전 R0 계측이 필수다.

> 이 문서의 V5 본문이 이전 버전과 충돌하면 V5를 우선한다. 이전 V4.4 전체 원문과 제품·엔진·포맷·CSP UX 레지스트리는 부록에 보존해 조사 추적성을 유지한다.

# 0. 한 페이지 최종 결론

ToonStudio의 최종 목표는 “브라우저에서 돌아가는 Clip Studio 복제품”이 아니라, **드로잉·웹툰·디자인·스토리보드·3D·모션·검수·출판이 하나의 의미 그래프를 공유하는 창작 운영체제**다. 그러나 성공 조건은 기능 수가 아니라 다음 네 가지다.

- 펜을 댄 순간의 지연·안정성·질감이 전문 데스크톱 도구와 경쟁할 것.
- CSP 사용자가 도구·레이어·브러시·단축키·Workspace를 낯설지 않게 이전할 것.
- 브라우저·기기 차이는 폴백으로 흡수하고, 파일 포맷은 가능한 최대 범위로 상호운용할 것.
- 다수 엔진을 쓰되 한 프레임의 GPU 소유권과 데이터 복사를 통제할 것.

### 최종 런타임 원칙

```text
Wide research portfolio, narrow active runtime

문서·기기·작업을 분석
→ WebGPU Studio / CanvasKit Production / WebGL Compatibility / CPU Deterministic 중 하나를 주 프로필로 선택
→ 기능별 큰 Render Island만 보조 엔진에 위임
→ GPUTexture 공유가 안 되면 결과를 캐시
→ 객체 하나마다 엔진을 바꾸지 않음
```


### 핵심 엔진 확정

| 영역 | 주력 | 보조/폴백 |
| --- | --- | --- |
| 전문 잉킹 | Google Ink C++→WASM + 공식 WGSL | Perfect Freehand·Vello·CanvasKit |
| 대량 동적 벡터 | Vello | CanvasKit·Vello CPU·tiny-skia |
| 조판·Skia 효과·기준 출력 | CanvasKit | HarfBuzz/Parley·CPU renderers |
| 래스터·필터·자연매체 | Custom WebGPU | PixiJS WebGL2·CanvasKit·Photon/OpenCV |
| MyPaint 자연매체 | Hokusai/libmypaint | Custom dab/wet solver |
| 펜촉·브러시모·리본 물리 | Rust/WASM XPBD | spring/verlet simple mode |
| 3D·VRM | Three.js + three-vrm | Babylon.js·static proxy |
| 장면 물리 | Rapier; 고급 soft body는 Jolt | 자체 XPBD |
| 모션 캡처 | MediaPipe Pose/Hand/Face | TFJS·ONNX·ToonBridge |
| 협업 | Yjs 또는 Loro 중 프로젝트당 하나 | Automerge |
| 저장 | OPFS chunks + SQLite WASM metadata | IndexedDB/Dexie fallback |

### 가장 중요한 금지 규칙

- 외부 엔진 객체를 저장 원본으로 사용하지 않는다.
- 한 획을 Google Ink·Vello·CanvasKit에 동시에 중복 렌더하지 않는다.
- 모든 엔진을 첫 번들에 포함하지 않는다.
- 전체 캔버스를 하나의 거대 GPU texture로 유지하지 않는다.
- React 상태로 포인터 샘플·입자·브러시모를 갱신하지 않는다.
- 편집 프레임마다 CPU readback을 하지 않는다.
- 픽셀 전체를 CRDT에 넣지 않는다.
- 라이선스 없는 공개 코드를 복사하지 않는다.
- GPL 앱 코어를 permissive SaaS 모듈처럼 직접 결합하지 않는다.
- .clip/.cmc의 완전 왕복을 검증 전 마케팅하지 않는다.
- 음성·AI가 직접 문서를 임의 수정하게 하지 않는다.
- 브라우저 이름만으로 기능을 고정하지 않고 capability와 benchmark를 사용한다.
# 1. 조사 범위·증거 수준·정직한 한계

기존 레지스트리에는 **266개 제품·서비스**, **139개 엔진·라이브러리·공개 코드**, 별도 브러시 레지스트리 **99개**, 포맷 레지스트리 **313개**, CSP UX 동선 **63개**가 수록되어 있다. V5에는 여기에 신규 제품 81개와 신규 엔진·라이브러리 89개를 보강했다. 이름 중 일부는 제품군·표준·어댑터 단위이므로 단순 합계는 “독립 패키지 수”가 아니라 조사 항목 수다.


#### 증거 등급

| 등급 | 의미 | 사용 방법 |
| --- | --- | --- |
| A | 공식 매뉴얼·공식 저장소·표준에서 직접 확인 | 기능 요구사항과 구현 후보의 근거 |
| B | 공식 제품 기능 페이지에서 확인 | UX·제품 패턴 근거; 세부 동작 재감사 |
| C | 공개 데모·코드·논문 구현 | 알고리즘·PoC 근거; 품질·유지보수 검증 |
| D | 로그인/플랜/비공개 영역으로 완전 확인 불가 | 추론을 분리하고 구현 전에 직접 감사 |
| L | 라이선스가 없거나 불명확 | 코드 복사 금지; clean-room 재구현 |
| R | GPL/AGPL/상용·모델 조건 등 배포 제약 | 격리·브리지·법무 검토 |

#### 사실과 제품 목표의 구분

- “지원 가능”은 기술적으로 파이프라인을 설계할 수 있다는 뜻이며 곧바로 완성 품질을 보장하지 않는다.
- 성능 수치는 하드웨어 중립 약속이 아니라 기준 기기에서 측정할 제품 예산이다.
- 폐쇄 포맷은 원본 보존·부분 해석·표준 브리지로 접근하며 검증 전 완전 호환이라고 표시하지 않는다.
- 오픈소스라도 브러시 팩·폰트·모델·코덱 등 데이터 라이선스는 코드 라이선스와 별도로 관리한다.
# 2. 경쟁 제품·보조 서비스에서 가져올 기능

| 제품군 | 핵심 강점 | ToonStudio 구현 모듈 | UX 원칙 |
| --- | --- | --- | --- |
| Clip Studio Paint | 벡터 레이어, 브러시 Dynamics, 자·톤·말풍선·컷, 3D, 다중 페이지, Quick Access/Workspace | CSP Migration Workspace, VectorInk, ComicGraph, PageManager, AssetVault | 익숙한 정신 모델을 유지하면서 1–2–3 동선으로 단순화 |
| Photoshop | Smart Object/Filter, Adjustment, Mask, Blend, Action, PSD 생태계 | LinkedAsset, EffectGraph, AutomationRecipe, PSD Gateway | 비파괴 상태를 기본값으로 하고 호환 손실을 보고 |
| Figma/FigJam/Penpot | Component/Instance, Auto Layout, Variables, Prototype, 실시간 협업 | ComponentGraph, ConstraintLayoutGraph, VariableGraph, InteractionGraph | 문서 의미 객체와 협업을 드로잉에도 확장 |
| PowerPoint/Keynote/Slides | Master, Layout, Morph, Presenter, Chart, Record | PresentationSurface, MasterGraph, TransitionGraph, Presenter | 웹툰·스토리보드 자산을 발표물로 의미 보존 변환 |
| Canva/Adobe Express/Polotno | 템플릿, Brand Kit, Resize, 데이터 자동화 | TemplateGraph, BrandToken, MultiFormatLayout | 초보 사용자는 템플릿, 전문가는 원본 객체 편집 |
| Krita | 다수 브러시 엔진, Assistant, Wrap-around, 애니메이션 | BrushBackend Router, DrawingAssistant, Seamless Mode | 엔진별 강점을 단일 BrushProgramIR로 통일 |
| Procreate/Fresco | Brush Studio, 제스처, QuickShape, 타임랩스, 자연매체 | Brush DNA, GestureGraph, ShapeAssist, CommandJournal | 태블릿에서 패널보다 캔버스 HUD 우선 |
| Painter/Rebelle/ArtRage | 젖은 매체, 안료, 종이, 임파스토 | WetMediaGraph, PigmentModel, PaperMaterial, HeightTile | 실시간 preview와 고품질 final solver 분리 |
| GIMP/Inkscape/Affinity | 비파괴 필터, Live Path Effect, 정밀 벡터·출판 | EffectGraph, VectorAppearance, PublicationGraph | 오픈 포맷과 결정적 CPU 출력 강화 |
| Photopea/Pixlr/Kleki | 설치 없는 즉시 시작, 브라우저 파일 편집 | GuestProject, FormatGateway, SafeMode | 첫 획까지 마찰 최소, 저장 상태를 숨기지 않음 |
| Magma/Drawpile/Draw.Chat | 공동 작화, 권한, 세션, paint-over, 통신 | SessionGraph, LayerOwnership, ReviewInk, Presence | 래스터를 CRDT로 만들지 않고 타일·명령으로 동기화 |
| PureRef/Eagle/Milanote | 레퍼런스 수집·분류·오버레이 | ReferenceDesk, Provenance, Color/Composition Extract | 작화 캔버스와 레퍼런스 보드를 연결하되 분리 |
| Storyboard Pro/Boords/Storyboarder | 스크립트·샷·프레임·애니매틱 | StoryGraph, ShotGraph, PanelGraph, AnimaticTimeline | 대사·샷·컷·오디오가 같은 ID를 공유 |
| Frame.io/SyncSketch | 프레임 댓글, 버전 비교, 승인, tracing paper | ReviewTheater, SemanticDiff, ApprovalGraph | 검수 주석을 다음 버전으로 좌표 변환 |
| Blender/Maya/C4D/Houdini | 3D 장면, 카메라, 리깅, 노드, 물리 | Scene3DIR, CameraGraph, RigGraph, ProceduralGraph | 3D는 참조가 아니라 2D 선화·깊이·ID를 공급 |
| Rokoko/Move.ai/MediaPipe 계열 | 몸·손·얼굴 추적, 리타게팅, 녹화 | MotionCaptureIR, RetargetGraph, TrackingWorker | 기기별 FPS·모델을 자동 조정하고 curve로 bake |
| Graphite/ComfyUI/Node-RED | 레이어와 노드, 절차형 실행, 자동화 | ProceduralGraph, AutomationGraph | 일상 UX는 레이어, 고급 UX는 같은 데이터의 노드 보기 |

### 2.1 분석을 제품 복제로 끝내지 않는 방법

```text
경쟁 제품 메뉴
→ 사용자의 실제 목적(Job) 추출
→ 공통 의미 객체와 CommandID로 환원
→ 웹·펜·터치에 맞는 더 짧은 동선 설계
→ 엔진 후보와 폴백 배치
→ benchmark·golden corpus·완료 기준 연결
```


### 2.2 V5 신규 보강 제품군 요약

- **3D·스컬프팅·재질:** Autodesk Maya, Cinema 4D, Houdini, ZBrush, Nomad Sculpt, SculptGL, Adobe Substance 3D Painter, Adobe Substance 3D Designer, Material Maker, ArmorPaint, Shapr3D, Autodesk Fusion, Plasticity, SolveSpace, OpenSCAD

- **AI·자동화 창작:** ComfyUI, InvokeAI, Krita AI Diffusion, EbSynth

- **XR·공간 창작:** Open Brush, Gravity Sketch, ShapesXR

- **다이어그램·데이터:** Graphviz, D2, PlantUML

- **디자인·프로토타이핑:** Penpot, Sketch, Framer, Webflow, Wix Studio, ProtoPie, Axure RP, Origami Studio, Uizard

- **모션캡처·카메라:** Rokoko Studio, Move.ai, DeepMotion Animate 3D, Plask, RADiCAL, VSeeFace, VTube Studio, Warudo, Blender Camera Tracking, Mocha Pro, SynthEyes, PFTrack

- **영상·합성:** Kdenlive, Shotcut, Nuke, Cavalry

- **전문 드로잉·회화:** TVPaint Animation, Moho, Toon Boom Harmony, Callipeg, RoughAnimator, FlipaClip, Animation Desk, LibreSprite, Resprite, Affinity Photo, Affinity Publisher, Darktable, RawTherapee, Capture One, Adobe Lightroom

- **프레젠테이션·문서:** Pitch, Gamma, Prezi, Beautiful.ai, Genially, Visme, Zoho Show, LibreOffice Impress

- **화이트보드·필기:** Microsoft Whiteboard, Apple Freeform, Goodnotes, Notability, Nebo, OneNote, Samsung Notes, Squid

# 3. 최종 제품 정보 구조와 작업면

```text
CreatorProjectGraph
├─ DocumentGraph
├─ SurfaceGraph
│  ├─ InfiniteCanvas / Artboard / Page / WebtoonStrip
│  ├─ StoryboardFrame / AnimationScene / PresentationSlide
│  ├─ ReferenceBoard / ReviewCanvas
│  └─ Scene3D / CADWorkbench
├─ LayerGraph / ComponentGraph / ConstraintLayoutGraph
├─ BrushProgramGraph / EffectGraph / InteractionGraph
├─ StoryGraph / ShotGraph / TimelineGraph / MotionCaptureGraph
├─ AssetGraph / RightsGraph / VersionGraph / ReviewGraph
└─ ExportGraph / FormatInteropGraph
```


외부 라이브러리의 `SkPath`, `vello::Scene`, `PIXI.Container`, `THREE.Object3D`는 저장 원본이 아니다. 모두 `CreatorProjectGraph`에서 다시 만들 수 있는 런타임 캐시여야 한다.


### 3.1 공통 IR

| IR | 보존 내용 | 주 사용처 |
| --- | --- | --- |
| StrokeIR | 원시/보정 샘플, brush version, seed, centerline, mesh/tile cache | 벡터·필기·브러시 재편집 |
| BrushProgramIR | tip, dynamics, texture, mixing, physics, output channels | SUT/ABR/MYB 및 Brush DNA |
| ShapeIR | path, fill, stroke, appearance, constraints | Vello/CanvasKit/SVG |
| TextIR | 문자, span, paragraph, language, font fallback, vertical/ruby | CJK 조판·말풍선·출고 |
| EffectGraphIR | typed nodes, color space, bounds, temporal dependency | 비파괴 필터 |
| LayerGraphIR | layer type, mask, blend, clipping, semantic role | 편집·PSD/ORA |
| Scene3DIR | node, mesh, material, camera, light, physics refs | 3D/VRM |
| MotionCaptureIR | timestamped landmarks, confidence, calibration, curves | 몸·손·얼굴·카메라 |
| InteractionIR | event, state, variable, action | 프로토타입·발표·웹 콘텐츠 |
| FormatInteropIR | foreign IDs, opaque payload, fidelity status | 왕복·호환 보고 |
# 4. 런타임 프로필과 멀티엔진 라우팅

| 프로필 | GPU/2D 소유자 | 활성 조합 | 대상 | 목표 |
| --- | --- | --- | --- | --- |
| WebGPU Studio | Custom WebGPU가 GPU 소유자 | Google Ink WGSL, Vello islands, WebGPU tile/effects, Three.js WebGPU 선택 | 고성능 Chromium/지원 기기 | 최고 품질 드로잉·자연매체 |
| CanvasKit Production | CanvasKit WebGL/Software가 2D 기준 | CanvasKit Path/Text/Filter + 제한적 compute island | Safari/Firefox 포함 폭넓은 생산 경로 | 안정·출력·조판 |
| WebGL Compatibility | PixiJS/CanvasKit WebGL가 GPU 소유자 | Perfect Freehand, Pixi tile, GLSL effects | WebGPU 미지원/불안정 | 핵심 기능 유지 |
| CPU Deterministic | Vello CPU/tiny-skia/CanvasKit Software | CPU raster, export, thumbnail | 검수·서버·장애 복구 | 결정적 출력 |
| Battery/Mobile | Pixi/WebGL 또는 저비용 WebGPU | 낮은 LOD, 제한된 wet tiles, 30fps | 모바일·저전력 | 기능 유지·미리보기 단순화 |

### 4.1 Render Island Compiler

```text
Visible Project Slice
→ dependency/culling
→ vector/raster/text/3D/effect islands
→ capability + latency + memory + fidelity cost
→ backend assignment
→ pass fusion and cache plan
→ HybridFrameGraph
→ presentation/export surface
```


### 4.2 엔진별 확정 역할

| 엔진 | 역할 | 등급 | 위험 | 폴백 |
| --- | --- | --- | --- | --- |
| Google Ink C++→WASM + WGSL | 전문 메시 잉킹, BrushBehavior, multi-coat | 조건부 주력 | 공식 JS SDK 없음; PoC·ABI·mesh delta 필요 | Perfect Freehand+Vello/CanvasKit |
| Vello Classic/Hybrid/CPU | 대량 동적 벡터·선화·오버레이 | 주력 벡터/실험 격리 | 알파; 필터·메모리·글리프 캐시 위험 | CanvasKit/tiny-skia |
| CanvasKit/Skia | Path/Paragraph/SkSL/ImageFilter/Skottie/출력 | 안정 생산 코어 | WASM 크기·객체 수명·컨텍스트 관리 | Vello CPU/tiny-skia |
| Custom WebGPU | 희소 타일, dab, smudge, wet media, particle, effect | 핵심 직접 개발 | 브라우저 차이·셰이더 QA | WebGL2/CanvasKit/CPU |
| PixiJS | 래스터 타일·스프라이트·WebGL2·레퍼런스 | 호환/보조 | WebGPU는 브라우저 편차 | CanvasKit/Canvas2D 제한 |
| ThorVG | SVG/Lottie·경량 애니메이션 | 선택 주력 | 기능 호환성 corpus 필요 | CanvasKit/lottie-web |
| Hokusai/libmypaint | MyPaint 자연매체·smudge·preset | 자연매체 후보 | 성숙도·WASM 경계·프리셋 차이 | 자체 WebGPU dab |
| Rust/WASM XPBD | nib/bristle/ribbon/hair/rope | 직접 개발 | solver 안정성·결정성 | spring/verlet 단순 모드 |
| OpenCV.js | 선택·형태학·추적·카메라 solve | 분석 백엔드 | WASM 크기·worker 필요 | WGSL/간단 JS |
| Three.js/three-vrm | 3D·VRM·보조 렌더 패스 | 주력 3D | 2D 엔진과 GPU state 분리 | Babylon.js/정적 프리뷰 |
| Rapier/Jolt | 강체·관절 / 선택형 soft body | 장면 물리 | 브러시모에는 과함 | 자체 XPBD |
| MediaPipe/TFJS/ONNX | 포즈·손·얼굴·사용자 모델 | 모션 캡처 | 모델·기기별 속도 차이 | 낮은 FPS/서버·브리지 |

### 4.3 GPUInteropBroker 단계

1. 같은 `GPUDevice`와 `GPUTextureView`를 공유한다.
2. 같은 장치 공유가 불가능하면 큰 offscreen island 결과를 `ExternalTexture` 또는 exportable texture로 전달한다.
3. 그마저 불가능하면 `ImageBitmap`/`VideoFrame`을 Worker 간 전달한다.
4. 호환 경로에서는 `SharedArrayBuffer` 타일을 사용한다.
5. CPU readback은 내보내기·진단·폴백 이외에는 금지한다.
# 5. Google Ink·스타일러스·손가락 입력 최종 설계

Google Ink는 mesh-based vector stroke를 생성하는 C++ 코어이며 공식 저장소도 인터페이스 안정성을 강하게 보장하지 않는다. 따라서 “npm 설치형 웹 SDK”로 취급하지 않고, 고정 commit·얇은 C ABI·Emscripten·변경 mesh range·공개 WGSL을 갖춘 조건부 생산 백엔드로 둔다. [S001]


### 5.1 입력 파이프라인

```text
DOM Pointer Events (Main Thread)
→ fixed-size sample copy; React state 금지
→ SAB ring / transferable batch
→ Input Worker: normalization, device calibration, palm/finger classification
→ Ink Worker: Google Ink model or fallback stabilizer, StrokeIR, incremental mesh
→ Render Worker: Google Ink WGSL / Vello / WebGPU preview
→ Finalizer: actual-only samples, physics/wet injection, cache
→ Storage Worker: command journal, raw input, preset version, seed
```


### 5.2 스타일러스 값

- pressure·tangentialPressure
- tiltX/tiltY 또는 altitude/azimuth
- twist
- width/height contact
- velocity·acceleration·curvature
- coalesced/predicted samples
- hover·barrel·eraser end(가능 장치)
- 장치별 dead-zone·gamma·LUT

### 5.3 입력 프로필

| 프로필 | 펜 | 손가락 | 권장 용도 |
| --- | --- | --- | --- |
| PenDrawTouchNavigate | 그리기 | 팬·줌·회전 | 기본 전문가 모드 |
| FingerDraw | 펜/손가락 그리기 | 한 손가락 그리기, 두 손가락 내비게이션 | 모바일 스케치 |
| Handwriting | 필기 원본+인식 후보 | 필기 가능 | 노트·대사·서명 |
| MultiTouchPaint | 각 pointer 독립 획 | 다중 손가락 브러시 | 교육·실험 |
| Accessibility | 강한 tremor filter | 큰 타깃·dwell | 접근성 |

### 5.4 손가락 압력과 팜리젝션

- 실제 pressure가 없으면 constant/velocity/contact-area/dwell/learned-local profile 중 하나를 사용하고 `syntheticPressure`를 기록한다.
- 웹에는 보편적인 palm flag가 없으므로 stylus proximity, 시작 시간, 거리, 접촉 크기, handedness zone, pointercancel을 결합한다.
- 팜 의심 획은 문서에 확정하지 않고 preview transaction에 두며 취소 시 mesh·tile·undo를 모두 폐기한다.
- OS compositor Ink API는 가능한 단색 preview에만 사용하고 최종 복합 브러시는 Google Ink/WebGPU가 렌더한다.
# 6. 브러시 시스템: 품질별 최적 엔진 조합

모든 브러시는 `Input → Stabilizer → Dynamics → Geometry/Emission → Material/Mixing → Physics/Simulation → OutputIR → Composite`의 동일 그래프를 사용한다. 프리셋은 엔진 이름이 아니라 의미 파라미터를 저장한다.

| 브러시 | 주력 파이프라인 | 보조 | 폴백 | 품질 검사 |
| --- | --- | --- | --- | --- |
| G펜 | Google Ink Stroke Modeler + BrushBehavior + WGSL | Vello 선택 proxy | Perfect Freehand + CanvasKit | 압력 sweep·끝점·교차·고속 곡선 |
| 매핑펜 | 낮은 latency 모델 + Google Ink 좁은 mesh | Vello | Perfect Freehand | 1px 근처 안정성·확대 축소 |
| 기술 펜 | Rust One-Euro + Lyon/Kurbo + Vello | CanvasKit Path | Canvas2D | 정확한 코너·직선·스냅 |
| 만년필 | Google Ink multi-coat + 방향 nib | CanvasKit blend | Vello outline | 회전·속도·잉크 고임 |
| 캘리그래피 | tilt/twist + nib polygon + Google Ink/Vello | CanvasKit PathEffect | Perfect Freehand | 각도 sweep·글리프 연결 |
| 마커 | WebGPU flow accumulation + self-overlap policy | CanvasKit blend | Pixi WebGL | 겹침·가장자리·색 누적 |
| 형광펜 | Google Ink/CanvasKit translucent isolated layer | Vello | Pixi | 자기 중첩 정책·텍스트 위 표시 |
| 연필 | WebGPU dab + paper height + FastNoiseLite | Hokusai | CanvasKit shader | 저속 입자·기울기 면·지우개 |
| 색연필 | Hokusai + spectral mix + paper texture | WebGPU dab | CanvasKit | 겹칠수록 채도·종이 결 |
| 목탄 | multi-tip WebGPU + paper mask | Hokusai | Pixi | 가루·번짐·넓은 면 |
| 파스텔 | Hokusai pigment + dry deposit | WebGPU | CanvasKit | 혼색·가루·압력 |
| 에어브러시 | WebGPU stochastic/Poisson emission | Pixi particle | CanvasKit blur | banding·큰 반경·낮은 opacity |
| 스프레이 | GPU particle + texture atlas | Pixi particle | CPU scatter | 분포·seed 결정성 |
| 수채 | Hokusai injection + active-tile fluid + spectral | Vello final composite | static dab approximation | wet-on-wet·backrun·drying |
| 수묵 | clean-room InkWash-style solver + paper absorption | XPBD bristle injection | Hokusai static | 농담·edge darkening·번짐 |
| 유화 | Hokusai pickup/deposit + viscosity/height | XPBD bristle | static impasto shader | 색 운반·홈·조명 |
| 아크릴/과슈 | opaque pigment + limited wet mix | WebGPU | Hokusai | 불투명도·edge·건조 |
| 드라이브러시 | XPBD contact + paper height + sparse dab | Hokusai | multi-tip raster | 갈라짐·부분 접촉 |
| 팔레트 나이프 | mesh contact + height displacement | WebGPU | CanvasKit shader | 임파스토 ridge·color scrape |
| 스머지/믹서 | WebGPU gather/transport + Hokusai smudge | CanvasKit approximation | CPU small radius | 색 운반·마스크 경계 |
| 픽셀 | integer grid + indexed palette + WebGPU/WebGL | Aseprite-style tools | Canvas2D | 정수 좌표·tilemap·onion skin |
| 디더 | ordered/error diffusion preview + palette | WebGPU | CPU deterministic | 패턴 안정성·export 동일성 |
| 패턴 브러시 | arc-length sampler + Vello/Image atlas | CanvasKit PathEffect | Pixi stamp | 회전·간격·seam |
| 장식/식생 | procedural generator + Vello/WebGPU stamps | ThorVG assets | Pixi | seed·곡률·겹침 |
| 머리카락/털 | XPBD strands + Vello vector bake/WebGPU tips | Three.js wind field | static stamp | 처짐·충돌·LOD |
| 리본/로프/체인 | XPBD spline + Vello fill | Rapier scene interaction | Bezier static | 길이·탄성·교차 |
| 파티클 효과 | WebGPU emitter + SDF collision | Three.js depth/ID | Pixi particle | 10k+ 입자·seed·bake |
| 클론 | tile sampler + transform | CanvasKit image | CPU | source alignment·seam |
| 힐링 | OpenCV patch/gradient + WebGPU composite | AI optional | CPU inpaint | texture·edge·mask |
| 블러/샤픈 브러시 | dirty-tile compute kernel | CanvasKit filter | Photon | 반경·누적·경계 |
| Liquify 브러시 | WebGPU vector field + mesh warp | CanvasKit displacement | CPU low-res | undo·large radius·quality |
| 벡터 지우개 | path intersection/trim + StrokeIR edit | Vello proxy | raster erase | 교차점까지·부분 erase |
| 자연매체 지우개 | pigment/water removal policy | Hokusai | alpha erase | 젖은/마른 차이 |
| 3D 표면 페인트 | Three raycast + UV/triplanar tile paint | WebGPU | texture projection | seam·mip·ID mask |
| 재질 브러시 | color+height+roughness+normal channels | WebGPU/Three | CanvasKit preview | 채널 동기화·export |
| 필기/서명 | Google Ink smooth model + raw input preservation | recognition adapter | Perfect Freehand | 획 순서·검색·원본 보존 |
| 손가락 크레용 | synthetic pressure + strong stabilizer + Hokusai | WebGPU dab | Canvas2D | 팜리젝션·접촉 면적 |
| 화면톤/집중선 | procedural geometry + Vello | CanvasKit | raster bake | 모아레·원근·편집성 |

### 6.1 BrushBackend 인터페이스

```ts
interface BrushBackend {
  supports(program: BrushProgramIR, caps: RuntimeCaps): SupportScore;
  beginStroke(ctx: StrokeContext): StrokeSession;
  update(session: StrokeSession, batch: PointerSampleBatch): BrushPreviewDelta;
  finalize(session: StrokeSession): Promise<BrushOutputIR>;
  replay?(stroke: StrokeIR, quality: QualityProfile): Promise<BrushOutputIR>;
}
```


### 6.2 자연매체 공통 필드

```text
color/pigment spectrum · water · wetness · velocity · pressure
viscosity · paint height · dry deposit · paper height/fiber/absorption
bristle contact · reservoir · pickup/deposit · drying clock
```

전체 캔버스를 시뮬레이션하지 않고 **활성 wet tile만 계산**하며 안정화되면 편집 가능한 원본 파라미터와 함께 결과를 bake한다.

# 7. 레이어·합성·색상 관리

- Raster, Vector, Text, Balloon, Frame, Tone, Adjustment, Material, 3D-linked, Animation, Reference, Draft, Group, Mask 레이어.
- Clipping, alpha lock, pass-through, knockout, layer styles, blend-if 유사 범위 합성, linked instances.
- 작업 색공간과 표시 색공간을 분리하고 linear-light filter 여부를 노드마다 기록.
- Premultiplied alpha 규칙을 모든 엔진 어댑터에서 강제하며 교차 엔진 golden test를 둔다.
- ICC profile, soft proof, gamut warning, HDR/SDR preview, export conversion을 ColorPipeline에서 통제.

### 7.1 희소 타일 레이어

```text
SparseTileMap
└─ Tile {coord, version, dirtyBounds, mip, alphaSummary, gpuResidency, cpuCache, opfsHash}
```

레이어마다 전체 해상도 RenderTexture를 만드는 대신 변경된 타일만 유지한다. 큰 블러는 halo를 계산해 타일 종속성을 예약하고, 화면 밖·고해상도 mip는 필요할 때 생성한다.

# 8. 비파괴 EffectGraph와 필터 전체 배치

| 기능군 | 대표 기능 | 주력 | 폴백 | 핵심 검증 |
| --- | --- | --- | --- | --- |
| 기본 색상 | Exposure/Brightness/Contrast/Gamma | WGSL pass fusion 또는 CanvasKit SkSL | Photon/CPU | linear-light·premultiplied alpha |
| Levels/Curves | 채널·RGB·Luma curve | WGSL LUT/texture | CanvasKit/CPU | 16-bit reference corpus |
| HSL/HSV/Vibrance | 색상 범위 조정 | WGSL | Culori/Color.js CPU | gamut clipping |
| White Balance | temperature/tint/chromatic adaptation | WGSL + color science | LittleCMS/skcms | ICC·working space |
| Selective Color/Channel Mixer | 채널 행렬·범위 마스크 | WGSL | CanvasKit SkSL | CMYK 유사 동작 보고 |
| Gradient Map/Duotone | luma→gradient | Vello/CanvasKit/WGSL | CPU | gradient interpolation space |
| LUT | 1D/3D CUBE | WebGPU 3D texture | CPU LUT | domain·tetrahedral interpolation |
| Posterize/Threshold | quantize·binary | WGSL | Photon | dither option |
| Gaussian/Box Blur | separable/downsample pyramid | CanvasKit ImageFilter/WGSL | CPU | halo·tile bounds |
| Motion/Radial/Zoom Blur | directional sampling | WGSL | CanvasKit approximation | large radius LOD |
| Bilateral/Guided/Surface Blur | edge-preserving | WebGPU compute | OpenCV | quality profile |
| Median/Denoise | impulse/noise reduction | OpenCV/WGSL | CPU | tile overlap |
| Sharpen/Unsharp/High-pass | convolution | WGSL/CanvasKit | Photon | halo prevention |
| Morphology | dilate/erode/open/close | OpenCV/WGSL | CPU | alpha vs luma semantics |
| Edge/Contour | Sobel/Canny/Laplacian/contour | OpenCV | WGSL | line continuity |
| 사진→선화 | edge + tone clustering + cleanup | OpenCV + WebGPU | CPU | reference styles |
| 선폭 조절 | distance field/morphology/vector offset | OpenCV/Vello PathOps | CPU | junction preservation |
| 스크린톤/망점 | procedural halftone | WGSL + Vello mask | CPU export | moire-safe preview |
| 모아레 검사/감소 | frequency analysis + adaptive filter | WASM FFT + WGSL | server/export | false positive control |
| Noise/Grain/Paper | procedural noise/material | FastNoiseLite/WGSL | CanvasKit | seed determinism |
| Bloom/Glow/Vignette | multi-pass | CanvasKit/WGSL | CPU | HDR/SDR |
| Chromatic Aberration/Glitch | channel displacement | WGSL | CanvasKit | export parity |
| Emboss/Relief/Normal | height derivatives | WGSL | CPU | lighting convention |
| Liquify/Mesh Warp | vector field/mesh | WebGPU | CanvasKit/CPU proxy | non-destructive node |
| Perspective/Lens/Fisheye | homography/lens model | OpenCV + WGSL | CanvasKit | camera metadata |
| Displacement/Turbulence | map/sample/noise | WGSL | CanvasKit RuntimeEffect | bounds expansion |
| Depth-aware Blur/Color | 3D depth/normal/ID | Three pass + WebGPU | raster depth map | occlusion edge |
| Relight | normal/depth/segmentation | WebGPU | AI optional | confidence mask |
| Smart Selection | color/edge/SAM optional | OpenCV + model | manual lasso | model license |
| Smart Fill | GPU flood + gap close + references | WGSL/OpenCV | CPU | anti-alias boundary |
| Inpainting | OpenCV classical + optional model | Worker/ONNX | manual clone | scope confirmation |
| Vector Appearance | dash, taper, pattern, rough, outline | Vello/CanvasKit PathEffect | raster bake | editable source |
| Text Effects | outline, shadow, warp, variable axes | CanvasKit Paragraph/Path | Vello proxy | CJK glyph correctness |
| Video Temporal | stabilize, denoise, optical flow, style propagation | WebCodecs+OpenCV/WebGPU | local bridge | frame consistency |

### 8.1 EffectGraph Compiler

```text
EffectGraphIR
→ type/schema validation
→ color-space propagation
→ bounds/halo analysis
→ static/temporal classification
→ constant folding
→ pass fusion
→ tile schedule
→ backend route (WGSL/SkSL/Vello/OpenCV/WASM/3D)
→ preview/export variants
```


연속된 색상 행렬·opacity·간단 blend는 하나의 shader pass로 합친다. 복합 필터를 Vello의 미완성 기능에 억지로 넣지 않고, Custom WebGPU나 CanvasKit island로 계산한 뒤 Vello 장면에 텍스처로 재주입한다.

# 9. 선택·채우기·변형·벡터 편집

- 사각/타원/자유/다각 올가미, magic wand, color/luminance/alpha range, layer/object/semantic selection.
- Grow/Shrink/Feather/Smooth/Border, Quick Mask, 저장 선택, 벡터·래스터 혼합 선택.
- GPU flood fill, gap close, reference layer/folder, visible composite reference, underfill, enclosed fill, remaining gap detection.
- Scale/rotate/skew/perspective, mesh warp, puppet warp, liquify, repeat transform, snap/constraint.
- Anchor/handle, width point, simplify/smooth, path boolean, offset, trim/intersection erase, pattern along path, live appearance.
- 퍼스자·대칭자·평행선자·곡선자·3D perspective guide를 DrawingAssistantGraph로 통합.
# 10. 텍스트·말풍선·CJK·출판

DOM IME overlay로 입력하고 `TextIR → HarfBuzz/Parley/Fontique/Skrifa → CanvasKit/Vello`로 렌더한다. DOM 자체를 최종 조판 원본으로 사용하지 않는다.

- 한글·일본어·중국어 shaping, 세로쓰기, ruby, kinsoku, bidi, hyphenation, variable font.
- 문단·문자·대사 스타일, 말풍선 자동 크기, tail 연결, collision avoidance, 독서 순서.
- 언어별 복제와 레이아웃 override, 폰트 누락/대체/subset/license 보고.
- 웹툰 대사 ID를 자막·TTS·애니매틱·번역과 공유.
- 출판 page/spread/master, bleed/trim, preflight, PDF/PPTX/이미지 출고.
# 11. 웹툰·스토리보드·애니메이션

```text
StoryBible → ScriptGraph → SceneGraph → ShotGraph → PanelGraph
→ Dialogue/Balloon → AnimaticTimeline → Review/Publish
```

- 컷/프레임 경계, 웹툰 세로 흐름, 페이지 관리, 톤·집중선·속도선·효과음.
- 샷 크기·렌즈·카메라·actor pose·duration·dialogue·audio metadata.
- 프레임/cel, exposure sheet, onion skin, peg/rig, curve editor, state machine.
- 타임랩스는 화면 캡처가 아니라 CommandJournal/StrokeIR 기반으로 재생하고 민감 레이어 제외.
- OTIO·이미지 시퀀스·GIF/APNG·MP4/WebM·Lottie/Rive 계열 출고.
# 12. 3D·VRM·물리·2D 연결

```text
Three.js + three-vrm + three-mesh-bvh
+ Rapier / optional Jolt
+ Manifold / glTF Transform / meshoptimizer / KTX2
→ Color / Line / Shadow / Depth / Normal / Object-ID passes
→ editable 2D linked layers
```

- VRM pose/expression/look-at, IK/FK, hand pose, retarget, foot grounding, prop contact.
- Room builder: wall/door/window/stairs/furniture, grid/surface/vertex snap, camera bookmark.
- Mesh primitives, curve, extrude, bevel, array, mirror, boolean, simple sculpt/paint; CAD는 별도 OpenCascade island.
- 3D 표면 페인트와 material channels, UV/triplanar, texture sets.
- 외곽선·접힘선·재질 경계·그림자 경계·depth/normal/ID를 독립 레이어로 만들고 카메라 변경 시 재생성.
- Rapier는 장면 강체·관절에, XPBD는 브러시모·리본·헤어에 사용한다.
# 13. 카메라 트래킹·모션 캡처 최종 설계

MediaPipe의 웹 Pose/Hand/Face Landmarker는 이미지·영상·live stream을 처리하고, pose world coordinates, hand handedness/landmarks, face blendshape와 transformation matrix를 제공한다. 이를 직접 문서 객체로 쓰지 않고 `MotionCaptureIR`로 정규화한다. [S005][S006][S007]

| 기능 | 엔진 | 데이터 흐름 | 성능 정책 |
| --- | --- | --- | --- |
| 몸 포즈 캡처 | MediaPipe Pose/TFJS | 33 landmarks/world coords→RetargetGraph | 15/30/60fps adaptive |
| 손 캡처 | MediaPipe Hand | handedness+21 landmarks→finger rig | 손 가림 confidence |
| 얼굴·표정 | MediaPipe Face | mesh+blendshape+matrix→VRM/Live2D | 표정 smoothing |
| 통합 캡처 | Holistic 또는 병렬 tasks | body+face+hands timestamp sync | 고성능 모드만 |
| 다인 캡처 | Pose num_poses/custom model | Actor ID tracking | occlusion recovery |
| VRM 리타게팅 | three-vrm + own RetargetGraph | bone mapping·rest pose·scale | foot lock·joint limit |
| 2D 퍼펫 | landmark→mesh/bone deformation | Live2D/Rive-style state | 원본 레이어 보존 |
| 표정 녹화 | blendshape curve recorder | Timeline curve simplify | manual override layer |
| 손 제스처 명령 | gesture classifier | undo/next frame/pose save | 명시적 활성화 |
| 카메라 캘리브레이션 | OpenCV calibrateCamera | intrinsic/distortion profile | 기기별 저장 |
| 마커 추적 | ArUco/AprilTag | camera/object pose | 조명·blur gate |
| 자연 특징 추적 | optical flow/features | 2D point/planar tracker | 실패 표시·재지정 |
| 카메라 solve | OpenCV solvePnP + bundle adjustment bridge | virtual camera path | 전문 solve는 ToonBridge |
| 지평선·손떨림 보정 | gyro(optional)+optical flow | stabilization transform | crop preview |
| 실사 배경 매칭 | camera intrinsics+plane solve | 3D room/camera alignment | scale anchor |
| 포즈→컷 | tracked pose snapshot | PanelGraph에 camera/actor state 저장 | one-click variants |
| 동작→효과선 | joint velocity/acceleration | speed line/impact emitter | editable procedural node |
| 충돌→효과 | Rapier contacts | dust/debris/shock line | bake with seed |
| 천·머리카락 가이드 | motion curves→Jolt/XPBD | secondary motion line guide | preview/final |
| 모션 클린업 | One-Euro/Kalman/curve fitting | jitter removal·key reduction | 원본 curve 보존 |
| 발 고정 | contact detection+IK | foot locking | confidence-aware |
| 손-소품 접촉 | hand landmarks+3D collider | grip target/IK | manual correction |
| 립싱크 | audio phoneme/energy optional | viseme curves | optional module |
| 실시간 프리뷰 | low-res tracking worker | proxy rig | render worker 분리 |
| 오프라인 고품질 | recorded video batch | higher-quality model/bridge | 재처리 가능 |
| 개인정보 보호 | local-first, explicit record | camera indicator·retention policy | 기본 업로드 없음 |

### 13.1 Worker 구조

```text
Camera Capture (Main/VideoFrame)
→ Tracking Worker: MediaPipe/TFJS/ONNX
→ MotionCaptureIR + confidence
→ Filter/Retarget Worker: calibration, smoothing, IK, curve reduce
→ 3D/2D Preview Worker
→ Timeline bake / Panel snapshot / Live stream
```


### 13.2 카메라 트래킹 단계

1. 기기별 intrinsic과 lens distortion을 교정하거나 EXIF/기본값으로 시작한다.
2. ArUco/AprilTag가 있으면 강건한 pose anchor를 먼저 사용한다.
3. 자연 특징은 optical flow/feature track으로 2D·planar 추적한다.
4. 알려진 3D 점과 2D 대응점은 solvePnP로 카메라 pose를 구한다.
5. 긴 샷의 전문 bundle adjustment는 Local ToonBridge로 넘긴다.
6. 결과 curve는 confidence와 원본 관측값을 유지한 채 smoothing/key reduction한다.

### 13.3 창의적 연결 기능

- 포즈를 잡고 “컷으로 저장”하면 actor·camera·light·expression을 PanelGraph에 저장.
- 팔·몸의 속도와 가속도에서 speed line·impact line·잔상 초안 생성.
- 손 포즈를 3D 소품 grip과 연결하고 IK target 자동 생성.
- 표정 blendshape를 말풍선 감정 스타일과 연결.
- 실사 영상의 카메라 움직임을 3D 배경과 웹툰 컷 카메라에 재사용.
- 물리 secondary motion을 털·천 선화 가이드로 bake.
# 14. 음성·멀티모달 보조: 선택 기능으로 제한

음성은 핵심 편집 체계가 아니라 **Optional Multimodal Assistant**다. 기본 비활성화, push-to-talk, 명령 whitelist, 인식 문장과 대상 preview, 파괴 명령 확인을 강제한다.

| 단계 | 허용 기능 | 금지/주의 |
| --- | --- | --- |
| P1 | 대사·레이어·컷 이름 받아쓰기 | 항상 듣기 금지 |
| P2 | Undo/Redo, next layer/frame, mirror, save pose 등 20~30개 고정 명령 | CommandRegistry 밖 직접 수정 금지 |
| P3 | 포인터/선택 문맥과 결합한 “여기만 파란색” | 대상 highlight와 실행 전 preview |
| P4 | 사용자 정의 음성 매크로 | 권한·scope·undo·audit 필요 |
웹 Speech API 하나에 의존하지 않고, 가능하면 로컬 whisper.cpp/sherpa-onnx 또는 명시적 private service를 선택한다. 모션 캡처 중 손을 쓸 수 없을 때의 짧은 명령과 접근성에 집중한다.

# 15. CSP 사용자 무이질감 UI/UX

| 원칙 | 구현 | 수용 기준 |
| --- | --- | --- |
| 첫 작업 | 게스트 상태로 즉시 캔버스 생성; 저장 시 계정/파일 승격 | 30초 안에 첫 획, 포맷 선택 강요 금지 |
| CSP 전환 | “Clip Studio에서 왔어요” 흐름에서 파일·브러시·단축키·Workspace 가져오기 | 정확/근사/베이크/보존 전용을 명시 |
| 명령 일관성 | Menu/Shortcut/Quick Deck/HUD/Help/Voice가 같은 CommandID 실행 | 중복 구현 금지 |
| 1–2–3 규칙 | 매 획 기능 1동작, 자주 쓰는 기능 2동작, 관리 3동작 이내 | 분석 텔레메트리로 검증 |
| 포인터 거리 | 브러시 HUD 80px, 선택 명령 180px, 레이어 행 동작 120px 이내 목표 | 손·팝업 가림 자동 회피 |
| 진행 공개 | 저장·동기화·GPU 처리·변환 상태를 상시 보이되 방해하지 않음 | 숨은 실패 금지 |
| Progressive disclosure | 기본 5~9개 속성, Advanced Inspector에서 전체 | 모드가 달라도 동일 명칭 |
| 장치 적응 | Pen Display/Mobile/Keyboard/Mouse/Touch별 Workspace override | 문서는 동일 |
| Undo 신뢰 | 모든 파괴적 명령은 preview/transaction/undo | 긴 작업 취소 가능 |
| 도움말 | F1/도구 툴팁/짧은 영상/실행 가능한 HelpGraph | 경쟁 제품 용어 alias 검색 |
| 접근성 | 키보드, 큰 타깃, contrast, screen reader, tremor profile | 캔버스 외 UI부터 WCAG gate |
| 오류 복구 | GPU loss/탭 종료/저장소 압박 시 Safe Mode | 문서 의미 손실 없이 품질만 낮춤 |

### 15.1 기본 데스크톱 레이아웃

```text
Menu | Action Bar | Document Tabs | Save/Sync/Recovery/Renderer status
Tool Rail | Preset Browser | Canvas + Context Bar | Color/Navigator/Inspector/Layer Tree
Bottom optional: Timeline / Page Manager / Reference Desk / Review
```


### 15.2 Workspace Profiles

- Quick Sketch
- CSP Migration
- Pen Display
- Mobile Draw
- Comic Production
- Paint Studio
- Vector Design
- Photo Edit
- Animation
- Pose & 3D
- Collaboration Review
- Presentation/Publish

### 15.3 메뉴와 명령 구조

#### File

`새 프로젝트`, `열기·최근 파일`, `CSP/PSD/ORA/PDF/Office/3D 가져오기`, `원본 파일 연결`, `저장·다른 이름·버전 체크포인트`, `Publish Package`, `포맷 호환성 보고서`, `복구 센터`, `프로젝트 권리 BOM`

#### Edit

`Undo/Redo`, `History Branch`, `잘라내기·복사·붙여넣기`, `Paste in Place`, `명령 반복`, `Automation Recipe`, `Preferences`, `Input Device Calibration`

#### View

`Zoom/Rotate/Mirror`, `Navigator`, `Proof/Pixel/Vector Preview`, `Color/ICC Soft Proof`, `Onion Skin`, `Reference Overlay`, `Performance HUD`, `Safe Mode`

#### Canvas

`크기·해상도·작업 색공간`, `Crop/Trim`, `웹툰 세로 캔버스`, `페이지/아트보드/슬라이드`, `그리드·자·퍼스`, `대칭·만다라`, `Seamless/Wrap-around`

#### Layer

`Raster/Vector/Text/Balloon/3D/Adjustment/Material`, `Group/Folder`, `Mask/Clipping`, `Reference/Draft/Lock`, `Smart Linked Object`, `Layer Comp`, `Merge/Flatten with Report`

#### Select

`Rectangle/Ellipse/Lasso/Polygon`, `Magic Wand/Color Range`, `Semantic/Object Select`, `Expand/Shrink/Feather/Smooth`, `Quick Mask`, `Save Selection`, `Selection HUD`

#### Transform

`Scale/Rotate/Skew/Perspective`, `Mesh Warp`, `Puppet Warp`, `Liquify`, `Content-aware Scale optional`, `Repeat Transform`, `Snap/Constraint`

#### Brush

`Preset Browser`, `Brush Studio/Brush DNA`, `Pressure/Tilt/Velocity`, `Stabilizer`, `Tip/Texture/Dual Tip`, `Natural Media/Pigment`, `Particle/Physics`, `Import SUT/ABR/MYB/KPP`, `Fidelity Lab`, `Team Preset Versioning`

#### Filter

`Adjustment Layer`, `Color/Blur/Sharpen`, `Distort/Liquify`, `Line/Tone/Webtoon`, `Texture/Style`, `Depth/Normal Effects`, `Filter Gallery`, `EffectGraph Editor`, `Bake/Proxy`

#### Vector

`Pen/Bezier/Shape`, `Anchor/Width/Edit Stroke`, `Boolean/Offset/Trim`, `Vector Eraser`, `Live Appearance`, `Pattern Along Path`, `Vectorize Raster`

#### Text & Balloon

`CJK Text`, `Vertical Writing/Ruby/Kinsoku`, `Paragraph/Style`, `Balloon/Leader/Tail`, `Dialogue Link`, `Localization Layout`, `Font Report`

#### Comic & Story

`Panel/Frame Border`, `Tone/Focus/Speed Lines`, `Page Manager`, `Script/Shot/Panel`, `Continuity Check`, `Scroll Rhythm`, `Story Bible`, `Animatic`

#### Animation

`Timeline`, `Frame/Cel`, `Rig/Puppet`, `State Machine`, `Onion Skin`, `Audio/Markers`, `Motion Capture`, `Export GIF/Video/Sequence/OTIO`

#### 3D & Physics

`Scene/Outliner`, `VRM/Pose/Expression`, `Camera/Light`, `Room Builder`, `Modeling/Boolean`, `Physics/Cloth/Hair`, `3D→2D Pass`, `Surface Paint`, `Camera Tracking`

#### Collaboration

`Share/Permission`, `Presence/Soft Lock`, `Comment/Paint-over`, `Proposal Branch`, `Version Compare`, `Approval`, `Review Session`, `Audit Log`

#### Window

`Workspace Profile`, `Panel Docking`, `Quick Deck`, `Action Bar`, `Asset Vault`, `Reference Desk`, `Capability Center`, `Diagnostics`

#### Help

`Command Search`, `Current Tool Help`, `Tutorial Project`, `CSP/Photoshop terminology search`, `Device/Browser Diagnosis`, `Recovery Guide`, `License/Attribution`, `Bug Report Package`


### 15.4 CommandRegistry

```ts
interface StudioCommand {
  id: CommandId;
  labels: LocalizedLabel[];
  aliases: TerminologyAlias[]; // CSP/Photoshop/Krita/Procreate 포함
  availability(ctx: CommandContext): Availability;
  preview?(ctx: CommandContext): CommandPreview;
  execute(ctx: CommandContext): Promise<CommandResult>;
  undo?: UndoFactory;
  helpNodeId: string;
  permissions?: Permission[];
}
```

# 16. 최대 파일·확장자 상호운용

브라우저 호환성과 파일 포맷 호환성은 별도 문제다. 브라우저는 실행 폴백을 최대화하고, 포맷은 `FormatGateway`와 ToonBridge로 최대 범위를 지원한다.

```text
File/URL/Clipboard/Cloud
→ magic/MIME/container sniff
→ sandbox + size/bomb validation
→ streaming decoder
→ semantic importer + opaque payload preservation
→ StudioDocument
→ fidelity report

Export
→ target capability profile
→ semantic mapping
→ unsupported nodes only bake
→ encoder + validator
→ reopen harness + visual/structural diff
```


### 16.1 우선 포맷군

| 군 | P0/P1 포맷 | 전략 |
| --- | --- | --- |
| CSP·드로잉 | CLIP/CMC 원본 보존·부분 해석, SUT/SUTG/ABR/MYB/KPP, PSD/PSB, ORA | Migration Center + Brush Fidelity Lab |
| 이미지 | PNG/APNG, JPEG, WebP, AVIF, GIF, TIFF, EXR, SVG | 브라우저/WASM 코덱 + 색상 보고 |
| 문서·출판 | PDF, PPTX, ODP, DOCX/ODT, XLSX/ODS, IDML 일부 | OOXML/ODF parser + ToonBridge |
| 3D·VRM | glTF/GLB, VRM, OBJ, FBX bridge, USD/USDZ, STL, 3MF, PLY | Three loaders + Assimp/Blender bridge |
| CAD/BIM | STEP, IGES, DXF, IFC, BREP | OpenCascade/web-ifc + FreeCAD bridge |
| 영상·오디오 | MP4/MOV/WebM/MKV, image sequence, WAV/MP3/AAC/FLAC/Opus, SRT/VTT/ASS, OTIO | WebCodecs/Mediabunny + FFmpeg bridge |
| 브러시·색상·폰트 | ABR/SUT/MYB/KPP/GBR/GIH/PAT, ACO/ASE/GPL/CUBE, TTF/OTF/WOFF | Preset/Color/Font gateway |

### 16.2 호환 등급

| 등급 | 정의 |
| --- | --- |
| F0 Native | ToonStudio 모든 의미·버전·자산 보존 |
| F1 Direct round-trip | 직접 읽기/쓰기와 높은 구조 보존 |
| F2 Structured | 주요 레이어·텍스트·객체 보존 |
| F3 Visual/Semantic | 시각 또는 주요 의미 보존 |
| F4 Bridge | 로컬/서버 변환기 필요 |
| F5 Preserve/Preview | 원본 보존·미리보기·대체 경로 |
# 17. 협업·검수·버전·권리

- CRDT에는 layer metadata, vector/text/balloon/story/comment/permission을 저장하고 raster/PSD/GLB는 content-addressed binary chunk로 분리.
- 프로젝트당 Yjs/Loro/Automerge 중 하나만 선택해 의미 충돌 모델을 단순화.
- Presence, cursor, viewport, active tool은 임시 채널; 저장 원본과 분리.
- Branch/Proposal/Semantic Diff/Partial Merge/Approval/Audit를 VersionGraph로 통합.
- 프레임·범위 댓글, paint-over, tracing paper, before/after, review link.
- 폰트·브러시 팁·3D·오디오·AI 모델·플러그인·외부 파일의 Rights BOM.
# 18. 저장·복구·보안·개인정보

```text
OPFS: tile chunks, native assets, caches, recovery journal
SQLite WASM: metadata, dependency index, search, command/checkpoint catalog
Cloud/object storage: encrypted backup, collaboration binaries
Native .toonstudio: open manifest + CBOR graph + content hashes + foreign originals
```

- OPFS는 고성능 로컬 저장이지만 백업과 동일하지 않다. 사용자가 사이트 데이터를 지우는 경우를 포함해 cloud/file export를 별도 제공.
- CommandJournal은 append-only + periodic checkpoint; 타일은 content hash로 중복 제거.
- 파일 parser, model, plugin은 Worker/WASM/iframe/Extism sandbox와 memory/time limits 사용.
- 카메라·마이크는 명시적 indicator와 session permission, 기본 로컬 처리, 보존 기간 설정.
- 외부 URL asset은 CORS·content-type·size·malware policy를 통과해야 함.
# 19. 성능 아키텍처와 예산

| 영역 | 예산/규칙 | 검증 |
| --- | --- | --- |
| 입력 핫패스 | 메인 스레드 이벤트당 동적 할당 0 목표; React setState 금지 | Reference device에서 profiler로 gate |
| Preview latency | 고성능 펜 환경에서 p50 한 프레임 이내, p95 두 프레임 이내 목표 | 하드웨어 중립 보장값이 아니라 제품 예산 |
| Frame budget | Studio 60fps=16.7ms, Battery/복잡 문서 30fps=33.3ms | QualityOrchestrator가 자동 전환 |
| GPU readback | 편집 중 0 원칙; export/diagnostics만 허용 | InteropBroker 검사 |
| 활성 렌더러 | 표면당 주 GPU 소유자 1; 보조 2D island 최대 1; 3D 선택 1 | 객체별 엔진 전환 금지 |
| 타일 | 기본 256 또는 512px; 필터 halo 포함 | 장치/브러시 반경별 결정 |
| Wet simulation | 젖은 활성 타일만 계산; 안정되면 bake | 전체 캔버스 solver 금지 |
| GPU residency | 보이는/활성 타일 우선; LRU+pin | 메모리 압박 이벤트 대응 |
| WASM boundary | 샘플/mesh/tile을 batch로 전달 | 점 하나당 JS↔WASM 호출 금지 |
| 시작 | UI shell와 무거운 엔진 분리; 첫 도구 lazy warmup | 사용 전 common shader precompile |
| 저장 | Command journal + content-addressed tile chunks + checkpoint | 전체 캔버스 스냅샷 남발 금지 |
| 협업 | CRDT는 의미 객체; 래스터는 binary chunk/version | 픽셀을 CRDT cell로 저장 금지 |
| 모션 캡처 | 기기별 15/30/60fps; 렌더와 tracking worker 분리 | UI 프레임을 추적 fps에 종속 금지 |
| 대형 포맷 | streaming parser/worker/ToonBridge | 메인 스레드 전체 파일 복사 금지 |

### 19.1 Worker Mesh

```text
Main UI: React, accessibility, command dispatch
Input Worker: sample normalize/calibration/gesture
Ink Worker: Google Ink/fallback, StrokeIR, XPBD light
Render Worker: primary 2D runtime + HybridFrameGraph
Wet/Effect Worker: compute schedules (가능하면 render worker와 같은 GPU owner)
Image Worker: OpenCV/Photon/vips/codecs
Tracking Worker: MediaPipe/TFJS/ONNX
3D Worker: scene/physics/geometry
Storage Worker: OPFS/SQLite/chunks
Collab Worker: CRDT/presence/binary transfer
```


### 19.2 QualityOrchestrator 비용 함수

```text
score = fidelityWeight*fidelity
      - latencyWeight*estimatedLatency
      - memoryWeight*residentBytes
      - transferWeight*interopCopies
      - instabilityWeight*backendRisk
      - powerWeight*energyCost
```

# 20. 품질 보증·PoC·완료 기준

| Gate | 필수 통과 조건 |
| --- | --- |
| Q0 현재 코드 감사 | 실제 ToonStudio 렌더러·문서·메모리·입력 계측 없이는 교체 착수 금지 |
| Q1 Google Ink PoC | 선별 C++→WASM, mesh delta, 공개 WGSL, 4개 펜 장치에서 통과 |
| Q2 Vello/CanvasKit route | 동일 SceneIR의 시각 diff·성능·메모리 비교 후 기능별 route 확정 |
| Q3 Sparse Tile | 8K/세로 장문서, 100+ layers, context loss, reopen 시험 |
| Q4 Brush Golden Corpus | 속도·압력·tilt·twist·endpoint·교차·texture·smudge corpus |
| Q5 EffectGraph | tile halo, color space, premultiplied alpha, pass fusion 검증 |
| Q6 CSP Migration | 브러시·레이어·페이지·단축키를 사용자 작업 파일 corpus로 비교 |
| Q7 Format Round-trip | 대상 앱 재개방·구조 diff·pixel diff·font/color report |
| Q8 Mocap | lighting/occlusion/multi-person/low-end device corpus·privacy UX |
| Q9 Cross-browser | Chrome/Edge/Firefox/Safari/iPadOS/Android 주요 기능 matrix |
| Q10 Soak/Recovery | 2시간·8시간 작업, storage pressure, offline, crash, GPU device loss |
| Q11 Accessibility | keyboard-only, screen reader UI, target size, contrast, tremor profile |

### 20.1 기준 장치/브라우저 corpus

- Wacom pen display/Intuos, Surface Pen, Apple Pencil/iPad Safari, S Pen/Android, mouse/trackpad/finger.
- Chrome/Edge WebGPU, Firefox WebGL/CPU, Safari CanvasKit/WebGL 및 지원 WebGPU capability.
- 저사양 integrated GPU, 중간 노트북, 고성능 discrete GPU.
- 4K/8K, 세로 장문서, 100+ layer, 큰 brush, large blur, PSD/CMC multi-page.

### 20.2 Release acceptance

- 기능이 존재하는 것만으로 완료하지 않고 latency, memory, visual diff, undo, reopen, fallback을 모두 통과.
- 브러시마다 reference preset과 device-specific tolerance를 정의.
- 필터마다 preview/export parity와 color-space test를 정의.
- 포맷마다 reopen target app과 구조/시각 diff를 기록.
- 모션 캡처는 confidence·occlusion·privacy·low-end fallback을 포함.
# 21. 플러그인·자동화·AI

- Plugin package는 manifest, permissions, WASM/isolated JS, optional WGSL, UI schema, signature/provenance를 포함.
- Extism/WASM은 브러시·필터·export plugin; QuickJS/SES는 작은 expression/macro; UI는 iframe/Worker 격리.
- AutomationRecipe는 CommandID만 실행하며 preview·scope·undo·batch·error policy를 갖는다.
- AI는 `AIEditNode`로 비파괴 저장하고 model/version/license/prompt/input hash를 기록.
- ONNX Runtime/Transformers.js/MediaPipe를 우선하되 모델별 operator·license·device capability를 검사.
- 생성 기능보다 segmentation, line cleanup, selection, pose, localization, continuity 등 검증 가능한 보조를 먼저 출시.
# 22. 차별화 기능 최종 목록

### 입력·브러시

- Raw/보정/예측/최종 획을 나란히 재생하는 Stroke Debugger
- 장치별 압력 dead-zone과 tilt/twist 자동 교정
- Google Ink·Hokusai·WebGPU·XPBD 속성을 조합하는 Brush DNA
- 그린 뒤에도 안정화·압력·nib·texture를 바꾸는 비파괴 StrokeIR
- 종이 height·fiber·absorption을 프로젝트 재질로 공유
- 3D 바람장·충돌장을 2D 털·입자 브러시에 연결
- 브러시 프리셋의 버전·팀 승인·시각 회귀 관리
- 저사양에서도 동일 의미를 유지하는 brush proxy/final 전환

### 웹툰·스토리

- 대사→말풍선→번역→음성→자막의 동일 ID 연결
- 캐릭터 의상·상처·소품·좌우 방향 연속성 검사
- 말풍선 독서 순서와 세로 스크롤 리듬 시각화
- 3D camera/actor state를 panel preset으로 저장
- 포즈 속도에서 집중선·속도선·잔상 자동 초안
- 컷·대사·색·포즈 단위 semantic diff/merge
- 웹툰을 슬라이드·숏폼·애니매틱으로 의미 보존 변환

### 3D·모션

- 웹캠 포즈·손·표정을 VRM과 2D puppet에 동시 retarget
- 실사 카메라 solve로 3D 배경과 원고 perspective 정렬
- 3D 외곽선·접힘·재질·그림자·depth·normal·ID를 별도 편집 레이어로 생성
- 물리 충돌에서 먼지·파편·충격선·카메라 shake 초안 생성
- 모션 curve를 key reduction한 뒤 원본과 편집 curve를 함께 보존
- 포즈 캡처 중 손을 쓰지 않고 “포즈 저장” 같은 제한 명령만 음성 사용

### 협업·검수

- 레이어/영역/객체 soft lock과 개인 가시성
- 검토 paint-over를 다음 버전 좌표로 자동 이관
- 부분 승인·부분 merge와 변경 이유 기록
- 브러시·렌더 backend별 시각 동등성 검사
- 제작 재생 디버거와 승인 시점 재현
- 권리·출처·폰트·AI 모델까지 포함한 Rights BOM

### UI·신뢰

- 로그인 없이 첫 획 후 프로젝트 승격
- CSP/Photoshop/Krita/Procreate 용어를 같은 명령으로 검색
- 필터 적용 전 VRAM·시간·fallback 예상 표시
- GPU loss·storage pressure 시 문서 손실 없는 Safe Mode
- 도움말 예제를 현재 문서에 복제하고 명령을 직접 실행
- 작업 장치와 손잡이에 따라 패널·HUD 자동 재배치
- 브라우저·포맷 호환성 보고서를 완전히 분리

### 출고·상호운용

- 외부 포맷의 알 수 없는 블록을 opaque payload로 보존
- 내보낸 파일을 대상 앱에서 재개방한 결과를 자동 보고
- 시각 diff와 구조 diff를 함께 제공
- 로컬 ToonBridge로 Blender/Krita/LibreOffice/FFmpeg/FreeCAD 연결
- 플랫폼별 크기·안전영역·색상·폰트·모아레 preflight
- 네이티브 원본과 배포 파생물을 provenance graph로 연결

# 23. 구현 로드맵과 바이브코딩 범위

| 단계 | 범위 | 현실적인 구현 특성 |
| --- | --- | --- |
| R0 감사·계약 | 현재 코드·기기·브라우저 benchmark, 문서 schema freeze, 라이선스 SBOM | 바이브코딩 높음; 성능 해석은 전문가 |
| R1 공통 코어 | CreatorProjectGraph, CommandRegistry, Worker protocol, OPFS journal, Safe Mode | 높음~중간 |
| R2 전문 드로잉 기초 | Pointer input, calibration, sparse tiles, Vello/CanvasKit route, basic brushes/layers | 중간 |
| R3 CSP 전환·편집 | PSD/ORA/SUT/ABR gateway, vector edit, mask, EffectGraph, comic tools | 중간 |
| R4 Google Ink·자연매체 | Google Ink port, Hokusai, wet media, physics brushes, fidelity lab | 낮음~중간; PoC 필수 |
| R5 3D·모션 캡처 | VRM, pose/hand/face, camera tracking, 3D→2D passes, physics | 중간~낮음 |
| R6 협업·검수·출판 | semantic CRDT, review, branch, PPTX/PDF/video, rights/preflight | 중간 |
| R7 고급 차별화 | continuity, multi-format semantic conversion, procedural graph, plugin SDK | 중간 |
| R8 품질 마감 | cross-backend parity, 8h soak, device matrix, docs/tutorials, migration corpus | 전문 QA 필수 |

### 23.1 바이브코딩 판정

| 등급 | 범위 |
| --- | --- |
| 적합 | UI shell, panels, menus, CommandRegistry, schema, adapters, import/export glue, tests, docs, dashboards |
| 조건부 | Worker protocol, WebGPU shader 초안, CRDT integration, tile cache, 3D tools, MediaPipe integration |
| 전문 검증 필수 | 펜 latency, Google Ink ABI/WASM, color management, CJK, PSD/CSP round-trip, GPU lifecycle |
| 연구 영역 | pigment fluid, bristle XPBD, robust camera solve, CAD topology, semantic continuity AI |

### 23.2 우선순위 공식

```text
Priority = userFrequency × workflowCriticality × migrationValue × differentiation
           ÷ (implementationRisk × runtimeCost × licenseRisk × maintenanceCost)
```

P0는 펜·레이어·Undo·저장·PSD/ORA·CSP Migration UX·기본 필터·WebGL/CPU fallback이다. 고급 자연매체·Google Ink·모션 캡처는 PoC를 통과한 뒤 P1/P2에서 주력으로 승격한다.

# 24. 권장 모노레포 경계

- `@toon/core-document`, `@toon/core-command`, `@toon/core-history`, `@toon/core-schema`, `@toon/core-capability`

- `@toon/core-quality-orchestrator`, `@toon/core-render-islands`, `@toon/core-framegraph`, `@toon/core-color`, `@toon/core-rights`

- `@toon/input-dom`, `@toon/input-calibration`, `@toon/input-gesture`, `@toon/input-palm`, `@toon/input-ringbuffer`

- `@toon/ink-ir`, `@toon/google-ink-wasm`, `@toon/google-ink-render`, `@toon/ink-fallback`, `@toon/handwriting`

- `@toon/render-vello`, `@toon/render-canvaskit`, `@toon/render-webgpu`, `@toon/render-pixi`, `@toon/render-thorvg`

- `@toon/render-cpu`, `@toon/render-interop`, `@toon/brush-runtime`, `@toon/brush-vector`, `@toon/brush-raster`

- `@toon/brush-natural`, `@toon/brush-wet`, `@toon/brush-physics`, `@toon/brush-particle`, `@toon/brush-preset`

- `@toon/brush-fidelity`, `@toon/layer-graph`, `@toon/effect-graph`, `@toon/selection`, `@toon/transform`

- `@toon/vector-edit`, `@toon/text-layout`, `@toon/balloon`, `@toon/comic`, `@toon/story`

- `@toon/animation`, `@toon/scene3d`, `@toon/vrm`, `@toon/physics-scene`, `@toon/mocap`

- `@toon/camera-track`, `@toon/retarget`, `@toon/three-to-2d`, `@toon/surface-paint`, `@toon/format-gateway`

- `@toon/format-psd`, `@toon/format-ora`, `@toon/format-svg`, `@toon/format-pdf`, `@toon/format-office`

- `@toon/format-3d`, `@toon/format-media`, `@toon/format-csp-migration`, `@toon/toonbridge-client`, `@toon/storage-opfs`

- `@toon/storage-index`, `@toon/storage-chunks`, `@toon/collab`, `@toon/review`, `@toon/plugin-host`

- `@toon/automation`, `@toon/ai-runtime`, `@toon/voice-optional`, `@toon/ui-shell`, `@toon/ui-workspace`

- `@toon/ui-command`, `@toon/ui-inspector`, `@toon/ui-asset-vault`, `@toon/ui-help`, `@toon/ui-capability`

- `@toon/telemetry`, `@toon/test-corpus`, `@toon/benchmarks`


패키지 경계는 외부 엔진과 제품 의미 모델을 분리한다. 엔진 교체가 UI·문서 포맷·협업 프로토콜을 깨지 않도록 Adapter와 IR 계약을 먼저 테스트한다.

# 25. 최종 채택/보류 판정

| 등급 | 정책 | 예 |
| --- | --- | --- |
| A 직접 채택 | permissive, 유지보수, PoC 통과 | Vello adapter, CanvasKit, PixiJS, Three.js, Yjs, OpenCV.js |
| B 격리 채택 | MPL/LGPL 또는 큰 WASM/특수 런타임 | web-ifc, libheif, vips 구성, MuPDF 상용 검토 |
| C 참고 구현 | GPL/AGPL 앱 또는 구조만 활용 | Krita core, ChickenPaint, xeokit AGPL path |
| D clean-room | LICENSE 없음/불명확 데모 | InkWash 유사 코드 |
| E 상용 옵션 | SDK/서비스 계약 필요 | Wacom WILL, Liveblocks, 전문 변환 서비스 |
| F 보류 | 중복·낮은 유지보수·품질 불충분 | 동일 역할의 구형 엔진을 기본 번들에 동시 포함 |
# 26. V5 신규 엔진·라이브러리 보강 레지스트리

| 분야 | 이름 | 라이선스/주의 | 고유 강점 | ToonStudio 역할 | 채택 | 소스 |
| --- | --- | --- | --- | --- | --- | --- |
| 렌더링 | ThorVG | MIT | SVG·Lottie·벡터 애니메이션, CPU/WebGL/WebGPU | 경량 애니메이션 렌더 아일랜드 | 직접/어댑터 | https://github.com/thorvg/thorvg |
| 렌더링 | PathKit | BSD 계열(Skia) | Skia PathOps·경로 부울 | 벡터 경로 호환·교차 연산 | 선택 채택 | https://skia.org/docs/user/modules/pathkit/ |
| 렌더링 | Dawn / Emdawnwebgpu | BSD-3-Clause | WebGPU 네이티브·WASM 툴체인 | Google Ink/WebGPU 포팅·검증 | 빌드 도구 | https://dawn.googlesource.com/dawn |
| 렌더링 | Rive Runtime | MIT 계열, 자산 조건 별도 | 상태 머신 기반 벡터 애니메이션 | 인터랙티브 컴포넌트 재생 | 어댑터 | https://github.com/rive-app/rive |
| 렌더링 | lottie-web | MIT | After Effects Lottie 재생 | Lottie 호환 폴백 | 직접 | https://github.com/airbnb/lottie-web |
| 렌더링 | dotLottie Web | 공식 저장소 재감사 | 압축 Lottie 컨테이너·웹 재생 | 애니메이션 자산 게이트웨이 | 어댑터 | https://github.com/LottieFiles/dotlottie-web |
| 렌더링 | Blend2D | Zlib | 고성능 CPU 2D 래스터 | 서버·CPU 기준 출력 후보 | 선택 | https://github.com/blend2d/blend2d |
| 렌더링 | NanoVG / nanovg-wasm | Zlib, 포트별 재감사 | 경량 즉시모드 벡터 | 진단 UI·프로토타입 | 참고 | https://github.com/memononen/nanovg |
| 텍스트 | Parley | MIT/Apache-2.0 | 문단 shaping·line breaking·bidi | CJK/다국어 TextIR 레이아웃 | 직접/어댑터 | https://github.com/linebender/parley |
| 텍스트 | Skrifa | MIT/Apache-2.0 | OpenType 폰트 메타·outline | 폰트 파싱·변수 폰트 | 직접 | https://github.com/googlefonts/fontations |
| 텍스트 | Fontique | MIT/Apache-2.0 | 폰트 검색·fallback | 문서 폰트 fallback | 직접 | https://github.com/linebender/parley |
| 텍스트 | Swash | MIT/Apache-2.0 | 글리프 shaping/rasterization 구성요소 | CPU 글리프 폴백 | 선택 | https://github.com/dfrg/swash |
| 텍스트 | Cosmic Text | MIT/Apache-2.0 | Rust 텍스트 레이아웃·편집 | 오프라인/CPU TextIR 후보 | 선택 | https://github.com/pop-os/cosmic-text |
| 텍스트 | fontkit | MIT | 폰트 포맷·subset·glyph | PDF/문서 내보내기 폰트 처리 | 직접 | https://github.com/foliojs/fontkit |
| 텍스트 | opentype.js | MIT | 브라우저 OpenType 파싱·경로 | 브러시 글리프·폰트 미리보기 | 직접 | https://github.com/opentypejs/opentype.js |
| 텍스트 | Typr.js | MIT | 경량 폰트 파싱 | 저사양 폰트 미리보기 | 선택 | https://github.com/photopea/Typr.js |
| 문서·포맷 | ag-psd | MIT | PSD 읽기·쓰기 | PSD 구조 왕복 | 직접 | https://github.com/Agamnentzar/ag-psd |
| 문서·포맷 | @webtoon/psd | 저장소 라이선스 재확인 | 고속 PSD/PSB 파싱 | PSD 분석·미리보기 | 어댑터 | https://github.com/webtoon/psd |
| 문서·포맷 | PDF.js | Apache-2.0 | PDF 렌더·파싱 | PDF 주석·가져오기 | 직접 | https://github.com/mozilla/pdf.js |
| 문서·포맷 | pdf-lib | MIT | PDF 생성·수정 | 간단 PDF 내보내기 | 직접 | https://github.com/Hopding/pdf-lib |
| 문서·포맷 | MuPDF WASM | AGPL/상용 | 고품질 PDF·XPS·전자책 | 격리 브리지·상용 검토 | 조건부 | https://mupdf.com/ |
| 문서·포맷 | PptxGenJS | MIT | 브라우저/Node PPTX 생성 | 슬라이드 내보내기 | 직접 | https://github.com/gitbrent/PptxGenJS |
| 문서·포맷 | docx | MIT | DOCX 생성 | 대본·문서 내보내기 | 직접 | https://github.com/dolanmiu/docx |
| 문서·포맷 | SheetJS CE | Apache-2.0 | 스프레드시트 읽기·쓰기 | 데이터 바인딩·표 가져오기 | 어댑터 | https://github.com/SheetJS/sheetjs |
| 문서·포맷 | fflate | MIT | 고속 ZIP/DEFLATE | OOXML·ORA·네이티브 컨테이너 | 직접 | https://github.com/101arrowz/fflate |
| 문서·포맷 | zip.js | 라이선스 재확인 | 스트리밍 ZIP | 대형 프로젝트 패키징 | 선택 | https://github.com/gildas-lormeau/zip.js |
| 문서·포맷 | libarchive.js | BSD 계열 포트 재확인 | 다양한 아카이브 포맷 | Legacy import sandbox | 조건부 | https://github.com/nika-begiashvili/libarchivejs |
| 문서·포맷 | OpenTimelineIO | Apache-2.0 | 편집 타임라인 교환 | 애니매틱/NLE 상호운용 | 직접/브리지 | https://github.com/AcademySoftwareFoundation/OpenTimelineIO |
| 문서·포맷 | mp4box.js | BSD 계열 재확인 | ISO BMFF 파싱·세그먼트 | MP4 미디어 파이프라인 | 직접 | https://github.com/gpac/mp4box.js |
| 문서·포맷 | Mediabunny | 라이선스 재확인 | 브라우저 미디어 컨테이너 | WebCodecs mux/demux | 어댑터 | https://github.com/Vanilagy/mediabunny |
| 문서·포맷 | MagickWASM | ImageMagick 라이선스/구성 재감사 | 다양한 이미지 포맷 변환 | 특수 이미지 브리지 | 조건부 | https://github.com/dlemstra/magick-wasm |
| 이미지·코덱 | Squoosh codecs | Apache-2.0 계열, 코덱별 상이 | MozJPEG·WebP·AVIF·resize | 클라이언트 이미지 인코딩 | 선택 묶음 | https://github.com/GoogleChromeLabs/squoosh |
| 이미지·코덱 | libjxl WASM | BSD-3-Clause | JPEG XL | JXL 가져오기·내보내기 | 동적 모듈 | https://github.com/libjxl/libjxl |
| 이미지·코덱 | libheif WASM | LGPL/GPL 구성 선택 주의 | HEIF/AVIF | HEIC 호환 | 격리/법무 | https://github.com/strukturag/libheif |
| 이미지·코덱 | OxiPNG WASM | MIT | PNG 무손실 최적화 | 출고 최적화 | 선택 | https://github.com/shssoichiro/oxipng |
| 이미지·코덱 | pngquant/libimagequant WASM | GPL/상용 조건 재감사 | 팔레트 PNG 양자화 | 웹툰·PNG 최적화 | 조건부 | https://pngquant.org/lib/ |
| 3D | Three.js | MIT | 웹 3D 장면·렌더·로더 생태계 | 3D/VRM/보조 패스 | 직접 | https://github.com/mrdoob/three.js |
| 3D | Babylon.js | Apache-2.0 | 3D·WebXR·노드 재질·물리 연계 | 대체 3D 런타임/도구 | 어댑터 | https://github.com/BabylonJS/Babylon.js |
| 3D | PlayCanvas Engine | MIT | 웹 3D·에디터 지향 엔진 | 인터랙티브 콘텐츠 후보 | 선택 | https://github.com/playcanvas/engine |
| 3D | @pixiv/three-vrm | MIT | VRM 0.x/1.0 Three.js 통합 | VRM 캐릭터 | 직접 | https://github.com/pixiv/three-vrm |
| 3D | three-mesh-bvh | MIT | 가속 레이캐스트·공간 질의 | 3D 선택·표면 페인트 | 직접 | https://github.com/gkjohnson/three-mesh-bvh |
| 3D | glTF Transform | MIT | glTF 읽기·변환·최적화 | 3D FormatGateway | 직접 | https://github.com/donmccurdy/glTF-Transform |
| 3D | meshoptimizer | MIT | 메시 압축·LOD·최적화 | 웹 3D 성능 | 직접/WASM | https://github.com/zeux/meshoptimizer |
| 3D | Draco | Apache-2.0 | 기하 압축 | glTF 압축 호환 | 직접/WASM | https://github.com/google/draco |
| 3D | Basis Universal / KTX2 | Apache-2.0 | GPU 텍스처 압축 | VRAM·네트워크 절감 | 직접/WASM | https://github.com/BinomialLLC/basis_universal |
| 3D | Manifold | Apache-2.0 | 견고한 메시 Boolean | 웹 모델링 | 직접/WASM | https://github.com/elalish/manifold |
| 3D | OpenCascade.js | OCCT LGPL 예외 포함 검토 | B-Rep/NURBS/CAD 커널 | STEP/IGES·CAD | 격리/법무 | https://github.com/donalffons/opencascade.js |
| 3D | replicad | MIT | OpenCascade 기반 JS CAD | 파라메트릭 CAD API | 어댑터 | https://github.com/sgenoud/replicad |
| 3D | web-ifc | MPL-2.0 | IFC 파싱·BIM | IFC Import | 격리 | https://github.com/ThatOpen/engine_web-ifc |
| 3D | xeokit SDK | AGPL/상용 | 대형 BIM 시각화 | 전문 BIM 선택 모듈 | 조건부 | https://github.com/xeokit/xeokit-sdk |
| 3D | Assimp / assimpjs | BSD-3-Clause, 포트 재감사 | 다양한 3D 포맷 | Legacy 3D import | 브리지 | https://github.com/assimp/assimp |
| 모션·비전 | MediaPipe Pose Landmarker | Apache-2.0 코드, 모델 조건 확인 | 33개 3D 포즈 랜드마크·웹 라이브 스트림 | 몸 포즈 캡처 | 직접/Worker | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js |
| 모션·비전 | MediaPipe Hand Landmarker | Apache-2.0 코드, 모델 조건 확인 | 손 랜드마크·좌우·월드 좌표 | 손 포즈·제스처 | 직접/Worker | https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js |
| 모션·비전 | MediaPipe Face Landmarker | Apache-2.0 코드, 모델 조건 확인 | 얼굴 메시·blendshape·변환 행렬 | 표정·VRM/2D 리깅 | 직접/Worker | https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js |
| 모션·비전 | MediaPipe Holistic | Apache-2.0 코드, 모델 조건 확인 | 포즈+얼굴+양손 543 랜드마크 | 통합 모션 캡처 | 실험/기능 플래그 | https://ai.google.dev/edge/mediapipe/solutions/vision/holistic_landmarker |
| 모션·비전 | TensorFlow.js pose-detection | Apache-2.0 | MoveNet·BlazePose·PoseNet 선택 | 대체 포즈 런타임 | 폴백 | https://github.com/tensorflow/tfjs-models/tree/master/pose-detection |
| 모션·비전 | Kalidokit | MIT | MediaPipe→VRM/Live2D 보정 | 빠른 리타게팅 PoC | 참고/어댑터 | https://github.com/yeemachine/kalidokit |
| 모션·비전 | AprilTag | BSD 계열 재확인 | 강건한 fiducial marker | 카메라/오브젝트 추적 | WASM 포트 | https://github.com/AprilRobotics/apriltag |
| 모션·비전 | js-aruco / ArUco ports | MIT/포트별 재감사 | 브라우저 마커 추적 | 간단 카메라 추적 폴백 | 선택 | https://github.com/jcmellado/js-aruco |
| 모션·비전 | MMPose | Apache-2.0 | 다양한 포즈 모델·연구 생태계 | 서버/로컬 브리지 고급 모델 | 조건부 | https://github.com/open-mmlab/mmpose |
| 모션·비전 | OpenPose | 비상업/라이선스 제약 | 다인 포즈 연구 기준 | 직접 제품 편입 금지 | 연구만 | https://github.com/CMU-Perceptual-Computing-Lab/openpose |
| 협업 | Yjs | MIT | 고성능 CRDT·Provider 생태계 | 기본 협업 후보 | 직접 | https://github.com/yjs/yjs |
| 협업 | Hocuspocus | MIT | Yjs 협업 서버 | 자체 호스팅 Provider | 선택 | https://github.com/ueberdosis/hocuspocus |
| 협업 | PartyKit | Apache-2.0/서비스 조건 재감사 | 실시간 서버·룸 | 협업 전송 후보 | 선택 | https://github.com/partykit/partykit |
| 협업 | WebRTC | 웹 표준 | P2P 미디어·데이터 채널 | 화상 검토·근거리 동기화 | 표준 | https://www.w3.org/TR/webrtc/ |
| 저장 | wa-sqlite | MIT | SQLite WASM VFS·OPFS | 메타데이터 저장 대안 | 선택 | https://github.com/rhashimoto/wa-sqlite |
| 저장 | Dexie.js | Apache-2.0 | IndexedDB 래퍼·동기화 패턴 | 호환 저장 폴백 | 직접 폴백 | https://github.com/dexie/Dexie.js |
| 저장 | RxDB | Apache/상용 플러그인 조건 확인 | 로컬퍼스트 데이터베이스 | 특정 앱 모드 후보 | 조건부 | https://github.com/pubkey/rxdb |
| 런타임 | Comlink | Apache-2.0 | Worker RPC | Worker Mesh 통신 | 직접 | https://github.com/GoogleChromeLabs/comlink |
| 런타임 | wasm-bindgen | MIT/Apache-2.0 | Rust↔JS 바인딩 | Rust WASM 패키지 | 직접 | https://github.com/rustwasm/wasm-bindgen |
| 런타임 | wasm-bindgen-rayon | MIT/Apache-2.0 | WASM threads·Rayon | 병렬 WASM | 조건부 | https://github.com/RReverser/wasm-bindgen-rayon |
| 런타임 | Emscripten | MIT | C/C++→WASM | Google Ink·OpenCV·코덱 포팅 | 빌드 도구 | https://emscripten.org/ |
| UI | dnd-kit | MIT | 접근 가능한 드래그앤드롭 | 레이어·에셋 재정렬 | 직접 | https://github.com/clauderic/dnd-kit |
| UI | FlexLayout | MIT | 도킹·분할 패널 | Workspace Adapter | 선택 | https://github.com/caplin/FlexLayout |
| UI | Golden Layout | MIT | 도킹 레이아웃 | 대체 Workspace Adapter | 선택 | https://github.com/golden-layout/golden-layout |
| UI | Zustand | MIT | 경량 상태 | UI 상태 | 직접 | https://github.com/pmndrs/zustand |
| UI | Jotai | MIT | 원자형 상태 | 패널·도구 상태 대안 | 선택 | https://github.com/pmndrs/jotai |
| UI | cmdk | MIT | 명령 팔레트 | Command Search | 직접/참고 | https://github.com/pacocoursey/cmdk |
| UI | Zod | MIT | 런타임 스키마 검증 | 문서/플러그인 경계 | 직접 | https://github.com/colinhacks/zod |
| UI | Valibot | MIT | 경량 스키마 검증 | 경량 모듈 대안 | 선택 | https://github.com/open-circle/valibot |
| 테스트 | Playwright | Apache-2.0 | 브라우저 E2E·스크린샷 | 교차 브라우저 회귀 | 직접 | https://github.com/microsoft/playwright |
| 테스트 | Vitest | MIT | 빠른 TS 테스트 | 단위·통합 테스트 | 직접 | https://github.com/vitest-dev/vitest |
| 테스트 | Storybook | MIT | 컴포넌트·시각 테스트 | UI 시스템 | 직접 | https://github.com/storybookjs/storybook |
| 테스트 | axe-core | MPL-2.0 | 접근성 자동 검사 | A11y Gate | 직접/격리 | https://github.com/dequelabs/axe-core |
| 관측성 | OpenTelemetry JS | Apache-2.0 | 성능·추적·메트릭 | 익명화 진단 | 직접 | https://github.com/open-telemetry/opentelemetry-js |
| AI·음성 | sherpa-onnx | Apache-2.0 | 오프라인 ASR/TTS·WebAssembly 가능 | 선택형 음성 명령 | 동적 선택 | https://github.com/k2-fsa/sherpa-onnx |
| AI·음성 | whisper.cpp | MIT | 로컬 음성 인식 | 받아쓰기·Push-to-talk | 동적 선택 | https://github.com/ggerganov/whisper.cpp |
| AI·OCR | Tesseract.js | Apache-2.0 | 브라우저 OCR | 스캔 대사·문서 인식 | 선택 | https://github.com/naptha/tesseract.js |
| AI·비전 | Segment Anything 모델 계열 | 코드/모델 라이선스별 확인 | 대화형 객체 마스크 | 선택 도우미 | 모델별 법무 | https://github.com/facebookresearch/segment-anything |
# 27. V5 신규 제품·서비스 보강 레지스트리

| 분야 | 제품 | 주요 강점 | 반영 기능 | 증거/재감사 | 소스 |
| --- | --- | --- | --- | --- | --- |
| 전문 드로잉·회화 | TVPaint Animation | 래스터 애니메이션과 노출 시트 | 프레임 단위 래스터 작화·라이트테이블·X-sheet | 공식 기능/매뉴얼 재감사 | https://www.tvpaint.com/ |
| 전문 드로잉·회화 | Moho | 2D 본 리깅·스마트 본·벡터 애니메이션 | 2D PuppetGraph·Smart Bone 유사 변형 | 공식 기능/매뉴얼 재감사 | https://moho.lostmarble.com/ |
| 전문 드로잉·회화 | Toon Boom Harmony | 노드 합성·리깅·컷아웃·페이퍼리스 애니메이션 | AnimationGraph·RigGraph·NodeCompositor | 공식 기능/매뉴얼 재감사 | https://docs.toonboom.com/ |
| 전문 드로잉·회화 | Callipeg | 태블릿 중심 프레임 애니메이션 | 펜 중심 타임라인·플립·라이트테이블 UX | 공식 기능 페이지 | https://callipeg.com/ |
| 전문 드로잉·회화 | RoughAnimator | 경량 프레임 애니메이션 | Quick Animation Workspace | 공식 기능 페이지 | https://www.roughanimator.com/ |
| 전문 드로잉·회화 | FlipaClip | 모바일 친화 프레임 애니메이션 | 초보용 애니메이션 온보딩·오디오 동기화 | 공식 기능 페이지 | https://flipaclip.com/ |
| 전문 드로잉·회화 | Animation Desk | 모바일 드로잉 애니메이션 | 간결한 타임라인·레이어 UX | 공식 기능 페이지 | https://www.kdanmobile.com/en/animation-desk |
| 전문 드로잉·회화 | LibreSprite | 오픈소스 픽셀 애니메이션 | IndexedColor·SpriteTimeline | 공식 저장소 | https://github.com/LibreSprite/LibreSprite |
| 전문 드로잉·회화 | Resprite | 모바일 픽셀 아트 | 터치 픽셀 편집·타일맵 UX | 공식 기능 페이지 | https://resprite.fengeon.com/ |
| 전문 드로잉·회화 | Affinity Photo | 비파괴 사진 편집·라이브 필터 | EffectGraph·RAW·고정밀 색상 워크플로 | 공식 도움말 재감사 | https://affinity.help/photo2/en-US.lproj/ |
| 전문 드로잉·회화 | Affinity Publisher | 페이지·마스터·출판 조판 | PublicationGraph·MasterPage·Preflight | 공식 도움말 재감사 | https://affinity.help/publisher2/en-US.lproj/ |
| 전문 드로잉·회화 | Darktable | RAW 현상·비파괴 파이프라인 | RawDevelopGraph·ColorPipeline | 공식 매뉴얼 | https://docs.darktable.org/ |
| 전문 드로잉·회화 | RawTherapee | RAW 처리·색상·노이즈 제어 | 고급 Raw Import Profile | 공식 매뉴얼 | https://rawpedia.rawtherapee.com/ |
| 전문 드로잉·회화 | Capture One | 테더 촬영·레이어 보정·컬러 | ReferenceShoot·ColorMatch·Session Workflow | 공식 도움말 재감사 | https://support.captureone.com/ |
| 전문 드로잉·회화 | Adobe Lightroom | 클라우드 사진 관리·비파괴 보정 | AssetCatalog·AdjustmentHistory·Preset Sync | 공식 도움말 재감사 | https://helpx.adobe.com/lightroom-cc/user-guide.html |
| 디자인·프로토타이핑 | Penpot | 오픈소스 디자인·프로토타입·CSS 친화 | ComponentGraph·DesignToken·Open Format | 공식 도움말 | https://help.penpot.app/ |
| 디자인·프로토타이핑 | Sketch | 컴포넌트·심볼·라이브러리 | Symbol/Instance·Library Sync·Prototype | 공식 문서 | https://www.sketch.com/docs/ |
| 디자인·프로토타이핑 | Framer | 디자인→반응형 웹·애니메이션 | ResponsiveLayout·SitePublish·InteractionGraph | 공식 도움말 | https://www.framer.com/help/ |
| 디자인·프로토타이핑 | Webflow | 시각적 웹 레이아웃·CMS·배포 | DOM/CSS Export Graph·CMS Binding | 공식 문서 | https://help.webflow.com/ |
| 디자인·프로토타이핑 | Wix Studio | 반응형 웹 제작·협업 | Breakpoint Layout·Client Review | 공식 도움말 | https://support.wix.com/en/wix-studio |
| 디자인·프로토타이핑 | ProtoPie | 센서·변수·고급 프로토타입 | InteractionStateMachine·Device Sensor Inputs | 공식 문서 | https://www.protopie.io/learn/docs |
| 디자인·프로토타이핑 | Axure RP | 조건·변수·동적 패널 | Advanced InteractionGraph·Specification | 공식 문서 | https://docs.axure.com/ |
| 디자인·프로토타이핑 | Origami Studio | 패치 그래프 기반 프로토타입 | Visual Interaction NodeGraph | 공식 문서 | https://origami.design/documentation/ |
| 디자인·프로토타이핑 | Uizard | AI 보조 UI 초안·프로토타이핑 | Template-to-Editable UI·Rapid Wireframe | 공식 기능 페이지 | https://uizard.io/ |
| 프레젠테이션·문서 | Pitch | 협업 프레젠테이션·브랜드 템플릿 | Slide Collaboration·Brand System | 공식 도움말 | https://help.pitch.com/ |
| 프레젠테이션·문서 | Gamma | 문서·슬라이드·웹페이지 변환 | Semantic Multi-surface Layout | 공식 도움말 | https://help.gamma.app/ |
| 프레젠테이션·문서 | Prezi | 공간형 줌 프레젠테이션 | SpatialPresentationGraph·Camera Path | 공식 도움말 | https://support.prezi.com/ |
| 프레젠테이션·문서 | Beautiful.ai | 규칙 기반 스마트 슬라이드 | ConstraintSlideLayout | 공식 도움말 | https://support.beautiful.ai/ |
| 프레젠테이션·문서 | Genially | 인터랙티브 콘텐츠·게임화 | Hotspot·Tooltip·Branching·Analytics | 공식 도움말 | https://support.genially.com/ |
| 프레젠테이션·문서 | Visme | 데이터 시각화·인터랙티브 문서 | DataWidget·Presentation·Brand Kit | 공식 도움말 | https://support.visme.co/ |
| 프레젠테이션·문서 | Zoho Show | 웹 협업 슬라이드 | Office Interop·Team Presentation | 공식 도움말 | https://help.zoho.com/portal/en/kb/show |
| 프레젠테이션·문서 | LibreOffice Impress | 오픈소스 ODP/PPTX 편집 | Local Bridge·ODF Round-trip | 공식 도움말 | https://help.libreoffice.org/ |
| 화이트보드·필기 | Microsoft Whiteboard | 협업 보드·잉크·템플릿 | Enterprise Whiteboard Mode | 공식 도움말 | https://support.microsoft.com/whiteboard |
| 화이트보드·필기 | Apple Freeform | 기기 간 무한 보드·미디어 | Mobile InfiniteBoard·Apple ecosystem UX | 공식 도움말 | https://support.apple.com/guide/freeform/welcome/mac |
| 화이트보드·필기 | Goodnotes | 필기·PDF·검색·학습 | Handwriting Workspace·PDF Annotation | 공식 도움말 | https://support.goodnotes.com/ |
| 화이트보드·필기 | Notability | 필기+오디오 동기화 | AudioLinkedInk·Study Review | 공식 도움말 | https://support.gingerlabs.com/ |
| 화이트보드·필기 | Nebo | 필기 인식·수식·도형 변환 | Ink-to-Text/Math/Shape | 공식 도움말 | https://app-support.myscript.com/ |
| 화이트보드·필기 | OneNote | 자유 필기·노트 구조·OCR | NotebookGraph·Ink Search | 공식 도움말 | https://support.microsoft.com/onenote |
| 화이트보드·필기 | Samsung Notes | S Pen 필기·PDF·오디오 | S Pen Device Profile·Mobile Notes | 공식 도움말 | https://www.samsung.com/us/support/owners/app/samsung-notes |
| 화이트보드·필기 | Squid | 벡터 필기·PDF | Vector Handwriting·Page Templates | 공식 기능 페이지 | https://www.squidnotes.com/ |
| 3D·스컬프팅·재질 | Autodesk Maya | 리깅·애니메이션·노드·USD | Rig/Animation/Scene Interop Reference | 공식 도움말 | https://help.autodesk.com/view/MAYAUL/ |
| 3D·스컬프팅·재질 | Cinema 4D | 모션그래픽·MoGraph·노드 | Procedural MotionGraph | 공식 도움말 | https://help.maxon.net/c4d/ |
| 3D·스컬프팅·재질 | Houdini | 절차형 노드·시뮬레이션 | GeometryGraph·SimulationGraph | 공식 문서 | https://www.sidefx.com/docs/houdini/ |
| 3D·스컬프팅·재질 | ZBrush | 스컬프팅·브러시·폴리페인트 | SculptBrush Reference·Detail Pipeline | 공식 도움말 | https://help.maxon.net/zbr/ |
| 3D·스컬프팅·재질 | Nomad Sculpt | 모바일 스컬프팅 | Touch Sculpt Workspace | 공식 매뉴얼 | https://nomadsculpt.com/manual/ |
| 3D·스컬프팅·재질 | SculptGL | 브라우저 스컬프팅 | Web Sculpt PoC Reference | 공개 코드/기능 | https://stephaneginier.com/sculptgl/ |
| 3D·스컬프팅·재질 | Adobe Substance 3D Painter | PBR 레이어·마스크·재질 페인팅 | MaterialLayerGraph·Smart Mask·Bake Maps | 공식 도움말 | https://helpx.adobe.com/substance-3d-painter/home.html |
| 3D·스컬프팅·재질 | Adobe Substance 3D Designer | 절차형 재질 노드 | MaterialNodeGraph | 공식 도움말 | https://helpx.adobe.com/substance-3d-designer/home.html |
| 3D·스컬프팅·재질 | Material Maker | 오픈소스 절차 재질 | Procedural MaterialGraph | 공식 사이트/저장소 | https://www.materialmaker.org/ |
| 3D·스컬프팅·재질 | ArmorPaint | 오픈소스 지향 3D 텍스처 페인팅 | Browser-adjacent PBR Paint Reference | 공식 사이트 | https://armorpaint.org/ |
| 3D·스컬프팅·재질 | Shapr3D | 직관적 직접 모델링·CAD | Pen-first CAD UX·Constraint Sketch | 공식 도움말 | https://support.shapr3d.com/ |
| 3D·스컬프팅·재질 | Autodesk Fusion | CAD/CAM·파라메트릭 | FeatureTree·Sketch Constraints·Interchange | 공식 도움말 | https://help.autodesk.com/view/fusion360/ENU/ |
| 3D·스컬프팅·재질 | Plasticity | 아티스트 친화 솔리드 모델링 | Direct NURBS UX Reference | 공식 도움말 | https://doc.plasticity.xyz/ |
| 3D·스컬프팅·재질 | SolveSpace | 오픈소스 제약 CAD | ConstraintSolver Reference | 공식 사이트 | https://solvespace.com/ |
| 3D·스컬프팅·재질 | OpenSCAD | 코드 기반 파라메트릭 모델링 | Scripted GeometryGraph | 공식 문서 | https://openscad.org/documentation.html |
| XR·공간 창작 | Open Brush | VR 공간 드로잉 | SpatialStrokeIR·VR Painting | 공식 저장소 | https://github.com/icosa-foundation/open-brush |
| XR·공간 창작 | Gravity Sketch | VR 3D 스케치·협업 | Spatial Sketch Workspace | 공식 도움말 | https://help.gravitysketch.com/ |
| XR·공간 창작 | ShapesXR | XR 프로토타이핑 | Spatial InteractionGraph | 공식 도움말 | https://learn.shapesxr.com/ |
| 모션캡처·카메라 | Rokoko Studio | 관성·비전 모션 캡처·리타게팅 | Mocap Session·Retarget·Live Stream | 공식 도움말 | https://support.rokoko.com/ |
| 모션캡처·카메라 | Move.ai | 비디오 기반 멀티인물 모션 캡처 | Video Mocap Import/Reference | 공식 도움말 | https://docs.move.ai/ |
| 모션캡처·카메라 | DeepMotion Animate 3D | 비디오→3D 모션 | AI Mocap Workflow Reference | 공식 도움말 | https://deepmotion.com/ |
| 모션캡처·카메라 | Plask | 브라우저 모션 캡처·애니메이션 | Web Mocap UX Reference | 공식 기능 페이지 | https://plask.ai/ |
| 모션캡처·카메라 | RADiCAL | 웹캠 기반 모션 캡처 | Browser Mocap UX Reference | 공식 기능 페이지 | https://radicalmotion.com/ |
| 모션캡처·카메라 | VSeeFace | VRM 얼굴·몸 추적 | VRM Live Avatar Reference | 공식 사이트 | https://www.vseeface.icu/ |
| 모션캡처·카메라 | VTube Studio | Live2D 얼굴 추적·표정 | 2D Puppet Face Tracking Reference | 공식 도움말 | https://github.com/DenchiSoft/VTubeStudio/wiki |
| 모션캡처·카메라 | Warudo | VTuber 3D 장면·노드 | Live Character NodeGraph | 공식 문서 | https://docs.warudo.app/ |
| 모션캡처·카메라 | Blender Camera Tracking | 카메라 solve·마커·평면 추적 | CameraSolve Workspace | 공식 매뉴얼 | https://docs.blender.org/manual/en/latest/movie_clip/ |
| 모션캡처·카메라 | Mocha Pro | 평면 추적·로토·렌즈 | PlanarTracking/Mask Reference | 공식 도움말 | https://borisfx.com/documentation/mocha/ |
| 모션캡처·카메라 | SynthEyes | 전문 3D 카메라 트래킹 | Camera Solve/Survey Workflow Reference | 공식 문서 | https://www.ssontech.com/docs/ |
| 모션캡처·카메라 | PFTrack | 카메라·오브젝트 추적 | Advanced Tracking Reference | 공식 문서 | https://support-thepixelfarm.co.uk/ |
| AI·자동화 창작 | ComfyUI | 노드형 생성 파이프라인 | Optional AI Graph·Model Provenance | 공식 저장소 | https://github.com/comfyanonymous/ComfyUI |
| AI·자동화 창작 | InvokeAI | 캔버스·노드·모델 관리 | Reversible AI Edit Node Reference | 공식 문서 | https://invoke-ai.github.io/InvokeAI/ |
| AI·자동화 창작 | Krita AI Diffusion | Krita 통합 생성형 보조 | AI Plugin Boundary Reference | 공식 저장소 | https://github.com/Acly/krita-ai-diffusion |
| AI·자동화 창작 | EbSynth | 키프레임 기반 스타일 전파 | Paint-over Temporal Propagation Reference | 공식 사이트 | https://ebsynth.com/ |
| 다이어그램·데이터 | Graphviz | 그래프 자동 배치 | Diagram Layout Backend | 공식 문서 | https://graphviz.org/documentation/ |
| 다이어그램·데이터 | D2 | 텍스트 기반 다이어그램 | Diagram-as-Code Import | 공식 문서 | https://d2lang.com/ |
| 다이어그램·데이터 | PlantUML | 텍스트 기반 UML | UML Import/Export | 공식 문서 | https://plantuml.com/ |
| 영상·합성 | Kdenlive | 오픈소스 NLE | Timeline/Edit Workflow Reference | 공식 매뉴얼 | https://docs.kdenlive.org/ |
| 영상·합성 | Shotcut | 크로스플랫폼 영상 편집 | Lightweight NLE Reference | 공식 도움말 | https://shotcut.org/howtos/ |
| 영상·합성 | Nuke | 노드 합성·로토·트래킹 | CompositingGraph Reference | 공식 도움말 | https://learn.foundry.com/nuke/ |
| 영상·합성 | Cavalry | 절차 모션 디자인 | 2D Procedural MotionGraph | 공식 도움말 | https://docs.cavalry.scenegroup.co/ |
# 28. 공식·1차 소스 Ledger

| ID | 소스 | URL | 근거 |
| --- | --- | --- | --- |
| S001 | Google Ink official repository | https://github.com/google/ink | mesh-based vector stroke generation; interface stability warning |
| S002 | Vello official repository | https://github.com/linebender/vello | GPU compute 2D renderer; alpha limitations |
| S003 | CanvasKit official docs | https://skia.org/docs/user/modules/canvaskit/ | Skia WASM, path/text, shaders, Skottie |
| S004 | PixiJS renderer guide | https://pixijs.com/8.x/guides/components/renderers | WebGL stable/recommended; WebGPU maturing |
| S005 | MediaPipe Pose Landmarker | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js | web pose tracking and world coordinates |
| S006 | MediaPipe Hand Landmarker | https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js | hand landmarks and handedness |
| S007 | MediaPipe Face Landmarker | https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js | face mesh, blendshapes, matrices |
| S008 | MediaPipe Holistic | https://ai.google.dev/edge/mediapipe/solutions/vision/holistic_landmarker | combined pose/face/hands |
| S009 | Clip Studio workspace manual | https://help.clip-studio.com/en-us/manual_en/690_interface/Register_and_manage_your_workspace.htm | workspace includes palette, shortcuts, command bar, units |
| S010 | Clip Studio user guide | https://help.clip-studio.com/en-us/manual_en/ | brush/layer/vector/comic/3D/animation manuals |
| S011 | Pointer Events Level 3 | https://www.w3.org/TR/pointerevents3/ | raw/coalesced/predicted events and pen geometry |
| S012 | WebGPU standard | https://www.w3.org/TR/webgpu/ | GPU rendering and compute |
| S013 | OPFS documentation | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system | origin-private high-performance storage |
| S014 | Hokusai | https://github.com/reearth/hokusai | Rust/MyPaint brush engine candidate |
| S015 | libmypaint | https://github.com/mypaint/libmypaint | MyPaint brush engine |
| S016 | Rapier | https://rapier.rs/ | Rust 2D/3D physics |
| S017 | JoltPhysics.js | https://github.com/jrouwe/JoltPhysics.js | WASM rigid/soft-body physics |
| S018 | Three.js | https://github.com/mrdoob/three.js | web 3D ecosystem |
| S019 | three-vrm | https://github.com/pixiv/three-vrm | VRM on Three.js |
| S020 | OpenCV solvePnP | https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html | camera pose estimation |
| S021 | OpenCV ArUco | https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html | fiducial marker detection |
| S022 | ONNX Runtime Web | https://onnxruntime.ai/docs/get-started/with-javascript/web.html | WASM/WebGPU/WebNN inference |
| S023 | Yjs | https://github.com/yjs/yjs | CRDT collaboration |
| S024 | Loro | https://github.com/loro-dev/loro | movable trees/time travel CRDT |
| S025 | ag-psd | https://github.com/Agamnentzar/ag-psd | PSD read/write |
| S026 | OpenRaster | https://www.openraster.org/ | open layered raster interchange |
| S027 | PptxGenJS | https://github.com/gitbrent/PptxGenJS | PPTX generation |
| S028 | OpenTimelineIO | https://github.com/AcademySoftwareFoundation/OpenTimelineIO | timeline interchange |
| S029 | WebCodecs | https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API | low-level browser media codecs |
| S030 | ThorVG | https://github.com/thorvg/thorvg | vector animation rendering |
| S031 | Graphite | https://graphite.rs/ | procedural node-based graphics editor |
| S032 | InkWash | https://johnowhitaker.github.io/inkwash/about | code/demo reference; clean-room if no license |
| S033 | Photopea brush docs | https://www.photopea.com/learn/brush-tools | browser brush/ABR reference |
| S034 | Drawpile | https://drawpile.net/about/ | collaborative drawing/session reference |
| S035 | Kleki help | https://kleki.com/help/ | immediate web drawing and recovery UX |
| S036 | Magma help | https://help.magma.com/ | collaborative drawing UX |
| S037 | Figma help | https://help.figma.com/ | components, variables, auto layout, prototypes |
| S038 | Adobe Photoshop help | https://helpx.adobe.com/photoshop/user-guide.html | smart objects/filters/masks/actions |
| S039 | Krita manual | https://docs.krita.org/en/ | brush engines and animation |
| S040 | GIMP docs | https://docs.gimp.org/ | image editing and non-destructive evolution |
| S041 | Inkscape manual | https://inkscape-manuals.readthedocs.io/ | vector and live path effects |
| S042 | HarfBuzz | https://harfbuzz.github.io/ | text shaping |
| S043 | ICU4X | https://github.com/unicode-org/icu4x | internationalization |
| S044 | Google Ink Stroke Modeler | https://github.com/google/ink-stroke-modeler | smoothing/prediction input model |
| S045 | TensorFlow.js pose detection | https://github.com/tensorflow/tfjs-models/tree/master/pose-detection | browser pose alternatives |
| S046 | Kalidokit | https://github.com/yeemachine/kalidokit | landmark-to-avatar retargeting reference |
# 29. 최종 실행 결론

최고의 아키텍처는 가장 많은 엔진을 동시에 실행하는 구조가 아니다. **가장 많은 기능 후보를 공통 IR로 흡수하고, 실제 프레임에서는 가장 적은 엔진과 복사로 높은 품질을 내는 구조**다.


최종 실행 순서는 다음과 같다.

1. 현재 ToonStudio를 계측해 문서·렌더·입력·저장 경계를 확정한다.
2. CreatorProjectGraph, CommandRegistry, sparse tile, OPFS journal, Safe Mode를 먼저 완성한다.
3. CSP Migration Workspace와 PSD/ORA/SUT/ABR 경로로 실제 사용자 이전 가치를 만든다.
4. CanvasKit Production 경로와 WebGL/CPU 폴백을 안정화한 뒤 Vello를 대량 벡터에 확대한다.
5. Google Ink C++→WASM/WGSL PoC를 통과한 브러시만 전문 잉킹 주력으로 승격한다.
6. Hokusai/wet media/XPBD를 독립 백엔드로 단계적으로 출시한다.
7. MediaPipe 기반 모션 캡처와 3D→2D 연결을 P2 차별화로 제공한다.
8. 협업·검수·포맷 재개방 시험·Rights BOM으로 상업 제작 신뢰성을 완성한다.

음성은 기본 제품 전면이 아니라 선택형 보조로 유지한다. 제품의 첫 인상은 언제나 **펜의 반응, 쉬운 동선, 파일을 잃지 않는 신뢰, CSP에서 넘어오기 쉬운 경험**이어야 한다.


---

# 부록 A. 기존 제품·서비스·엔진 405개 전체 레지스트리

| 분류유형 | 분야 | 이름 | 핵심강점 | ToonStudio 반영기능 | 권장엔진조합 | 채택방식 | 라이선스·상용주의 | 증거수준 | 소스 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 제품·서비스 | 웹 드로잉·공동작화 | Magma | 실시간 공동 작화, 레이어 소유권, 역할별 레이아웃, 도구별 영상 도움말 | 공동작화 세션, 레이어 잠금·소유권, Adaptive Workspace, 영상 툴팁 | Custom WebGPU + Vello + Loro/Yjs + React Aria | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://help.magma.com/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Drawpile | 다중 브러시 엔진, 200개 이상 브러시, 애니메이션, 권한형 세션, 자동 복구 | 세션 권한, 호스트 제어, 동기화 스머지, 타임랩스, 복구 가능한 공동 작화 | WebGPU brush backend + Hokusai/libmypaint + Loro + OPFS | 오픈소스 구조·UX 참고 | GPLv3이므로 코드 직접 결합은 격리·법무 검토 | A | https://drawpile.net/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Kleki | 계정 없이 즉시 시작, 경량 브라우저 저장, 단순한 도구·터치 UX | Quick Sketch, 임시 로컬 문서, 탭 복구, 간단 모드, 브라우저 한계 안내 | CanvasKit/PixiJS Lite + OPFS/IndexedDB + Pointer Events | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://kleki.com/help/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Draw.Chat | PDF·이미지·지도·웹페이지 위 실시간 주석, 통화·화면공유, 압력·기울기 | 검토 보드, 교육 모드, PDF/지도 주석, 통화·파일전송, 비회원 링크 | Vello annotation + PDF.js + WebRTC + Loro/Yjs | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://draw.chat/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Flockmod | 대규모 동시 드로잉 방, 레이어·블렌딩·애니메이션 | 공개 드로잉 룸, 관전자·발표자 권한, 이벤트 캔버스 | WebGPU/PixiJS + WebSocket presence | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 웹 드로잉·공동작화 | Aggie.io | 링크 기반 공동 드로잉과 간단한 레이어 | 초대 링크, 저마찰 공동 낙서 모드 | PixiJS Lite + Loro/Yjs | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 웹 드로잉·공동작화 | WBO | URL만 공유하는 영속 실시간 무한 보드 | 무가입 공개 보드, 영속 상태, 간단 협업 | LeaferJS/js-draw + Yjs + object storage | 오픈소스 구조 참고 | 상용/배포 조건은 구현 직전 재확인 | A | https://wbo.ophir.dev/ |
| 제품·서비스 | 웹 드로잉·공동작화 | miniPaint | 브라우저 로컬 처리, 레이어·필터·선택을 갖춘 오픈소스 이미지 편집기 | Lite Photo Workspace, 로컬 우선 편집, 빠른 필터 | CanvasKit/PixiJS + Photon/OpenCV | 오픈소스 기능 참고 | 오픈소스 라이선스와 의존성 재감사 | A | https://github.com/viliusle/miniPaint |
| 제품·서비스 | 웹 드로잉·공동작화 | JS Paint | 데스크톱형 메뉴 문법, 오프라인·클립보드·로컬 백업, 세로 CJK 텍스트 | Classic UI 프로필, 오프라인 편집, 레거시 UX 친숙도, 세로쓰기 | CanvasKit + OPFS + Service Worker | 오픈소스 UX 참고 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 웹 드로잉·공동작화 | Sketchpad / Sketch.IO | 다양한 브러시·클립아트·폰트·객체 편집·PDF/SVG 출력 | 교육·포스터·클립아트 모드, 오픈 자산 검색, 객체형 드로잉 | Vello + CanvasKit + AssetVault | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://sketch.io/sketchpad/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Sumo Paint | 브라우저 페인팅과 Sumo 창작 스위트 연결 | 통합 창작 런처, 앱 간 자산 왕복 | CreatorProjectGraph + shared AssetVault | 제품군 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 웹 드로잉·공동작화 | Photopea | PSD 중심 고호환 이미지 편집, 데스크톱 메뉴·단축키, ABR/ATN 등 | PSD 왕복, 액션, 브러시 팩 가져오기, 전문가 메뉴 프로필 | ag-psd/@webtoon-psd + CanvasKit + EffectGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://www.photopea.com/learn/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Pixlr | 웹 사진 편집, 템플릿·AI 보조의 쉬운 진입 | Quick Edit, 배경 제거, 템플릿 기반 출력 | OpenCV/ONNX + CanvasKit + TemplateGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 웹 드로잉·공동작화 | Polarr | 사진 보정 프리셋과 고급 색 조정 | 룩 프리셋, 로컬 조정, 색상 레시피 공유 | EffectGraph + WGSL LUT/curves + Color.js | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 웹 드로잉·공동작화 | LunaPic | 광범위한 웹 필터·간단 애니메이션 효과 | 실험 필터 갤러리, 1클릭 효과 탐색 | EffectPreset Registry + WebGPU/Photon | 아이디어 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 웹 드로잉·공동작화 | ChickenPaint | 오픈소스 브라우저 페인팅 앱의 레이어·브러시 구조 | 브러시/레이어 UX 참고, Canvas 기반 폴백 | 독립 GPL 참고 + clean-room 재구현 | 구조 참고 | GPL 영향으로 직접 코드 결합 금지 | B |  |
| 제품·서비스 | 웹 드로잉·공동작화 | QueekyPaint | 브라우저 드로잉과 과정 재생·공유 | Stroke Replay, 창작 과정 공유 | Command Journal + deterministic replay | 아이디어 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 웹 드로잉·공동작화 | Slimber | 초경량 온라인 스케치와 공유 | 초경량 임베드 스케치 위젯 | js-draw Lite + SVG output | 아이디어 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 웹 드로잉·공동작화 | MugTug Sketchpad | 브라우저 기반 벡터·래스터 드로잉 역사 사례 | 레거시 브라우저 드로잉 UX 비교 | 참고 전용 | 역사·UX 참고 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 웹 드로잉·공동작화 | Filerobot Image Editor | MIT 기반 크롭·회전·리사이즈·필터·주석 임베드 | 업로드 전 빠른 편집, 프로필 이미지·콘텐츠 준비 모드 | Filerobot adapter 또는 자체 CanvasKit Lite editor | 직접 채택 후보 | MIT; 장기 유지보수와 출력 품질 별도 검증 | A | https://github.com/scaleflex/filerobot-image-editor |
| 제품·서비스 | 웹 드로잉·공동작화 | TOAST UI Image Editor | 크롭·회전·도형·텍스트·마스크·기본 필터 | 간단 사진 편집 모드의 기능 기준선 | Fabric adapter 또는 자체 Lite Editor | 구조·기능 참고 | 프로젝트 유지보수 상태와 의존성 감사 필요 | A | https://github.com/nhn/tui.image-editor |
| 제품·서비스 | 웹 드로잉·공동작화 | Pintura | 반응형·접근 가능한 이미지 편집 SDK, 크롭 가이드·주석·리댁션 | 업로드 품질 보정, 보안 마스킹, 모바일 편집 UX | 자체 CanvasKit Lite editor로 기능 재현 | 상용 SDK 벤치마크 | 상용 라이선스; 직접 사용 시 비용 검토 | A | https://pqina.nl/pintura/ |
| 제품·서비스 | 웹 드로잉·공동작화 | Polotno | 템플릿·동적 변수·이미지/영상 편집과 프로그래매틱 생성 | TemplateGraph, 변수 기반 대량 생성, 화이트라벨 UI | Konva/CanvasKit + TemplateGraph + export workers | 상용 SDK 벤치마크 | 상용 SDK; 기능만 자체 구현 | A | https://polotno.com/docs/overview |
| 제품·서비스 | 웹 드로잉·공동작화 | IMG.LY CreativeEditor SDK | 상용 임베디드 디자인·영상·인쇄 편집의 완성도 | 통합 미디어 편집 UX, 역할 기반 템플릿, 출력 파이프라인 | 자체 Creator SDK 설계 기준 | 상용 SDK 벤치마크 | 상용 라이선스; 직접 채택 여부 별도 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Concepts | 편집 가능한 벡터 획, 무한 캔버스, 실제 단위·측정·스냅 | 정밀 스케치, 이동 가능한 아트보드, 실척 도면, 벡터 획 사후 편집 | Vello + StrokeIR + Constraint/Snap engine | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://concepts.app/ |
| 제품·서비스 | 무한 캔버스·노트 | Rnote | Rust 기반 벡터 드로잉, PDF/이미지 주석, 무한 캔버스, 적응형 UI | Study/Annotate Workspace, 페이지+무한 캔버스 혼합 | Vello/CanvasKit + PDF.js + adaptive UI | 오픈소스 구조 참고 | 라이선스와 코드 결합 경계 재감사 | A | https://rnote.flxzt.net/ |
| 제품·서비스 | 무한 캔버스·노트 | Lorien | 획을 점 컬렉션으로 저장해 작은 파일과 무한 캔버스를 구현 | 경량 StrokeStore, 초대형 캔버스, 단순 노트 모드 | Vello + compact point encoding + LOD | 직접 구조 참고 | MIT; 일부 아이디어 직접 채택 가능 | A | https://github.com/mbrlabs/Lorien |
| 제품·서비스 | 무한 캔버스·노트 | Linwood Butterfly | 크로스플랫폼 무한 캔버스·필기·멀티미디어 노트 | 멀티미디어 노트 작업면, 플러그인형 도구 | CreatorProjectGraph + asset embedding | 오픈소스 기능 참고 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Endless Paper | 극단적으로 단순한 무한 공간과 자연스러운 탐색 | Focus Canvas, UI 최소화, 공간적 사고 모드 | Custom infinite viewport + semantic zoom | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | InfiniPaint | 무제한 확대·축소와 협업형 무한 캔버스 | 다중 스케일 캔버스, 우주~미세 디테일 의미 줌 | hierarchical coordinates + LOD + CRDT | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | tldraw | 고성능 카메라, 커스텀 도형·툴·바인딩, 협업 기반 | Reference/Diagram workspace, custom shape runtime | tldraw adapter 또는 자체 Viewport; 생산 라이선스 확인 | 조건부 SDK 후보 | 현행 생산 라이선스 별도 확인 | A | https://tldraw.dev/ |
| 제품·서비스 | 무한 캔버스·노트 | Excalidraw | 가입 없는 즉시 화이트보드, 손그림 도형, 텍스트→다이어그램 | Quick Diagram, 스케치 스타일, 텍스트 기반 구조 생성 | Rough.js + ELK/Mermaid + Vello | 오픈소스 UX·기능 참고 | 상용/배포 조건은 구현 직전 재확인 | A | https://plus.excalidraw.com/ |
| 제품·서비스 | 무한 캔버스·노트 | FigJam | 피그마와 연결되는 협업 보드·스티커·투표·타이머 | 팀 기획 보드, 캐릭터/컷 워크숍, 투표·타이머 | LeaferJS + CollaborationGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Miro | 대규모 템플릿·워크숍·다이어그램·발표 | Production Board, 회의·아이디어·맵 통합 | LeaferJS/tldraw-like viewport + widgets | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://miro.com/online-whiteboard/ |
| 제품·서비스 | 무한 캔버스·노트 | Mural | 워크숍 진행·퍼실리테이션·템플릿 | 협업 세션 진행자 도구, 단계별 공개, 타이머 | CollaborationGraph + facilitation controls | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Whimsical | 빠른 플로우차트·와이어프레임·문서 통합 | 스토리 플로우·UI 콘티·다이어그램 | ELK/Cytoscape + component library | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | diagrams.net | 광범위한 도형 라이브러리와 파일 기반 다이어그램 | 장면 관계도, 제작 파이프라인도, 내보내기 | mxGraph 구조 참고 + ELK/Cytoscape | 오픈소스 기능 참고 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Lucidchart | 데이터 연결 다이어그램과 조직도 | 캐릭터 관계도·프로덕션 흐름의 데이터 연동 | DataBindingGraph + ELK | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Creately | 시각 협업과 데이터베이스형 객체 | 세계관 엔티티·관계·보드 동기화 | EntityGraph + visual canvas | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무한 캔버스·노트 | Ziteboard | 가벼운 실시간 화이트보드와 URL 공유 | 저사양 검토·교육 보드 | js-draw Lite + WebSocket | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무한 캔버스·노트 | Limnu | 마커보드에 가까운 자연스러운 화이트보드 경험 | 회의·리뷰 펜 모드, 보드 질감 | CanvasKit marker + simple board | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무한 캔버스·노트 | Explain Everything | 녹화·발표·교육 인터랙티브 화이트보드 | 작화 튜토리얼 녹화, 음성+펜 동기화, 수업 모드 | TimelineGraph + WebCodecs + annotation | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | AFFiNE | 문서와 무한 캔버스를 연결하는 로컬 우선 워크스페이스 | 스크립트 문서↔보드 양방향 연결 | Lexical/ProseMirror + LeaferJS + local-first | 오픈소스 구조 참고 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Heptabase | 카드·화이트보드 기반 지식 조직 | 세계관 카드, 연구 노트, 참조 연결 | KnowledgeGraph + card canvas | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무한 캔버스·노트 | Muse | 공간적 보드와 카드 기반 사고 | 레퍼런스·노트·작업물을 공간적으로 묶는 Desk | ReferenceGraph + spatial canvas | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무한 캔버스·노트 | Kami | 웹 PDF 주석·교육 협업 | PDF 원고 검수, 과제·리뷰 워크플로 | PDF.js + Vello annotation + ReviewGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Xodo | PDF 읽기·주석·양식·서명 | 출판 교정, 계약·피드백 문서 | PDF.js/MuPDF adapter + annotation layer | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무한 캔버스·노트 | Drawboard PDF | 펜 중심 PDF 검토와 측정 | 원고/도면 펜 검수, 실제 치수 측정 | PDF renderer + calibrated ruler + ink | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Graphite | 레이어 UI와 비파괴 노드 그래프가 같은 문서의 두 표현, Rust/WASM 메시지 코어 | Tool↔Node 이중 편집, 절차 패턴, 파라메트릭 외관, 데이터 기반 그래픽 | Graphene-inspired ProceduralGraph + Vello/CanvasKit | Apache 코드·아키텍처 채택 후보 | Apache-2.0; 전체 편입보다 격리된 graph runtime 권장 | A | https://graphite.rs/features/ |
| 제품·서비스 | 절차·벡터·문서 | Figma | 컴포넌트·변수·Auto Layout·협업·Dev Mode | ComponentGraph, VariableGraph, ConstraintLayout, 디자인 시스템 | Vello/CanvasKit + Taffy/Cassowary + Loro | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 절차·벡터·문서 | Adobe Illustrator | 정밀 벡터·Appearance·패턴·브러시·메시·라이브 효과 | 벡터 AppearanceGraph, 아트/패턴 브러시, Image Trace | Vello + CanvasKit PathEffect + VTracer/geometry | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 절차·벡터·문서 | Inkscape | 오픈 SVG 편집, 필터·클론·라이브 패스 효과 | SVG round-trip, LPE 유사 노드, 클론·심볼 | resvg + Vello + geometry WASM | 오픈소스 기능 참고 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Affinity Designer | 벡터·픽셀 Persona 전환과 고성능 편집 | 벡터/래스터 문맥 전환, 비파괴 효과 | Shared DocumentGraph + engine islands | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Boxy SVG | 웹 표준 SVG 중심 편집 | SVG-native mini workspace | resvg + Vello + DOM/SVG serializer | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Vectr | 간단한 웹 벡터 디자인·공유 | 초보용 벡터 Quick Mode | Vello Lite + simple inspector | UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 절차·벡터·문서 | SVG-Edit / Method Draw | 가벼운 오픈 SVG 편집기 | 임베드 가능한 SVG 도구와 테스트 기준 | SVG adapter + resvg | 오픈소스 구조 참고 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | LeaferJS / Leafer Editor | 대규모 인터랙티브 레이어, 편집·멀티선택·변형, 구조화 장면 트리 | 레퍼런스·다이어그램·템플릿 작업면, AI가 조작 가능한 scene tree | LeaferJS adapter + CreatorProjectGraph | 직접 채택 후보 | MIT 여부·플러그인별 라이선스 고정 | A | https://www.leaferjs.com/ |
| 제품·서비스 | 절차·벡터·문서 | js-draw | 스타일러스·터치·무한 확대, 부분 획 지우개, SVG 저장, 협업 | 가벼운 주석·노트·벡터 자유곡선 작업면 | js-draw adapter + SVG/CRDT bridge | 직접 채택 후보 | 라이선스 및 SVG subset 확인 | A | https://github.com/personalizedrefrigerator/js-draw |
| 제품·서비스 | 절차·벡터·문서 | Canvas Editor (Hufe921) | Canvas/SVG 기반 픽셀 정밀 리치 텍스트·페이지·표·수식·폼 | 스크립트·출판·신청서·대본·보고서 작업면 | Canvas Editor adapter + HarfBuzz/ICU4X + ExportGraph | 직접 채택/분리 작업면 후보 | MIT; CJK·인쇄 품질·IME 회귀시험 필요 | A | https://github.com/Hufe921/canvas-editor |
| 제품·서비스 | 절차·벡터·문서 | PowerPoint | 마스터·레이아웃·Morph·발표자 보기·차트·도형·녹화 | PresentationSurface, SlideMaster, MorphGraph, Presenter Mode | CanvasKit/Vello + TimelineGraph + PptxGenJS/export service | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 절차·벡터·문서 | Keynote | 정교한 모션·발표 UX와 레이아웃 | 고품질 슬라이드 모션·카메라 연출 | TimelineGraph + Vello/CanvasKit | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Google Slides | 웹 협업·댓글·발표·간단 접근성 | 브라우저 발표·실시간 공동 편집 | PresentationSurface + Loro + WebRTC optional | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Canva | 템플릿·자산·간편 애니메이션·매직 리사이즈·대량 제작 | TemplateGraph, Brand Kit, 멀티포맷 파생, Bulk Create | CanvasKit + TemplateGraph + DataBindingGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 절차·벡터·문서 | Adobe Express | 간편 템플릿·영상·소셜 출력 | Quick Publish, 플랫폼별 크기와 자동 변환 | TemplateGraph + ExportGraph + media timeline | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Scribus | 오픈소스 DTP·페이지·인쇄 출력 | Page/Spread, 마스터, 프리플라이트, PDF 출력 | CanvasKit + HarfBuzz + LittleCMS + PDF engine | 오픈소스 기능 참고 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 절차·벡터·문서 | Adobe InDesign | 전문 페이지 레이아웃·스타일·책·데이터 병합 | 출판 페이지, 스타일 시스템, 책·목차·Preflight | LayoutIR + HarfBuzz/ICU4X + PDF export | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 절차·벡터·문서 | Marq / Lucidpress | 브랜드 템플릿과 권한형 편집 | 브랜드 잠금, 역할별 편집 가능 영역 | TemplateGraph + permission constraints | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 절차·벡터·문서 | VistaCreate | 소셜 템플릿·간단 애니메이션 | 소셜 배너·카드뉴스 템플릿 모드 | TemplateGraph + timeline presets | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 페인팅·애니메이션 | Clip Studio Paint | 웹툰·만화 특화 브러시·벡터·톤·말풍선·3D·애니메이션 | Comic Workspace, 벡터 선화, 참조 레이어 채우기, 톤, 소재, 3D | Vello + Hokusai + WebGPU + Three.js | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 페인팅·애니메이션 | Adobe Photoshop | 레이어·마스크·Smart Object·Smart Filter·액션·고급 색보정 | EffectGraph, SmartAsset, AutomationGraph, 선택·리터칭 | CanvasKit + WebGPU + OpenCV + PSD adapters | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 페인팅·애니메이션 | Krita | 브러시 엔진 다양성·Wraparound·Assistant·애니메이션 | 브러시 프리셋 연구, 도우미, 타일링 패턴, 애니메이션 | Krita GPL clean-room + Hokusai/WebGPU | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 페인팅·애니메이션 | Procreate | 직관적 제스처·Brush Studio·고성능 모바일 페인팅 | 태블릿 제스처, Brush Studio, QuickShape, 타임랩스 | WebGPU + Adaptive UI + BrushGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Adobe Fresco | 래스터·벡터·라이브 브러시 결합 | 벡터+수채/유화 하이브리드 브러시 | Vello + WetMedia + Hokusai | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Corel Painter | 자연매체와 방대한 브러시 변형 | 브러시모·종이·안료·재질 프리셋 | XPBD + WetMedia + procedural textures | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Rebelle | 물·안료·종이 기반 사실적 수채·유화 | 수채 확산·건조·경계 농축·임파스토 | WebGPU fluid + spectral pigment + height tiles | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | ArtRage | 직관적인 실제 미술도구 메타포 | 팔레트나이프·튜브 물감·캔버스 질감 UI | WetMedia + tactile tool UI | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | ibisPaint | 모바일 중심 대규모 브러시·작화 영상·소셜 학습 | 모바일 Quick Bar, 브러시 검색, 과정 공유 | Adaptive Mobile UI + StrokeReplay | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | MediBang Paint | 클라우드 소재·만화 제작·팀 기능 | 웹툰 소재·폰트·팀 프로젝트 | AssetVault + ComicGraph + collaboration | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | FireAlpaca | 가볍고 단순한 만화/페인팅 워크플로 | 저사양 Lite profile | CanvasKit/PixiJS Lite | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Autodesk SketchBook | 간결한 도구 UI와 펜 중심 조작 | 펜 디스플레이 Minimal workspace | Vello/WebGPU + radial puck UI | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Infinite Painter | 모바일 페인팅과 자연스러운 브러시·도구 | 모바일 고급 페인팅 profile | WebGPU + gesture-first UI | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Aseprite | 픽셀 정밀 애니메이션·팔레트·타임라인 | Pixel Workspace, indexed color, tags, tileset | WebGPU integer grid + palette engine | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 페인팅·애니메이션 | Pixelorama | 오픈소스 픽셀아트·애니메이션 | 픽셀 작업면·스프라이트·타일맵 | WebGPU pixel backend + timeline | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Piskel | 웹 기반 스프라이트와 애니메이션 GIF | Quick Sprite workspace | WebGPU/Canvas2D pixel lite + GIF/APNG | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 페인팅·애니메이션 | Brush Ninja | 가입 없는 간단 프레임 애니메이션 | Quick Flipbook mode | CanvasKit + simple timeline | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Wick Editor | 벡터 애니메이션·인터랙티브 오브젝트·코드 | Timeline+State Machine+버튼·간단 게임 콘텐츠 | Vello/CanvasKit + QuickJS sandbox + TimelineGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | OpenToonz | 스캔·벡터/래스터 애니메이션·노드 효과 | Xsheet, cleanup, camera, FX schematic | TimelineGraph + EffectGraph; GPL 참고 | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Synfig | 벡터 기반 자동 보간 애니메이션 | 파라메트릭 벡터 애니메이션 | Vello + TimelineGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Pencil2D | 가벼운 전통 프레임 애니메이션 | 초보 Flipbook workspace | CanvasKit + onion skin | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Rive | 벡터 애니메이션·상태 머신·런타임 상호작용 | Interactive Animation Surface, state machine | Rive runtime adapter + InteractionGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 페인팅·애니메이션 | Live2D Cubism | 2D 캐릭터 파라미터 변형·리깅 | 2D puppet rig, 표정·포즈 파라미터 | Custom mesh deformation + TimelineGraph | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | Spine | 2D 본 애니메이션·메시 변형 | 스켈레탈 리깅·스킨·이벤트 | Spine runtime benchmark; own skeletal IR | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 페인팅·애니메이션 | LottieFiles | 벡터 모션 자산·미리보기·협업 | Lottie asset pipeline, 검사·최적화 | ThorVG/Velato/Skottie | 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Tooning Editor | 캐릭터·웹툰형 콘텐츠 제작의 쉬운 템플릿 | CharacterActor, SceneTemplate, 웹툰 컷 제작 | ComicGraph + CharacterGraph + TemplateGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Tooning 3D Studio | 3D 캐릭터·장면을 콘텐츠 제작에 연결 | PoseStage, 3D Scene presets, 2D 출력 | Three.js + VRM + Rapier + line passes | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Toon Boom Storyboard Pro | 스크립트·패널·카메라·애니매틱·오디오의 전문 통합 | Script→Shot→Panel→Animatic, 카메라·타이밍 | StoryGraph + TimelineGraph + WebCodecs | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Boords | 그리드·샷리스트·스크립트·프레임 편집과 공유 검토 | 다중 보기, 스크립트 자동 프레임, 사용자 정의 필드, 애니매틱 | StoryGraph + ReviewGraph + media timeline | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Wonder Unit Storyboarder | 빠른 프레임 작성·메타데이터·Photoshop 왕복·애니매틱 | Quick storyboard, shot metadata, frame round-trip | StoryboardSurface + PSD/image links | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Celtx | 스크립트에서 샷·스토리보드·촬영 계획 연결 | ScriptGraph, shot tags, production lists | ProseMirror/Lexical + StoryGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Plottr | 시각 타임라인·장면 카드·플롯라인·스토리 바이블 | PlotGraph, character/location bible, series view | KnowledgeGraph + card timeline | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | World Anvil | 세계관 문서·지도·타임라인·관계형 지식 | WorldBible, map pins/layers, timeline, entity links | KnowledgeGraph + map canvas | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Storyboard That | 템플릿 기반 교육용 스토리보드 | 빠른 캐릭터·배경·대사 구성 | TemplateGraph + CharacterActor | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Pixton | 캐릭터 기반 교육용 만화 제작 | 포즈·표정·장면·수업용 만화 | CharacterGraph + template scene | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Comic Life | 사진·말풍선·패널 중심 만화 레이아웃 | Photo-comic workspace, lettering presets | CanvasKit + ComicLayoutGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | MakeBeliefsComix | 간단한 캐릭터·말풍선 만화 제작 | 접근성 높은 Quick Comic mode | TemplateGraph + asset library | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Comipo | 3D 캐릭터를 활용한 만화 제작 | 3D pose-to-panel workflow | VRM/Three.js + panel rendering | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Vyond | 캐릭터 템플릿 기반 비즈니스 애니메이션 | 장면·캐릭터·자동 립싱크·타임라인 | CharacterGraph + TimelineGraph + TTS | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Animaker | 템플릿형 애니메이션·캐릭터·영상 | 영상 템플릿·장면 자동화 | TemplateGraph + media timeline | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | StoryboardHero | AI 보조 스토리보드와 제작 관리 | 비파괴 AI shot suggestion, 인간 승인 | AIEditNode + StoryGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Kitsu | 애니메이션·VFX 제작 추적 | 에셋/샷/태스크/리뷰 상태 | ProductionGraph + task tracker | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Autodesk ShotGrid | 샷·에셋·버전·리뷰 중심 제작 관리 | ProductionGraph, dependency, review versions | Production DB + ReviewGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | ftrack | 미디어 제작 계획·리뷰·승인 | 작업 배정·버전·고객 리뷰 | ProductionGraph + review portal | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 스토리·웹툰·프리프로덕션 | Notion / Coda | 문서·데이터베이스·자동화 기반 제작 위키 | StoryBible/Production database, templates, automation | Lexical/ProseMirror + SQLite/Loro | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | PureRef | 항상 위·클릭 통과·투명 오버레이·이미지 그룹·노트·GIF 프레임 | ReferenceDesk, tracing overlay, global picker, grouped refs | LeaferJS/PixiJS + desktop/PWA overlay bridge | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://www.pureref.com/handbook/ |
| 제품·서비스 | 레퍼런스·자산관리 | Eagle | 태그·색상 검색·스마트 폴더 중심의 시각 자산 관리 | AssetVault, color/visual search, smart collections | SQLite WASM + perceptual hash + embeddings optional | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://en.eagle.cool/ |
| 제품·서비스 | 레퍼런스·자산관리 | Milanote | 이미지·영상·폰트·색·오디오·문서가 섞인 제작 보드 | Moodboard, shot list, call sheet, worldbuilding board | LeaferJS + AssetGraph + KnowledgeGraph | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://milanote.com/ |
| 제품·서비스 | 레퍼런스·자산관리 | Are.na | 블록·채널·연결 기반 지식 큐레이션 | Reference channels, provenance, public/private collections | KnowledgeGraph + web clipper | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://help.are.na/ |
| 제품·서비스 | 레퍼런스·자산관리 | Cosmos | 출처 중심 시각 북마크와 색·키워드·이미지 검색 | Visual search, source lineage, shared collections | AssetVault + CLIP embedding optional + provenance | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://www.cosmos.so/ |
| 제품·서비스 | 레퍼런스·자산관리 | Pinterest | 대규모 시각 발견과 보드 | 추천을 분리한 레퍼런스 수집·보드 UX | Web clipper + board graph; 외부 API/권리 주의 | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | VizRef | 태블릿용 레퍼런스 보드 | 펜 디스플레이/태블릿 레퍼런스 전용 레이아웃 | ReferenceDesk adaptive UI | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 레퍼런스·자산관리 | Kuadro | 데스크톱 다중 레퍼런스 창 | 떠 있는 레퍼런스·화면 배치 | PWA/window management adapter | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 레퍼런스·자산관리 | BeeRef | 오픈소스 이미지 레퍼런스 보드 | 로컬 레퍼런스 장면 파일 | ReferenceDesk + local asset packs | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | ShotDeck | 영화 스틸 기반 촬영·조명·색 레퍼런스 | Shot reference taxonomy, camera/light tags | ReferenceGraph + shot metadata | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | Flim.ai | 영상 프레임 검색형 시각 레퍼런스 | 장면·색·구도 검색 UX | visual embedding search; 상용 벤치마크 | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 레퍼런스·자산관리 | Raindrop.io | 태그·컬렉션·전체 텍스트 검색 북마크 | 외부 레퍼런스 클리핑과 읽기 목록 | Browser extension + ReferenceGraph | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | Adobe Bridge | 파일 메타데이터·미리보기·배치 관리 | 로컬 파일 인덱스·메타데이터·배치 변환 | File System Access + SQLite + wasm-vips | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | Pixave | 시각 자료 컬렉션·태그 관리 | 자산 폴더·태그·미리보기 UX | AssetVault | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 레퍼런스·자산관리 | digiKam | 오픈소스 사진 DAM·태그·중복·얼굴 관리 | 대규모 자산 인덱싱·중복 탐지 | SQLite/DuckDB + perceptual hash | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | XnView MP | 광범위 이미지 포맷 브라우징·배치 변환 | 외부 포맷 ingestion·썸네일·배치 작업 | wasm-vips/image codecs + job queue | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | Allusion | 오픈소스 시각 자산 라이브러리 | 로컬 참조 이미지 태그·컬렉션 | AssetVault open-source reference | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | TagSpaces | 로컬 우선 파일 태그·노트 | 파일 시스템 비침투형 태그와 오프라인 인덱스 | OPFS/File System Access + SQLite | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 레퍼런스·자산관리 | Hydrus Network | 고급 태그·중복·대규모 미디어 라이브러리 | 강력한 태그 관계·중복 그룹·필터링 | AssetGraph + perceptual hashes | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 레퍼런스·자산관리 | Openverse | 오픈 라이선스 미디어 검색 | 라이선스 인지형 외부 자산 검색 | AssetConnector + RightsGraph | 기능·UX 또는 API 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://openverse.org/ |
| 제품·서비스 | 포즈·연습 | PoseMy.Art | 브라우저 포즈·다중 인물·카메라·조명·OBJ, depth/canny/normal/OpenPose 출력 | PoseStage, AI/lineart용 보조 패스, 저장 카메라 | Three.js + VRM + Rapier + render passes | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://posemy.art/ |
| 제품·서비스 | 포즈·연습 | Magic Poser | 물리 인형식 포즈·방대한 포즈·소품·조명 | 터치 기반 IK pose, 포즈 프리셋 | Three.js + IK + Rapier | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://magicposer.com/ |
| 제품·서비스 | 포즈·연습 | JustSketchMe | 웹 포즈·모델·소품·조명 | 빠른 인체/동물/소품 포즈 레퍼런스 | Three.js + pose library | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://justsketch.me/ |
| 제품·서비스 | 포즈·연습 | Posemaniacs | 다양한 인체 포즈와 해부학 연습 | 해부학 레이어·연습 세션 | PracticeLab + licensed/reference assets | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 포즈·연습 | Quickposes | 타이머 기반 제스처 드로잉 | Timed Practice, 랜덤 세션, 통계 | PracticeGraph + timer + reference deck | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 포즈·연습 | Line of Action | 인물·동물·손발·얼굴·환경 연습과 class mode | 워밍업→긴 포즈→휴식의 수업 모드 | PracticeGraph + adaptive sessions | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://line-of-action.com/ |
| 제품·서비스 | 포즈·연습 | SketchDaily References | 주제별 랜덤 드로잉 레퍼런스 | 연습 주제·랜덤 참조 | ReferenceDeck + PracticeLab | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 포즈·연습 | AdorkaStock | 작가용 포즈 사진 아카이브 | 포즈 태그·다인 상호작용 참고 | Rights-aware reference connector | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 포즈·연습 | Character Design References | 캐릭터 디자인·의상·표정 레퍼런스 | 캐릭터 설계 보드 템플릿 | ReferenceDesk + CharacterBible | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 포즈·연습 | Body Visualizer | 수치 기반 체형 시각화 | 체형 파라미터·실루엣 생성 | Parametric body model | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 포즈·연습 | Easy Pose | 모바일 3D 포즈 도구 | 태블릿 포즈 조작 UX | PoseStage mobile profile | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 포즈·연습 | DesignDoll | 비율·관절·카메라를 정밀 조절하는 3D 마네킹 | 파라메트릭 체형·관절 제한 | Parametric rig + IK | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 포즈·연습 | Manikin | 간단 포즈 마네킹 | 초보용 빠른 포즈 모드 | PoseStage Lite | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 포즈·연습 | SetPose | 웹 3D 포즈 편집 | 링크 기반 포즈 공유 | Pose serialization + share links | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 포즈·연습 | Croquis Cafe | 고품질 인체 드로잉 세션 참고 | PracticeLab 콘텐츠 편성 방식 | 외부 콘텐츠 권리 확인 | 기능·교육 UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 색상·폰트 | Coolors | 빠른 팔레트 생성·이미지 추출·접근성·시각화 | PaletteLab, 잠금 색상, 이미지 팔레트, 현재 장면 미리보기 | Color.js/Culori + WebGPU palette preview | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://coolors.co/ |
| 제품·서비스 | 색상·폰트 | Adobe Color | 색상 조화·대비 AA/AAA·색각 시뮬레이션·그라데이션 추출 | Harmony wheel, accessibility, gradient extraction | Color.js/Culori + ContrastGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://color.adobe.com/ |
| 제품·서비스 | 색상·폰트 | Huemint | 사용 맥락별 팔레트 생성과 색 조합 대비 행렬 | UI/일러스트/브랜드별 팔레트 추천 | local heuristic/ONNX optional + ContrastGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://huemint.com/ |
| 제품·서비스 | 색상·폰트 | Colormind | 딥러닝 기반 응집력 있는 팔레트 | 참조 기반 무드 팔레트 | ONNX model alternative; 서비스 직접 의존 금지 | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | http://colormind.io/ |
| 제품·서비스 | 색상·폰트 | Paletton | 색상 휠과 조화 규칙 | 정통 색조화 프리셋 | Color.js | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | Color Hunt | 큐레이션 팔레트 탐색 | 팔레트 커뮤니티·즐겨찾기 | Palette Marketplace | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | ColorSpace | 그라데이션·팔레트 생성 | 배경·UI 그라데이션 레시피 | Color.js + gradient editor | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 색상·폰트 | Leonardo Color | 접근 가능한 색상 스케일·대비 기반 디자인 토큰 | 동적 디자인 토큰과 대비 보장 | ContrastGraph + VariableGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | OKLCH tools | 지각 균일 색상 조정과 gamut 경고 | OKLCH picker, gamut map, HDR/SDR preview | Culori/Color.js + ICC pipeline | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | Khroma | 사용자 취향 학습형 색상 조합 | 개인 팔레트 추천·금지 색상 | local preference model | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 색상·폰트 | Happy Hues | 실제 UI 화면에서 팔레트 미리보기 | 작품·웹툰·슬라이드에 팔레트 적용 시뮬레이션 | Template preview renderer | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 색상·폰트 | ColorBox | 파라미터 기반 색상 스케일 | 절차형 색상 토큰 생성 | VariableGraph + color curves | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 색상·폰트 | Contrast Grid | 모든 전경/배경 조합 대비 행렬 | 말풍선·텍스트·UI 접근성 검사 | ContrastGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | Google Fonts | 방대한 웹폰트와 언어 지원 | 폰트 검색·언어별 fallback·subset | Fontique/HarfBuzz + font registry | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://fonts.google.com/ |
| 제품·서비스 | 색상·폰트 | Fontshare | 무료 글꼴 큐레이션 | 상업 사용 가능한 폰트 탐색 | Font Registry + RightsGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | Font Squirrel | 라이선스 필터 기반 무료 폰트 | 폰트 권리 확인·웹폰트 변환 | RightsGraph + font ingest | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 색상·폰트 | FontBase | 폰트 미리보기·활성화·컬렉션 | 프로젝트별 폰트 세트와 미리보기 | FontVault + local access | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 3D·배경·지도 | Blender | 모델링·스컬프·Geometry Nodes·Grease Pencil·애니메이션·렌더 | DCC 기준선, procedural geometry, 3D→2D | Three.js + Manifold + node graph + Blender bridge | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 3D·배경·지도 | SketchUp | 직관적 push/pull·건축 모델링·3D Warehouse | Room Builder, inference/snap, component assets | Three.js + parametric solids + asset connector | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 3D·배경·지도 | Spline | 협업 웹 3D·상태·이벤트·물리·인터랙션 | Interactive 3D Surface, state/event graph | Three.js/Babylon + InteractionGraph + Rapier | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 3D·배경·지도 | Vectary | 웹 3D 디자인·제품 시각화·임베드 | 간편 3D 조명·재질·웹 배포 | Three.js + template scene | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Three.js Editor | 웹 3D 장면 편집기 기준 코드 | Scene Inspector, outliner, transform UI | Three.js direct | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Babylon.js Sandbox/Editor | glTF 검사·WebXR·PBR 장면 | 3D asset validator, WebXR preview | Babylon adapter optional | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Floorplanner | 2D/3D 평면도·가구·다층·고해상도 출력 | FloorplanGraph, 자동 벽/방, 2D↔3D | replicad/OpenCascade + Three.js | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://floorplanner.com/ |
| 제품·서비스 | 3D·배경·지도 | Planner 5D | 사진/평면도→3D, 방대한 가구, 4K·AR/VR | AI-assisted room reconstruction, furniture layout | OpenCV/ONNX + Three.js + constraints | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://planner5d.com/ |
| 제품·서비스 | 3D·배경·지도 | RoomSketcher | 평면도와 홈 디자인·고품질 3D | 치수 기반 룸 빌더와 카메라 프리셋 | CAD sketch + Three.js | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | HomeByMe | 인테리어 설계·제품 카탈로그·렌더 | 제품 배치·스타일 보드 | SceneGraph + asset catalogs | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Homestyler | 웹 인테리어와 사진형 렌더 | 실내 장면 템플릿·재질 교체 | Three.js + path-traced/cloud optional | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Coohom | 대규모 인테리어 자산과 빠른 렌더 | 상용 공간 제작 UX | SceneGraph + asset streaming | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Sweet Home 3D | 오픈소스 평면도·가구·3D 미리보기 | 오프라인 룸 편집 구조 | CAD/scene reference | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Live Home 3D | 다층 건축·지형·인테리어 | 건축 장면·층·지형 구조 | SceneGraph + parametric building | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 3D·배경·지도 | Inkarnate | 지도 자산·스탬프·브러시·레이어·마스크·필터 | Scene Stamp, terrain brush, clip mask, map styles | WebGPU brush + asset stamping + Vello labels | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://inkarnate.com/ |
| 제품·서비스 | 3D·배경·지도 | Dungeon Scrawl | 가입 없는 빠른 던전 지도·등각 모드·PDF 출력 | 절차적 방/통로, isometric scene | Grid/graph generator + Vello | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://www.dungeonscrawl.com/ |
| 제품·서비스 | 3D·배경·지도 | DungeonFog | 웹 배틀맵·조명·자산 | 탑다운 장면·벽·시야·라이트 | Scene2D + visibility graph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Dungeon Alchemist | 절차·AI 보조 맵과 자동 가구 배치 | 규칙 기반 배경 자동 구성 | constraint solver + asset stamps | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Wonderdraft | 판타지 월드맵·지형·심볼 | 세계 지도·라벨·경로 | Procedural terrain + Vello labels | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Dungeondraft | 배틀맵·벽·문·재질 | 실내 탑다운 배경 작업면 | Tile/room graph + assets | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | MapChart | 영역 선택형 지도 색칠 | 세계관·통계 지도 | SVG maps + DataBindingGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Blockbench | 저폴리·복셀·애니메이션·텍스처 | 스타일화 3D·픽셀 텍스처·리그 | Three.js + pixel texture workspace | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Tinkercad | 브라우저 Boolean 기반 쉬운 3D·전자 회로 | 초보형 3D primitive builder | Manifold + simple constraints | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | FreeCAD | 오픈소스 파라메트릭 CAD | FeatureTree, sketch constraints, dimensions | OpenCascade/replicad + constraint solver | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 3D·배경·지도 | Onshape | 웹 네이티브 파라메트릭 CAD·협업 | 브랜치형 CAD 문서, 실시간 협업 | CADFeatureIR + Loro + server kernels optional | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Poly Haven | CC0 HDRI·PBR 텍스처·3D 모델, 가입·페이월 없음 | CC0 Asset Connector, HDRI/재질/모델 원클릭 설치 | AssetVault + glTF/KTX2 pipeline | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://polyhaven.com/ |
| 제품·서비스 | 무료·공개 자산 | ambientCG | 대규모 CC0 PBR 재질·HDRI·모델·데칼 | 재질·지형·데칼 검색과 채널 매핑 | AssetVault + PBR channel packer | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://ambientcg.com/ |
| 제품·서비스 | 무료·공개 자산 | Kenney | CC0 2D·3D·UI·오디오·모듈러 키트 | 스타일화 자산·입력 아이콘·모듈러 씬 | AssetVault + kit assembler | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://kenney.nl/assets |
| 제품·서비스 | 무료·공개 자산 | Sketchfab | 대규모 3D 뷰어·모델 마켓, 자산별 라이선스 | 3D 검색·미리보기·라이선스 필터 | glTF connector + RightsGraph | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://sketchfab.com/ |
| 제품·서비스 | 무료·공개 자산 | OpenGameArt | 오픈 라이선스 2D·3D·오디오 | 게임·웹툰 효과 자산 검색 | AssetConnector + RightsGraph | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Quaternius | 무료 스타일화 3D 팩 | 배경·소품 빠른 구성 | glTF asset packs | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Blend Swap | Blender 장면·모델 공유 | Blender bridge용 자산 | Blender ingest + RightsGraph | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | CGTrader Free | 무료 3D 모델 필터 | 모델 검색·품질 검사 | AssetConnector + validation | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무료·공개 자산 | TurboSquid Free | 무료 상용 3D 모델 필터 | 모델 ingest·라이선스 검사 | AssetConnector | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무료·공개 자산 | Free3D | 다양한 무료 3D 파일 | 레거시 3D 포맷 ingest 테스트 | Assimp/WASM or server converter | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 무료·공개 자산 | OpenClipart | 공개 벡터 클립아트 | SVG 장식·교육 자산 | SVG connector + resvg | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | unDraw | 일관된 스타일의 오픈 일러스트 | 프레젠테이션·문서 삽화 | SVG recolor + component assets | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | OpenMoji | 오픈 이모지 SVG | 말풍선·스티커·아이콘 | SVG asset pack | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Noto Emoji | 광범위 문자·이모지 자산 | 다국어 이모지·스티커 | Font/SVG asset pipeline | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 무료·공개 자산 | Font Awesome | 아이콘 생태계 | UI·콘텐츠 아이콘 | SVG/icon font registry | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 무료·공개 자산 | Heroicons | 간결한 오픈 SVG 아이콘 | UI·인포그래픽 아이콘 | SVG registry | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Material Symbols | 가변 아이콘 폰트 | UI 아이콘과 가변 굵기 | font variation pipeline | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 무료·공개 자산 | Lucide | 오픈 아이콘 세트 | 플러그인·도구 아이콘 | SVG registry | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Freesound | 커뮤니티 오디오 자산, 개별 라이선스 | 애니매틱·효과음 검색 | AudioAsset connector + RightsGraph | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 무료·공개 자산 | Pixabay Assets | 이미지·영상·음악·효과음 | 프로토타입용 멀티미디어 자산 | AssetConnector + rights metadata | API/자산 커넥터 또는 기능 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Frame.io | 프레임/범위 댓글·주석·비교·버전·승인·리뷰 링크 | ReviewTheater, overlay/difference compare, version stack, approval | Proxy renderer + Vello annotations + ReviewGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://help.frame.io/ |
| 제품·서비스 | 검토·승인 | SyncSketch | 펜·레이저·도형·압력/속도 dynamics, onion skin whiteboard, 영상/음성 채팅 | 검토 전용 펜 툴바, accidental edit 방지, annotation copy/frame offset | Vello annotation + TimelineGraph + WebRTC | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://support.syncsketch.com/ |
| 제품·서비스 | 검토·승인 | Filestage | 버전 비교·자동 텍스트 diff·리뷰 그룹·감사 PDF | 다단계 리뷰·승인·감사 보고서 | ReviewGraph + text diff + audit export | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A | https://help.filestage.io/ |
| 제품·서비스 | 검토·승인 | Wipster | 영상 검토·승인·팀 워크플로 | 미디어 리뷰 링크·버전 | ReviewGraph + WebCodecs proxy | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Ziflow | 엔터프라이즈 proofing·자동화·승인 | 역할·단계·조건부 승인 | Workflow engine + ReviewGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Krock.io | 애니메이션·비디오 제작 보드와 검토 | 스토리보드·버전·팀 리뷰 | ProductionGraph + ReviewGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 검토·승인 | GoVisually | 이미지·PDF·영상 검토와 비교 | 고객 링크·주석·승인 | ReviewPortal | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Pastel | 웹사이트 위 시각 피드백 | 배포된 인터랙티브 콘텐츠 주석 | DOM snapshot + annotation overlay | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | MarkUp.io | URL·이미지·PDF·영상 마크업 | 외부 결과물 검토 링크 | ReviewPortal + web capture | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Dropbox Replay | 영상·오디오·이미지 동기화 리뷰 | 클라우드 파일 기반 리뷰 | ReviewConnector | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Vimeo Review | 영상 타임코드 피드백 | 애니매틱·영상 승인 | ReviewConnector + timeline comments | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 검토·승인 | Kollaborate | 미디어 버전·검토·워크플로 | 후반 제작 검수 | ProductionGraph + ReviewGraph | 기능·UX 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | C |  |
| 제품·서비스 | 배포·현지화 | WEBTOON CANVAS | 세로 스크롤 웹툰 업로드와 플랫폼 규격 | long-strip slicing, episode metadata, preview/preflight | ExportGraph + platform preset | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Tapas | 웹툰·웹소설 에피소드 퍼블리싱 | 다중 플랫폼 에피소드 패키지 | PublishGraph + metadata | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | pixiv | 일러스트·만화·시리즈 공개 | 작품 묶음·태그·다국어 메타데이터 | PublishConnector | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | ArtStation | 포트폴리오·프로젝트·프로세스 공개 | Portfolio package, breakdown sheets | PublishGraph + asset derivatives | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Behance | 프로젝트 케이스 스터디 | 작업 과정·섹션·임베드 | CaseStudy generator | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | DeviantArt | 아트 커뮤니티·갤러리·커미션 | 작품 공개·권한·워터마크 | PublishConnector + watermark | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Gumroad | 디지털 자산·브러시·템플릿 판매 | Export package, license metadata, product preview | Marketplace package generator | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Ko-fi | 후원·커미션·디지털 판매 | 커미션 전달 패키지 | Publish/commission workflow | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Patreon | 멤버십 콘텐츠 배포 | 티어별 export·watermark·release schedule | PublishGraph + access policy | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Substack | 뉴스레터·연재 콘텐츠 | 웹툰/제작기 뉴스레터 패키지 | HTML/email export | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Crowdin | 번역 메모리·문맥·검수·다국어 협업 | 대사·UI·말풍선 현지화 워크플로 | LocalizationGraph + XLIFF/JSON | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Lokalise | 제품·콘텐츠 현지화와 디자인 연결 | 문자열·스크린샷 문맥·번역 QA | LocalizationGraph + screenshot context | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Smartcat | 번역·용어·검수 자동화 | 웹툰 번역·용어집·검수 | LocalizationGraph + glossary | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 배포·현지화 | Phrase | 소프트웨어·콘텐츠 현지화 플랫폼 | 프로젝트별 번역 버전·자동화 | Localization connector | 플랫폼·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | Kapwing | 웹 영상·자막·템플릿·협업 | Quick Video, 자동 리사이즈·자막·소셜 출력 | WebCodecs + Mediabunny + TemplateGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | VEED | 웹 영상 편집·자막·녹화 | 간편 영상/애니매틱 편집 | WebCodecs + media timeline | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | Descript | 텍스트 기반 영상·오디오 편집 | 대본 기반 오디오/영상 컷, transcript sync | Speech-to-text + TimelineGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | DaVinci Resolve / Fusion | 편집·색보정·노드 합성·오디오 | 고급 Timeline, node compositing, color page | EffectGraph + media timeline; 데스크톱 bridge | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 미디어·오디오 | After Effects | 모션 그래픽·표현식·컴포지팅 | MotionGraph, expressions, track mattes, precomp | TimelineGraph + QuickJS expressions + WebGPU | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 미디어·오디오 | Cavalry | 절차형 2D 모션·복제·데이터 애니메이션 | procedural motion, data-driven graphics | Graphite-like node graph + TimelineGraph | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | Natron | 오픈소스 노드 합성 | VFX node compositor 기준 | EffectGraph + image sequence | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | Blender Video Sequence Editor | 3D와 영상 편집 연결 | 3D render→animatic/video 통합 | Blender bridge + media timeline | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | Audacity | 오픈소스 파형 편집·효과 | 대사·효과음 편집 UX | WebAudio/WaveSurfer + offline audio worker | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 미디어·오디오 | Ocenaudio | 간단한 오디오 편집·미리보기 | Quick Audio mode | WebAudio + waveform | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | WaveSurfer.js | 웹 파형·영역·타임라인 | 오디오 주석·립싱크·대사 타이밍 | WaveSurfer adapter | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 미디어·오디오 | Mediabunny | 브라우저 미디어 컨테이너·변환 라이브러리 | MP4/WebM ingest/export, frame pipeline | Mediabunny + WebCodecs | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 미디어·오디오 | FFmpeg.wasm | 광범위 코덱·필터 폴백 | 미지원 포맷 변환·배치 처리 | FFmpeg worker dynamic load | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 미디어·오디오 | Remotion | React 기반 프로그래매틱 영상 | 데이터 기반 영상·템플릿 렌더 | React/TimelineGraph + server renderer optional | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 미디어·오디오 | OBS Studio | 장면·소스·녹화·스트리밍 | 라이브 드로잉·발표 장면, 가상 카메라 | WebRTC/WebCodecs + desktop bridge | 기능·워크플로 벤치마크 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Airtable | 데이터베이스형 제작 관리와 뷰 | Asset/shot/task database, forms | SQLite/DuckDB + DataBindingGraph | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Notion | 문서·DB·위키·템플릿 | Production wiki, story bible | Lexical/ProseMirror + DB | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Coda | 문서와 앱형 자동화 | 제작 문서+버튼+자동화 | DataBindingGraph + Workflow engine | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Google Sheets | 범용 표·공동 데이터 | 대량 템플릿 데이터 원본 | CSV/Sheets connector + TemplateGraph | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Datawrapper | 차트 제작·출판 | 간단 데이터 시각화 작업면 | Vega/ECharts + export | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Flourish | 스토리형·애니메이션 데이터 시각화 | 인터랙티브 인포그래픽 | Vega/D3 + TimelineGraph | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | RAWGraphs | 오픈 데이터→비정형 차트 | 실험 시각화 템플릿 | D3/Vega | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Observable | 코드·데이터·시각화 노트북 | creative coding/data art workspace | QuickJS/JS sandbox + Vega/D3 | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Mermaid | 텍스트→다이어그램 | 스크립트·제작 흐름 자동 도식화 | Mermaid + ELK | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 데이터·자동화 | Cytoscape.js | 대규모 그래프 시각화·상호작용 | 관계도·의존성·스토리 그래프 | Cytoscape adapter | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 데이터·자동화 | ELK.js | 제약 기반 자동 그래프 배치 | 컷 흐름·노드·프로덕션 파이프 자동 배치 | ELK worker | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 데이터·자동화 | n8n | 시각 자동화 워크플로 | 출고·백업·알림·자산 변환 자동화 | AutomationGraph + webhook connectors | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | Node-RED | 노드형 이벤트·장치 자동화 | 라이브 이벤트·센서·방송 연동 | AutomationGraph | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | B |  |
| 제품·서비스 | 데이터·자동화 | GitHub Actions | 재현 가능한 빌드·검증·출고 | plugin/build/test/export CI | CI templates | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 제품·서비스 | 데이터·자동화 | DuckDB-WASM | 브라우저 분석형 SQL | 대규모 자산·텔레메트리·프로덕션 분석 | DuckDB worker | 기능 또는 직접 엔진 후보 | 상용/배포 조건은 구현 직전 재확인 | A |  |
| 엔진·라이브러리·공개코드 | 입력 | Pointer Events Level 3 | pressure·tilt·twist·coalesced·predicted·raw update | 원시 펜 입력 기준 | Web API | A | W3C 표준 | A | https://www.w3.org/TR/pointerevents3/ |
| 엔진·라이브러리·공개코드 | 입력 | pointer-tracker | pointer lifecycle와 고해상도 expanded samples | 입력 수집 어댑터 | TS/JS | A | Apache-2.0 | A | https://github.com/GoogleChromeLabs/pointer-tracker |
| 엔진·라이브러리·공개코드 | 입력 | Pressure.js | Force Touch·구형 pressure API 추상화 | 레거시 fallback | JS | B | MIT | B | https://github.com/stuyam/pressure |
| 엔진·라이브러리·공개코드 | 입력 | Wacom Signature SDK JS samples | signature/device capture 예제 | 장치 진단 참고 | JS | B | MIT(샘플) | B | https://github.com/Wacom-Developer/sdk-for-signature-js |
| 엔진·라이브러리·공개코드 | 입력 | amoshydra/draw | pen/touch pressure drawing 예제 | 경량 입력 참고 | JS/Canvas | B | MIT | B | https://github.com/amoshydra/draw |
| 엔진·라이브러리·공개코드 | 보정 | stroke-stabilizer | 필터 체인·One Euro·endpoint·prediction·Catmull-Rom | 보정 알고리즘 소스·검증 | TS/JS | A | MIT | A | https://github.com/usapopopooon/stroke-stabilizer |
| 엔진·라이브러리·공개코드 | 보정 | lazy-brush | lazy radius와 friction | 긴 선·보정 모드 | JS | A | MIT | A | https://github.com/dulnan/lazy-brush |
| 엔진·라이브러리·공개코드 | 보정 | Signature Pad | velocity 기반 variable-width Bézier | 압력 없는 입력 fallback | TS/JS | A | MIT | A | https://github.com/szimek/signature_pad |
| 엔진·라이브러리·공개코드 | 보정 | Atrament | adaptive smoothing·pressure·draw/fill/erase | bitmap brush 참고·경량 fallback | JS/Canvas | A | MIT | A | https://github.com/jakubfiala/atrament |
| 엔진·라이브러리·공개코드 | 기하 | Perfect Freehand | pressure-aware stroke outline | 벡터 잉크 외곽선 | TS/JS | A | MIT | A | https://github.com/steveruizok/perfect-freehand |
| 엔진·라이브러리·공개코드 | 기하 | freedraw | Perfect Freehand의 Rust 포트 | WASM 중심 outline 후보 | Rust | A | MIT | A | https://github.com/ducflair/freedraw |
| 엔진·라이브러리·공개코드 | 기하 | fit-curve | polyline→cubic Bézier fitting | 사후 편집 중심선 | JS | A | MIT | A | https://github.com/soswow/fit-curve |
| 엔진·라이브러리·공개코드 | 기하 | smooth-fit-curve | fit-curve 현대 TS fork | 타입 안전 fitting 대안 | TS | B | MIT | B | https://github.com/Bunny-Editor/smooth-fit-curve |
| 엔진·라이브러리·공개코드 | 기하 | simplify-js | 고속 polyline simplification | 포인트 수 축소 | JS | A | BSD-2-Clause | A | https://github.com/mourner/simplify-js |
| 엔진·라이브러리·공개코드 | 기하 | Bezier.js | Bezier 길이·projection·split·offset | 곡선 분석·편집 | JS | A | MIT | A | https://github.com/Pomax/bezierjs |
| 엔진·라이브러리·공개코드 | 기하 | Kurbo | Bézier/path/affine/stroke geometry | Vello 앞 기하 코어 | Rust | A | MIT OR Apache-2.0 | A | https://github.com/linebender/kurbo |
| 엔진·라이브러리·공개코드 | 기하 | Paper.js | path Boolean·hit test·smooth·simplify | 편집·Boolean 어댑터 | JS/Canvas | A | MIT | A | https://github.com/paperjs/paper.js |
| 엔진·라이브러리·공개코드 | 기하 | flatten-js | 2D geometry·intersection·Boolean | trim·지우개·스냅 | JS | A | MIT | A | https://github.com/alexbol99/flatten-js |
| 엔진·라이브러리·공개코드 | 기하 | Clipper2 | robust clipping·offsetting | outline cleanup·offset | C++/C#/Delphi | B | BSL-1.0 | B | https://github.com/AngusJohnson/Clipper2 |
| 엔진·라이브러리·공개코드 | 기하 | polygon-clipping | Martinez polygon Boolean | 브라우저 Boolean fallback | JS | B | MIT | B | https://github.com/mfogel/polygon-clipping |
| 엔진·라이브러리·공개코드 | 기하 | earcut | 빠른 polygon triangulation | WebGL/Vello 보조 tessellation | JS | A | ISC | A | https://github.com/mapbox/earcut |
| 엔진·라이브러리·공개코드 | 기하 | Lyon | GPU path tessellation | 대체 tessellator·검증 | Rust | B | MIT OR Apache-2.0 OR MPL-2.0 | B | https://github.com/nical/lyon |
| 엔진·라이브러리·공개코드 | 렌더 | Vello | GPU compute 중심 2D vector renderer | 주력 vector scene | Rust/wgpu | A | MIT OR Apache-2.0 | A | https://github.com/linebender/vello |
| 엔진·라이브러리·공개코드 | 렌더 | Vello Hybrid | CPU path + GPU raster/composition | 브라우저 기본 후보 | Rust/wgpu/WebGL | A | MIT OR Apache-2.0 | A | https://github.com/linebender/vello |
| 엔진·라이브러리·공개코드 | 렌더 | Vello CPU | CPU/SIMD renderer | export·fallback·golden test | Rust/WASM | A | MIT OR Apache-2.0 | A | https://github.com/linebender/vello |
| 엔진·라이브러리·공개코드 | 렌더 | Peniko | brush·gradient·image·blend primitives | Vello paint model | Rust | A | MIT OR Apache-2.0 | A | https://github.com/linebender/peniko |
| 엔진·라이브러리·공개코드 | 렌더 | tiny-skia | 작고 빠른 CPU rasterizer | CPU fallback 비교 | Rust | B | BSD-3-Clause | B | https://github.com/RazrFalcon/tiny-skia |
| 엔진·라이브러리·공개코드 | 렌더 | Blend2D | JIT CPU vector rasterization | native/server 비교 backend | C++ | B | Zlib | B | https://github.com/blend2d/blend2d |
| 엔진·라이브러리·공개코드 | 렌더 | femtovg | GPU anti-aliased vector drawing | WebGL/native 대안 연구 | Rust/OpenGL | B | MIT | B | https://github.com/femtovg/femtovg |
| 엔진·라이브러리·공개코드 | 렌더 | CanvasKit | Skia canvas/path/text와 software fallback | 호환·출력 대안 | WASM/WebGL | B | BSD-3-Clause/Skia notices | B | https://skia.org/docs/user/modules/canvaskit/ |
| 엔진·라이브러리·공개코드 | 렌더 | regl-gpu-lines | GPU instanced screen-space lines | WebGL 선 fallback 연구 | JS/WebGL | B | MIT | B | https://github.com/rreusser/regl-gpu-lines |
| 엔진·라이브러리·공개코드 | 렌더 | webgpu-instanced-lines | WebGPU instanced lines | 특수 대량 선 backend 참고 | TS/WebGPU | B | MIT | B | https://github.com/rreusser/webgpu-instanced-lines |
| 엔진·라이브러리·공개코드 | 렌더 | regl-line2d | join·dash·float64 GPU line | WebGL 절차선 참고 | JS/WebGL | B | MIT | B | https://github.com/gl-vis/regl-line2d |
| 엔진·라이브러리·공개코드 | 스타일 | Rough.js | hand-drawn/sketchy geometry | 스케치 스타일 plugin | JS/Canvas/SVG | A | MIT | A | https://github.com/rough-stuff/rough |
| 엔진·라이브러리·공개코드 | 자연매체 | Hokusai | .myb·tile surface·smudge·spectral mixing·다양한 inputs | 주력 자연매체 runtime | Rust/WASM | A | MIT OR Apache-2.0 | A | https://github.com/reearth/hokusai |
| 엔진·라이브러리·공개코드 | 자연매체 | libmypaint | MyPaint 공식 brush engine | 기준선·선택형 자체 WASM | C | A | ISC | A | https://github.com/mypaint/libmypaint |
| 엔진·라이브러리·공개코드 | 자연매체 | mypaint-brushes | 검증된 MyPaint preset | 초기 preset과 parity corpus | Brush data | A/B | CC0 raw data / packaging 별도 | B | https://github.com/mypaint/mypaint-brushes |
| 엔진·라이브러리·공개코드 | 자연매체 | brushlib-wasm | libmypaint Emscripten port | 권리 확인 전 평가용 | C/WASM | D | 명시 확인 필요 | B | https://github.com/eliot-akira/brushlib-wasm |
| 엔진·라이브러리·공개코드 | 자연매체 | p5.brush | custom tips·watercolor-like fill·hatching·vector field·pressure | 절차 브러시·prototype | JS/WebGL2 | A/B | MIT | B | https://github.com/acamposuribe/p5.brush |
| 엔진·라이브러리·공개코드 | 자연매체 | Ezu | Hokusai 구동 typed node DAG와 painterly ops | BrushGraph·effect graph 설계 참고 | Rust/WASM | A | MIT OR Apache-2.0 | A | https://github.com/reearth/ezu |
| 엔진·라이브러리·공개코드 | 참고앱 | Krita | 다양한 전문 brush engine | 행동 사양·회귀 목표 | C++/Qt | C | GPL-3.0-or-later | B | https://invent.kde.org/graphics/krita |
| 엔진·라이브러리·공개코드 | 참고앱 | OpenToonz | animation drawing·palette·MyPaint integration | 파일 단위 감사 후 부분 참고 | C++/Qt | B/C | Modified BSD + 폴더별 상이 | B | https://github.com/opentoonz/opentoonz |
| 엔진·라이브러리·공개코드 | 참고앱 | Pencil2D | bitmap/vector animation drawing | 행동 사양·타임라인 참고 | C++/Qt | C | GPL-2.0 | B | https://github.com/pencil2d/pencil |
| 엔진·라이브러리·공개코드 | 참고앱 | Graphite | node-based vector+raster nondestructive editor | BrushGraph·문서 구조 | Rust | A/B | Apache-2.0 | B | https://github.com/GraphiteEditor/Graphite |
| 엔진·라이브러리·공개코드 | 참고앱 | Lorien | pressure strokes·infinite canvas·SuperEraser | stroke 저장·벡터 지우개 참고 | Godot | A/B | MIT | B | https://github.com/mbrlabs/Lorien |
| 엔진·라이브러리·공개코드 | 참고앱 | Pixelorama | pixel/custom/random brush·patterns·symmetry | 픽셀 브러시 UX | Godot | A/B | MIT | B | https://github.com/Orama-Interactive/Pixelorama |
| 엔진·라이브러리·공개코드 | 참고앱 | miniPaint | 브라우저 레이어·필터 편집기 | 웹 도구·패널 참고 | JS/Canvas | A/B | MIT | B | https://github.com/viliusle/miniPaint |
| 엔진·라이브러리·공개코드 | 참고앱 | JS Paint | 고전 paint tool UX | 도구 반응·픽셀 UX | JS/Canvas | A/B | MIT | B | https://github.com/1j01/jspaint |
| 엔진·라이브러리·공개코드 | 참고앱 | ChickenPaint | 웹 painting application | 성능·기능 비교 | JS/WebGL | C | GPL-3.0 | B | https://github.com/thenickdude/chickenpaint |
| 엔진·라이브러리·공개코드 | 색 | Spectral.js | Kubelka-Munk 계열 spectral pigment mixing | palette·LUT·reservoir 혼색 | JS | A | MIT | A | https://github.com/rvanwijnen/spectral.js |
| 엔진·라이브러리·공개코드 | 색 | Color.js | 다양한 color spaces·gamut·DeltaE | 색상 관리·품질 비교 | JS | A | MIT | A | https://github.com/color-js/color.js |
| 엔진·라이브러리·공개코드 | 색 | Culori | 가벼운 색 변환·보간·difference | UI와 runtime 유틸 | JS | A | MIT | A | https://github.com/Evercoder/culori |
| 엔진·라이브러리·공개코드 | 텍스처 | FastNoiseLite | OpenSimplex·Perlin·Cellular·domain warp | paper/tip/granulation/noise | C++/Rust/JS/GLSL 등 | A | MIT | A | https://github.com/Auburn/FastNoiseLite |
| 엔진·라이브러리·공개코드 | 텍스처 | simplex-noise.js | dependency-free seeded 2D/3D/4D noise | 경량 JS preview | JS | A | MIT | A | https://github.com/jwagner/simplex-noise.js |
| 엔진·라이브러리·공개코드 | 텍스처 | poisson-disk-sampling | variable-density Poisson disk | stamp·spray·fiber 분포 | JS | A | MIT | A | https://github.com/kchapelier/poisson-disk-sampling |
| 엔진·라이브러리·공개코드 | 텍스처 | texture-synthesis | example-based texture synthesis/inpainting | 오프라인 paper/tip 생성 | Rust | B(archive) | MIT OR Apache-2.0 | B | https://github.com/EmbarkStudios/texture-synthesis |
| 엔진·라이브러리·공개코드 | 벡터화 | VTracer | raster→vector tracing | 스캔 tip·라인 벡터화 | Rust/WASM | B | MIT | B | https://github.com/visioncortex/vtracer |
| 엔진·라이브러리·공개코드 | 습식매체 | InkWash | mobile/fixed pigment·wetness·Stable Fluids·Beer-Lambert | 클린룸 동작 사양 | HTML/WebGL2 | D | 라이선스 없음 확인 | B | https://github.com/johnowhitaker/inkwash |
| 엔진·라이브러리·공개코드 | 습식매체 | writing-on-water | watercolor simulation demo | 수채 알고리즘 참고 | JS/WebGL | B | MIT | B | https://github.com/arsena21/writing-on-water |
| 엔진·라이브러리·공개코드 | 습식매체 | mikerkoval/FluidSimulation | Stable Fluids compute·ping-pong | 속도·압력장 골격 | WebGPU/WGSL | A/B | MIT | B | https://github.com/mikerkoval/FluidSimulation |
| 엔진·라이브러리·공개코드 | 습식매체 | jeantimex/fluid | SPH·PIC/FLIP 2D/3D | 두꺼운 유체·droplet 연구 | WebGPU/WGSL | B | MIT | B | https://github.com/jeantimex/fluid |
| 엔진·라이브러리·공개코드 | 습식매체 | WebGL-Fluid-Simulation | 모바일 친화 fluid simulation | WebGL2 fallback | WebGL | A/B | MIT | B | https://github.com/PavelDoGreat/WebGL-Fluid-Simulation |
| 엔진·라이브러리·공개코드 | 습식매체 | webgl-water | water ripple·caustics | water drop·표면 효과 참고 | WebGL | B | MIT | B | https://github.com/evanw/webgl-water |
| 엔진·라이브러리·공개코드 | 습식매체 | kishimisu WebGPU Fluid | Stable Fluids demo | 코드 감사 후 참고 | WebGPU/WGSL | D/B | 확인 필요 | B | https://github.com/kishimisu/WebGPU-Fluid-Simulation |
| 엔진·라이브러리·공개코드 | 물리 | Rapier | 고성능 2D/3D rigid body·collision·joints | 장면·오브젝트 물리 | Rust/WASM | A | Apache-2.0 | A | https://github.com/dimforge/rapier |
| 엔진·라이브러리·공개코드 | 물리 | JoltPhysics.js | soft body·cloth·bend·pressure·multithread builds | 선택형 고급 천·soft body | C++/WASM | B | MIT | B | https://github.com/jrouwe/JoltPhysics.js |
| 엔진·라이브러리·공개코드 | 물리 | Floaty | PBD/PBF·soft body/fluid coupling·rayon | 브러시모·입자 solver 참고 | Rust/WASM | B | MIT | B | https://github.com/matsuoka-601/Floaty |
| 엔진·라이브러리·공개코드 | 물리 | verlet-js | Verlet constraints·rope·cloth | 초기 브러시모 prototype | JS | B | MIT | B | https://github.com/subprotocol/verlet-js |
| 엔진·라이브러리·공개코드 | 물리 | Verly.js | Verlet engine·cloth·rope·tearing | 리본·헤어 UX prototype | JS | B | MIT | B | https://github.com/anuraghazra/Verly.js |
| 엔진·라이브러리·공개코드 | 물리 | Matter.js | 2D rigid body web engine | 단순 object/particle prototype | JS | B | MIT | B | https://github.com/liabru/matter-js |
| 엔진·라이브러리·공개코드 | 파티클 | pixi-particle-system | 현대적 TS particle system·editor | WebGL fallback·UI 참고 | TS/PixiJS | B | MIT | B | https://github.com/danielpokladek/pixi-particle-system |
| 엔진·라이브러리·공개코드 | 파티클 | particle-emitter | 검증된 PixiJS emitter | preset 형식·fallback | TS/PixiJS | B | MIT | B | https://github.com/pixijs-userland/particle-emitter |
| 엔진·라이브러리·공개코드 | 파티클 | particle-emitter-editor | WYSIWYG emitter editor | Particle Brush editor 참고 | JS/PixiJS | B | MIT | B | https://github.com/pixijs-userland/particle-emitter-editor |
| 엔진·라이브러리·공개코드 | 파티클 | three.quarks | GPU instancing·curve params·3D VFX | 3D 효과 브러시 | TS/Three.js | A/B | MIT | B | https://github.com/Alchemist0823/three.quarks |
| 엔진·라이브러리·공개코드 | 파티클 | three.quarks-editor | VFX editor | 곡선·emitter UI 참고 | TS/React | B | MIT | B | https://github.com/Alchemist0823/three.quarks-editor |
| 엔진·라이브러리·공개코드 | 파티클 | RevoltFX | nested emitters·effect sequences | 연쇄 효과 preset | TS/PixiJS | B | MIT | B | https://github.com/bma73/revolt-fx |
| 엔진·라이브러리·공개코드 | 파티클 | tsParticles | 다양한 shape·interaction·emitter | 배경/효과 참고 | TS/Canvas/WebGL | B | MIT | B | https://github.com/tsparticles/tsparticles |
| 엔진·라이브러리·공개코드 | 2D GPU | PixiJS | 고성능 sprite·texture·filter ecosystem | 과도기 합성·plugin fallback | TS/WebGL/WebGPU | A/B | MIT | B | https://github.com/pixijs/pixijs |
| 엔진·라이브러리·공개코드 | 2D GPU | pixi-viewport | drag·pinch·zoom·deceleration·snap | 캔버스 camera UX 참고 | TS/PixiJS | B | MIT | B | https://github.com/pixijs-userland/pixi-viewport |
| 엔진·라이브러리·공개코드 | 2D 객체 | Fabric.js | object selection·transform·serialization | 오브젝트 편집 참고 | TS/Canvas | B | MIT | B | https://github.com/fabricjs/fabric.js |
| 엔진·라이브러리·공개코드 | 2D 객체 | Konva | scene graph·transformer·events | selection·snap·guide 참고 | TS/Canvas | B | MIT | B | https://github.com/konvajs/konva |
| 엔진·라이브러리·공개코드 | 2D 기하 | Two.js | renderer-agnostic vector API | 간단 vector plugin 참고 | JS/SVG/Canvas/WebGL | B | MIT | B | https://github.com/jonobr1/two.js |
| 엔진·라이브러리·공개코드 | 창작 코딩 | Pts.js | geometry·creative coding·interpolation | 절차 브러시 prototype | TS/Canvas/SVG/WebGL | B | Apache-2.0 | B | https://github.com/williamngan/pts |
| 엔진·라이브러리·공개코드 | 이미지 | Photon | 고성능 image processing | tip·filter·worker fallback | Rust/WASM | A | Apache-2.0 | A | https://github.com/silvia-odwyer/photon |
| 엔진·라이브러리·공개코드 | 이미지 | OpenCV.js | threshold·morphology·contour·distance transform | tip cleanup·selection·SDF | C++/WASM | A/B | Apache-2.0 | B | https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html |
| 엔진·라이브러리·공개코드 | 이미지 | fast_image_resize | 고속 고품질 resize·mip | atlas·thumbnail·mip | Rust/WASM SIMD | A | MIT OR Apache-2.0 | A | https://github.com/Cykooz/fast_image_resize |
| 엔진·라이브러리·공개코드 | 이미지 | wasm-vips | streaming parallel image pipeline | 대량 brush pack 처리 | C/C++/WASM | B | MIT + LGPL third parties | B | https://github.com/kleisauke/wasm-vips |
| 엔진·라이브러리·공개코드 | 이미지 | resvg-js | 정확한 SVG rasterization·bbox·fonts | SVG tip 처리 | Rust/WASM/Node | B | 프로젝트/상위 라이선스 감사 | B | https://github.com/yisibl/resvg-js |
| 엔진·라이브러리·공개코드 | 그래프 UI | React Flow / xyflow | React node-based UI | BrushGraph editor 주력 | React/TS | A | MIT | A | https://github.com/xyflow/xyflow |
| 엔진·라이브러리·공개코드 | 그래프 UI | Rete.js | dataflow/control-flow visual programming | compiler·plugin 구조 참고 | TS | A/B | MIT | B | https://github.com/retejs/rete |
| 엔진·라이브러리·공개코드 | 그래프 UI | LiteGraph.js | 실행 가능한 node graph와 editor | 경량 graph 포맷 참고 | JS/Canvas | B | MIT | B | https://github.com/jagenjo/litegraph.js |
| 엔진·라이브러리·공개코드 | 그래프 UI | BaklavaJS | typed ports·plugin graph editor | 타입 포트 설계 참고 | TS/Vue | B | MIT | B | https://github.com/newcat/baklavajs |
| 엔진·라이브러리·공개코드 | GPU | wgpu | native+web GPU abstraction | Vello·compute 기반 | Rust/WebGPU | A | MIT OR Apache-2.0 | A | https://github.com/gfx-rs/wgpu |
| 엔진·라이브러리·공개코드 | GPU | gpu-io | GPGPU workflows·physics·particles·image processing | WebGL compute fallback 참고 | JS/WebGL | B | MIT | B | https://github.com/amandaghassaei/gpu-io |
| 엔진·라이브러리·공개코드 | GPU | regl | functional WebGL resource/command abstraction | WebGL 실험·fallback | JS/WebGL | B | MIT | B | https://github.com/regl-project/regl |
| 엔진·라이브러리·공개코드 | 셰이더 | LYGIA | 방대한 granular shader functions | 별도 상업 권리 없이는 코어 제외 | GLSL/HLSL/MSL/WGSL | R | Prosperity + Patron/Commercial | B | https://github.com/patriciogonzalezvivo/lygia |
| 엔진·라이브러리·공개코드 | 셰이더 | glsl-pipeline | multi-pass·double-buffer shader pipeline | WebGL effect prototype | TS/WebGL/Three.js | B | MIT | B | https://github.com/patriciogonzalezvivo/glsl-pipeline |
| 엔진·라이브러리·공개코드 | 비OSS 비교 | Aseprite | pixel art 전문 UX | 비교만 수행 | C++ | E | source-available EULA | B | https://github.com/aseprite/aseprite |
| 엔진·라이브러리·공개코드 | 비OSS 비교 | Mixbox | 자연스러운 pigment mixing | Spectral.js/Hokusai 비교 | 다중 언어 | E/R | 상업/별도 조건 | B | https://github.com/scrtwpns/mixbox |
| 엔진·라이브러리·공개코드 | 고급 잉킹 | Google Ink | Stroke Modeler와 mesh 기반 brush behavior | 최고급 G펜·붓펜·저지연 예측 잉킹 | C++/WASM + WebGPU | B | Apache-2.0 | A | https://github.com/google/ink |
| 엔진·라이브러리·공개코드 | 무한 캔버스 | js-draw | 스타일러스·부분 획 지우개·SVG·협업 | 주석·가벼운 벡터 캔버스 어댑터 | TS/SVG | A | 오픈소스; 버전 고정 필요 | A | https://github.com/personalizedrefrigerator/js-draw |
| 엔진·라이브러리·공개코드 | 2D 인터랙션 | LeaferJS | 대규모 scene tree·편집·viewport·자동 layout | Reference/Diagram/Template 작업면 | TS/Canvas | A | MIT 계열; 플러그인별 확인 | A | https://www.leaferjs.com/ |
| 엔진·라이브러리·공개코드 | 문서 조판 | Canvas Editor | 리치텍스트·페이지·표·수식·폼·인쇄형 레이아웃 | Script/Publishing Surface | TS/Canvas/SVG | A | MIT | A | https://github.com/Hufe921/canvas-editor |
| 엔진·라이브러리·공개코드 | 이미지 편집 | Filerobot Image Editor | 크롭·리사이즈·회전·필터·주석 | Lite image editor와 업로드 전 처리 | React/JS | B | MIT | A | https://github.com/scaleflex/filerobot-image-editor |
| 엔진·라이브러리·공개코드 | 이미지 편집 | TOAST UI Image Editor | 기본 사진 조작·마스크·필터 | 레거시 기능 참고·빠른 PoC | JS/Fabric | B | MIT; 유지보수 감사 | A | https://github.com/nhn/tui.image-editor |
| 엔진·라이브러리·공개코드 | 2D 물리 | Box2D-WASM | 성숙한 2D 강체·관절·충돌 | 말풍선/스티커/소품/만화 오브젝트 물리 | C++/WASM | A | MIT/zlib | A | https://github.com/Birch-san/box2d-wasm |
| 엔진·라이브러리·공개코드 | 2D 물리 | Planck.js | Box2D 계열의 웹 친화적 2D 물리 | 경량 2D 씬·프로토타입 | TS/JS | B | MIT | A | https://piqnt.com/planck.js/ |
| 엔진·라이브러리·공개코드 | 2D 물리 | p2-es | 스프링·모터·제약·충돌의 타입 안전 구현 | 간단 2D 리본/오브젝트 실험 | TS | B | MIT | A | https://github.com/pmndrs/p2-es |
| 엔진·라이브러리·공개코드 | 정밀 시뮬레이션 | MuJoCo WASM | 관절·접촉·정밀 동역학과 공식 WASM API | 정밀 포즈·접촉·로봇/기계 소품 실험실 | C/WASM | R | Apache-2.0 | B | https://github.com/google-deepmind/mujoco |
| 엔진·라이브러리·공개코드 | 3D 물리 | physx-js-webidl | PhysX 5 계열 관절·차량·컨트롤러 | 엔터프라이즈 고급 물리 실험 모듈 | C++/WASM | R | MIT wrapper + PhysX 조건 확인 | B | https://github.com/fabmax/physx-js-webidl |
| 엔진·라이브러리·공개코드 | 3D 물리 | cannon-es | 가벼운 순수 JS 3D 물리 | 빠른 프로토타입·폴백 | TS/JS | C | MIT | B | https://github.com/pmndrs/cannon-es |
| 엔진·라이브러리·공개코드 | 협업 | Loro | 이동 가능한 트리·리스트, time travel, versioning | 레이어·컷·컴포넌트 CRDT 주력 후보 | Rust/WASM/TS | A | MIT | A | https://github.com/loro-dev/loro |
| 엔진·라이브러리·공개코드 | 협업 | Automerge | JSON형 local-first CRDT와 동기화 | 문서/스토리 데이터 대안 | Rust/WASM/JS | B | MIT | A | https://github.com/automerge/automerge |
| 엔진·라이브러리·공개코드 | 데이터 | SQLite WASM | 브라우저 내 메타데이터·검색·저널 | 프로젝트 DB·인덱스 | WASM/OPFS | A | Public domain | A | https://sqlite.org/wasm/ |
| 엔진·라이브러리·공개코드 | 데이터 | DuckDB-WASM | 열 지향 분석 SQL | 자산·성능·프로덕션 분석 | WASM | B | MIT | A | https://github.com/duckdb/duckdb-wasm |
| 엔진·라이브러리·공개코드 | UI | React Aria | 접근 가능한 headless interaction primitives | 키보드·스크린리더·터치 기본기 | React/TS | A | Apache-2.0 | A | https://react-spectrum.adobe.com/react-aria/ |
| 엔진·라이브러리·공개코드 | UI | Radix UI | 메뉴·팝오버·다이얼로그 접근성 primitives | 전문 패널·메뉴 기반 | React/TS | A | MIT | A | https://www.radix-ui.com/ |
| 엔진·라이브러리·공개코드 | UI | Floating UI | 툴팁·팝오버·floating toolbar 위치 | 캔버스 HUD·문맥 패널 | TS | A | MIT | A | https://floating-ui.com/ |
| 엔진·라이브러리·공개코드 | UI | XState | 도구·제스처·워크플로 상태 머신 | ToolController·Review/Publish flows | TS | A | MIT | A | https://stately.ai/docs/xstate |
| 엔진·라이브러리·공개코드 | UI | TanStack Virtual | 대규모 목록 가상화 | 레이어·자산·프리셋 수만 건 | TS/React | A | MIT | A | https://tanstack.com/virtual |
| 엔진·라이브러리·공개코드 | 문서 편집 | Lexical | 확장 가능한 리치 텍스트 편집 | 대본·노트·도움말 편집 | React/TS | A | MIT | A | https://lexical.dev/ |
| 엔진·라이브러리·공개코드 | 문서 편집 | ProseMirror / Tiptap | 구조화 문서·협업·플러그인 | 스토리 바이블·스크립트 대안 | TS/DOM | B | MIT 계열; 확장별 확인 | A | https://prosemirror.net/ |
| 엔진·라이브러리·공개코드 | 그래프 배치 | ELK.js | 복잡한 그래프 자동 배치 | 노드·스토리·생산 흐름 | WASM/JS | A | EPL-2.0 | A | https://github.com/kieler/elkjs |
| 엔진·라이브러리·공개코드 | 그래프 | Cytoscape.js | 대규모 네트워크 시각화·상호작용 | 캐릭터 관계·의존성 | JS/Canvas/WebGL | A | MIT | A | https://js.cytoscape.org/ |
| 엔진·라이브러리·공개코드 | 다이어그램 | Mermaid | 텍스트 기반 다이어그램 | 스크립트→플로우·도움말 도식 | TS/SVG | A | MIT | A | https://mermaid.js.org/ |
| 엔진·라이브러리·공개코드 | 차트 | Vega-Lite | 선언형 데이터 시각화 | 차트·인포그래픽 | JS/Canvas/SVG | A | BSD-3-Clause | A | https://vega.github.io/vega-lite/ |
| 엔진·라이브러리·공개코드 | 차트 | Apache ECharts | 광범위한 인터랙티브 차트 | 대시보드·데이터 아트 | JS/Canvas/SVG | A | Apache-2.0 | A | https://echarts.apache.org/ |
| 엔진·라이브러리·공개코드 | 오디오 | WaveSurfer.js | 파형·영역·타임라인 | 대사·음향 편집 | WebAudio/TS | A | BSD-3-Clause | A | https://wavesurfer.xyz/ |
| 엔진·라이브러리·공개코드 | 미디어 | Mediabunny | 브라우저 컨테이너 demux/mux·변환 | 영상/오디오 ingest·export | TS/WebCodecs | A | MIT | A | https://mediabunny.dev/ |
| 엔진·라이브러리·공개코드 | 플러그인 | Extism | 언어 중립 플러그인·권한·호스트 함수 | 브러시·필터·export 플러그인 샌드박스 | WASM | A | BSD-3-Clause | A | https://extism.org/ |
| 엔진·라이브러리·공개코드 | 플러그인 | QuickJS-WASM | 격리 JavaScript 실행 | 매크로·표현식·자동화 | WASM/JS | B | MIT | A | https://github.com/justjake/quickjs-emscripten |
| 엔진·라이브러리·공개코드 | AI 런타임 | ONNX Runtime Web | 브라우저 모델 추론과 백엔드 선택 | 선택·깊이·선화·인페인팅·업스케일 노드 | WASM/WebGPU/WebNN | A | MIT | A | https://onnxruntime.ai/docs/get-started/with-javascript/web.html |
| 엔진·라이브러리·공개코드 | AI 런타임 | Transformers.js | 브라우저 Transformer 모델 | OCR·태깅·임베딩·텍스트 보조 | JS/WASM/WebGPU | B | Apache-2.0 | A | https://huggingface.co/docs/transformers.js/ |
| 엔진·라이브러리·공개코드 | AI/비전 | MediaPipe Tasks | 포즈·손·얼굴·세그멘테이션 | 포즈 캡처·제스처·가이드 | WASM/WebGL | B | Apache-2.0 | A | https://ai.google.dev/edge/mediapipe/solutions/guide |
| 엔진·라이브러리·공개코드 | 색관리 | LittleCMS WASM | ICC 프로파일 변환 | soft proof·출력 색관리 | C/WASM | A | MIT | A | https://www.littlecms.com/ |
| 엔진·라이브러리·공개코드 | 국제화 | ICU4X | 경량 국제화·분절·locale 데이터 | CJK/RTL/현지화 런타임 | Rust/WASM | A | Unicode-3.0/Apache-2.0 | A | https://github.com/unicode-org/icu4x |
| 엔진·라이브러리·공개코드 | 텍스트 | HarfBuzz | 전문 글리프 shaping | CJK/RTL/복합문자 | C++/WASM | A | MIT | A | https://harfbuzz.github.io/ |
| 엔진·라이브러리·공개코드 | 레이아웃 | Taffy | Flexbox/Grid 레이아웃 | Auto Layout·반응형 템플릿 | Rust/WASM | A | MIT/Apache-2.0 | A | https://github.com/DioxusLabs/taffy |
| 엔진·라이브러리·공개코드 | 제약 | Cassowary/Kiwi | 선형 제약 해결 | 스마트 가이드·레이아웃·CAD 보조 | C++/JS/WASM | B | BSD/MIT 계열 | A |  |

---

# 부록 B. 파일 포맷 313개 전체 상호운용 레지스트리

| 분야 | 포맷/규격 | 확장자 | 가져오기등급 | 내보내기등급 | 브라우저직접경로 | 로컬/서버브리지 | 권장엔진·라이브러리 | 원본·의미보존전략 | 우선순위 | 주의·한계 | CSP전환경로 | 검증전략 | 증거/성숙도 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3D·VRM·CAD·BIM | Autodesk FBX | FBX | F2 | F3 | Three FBXLoader/Assimp WASM | Blender/FBX SDK bridge | Three.js/Babylon/OCCT/Assimp adapters | original FBX + normalized scene + animation | P0 | export는 Blender bridge 권장 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 3D·VRM·CAD·BIM | Blender Project | BLEND | F5 | F4 | thumbnail/metadata | Blender local/server bridge | Three.js/Babylon/OCCT/Assimp adapters | original BLEND + glTF/USD/EXR outputs | P0 | GPL bridge 격리, native parsing 비권장 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 3D·VRM·CAD·BIM | glTF 2.0 / GLB | GLTF/GLB | F1 | F1 | Three.js/Babylon/glTF Transform | Blender validator | Three.js/Babylon/OCCT/Assimp adapters | scene·materials·animation·extensions·original buffers | P0 | 2.1은 2026-08 기준 개발 중이므로 draft flag |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | Stereolithography | STL | F1 | F1 | Three STLLoader/exporter | OpenCascade | Three.js/Babylon/OCCT/Assimp adapters | triangles·units sidecar | P0 | 색·재질 표준화 부족 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | VRM 0.x/1.0 | VRM | F1 | F1 | three-vrm/VRM schema | UniVRM/Blender bridge | Three.js/Babylon/OCCT/Assimp adapters | humanoid·expressions·lookAt·license metadata | P0 | 0.x와 1.0 변환 report |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | Wavefront | OBJ/MTL | F1 | F1 | Three OBJLoader/custom exporter | Assimp/Blender | Three.js/Babylon/OCCT/Assimp adapters | geometry·groups·materials·units sidecar | P0 | rig/animation 없음 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | 3D Manufacturing Format | 3MF | F2 | F2 | 3MF parser/WASM | lib3mf service | Three.js/Babylon/OCCT/Assimp adapters | units·components·materials·metadata | P1 | extensions별 지원 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | Alembic | ABC | F4 | F4 | 없음 | Blender/Alembic service | Three.js/Babylon/OCCT/Assimp adapters | original cache + proxy mesh/animation | P1 | 대용량 cache |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 3D·VRM·CAD·BIM | Biovision Hierarchy | BVH | F1 | F1 | Three BVHLoader | Blender | Three.js/Babylon/OCCT/Assimp adapters | skeleton·motion·frame rate | P1 | retarget metadata 추가 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | Clip Studio 3D Background | CS3S | F3/F5 | F5 | preview/metadata | Clip Studio Modeler bridge | Scene3DIR + original preserve | 원본·scene graph·camera·glTF 변환본 | P1 | 비공개 포맷 | 배경 장면 이식 | 카메라·단위·재질·조명 비교 | 비공개 |
| 3D·VRM·CAD·BIM | Clip Studio 3D Character | CS3C | F3/F5 | F5 | 컨테이너 preview/metadata | Clip Studio Modeler bridge | Scene3DIR + original preserve | 원본·표준 glTF/VRM 변환본·재질 보고서 | P1 | 비공개 포맷 | 3D Migration Center | CSP/CSM 렌더와 silhouette/material diff | 비공개 |
| 3D·VRM·CAD·BIM | Clip Studio 3D Object | CS3O | F3/F5 | F5 | preview/metadata | Clip Studio Modeler bridge | Scene3DIR + original preserve | 원본·glTF 변환·collision/scale metadata | P1 | 비공개 포맷 | 3D Migration Center | AABB·재질·텍스처·단위 비교 | 비공개 |
| 3D·VRM·CAD·BIM | COLLADA | DAE | F2 | F2 | Three ColladaLoader/Assimp | Blender | Three.js/Babylon/OCCT/Assimp adapters | scene·skin·animation·materials | P1 | app별 해석 차이 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | Industry Foundation Classes | IFC | F2 | F2 | web-ifc/WASM | IfcOpenShell | Three.js/Babylon/OCCT/Assimp adapters | BIM entities·properties·units·relations | P1 | geometry cache와 semantic model 분리 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | MaterialX | MTLX | F2 | F2 | MaterialX JS/WASM | MaterialX service | Three.js/Babylon/OCCT/Assimp adapters | node graph·definitions·textures | P1 | renderer-specific nodes fallback |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | MikuMikuDance | PMX/PMD/VMD | F2 | F2 | MMDLoader | Blender MMD tools | Three.js/Babylon/OCCT/Assimp adapters | bones·morphs·physics·motion | P1 | toon material/physics differences |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | Polygon File Format | PLY | F1 | F1 | Three PLYLoader/exporter | Assimp | Three.js/Babylon/OCCT/Assimp adapters | vertex attrs·faces·comments | P1 | binary endian variants |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | SketchUp | SKP | F5 | F4 | preview 제한 | SketchUp SDK/Blender converter | Three.js/Babylon/OCCT/Assimp adapters | original SKP + glTF/DAE proxy | P1 | SDK/라이선스 확인 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 3D·VRM·CAD·BIM | STEP | STEP/STP | F2 | F2 | OpenCascade WASM/replicad | FreeCAD/OCCT | Three.js/Babylon/OCCT/Assimp adapters | exact B-Rep·units·names | P1 | AP203/AP214/AP242 차이 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | Universal Scene Description | USD/USDA/USDC/USDZ | F2 | F2 | usd-wasm/limited USDZ exporter | OpenUSD/Blender | Three.js/Babylon/OCCT/Assimp adapters | composition·variants·materials·original layers | P1 | 브라우저 direct는 subset |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | 3D Studio | 3DS | F2 | F3 | Three TDSLoader/Assimp | Blender | Three.js/Babylon/OCCT/Assimp adapters | geometry·materials·original file | P2 | legacy limits |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 3D·VRM·CAD·BIM | 3D Tiles | B3DM/I3DM/PNTS/3DTILES.JSON | F2 | F2 | Cesium/3D Tiles loaders | 3D Tiles tools | Three.js/Babylon/OCCT/Assimp adapters | tileset hierarchy·geospatial metadata | P2 | legacy/new spec variants |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | 3ds Max | MAX | F5 | F4 | 없음 | 3ds Max/Blender bridge | Three.js/Babylon/OCCT/Assimp adapters | original + glTF/FBX/USD | P2 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 3D·VRM·CAD·BIM | Additive Manufacturing Format | AMF | F1/F2 | F2 | XML parser | PrusaSlicer/FreeCAD bridge | Scene3DIR | mesh·material·units·constellation | P2 | slicer extension | 3D 출력 | schema + mesh validation | 공개 표준 |
| 3D·VRM·CAD·BIM | Cinema 4D | C4D | F5 | F4 | 없음 | Cinema 4D/Cineware/Blender bridge | Three.js/Babylon/OCCT/Assimp adapters | original + FBX/glTF/Alembic | P2 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 3D·VRM·CAD·BIM | IGES | IGES/IGS | F2 | F2 | OpenCascade WASM | FreeCAD/OCCT | Three.js/Babylon/OCCT/Assimp adapters | NURBS/B-Rep·units | P2 | trimmed surface 오류 회귀 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | LAS/LAZ Point Cloud | LAS/LAZ | F2 | F2 | laz-perf WASM | PDAL | Three.js/Babylon/OCCT/Assimp adapters | points·classification·CRS | P2 | 대용량 streaming |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | LightWave Object/Scene | LWO/LWS | F2 | F3 | Assimp/WASM | Blender bridge | Assimp + Three.js | mesh·material·scene hierarchy·원본 보존 | P2 | 버전별 재질 차이 | CSP 3D 사용자의 직접 이식 | vertex/material/camera diff | 성숙한 레거시 포맷 |
| 3D·VRM·CAD·BIM | MagicaVoxel | VOX | F1 | F1 | VOX parser | MagicaVoxel/Blender | Three.js/Babylon/OCCT/Assimp adapters | palette·model chunks·scene | P2 | new chunk variants |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | Maya | MA/MB | F4 | F4 | MA ASCII 제한 parser | Maya/Blender bridge | Three.js/Babylon/OCCT/Assimp adapters | original + USD/FBX/Alembic | P2 | MB 폐쇄 바이너리 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 3D·VRM·CAD·BIM | OpenCascade BREP | BREP | F1 | F1 | OpenCascade WASM | FreeCAD | Three.js/Babylon/OCCT/Assimp adapters | exact topology·geometry | P2 | OCCT version compatibility |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 3D·VRM·CAD·BIM | Rhinoceros 3D | 3DM | F2/F3 | F3 | rhino3dm WASM | Rhino/FreeCAD bridge | rhino3dm + Scene3DIR | NURBS·layers·materials·original | P2 | 플러그인 객체 | 디자인/CAD 사용자 | Rhino reopen + geometry diff | 공개 SDK |
| 3D·VRM·CAD·BIM | Substance Archive | SBSAR | F3/F4 | F4 | WASM runtime 가능성 제한 | Substance engine bridge | MaterialGraph + baked outputs | parameters·presets·baked textures·original | P2 | 런타임 라이선스 | 절차 재질 사용 | parameter sweep/texture diff | 상용 런타임 |
| 3D·VRM·CAD·BIM | VRoid Studio Project | VROID | F5 | F5 | preview/metadata preserve | VRoid export VRM bridge | OpaquePackageStore + VRM | 원본 .vroid + exported VRM + texture links | P2 | 폐쇄 프로젝트 | VRoid 사용자 이식 | VRM avatar visual diff | 폐쇄 |
| 3D·VRM·CAD·BIM | X3D/VRML | X3D/X3DB/WRL | F2 | F3 | X3D parser/Three loader | Blender | Three.js/Babylon/OCCT/Assimp adapters | scene graph·materials·animations | P2 | script nodes sandbox |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 3D·VRM·CAD·BIM | 3D PDF Geometry | U3D/PRC | F3/F4 | F4 | PDF parser + limited geometry | Acrobat/assimp bridge | PDF.js + Scene3DIR | 원본 stream·tessellation·camera | P3 | PRC 복잡 | 3D PDF 자산 | PDF reopen + geometry count | 표준/복잡 |
| 3D·VRM·CAD·BIM | ACIS SAT/SAB | SAT/SAB | F3/F4 | F4 | OpenCascade 일부 변환 | FreeCAD/ODA bridge | OCCT + ToonBridge | B-rep·tessellation·original | P3 | 버전/엔티티 차이 | CAD 사용자 수용 | FreeCAD/ODA reopen | 부분 공개/폐쇄 |
| 3D·VRM·CAD·BIM | CityGML | GML/XML | F2 | F2 | XML streaming parser | GDAL/3DCityDB bridge | CityGraph + Scene3DIR | semantic city objects·CRS·original | P3 | 메모리/LOD | 도시 배경 생성 | schema + LOD geometry | 공개 표준 |
| 3D·VRM·CAD·BIM | Clip Studio Legacy 3D Character | C2FC/C2FR | F4/F5 | F5 | preserve-only | Windows/Intel macOS CSP bridge | preserve + converted glTF | 원본과 변환 결과 묶음 | P3 | 현대 플랫폼 제한 | 레거시 3D 보관/변환 | CSP 지원 환경에서 변환 확인 | 레거시 |
| 3D·VRM·CAD·BIM | E57 Point Cloud | E57 | F4 | F4 | 제한 | PDAL/libE57 | Three.js/Babylon/OCCT/Assimp adapters | original + tiled point proxy | P3 | 대용량·복잡 schema |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 3D·VRM·CAD·BIM | G-code | GCODE/NC | F2 | F2 | text parser/simulator | slicer bridge | ToolpathIR | commands·units·toolpath·original | P3 | 기계별 dialect·안전 | 3D 출력 미리보기 | parser sandbox + path bounds | 공개 관행 |
| 3D·VRM·CAD·BIM | IFC ZIP | IFCZIP | F1/F2 | F2 | ZIP + IFC parser | IfcOpenShell bridge | web-ifc + Scene3DIR | BIM semantics·geometry·original | P3 | 대형 모델 | 건축 배경 | schema + property count | 공개 표준 |
| 3D·VRM·CAD·BIM | JT | JT | F4/F5 | F5 | preserve/preview 제한 | CAD Exchanger/ODA bridge | ToonBridge | 원본·tessellated glTF·assembly tree | P3 | ISO이나 구현 복잡/특허 | 대형 제조 자산 | bridge validator | 복잡한 표준 |
| 3D·VRM·CAD·BIM | MicroStation Design | DGN | F4 | F4 | limited parser | ODA/GDAL bridge | ToonBridge CAD | original + converted DXF/IFC/glTF | P3 | 상용 라이브러리 | 인프라 배경 | ODA reopen | 폐쇄/복잡 |
| 3D·VRM·CAD·BIM | NetImmerse/Gamebryo | NIF | F3/F4 | F4 | niftools parser | Blender/NifSkope bridge | Scene3DIR | mesh·skeleton·material·original | P3 | 게임별 변형·권리 | 레거시 게임 자산 | NifSkope visual | 커뮤니티 구현 |
| 3D·VRM·CAD·BIM | NVIDIA MDL | MDL | F4 | F4 | 없음 | MDL SDK bridge | Three.js/Babylon/OCCT/Assimp adapters | source + MaterialX/PBR approximation | P3 | SDK·라이선스 검토 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 3D·VRM·CAD·BIM | Parasolid | X_T/X_B | F4 | F4 | WASM 직접 구현 비현실적 | licensed kernel/FreeCAD bridge | ToonBridge CAD adapter | 원본 B-rep·tessellation·feature metadata | P3 | 상용 커널 라이선스 | CAD 사용자 자산 수용 | kernel reopen + tessellation diff | 상용/폐쇄 |
| 3D·VRM·CAD·BIM | PCD Point Cloud | PCD | F2 | F2 | custom parser | PCL/PDAL | Three.js/Babylon/OCCT/Assimp adapters | fields·points·metadata | P3 | binary compressed variant |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 3D·VRM·CAD·BIM | Substance Designer Graph | SBS | F4/F5 | F5 | preserve/preview | Substance Automation Toolkit bridge | MaterialGraph placeholder | 원본 graph + baked PBR outputs | P3 | 폐쇄 엔진/라이선스 | 재질 자산 보관 | baked texture diff | 폐쇄 |
| 3D·VRM·CAD·BIM | Substance Painter Project | SPP | F5 | F5 | preview/preserve | Substance Painter export bridge | OpaquePackageStore | 원본 + exported texture sets | P3 | 폐쇄 | 텍스처 프로젝트 보관 | texture set manifest | 폐쇄 |
| 3D·VRM·CAD·BIM | Valve Source Model | SMD/DMX | F2/F3 | F3 | text/binary parser | Blender bridge | Scene3DIR + AnimationIR | skeleton·animation·mesh·original | P3 | DMX variants | 게임 자산 수용 | bone animation diff | 부분 공개 |
| 3D·VRM·CAD·BIM | XNALara Model | XPS/MESH/ASCII | F2/F3 | F3 | community parser/WASM | Blender bridge | Scene3DIR | skeleton·mesh·textures·original | P3 | 라이선스/asset rights | 포즈 자산 수용 | bone/mesh diff | 커뮤니티 포맷 |
| 3D·VRM·CAD·BIM | 六角大王 3D | 6KT/6KH | F3/F4 | F5 | Assimp/커스텀 parser 검토 | CSP/Blender bridge | Assimp + Scene3DIR | 원본·mesh·material·scale 보존 | P3 | 플랫폼/문자 인코딩 차이 | CSP 3D 이식 보조 | CSP import와 geometry diff | 레거시 |
| Office·출판·문서 | Comic Book Archive | CBZ/CBT | F1 | F1 | ZIP/TAR + ComicInfo.xml | 없음 | OOXML/ODF/HTML/PDF adapters | page order·metadata·original images | P0 | CBR는 별도 RAR decoder/bridge |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| Office·출판·문서 | Delimited Data | CSV/TSV | F1 | F1 | Arquero/Papa Parse | 없음 | OOXML/ODF/HTML/PDF adapters | encoding·delimiter·schema sidecar | P0 | 타입 정보 sidecar 필요 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| Office·출판·문서 | Plain Text | TXT | F1 | F1 | TextDecoder/Encoder | 없음 | OOXML/ODF/HTML/PDF adapters | encoding·line endings 감지 | P0 | 서식 없음 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| Office·출판·문서 | PowerPoint Open XML | PPTX/POTX/PPSX | F2 | F2 | OOXML parser + PptxGenJS | LibreOffice/PowerPoint test runner | OOXML/ODF/HTML/PDF adapters | slides·masters·text·shapes·relationships·unknown parts | P0 | import는 자체 parser 필요, PptxGenJS는 주로 export |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Adobe InDesign Markup | IDML | F2 | F2 | ZIP/XML parser | InDesign/Scribus bridge | OOXML/ODF/HTML/PDF adapters | stories·spreads·styles·links·unknown XML | P1 | 고급 layout/plug-in data 제한 | CSP 원고를 출판 조판 워크플로로 연결 | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Comic Book RAR | CBR | F2 | F2 | RAR WASM if license permits | unrar service | OOXML/ODF/HTML/PDF adapters | page images·ComicInfo.xml | P1 | RAR codec 라이선스 검토 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | EPUB 3 | EPUB | F2 | F2 | ZIP + HTML/CSS/SVG parser | Pandoc/Calibre 선택 | OOXML/ODF/HTML/PDF adapters | semantic HTML·nav·metadata·fixed layout | P1 | reading system 차이 시험 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Excel Open XML | XLSX/XLTX | F2 | F2 | SheetJS/OOXML parser | LibreOffice | OOXML/ODF/HTML/PDF adapters | cells·formulas·styles·charts·unknown parts | P1 | 고급 pivot/macro 제한 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Hancom HWP | HWP | F3/F4 | F4 | hwp.js/limited parser | Hancom/LibreOffice bridge | DocumentIR + preserve | text·images·sections·original | P1 | 바이너리·버전·수식 복잡 | 한국 사용자 문서 이식 | Hancom reopen + visual/text diff | 부분 공개 |
| Office·출판·문서 | Hancom HWPX | HWPX | F2 | F2 | ZIP/XML parser | Hancom/LibreOffice bridge | DocumentIR adapter | sections·styles·images·original XML | P1 | 한컴 확장 요소 | 한국 사용자 문서 이식 | schema + Hancom reopen | 공개 XML |
| Office·출판·문서 | HTML/CSS Package | HTML/HTM/CSS | F2 | F2 | DOMParser + CSS parser | Playwright/Pandoc | OOXML/ODF/HTML/PDF adapters | DOM·styles·assets·accessibility metadata | P1 | 스크립트 제거/격리 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Legacy PowerPoint | PPT/POT/PPS | F4 | F4 | 없음 | LibreOffice headless | OOXML/ODF/HTML/PDF adapters | 원본 + PPTX/PDF conversion | P1 | 바이너리 legacy |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| Office·출판·문서 | Markdown/MDX | MD/MDX | F1 | F1 | remark/rehype/MDX parser | Pandoc 선택 | OOXML/ODF/HTML/PDF adapters | source AST·embedded assets 보존 | P1 | MDX 실행 코드는 sandbox |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| Office·출판·문서 | OpenDocument Presentation | ODP/FODP/OTP | F2 | F2 | ODF ZIP/XML parser | LibreOffice | OOXML/ODF/HTML/PDF adapters | styles·masters·objects·unknown XML 보존 | P1 | ODF 1.4 profile tracking |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | OpenDocument Text | ODT/FODT/OTT | F2 | F2 | ODF parser | LibreOffice | OOXML/ODF/HTML/PDF adapters | styles·sections·draw objects 보존 | P1 | 복잡한 매크로/필드 제한 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Word Open XML | DOCX/DOTX | F2 | F2 | OOXML parser + document layout | LibreOffice/Pandoc | OOXML/ODF/HTML/PDF adapters | paragraphs·styles·media·unknown parts | P1 | 페이지 레이아웃은 target-app diff 필요 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | Advanced Comic Book Format | ACBF | F1/F2 | F2 | XML/ZIP parser | ACBF viewer bridge | ComicPublicationIR | pages·frames·text layers·metadata | P2 | viewer 지원 편차 | 디지털 만화 출판 | schema + viewer test | 공개 규격 |
| Office·출판·문서 | Apple Keynote | KEY/KTH | F3 | F4 | package preview/partial parser | LibreOffice/macOS Keynote bridge | OOXML/ODF/HTML/PDF adapters | 원본 + PPTX/PDF export | P2 | 버전별 package 변화 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| Office·출판·문서 | AsciiDoc | ADOC/ASCIIDOC | F1 | F1 | text parser | Asciidoctor bridge | DocumentIR | source·attributes·includes·original | P2 | include sandbox | 기획/도움말 | source round-trip | 공개 |
| Office·출판·문서 | Hancom Show | SHOW | F4/F5 | F5 | preview/preserve | Hancom export PPTX/PDF bridge | PresentationIR + preserve | 원본 + exported PPTX/PDF | P2 | 비공개 | 프레젠테이션 사용자 | Hancom visual compare | 비공개 |
| Office·출판·문서 | LaTeX | TEX/LTX | F1/F2 | F2 | text parser | Tectonic/LaTeX bridge | DocumentIR + MathIR | source·bibliography·assets·render | P2 | arbitrary shell escape 금지 | 논문/수식 문서 | sandbox build + PDF diff | 공개 생태계 |
| Office·출판·문서 | Legacy Excel | XLS/XLT | F4 | F4 | 제한 parser | LibreOffice | OOXML/ODF/HTML/PDF adapters | 원본 + XLSX conversion | P2 | 바이너리 legacy |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| Office·출판·문서 | Legacy Word | DOC/DOT | F4 | F4 | 없음 | LibreOffice/antiword | OOXML/ODF/HTML/PDF adapters | 원본 + DOCX/PDF conversion | P2 | 바이너리 legacy |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| Office·출판·문서 | MHTML Web Archive | MHTML/MHT | F2 | F3 | MIME parser/sanitizer | browser/Playwright bridge | WebSnapshotIR | resources·URL·DOM snapshot·original | P2 | active content sandbox | 레퍼런스 보관 | resource completeness + screenshot diff | 표준 MIME |
| Office·출판·문서 | Mobipocket/Kindle | MOBI/AZW/AZW3/KFX | F3/F4 | F3/F4 | ebook parser subset | Calibre bridge | PublicationIR | text·TOC·images·original | P2 | DRM 파일 처리 금지 | 전자책 사용자 | Calibre reopen + text/TOC diff | 복합/일부 폐쇄 |
| Office·출판·문서 | OpenDocument Spreadsheet | ODS/FODS/OTS | F2 | F2 | ODF parser | LibreOffice | OOXML/ODF/HTML/PDF adapters | cells·formulas·styles 보존 | P2 | 고급 계산 엔진 차이 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| Office·출판·문서 | PowerPoint Macro-enabled | PPTM/POTM/PPSM | F3 | F3 | OOXML parse, macros quarantined | LibreOffice/Office bridge | OOXML/ODF/HTML/PDF adapters | VBA blob 격리 보존 | P2 | 매크로 실행 금지 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| Office·출판·문서 | Rich Text Format | RTF | F2 | F2 | parser/WASM | LibreOffice bridge | DocumentIR | text·styles·images·original | P2 | 고급 필드/개체 | 대사/문서 | LibreOffice reopen | 공개 규격 |
| Office·출판·문서 | Scribus Document | SLA/SLA.GZ | F1/F2 | F2 | XML parser | Scribus bridge | PublicationIR | pages·frames·styles·links·original | P2 | version extensions | 오픈 출판 | Scribus reopen | 공개 소스 |
| Office·출판·문서 | Adobe InDesign Document | INDD | F5 | F5 | preview/preserve | InDesign IDML/PDF bridge | OpaquePackageStore | 원본 + exported IDML/PDF | P3 | 폐쇄 | 출판 프로젝트 보관 | bridge outputs | 폐쇄 |
| Office·출판·문서 | DjVu | DJVU/DJV | F2 | F3 | djvu.js/WASM | DjVuLibre bridge | DocumentPageIR | pages·OCR text·annotations·original | P3 | codec/OCR 차이 | 스캔 자료 | page image/text diff | 공개 구현 |
| Office·출판·문서 | FictionBook | FB2/FB2.ZIP | F1/F2 | F2 | XML parser | Calibre bridge | PublicationIR | structure·metadata·images·original | P3 | CSS 표현 제한 | 소설/전자책 | schema + visual | 공개 규격 |
| Office·출판·문서 | Hancom Cell | CELL | F4/F5 | F5 | preview/preserve | Hancom export XLSX/PDF bridge | SpreadsheetSnapshot + preserve | 원본 + exported XLSX/PDF | P3 | 비공개 | 데이터/차트 자산 | Hancom compare | 비공개 |
| Office·출판·문서 | Jupyter Notebook | IPYNB | F1/F2 | F2 | JSON parser | Jupyter/nbconvert bridge | NotebookIR + DataViz | cells·outputs·attachments·metadata | P3 | 코드 실행은 격리 | 데이터 기반 창작 | schema + output snapshots | 공개 규격 |
| Office·출판·문서 | QuarkXPress | QXP/QXD | F5 | F5 | preview/preserve | Quark export IDML/PDF bridge | OpaquePackageStore | 원본 + standard export | P3 | 폐쇄 | 출판 레거시 | bridge visual | 폐쇄 |
| 네이티브·프로젝트 | Adobe Photoshop Document | PSD | F2 | F2 | @webtoon/psd + ag-psd + CanvasKit composite | 선택형 Photoshop/Krita 검증 runner | @webtoon/psd, ag-psd, wasm-vips | unknown blocks·원본 blob·composite preview 보존 | P0 | 텍스트 EngineData·Smart Object·일부 adjustment는 부분 지원 | CSP에서 PSD로 저장/복제한 파일을 가장 안정적인 구조형 이관 경로로 사용 | CSP와 Photoshop 재개방, 레이어·마스크·텍스트·블렌드 비교 | 성숙한 교환 경로, 일부 고유 레이어는 근사 |
| 네이티브·프로젝트 | Adobe Photoshop Large Document | PSB | F2 | F2 | @webtoon/psd + streaming chunks | Photoshop/Krita bridge | @webtoon/psd, ag-psd, OPFS | 64-bit 크기·원본 청크·레이어 fallback | P0 | 대형 문서는 타일·스트리밍 필수 | 대형 CSP 원고의 PSB 중간 교환 경로 | 64-bit offset·대형 타일·중단 복구·재개방 시험 | 구조형/대형 문서 |
| 네이티브·프로젝트 | Clip Studio Multi-page Management | CMC | F3/F5 | F5 | 관리 폴더·페이지 .clip 목록과 metadata를 안전 분석 | CSP Page Manager/PSD batch export bridge | 자체 CMC manifest adapter + FormatGateway | 원본 관리 폴더 구조·페이지 순서·각 .clip 원본을 통째 보존 | P0 | 페이지 파일을 파일 탐색기에서 임의 교체하지 않도록 읽기 전용 복제 | CSP 프로젝트 폴더 선택 → 페이지 트리 생성 → 각 페이지 변환·상태 표시 | 페이지 수·순서·페이지 링크·누락 파일·CSP 재개방 검증 | 비공개/공식 구조 설명 있음 |
| 네이티브·프로젝트 | Clip Studio Paint Project | CLIP | F3/F5 | F5 | 격리 Worker의 실험 파서 + composite/metadata 추출; 실패 시 원본 보존 | CSP에서 PSD/PSB/PNG/ORA 대체 출력 안내 또는 Local ToonBridge | 자체 clean-room adapter; clip-d(BSD-2) 검토; clipdecode(LGPL) 격리; CanvasKit composite | 원본 .clip/.lip immutable blob + 해석 노드 + composite + opaque payload | P0 | 비공개 포맷. 직접 쓰기·완전 왕복을 주장하지 않으며 버전별 differential corpus 필수 | 파일 드롭 → 안전 분석 → 페이지/레이어/미리보기 복원 → 불확실 객체 표시 → PSD 브리지 제안 | CSP 버전별 golden corpus, composite SSIM/ΔE, 레이어 수·타입·텍스트·타임랩스 차등 검사 | 실험/역공학; production은 preserve-first |
| 네이티브·프로젝트 | ibisPaint Work File | IPV | F2/F3 | F5 | ZIP/binary 분석 가능한 범위 | ibisPaint PSD export bridge | 자체 IPV adapter | 캔버스·레이어·제목·원본 보존 | P0 | 톤·선택 레이어 등 앱 간 의미 차이 | CSP 사용자도 자주 교환하므로 Migration Center 공통 처리 | 레이어 수·톤 rasterization·composite 비교 | 공식 CSP import 지원 |
| 네이티브·프로젝트 | OpenRaster | ORA | F1 | F1 | ZIP/XML + PNG/SVG layer | 불필요 | OpenRaster spec, fflate, PNG/SVG codecs | 레이어·그룹·blend·merged image 보존 | P0 | 지원 범위를 확장 metadata로 명시 | CSP와 Krita/MyPaint 사이의 공개 레이어 교환 보조 경로 | mergedimage·stack.xml·블렌드·마스크 재개방 | 공개 규격 |
| 네이티브·프로젝트 | ToonStudio Open Package | .toonstudio | F0 | F0 | ZIP64/CBOR/OPFS streaming | 선택 없음 | 자체 StudioDocument·Content-addressed store | 완전 의미·자산·원본 외부 파일·버전 보존 | P0 | 공개 schema·migration SDK 제공 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 네이티브·프로젝트 | Aseprite Project | ASE/ASEPRITE | F2 | F2 | binary parser/WASM | Aseprite CLI 선택 | aseprite-format parser, custom adapter | frames·layers·tags·palette·slices 보존 | P1 | tilemap·blend 회귀 필요 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 네이티브·프로젝트 | Clip Studio Name File | CSNF | F4/F5 | F5 | 텍스트·페이지 연결 metadata 가능한 범위 | CSP Story Editor export bridge | 자체 preserve adapter | 원본과 추출 대사를 DialogueGraph에 함께 저장 | P1 | 버전·언어별 사양 확인 필요 | 대사/네임 파일을 StoryRoom으로 이식 | 문장 순서·페이지 연결·줄바꿈 비교 | 비공개 |
| 네이티브·프로젝트 | Clip Studio Paint Legacy Document | LIP | F3/F5 | F5 | CLIP 계열 실험 파서 | CSP Save As .clip/PSD bridge | 동일 CLIP adapter | 원본·composite·해석 노드 보존 | P1 | 구버전 corpus 별도 유지 | LIP를 먼저 .clip 또는 PSD로 변환 권장 | 구버전 앱 재개방·composite diff | 레거시/비공개 |
| 네이티브·프로젝트 | draw.io Diagram | DRAWIO/XML | F2 | F2 | XML parser | draw.io CLI 선택 | mxGraph XML adapter | cells·connectors·styles 보존 | P1 | embedded compressed XML 처리 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 네이티브·프로젝트 | Excalidraw Scene | EXCALIDRAW/JSON | F1 | F1 | JSON direct | 불필요 | Excalidraw schema adapter | elements·bindings·files 보존 | P1 | schema migration 필요 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 네이티브·프로젝트 | GIMP Image | XCF | F3 | F4 | WASM parser 또는 제한 import | GIMP headless/local bridge | libxcf 계열 또는 GIMP | 원본 XCF + flattened preview + layer map | P1 | 완전 write는 GIMP bridge 권장 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 네이티브·프로젝트 | Krita Document | KRA | F2 | F3 | ZIP/XML 직접 부분 import | Krita local/server bridge | fflate, custom KRA adapter, Krita CLI | 원본 KRA + 해석된 layer + preview | P1 | Krita 고유 filter/mask/animation은 bridge 우선 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 네이티브·프로젝트 | Penpot File/API | PENPOT/SVG/JSON | F2 | F2 | Penpot API·SVG | self-host Penpot bridge | Penpot API, SVG adapter | components·tokens·SVG metadata 보존 | P1 | 서버 버전별 API 고정 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 네이티브·프로젝트 | Procreate Artwork | PROCREATE | F5 | F5 | package preview·metadata 제한 | iPad Shortcuts/Procreate export bridge | 원본 보존, PSD/PNG/HEVC export intake | 원본 package + exported PSD/PNG | P1 | 비공개 기능은 preserve-only |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 네이티브·프로젝트 | Sketch Document | SKETCH | F2 | F2 | ZIP/JSON parser | 불필요 | JSZip/fflate, custom Sketch adapter | pages·artboards·symbols·images 보존 | P1 | 버전별 schema adapter 필요 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 네이티브·프로젝트 | Affinity Project | AFPHOTO/AFDESIGN/AFPUB | F5 | F5 | preview 제한 | Affinity export bridge | 원본 보존 + PSD/PDF/SVG import | 원본 package와 표준 export 묶음 | P2 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 네이티브·프로젝트 | ComicStudio Page | CPG | F3/F4 | F5 | 레거시 parser 연구 | CSP bridge | preserve + standard export | 원본·페이지 의미·변환 보고서 | P2 | 레거시 레이어 변환 규칙이 복잡 | CSP 레거시 이전 센터 | CSP 공식 변환 결과와 차등 비교 | 레거시 |
| 네이티브·프로젝트 | ComicStudio Work | CST | F3/F4 | F5 | 관리 구조 분석 | CSP management conversion bridge | preserve + page graph | 원본 작업 파일과 생성 CMC/CLIP 묶음 | P2 | 플랫폼 제한 | CST → CMC/페이지 트리 변환 | 페이지 순서·레이어 변환 비교 | 레거시 |
| 네이티브·프로젝트 | Corel Painter RIFF | RIFF/RIF | F5 | F5 | preview 제한 | Painter export bridge | 원본 보존 + PSD/TIFF | 원본과 변환본 동시 보관 | P2 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 네이티브·프로젝트 | Figma Project | FIG | F5 | F5 | plugin/API JSON import·clipboard SVG | Figma plugin/REST bridge | Figma Plugin API adapter | 원본 .fig 보존 + plugin export snapshot | P2 | 비공개 native format 직접 파싱 비권장 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 네이티브·프로젝트 | IllustStudio Document | XPG | F3/F4 | F5 | 레거시 parser 연구 | Windows/Intel macOS CSP bridge | preserve + standard export | 원본·변환 보고서·표준 결과 보존 | P2 | 플랫폼 제한·텍스트/룰러 차이 | CSP 레거시 이전 센터 | CSP 변환 결과와 비교 | 레거시 |
| 네이티브·프로젝트 | JSON Canvas | CANVAS/JSON | F1 | F1 | JSON direct | 불필요 | JSON Canvas adapter | nodes·edges·positions 보존 | P2 | 그래픽 표현은 ToonSceneIR로 매핑 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 네이티브·프로젝트 | MediBang Project | MDP | F5 | F5 | preview 제한 | MediBang/FireAlpaca export bridge | 원본 보존 + PSD/PNG | 원본과 변환본 동시 보관 | P2 | 포맷 공개성 확인 필요 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 네이티브·프로젝트 | Rebelle Project | REB | F5 | F5 | preview 제한 | Rebelle export bridge | 원본 보존 + PSD/PNG/EXR | 원본과 표준 export 연결 | P2 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 네이티브·프로젝트 | tldraw Scene | TLDR/JSON | F2 | F2 | JSON schema adapter | 불필요 | custom tldraw adapter | shape records·assets·bindings 보존 | P2 | 프로덕션 SDK 라이선스와 파일 schema 분리 검토 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | Animated PNG | APNG | F1 | F1 | APNG parser/WebCodecs where available | FFmpeg | CanvasKit/WebGPU + 해당 codec | frame timing·alpha 보존 | P0 | 일부 앱 호환성 프로필 제공 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | AV1 Image File Format | AVIF | F1 | F1 | browser ImageDecoder + libavif WASM | libavif server | CanvasKit/WebGPU + 해당 codec | bit depth·alpha·CICP/ICC 보존 | P0 | codec/profile feature probe 필수 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | GIF | GIF | F1 | F1 | giflib/gifuct + CanvasKit | FFmpeg/libimagequant | CanvasKit/WebGPU + 해당 codec | palette·frame disposal·timing 보존 | P0 | 색상 256 제한 보고 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | JPEG/JFIF | JPG/JPEG/JFIF | F1 | F1 | browser decoder + libjpeg-turbo/jpegli WASM | OpenImageIO | CanvasKit/WebGPU + 해당 codec | ICC·EXIF·orientation 보존 | P0 | alpha 없음, lossless edit는 native source 유지 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | PNG | PNG | F1 | F1 | Browser ImageDecoder/CanvasKit + png-rs | 없음 | CanvasKit/WebGPU + 해당 codec | alpha·ICC·EXIF/XMP 보존 | P0 | 16-bit·APNG 별도 시험 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | TIFF/BigTIFF | TIF/TIFF/BTF | F2 | F2 | libtiff WASM/UTIF.js | OpenImageIO/libvips | CanvasKit/WebGPU + 해당 codec | multi-page·bit depth·ICC·tags 보존 | P0 | 타일·strip streaming 필요 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | WebP | WEBP | F1 | F1 | browser/WebCodecs + libwebp | FFmpeg | CanvasKit/WebGPU + 해당 codec | ICC/XMP/alpha/animation 보존 | P0 | lossless/lossy/animated profile 분리 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Basis Universal | BASIS | F1 | F1 | BasisU transcoder WASM | BasisU tools | CanvasKit/WebGPU + 해당 codec | compressed texture 원본 보존 | P1 | target GPU format 런타임 선택 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Bitmap | BMP/DIB | F1 | F1 | image-rs/CanvasKit | 없음 | CanvasKit/WebGPU + 해당 codec | pixel·alpha variants 보존 | P1 | legacy header variants |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Camera RAW / DNG | DNG/CR2/CR3/NEF/ARW/RAF/ORF/RW2/PEF | F2 | F3 | LibRaw WASM proxy | LibRaw/OpenImageIO | CanvasKit/WebGPU + 해당 codec | 원본 RAW + develop settings + preview | P1 | export는 DNG 제한 또는 rendered TIFF/EXR |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 래스터·HDR·RAW·텍스처 | DirectDraw Surface | DDS | F2 | F2 | Three.js DDSLoader/tex parser | texconv | CanvasKit/WebGPU + 해당 codec | mipmaps·GPU format 보존 | P1 | GPU compression capability별 transcode |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | HEIF/HEIC | HEIF/HEIC/HIF | F2 | F2 | libheif WASM | libheif/OpenImageIO | CanvasKit/WebGPU + 해당 codec | aux image·depth·metadata 원본 보존 | P1 | HEVC 특허·codec 배포 검토 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | JPEG 2000 | JP2/J2K/JPF/JPX | F2 | F2 | OpenJPEG WASM | OpenJPEG server | CanvasKit/WebGPU + 해당 codec | bit depth·tiles·ICC 보존 | P1 | WASM 크기·성능 고려 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | JPEG XL | JXL | F2 | F2 | libjxl WASM | libjxl server | CanvasKit/WebGPU + 해당 codec | HDR·alpha·animation·metadata 보존 | P1 | 브라우저 native 지원에 의존하지 않음 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | Khronos Texture | KTX/KTX2 | F1 | F1 | KTX-Software/BasisU WASM | KTX tools | CanvasKit/WebGPU + 해당 codec | mipmaps·supercompression·metadata 보존 | P1 | KTX2를 웹 3D 기본 texture로 사용 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | OpenEXR | EXR | F2 | F2 | OpenEXR WASM | OpenImageIO | CanvasKit/WebGPU + 해당 codec | multi-part·multi-channel·HDR metadata 보존 | P1 | 브라우저 preview는 RGBA proxy |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | Radiance HDR | HDR/RGBE | F1 | F1 | RGBELoader/image-rs | OpenImageIO | CanvasKit/WebGPU + 해당 codec | scene-linear data 보존 | P1 | metadata 제한 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Apple Icon | ICNS | F2 | F2 | icns parser/WASM | macOS bridge | CanvasKit/WebGPU + 해당 codec | multi-size entries 보존 | P2 | 일부 modern chunks |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | JPEG XR | JXR/WDP/HDP | F3 | F4 | 제한 decoder | libjxr/Windows bridge | CanvasKit/WebGPU + 해당 codec | 원본 보존 + converted TIFF/PNG | P2 | 생태계·라이선스 확인 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 래스터·HDR·RAW·텍스처 | MPO Multi Picture | MPO | F2 | F2 | JPEG container parser | OpenImageIO | CanvasKit/WebGPU + 해당 codec | multiple JPEG frames 보존 | P2 | 3D/depth semantics sidecar |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | Netpbm | PBM/PGM/PPM/PAM | F1 | F1 | image-rs/custom parser | 없음 | CanvasKit/WebGPU + 해당 codec | pixels·maxval 보존 | P2 | metadata 거의 없음 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | PC Paintbrush | PCX | F2 | F3 | image-rs/custom | ImageMagick | CanvasKit/WebGPU + 해당 codec | palette·pixels 보존 | P2 | legacy variants |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 래스터·HDR·RAW·텍스처 | Portable FloatMap | PFM | F1 | F1 | custom/image-rs | OpenImageIO | CanvasKit/WebGPU + 해당 codec | float pixels·endianness 보존 | P2 | 색공간 sidecar 필요 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Quite OK Image | QOI | F1 | F1 | QOI JS/WASM codec | 불필요 | qoi codec + CanvasKit | RGBA·colorspace flag·original | P2 | metadata 제한 | 빠른 임시 교환 | codec round-trip | 공개 규격 |
| 래스터·HDR·RAW·텍스처 | Targa | TGA | F1 | F1 | image-rs/three TGA loader | 없음 | CanvasKit/WebGPU + 해당 codec | alpha/origin 보존 | P2 | RLE variants 시험 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Windows Icon/Cursor | ICO/CUR | F1 | F1 | ico crate/WASM | 없음 | CanvasKit/WebGPU + 해당 codec | multi-size frames·hotspot 보존 | P2 | PNG-compressed entries |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 래스터·HDR·RAW·텍스처 | Farbfeld | FF | F1 | F1 | simple codec | 불필요 | custom codec | 16-bit RGBA exact | P3 | metadata 없음 | 무손실 파이프라인 테스트 | byte round-trip | 공개 규격 |
| 래스터·HDR·RAW·텍스처 | FITS Scientific Image | FITS/FIT/FTS | F2 | F2 | CFITSIO WASM | CFITSIO server | CanvasKit/WebGPU + 해당 codec | multi-HDU·metadata 보존 | P3 | 창작 사용자 우선순위 낮음 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 래스터·HDR·RAW·텍스처 | GeoTIFF | TIF/TIFF | F2 | F2 | geotiff.js/WASM | GDAL bridge | MapGraph + image tile engine | raster·geo transform·CRS·nodata | P3 | 대형 pyramids | 지도/배경 텍스처 | GDAL info + visual diff | 공개 규격 |
| 래스터·HDR·RAW·텍스처 | IFF/ILBM | IFF/ILBM/LBM | F2 | F2 | IFF chunk parser/WASM | ImageMagick/OpenImageIO bridge | custom codec + palette engine | palette·HAM/EHB·metadata·original | P3 | Amiga variants | 픽셀아트 자산 | DeluxePaint/ImageMagick compare | 레거시 공개 |
| 래스터·HDR·RAW·텍스처 | Kodak Photo CD | PCD | F3 | F3 | codec/WASM | ImageMagick bridge | custom codec | resolution tiers·profile·original | P3 | color management | 사진 아카이브 | ImageMagick compare | 레거시 |
| 래스터·HDR·RAW·텍스처 | Macintosh PICT | PICT/PCT | F3/F4 | F4 | limited parser | ImageMagick/Quartz bridge | preserve + raster conversion | original + raster/vector preview | P3 | QuickDraw semantics | 레거시 문서 | macOS bridge visual | 레거시 |
| 래스터·HDR·RAW·텍스처 | Silicon Graphics Image | SGI/RGB/RGBA/BW | F1/F2 | F2 | SGI codec/WASM | OpenImageIO bridge | custom codec | channels·RLE·original | P3 | old variants | VFX 레거시 | OpenImageIO diff | 공개 레거시 |
| 래스터·HDR·RAW·텍스처 | Wireless Bitmap | WBMP | F1 | F1 | simple binary codec | 불필요 | custom codec | monochrome bitmap | P3 | 1-bit only | 레거시 모바일 | pixel round-trip | 공개 레거시 |
| 래스터·HDR·RAW·텍스처 | X Bitmap | XBM | F1 | F1 | text parser | 불필요 | custom codec | 1-bit bitmap·hotspot·original | P3 | 색상/alpha 제한 | 레거시 아이콘 | byte round-trip | 공개 레거시 |
| 래스터·HDR·RAW·텍스처 | X PixMap | XPM | F1 | F1 | text parser | 불필요 | custom codec | palette·alpha·symbol names | P3 | C source variants | 레거시 아이콘 | pixel round-trip | 공개 레거시 |
| 벡터·PDF·다이어그램 | Portable Document Format | PDF | F2 | F2 | PDF.js import + CanvasKit/pdf-lib export | MuPDF/qpdf | Vello/CanvasKit/resvg + adapter | pages·text·vector·annotations·original object stream 보존 | P0 | 편집 의미는 완전 복원 불가 가능 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 벡터·PDF·다이어그램 | Scalable Vector Graphics | SVG/SVGZ | F1 | F1 | XML parser + resvg/ThorVG/Vello | Inkscape 선택 | Vello/CanvasKit/resvg + adapter | DOM·styles·defs·unknown namespace 보존 | P0 | filter/text 호환 profile 필요 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 벡터·PDF·다이어그램 | Adobe Illustrator | AI | F3 | F3 | PDF-compatible AI 직접 | Illustrator/Inkscape bridge | Vello/CanvasKit/resvg + adapter | 원본 AI + PDF/EPS sections 보존 | P1 | legacy AI는 EPS bridge |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | AutoCAD Drawing Exchange | DXF | F2 | F2 | dxf-parser/custom | ezdxf/LibreCAD | Vello/CanvasKit/resvg + adapter | entities·layers·units 보존 | P1 | 버전·spline/hatch 차이 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 벡터·PDF·다이어그램 | Encapsulated PostScript | EPS | F3 | F3 | preview parser 제한 | Ghostscript/Inkscape | Vello/CanvasKit/resvg + adapter | 원본 PS + PDF/SVG conversion | P1 | 실행성 PostScript sandbox |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | Graphviz DOT | DOT/GV | F1 | F1 | text parser | Graphviz WASM | DiagramGraph + ELK/Graphviz | nodes·edges·attributes·original | P1 | HTML-like labels sandbox | 다이어그램 기능 | layout determinism | 공개 규격 |
| 벡터·PDF·다이어그램 | Mermaid | MMD/MERMAID | F1 | F1 | text parser | 불필요 | Mermaid + DiagramGraph | source·theme·links·original | P1 | 버전별 문법 | 스토리/아키텍처 다이어그램 | parser/render regression | 공개 소스 |
| 벡터·PDF·다이어그램 | OpenDocument Graphics | ODG | F2 | F2 | ODF ZIP/XML parser | LibreOffice bridge | ODF adapter + Vello/CanvasKit | pages·shapes·text·styles·original XML | P1 | 고급 필터/폰트 차이 | 문서/프레젠테이션 사용자 이식 | LibreOffice reopen + visual diff | 공개 규격 |
| 벡터·PDF·다이어그램 | PDF Forms Data | FDF/XFDF | F1/F2 | F2 | PDF.js/XML parser | qpdf/MuPDF bridge | AnnotationGraph | annotations·fields·comments·original | P1 | 좌표계·font appearance | 검토 주석 이식 | PDF round-trip | 공개 규격 |
| 벡터·PDF·다이어그램 | PDF/X | PDF/X-1a/PDF/X-4 | F3 | F2 | CanvasKit/PDF writer + ICC/preflight | Ghostscript/veraPDF | Vello/CanvasKit/resvg + adapter | bleed·trim·output intent 보존 | P1 | 인쇄 검증 필수 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | Visio Drawing | VSD/VSDX/VSSX/VSTX | F3 | F3 | VSDX ZIP/XML 부분 | libvisio/LibreOffice | Vello/CanvasKit/resvg + adapter | shapes·connectors·original package 보존 | P1 | legacy VSD는 bridge |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | AutoCAD Drawing | DWG | F4 | F4 | 없음 | LibreDWG/ODA/LibreCAD bridge | Vello/CanvasKit/resvg + adapter | 원본 DWG + normalized DXF/SVG preview | P2 | GPL/상용 SDK 선택과 법무 검토 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 벡터·PDF·다이어그램 | BPMN | BPMN/XML | F1 | F1 | bpmn-js/schema parser | 없음 | Vello/CanvasKit/resvg + adapter | semantic process graph 보존 | P2 | vendor extensions opaque 보존 | 웹툰·디자인 제작 공정과 승인 흐름을 다이어그램으로 이식 | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 벡터·PDF·다이어그램 | CorelDRAW | CDR/CMX | F4 | F4 | 없음 | libcdr/LibreOffice | Vello/CanvasKit/resvg + adapter | 원본 + SVG/PDF conversion | P2 | write는 표준 포맷 권장 |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 벡터·PDF·다이어그램 | D2 Diagram | D2 | F1 | F1 | text parser | D2 CLI bridge | DiagramGraph adapter | source·layout directives·original | P2 | 버전별 syntax | 빠른 기획 도식 | source round-trip | 공개 소스 |
| 벡터·PDF·다이어그램 | GeoJSON | GEOJSON/JSON | F1 | F1 | JSON parser | GDAL bridge | MapGraph + MapLibre | geometry·properties·CRS hint·original | P2 | CRS는 별도 메타데이터 | 배경/지도 제작 | schema + geometry validation | 공개 규격 |
| 벡터·PDF·다이어그램 | PDF/A | PDF/A-1/2/3/4 | F3 | F2 | PDF writer + embedded fonts/metadata | veraPDF | Vello/CanvasKit/resvg + adapter | archival metadata·font embedding | P2 | 규격별 validator 필요 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | PlantUML | PUML/PLANTUML | F1 | F1 | text parser | PlantUML server/local bridge | DiagramGraph adapter | source·render·links·original | P2 | 서버 보안 옵션 | 문서/기획 다이어그램 | source round-trip | 공개 문법 |
| 벡터·PDF·다이어그램 | PostScript | PS | F3 | F3 | preview 제한 | Ghostscript | Vello/CanvasKit/resvg + adapter | 원본 + PDF conversion | P2 | 보안 격리 필수 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | Windows Metafile | WMF/EMF | F3 | F3 | WASM parser 제한 | LibreOffice/librevenge | Vello/CanvasKit/resvg + adapter | 원본 + SVG/PDF conversion | P2 | 텍스트/ROP 차이 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | Adobe FXG | FXG | F2/F3 | F3 | XML parser | Illustrator bridge | ShapeIR/TextIR adapter | vector·text·effects·original | P3 | 레거시 Adobe 효과 | 벡터 자산 이전 | SVG/AI 비교 | 레거시 공개 XML |
| 벡터·PDF·다이어그램 | Computer Graphics Metafile | CGM | F4 | F4 | 없음 | LibreOffice/convert service | Vello/CanvasKit/resvg + adapter | 원본 + SVG/PDF proxy | P3 | 산업 legacy |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 벡터·PDF·다이어그램 | ESRI Shapefile | SHP/SHX/DBF/PRJ | F2 | F2 | WASM parser | GDAL bridge | MapGraph + proj4 | geometry·attributes·CRS·file set | P3 | 다중 파일 세트·encoding | 도시/배경 데이터 | GDAL round-trip | 공개 사양 |
| 벡터·PDF·다이어그램 | HP-GL Plotter | PLT/HPGL | F3 | F3 | custom parser | Inkscape/plotter tools | Vello/CanvasKit/resvg + adapter | commands·units 보존 | P3 | 펜/plot semantics |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 벡터·PDF·다이어그램 | KML/KMZ | KML/KMZ | F1/F2 | F2 | XML/ZIP parser | GDAL/Google Earth bridge | MapGraph adapter | placemark·style·3D model refs·original | P3 | Google extension 차이 | 장소/장면 배경 | schema + map visual | 공개 규격 |
| 벡터·PDF·다이어그램 | Shockwave Flash | SWF | F3/F4 | F5 | Ruffle/WASM decode | Ruffle/FFmpeg bridge | Ruffle + TimelineIR | vector/timeline/audio/assets + original | P3 | ActionScript 보안·지원 범위 | 레거시 애니메이션 가져오기 | frame render diff·sandbox | 레거시 |
| 벡터·PDF·다이어그램 | XAML Vector | XAML | F2/F3 | F3 | XML subset parser | Windows bridge | ShapeIR adapter | path·brush·transform·original | P3 | 임의 코드 실행 금지 | UI/아이콘 자산 이전 | sandbox + path diff | XML subset |
| 벡터·PDF·다이어그램 | Xara Document | XAR/WEB | F3/F5 | F5 | limited parser/preserve | Xara/Inkscape bridge | preserve + SVG/PDF conversion | 원본·converted SVG/PDF·preview | P3 | 비공개/레거시 | 벡터 자산 보관 | visual diff | 레거시 |
| 브러시·색상·폰트 | Adobe Color Swatch | ACO | F1 | F1 | direct parser | 없음 | BrushIR/ColorGraph/FontGraph adapters | color values·names·spaces | P0 | spot metadata sidecar |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Adobe Swatch Exchange | ASE | F1 | F1 | direct parser | 없음 | BrushIR/ColorGraph/FontGraph adapters | groups·colors·names | P0 | spot/process semantics |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Adobe XMP Metadata | XMP | F1 | F1 | XML/RDF parser | 불필요 | exempi-style JS/WASM + metadata graph | 저작권·키워드·편집 이력·원본 보존 | P0 | 민감 metadata 삭제 옵션 | Asset Vault 권리·출처 이식 | round-trip canonicalization | 공개 규격 |
| 브러시·색상·폰트 | Clip Studio Color Set | CLS | F1/F2 | F2 | binary decoder/clean-room parser | 불필요 또는 CSP round-trip | PaletteGateway | 색 이름·순서·RGBA·투명색·원본 보존 | P0 | 역공학 구현은 버전별 검증 | 색상 세트 드롭 → Palette Library | CSP/ToonStudio 양쪽 재개방·색차 ΔE | 공식 import/export, 비공개 세부 |
| 브러시·색상·폰트 | Clip Studio Sub Tool | SUT | F5 | F5 | preview/metadata 제한 | CSP export bridge | BrushIR/ColorGraph/FontGraph adapters | 원본 SUT + recreated BrushIR | P0 | 폐쇄 포맷, 공식 호환 경로 우선 | 브러시 마이그레이션 마법사에서 팁·텍스처·동역학·압력 곡선을 BrushProgramIR로 변환 | 표준 획 시트, 압력 0~1 sweep, tilt/velocity sweep, CSP 캡처와 시각 diff | 비공개 포맷; clean-room parser 필요 |
| 브러시·색상·폰트 | Clip Studio Tool Group | SUTG | F2/F3 | F3 | clean-room parser Worker | CSP export/import 검증 bridge | BrushProgramIR + tip/texture extractor | 원본 SUTG + 그룹 순서 + 각 preset + 불명 파라미터 보존 | P0 | 비공개 사양·버전차 | 그룹 단위 드롭 → 컬렉션·태그·프리셋 생성 | 획 시트·그룹 순서·자산 누락 검사 | 비공개/공식 import/export |
| 브러시·색상·폰트 | GIMP Palette | GPL | F1 | F1 | text parser | 없음 | BrushIR/ColorGraph/FontGraph adapters | palette names·columns | P0 | simple format |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | ICC Profile | ICC/ICM | F1 | F1 | LittleCMS/skcms WASM | ColorSync/LCMS service | BrushIR/ColorGraph/FontGraph adapters | profile bytes·intent·tags | P0 | 브라우저 display color와 별도 관리 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Krita Preset | KPP/BUNDLE | F2 | F2 | ZIP/XML/PNG parser | Krita bridge | BrushIR/ColorGraph/FontGraph adapters | preset·resources·dependencies·license | P0 | engine-specific options fallback |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 브러시·색상·폰트 | MyPaint Brush | MYB | F1 | F1 | Hokusai/libmypaint parser | 없음 | BrushIR/ColorGraph/FontGraph adapters | original MYB + BrushIR + thumbnail | P0 | setting compatibility report |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Photoshop Brush | ABR | F2 | F2 | custom/WASM ABR parser | Photoshop export verifier | BrushIR/ColorGraph/FontGraph adapters | tip·dynamics·texture·original blocks | P0 | 버전별 undocumented fields | CSP와 Photoshop이 모두 사용하는 중간 브러시 교환 포맷으로 우선 지원 | ABR 버전별 tip/spacing/scatter/dynamics 비교 | 부분 공개/다수 구현 |
| 브러시·색상·폰트 | TrueType/OpenType | TTF/OTF/TTC/OTC | F1 | F1 | FreeType/HarfBuzz/fontTools WASM | fonttools service | BrushIR/ColorGraph/FontGraph adapters | tables·variation·license flags | P0 | embedding permission 준수 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Web Fonts | WOFF/WOFF2 | F1 | F1 | browser + fonttools | fonttools | BrushIR/ColorGraph/FontGraph adapters | font tables·metadata | P0 | export embedding rights |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Adobe Color Table | ACT | F1 | F1 | direct parser | 없음 | BrushIR/ColorGraph/FontGraph adapters | indexed palette | P1 | metadata 제한 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | Adobe Curves Preset | ACV | F1/F2 | F2 | ACV parser | Photoshop bridge | EffectGraph Curves adapter | 채널별 곡선 포인트·원본 보존 | P1 | 16-bit curve 해석 검증 | CSP/Photoshop 보정 프리셋 이식 | 샘플 ramp·채널별 diff | 공개 구현 다수 |
| 브러시·색상·폰트 | Adobe Photoshop Gradient | GRD | F2 | F2 | GRD parser/WASM | Photoshop/CSP bridge | GradientIR adapter | gradient stops·midpoint·opacity·원본 보존 | P1 | 버전별 descriptor 차이 | CSP/Photoshop 공용 그라데이션 이전 | 양 앱 import·ramp diff | 널리 사용/부분 구현 |
| 브러시·색상·폰트 | Clip Studio Auto Action Set | LAF | F3/F5 | F4/F5 | 안전 명령 목록 추출 가능한 범위 | CSP export + Local ToonBridge | AutomationGraph + preserve | 원본 LAF·명령 이름·지원/미지원 상태 보존 | P1 | 앱 명령 ID 차이·보안 위험 | 자동 작업 가져오기 → 실행 전 영향 미리보기 | 명령별 dry-run·Undo·sandbox 시험 | 공식 import/export, 비공개 세부 |
| 브러시·색상·폰트 | Clip Studio Gradient Set | CGS | F3/F4 | F3/F4 | clean-room gradient decoder | CSP material bridge | GradientIR | 노드 위치·색·혼합·원본 보존 | P1 | 버전별 자료 검증 필요 | CSP 그라데이션 세트를 Palette Lab으로 이동 | 샘플 ramp ΔE·stop 위치 비교 | 레거시/비공개 |
| 브러시·색상·폰트 | Cube LUT | CUBE | F1 | F1 | direct parser/WebGPU LUT | 없음 | BrushIR/ColorGraph/FontGraph adapters | grid·domain·metadata | P1 | 1D/3D LUT |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 브러시·색상·폰트 | GIMP Brush | GBR/GIH/VBR | F2 | F2 | direct parser | GIMP bridge | BrushIR/ColorGraph/FontGraph adapters | tip frames·spacing·pipe params | P1 | animated pipe variants |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 브러시·색상·폰트 | GIMP Gradient | GGR | F1 | F1 | text parser | 불필요 | GradientIR adapter | segments·coloring type·원본 보존 | P1 | HSV interpolation semantics | Gradient Library | sampled ramp diff | 공개 포맷 |
| 브러시·색상·폰트 | GIMP Pattern | PAT | F2 | F2 | direct parser | GIMP bridge | BrushIR/ColorGraph/FontGraph adapters | pattern pixels·metadata | P1 | Photoshop PAT와 adapter 분리 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 브러시·색상·폰트 | Krita Palette | KPL | F1/F2 | F2 | ZIP/XML parser | Krita bridge | PaletteGateway | 색·그룹·이름·profile 보존 | P1 | 버전별 XML | Krita/CSP 색상 세트 통합 | Krita round-trip·ΔE | 공개 소스 |
| 브러시·색상·폰트 | OpenColorIO Config | OCIO/CONFIG.OCIO | F2 | F2 | OpenColorIO WASM | OCIO service | BrushIR/ColorGraph/FontGraph adapters | config·LUT dependencies | P1 | WASM build size |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 브러시·색상·폰트 | Photoshop Pattern | PAT | F2 | F2 | custom parser | Photoshop bridge | BrushIR/ColorGraph/FontGraph adapters | patterns·color mode·original payload | P1 | 버전별 encoding |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 브러시·색상·폰트 | Photoshop Tool Preset | TPL | F3 | F3 | custom parser limited | Photoshop bridge | BrushIR/ColorGraph/FontGraph adapters | 원본 + mapped BrushIR | P1 | 브러시 외 도구 설정 포함 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 브러시·색상·폰트 | Procreate Brush | BRUSH/BRUSHSET | F3 | F5 | package parser 가능한 범위 | Procreate export bridge | BrushIR/ColorGraph/FontGraph adapters | original package + mapped BrushIR | P1 | 비공개 필드·엔진 차이 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 브러시·색상·폰트 | Procreate Swatches | SWATCHES | F2 | F2 | ZIP/plist parser | Procreate export bridge | PaletteGateway | 색 이름·순서·profile·원본 보존 | P1 | 버전별 plist | iPad 사용자 팔레트 이식 | Procreate 재import·ΔE | 역공학/널리 사용 |
| 브러시·색상·폰트 | 3D LUT | 3DL | F1/F2 | F2 | text/binary parser | OCIO bridge | ColorPipeline | grid·domain·metadata·original | P2 | dialect/bit depth | 영상/사진 LUT | OCIO sample diff | 공개 관행 |
| 브러시·색상·폰트 | Adobe Action | ATN | F3/F5 | F5 | 구조 분석·preserve | Photoshop bridge | AutomationGraph adapter | 원본·명령 목록·지원 여부 보존 | P2 | 비공개 명령·보안 | Auto Action/Automation Center로 변환 | dry-run·Undo·권한 검사 | 비공개 |
| 브러시·색상·폰트 | Adobe Custom Shape | CSH | F2/F3 | F3 | shape parser | Photoshop/Illustrator bridge | ShapeIR adapter | 벡터 shape·이름·원본 보존 | P2 | 버전 descriptor 차이 | 도형/장식 자산으로 이전 | 경로 topology·bounds 비교 | 부분 구현 |
| 브러시·색상·폰트 | Affinity Brushes | AFBRUSHES | F5 | F5 | preview 제한 | Affinity export bridge | BrushIR/ColorGraph/FontGraph adapters | 원본 + raster/vector tips | P2 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 브러시·색상·폰트 | Affinity Palette | AFPALETTE | F3/F5 | F5 | preserve/limited parser | Affinity bridge | PaletteGateway | 원본·추출 색·이름 보존 | P2 | 비공개 | Affinity 사용자 이전 | Affinity export 비교 | 비공개 |
| 브러시·색상·폰트 | ASC CDL | CDL/CCC/CC | F1 | F1 | XML parser | OCIO bridge | ColorPipeline | slope·offset·power·saturation·IDs | P2 | 컨테이너 variants | 영상 색보정 | OCIO round-trip | 공개 표준 |
| 브러시·색상·폰트 | Clip Studio Pose Studio Pose | PEP | F3/F4 | F5 | pose metadata 제한 분석 | CSP/pose converter bridge | PoseIR + preserve | 원본 pose와 skeleton retarget 결과 보존 | P2 | 레거시 bone mapping | PoseStage로 가져와 VRM/BVH와 함께 retarget | 관절 각도·좌표계·미러 비교 | 레거시 |
| 브러시·색상·폰트 | Clip Studio Tool Set Legacy | TOS | F3/F4 | F5 | 데스크톱 한정 레거시 해석 | CSP desktop import/export bridge | preserve + brush mapping | 원본 TOS와 변환된 BrushProgramIR | P2 | ComicStudio/MangaStudio/IllustStudio 계열 | 레거시 브러시 이전 | CSP에서 import한 결과와 비교 | 레거시 |
| 브러시·색상·폰트 | GIMP/Krita Curves | CRV | F2 | F2 | text/XML parser | GIMP/Krita bridge | EffectGraph Curves | curve points·channel mapping·원본 | P2 | 앱별 의미 차이 | 보정 프리셋 이식 | ramp diff | 부분 공개 |
| 브러시·색상·폰트 | GIMP/Krita Levels | LEV | F2 | F2 | text/XML parser | GIMP/Krita bridge | EffectGraph Levels | input/output/gamma·원본 | P2 | 앱별 채널 표기 | 보정 프리셋 이식 | ramp diff | 부분 공개 |
| 브러시·색상·폰트 | Krita Dynamics | GDYN | F2/F3 | F3 | XML parser | Krita bridge | BrushDynamicsIR | sensor curves·mapping·원본 보존 | P2 | 엔진별 센서 차이 | 브러시 동역학 이식 | sensor sweep test | 공개 소스 |
| 브러시·색상·폰트 | Krita Tool Preset | GTP | F2/F3 | F3 | XML/ZIP parser | Krita bridge | ToolPresetIR | tool params·resources·원본 보존 | P2 | 의존 resource 해결 | 도구 프리셋 이식 | resource dependency test | 공개 소스 |
| 브러시·색상·폰트 | Krita Workspace | KWS | F2/F3 | F3 | ZIP/XML parser | Krita bridge | WorkspaceManager | dock layout·shortcut refs·원본 보존 | P2 | 화면 크기·plugin 차이 | 작업공간 마이그레이션 | semantic placement test | 공개 소스 |
| 브러시·색상·폰트 | Photoshop Styles | ASL | F3 | F3 | custom parser limited | Photoshop bridge | BrushIR/ColorGraph/FontGraph adapters | layer effect graph + original payload | P2 | 모든 effect 왕복 어려움 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 브러시·색상·폰트 | SwatchBooker Palette | SBZ | F1/F2 | F2 | ZIP/XML parser | SwatchBooker bridge | PaletteGateway | spot/process colors·names·profiles | P2 | 색공간 다수 | 전문 팔레트 | SwatchBooker round-trip | 공개 포맷 |
| 브러시·색상·폰트 | Adobe Creative Cloud Exchange Package | CCX | F5 | F5 | manifest/preview 보존 | Adobe app bridge | OpaquePackageStore | 원본 패키지·manifest·preview 보존 | P3 | 배포/라이선스 제약 | 플러그인/템플릿 보관 | signature·manifest 검사 | 폐쇄 생태계 |
| 브러시·색상·폰트 | Adobe DNG Camera Profile | DCP | F2 | F3 | profile parser/WASM | RawTherapee/dcraw bridge | LittleCMS/skcms + custom DCP | matrix·tone curve·illuminant 보존 | P3 | RAW pipeline 복잡 | 사진 편집 프로필 가져오기 | 표준 RAW chart ΔE | 공개 규격 일부 |
| 브러시·색상·폰트 | Adobe Keyboard Shortcuts | KYS | F4/F5 | F5 | preserve/limited parser | Photoshop bridge | InputBindingEngine | 원본과 해석 가능한 command binding 보존 | P3 | 앱 명령 체계가 다름 | 사용자 단축키 프로필 생성 | 충돌·미지원 명령 보고 | 비공개 |
| 브러시·색상·폰트 | Affinity Assets | AFASSETS | F4/F5 | F5 | preserve/preview | Affinity bridge | AssetVault | 원본 패키지·thumbnail·exported SVG/PNG | P3 | 비공개 | 자산 컬렉션으로 이전 | 개수·preview·tag 비교 | 비공개 |
| 브러시·색상·폰트 | Affinity Macros | AFMACRO/AFMACROS | F4/F5 | F5 | preserve | Affinity bridge | AutomationGraph | 원본·명령 설명·대체 recipe | P3 | 비공개 | 자동화 보관 | 수동 확인 | 비공개 |
| 브러시·색상·폰트 | Affinity Styles | AFSTYLES | F4/F5 | F5 | preserve | Affinity bridge | AppearanceGraph | 원본과 raster/vector preview | P3 | 비공개 효과 | 스타일 라이브러리 보관 | preview diff | 비공개 |
| 브러시·색상·폰트 | Affinity Template | AFTEMPLATE | F4/F5 | F5 | preserve | Affinity bridge | ProjectTemplateRegistry | 원본·PDF/SVG/PSD 변환본 | P3 | 비공개 | 템플릿 허브로 이전 | 페이지/아트보드 비교 | 비공개 |
| 브러시·색상·폰트 | Bitmap Font | BDF/PCF | F1/F2 | F2 | font parser/WASM | FontForge bridge | FontIR | glyph bitmap·metrics·encoding·original | P3 | limited shaping | 픽셀 폰트 | FontForge compare | 공개 규격 |
| 브러시·색상·폰트 | Designspace | DESIGNSPACE | F1 | F1 | XML parser | FontTools bridge | VariableFontIR | axes·sources·instances·rules | P3 | source dependencies | 가변 폰트 제작 | fontmake validation | 공개 규격 |
| 브러시·색상·폰트 | FontForge Source | SFD | F1/F2 | F2 | text parser | FontForge bridge | FontSourceIR | glyphs·lookups·metadata·original | P3 | parser complexity | 오픈 폰트 제작 | FontForge reopen | 공개 소스 |
| 브러시·색상·폰트 | Glyphs Source | GLYPHS/GLYPHSPACKAGE | F2/F3 | F3 | community parser | Glyphs/fontmake bridge | FontSourceIR | masters·glyphs·features·original | P3 | 버전별 비공개 요소 | 폰트 제작 | Glyphs/fontmake compare | 부분 공개 |
| 브러시·색상·폰트 | IRIDAS LUT | ITX | F1/F2 | F2 | text parser | OCIO bridge | ColorPipeline | samples·domain·original | P3 | dialect | 영상 LUT | OCIO compare | 공개 관행 |
| 브러시·색상·폰트 | Look LUT | LOOK | F2/F3 | F3 | parser limited | OCIO/Adobe bridge | ColorPipeline | look metadata·LUT·original | P3 | Adobe dialect | 색보정 자산 | OCIO/Adobe compare | 부분 폐쇄 |
| 브러시·색상·폰트 | SPI LUT | SPI1D/SPI3D | F1 | F1 | text parser | OCIO bridge | ColorPipeline | domain·samples·original | P3 | precision | VFX 색보정 | OCIO round-trip | 공개 규격 |
| 브러시·색상·폰트 | Type 1 Font | PFA/PFB/AFM | F2 | F3 | FreeType/WASM | FontForge bridge | FontIR | glyph outlines·metrics·encoding·original | P3 | 브라우저 직접 사용 제한 | 레거시 출판 폰트 | FontForge/render diff | 공개 규격 |
| 브러시·색상·폰트 | Unified Font Object | UFO/UFOZ | F1 | F1 | plist/XML/ZIP parser | FontTools bridge | FontSourceIR | glyphs·layers·kerning·features·original | P3 | design source not runtime font | 폰트 제작 | fontmake round-trip | 공개 규격 |
| 애니메이션·영상·오디오·타임라인 | AAC/M4A | AAC/M4A | F2 | F2 | WebCodecs | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | codec config·metadata | P0 | patent/encoder availability |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | FLAC | FLAC | F1 | F1 | WebCodecs/WASM | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | lossless audio·tags·cuesheet | P0 | browser encoder varies |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | Image Sequence | PNG/JPG/EXR sequence | F1 | F1 | OPFS streaming + decoder | FFmpeg/OpenImageIO | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | frame numbering·fps·color metadata | P0 | missing frame detection |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | Lottie | JSON/TGS | F1 | F1 | Velato/ThorVG/lottie-web | After Effects Bodymovin verifier | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | layers·timing·assets·unsupported effects report | P0 | TGS 압축 profile |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | MP3 | MP3 | F1 | F1 | WebCodecs/WebAudio | FFmpeg/LAME | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | ID3·gapless metadata | P0 | encoder availability varies |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | MP4/QuickTime | MP4/M4V/MOV | F2 | F2 | WebCodecs + Mediabunny | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | streams·timebase·metadata·edit list | P0 | codec 지원은 컨테이너와 별도 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | OpenTimelineIO | OTIO/OTIOZ | F1 | F1 | OTIO JSON parser | OTIO Python adapters | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | tracks·clips·markers·media refs·metadata | P0 | adapter별 손실 보고 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | SubRip Subtitle | SRT | F1 | F1 | text parser | 없음 | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | timing·text·encoding | P0 | style 없음 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | Waveform Audio | WAV/BWF | F1 | F1 | WebAudio/WebCodecs | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | PCM·time reference·BWF metadata | P0 | large files streaming |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | WebM/Matroska | WEBM/MKV | F2 | F2 | WebCodecs + Mediabunny | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | tracks·chapters·alpha·metadata | P0 | browser encoder availability |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | WebVTT | VTT | F1 | F1 | native/text parser | 없음 | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | cues·regions·settings | P0 | browser display differences |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | After Effects | AEP/AET | F5 | F4 | preview 제한 | After Effects scripting/Bodymovin bridge | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original + Lottie/PNG/EXR/OTIO outputs | P1 | 폐쇄 포맷 |  | 원본 SHA-256 불변 보존, 안전한 미리보기 생성, bridge 가용성·오류 복구·재다운로드 시험 | 보존 우선/직접 편집 제한; 공식 변환 또는 bridge 의존 |
| 애니메이션·영상·오디오·타임라인 | AIFF | AIFF/AIF/AIFC | F2 | F2 | WebAudio parser | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | PCM·markers·metadata | P1 | compression variants |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | ASS/SSA Subtitle | ASS/SSA | F2 | F2 | parser + CanvasKit text | FFmpeg/libass | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | styles·position·karaoke | P1 | font dependency |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Edit Decision List | EDL | F2 | F2 | text parser | OTIO adapter | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | cuts·timecode·reel metadata | P1 | 단일 video track 중심 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Final Cut Pro XML | FCPXML/XML | F2 | F2 | XML parser | OTIO/FCP bridge | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | timeline·roles·media refs·effects metadata | P1 | 버전별 schema |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Live2D Runtime Model | MOC3/MODEL3.JSON | F2/F3 | F3 | official Web SDK where licensed | Cubism Editor bridge | Live2D adapter + Scene2DIR | model·textures·parameters·original | P1 | SDK 라이선스/재배포 | 캐릭터 리그 재생 | official runtime visual | 공식 런타임 |
| 애니메이션·영상·오디오·타임라인 | MIDI | MID/MIDI | F1 | F1 | MIDI parser/Web MIDI optional | DAW bridge | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | events·tempo·markers | P1 | audio가 아닌 performance data |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | Ogg Vorbis | OGG/OGA | F1 | F1 | WebAudio/WASM | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | comments·loop metadata | P1 | container ambiguity |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | Opus | OPUS/OGG/WEBM | F1 | F1 | WebCodecs/WASM | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | pre-skip·tags·channel mapping | P1 | container profile |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 애니메이션·영상·오디오·타임라인 | Rive | RIV | F2 | F3 | Rive runtime | Rive editor export bridge | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original RIV + state/animation metadata | P1 | authoring export SDK 제한 |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 애니메이션·영상·오디오·타임라인 | Spine | JSON/SKEL/ATLAS | F2 | F2 | custom runtime adapter | Spine tools | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | bones·slots·skins·animations·original data | P1 | runtime license 확인 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Advanced Authoring Format | AAF | F4 | F4 | 없음 | OTIO/AAF SDK service | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original + OTIO representation | P2 | SDK/codec complexity |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 애니메이션·영상·오디오·타임라인 | AVI | AVI | F3 | F3 | limited demux | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original + normalized MP4/WebM proxy | P2 | legacy codecs |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 애니메이션·영상·오디오·타임라인 | Core Audio Format | CAF | F1/F2 | F2 | WebCodecs/codec WASM | FFmpeg bridge | AudioIR | channels·metadata·markers·original | P2 | codec inside container | Apple 오디오 자산 | ffprobe + waveform diff | 공개 규격 |
| 애니메이션·영상·오디오·타임라인 | DragonBones | JSON/DBBIN | F2 | F2 | DragonBones parser | 없음 | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | armature·skins·animations | P2 | 버전 variants |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Inochi2D Puppet | INP/INX | F2 | F2 | open parser/reference | Inochi Creator bridge | RigGraph adapter | nodes·parameters·textures·physics·original | P2 | schema versions | 오픈 2D 리그 | Inochi runtime visual | 오픈소스 |
| 애니메이션·영상·오디오·타임라인 | Live2D Cubism Model | CMO3 | F4/F5 | F5 | preview/preserve | Live2D Cubism export bridge | RigGraph placeholder | 원본 + exported moc3/model3 assets | P2 | SDK/라이선스 | Live2D 사용자 이식 | Cubism runtime visual | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | Live2D Motion/Expression/Physics | MOTION3.JSON/EXP3.JSON/PHYSICS3.JSON | F2/F3 | F3 | JSON parser + official SDK | Cubism bridge | AnimationIR/PhysicsIR | parameters·curves·physics·original | P2 | model version alignment | 리그 애니메이션 | runtime comparison | 공식 런타임 |
| 애니메이션·영상·오디오·타임라인 | MLT/Kdenlive Project | MLT/KDENLIVE | F2 | F2 | XML parser | MLT CLI bridge | TimelineIR | tracks·clips·filters·assets·original | P2 | plugin filters | 오픈 영상 편집 | MLT render diff | 오픈소스 |
| 애니메이션·영상·오디오·타임라인 | MPEG Program/Transport | MPG/MPEG/M2TS/TS | F3 | F3 | limited demux | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original streams·timecode | P2 | broadcast variants |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 애니메이션·영상·오디오·타임라인 | MusicXML | MUSICXML/MXL/XML | F2 | F2 | XML parser | MuseScore bridge | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | notes·layout·lyrics·metadata | P2 | engraving differences |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | MXF | MXF | F4 | F4 | 없음 | FFmpeg/OpenTimelineIO tools | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original + proxy + metadata | P2 | broadcast profiles |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 애니메이션·영상·오디오·타임라인 | Ogg Video | OGV/OGG | F2 | F2 | browser/WebCodecs where available | FFmpeg | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | streams·metadata | P2 | Theora/Vorbis support varies |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz | TNZ/TLV/TPL | F4 | F4 | 제한 | OpenToonz bridge | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | original scene/levels + image sequence/OTIO | P2 | 다중 파일 package |  | 대표 원본 앱→bridge→ToonStudio→표준 포맷 재개방, 구조·메타데이터·시각 diff와 실패 corpus 검사 | bridge 중심; 앱·OS·버전별 재검증 필요 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz Raster Level | TLV/TZP/TZU | F2/F3 | F3 | open-source codec | OpenToonz bridge | RasterSequenceIR | frames·palette·original | P2 | palette-linked pixels | 셀 애니메이션 | frame/palette diff | 오픈소스 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz Scene | TNZ | F2/F3 | F3 | open-source parser/bridge | OpenToonz CLI | TimelineIR + Scene2DIR | xsheet·levels·effects·camera·original | P2 | plugin effects | 오픈 애니메이션 | OpenToonz reopen/render diff | 오픈소스 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz Vector Level | PLI | F2/F3 | F3 | open-source parser | OpenToonz bridge | VectorSequenceIR | strokes·styles·frames·original | P2 | style semantics | 벡터 셀 | OpenToonz render diff | 오픈소스 |
| 애니메이션·영상·오디오·타임라인 | Pencil2D | PCLX | F2 | F3 | ZIP/XML parser | Pencil2D CLI | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | layers·frames·bitmaps·vectors | P2 | version schema |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 애니메이션·영상·오디오·타임라인 | Spine Editor Project | SPINE | F3/F5 | F5 | official runtime where licensed | Spine Editor bridge | RigGraph adapter | 편집기 원본 .spine + 별도 JSON/SKEL/ATLAS runtime export 묶음 | P2 | 편집기 프로젝트는 폐쇄적이며 runtime export와 구분 | 게임 2D 리그 | official runtime visual | 상용 런타임 |
| 애니메이션·영상·오디오·타임라인 | Spriter | SCML/SCON | F2 | F2 | XML/JSON parser | 없음 | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | entities·animations·atlases | P2 | features subset |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Synfig | SIF/SIFZ | F2 | F3 | XML parser | Synfig CLI | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | layers·parameters·animation·original | P2 | complex render via bridge |  | 대표 앱/버전별 corpus, 지원 객체 수·텍스트·레이어·스타일 보존률, composite SSIM/ΔE, 경고 정확도 검사 | 부분 구조 지원; 기능별 fidelity corpus 필요 |
| 애니메이션·영상·오디오·타임라인 | TTML | TTML/DFXP/XML | F2 | F2 | XML parser | caption tools | WebCodecs/Mediabunny/OTIO/FFmpeg adapters | timing·styles·regions | P2 | profile differences |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 애니메이션·영상·오디오·타임라인 | Adobe Premiere Project | PRPROJ | F4/F5 | F5 | XML/preview limited | Premiere FCPXML/AAF/OTIO bridge | TimelineIR + preserve | 원본 + interchange timeline + proxies | P3 | 폐쇄 | 영상 프로젝트 보관 | Premiere reopen | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | DaVinci Resolve Project/Archive | DRP/DRA | F4/F5 | F5 | manifest/preview limited | Resolve FCPXML/AAF/OTIO bridge | TimelineIR + preserve | original + exported timeline + media map | P3 | 폐쇄 | 편집 프로젝트 | Resolve reopen | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | DSD Audio | DSF/DFF | F3 | F3 | codec/WASM limited | FFmpeg/sox bridge | AudioIR + preserve | metadata·original + PCM proxy | P3 | 고용량·브라우저 재생 제한 | 오디오 아카이브 | ffmpeg compare | 공개/복잡 |
| 애니메이션·영상·오디오·타임라인 | Live2D Cubism Animation | CAN3 | F4/F5 | F5 | preview/preserve | Cubism bridge | AnimationIR placeholder | 원본 + motion export | P3 | 폐쇄 | 애니메이션 보관 | runtime visual | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | Moho Project | MOHO/ANME | F4/F5 | F5 | preview/preserve | Moho export bridge | RigGraph placeholder | 원본 + rendered/video/PSD assets | P3 | 폐쇄 | 2D 리그 프로젝트 | bridge visual | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | Motion Graphics Template | MOGRT | F4/F5 | F5 | ZIP/manifest preview limited | After Effects/Premiere bridge | TemplateGraph placeholder | original + rendered preview + exposed params | P3 | Adobe runtime | 템플릿 자산 | Adobe app compare | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | Open Media Framework | OMF | F3/F4 | F4 | binary parser/bridge | AATranslator/DAW bridge | AudioTimelineIR | clips·timecode·media refs·original | P3 | legacy/implementation variation | 오디오 편집 | DAW reopen | 레거시 표준 |
| 애니메이션·영상·오디오·타임라인 | OpenShot Project | OSP | F2 | F2 | JSON parser | OpenShot bridge | TimelineIR | clips·transitions·effects·assets | P3 | effect differences | 오픈 영상 편집 | OpenShot reopen | 오픈소스 |
| 애니메이션·영상·오디오·타임라인 | SFZ Instrument | SFZ | F1/F2 | F2 | text parser + sampler | sfizz bridge | InstrumentIR | regions·opcodes·sample refs·original | P3 | opcode dialect | 오디오 자산 | sfizz render compare | 공개 관행 |
| 애니메이션·영상·오디오·타임라인 | Sony Wave64 | W64 | F2 | F2 | WAV64 parser/WASM | FFmpeg bridge | AudioIR | 64-bit chunks·metadata·original | P3 | 대형 파일 | 장시간 오디오 | ffprobe + checksum | 공개 규격 |
| 애니메이션·영상·오디오·타임라인 | SoundFont | SF2/SF3 | F2 | F2 | fluidsynth WASM | FluidSynth bridge | InstrumentIR | samples·presets·banks·original | P3 | license/메모리 | MIDI/TTS 배경음 | preset/sample count + render | 공개 규격 |
| 애니메이션·영상·오디오·타임라인 | Toon Boom Drawing | TVG | F4/F5 | F5 | preview/preserve | Harmony export SVG/PSD bridge | OpaquePackageStore | 원본 + converted SVG/PNG | P3 | 비공개 | 벡터 드로잉 자산 | Harmony visual diff | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | Toon Boom Palette | PLT | F3/F4 | F4 | limited parser | Harmony bridge | PaletteGateway | colors·IDs·textures·original | P3 | Harmony-specific links | 팔레트 자산 | Harmony compare | 비공개 |
| 애니메이션·영상·오디오·타임라인 | Toon Boom Scene | XSTAGE | F4/F5 | F5 | XML 일부/preview | Harmony export bridge | TimelineIR placeholder | 원본 + rendered frames/OTIO/PSD | P3 | 버전/노드 복잡 | 스튜디오 애니메이션 | Harmony bridge | 폐쇄 |
| 애니메이션·영상·오디오·타임라인 | Tracker Module | MOD/XM/S3M/IT | F2 | F2 | libopenmpt WASM | OpenMPT bridge | MusicSequenceIR | patterns·samples·instruments·original | P3 | effect command 차이 | 게임/레트로 오디오 | libopenmpt render hash | 공개 구현 |
| 웹·아카이브·교환 | JSON | JSON/JSON5 | F1 | F1 | streaming JSON parser | 없음 | Streaming parser + SecuritySandbox | unknown fields 보존 | P0 | schema validation |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 웹·아카이브·교환 | ZIP Archive | ZIP/ZIP64 | F1 | F1 | fflate/zip.js streaming | 7-Zip service | Streaming parser + SecuritySandbox | entry paths·timestamps·extra fields | P0 | zip-slip/bomb 검사 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 웹·아카이브·교환 | CBOR | CBOR | F1 | F1 | cbor-x/WASM | 없음 | Streaming parser + SecuritySandbox | typed binary data | P1 | canonical encoding option |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 웹·아카이브·교환 | Gzip | GZ | F1 | F1 | DecompressionStream/pako | 불필요 | ArchiveGateway | payload·header·original | P1 | single stream | 압축 자산 | checksum | 표준 |
| 웹·아카이브·교환 | Web App Package | HTML/CSS/JS/ASSETS | F2 | F2 | sandboxed DOM/CSS parser | Playwright build service | Streaming parser + SecuritySandbox | semantic DOM·assets·manifest | P1 | script permissions |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 웹·아카이브·교환 | Zstandard | ZST | F1 | F1 | WASM codec | zstd bridge | ArchiveGateway | frames·dictionary ID·original | P1 | dictionary dependency | 고속 콘텐츠 청크 | checksum/stream test | 공개 |
| 웹·아카이브·교환 | 7-Zip Archive | 7Z | F2 | F2 | 7z WASM | 7-Zip service | Streaming parser + SecuritySandbox | original archive + extracted manifest | P2 | codec/license/build 검토 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 웹·아카이브·교환 | Bzip2 | BZ2 | F1 | F1 | WASM codec | 7-Zip bridge | ArchiveGateway | payload·metadata·original | P2 | CPU 비용 | 압축 자산 | checksum | 공개 |
| 웹·아카이브·교환 | Progressive Web App | WEBMANIFEST/SW | F2 | F2 | manifest parser | 없음 | Streaming parser + SecuritySandbox | icons·shortcuts·display settings | P2 | service worker code sandbox |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 웹·아카이브·교환 | RAR Archive | RAR | F2 | F2 | unrar WASM if permitted | unrar service | Streaming parser + SecuritySandbox | original + extracted manifest | P2 | 라이선스 제한 확인 |  | 양방향 round-trip, 객체·레이어·텍스트·스타일·색공간 비교, 대상 앱 재개방과 visual regression | 구조형 지원 후보; 일부 고유 기능 근사 가능 |
| 웹·아카이브·교환 | TAR Archive | TAR/TGZ | F1 | F1 | tar parser + gzip | 없음 | Streaming parser + SecuritySandbox | entries·permissions metadata | P2 | path traversal 검사 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 웹·아카이브·교환 | XZ/LZMA | XZ/LZMA | F1 | F1 | WASM codec | 7-Zip bridge | ArchiveGateway | payload·metadata·original | P2 | 메모리 사용 | 압축 자산 | checksum | 공개 |
| 웹·아카이브·교환 | YAML | YAML/YML | F1 | F1 | yaml parser | 없음 | Streaming parser + SecuritySandbox | comments/anchors 가능한 범위 | P2 | unsafe tags 금지 |  | 공개 규격 conformance corpus, 양방향 round-trip, 대상 앱 재개방, 구조·메타데이터·픽셀/벡터 diff | 공개 규격 또는 네이티브 경로; conformance와 재개방 시험 필수 |
| 웹·아카이브·교환 | LHA Archive | LZH/LHA | F2 | F2 | WASM decompressor | 7-Zip bridge | ArchiveGateway | file names·timestamps·original | P3 | legacy encoding | 일본 레거시 소재팩 | archive checksum | 레거시 |
| 웹·아카이브·교환 | MBTiles | MBTILES | F1/F2 | F2 | SQLite WASM | tippecanoe/GDAL bridge | SQLite WASM + MapLibre | tiles·metadata·bounds·original | P3 | 라이선스/용량 | 오프라인 지도 배경 | tile checksum | 공개 규격 |
| 웹·아카이브·교환 | Microsoft Cabinet | CAB | F2 | F3 | WASM decoder | 7-Zip bridge | ArchiveGateway | files·paths·original | P3 | install directives 제외 | 레거시 패키지 | 7-Zip compare | 공개 레거시 |
| 웹·아카이브·교환 | PMTiles | PMTILES | F1 | F1 | range request parser | 불필요 | PMTiles + MapLibre | archive index·tiles·metadata | P3 | 원격 CORS/range | 대용량 배경 지도 | directory/tile checksum | 공개 규격 |

---

# 부록 C. 브러시 오픈소스 99개 전체 레지스트리

| 분야 | 프로젝트 | 라이선스 | 기술 스택 | 고유 강점 | ToonStudio 역할 | 채택 등급 | URL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 입력 | Pointer Events Level 3 | W3C 표준 | Web API | pressure·tilt·twist·coalesced·predicted·raw update | 원시 펜 입력 기준 | A | https://www.w3.org/TR/pointerevents3/ |
| 입력 | pointer-tracker | Apache-2.0 | TS/JS | pointer lifecycle와 고해상도 expanded samples | 입력 수집 어댑터 | A | https://github.com/GoogleChromeLabs/pointer-tracker |
| 입력 | Pressure.js | MIT | JS | Force Touch·구형 pressure API 추상화 | 레거시 fallback | B | https://github.com/stuyam/pressure |
| 입력 | Wacom Signature SDK JS samples | MIT(샘플) | JS | signature/device capture 예제 | 장치 진단 참고 | B | https://github.com/Wacom-Developer/sdk-for-signature-js |
| 입력 | amoshydra/draw | MIT | JS/Canvas | pen/touch pressure drawing 예제 | 경량 입력 참고 | B | https://github.com/amoshydra/draw |
| 보정 | stroke-stabilizer | MIT | TS/JS | 필터 체인·One Euro·endpoint·prediction·Catmull-Rom | 보정 알고리즘 소스·검증 | A | https://github.com/usapopopooon/stroke-stabilizer |
| 보정 | lazy-brush | MIT | JS | lazy radius와 friction | 긴 선·보정 모드 | A | https://github.com/dulnan/lazy-brush |
| 보정 | Signature Pad | MIT | TS/JS | velocity 기반 variable-width Bézier | 압력 없는 입력 fallback | A | https://github.com/szimek/signature_pad |
| 보정 | Atrament | MIT | JS/Canvas | adaptive smoothing·pressure·draw/fill/erase | bitmap brush 참고·경량 fallback | A | https://github.com/jakubfiala/atrament |
| 기하 | Perfect Freehand | MIT | TS/JS | pressure-aware stroke outline | 벡터 잉크 외곽선 | A | https://github.com/steveruizok/perfect-freehand |
| 기하 | freedraw | MIT | Rust | Perfect Freehand의 Rust 포트 | WASM 중심 outline 후보 | A | https://github.com/ducflair/freedraw |
| 기하 | fit-curve | MIT | JS | polyline→cubic Bézier fitting | 사후 편집 중심선 | A | https://github.com/soswow/fit-curve |
| 기하 | smooth-fit-curve | MIT | TS | fit-curve 현대 TS fork | 타입 안전 fitting 대안 | B | https://github.com/Bunny-Editor/smooth-fit-curve |
| 기하 | simplify-js | BSD-2-Clause | JS | 고속 polyline simplification | 포인트 수 축소 | A | https://github.com/mourner/simplify-js |
| 기하 | Bezier.js | MIT | JS | Bezier 길이·projection·split·offset | 곡선 분석·편집 | A | https://github.com/Pomax/bezierjs |
| 기하 | Kurbo | MIT OR Apache-2.0 | Rust | Bézier/path/affine/stroke geometry | Vello 앞 기하 코어 | A | https://github.com/linebender/kurbo |
| 기하 | Paper.js | MIT | JS/Canvas | path Boolean·hit test·smooth·simplify | 편집·Boolean 어댑터 | A | https://github.com/paperjs/paper.js |
| 기하 | flatten-js | MIT | JS | 2D geometry·intersection·Boolean | trim·지우개·스냅 | A | https://github.com/alexbol99/flatten-js |
| 기하 | Clipper2 | BSL-1.0 | C++/C#/Delphi | robust clipping·offsetting | outline cleanup·offset | B | https://github.com/AngusJohnson/Clipper2 |
| 기하 | polygon-clipping | MIT | JS | Martinez polygon Boolean | 브라우저 Boolean fallback | B | https://github.com/mfogel/polygon-clipping |
| 기하 | earcut | ISC | JS | 빠른 polygon triangulation | WebGL/Vello 보조 tessellation | A | https://github.com/mapbox/earcut |
| 기하 | Lyon | MIT OR Apache-2.0 OR MPL-2.0 | Rust | GPU path tessellation | 대체 tessellator·검증 | B | https://github.com/nical/lyon |
| 렌더 | Vello | MIT OR Apache-2.0 | Rust/wgpu | GPU compute 중심 2D vector renderer | 주력 vector scene | A | https://github.com/linebender/vello |
| 렌더 | Vello Hybrid | MIT OR Apache-2.0 | Rust/wgpu/WebGL | CPU path + GPU raster/composition | 브라우저 기본 후보 | A | https://github.com/linebender/vello |
| 렌더 | Vello CPU | MIT OR Apache-2.0 | Rust/WASM | CPU/SIMD renderer | export·fallback·golden test | A | https://github.com/linebender/vello |
| 렌더 | Peniko | MIT OR Apache-2.0 | Rust | brush·gradient·image·blend primitives | Vello paint model | A | https://github.com/linebender/peniko |
| 렌더 | tiny-skia | BSD-3-Clause | Rust | 작고 빠른 CPU rasterizer | CPU fallback 비교 | B | https://github.com/RazrFalcon/tiny-skia |
| 렌더 | Blend2D | Zlib | C++ | JIT CPU vector rasterization | native/server 비교 backend | B | https://github.com/blend2d/blend2d |
| 렌더 | femtovg | MIT | Rust/OpenGL | GPU anti-aliased vector drawing | WebGL/native 대안 연구 | B | https://github.com/femtovg/femtovg |
| 렌더 | CanvasKit | BSD-3-Clause/Skia notices | WASM/WebGL | Skia canvas/path/text와 software fallback | 호환·출력 대안 | B | https://skia.org/docs/user/modules/canvaskit/ |
| 렌더 | regl-gpu-lines | MIT | JS/WebGL | GPU instanced screen-space lines | WebGL 선 fallback 연구 | B | https://github.com/rreusser/regl-gpu-lines |
| 렌더 | webgpu-instanced-lines | MIT | TS/WebGPU | WebGPU instanced lines | 특수 대량 선 backend 참고 | B | https://github.com/rreusser/webgpu-instanced-lines |
| 렌더 | regl-line2d | MIT | JS/WebGL | join·dash·float64 GPU line | WebGL 절차선 참고 | B | https://github.com/gl-vis/regl-line2d |
| 스타일 | Rough.js | MIT | JS/Canvas/SVG | hand-drawn/sketchy geometry | 스케치 스타일 plugin | A | https://github.com/rough-stuff/rough |
| 자연매체 | Hokusai | MIT OR Apache-2.0 | Rust/WASM | .myb·tile surface·smudge·spectral mixing·다양한 inputs | 주력 자연매체 runtime | A | https://github.com/reearth/hokusai |
| 자연매체 | libmypaint | ISC | C | MyPaint 공식 brush engine | 기준선·선택형 자체 WASM | A | https://github.com/mypaint/libmypaint |
| 자연매체 | mypaint-brushes | CC0 raw data / packaging 별도 | Brush data | 검증된 MyPaint preset | 초기 preset과 parity corpus | A/B | https://github.com/mypaint/mypaint-brushes |
| 자연매체 | brushlib-wasm | 명시 확인 필요 | C/WASM | libmypaint Emscripten port | 권리 확인 전 평가용 | D | https://github.com/eliot-akira/brushlib-wasm |
| 자연매체 | p5.brush | MIT | JS/WebGL2 | custom tips·watercolor-like fill·hatching·vector field·pressure | 절차 브러시·prototype | A/B | https://github.com/acamposuribe/p5.brush |
| 자연매체 | Ezu | MIT OR Apache-2.0 | Rust/WASM | Hokusai 구동 typed node DAG와 painterly ops | BrushGraph·effect graph 설계 참고 | A | https://github.com/reearth/ezu |
| 참고앱 | Krita | GPL-3.0-or-later | C++/Qt | 다양한 전문 brush engine | 행동 사양·회귀 목표 | C | https://invent.kde.org/graphics/krita |
| 참고앱 | OpenToonz | Modified BSD + 폴더별 상이 | C++/Qt | animation drawing·palette·MyPaint integration | 파일 단위 감사 후 부분 참고 | B/C | https://github.com/opentoonz/opentoonz |
| 참고앱 | Pencil2D | GPL-2.0 | C++/Qt | bitmap/vector animation drawing | 행동 사양·타임라인 참고 | C | https://github.com/pencil2d/pencil |
| 참고앱 | Graphite | Apache-2.0 | Rust | node-based vector+raster nondestructive editor | BrushGraph·문서 구조 | A/B | https://github.com/GraphiteEditor/Graphite |
| 참고앱 | Lorien | MIT | Godot | pressure strokes·infinite canvas·SuperEraser | stroke 저장·벡터 지우개 참고 | A/B | https://github.com/mbrlabs/Lorien |
| 참고앱 | Pixelorama | MIT | Godot | pixel/custom/random brush·patterns·symmetry | 픽셀 브러시 UX | A/B | https://github.com/Orama-Interactive/Pixelorama |
| 참고앱 | miniPaint | MIT | JS/Canvas | 브라우저 레이어·필터 편집기 | 웹 도구·패널 참고 | A/B | https://github.com/viliusle/miniPaint |
| 참고앱 | JS Paint | MIT | JS/Canvas | 고전 paint tool UX | 도구 반응·픽셀 UX | A/B | https://github.com/1j01/jspaint |
| 참고앱 | ChickenPaint | GPL-3.0 | JS/WebGL | 웹 painting application | 성능·기능 비교 | C | https://github.com/thenickdude/chickenpaint |
| 색 | Spectral.js | MIT | JS | Kubelka-Munk 계열 spectral pigment mixing | palette·LUT·reservoir 혼색 | A | https://github.com/rvanwijnen/spectral.js |
| 색 | Color.js | MIT | JS | 다양한 color spaces·gamut·DeltaE | 색상 관리·품질 비교 | A | https://github.com/color-js/color.js |
| 색 | Culori | MIT | JS | 가벼운 색 변환·보간·difference | UI와 runtime 유틸 | A | https://github.com/Evercoder/culori |
| 텍스처 | FastNoiseLite | MIT | C++/Rust/JS/GLSL 등 | OpenSimplex·Perlin·Cellular·domain warp | paper/tip/granulation/noise | A | https://github.com/Auburn/FastNoiseLite |
| 텍스처 | simplex-noise.js | MIT | JS | dependency-free seeded 2D/3D/4D noise | 경량 JS preview | A | https://github.com/jwagner/simplex-noise.js |
| 텍스처 | poisson-disk-sampling | MIT | JS | variable-density Poisson disk | stamp·spray·fiber 분포 | A | https://github.com/kchapelier/poisson-disk-sampling |
| 텍스처 | texture-synthesis | MIT OR Apache-2.0 | Rust | example-based texture synthesis/inpainting | 오프라인 paper/tip 생성 | B(archive) | https://github.com/EmbarkStudios/texture-synthesis |
| 벡터화 | VTracer | MIT | Rust/WASM | raster→vector tracing | 스캔 tip·라인 벡터화 | B | https://github.com/visioncortex/vtracer |
| 습식매체 | InkWash | 라이선스 없음 확인 | HTML/WebGL2 | mobile/fixed pigment·wetness·Stable Fluids·Beer-Lambert | 클린룸 동작 사양 | D | https://github.com/johnowhitaker/inkwash |
| 습식매체 | writing-on-water | MIT | JS/WebGL | watercolor simulation demo | 수채 알고리즘 참고 | B | https://github.com/arsena21/writing-on-water |
| 습식매체 | mikerkoval/FluidSimulation | MIT | WebGPU/WGSL | Stable Fluids compute·ping-pong | 속도·압력장 골격 | A/B | https://github.com/mikerkoval/FluidSimulation |
| 습식매체 | jeantimex/fluid | MIT | WebGPU/WGSL | SPH·PIC/FLIP 2D/3D | 두꺼운 유체·droplet 연구 | B | https://github.com/jeantimex/fluid |
| 습식매체 | WebGL-Fluid-Simulation | MIT | WebGL | 모바일 친화 fluid simulation | WebGL2 fallback | A/B | https://github.com/PavelDoGreat/WebGL-Fluid-Simulation |
| 습식매체 | webgl-water | MIT | WebGL | water ripple·caustics | water drop·표면 효과 참고 | B | https://github.com/evanw/webgl-water |
| 습식매체 | kishimisu WebGPU Fluid | 확인 필요 | WebGPU/WGSL | Stable Fluids demo | 코드 감사 후 참고 | D/B | https://github.com/kishimisu/WebGPU-Fluid-Simulation |
| 물리 | Rapier | Apache-2.0 | Rust/WASM | 고성능 2D/3D rigid body·collision·joints | 장면·오브젝트 물리 | A | https://github.com/dimforge/rapier |
| 물리 | JoltPhysics.js | MIT | C++/WASM | soft body·cloth·bend·pressure·multithread builds | 선택형 고급 천·soft body | B | https://github.com/jrouwe/JoltPhysics.js |
| 물리 | Floaty | MIT | Rust/WASM | PBD/PBF·soft body/fluid coupling·rayon | 브러시모·입자 solver 참고 | B | https://github.com/matsuoka-601/Floaty |
| 물리 | verlet-js | MIT | JS | Verlet constraints·rope·cloth | 초기 브러시모 prototype | B | https://github.com/subprotocol/verlet-js |
| 물리 | Verly.js | MIT | JS | Verlet engine·cloth·rope·tearing | 리본·헤어 UX prototype | B | https://github.com/anuraghazra/Verly.js |
| 물리 | Matter.js | MIT | JS | 2D rigid body web engine | 단순 object/particle prototype | B | https://github.com/liabru/matter-js |
| 파티클 | pixi-particle-system | MIT | TS/PixiJS | 현대적 TS particle system·editor | WebGL fallback·UI 참고 | B | https://github.com/danielpokladek/pixi-particle-system |
| 파티클 | particle-emitter | MIT | TS/PixiJS | 검증된 PixiJS emitter | preset 형식·fallback | B | https://github.com/pixijs-userland/particle-emitter |
| 파티클 | particle-emitter-editor | MIT | JS/PixiJS | WYSIWYG emitter editor | Particle Brush editor 참고 | B | https://github.com/pixijs-userland/particle-emitter-editor |
| 파티클 | three.quarks | MIT | TS/Three.js | GPU instancing·curve params·3D VFX | 3D 효과 브러시 | A/B | https://github.com/Alchemist0823/three.quarks |
| 파티클 | three.quarks-editor | MIT | TS/React | VFX editor | 곡선·emitter UI 참고 | B | https://github.com/Alchemist0823/three.quarks-editor |
| 파티클 | RevoltFX | MIT | TS/PixiJS | nested emitters·effect sequences | 연쇄 효과 preset | B | https://github.com/bma73/revolt-fx |
| 파티클 | tsParticles | MIT | TS/Canvas/WebGL | 다양한 shape·interaction·emitter | 배경/효과 참고 | B | https://github.com/tsparticles/tsparticles |
| 2D GPU | PixiJS | MIT | TS/WebGL/WebGPU | 고성능 sprite·texture·filter ecosystem | 과도기 합성·plugin fallback | A/B | https://github.com/pixijs/pixijs |
| 2D GPU | pixi-viewport | MIT | TS/PixiJS | drag·pinch·zoom·deceleration·snap | 캔버스 camera UX 참고 | B | https://github.com/pixijs-userland/pixi-viewport |
| 2D 객체 | Fabric.js | MIT | TS/Canvas | object selection·transform·serialization | 오브젝트 편집 참고 | B | https://github.com/fabricjs/fabric.js |
| 2D 객체 | Konva | MIT | TS/Canvas | scene graph·transformer·events | selection·snap·guide 참고 | B | https://github.com/konvajs/konva |
| 2D 기하 | Two.js | MIT | JS/SVG/Canvas/WebGL | renderer-agnostic vector API | 간단 vector plugin 참고 | B | https://github.com/jonobr1/two.js |
| 창작 코딩 | Pts.js | Apache-2.0 | TS/Canvas/SVG/WebGL | geometry·creative coding·interpolation | 절차 브러시 prototype | B | https://github.com/williamngan/pts |
| 이미지 | Photon | Apache-2.0 | Rust/WASM | 고성능 image processing | tip·filter·worker fallback | A | https://github.com/silvia-odwyer/photon |
| 이미지 | OpenCV.js | Apache-2.0 | C++/WASM | threshold·morphology·contour·distance transform | tip cleanup·selection·SDF | A/B | https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html |
| 이미지 | fast_image_resize | MIT OR Apache-2.0 | Rust/WASM SIMD | 고속 고품질 resize·mip | atlas·thumbnail·mip | A | https://github.com/Cykooz/fast_image_resize |
| 이미지 | wasm-vips | MIT + LGPL third parties | C/C++/WASM | streaming parallel image pipeline | 대량 brush pack 처리 | B | https://github.com/kleisauke/wasm-vips |
| 이미지 | resvg-js | 프로젝트/상위 라이선스 감사 | Rust/WASM/Node | 정확한 SVG rasterization·bbox·fonts | SVG tip 처리 | B | https://github.com/yisibl/resvg-js |
| 그래프 UI | React Flow / xyflow | MIT | React/TS | React node-based UI | BrushGraph editor 주력 | A | https://github.com/xyflow/xyflow |
| 그래프 UI | Rete.js | MIT | TS | dataflow/control-flow visual programming | compiler·plugin 구조 참고 | A/B | https://github.com/retejs/rete |
| 그래프 UI | LiteGraph.js | MIT | JS/Canvas | 실행 가능한 node graph와 editor | 경량 graph 포맷 참고 | B | https://github.com/jagenjo/litegraph.js |
| 그래프 UI | BaklavaJS | MIT | TS/Vue | typed ports·plugin graph editor | 타입 포트 설계 참고 | B | https://github.com/newcat/baklavajs |
| GPU | wgpu | MIT OR Apache-2.0 | Rust/WebGPU | native+web GPU abstraction | Vello·compute 기반 | A | https://github.com/gfx-rs/wgpu |
| GPU | gpu-io | MIT | JS/WebGL | GPGPU workflows·physics·particles·image processing | WebGL compute fallback 참고 | B | https://github.com/amandaghassaei/gpu-io |
| GPU | regl | MIT | JS/WebGL | functional WebGL resource/command abstraction | WebGL 실험·fallback | B | https://github.com/regl-project/regl |
| 셰이더 | LYGIA | Prosperity + Patron/Commercial | GLSL/HLSL/MSL/WGSL | 방대한 granular shader functions | 별도 상업 권리 없이는 코어 제외 | R | https://github.com/patriciogonzalezvivo/lygia |
| 셰이더 | glsl-pipeline | MIT | TS/WebGL/Three.js | multi-pass·double-buffer shader pipeline | WebGL effect prototype | B | https://github.com/patriciogonzalezvivo/glsl-pipeline |
| 비OSS 비교 | Aseprite | source-available EULA | C++ | pixel art 전문 UX | 비교만 수행 | E | https://github.com/aseprite/aseprite |
| 비OSS 비교 | Mixbox | 상업/별도 조건 | 다중 언어 | 자연스러운 pigment mixing | Spectral.js/Hokusai 비교 | E/R | https://github.com/scrtwpns/mixbox |

---

# 부록 D. CSP 전환 UI/UX 명령 동선 63개 전체 매핑

| 매핑ID | 분야 | CSP 개념·기능 | ToonStudio 대응 | 기본 노출명 | 검색 별칭 | 데스크톱 동선 | 태블릿 동선 | 마이그레이션 정책 | 핵심 모듈 | 우선순위 | 수용 기준 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cspmap.entry.001 | 진입 | 새 캔버스 | New Project Wizard | 새 작품 | 새 캔버스, New, 일러스트, 만화, 웹툰, 애니메이션 | File > New 또는 홈 | 홈의 큰 새 작품 버튼 | CSP 작품 용도·해상도·기본 표현색 프리셋 이식 | ProjectTemplateRegistry | P0 | CSP 사용자 90%가 설명 없이 새 원고 생성 |
| cspmap.entry.002 | 진입 | 파일 열기 | Migration-aware Open | 열기/가져오기 | Open, 가져오기, CLIP 열기, PSD 열기 | 드래그앤드롭·File > Open | 파일 앱·공유 시트 | 확장자 탐지 후 일반 열기/마이그레이션 자동 분기 | FormatGateway | P0 | 파일 선택 후 1단계 안에 캔버스 또는 보고서 표시 |
| cspmap.entry.003 | 진입 | CLIP STUDIO 프로젝트 | Project Hub | 프로젝트 | 작품 관리, 프로젝트, 최근 파일, 클라우드 | 홈/사이드바 | 홈 카드 | 원본 .clip/.cmc와 변환본을 한 카드에 묶음 | ProjectIndex + SQLite WASM | P0 | 최근·복구·원본 상태를 한 화면에서 식별 |
| cspmap.mode.004 | 모드 | Simple Mode | Focus Mode | 집중 모드 | 간단 모드, Simple, 초보 모드 | View > Workspace Mode | 상단 모드 버튼 | 필수 도구·레이어·색·되돌리기만 노출 | WorkspaceProfile | P0 | 3초 내 전환, 문서 상태 불변 |
| cspmap.mode.005 | 모드 | Studio Mode | Studio Mode | 스튜디오 모드 | 전문가 모드, Studio, 전체 기능 | 기본 데스크톱 | 상단 모드 버튼 | CSP형 팔레트 구성을 기본 프리셋으로 제공 | WorkspaceProfile | P0 | CSP 핵심 팔레트 위치를 첫 시선에 발견 |
| cspmap.tool.006 | 도구 | Tool palette | Tool Rail | 도구 | Tool, 툴, 도구 팔레트 | 왼쪽 세로 레일 | 왼손/오른손 도킹 | CSP 도구군 순서 프리셋 제공 | ToolRegistry | P0 | 펜·지우개·채우기·선택이 1클릭 |
| cspmap.tool.007 | 도구 | Tool Group palette / 구 Sub Tool | Preset Browser | 브러시·도구 그룹 | Sub Tool, 서브툴, Tool Group, 보조 도구 | Tool Rail 옆 접이식 패널 | 하단 시트·팝업 | 구/신 CSP 명칭을 검색 별칭으로 동시 유지 | PresetLibrary | P0 | 기존 용어 어느 쪽으로도 검색 결과 동일 |
| cspmap.tool.008 | 도구 | Tool Property palette | Context Tool Bar | 도구 속성 | Tool Property, 도구 프로퍼티, 브러시 속성 | 캔버스 상단 또는 좌측 하단 | 캔버스 하단 HUD | 크기·불투명도·안정화·혼색 등 자주 쓰는 값만 노출 | PropertySchema | P0 | 주요 속성 변경이 1클릭 또는 1제스처 |
| cspmap.tool.009 | 도구 | Advanced Tool Settings / 구 Sub Tool Detail | Advanced Inspector | 고급 도구 설정 | Sub Tool Detail, 보조 도구 상세, Advanced Tool Settings | 오른쪽 Inspector 탭 | 전체 화면 시트 | CSP 카테고리와 BrushGraph 양방향 연결 | BrushGraphInspector | P0 | 모든 노출값 검색·즐겨찾기·초기화 가능 |
| cspmap.tool.010 | 도구 | Tool Settings lock/reset/save default | Preset State Controls | 잠금·초기화·기본값 저장 | 기본값, 잠금, reset, save default | 속성 헤더 | 점 3개 메뉴 | 프리셋 원본/사용자 변경/문서 override를 구분 | PresetVersioning | P0 | 실수로 프리셋 원본 덮어쓰기 방지 |
| cspmap.quick.011 | 빠른 동작 | Quick Access palette | Quick Deck | 빠른 실행 | Quick Access, 퀵 액세스, 즐겨찾기 | 좌/우 도킹 또는 팝업 | 스마트폰 Remote Deck·하단 시트 | 도구·명령·오토액션·색상을 같은 슬롯에 등록 | CommandRegistry | P0 | 사용자가 30초 내 새 세트 생성·재배치 |
| cspmap.quick.012 | 빠른 동작 | Command Bar | Action Bar | 명령 바 | Command Bar, 커맨드 바, 상단 바로가기 | 상단 고정·사용자 그룹 | 상단 축약 | CSP형 기본 그룹 + ToonStudio 고유 상태 배지 | CommandRegistry | P0 | 저장·Undo·변형·좌우반전 즉시 발견 |
| cspmap.quick.013 | 빠른 동작 | Selection Launcher | Selection HUD | 선택 도구막대 | Selection Launcher, 선택 런처, 플로팅 바 | 선택 영역 근처 | 손가락을 가리지 않는 자동 위치 | 변형·반전·채우기·삭제·톤·마스크를 문맥 노출 | ContextActionResolver | P0 | 선택 후 상용 명령 80%가 포인터 이동 180px 이내 |
| cspmap.quick.014 | 빠른 동작 | Pop-up palettes | Pop-up Panels | 팝업 패널 | 팝업 팔레트, palette popup | 단축키/펜 버튼으로 커서 근처 | 롱프레스/제스처 | 색·레이어·브러시·Quick Deck를 임시 표시 | OverlayManager | P0 | 호출·선택·닫기가 한 손동작으로 완료 |
| cspmap.input.015 | 입력 | Tool shift | Momentary Tool Switch | 누르는 동안 도구 전환 | 임시 도구, tool shift, hold shortcut | 단축키 홀드 | Remote Deck 모드키 홀드 | 홀드/토글 임계시간 사용자 설정 | InputBindingEngine | P0 | 키 릴리스 시 정확히 원도구 복귀 |
| cspmap.input.016 | 입력 | Modifier Key Settings | Context Modifier Map | 보조키 설정 | Modifier, Shift Ctrl Alt, 보조 키 | 도구·버튼·장치별 매핑 | 펜 버튼·손가락·Remote Deck | CSP 프로필을 기본 제공하되 충돌 검사 | InputBindingEngine | P0 | 도구별 보조키 의미를 UI에서 즉시 확인 |
| cspmap.input.017 | 입력 | Space Hand | Temporary Pan | 임시 손 도구 | Space, pan, hand | Space 홀드 | 한 손가락/두 손가락 설정 | CSP 내비게이션 프리셋 | ViewportController | P0 | 획과 팬 오인식 0.1% 미만 |
| cspmap.input.018 | 입력 | Shift+Space Rotate | Temporary Rotate | 임시 회전 | rotate canvas, 캔버스 회전 | Shift+Space 홀드 | 두 손가락 회전 | 회전 스냅·원점 복귀 제공 | ViewportController | P0 | 회전 중 입력 지연 증가 없음 |
| cspmap.input.019 | 입력 | Ctrl/Cmd+Space Zoom | Temporary Zoom | 임시 확대/축소 | zoom, 캔버스 확대 | Ctrl/Cmd+Space | 핀치 | 마우스·펜 방향 옵션 제공 | ViewportController | P0 | 포인터 아래 지점 유지 |
| cspmap.input.020 | 입력 | Alt Eyedropper | Temporary Eyedropper | 임시 스포이드 | Alt, color pick, 색 추출 | Alt 홀드 | 펜 버튼/롱프레스 | 표시색·레이어색·참조색 모드 기억 | ColorSampler | P0 | 릴리스 즉시 이전 브러시 상태 복귀 |
| cspmap.input.021 | 입력 | Brush size drag | Brush HUD Drag | 브러시 크기 드래그 | 크기 변경, Ctrl Alt drag, HUD | 사용자 지정 조합키+드래그 | 화면 홀드+드래그 | 크기·불투명도·경도 2D HUD 옵션 | BrushHUD | P0 | 캔버스를 보며 정밀 조정 |
| cspmap.input.022 | 입력 | Tablet input frequency | Input Quality Profile | 입력 품질 | Prefer speed, Prefer quality, 샘플링 | Capability Center | 자동 추천·수동 전환 | 장치별 샘플 누락·지연 측정 후 추천 | InputProfiler | P0 | 99퍼센타일 입력 지연과 누락률 표시 |
| cspmap.layer.023 | 레이어 | Layer palette | Layer Tree | 레이어 | Layer, 레이어 팔레트 | 오른쪽 기본 도킹 | 하단 시트/오른쪽 도킹 | CSP 아이콘 의미와 비슷한 순서, 다른 시각 언어 | LayerGraph | P0 | 래스터·벡터·폴더·마스크를 즉시 구분 |
| cspmap.layer.024 | 레이어 | Layer Property palette | Layer Effects Inspector | 레이어 속성 | Layer Property, 표현색, 톤, 레이어 컬러 | 레이어 탭 상단/Inspector | 레이어 상세 시트 | 표현색·톤·경계·색상·효과를 비파괴 노드로 매핑 | EffectGraph | P0 | CSP 원본 의미와 ToonStudio 확장 상태 동시 표시 |
| cspmap.layer.025 | 레이어 | Reference layer | Reference Role | 참조 레이어 | reference, 참조, 채우기 참조 | 레이어 아이콘/컨텍스트 | 스와이프 메뉴 | 복수 역할 태그로 확장 | LayerRoleGraph | P0 | 채우기·자동선택이 동일 역할을 공유 |
| cspmap.layer.026 | 레이어 | Draft layer | Draft Role | 밑그림 레이어 | draft, 밑그림, 스케치 | 레이어 아이콘 | 레이어 메뉴 | 내보내기·채우기·AI 참조 여부를 분리 설정 | LayerRoleGraph | P0 | 출고 프리셋에서 예측 가능한 제외 |
| cspmap.layer.027 | 레이어 | Vector layer | Editable Stroke Layer | 벡터 레이어 | vector, 선 수정, 선폭 수정 | 새 레이어 메뉴 | 추가 버튼 길게 누르기 | StrokeIR·Vello/CanvasKit·Google Ink 결과 유지 | VectorLayerBackend | P0 | 선폭·제어점·브러시 재적용 가능 |
| cspmap.layer.028 | 레이어 | Frame border folder | Panel Frame Group | 컷 테두리 폴더 | frame border, 컷, 칸 | Comic 메뉴/레이어 추가 | 웹툰 퀵툴 | 컷 마스크·거터·독서순서를 의미 객체로 저장 | ComicGraph | P0 | 컷 분할 후 레이어 자동 배치 |
| cspmap.layer.029 | 레이어 | Balloon/Text layer | Dialogue Object | 말풍선·텍스트 | balloon, 대사, 말풍선, text | Text & Balloon 도구 | 하단 텍스트 시트 | 텍스트·꼬리·화자·번역을 분리된 의미 객체로 저장 | DialogueGraph | P0 | 언어 변경 후 자동 재배치 |
| cspmap.layer.030 | 레이어 | Tone | Procedural Tone Node | 스크린톤 | tone, 망점, 톤 | Layer Property/Filter | 톤 HUD | LPI·각도·농도·모아레 검사를 실시간 노드화 | WebGPU Tone Engine | P0 | 확대율과 무관한 안정적 출력 |
| cspmap.layer.031 | 레이어 | Correction layer | Adjustment Layer | 보정 레이어 | tonal correction, adjustment, 보정 | Layer > New Adjustment | 추가 메뉴 | EffectGraph 비파괴 노드로 직접 매핑 | EffectGraph | P0 | PSD/ORA 출력 시 지원 여부 보고 |
| cspmap.layer.032 | 레이어 | File object | Linked Asset | 연결 파일 | file object, linked, 파일 오브젝트 | File > Import/Create linked | 자산 메뉴 | 원본·프록시·버전·변환 행렬을 유지 | AssetGraph | P1 | 원본 변경 시 명시적 업데이트 |
| cspmap.layer.033 | 레이어 | 2D camera folder | Camera Track Group | 2D 카메라 | 2D camera, 카메라 폴더 | Animation 메뉴 | 타임라인 시트 | 카메라를 공통 TimelineGraph로 매핑 | TimelineGraph | P1 | GIF/영상/웹 프리뷰 동일 동작 |
| cspmap.color.034 | 색상 | Color Wheel palette | Color Wheel | 색상환 | Color Wheel, 컬러 휠 | 오른쪽 상단 | 팝업/Remote Deck | HSV/HSL/OKLCH·gamut 상태 표시 | ColorEngine | P0 | 색상 선택 후 즉시 브러시 반영 |
| cspmap.color.035 | 색상 | Color Set palette | Palette Library | 색상 세트 | Color Set, 팔레트, cls, aco | 도킹 패널 | 하단 시트 | .cls/.aco/ASE/GPL 등 통합 라이브러리 | PaletteGateway | P0 | 가져온 순서·이름·투명색 유지 |
| cspmap.color.036 | 색상 | Intermediate/Approximate Color | Color Lab Panels | 색상 탐색 | 중간색, 근사색, 컬러 히스토리 | 색상 탭 | 스와이프 탭 | CSP 패널을 단일 Color Lab로 통합 | ColorEngine | P1 | 동일 기능 중복 없이 목적별 탭 |
| cspmap.color.037 | 색상 | Color Mixing | Mixing Pad | 색 혼합 | color mixing, 믹싱, 팔레트 | 팝업 패널 | Remote Deck/전면 패널 | Spectral.js·Hokusai와 브러시 혼색 연동 | PigmentEngine | P1 | 혼합 결과를 색상 세트로 드래그 |
| cspmap.asset.038 | 자료 | Material palette | Asset Vault | 소재 | Material, 소재, Assets | 왼쪽/오른쪽 도킹 | 전체 화면 자산 브라우저 | 이미지·브러시·톤·3D·템플릿·워크스페이스 통합 | AssetGraph | P0 | 드래그만으로 적합한 대상에 설치/삽입 |
| cspmap.asset.039 | 자료 | Sub View palette | Reference Desk Mini | 보조 보기 | Sub View, 레퍼런스, 참고 이미지 | 탭/플로팅 | Remote Deck 카메라 연동 | 픽업 팔레트·뒤집기·비교·출처 보존 | ReferenceGraph | P0 | 현재 작업을 가리지 않고 참조 전환 |
| cspmap.asset.040 | 자료 | Item Bank | Project Assets | 프로젝트 자산 | Item Bank, 아이템 뱅크, 파일 목록 | 프로젝트 패널 | 자산 시트 | 대용량 이미지·오디오·3D 프록시와 사용처 표시 | AssetGraph | P1 | 미사용·누락·중복 자산 검출 |
| cspmap.automation.041 | 자동화 | Auto Action | Automation Recipe | 자동 작업 | Auto Action, 오토액션, laf, 매크로 | Automation 패널 | Quick Deck 실행 | 명령 ID 기반 안전한 레시피로 변환 | AutomationGraph | P1 | 실행 전 영향 미리보기·취소 가능 |
| cspmap.automation.042 | 자동화 | Shortcut Settings | Shortcut & Gesture Studio | 단축키·제스처 | shortcut, 단축키, 키 설정 | Preferences | 설정 전체화면 | CSP 프리셋·사용자 충돌 해결·검색 | InputBindingEngine | P0 | 모든 명령을 ID·별칭으로 검색 |
| cspmap.workspace.043 | 작업공간 | Workspace | Workspace Profile | 작업공간 | workspace, 팔레트 배치, 워크스페이스 | Window > Workspace | 모드 선택기 | 레이아웃·단축키·Action Bar·단위·장치 오버라이드 | WorkspaceManager | P0 | 장치 크기가 달라도 의미 위치 유지 |
| cspmap.workspace.044 | 작업공간 | Workspace material | Shareable Workspace Package | 작업공간 패키지 | workspace material, 설정 공유 | 가져오기 센터 | 클라우드/QR | CSP 직접 읽기 불가 시 설정 스크린샷·내보내기 번들 안내 | MigrationCenter | P2 | 미지원 요소가 보고서에 명시 |
| cspmap.workspace.045 | 작업공간 | Palette docking | Dock Layout Engine | 패널 배치 | palette, dock, 패널 | 드래그·탭·자동 숨김 | 스냅 도킹·하단 시트 | CSP형 좌·우 팔레트 스택 프리셋 | DockLayout | P0 | 실수 이동 잠금·되돌리기 제공 |
| cspmap.misc.046 | 내비게이션 | Navigator palette | Navigator | 내비게이터 | Navigator, 썸네일, 회전 | 오른쪽 상단 | 핀치 미니맵 | 줌·회전·반전·표시영역을 한 패널에 유지 | ViewportController | P0 | 캔버스 상태와 1프레임 내 동기화 |
| cspmap.misc.047 | 내비게이션 | Flip horizontal/vertical | View Mirror | 좌우·상하 반전 보기 | mirror, flip, 좌우반전 | Action Bar·View | 두 손가락/Quick Deck | 보기 반전과 실제 변형을 명확히 구분 | ViewportController | P0 | 상태 표시와 Undo 오인 방지 |
| cspmap.misc.048 | 내비게이션 | Webtoon Preview | Scroll Preview | 웹툰 스크롤 미리보기 | webtoon preview, 스마트폰 보기 | 별도 프리뷰 창 | Remote Deck/전화 화면 | 플랫폼별 폭·간격·안전영역·로딩 시뮬레이션 | PublishPreview | P0 | 실기기 너비 프리셋 전환 |
| cspmap.misc.049 | 페이지 | Page Manager/Story | Episode & Page Manager | 에피소드·페이지 | Page Manager, Story, 페이지 관리, cmc | 왼쪽 프로젝트 트리 | 페이지 썸네일 시트 | .cmc 구조를 ProjectGraph로 매핑 | ProductionGraph | P0 | 페이지 재정렬·추가·일괄 설정이 비파괴 |
| cspmap.misc.050 | 페이지 | Story Editor | Dialogue & Script Editor | 대사·스크립트 | Story Editor, 대사 편집, 스토리 에디터 | 분할 문서 보기 | 전체화면 텍스트 편집 | 말풍선 ID와 대사·번역·TTS를 연결 | StoryGraph | P1 | 캔버스·대본 양방향 선택 |
| cspmap.animation.051 | 애니메이션 | Timeline palette | Timeline | 타임라인 | timeline, 애니메이션 | 하단 도킹 | 전체화면/하단 시트 | 셀·키프레임·카메라·오디오를 공통 트랙으로 표현 | TimelineGraph | P1 | CSP 단축키·프레임 개념 별칭 제공 |
| cspmap.3d.052 | 3D | 3D layer/Object Launcher | Pose Stage + Object HUD | 3D·포즈 | 3D layer, Object Launcher, 포즈 | 선택 객체 근처 HUD | 하단 3D 컨트롤 | VRM/glTF/OBJ/FBX/BVH/PEP 경로를 통합 | Scene3DIR | P1 | 포즈·카메라·빛을 동일 문서에 저장 |
| cspmap.misc.053 | 보조기기 | Companion Mode | Remote Deck PWA | 스마트폰 리모컨 | Companion, 리모컨, 스마트폰 | QR 연결 | 스마트폰 PWA | Quick Deck·색·제스처·참조·웹툰 프리뷰 제공 | RemoteDeck | P1 | 동일 LAN 또는 안전한 세션 연결 |
| cspmap.storage.054 | 저장 | Recovery data | Continuous Journal | 자동 복구 | recovery, 복구, autosave | 상태 바·History | 상태 바 | 명령 저널+타일 diff+체크포인트 | OPFSJournal | P0 | 강제 종료 후 마지막 확정 동작까지 복구 |
| cspmap.storage.055 | 저장 | Background save | Non-blocking Save | 백그라운드 저장 | background save, 저장 중 작업 | 상태 배지 | 상태 배지 | 스냅샷 시점을 명시하고 이후 변경은 다음 저널에 기록 | StorageWorker | P0 | 저장 중 입력 프레임 저하 5% 이하 |
| cspmap.storage.056 | 저장 | Save compatibility mode | Versioned Native Package | 버전 호환 저장 | compatibility mode, 하위 버전 | Save Options | 내보내기 시트 | 스키마 마이그레이션+fallback snapshot+opaque 노드 보존 | SchemaMigration | P1 | 구버전 뷰어가 최소 composite를 표시 |
| cspmap.help.057 | 도움말 | Icon explanation | Context Help | 도구 도움말 | help, 설명, F1, 아이콘 설명 | hover/F1 | 탭 후 설명·영상 | CSP·Photoshop 용어 역검색과 현재 상태 진단 | HelpGraph | P0 | 어떤 도구도 2단계 내 도움말 도달 |
| cspmap.accessibility.058 | 접근성 | Touch interface scaling | Adaptive Density | 터치 UI 크기 | touch UI, interface scaling | Preferences | 자동·수동 | 펜·손가락·화면 크기에 따라 hit target 조절 | AdaptiveUI | P0 | 최소 터치 타깃 44 CSS px |
| cspmap.accessibility.059 | 접근성 | Interface color/density | Theme & Contrast | 테마·대비 | dark, light, density, UI 색 | Preferences | 설정 | 다크/라이트/고대비·색각 보조·중립 캔버스 | DesignTokenSystem | P0 | WCAG 대비 검사 통과 |
| cspmap.migration.060 | 마이그레이션 | 사용자 설정 폴더/클라우드 | CSP Migration Center | CSP에서 가져오기 | CELSYS, 설정 이전, 브러시 이식 | 홈 > 가져오기 | 클라우드/파일 선택 | 사용자 동의하에 Local ToonBridge가 목록화하고 원본은 보존 | MigrationCenter | P0 | 가져오기 전 어떤 데이터가 읽히는지 명시 |
| cspmap.migration.061 | 마이그레이션 | 소재 정리 | Migration Collections | 이전한 소재 | 다운로드 소재, material, asset | Asset Vault 컬렉션 | 자산 시트 | 원본 폴더·CSP 태그·출처·라이선스·사용 빈도 유지 | AssetGraph | P0 | 중복 해시·누락 팁·깨진 링크 검출 |
| cspmap.migration.062 | 마이그레이션 | 브러시 테스트 | Brush Fidelity Lab | 브러시 비교 | brush test, 필기감 비교 | Migration Report | 테스트 캔버스 | 압력별 선·점·곡선·혼색 표준 시트 자동 생성 | BrushFidelityHarness | P0 | 시각 차이와 원인·대체 엔진 표시 |
| cspmap.migration.063 | 마이그레이션 | 파일 변환 결과 | Interop Report | 호환성 보고서 | conversion report, 손실, 호환성 | 열기 후 사이드 패널 | 요약 카드 | 정확/근사/Bake/보존 전용을 객체별 표시 | InteropReport | P0 | 사용자가 숨은 손실 없이 저장 결정을 내림 |

---

# 부록 E. V4.4 전체 원문 보존

> 아래는 이전 통합 문서의 전체 원문이다. V5와 충돌하면 V5 본문을 우선하며, 세부 조사 추적과 과거 설계 근거를 보존하기 위해 포함한다.


# ToonStudio Google Ink·스타일러스·손가락 입력 실구현성·성능·품질 최종 보완 아키텍처 V4.4

## V4.3 정밀 감사 위에 Google Ink 오픈소스 코어의 현재 상태, 스타일러스·손가락·필기 입력, 저지연 렌더링, 팜리젝션, 필기 인식, CSP 전환 UX를 생산 코드 수준으로 다시 설계한 통합본

- 기준일: 2026-08-07
- 기준 제품: `https://www.toonstudio.cloud/studio`
- 기준 문서: V4.3 전체를 부록 A에 원문 통합
- 이번 버전의 핵심: **Google Ink를 최고급 벡터 잉킹의 주력 후보로 승격하되, 웹용 완제품 API처럼 과장하지 않고 C++ 코어→WASM·WGSL 렌더러 포팅 경로와 실패 폴백을 명확히 정의**
- 입력 목표: 스타일러스, Apple Pencil, S Pen, Surface Pen, Wacom 계열, 마우스, 트랙패드, 손가락, 멀티터치, 필기 인식까지 하나의 `InputCore`에서 일관되게 처리

> 이 문서의 V4.4 본문은 V4.3의 `Google Ink 전체 메시 브러시 = 연구 전용` 판정을 수정한다. 2026년 8월 현재 Google Ink 공개 저장소에는 Apache-2.0 C++ 코어, 모듈 버전 1.1.0, Dawn 의존성, 비-Skia 렌더러용 WGSL 셰이더가 존재한다. 따라서 **브라우저용 패키지는 아니지만 선별 모듈 WASM 포팅과 자체 WebGPU 래퍼를 전제로 한 조건부 생산 후보**로 격상한다. 단, 공식 JavaScript SDK·Emscripten 빌드·브라우저 렌더러 래퍼가 없으므로 PoC 게이트를 통과하기 전 기본 출시 경로로 고정해서는 안 된다.

---

# 0. 최종 결론

## 0.1 구현 가능성 최종 판정

Google Ink를 최대한 활용한 웹 드로잉 엔진은 **구현 가능하다.** 정확한 형태는 다음과 같다.

```text
잘못된 가정
Google Ink Android API를 npm으로 설치
→ 브라우저에서 바로 사용

실제 구현 경로
Google Ink Apache-2.0 C++ Core
→ 필요한 모듈만 고정 commit으로 vendoring
→ 얇은 C ABI
→ Emscripten/WASM 포팅
→ 입력 batch와 변경 mesh range만 JS에 노출
→ 공개 WGSL 셰이더를 ToonStudio WebGPU RenderCore에 통합
→ Vello·CanvasKit·래스터·3D 아일랜드와 최종 합성
```

Jetpack Ink 1.0.0은 Android에서 안정판이지만, ToonStudio 웹은 Jetpack Kotlin API를 직접 사용하는 것이 아니라 그 기반인 공개 C++ 코어를 사용한다. 1.1 계열의 커스텀 브러시·부분 획 지우개·텍스처 애니메이션은 유용하지만 알파 기능이므로 브라우저 제품에서는 개별 기능 플래그와 자체 직렬화가 필요하다.

## 0.2 Google Ink를 주력으로 쓸 영역

```text
최고급 G펜·매핑펜·붓펜
압력·기울기·방향·속도 기반 가변 팁
벡터 마커·형광펜
캘리그래피·평붓
패턴·스탬프·장식 브러시
다중 coat 잉킹
시간 기반 젖은 잉크 시각 애니메이션
벡터 획 선택·충돌·지우개·분할
필기·주석·서명
손가락 전용 벡터 브러시
```

## 0.3 Google Ink를 주력으로 쓰지 않을 영역

```text
픽셀아트 정수 격자 브러시
대형 래스터 에어브러시
클론·힐링·인페인팅
실제 안료 수채·수묵 유체
유화 픽업·디포짓
수백 가닥 물리 브러시모
수십만 GPU 파티클
3D 텍스처 페인팅
```

이 영역은 기존 Custom WebGPU, Hokusai/libmypaint, Rust/WASM XPBD, OpenCV, Three.js 백엔드가 담당한다. Google Ink 메시를 **주입 마스크·벡터 가이드·편집 가능한 획 원본**으로 결합할 수는 있지만 물리·유체 엔진을 대체하지 않는다.

## 0.4 가장 중요한 입력 구조 교정

DOM의 Pointer Event는 Worker가 직접 받는 것이 아니라 메인 스레드의 DOM 이벤트 핸들러가 받는다. 따라서 생산 구조는 다음과 같아야 한다.

```text
Main Thread Pointer Capture — DOM 이벤트 수신, 무할당, React 상태 금지
→ SharedArrayBuffer Ring 또는 Transferable Batch
→ Ink Worker — 정규화·교정·Google Ink 입력 모델·mesh 생성
→ Render Worker — Google Ink WGSL·Vello·WebGPU 합성
→ Storage Worker — 원시 입력·브러시 버전·명령 저널 저장
```

메인 스레드에서 해야 할 일은 이벤트를 읽어 고정 크기 구조체로 복사하는 것뿐이다. smoothing, pressure curve, 브러시 behavior, mesh 생성, 타일 합성은 모두 메인 스레드 밖에서 수행한다.

## 0.5 최종 활성 엔진 예산

```text
Google Ink WASM       최고급 벡터 잉킹 geometry
Google Ink WGSL       해당 메시의 완전 품질 렌더
Vello                 대량 벡터 장면·편집 오버레이·텍스트 주변 합성
CanvasKit             CJK 조판·Skia 효과·출력 기준선
Custom WebGPU         래스터·필터·자연매체·파티클
Three.js              선택형 3D 아일랜드
```

한 획을 Google Ink, Vello, CanvasKit에 동시에 중복 렌더하지 않는다. **Google Ink 복합 메시 획은 Google Ink WGSL이 최종 렌더하고, Vello에는 선택 윤곽·간소화 proxy·장면 합성 정보만 전달한다.** 단순 solid outline 획만 Vello/CanvasKit으로 직접 폴백한다.

# 1. 2026년 8월 Google Ink 현재 상태 재감사

## 1.1 공식 공개 상태
| 항목 | 현재 판정 | ToonStudio 정책 |
| --- | --- | --- |
| 라이선스 | Apache-2.0 | 상용 웹 SaaS에 직접 통합 가능. NOTICE·저작권 고지 유지 |
| 공개 코어 | C++ 모듈 구조 | color, types, geometry, brush, strokes, rendering, storage를 선택적으로 사용 |
| 저장소 모듈 버전 | 1.1.0 | 자체 adapter는 해당 commit과 최소 brush version을 함께 고정 |
| Android 안정판 | Jetpack Ink 1.0.0 | Android 네이티브 래퍼의 안정 기준선 |
| Android 최신 실험판 | 1.1.0-alpha06, 2026-07-29 | 부분 지우개·텍스처 애니메이션·버전 관리 기능은 실험 플래그 |
| 공개 WebGPU 자산 | `ink/rendering/webgpu/StrokeShader.wgsl` | 비-Skia 렌더러용 셰이더를 자체 WebGPU 파이프라인에 통합 가능 |
| 공식 브라우저 SDK | 없음 | npm·JS API로 바로 사용 불가 |
| 공식 Emscripten 타깃 | 문서화되지 않음 | Bazel→Emscripten toolchain 또는 별도 CMake wrapper PoC 필요 |
| API 안정성 | C++ 공개 구현은 hard guarantee 없음 | commit pin·자체 ABI·golden test 필수 |
| 공식 README 렌더 설명 | Android Mesh 중심 | 현재 main의 WGSL 코드가 README보다 앞서 있으므로 코드와 릴리스 노트를 함께 추적 |

## 1.2 V4.3 판정 수정

| 항목 | V4.3 | V4.4 최종 판정 |
|---|---|---|
| Google Ink Stroke Modeler | 조건부 실험 | 선택형 handwriting/smooth 모델. 정밀 선화 기본값은 아님 |
| Google Ink 전체 메시 | 연구 | **조건부 생산 후보**. WASM·WGSL PoC 통과 시 P1 주력 잉킹 |
| Google Ink WebGPU | 미성숙 추정 | 공식 WGSL 존재. 렌더 wrapper·리소스 관리·WebGL 폴백은 자체 구현 |
| 커스텀 브러시 | 장기 기능 | BrushBehavior·BrushTip·BrushPaint 기반 P1 Brush Designer 가능 |
| 부분 획 지우개 | 자체 구현 전제 | Google Ink geometry를 활용하되 1.1 알파 한계 때문에 자체 `StrokeEditIR` 저장 |
| 브러시 직렬화 | 입력 중심 | BrushFamily version·proto와 자체 normalized BrushProgramIR을 병행 저장 |

## 1.3 공식 코드에서 직접 활용 가능한 특성

Google Ink는 단순 pressure pen 라이브러리가 아니다.

```text
BrushBehavior
├─ pressure
├─ tilt X/Y·orientation
├─ speed·velocity·direction
├─ distance·time
├─ predicted distance/time
├─ time since input/stroke end
├─ acceleration·forward/lateral acceleration
├─ physical centimeter units
├─ noise·response curve·filter·operator
└─ stylus/touch/mouse별 enable filter

BrushTip
├─ scale·aspect
├─ corner rounding
├─ slant
├─ pinch
├─ rotation
├─ distance/time particle emission
└─ behavior graph

BrushPaint
├─ tiling texture
├─ stamping texture
├─ animated texture atlas
├─ wrap/repeat/mirror/clamp
├─ blend modes
├─ per-coat color functions
└─ self-overlap accumulate/discard

BrushFamily
├─ passthrough/sliding-window input model
├─ multiple coats
├─ renderer/device paint preferences
├─ client ID·developer metadata
└─ versioned serialization
```

이 특성을 최대한 활용하면 하나의 코어로 G펜, 캘리그래피, 마커, 형광펜, 점선, 장식 stamp, 손가락 마커, 시간 변화 잉크를 구성할 수 있다.

# 2. 최종 Google Ink 중심 모듈 아키텍처

## 2.1 전체 데이터 흐름

```text
PointerEvent Stream
→ PointerCaptureAdapter
→ InputArbitrator
→ DeviceCalibration
→ NormalizedInputBatch
→ GoogleInkWasmAdapter
   ├─ BrushFamily/InputModel
   ├─ InProgressStroke
   ├─ PartitionedMesh
   ├─ Geometry Queries
   └─ Storage Codec
→ GoogleInkMeshIR
→ GoogleInkWebGpuRenderer
→ HybridFrameGraph
   ├─ Vello vector/text island
   ├─ CanvasKit text/effect island
   ├─ Raster tile island
   ├─ Wet media island
   └─ 3D island
→ Display / Export / Recovery
```

## 2.2 패키지 경계

```text
packages/
├─ input-dom-capture
├─ input-core
├─ input-calibration
├─ input-arbitration
├─ input-gesture
├─ google-ink-wasm
├─ google-ink-abi
├─ google-ink-webgpu
├─ google-ink-brush-adapter
├─ google-ink-geometry-adapter
├─ brush-program-ir
├─ stroke-ir
├─ handwriting-core
├─ renderer-vello
├─ renderer-canvaskit
├─ renderer-raster-webgpu
├─ renderer-webgl2-fallback
├─ storage-ink
├─ diagnostics-input
└─ tests-ink-golden
```

Google Ink의 C++ 타입을 앱 전체에 노출하지 않는다. 앱은 자체 `StrokeIR`, `BrushProgramIR`, `InkMeshIR`만 안다. 이 경계 덕분에 upstream API 변경이나 WASM 포팅 실패 시 Perfect Freehand·Lyon·CanvasKit 경로로 대체할 수 있다.

## 2.3 앱의 영구 저장 원본

```ts
interface InkStrokeIR {
  id: string;
  schemaVersion: number;

  rawInputs: PackedPointerInputRef;
  normalizedInputs: PackedStrokeInputRef;

  brushProgramId: string;
  brushProgramVersion: number;
  googleInkMinVersion?: string;
  googleInkFamilyProto?: BlobRef;

  transform: Matrix3;
  randomSeed: number;
  toolType: 'stylus' | 'touch' | 'mouse' | 'unknown';

  editOperations: StrokeEditOperation[];
  meshCache?: InkMeshCacheRef;
  outlineProxy?: VectorPathRef;

  engineFingerprint: {
    adapterVersion: string;
    upstreamCommit: string;
    shaderVersion: string;
  };
}
```

영구 원본은 `PartitionedMesh` 하나가 아니다. 원시 입력과 정규화 입력, 브러시 정의, 수정 명령을 저장하고 mesh는 재생성 가능한 캐시로 취급한다. 부분 지우개처럼 upstream 직렬화가 미완성인 기능은 자체 `StrokeEditOperation`으로 저장한다.

## 2.4 최소 C ABI
```c
// 수명과 버전
ink_runtime_t* toon_ink_runtime_create(const toon_ink_runtime_config_t* config);
void toon_ink_runtime_destroy(ink_runtime_t* runtime);
const char* toon_ink_upstream_version(void);

// 브러시
ink_brush_family_t* toon_ink_brush_family_decode(
    ink_runtime_t*, const uint8_t* proto, size_t size);
ink_brush_family_t* toon_ink_brush_family_from_ir(
    ink_runtime_t*, const toon_brush_program_t* program);
void toon_ink_brush_family_destroy(ink_brush_family_t*);

// 획
ink_stroke_t* toon_ink_stroke_begin(
    ink_runtime_t*, ink_brush_family_t*, const toon_brush_instance_t*);
int toon_ink_stroke_append_batch(
    ink_stroke_t*, const toon_pointer_sample_t*, uint32_t count,
    const toon_prediction_boundary_t* prediction);
int toon_ink_stroke_finish(ink_stroke_t*);
void toon_ink_stroke_cancel(ink_stroke_t*);

// 증분 mesh
int toon_ink_stroke_get_mesh_delta(
    ink_stroke_t*, toon_mesh_delta_t* out_delta);
int toon_ink_stroke_get_bounds(
    ink_stroke_t*, toon_rect_t* out_bounds);

// 기하·편집
int toon_ink_stroke_hit_test_point(...);
int toon_ink_stroke_intersects_shape(...);
int toon_ink_stroke_split_by_eraser(...);

// 저장
int toon_ink_encode_inputs(...);
int toon_ink_decode_inputs(...);
```

### ABI 원칙

- JS→WASM 호출은 샘플 하나마다 하지 않고 한 이벤트의 coalesced batch 단위로 한다.
- WASM linear memory 안의 고정 크기 ring buffer를 재사용한다.
- mesh 전체를 매번 복사하지 않고 변경된 vertex/index byte range만 반환한다.
- C++ 예외는 ABI 밖으로 전파하지 않고 status code와 diagnostic buffer로 변환한다.
- upstream 타입의 포인터는 해당 Worker 밖으로 보내지 않는다.
- 브러시·pipeline·texture는 ID와 hash로 캐시한다.
- 객체 수명과 소유권을 자동 테스트한다.

# 3. Google Ink 포팅의 실제 구현 계획
| 게이트 | 단계 | 구현 범위 | 통과 조건 |
| --- | --- | --- | --- |
| GINK-B0 | 고정 commit vendoring | LICENSE·MODULE·모듈 의존성 SBOM 생성 | 1일 재현 빌드와 hash 일치 |
| GINK-B1 | Linux native core 빌드 | color/types/geometry/brush/strokes/storage 테스트 | 공식 테스트와 자체 golden 모두 통과 |
| GINK-B2 | 최소 Emscripten 빌드 | Skia·Dawn·Android 제외, geometry/brush/strokes 먼저 | WASM 모듈 로드·1000획 생성 |
| GINK-B3 | C ABI | 배치 입력·증분 mesh·상태 코드 | 핫 루프 JS 객체 0개, leak 0 |
| GINK-B4 | WebGPU shader | 공개 WGSL + Toon bind group·texture registry | Skia reference와 시각 diff 통과 |
| GINK-B5 | 텍스처·다중 coat | tiling/stamping/animation/self-overlap | 대표 브러시 20종 golden 통과 |
| GINK-B6 | geometry 편집 | hit test·lasso·whole/partial erase·split | Undo/Redo 및 재직렬화 가능 |
| GINK-B7 | storage/version | BrushFamily proto·input codec·최소 버전 | 구버전 열기·신버전 경고 |
| GINK-B8 | WebGL2 폴백 | WGSL 동등 GLSL 또는 subset rasterizer | 호환 브라우저에서 핵심 8종 브러시 |
| GINK-B9 | server/native renderer | headless reference export | 브라우저와 동일 입력의 diff 기준선 |

## 3.1 빌드 위험을 낮추는 선별 모듈 전략

초기 WASM에는 다음만 포함한다.

```text
필수
ink/color
ink/types
ink/geometry
ink/brush
ink/strokes
ink/storage
protobuf runtime subset
abseil required subset
libtess2 required subset

초기 제외
Android JNI
Android View/Compose authoring
Skia native renderer
Dawn native renderer wrapper
전체 fuzz/benchmark target
```

공개 WGSL은 별도의 정적 자산으로 ToonStudio WebGPU renderer에 포함한다. C++에 Dawn까지 링크해 WebAssembly에서 다시 WebGPU를 소유하게 만들지 않는다. **브라우저 GPUDevice는 ToonStudio Rust/wgpu 또는 TypeScript WebGPU RenderCore가 하나만 소유**하고, Google Ink WASM은 geometry 생성에 집중한다.

## 3.2 실제 난도 판정

| 작업 | 바이브코딩 적합성 | 전문 검토 필요성 |
|---|---:|---:|
| TypeScript InputCore·상태 머신 | 높음 | 중간 |
| Brush Designer UI | 높음 | 중간 |
| C ABI boilerplate | 중간 | 높음 |
| Bazel/Emscripten toolchain | 낮음~중간 | 매우 높음 |
| WASM 메모리·수명 | 중간 | 매우 높음 |
| WGSL bind group·mesh format | 중간 | 매우 높음 |
| WebGL2 shader 동등 구현 | 중간 | 높음 |
| 시각 golden·benchmark harness | 높음 | 높음 |
| 브러시 튜닝 | 중간 | 작가 실기 평가 필수 |

AI 코딩 도구로 wrapper·테스트·코드 생성은 크게 가속할 수 있지만, **툴체인·메모리·GPU 형식·필기감의 최종 판정은 전문 개발자와 실제 작가 테스트가 필요**하다.

# 4. 스타일러스·손가락 공통 입력 코어

## 4.1 정규화 입력 구조

```ts
interface RawPointerSample {
  pointerId: number;
  pointerType: 'pen' | 'touch' | 'mouse' | '';
  phase: 'down' | 'move' | 'up' | 'cancel' | 'hover';

  clientX: number;
  clientY: number;
  timeStamp: number;

  pressure: number;
  tangentialPressure: number;
  width: number;
  height: number;

  tiltX: number;
  tiltY: number;
  altitudeAngle: number;
  azimuthAngle: number;
  twist: number;

  button: number;
  buttons: number;
  isPrimary: boolean;

  provenance: 'actual' | 'coalesced' | 'predicted';
}

interface NormalizedInkSample {
  pointerId: number;
  toolType: 'stylus' | 'touch' | 'mouse' | 'unknown';

  xStroke: number;
  yStroke: number;
  elapsedSeconds: number;

  pressureRaw: number;
  pressureCalibrated: number;
  pressureSynthetic: boolean;

  tiltRadians?: number;
  orientationRadians?: number;
  twistRadians?: number;

  contactMajor?: number;
  contactMinor?: number;
  predicted: boolean;
}
```

`clientX/Y`를 곧바로 문서 좌표로 저장하지 않는다. 입력 시점의 viewport transform snapshot을 함께 사용해 `screen → canvas → layer → stroke` 좌표를 명시적으로 변환한다. 줌·회전·미러 중 획을 그려도 흔들리지 않게 한다.

## 4.2 이벤트 수집 순서

```text
pointerdown
→ setPointerCapture
→ 실제 dispatched event
→ getCoalescedEvents()를 시간순으로 병합
→ 중복된 parent event 제거
→ 실제 샘플 batch 전송
→ getPredictedEvents()는 별도 prediction tail로 전송
→ 다음 실제 샘플이 오면 이전 prediction tail 폐기
→ pointerup에서 실제 샘플만 최종 확정
→ pointercancel이면 preview·명령·mesh를 rollback
```

`pointerrawupdate`는 존재한다고 무조건 켜지 않는다. 런타임 probe와 실제 처리 시간 계측 결과가 기준을 만족할 때만 사용한다. W3C도 느린 핸들러가 페이지 성능을 악화시킬 수 있음을 경고하므로 일반 경로는 `pointermove + coalesced events`, 고주파 모드는 opt-in으로 둔다.

## 4.3 메인 스레드 핫패스 규칙

- React `setState` 금지
- 배열 `push`로 가변 객체 생성 금지
- 클로저·람다 생성 금지
- 좌표 변환은 미리 계산된 행렬 곱만 수행
- 브러시 lookup·네트워크·저장 접근 금지
- UI telemetry는 ring buffer counter만 증가
- 이벤트당 고정 크기 struct 복사
- COOP/COEP 환경에서는 SharedArrayBuffer 사용
- 비격리 환경에서는 1프레임 단위 transferable batch 사용
- event listener는 passive가 아니어야 캔버스의 기본 터치 조작을 통제할 수 있으나, 적용 범위는 캔버스 root로 한정

## 4.4 브라우저 기능 탐지

```ts
interface PointerRuntimeCapabilities {
  pointerEvents: boolean;
  coalescedEvents: boolean;
  predictedEvents: boolean;
  rawUpdate: boolean;
  altitudeAzimuth: boolean;
  tiltXY: boolean;
  twist: boolean;
  tangentialPressure: boolean;
  hoverObserved: boolean;
  delegatedInk: boolean;
}
```

브라우저 이름으로 분기하지 않고, 실제 이벤트에서 값의 변화 여부까지 관찰한다. 속성이 존재하지만 항상 0·기본값인 장치도 있기 때문이다.

# 5. 스타일러스 입력 고도화
| 항목 | InputCore 처리 | Google Ink 활용 | 제품 정책 |
| --- | --- | --- | --- |
| 필압 | 최소·dead-zone·최대·감마·LUT 교정 | BrushBehavior pressure→size/opacity/height | 장치별 프로필 |
| 기울기 | tiltX/Y 또는 altitude/azimuth 통일 | 폭·높이·slant·texture 방향 | 지원 없으면 방향 기반 대체 |
| 방위각 | 화면 회전과 캔버스 변환을 반영 | 평붓·연필 방향·캘리그래피 rotation | offset 보정 |
| twist | 0~359도 unwrap·노이즈 제거 | nib rotation·stamp rotation | 미지원 시 azimuth/진행방향 |
| tangentialPressure | 범위·부호 교정 | 에어브러시 flow·색상 변화 | 지원 장치만 노출 |
| hover | 위치·버튼·거리 추정 | 브러시 outline·도구 미리보기·스포이드 | hover 없는 장치에서 숨김 |
| barrel button | 버튼 chord·OS 우클릭 충돌 해소 | 임시 지우개·스포이드·팬 | CSP 프리셋 |
| eraser end | pointer button/tool 관찰 | 지우개 preset으로 임시 전환 | 원 도구 상태 정확히 복귀 |
| sample rate | timestamp 분포 측정 | 입력 모델 window·upsampling 자동 선택 | 60~1000Hz 범위 대응 |
| prediction | actual/predicted 분리 | preview만 사용 | 최종 데이터 저장 금지 |
| cancel | pointercancel 즉시 rollback | 팜 취소·OS gesture 취소 처리 | 명령 저널에 미커밋 |
| hover cursor | tip shape·size·angle 표시 | 실제 변형 nib outline | 성능 저하 시 원형 proxy |

## 5.1 장치별 교정 프로필

```ts
interface StylusDeviceProfile {
  fingerprint: string;          // 개인 식별 정보가 아닌 로컬 hash
  browserEngine: string;
  osFamily: string;

  pressure: {
    minObserved: number;
    deadZone: number;
    maxObserved: number;
    gamma: number;
    lut: Float32Array;
    hysteresis: number;
  };

  orientation: {
    azimuthOffset: number;
    invertX: boolean;
    invertY: boolean;
    twistOffset: number;
  };

  timing: {
    medianSampleIntervalMs: number;
    jitterMs: number;
    recommendedWindowMs: number;
    recommendedUpsampleHz: number;
  };

  buttons: PenButtonMapping[];
  palmProfileId: string;
}
```

### 자동 교정 마법사

1. 가볍게 3회, 보통 3회, 강하게 3회 긋기
2. 수직·수평·대각 기울기 sweep
3. 빠른 선과 느린 선
4. 짧은 점·긴 taper
5. 펜 버튼·지우개 끝 확인
6. 손바닥을 올린 상태의 획 검사
7. 자동 LUT 계산 후 CSP식 압력 곡선 UI에서 조정
8. G펜·연필·수채 프로필을 별도로 저장

교정값은 브러시 프리셋과 분리한다. 같은 브러시를 다른 기기에서 열어도 각 기기의 `StylusDeviceProfile`을 적용한다.

## 5.2 Google Ink 입력 모델 선택

```text
정밀 선화·도형 트레이싱
→ PassthroughModel + Toon Rust low-latency filter
→ 예측 약함 또는 끔

일반 G펜
→ 짧은 SlidingWindow 4~12ms
→ 180~240Hz upsampling

손글씨·서명
→ SlidingWindow 12~24ms 또는 Ink Stroke Modeler
→ 부드러움 우선

긴 배경선·자
→ 자체 constraint solver
→ Google Ink에는 이미 정제된 입력 전달

손가락 필기
→ 접촉 노이즈가 크므로 15~35ms adaptive window
```

공식 기본값인 20ms window·180Hz upsampling은 시작점일 뿐이다. ToonStudio는 장치 sample rate, 브러시 크기, 현재 속도, 사용자가 선택한 안정화 강도에 따라 동적으로 조정한다.

# 6. 손가락 드로잉·멀티터치·팜리젝션

## 6.1 입력 프로필
| 프로필 | 입력 의미 | 권장 용도 |
| --- | --- | --- |
| PenDrawTouchNavigate | 펜만 작화, 손가락은 팬·줌·회전 | CSP 사용자 기본 |
| PenDrawOneFingerColor | 펜 작화, 한 손가락 길게 눌러 색 선택, 두 손가락 내비게이션 | 태블릿 빠른 채색 |
| FingerDraw | 한 손가락 작화, 두 손가락 내비게이션 | 펜이 없는 모바일 |
| FingerAnnotate | 한 손가락 형광펜·주석, 두 손가락 이동 | 검토·교육 |
| MultiTouchPaint | 각 손가락이 독립 획 | 실험적 파티클·퍼포먼스 |
| Handwriting | 손가락/펜 획을 문자·제스처 후보로 유지 | 말풍선·노트·텍스트 입력 |
| TouchSculpt | 한 손가락 조형, 두 손가락 카메라, 압력은 면적·속도로 합성 | 3D·리퀴파이 |
| Accessibility | 긴 dwell·큰 타깃·떨림 억제·단일 손가락 모드 | 운동 제약 사용자 |

## 6.2 손가락 합성 압력

대부분의 웹 터치 장치는 실제 압력을 제공하지 않는다. ToonStudio는 가짜 값을 실제 센서처럼 표시하지 않고 `pressureSynthetic=true`를 기록한다.

```text
Constant
→ 일정 압력. 도형·픽셀·형광펜에 안정적

InverseSpeed
→ 느리면 진하고 굵게, 빠르면 가늘게

ContactArea
→ width×height가 신뢰 가능한 장치에서만 사용

DwellCurve
→ 머문 시간이 길수록 압력 증가

CurvatureAssist
→ 급한 곡선에서 크기 감소 또는 불투명도 보정

PersonalModel
→ 사용자의 반복 획에서 속도·면적·dwell을 학습한 로컬 모델
```

손가락 합성 압력은 Google Ink `normalized pressure` 입력으로 전달할 수 있고, 같은 BrushFamily 안에서 `EnabledToolTypes.touch` behavior를 사용해 펜과 완전히 다른 반응을 만들 수 있다.

## 6.3 Pointer Arbitration 상태 머신

```text
Pending
├─ StylusCandidate
├─ TouchInkCandidate
├─ GestureCandidate
└─ PalmCandidate

StylusCandidate → ActiveStylusInk → Commit / Cancel
TouchInkCandidate → ActiveTouchInk → Commit / Cancel
GestureCandidate → PanZoomRotate → End
PalmCandidate → Rejected → End
```

### 분류 신호

- `pointerType`
- 현재 stylus hover/contact 존재 여부
- 손가락 접촉 크기와 aspect ratio
- 펜촉과 터치점의 거리
- 손잡이 설정에 따른 화면 모서리·하단 palm region
- stylus down 전후 시간 창
- 접촉 이동 속도·방향·초기 dwell
- 활성 입력 프로필
- OS가 보낸 `pointercancel`
- 사용자 장치에서 학습한 오분류 통계

웹에는 Android의 명시적 palm flag와 동일한 표준이 없으므로 접촉 면적만으로 손바닥을 단정하지 않는다. OS palm rejection을 우선 신뢰하고, 앱 heuristic은 보조로 쓰며 언제든 rollback 가능해야 한다.

## 6.4 팜리젝션 규칙

```text
펜 hover 또는 contact 중
→ 새 touch는 기본 Palm/Gesture 후보

펜촉 80~160 CSS px 이내의 큰 touch
→ Palm 후보 가중치 증가

손잡이 방향의 화면 가장자리에서 시작한 큰 touch
→ Palm 후보 가중치 증가

두 개의 작은 touch가 동시에 시작
→ pinch/rotate 후보

FingerDraw 모드
→ palm heuristic을 완화하고 한 손가락 ink 우선

애매한 touch
→ 35~70ms commitment delay 후 ink/gesture 결정

stylus
→ 지연 없이 즉시 ink
```

### 취소 처리

- `pointercancel` 시 Google Ink `InProgressStroke` 폐기
- preview texture의 dirty rect 복원
- 아직 CommandBus에 commit하지 않음
- 손바닥으로 판정된 샘플은 raw diagnostic에만 익명 통계로 기록
- 사용자가 Undo할 필요가 없도록 처음부터 비파괴 preview transaction으로 처리

## 6.5 멀티터치 그리기

각 `pointerId`마다 독립된 다음 상태를 가진다.

```text
InputModel
InProgressStroke
Brush instance
Prediction tail
Preview mesh handle
Transaction ID
```

멀티터치 획을 한 Google Ink stroke로 합치지 않는다. 동시 획의 최종 순서는 timestamp와 layer transaction policy로 결정한다. 자연매체에서는 여러 획의 주입만 같은 wet tile simulation에 합칠 수 있다.

# 7. 저지연 Preview·예측·최종 획 교체

## 7.1 3단계 표시

```text
L0 Delegated Trail — 지원 브라우저·단순 solid brush에서만
L1 Predicted Ink Mesh — Google Ink predicted tail 또는 가벼운 centerline proxy
L2 Final Actual Mesh — 실제 coalesced input만으로 확정
```

`navigator.ink`의 Web Ink API는 제한된 브라우저에서 OS compositor가 단색·직경 trail을 그려주는 progressive enhancement다. 복합 texture, 기울어진 nib, 다중 coat, 자연매체에는 맞지 않는다. 따라서 다음 조건을 모두 만족할 때만 L0를 사용한다.

```text
navigator.ink 존재
+ trusted pointer event
+ brush가 solid round/near-round preview 허용
+ 현재 transform과 presentationArea가 안정
+ 색·직경 proxy가 최종 획과 큰 시각 차이를 만들지 않음
```

L0는 다음 프레임의 L1/L2가 오면 제거된다. Web Ink API는 최종 stroke, 저장, hit-test, 품질 렌더러가 아니다.

## 7.2 예측 데이터 원칙

- predicted samples는 영구 저장하지 않는다.
- 다음 실제 sample이 도착하면 이전 prediction tail 전체를 폐기한다.
- prediction 영역은 별도 mesh range 또는 별도 draw call로 관리한다.
- 예측 correction이 큰 브러시는 prediction length를 자동 축소한다.
- 자·도형·정밀 선택 경계에서는 prediction을 끈다.
- 손글씨·긴 빠른 선에서는 prediction을 늘릴 수 있다.
- 수채·유체에 predicted pigment를 영구 주입하지 않는다. preview mask만 사용하고 실제 입력 도착 시 확정한다.

## 7.3 애플리케이션 추가 지연 목표

아래 수치는 하드웨어·OS·디스플레이 전체 지연 보장이 아니라 **ToonStudio 애플리케이션이 추가하는 시간의 수용 기준**이다.
| 측정 항목 | 수용 목표 | 비고 |
| --- | --- | --- |
| DOM event capture p95 | ≤0.35ms desktop / ≤0.70ms mobile | 고정 struct 복사만 |
| coalesced batch normalization p95 | ≤0.50ms | Worker SIMD 가능 |
| Google Ink append+mesh delta typical | ≤1.0ms | 일반 G펜 1 batch |
| Google Ink append+mesh delta p95 | ≤3.0ms | 복합 texture·다중 coat 제외 |
| GPU buffer delta upload p95 | ≤1.0ms | 전체 mesh 재업로드 금지 |
| 앱 첫 표시 | 120Hz 목표 ≤8.3ms, 60Hz 호환 ≤16.7ms | Delegated/preview 포함 |
| prediction correction p95 | <0.5× 현재 브러시 직경 | 초과 시 prediction 단축 |
| pointerup→final mesh | 일반 획 1 frame 이내 | 복합 후처리는 비동기 |
| main-thread long task | 획 중 50ms long task 0 | 자동 회귀 게이트 |
| sample loss | 정상 부하에서 0, 과부하 시 통계 노출 | queue overflow 금지 |

## 7.4 mesh·GPU 최적화

- BrushFamily hash별 pipeline cache
- MeshFormat·coat 수·texture layer 수·AA 조합별 pipeline key
- packed vertex format 우선
- 실제 변경 vertex/index byte range만 `queue.writeBuffer`
- 작은 stroke는 shared arena에서 suballocation
- 종료된 stroke는 immutable GPU buffer로 compact
- 화면 밖 stroke는 GPU buffer 퇴출 후 input+mesh cache만 OPFS 유지
- zoom에 따라 mesh epsilon LOD 선택
- edit 원본은 낮은 epsilon mesh가 아니라 raw input
- texture atlas와 sampler를 brush pack 단위로 공유
- animated texture는 atlas frame index만 변화
- wet-looking time animation은 변경되는 stroke만 별도 dynamic list에 유지
- 일정 시간 후 완전히 정지한 stroke는 정적 렌더 아일랜드로 이동

## 7.5 동적 epsilon

Google Ink의 epsilon은 품질과 메모리 사이의 직접적인 조절점이다.

```text
편집·확대 중
epsilon = min(brushSize * 0.01, 0.10 document px equivalent)

일반 화면
epsilon = screenPixelToDocument * 0.15~0.35

축소 미리보기
epsilon 증가, proxy mesh 사용

최종 벡터 출력
목표 출력 DPI·최대 확대율 기준으로 재생성
```

고정 epsilon 하나로 모든 줌을 처리하지 않고, 입력은 보존한 채 mesh cache를 LOD별로 생성한다.

# 8. Google Ink 브러시 레시피
| 브러시 | Behavior 소스 | Tip/Color 대상 | Paint/Coat | 주력 출력 | 폴백·보조 |
| --- | --- | --- | --- | --- | --- |
| 만화 G펜 | pressure, speed, acceleration forward | size, opacity, corner rounding | 2 coat: core+edge texture | Vello 선택 proxy, WGSL 최종 | Perfect Freehand |
| 매핑펜 | pressure, speed | 매우 좁은 size 범위, taper | solid 1 coat, 낮은 epsilon | 정밀 profile, prediction 최소 | Vello outline |
| 붓펜 | pressure, tilt, orientation, speed | width/height, slant, rotation, opacity | fiber texture 2 coat | Google Ink mesh | CanvasKit/WebGL subset |
| 평붓 캘리그래피 | orientation, tiltX/Y, pressure | rotation, aspect, pinch | paper tiling texture | Google Ink mesh | Vello polygon outline |
| 만년필 | direction, pressure, speed | rotation, width, luminosity | ink texture + self accumulate | Google Ink mesh | solid vector |
| 사인펜 | speed, pressure | opacity, size | tiling texture | Google Ink mesh | CanvasKit stroke |
| 마커 | pressure, velocity | width, opacity | self accumulate | Google Ink mesh | WebGPU raster |
| PDF 형광펜 | pressure optional | size, opacity | self discard | annotation mode | CanvasKit path |
| 물리형 형광펜 | pressure, speed | opacity variation | self accumulate | painting mode | WebGPU raster |
| 점선 | distance traveled | particle emission | solid stamping | Google Ink particle mesh | Vello procedural dash |
| 장식 스탬프 | distance, speed, noise | rotation, size, hue | animated stamping atlas | Google Ink WGSL | WebGPU stamp batch |
| 이모지 하이라이터 | distance/time | particle size, rotation | emoji atlas stamping | Google Ink WGSL | CanvasKit text stamps |
| 레이저 포인터 | time since input/stroke end | opacity, size | glow coat + core coat | dynamic Google Ink list | WebGPU trail |
| 젖은 잉크 시각 효과 | time since input/end | size/opacity/luminosity | animated texture | 시각 애니메이션 | Wet-media injection |
| 연필 벡터 | tilt, orientation, pressure, speed | aspect, rotation, opacity | paper tiling texture | Google Ink mesh | Hokusai/WebGPU pencil |
| 목탄 벡터 하이브리드 | pressure, speed, noise | size, opacity, lateral offset | grain texture 2 coat | Google Ink + raster bake option | Hokusai |
| 스프레이 스탬프 | time/distance, speed, noise | particle offset, size, opacity | stamping texture | 소형 효과에만 | 대형은 WebGPU particles |
| 리본 선 | direction, speed, lateral acceleration | rotation, lateral offset, width | solid/gradient coat | Google Ink guide | XPBD+Vello |
| 헤어 가이드 | speed, direction, noise | width, lateral offset | multi coat | 벡터 guide 생성 | XPBD strand |
| 손가락 크레용 | synthetic pressure, contact area, speed | size, opacity, rotation | grain tiling | touch 전용 behavior | WebGPU dab |
| 손가락 형광펜 | constant/synthetic pressure | size, opacity | self discard | touch annotation | CanvasKit |
| 서명 펜 | pressure, speed, direction | size, taper | solid 1 coat | smooth input model | Perfect Freehand |
| 필기 노트 펜 | pressure, speed | size, opacity | solid | recognition input 병행 | CanvasKit path |
| 패턴 테두리 | distance, direction | rotation, size | stamping atlas | Google Ink mesh | Vello repeated image |
| 듀얼톤 펜 | pressure, lateral acceleration | width, hue/opacity | 2 coat 서로 다른 color function | Google Ink multi-coat | WebGPU custom |
| 테두리 펜 | pressure | size | outer+inner 2 coat | Google Ink multi-coat | Vello double outline |
| 스크래치 펜 | speed, noise, distance | opacity, lateral offset | grain texture | Google Ink | WebGPU raster |
| 속도 반응 잉크 | speed, acceleration | size, opacity, hue | solid/texture | Google Ink behavior graph | Vello |
| 터치 파티클 낙서 | touch speed, time, noise | particle size/rotation/hue | animated stamp | Google Ink touch behavior | WebGPU particle |
| 3D 깊이 반응 선 | Google Ink input + depth query | size/opacity externally modulated | solid/texture | input 전처리 후 Ink | Vello/WebGPU |

## 8.1 실제 자연매체와의 결합

Google Ink의 시간·텍스처 애니메이션은 젖은 느낌을 만들 수 있지만 실제 안료 유체는 아니다. 최상위 수채·수묵은 다음처럼 결합한다.

```text
Google Ink mesh
→ coverage/pressure/velocity injection mask
→ Custom WebGPU wet tile
   ├─ water
   ├─ pigment
   ├─ wetness
   ├─ paper absorption
   ├─ deposition
   └─ drying
→ 결과 texture
→ Vello/HybridFrameGraph 합성
```

- predicted mesh는 preview wetness에만 사용
- 실제 입력 도착 후 확정 pigment 주입
- Ink stroke 원본은 편집 가능한 guide로 유지 가능
- wet simulation을 bake해도 Ink guide와 brush settings는 보존
- 브러시모 물리는 XPBD가 접촉 footprint를 만들고 Google Ink 또는 wet engine에 전달

# 9. BrushBehavior를 ToonStudio BrushGraph로 통합

## 9.1 공통 그래프

```text
BrushProgramIR
├─ InputModelGraph
├─ DynamicsGraph
├─ TipGraph
├─ PaintGraph
├─ CoatGraph
├─ TextureGraph
├─ NaturalMediaGraph
├─ PhysicsGraph
├─ OutputGraph
└─ CompatibilityPayloads
```

Google Ink가 표현할 수 있는 부분은 `GoogleInkBrushCompiler`가 BrushFamily로 컴파일한다. 자연매체·물리·래스터 전용 노드는 다른 backend로 보낸다.

## 9.2 소스·대상 매핑
| ToonStudio 입력 | Google Ink 표현 | 주 대상 | 대표 사용 |
| --- | --- | --- | --- |
| Pressure | NormalizedPressure | Size/Width/Height/Opacity | G펜·마커·연필 |
| Tilt magnitude | TiltInRadians | Aspect/Slant/Opacity | 연필·평붓 |
| Tilt X/Y | TiltX/YInRadians | Width/Height/Lateral offset | 캘리그래피 |
| Azimuth | OrientationInRadians | Rotation/Texture direction | 평붓·연필 |
| Speed | Speed in brush-size or cm/s | Size/Opacity/Particle rate | G펜·스프레이 |
| Direction | Direction angle/components | Rotation/Position offset | 리본·패턴 |
| Distance | Distance traveled | Stamp emission/Noise phase | 점선·장식 |
| Time | Time of input | Animation phase/Color | 레이저·동적 브러시 |
| Prediction | Predicted distance/time | Preview opacity/size | 예측 영역 구분 |
| Distance remaining | Remaining distance/fraction | 끝 taper | 서명·G펜 |
| Time since input/end | Wet animation source | Size/Opacity/Texture progress | 젖은 잉크 |
| Acceleration | Absolute/forward/lateral | Width/offset/color | 역동적 효과선 |
| Tool type | EnabledToolTypes filter | branch enable/disable | 펜·손가락 분기 |
| Random variation | NoiseNode | size/offset/hue/opacity | 질감·장식 |

## 9.3 하나의 브러시에서 펜과 손가락을 다르게 처리

```text
Stylus branch
Pressure → Size 0.15~1.0
Tilt → Aspect/Rotation
Speed → Taper

Touch branch
Synthetic Pressure → Size 0.75~1.15
Contact Area → Aspect
Speed → Opacity

Mouse branch
Constant pressure
Speed → subtle taper only
```

각 branch는 Google Ink `EnabledToolTypes` 필터 또는 앱의 BrushProgram compiler에서 생성한다. UI에서는 엔진 세부 타입을 숨기고 `펜 반응`, `손가락 반응`, `마우스 반응` 탭으로 제공한다.

## 9.4 CSP `.sut/.sutg/.abr` 매핑

```text
외부 프리셋
→ 원본 불변 보존
→ Tip/Spacing/Scatter/Texture/Pressure/Stabilizer 추출
→ BrushProgramIR
→ Google Ink 가능 노드 컴파일
→ 불가능 노드는 WebGPU/Hokusai/XPBD sidecar
→ Fidelity Lab 비교
→ 정확/근사/베이크/보존 상태 표시
```

### Google Ink로 높은 충실도를 기대할 수 있는 설정

- 압력→크기·불투명도
- 기울기→방향·aspect
- 속도→크기·opacity
- tip shape·rotation·slant·pinch
- distance/time spacing
- texture tiling/stamping
- 다중 coat outline/core
- self-overlap형 형광펜
- 색상 variation·random noise
- 시작·끝 taper

### 별도 backend가 필요한 설정

- 실제 픽셀 blending/smudge
- dual brush의 복합 pixel convolution
- wet paint pigment pickup
- 종이 섬유 기반 physical deposition
- 고밀도 particle cloud
- image hose의 고급 orientation 규칙 일부
- CSP 고유 보정·anti-overflow semantics

## 9.5 Brush Fidelity Lab 확장

```text
입력 원본 재생
├─ pressure ramp
├─ speed sweep
├─ tilt/azimuth sweep
├─ twist sweep
├─ short/long taper
├─ self-intersection
├─ stamp spacing
├─ texture scale/rotation
├─ finger synthetic pressure
└─ palm/cancel scenario

비교 출력
├─ 대상 앱 reference capture
├─ Google Ink WebGPU
├─ Vello/CanvasKit fallback
├─ WebGL2 fallback
└─ CPU/reference export
```

자동 지표와 작가 평가를 함께 사용한다.

- silhouette Hausdorff distance
- width profile error
- opacity accumulation error
- texture phase error
- endpoint overshoot
- curvature·corner preservation
- predicted correction magnitude
- subjective feel score

# 10. Google Ink·Vello·CanvasKit·WebGPU 역할 분담
| 엔진 | 정확한 역할 | 사용 이유 |
| --- | --- | --- |
| Google Ink WASM | 입력 모델·BrushBehavior·mesh·geometry·storage | 최고급 편집 가능한 잉킹 |
| Google Ink WGSL | 복합 mesh, AA, per-vertex color/opacity, texture | Google Ink 획의 완전 품질 렌더 |
| Vello | 대량 벡터·도형·선택 proxy·앵커·말풍선·합성 | 전체 2D 장면의 벡터 아일랜드 |
| CanvasKit | Paragraph·CJK·PathEffect·SkSL·ImageFilter·기준 출력 | 조판·효과·reference renderer |
| Custom WebGPU | 래스터 타일·필터·스머지·유체·파티클 | 픽셀·자연매체·대형 compute |
| WebGL2 renderer | Google Ink core subset·래스터 폴백 | WebGPU 미지원 호환 |
| CPU/native reference | Google Ink/Skia 또는 자체 CPU 출력 | golden·서버 export·회귀 |

## 10.1 렌더 아일랜드 규칙

```text
InkMeshIsland
→ Google Ink WGSL이 소유
→ Vello는 해당 획의 bounds·selection outline·transform handle만 표시

SimpleVectorInkIsland
→ solid, no texture, no per-vertex color인 획
→ outline proxy를 Vello로 직접 렌더 가능

TextAndBalloonIsland
→ Vello 또는 CanvasKit

WetMediaIsland
→ Custom WebGPU texture

FinalComposition
→ 하나의 shared GPUDevice가 가능하면 TextureView 합성
→ 불가능하면 큰 island 단위 ImageBitmap/texture bridge
```

Google Ink 복합 mesh를 Vello path로 매 프레임 변환하면 texture·AA·per-vertex color와 성능을 잃는다. Vello는 대체 렌더러가 아니라 장면 조립과 편집 오버레이에 집중한다.

## 10.2 WebGPU 셰이더 통합

공개 WGSL은 다음 기능을 이미 고려한다.

- packed/unpacked vertex data
- 위치와 opacity shift
- side/forward derivative와 AA
- surface UV와 animation offset
- HSL shift
- object→canvas transform
- texture mapping과 blend

ToonStudio는 원본 셰이더를 직접 수정해 분기시키기보다 다음 방식을 권장한다.

```text
upstream StrokeShader.wgsl
→ 버전 hash 검증
→ build-time include/constant specialization
→ Toon bind-group wrapper
→ golden shader test
```

upstream와 별도의 `toon_ink_composite.wgsl`에서 clip, layer opacity, color space, canvas texture format을 처리한다. 그래야 Google Ink 업데이트를 추적하기 쉽다.

# 11. 필기 인식·제스처·도형 인식

## 11.1 인식 backend 인터페이스

```ts
interface HandwritingRecognizerBackend {
  id: 'mlkit-native' | 'onnx-web' | 'server-private';
  supportsLanguage(tag: string): Promise<boolean>;
  recognize(ink: RecognitionInk, options: RecognitionOptions): Promise<Candidate[]>;
  recognizeGesture(ink: RecognitionInk): Promise<GestureCandidate[]>;
  recognizeShape(ink: RecognitionInk): Promise<ShapeCandidate[]>;
}
```

ML Kit Digital Ink Recognition은 Android·iOS에서 오프라인으로 300개 이상 언어와 25개 이상 문자 체계, 제스처·기본 도형을 지원하지만 **공식 순수 웹 API는 아니다.** 따라서 다음처럼 배치한다.

```text
PWA/브라우저
→ ONNX Runtime Web 기반 허용 라이선스 모델 또는 private server

Android/iOS native wrapper
→ ML Kit Digital Ink Recognition

Desktop Local ToonBridge
→ 선택형 로컬 recognizer
```

## 11.2 비파괴 필기→텍스트

```text
Ink strokes 원본
+ 인식 후보 N개
+ language/model version
+ user correction
→ TextObject와 연결
```

텍스트로 변환해도 원본 필기 획을 삭제하지 않는다. `InkTextLink`로 연결해 다시 필기로 돌아갈 수 있다.

### 제공 기능

- 말풍선 안에 펜으로 대사 입력
- 한글·일본어·중국어·영문 필기 후보
- scribble delete
- strike-through delete
- caret insert
- circle select
- underline emphasize
- 손그림 사각형·원·화살표를 vector shape로 변환
- 수식 필기 후보는 별도 recognizer
- 필기 검색 인덱스
- 인식 confidence가 낮으면 자동 변환하지 않음
- 개인정보 민감 문서는 로컬 backend만 허용

## 11.3 Google Ink와 인식 데이터 공유

인식기는 렌더 mesh가 아니라 좌표와 timestamp를 가진 입력 stroke를 받는다. Google Ink에 전달하는 `NormalizedInkSample`을 그대로 `RecognitionInk`로 복제하되, prediction sample은 제외한다.

# 12. UI/UX: CSP 사용자의 입력 이질감 제거
| UX 기능 | 설계 | 효과 |
| --- | --- | --- |
| 입력 모드 표시 | 상단 상태에 펜 작화/손가락 이동을 명확히 표시 | 오작동 원인 감소 |
| CSP 기본값 | PenDrawTouchNavigate, Space 임시 손, Shift+Space 회전 | 기존 습관 유지 |
| 펜 버튼 | 도구별 임시 스포이드·지우개·팬 매핑 | Modifier Key 감각 보존 |
| 브러시 HUD | 크기·불투명도·안정화·압력 곡선 | 캔버스에서 1동작 |
| Hover Preview | 실제 nib shape·각도·예상 직경 | 기울기 브러시 예측 |
| 손가락 모드 | 한 손가락 draw/pan 선택을 Quick Deck에서 전환 | 모드 혼동 방지 |
| 팜 진단 | 거절된 touch 시 잠깐 비시각적 상태 아이콘 | 숨은 오작동 설명 |
| 교정 Lab | 압력·기울기·sample rate·prediction 그래프 | 장치 문제 자가 해결 |
| 브러시 비교 | CSP reference와 ToonStudio 결과 side-by-side | 이식 신뢰 |
| 필기 입력 | 텍스트·말풍선에 펜으로 쓰고 후보 선택 | 키보드 없는 작업 |
| 터치 타깃 | 최소 44 CSS px, 펜 hover 시 compact 가능 | 손가락과 펜 동시 최적화 |
| 왼손 모드 | 도킹·palm region·radial menu 방향 반전 | 손바닥 오작동 감소 |

## 12.1 Input Capability Center

사용자는 브라우저·드라이버 문제를 검색하지 않고 제품 안에서 확인한다.

```text
장치
├─ pointer type
├─ pressure 변화
├─ tilt/azimuth/twist
├─ hover
├─ buttons/eraser
├─ sample rate·jitter
└─ contact geometry

브라우저
├─ coalesced events
├─ predicted events
├─ pointerrawupdate
├─ Web Ink API
├─ WebGPU/WebGL2
├─ SharedArrayBuffer
└─ Worker/OffscreenCanvas

진단
├─ 누락 샘플
├─ timestamp 역전
├─ pressure stuck
├─ palm false mark
├─ main-thread stall
├─ mesh generation stall
└─ fallback 활성 이유
```

## 12.2 Brush Behavior Designer

Google Ink의 graph를 그대로 개발자 용어로 노출하지 않고 세 단계로 제공한다.

```text
Basic
크기·불투명도·안정화·기울기 방향

Advanced
압력·속도·기울기 response curve
팁 shape·texture·spacing·self-overlap

Graph
Source/Filter/Operator/Target 노드
Tool-type branch
Multiple coat
Animation
```

변경 사항은 즉시 대표 획 12종 preview에 재생된다. `developer_comment`, 최소 Ink version, 호환 브라우저 경로도 프리셋 metadata에 저장한다.

# 13. 브라우저·기기 호환성 정책
| 환경 | 입력 정책 | 렌더 정책 |
| --- | --- | --- |
| Chromium 계열 | coalesced/predicted/raw/WebGPU/선택형 Web Ink를 기능 탐지 | Google Ink WASM+WGSL 최상위 |
| Safari 18.2+ | coalesced·predicted·altitude/azimuth 지원, 나머지는 탐지 | Apple Pencil 입력 강화, Web Ink 없이 preview mesh |
| Firefox | Pointer Events 기본·기능별 탐지, raw/predicted 가정 금지 | Google Ink WASM + WebGL2/CPU 또는 가능한 WebGPU |
| Android WebView | 호스트 버전·WebGPU·pointer 속성 런타임 측정 | PWA와 native wrapper 프로필 분리 |
| iOS WKWebView | Safari engine 제약, native bridge 선택 | ML Kit iOS·파일 접근은 wrapper에서 확장 가능 |
| 저사양/구형 | pointermove + actual sample만 | Perfect Freehand/CanvasKit/WebGL2 Lite |

## 13.1 Web Ink API 정책

- `navigator.ink`가 없으면 기능 저하 없이 동작
- 실험·Limited availability이므로 P0 필수 의존성 금지
- style이 color+diameter인 단순 trail이므로 복잡한 nib에는 사용하지 않음
- OS compositor trail과 최종 획의 차이가 큰 브러시는 자동 비활성화
- expected improvement 같은 비표준·폐기 속성에 의존하지 않음
- 입력 이벤트·최종 저장·brush behavior는 항상 ToonStudio가 소유

## 13.2 네이티브 래퍼의 추가 가치

브라우저 버전을 제품의 중심으로 유지하되 Android/iOS wrapper를 제공하면 다음을 확장할 수 있다.

- Android front-buffer low-latency rendering
- OS-level palm flags와 stylus hover 상세
- ML Kit Digital Ink Recognition
- 파일 시스템·공유 sheet
- 백그라운드 저장
- 기기별 펜 버튼·haptic 연동

네이티브 전용 기능이 없어도 문서를 열고 편집할 수 있어야 하며, wrapper는 progressive enhancement로만 둔다.

# 14. 품질·성능 검증 체계

## 14.1 실제 장치 매트릭스
| OS | 장치 | 브라우저 | 중점 시험 |
| --- | --- | --- | --- |
| Windows | Wacom Intuos/Cintiq | Chrome·Edge·Firefox | 압력·hover·버튼·고주파 |
| Windows | Surface Pen | Edge·Chrome | 필압·기울기·팜 |
| macOS | Wacom | Safari·Chrome·Firefox | 브라우저별 coalescing |
| iPadOS | Apple Pencil | Safari·PWA | predicted/coalesced·angles·palm |
| Android | Samsung S Pen | Samsung Internet·Chrome·PWA | hover·버튼·WebGPU |
| Android | 일반 capacitive finger | Chrome·WebView | 합성 압력·gesture |
| ChromeOS | USI stylus | Chrome | sample rate·prediction |
| Desktop | mouse/trackpad | 주요 브라우저 | 가상 압력·navigation |

## 14.2 자동 벤치마크
| ID | 시나리오 | 통과 기준 |
| --- | --- | --- |
| INP-001 | 1000Hz 합성 pointer stream | sample 누락·queue overflow 0 |
| INP-002 | actual+coalesced+predicted ordering | 시간 역전·중복 0 |
| INP-003 | pointercancel mid-stroke | 픽셀·mesh·undo 잔여 0 |
| INP-004 | stylus+2 touch 동시 | 획과 pinch 오분류 목표치 이하 |
| INP-005 | 10분 연속 handwriting | 메모리 증가 안정·GC stall 기준 통과 |
| GINK-001 | 10k point stroke | 증분 mesh budget 통과 |
| GINK-002 | 1000개 short strokes | pipeline·allocator 안정 |
| GINK-003 | 4 texture layer·multi-coat | 시각 reference diff 통과 |
| GINK-004 | self-overlap accumulate/discard | 형광펜 semantics 일치 |
| GINK-005 | dynamic time animation | 정지 후 dynamic list 제거 |
| GINK-006 | zoom 1%~6400% | LOD 전환 pop 기준 통과 |
| GINK-007 | geometry hit/erase/split | 재생·undo·저장 일치 |
| PALM-001 | 손바닥+stylus corpus | false ink·false reject 측정 |
| TOUCH-001 | 한 손가락 draw+두 손가락 pinch | state transition 안정 |
| BROW-001 | WebGPU device loss | 문서 손실 없이 fallback |

## 14.3 필기감 수용 기준

정량 수치만으로 필기감을 확정하지 않는다. 최소 5명의 실제 작가·필기 사용자가 다음 blind test를 수행한다.

- CSP G펜과 ToonStudio G펜 A/B
- 느린 선·빠른 선·짧은 taper·급격한 코너
- Wacom/iPad/S Pen별 평가
- 안정화 0·중·강
- prediction on/off
- 손가락 필기와 펜 필기
- 장시간 피로도

### 출시 기준 예시

```text
일반 G펜 선호도
→ ToonStudio가 기준 제품 대비 열세 응답 20% 이하

끝점 제어
→ overshoot 불만 사용자 10% 이하

팜 오작동
→ 30분 세션에서 사용자당 수정 필요 mark 평균 1개 미만

입력 지연
→ blind test에서 ‘명백히 느림’ 응답 10% 이하
```

이 수치는 초기 목표이며 실제 기기·작가 조사로 조정한다.

# 15. 생산 채택 PoC 게이트
| 게이트 | 검증 | 실패 시 행동 |
| --- | --- | --- |
| P-GI-00 | 공식 core native build | 실패 시 Google Ink 보류 |
| P-GI-01 | 선별 모듈 WASM | 실패 시 Stroke Modeler/Perfect Freehand 경로 |
| P-GI-02 | 배치 append·증분 mesh | 전체 mesh 복사 필요 시 성능 재설계 |
| P-GI-03 | 공개 WGSL 브라우저 렌더 | 실패 시 P1은 solid outline subset |
| P-GI-04 | Skia reference 동등성 | diff 초과 브러시는 비출시 |
| P-GI-05 | texture·multi-coat·self-overlap | 브러시별 capability 표시 |
| P-GI-06 | 부분 erase·split·Undo | alpha API 직접 저장 금지, 자체 edit op |
| P-GI-07 | Safari·Firefox fallback | 핵심 G펜 8종 유지 |
| P-IN-00 | Pointer Events ordering corpus | 브라우저별 adapter 수정 |
| P-IN-01 | Wacom·Apple Pencil·S Pen 교정 | 장치별 profile 제공 |
| P-IN-02 | 팜리젝션 corpus | 기본 프로필 출시 여부 결정 |
| P-IN-03 | 손가락 draw/gesture arbitration | 모바일 출시 gate |
| P-LAT-00 | app-added latency | 예산 초과 시 preview simplification |
| P-HW-00 | ML Kit native bridge | 웹 제품과 독립 기능 플래그 |
| P-HW-01 | 웹 handwriting backend | 모델·라이선스·정확도 통과 시만 |

## 15.1 출시 단계

```text
P0 — InputCore
Pointer Events·coalesced·prediction·calibration·pen/touch arbitration
Perfect Freehand/Vello 또는 기존 잉킹 폴백

P1 — Google Ink Core
WASM geometry·G펜·마커·형광펜·selection/hit-test
Google Ink WGSL solid/texture 핵심 경로

P2 — Advanced Brush
multiple coats·stamping·animated texture·Brush Designer
CSP SUT/ABR mapping·Fidelity Lab

P3 — Natural/Physical Hybrid
Google Ink injection + wet media
XPBD nib/bristle guide

P4 — Handwriting/Native Enhancement
ML Kit native bridge·gesture editing·shape recognition
Web Ink delegated preview·Android low latency wrapper
```

# 16. 위험 등록부와 완화
| 위험 | 내용 | 영향 | 완화 |
| --- | --- | --- | --- |
| R-GI-01 | 공개 C++ API 변경 | 높음 | commit pin·C ABI·upstream type 격리·golden |
| R-GI-02 | 브라우저 빌드 타깃 없음 | 높음 | 선별 모듈 PoC·fallback 유지 |
| R-GI-03 | WGSL은 shader일 뿐 renderer wrapper 아님 | 높음 | 자체 pipeline/resource layer 구현 |
| R-GI-04 | README와 main 코드 상태 차이 | 중간 | release/commit 기반 SBOM·자동 diff |
| R-GI-05 | 부분 지우개 alpha 직렬화 한계 | 높음 | 자체 StrokeEditIR |
| R-GI-06 | 브러시 proto 버전 증가 | 중간 | minimum version·migration·원본 proto 보존 |
| R-IN-01 | pointerrawupdate 브라우저 차이 | 중간 | coalesced 기본·runtime opt-in |
| R-IN-02 | 팜 표준 데이터 부재 | 높음 | OS 우선·heuristic·rollback·사용자 프로필 |
| R-IN-03 | 손가락 면적 값 불신 | 중간 | 신뢰도 측정·속도/상수 pressure fallback |
| R-IN-04 | prediction overshoot | 중간 | preview only·dynamic horizon |
| R-IN-05 | React main-thread stall | 높음 | 입력 핫패스 격리·long task gate |
| R-GPU-01 | 여러 엔진 GPU context | 높음 | Google Ink WGSL을 단일 RenderCore에 통합 |
| R-GPU-02 | WebGPU 미지원/driver issue | 높음 | WebGL2·CanvasKit·simple vector fallback |
| R-HW-01 | ML Kit 웹 미지원 | 확정 | native bridge·ONNX/web backend 분리 |
| R-LIC-01 | 브러시 texture·외부 preset 권리 | 높음 | Rights BOM·원본 라이선스 메타데이터 |

# 17. 최종 권장 구현 아키텍처
```text
┌────────────────────────────────────────────────────────────────┐
│ React 19 UI / CommandRegistry / Adaptive Workspace             │
│ CSP Migration UX · Input Center · Brush Designer · HelpGraph   │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│ Main-thread Pointer Capture                                    │
│ no allocation · no React state · pointer capture · touch-action│
└──────────────────────────────┬─────────────────────────────────┘
                               │ SAB/Transferable batches
┌──────────────────────────────▼─────────────────────────────────┐
│ Input & Ink Worker                                             │
│ Arbitration · Palm · Calibration · Prediction                  │
│ Google Ink WASM · BrushProgram Compiler · Geometry             │
└───────────────┬─────────────────────┬──────────────────────────┘
                │ mesh delta          │ normalized input
┌───────────────▼────────────────┐    └──────────────┐
│ Shared WebGPU Render Worker   │                   │
│ Google Ink WGSL               │       ┌───────────▼───────────┐
│ Vello Islands                 │       │ Handwriting Backend    │
│ Raster/Effect/Wet Compute     │       │ MLKit Native/ONNX/Web │
│ GPU Resource Manager          │       └───────────────────────┘
└───────────────┬────────────────┘
                │ TextureView/RenderIsland
┌───────────────▼────────────────────────────────────────────────┐
│ HybridFrameGraph                                               │
│ CanvasKit Text/Effects · 3D Island · UI Overlay · Final Color  │
└───────────────┬────────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────────┐
│ Command Journal / OPFS / Collaboration                         │
│ raw inputs · normalized inputs · brush proto · edit ops        │
│ mesh cache · device profiles · capability report               │
└────────────────────────────────────────────────────────────────┘
```

## 17.1 최종 의사결정

1. Google Ink는 ToonStudio의 모든 브러시 엔진이 아니라 **최고급 편집 가능한 벡터 잉킹 엔진**이다.
2. 공개 C++ 코어와 WGSL을 최대한 활용하되 브라우저용 공식 SDK가 있다고 가정하지 않는다.
3. 스타일러스와 손가락은 같은 입력 데이터 모델을 공유하지만 다른 arbitration·calibration·behavior profile을 가진다.
4. `navigator.ink` Web Ink API는 단순 저지연 preview에만 사용하고 필수 의존성으로 두지 않는다.
5. 실제 수채·유화·스머지·브러시모는 기존 WebGPU/Hokusai/XPBD 백엔드를 유지한다.
6. Google Ink의 geometry·storage·versioning까지 활용해 선택·지우개·브러시 편집·협업·재생을 연결한다.
7. Vello는 장면과 편집 overlay, CanvasKit은 조판·효과·출력, Google WGSL은 Ink mesh의 최종 품질을 담당한다.
8. 생산 채택은 반드시 WASM 빌드·mesh delta·WGSL 동등성·실기기 필기감 게이트를 통과한 뒤 확정한다.

---

# 18. 공식 근거와 추적 대상

- Google Ink 공개 저장소: https://github.com/google/ink
- Google Ink MODULE.bazel: https://raw.githubusercontent.com/google/ink/main/MODULE.bazel
- Google Ink WebGPU shader: https://raw.githubusercontent.com/google/ink/main/ink/rendering/webgpu/StrokeShader.wgsl
- Google Ink BrushBehavior: https://raw.githubusercontent.com/google/ink/main/ink/brush/brush_behavior.h
- Google Ink BrushTip: https://raw.githubusercontent.com/google/ink/main/ink/brush/brush_tip.h
- Google Ink BrushPaint: https://raw.githubusercontent.com/google/ink/main/ink/brush/brush_paint.h
- Google Ink BrushFamily: https://raw.githubusercontent.com/google/ink/main/ink/brush/brush_family.h
- Jetpack Ink releases: https://developer.android.com/jetpack/androidx/releases/ink
- Android advanced stylus features: https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features
- W3C Pointer Events Level 3: https://www.w3.org/TR/pointerevents3/
- Web Ink API draft: https://wicg.github.io/ink-enhancement/
- MDN Ink API: https://developer.mozilla.org/en-US/docs/Web/API/Ink_API
- Safari 18.2 Pointer Events: https://webkit.org/blog/16301/webkit-features-in-safari-18-2/
- ML Kit Digital Ink Recognition: https://developers.google.com/ml-kit/vision/digital-ink-recognition

---

# 부록 A. V4.3 실구현성·성능·품질 정밀 감사 전체 원문

아래 내용은 V4.3을 보존한 것이다. Google Ink와 입력 계층에 관해 V4.4 본문과 충돌하는 경우 **V4.4가 우선**한다.

# ToonStudio 실구현성·성능·품질 정밀 감사 최종 아키텍처 V4.3

## V4.2의 CSP 무이질감 전환·최대 포맷 상호운용 설계를 실제 제품으로 구현하기 위한 엔진 성숙도, 브라우저 폴백, 메모리·지연 예산, 품질 계약, PoC 게이트 중심 보완본

- 기준일: 2026-08-07
- 기준 제품: `https://www.toonstudio.cloud/studio`
- 기준 문서: V4.2 전체를 부록 A에 원문 통합
- 이번 버전의 목적: 기능을 더 나열하는 것이 아니라 **실제로 출시 가능한 핵심 경로와 실험 경로를 분리하고, 성능·품질을 측정 가능한 계약으로 바꾸는 것**

> 중요한 한계: 공개된 `/studio` 페이지는 동적 애플리케이션이어서 외부에서 내부 소스, 실제 렌더러, 번들, GPU 자원 수명, 펜 지연, 메모리 누수까지 확인할 수 없다. 따라서 V4.3은 공식 엔진 문서와 공개 코드에 근거한 **구현 타당성 감사**이며, 실제 코드베이스 성능을 보증하는 보고서는 아니다. 저장소 접근 후 아래 `R0 계측 게이트`를 통과해야 제품 수치로 확정된다.

---

# 0. 최종 판정

## 0.1 전체 목표는 구현 가능하다

ToonStudio가 다음 기능을 하나의 웹 제품에 제공하는 것은 기술적으로 가능하다.

- CSP에 가까운 펜 입력, 브러시 프리셋, 레이어·마스크·벡터 선화
- WebGPU 기반 대형 래스터 캔버스와 비파괴 필터
- Vello·CanvasKit을 병용한 벡터·텍스트·효과 렌더링
- Hokusai·libmypaint 계열 자연매체 프리셋
- WebGPU 기반 수채·수묵·유화 시뮬레이션
- Three.js·Rapier 기반 3D·VRM·물리 장면
- OPFS 기반 자동 복구와 로컬 우선 저장
- PSD·ORA·SVG·PDF·glTF·VRM 등 구조화 포맷 교환
- CSP 사용자를 위한 명령·단축키·작업공간·브러시 이식 UX

그러나 **모든 엔진을 한 프레임에서 동시에 작동시키거나, 313개 포맷을 모두 직접 편집 가능하다고 간주하거나, 비공개 CSP 포맷의 완전 왕복을 전제로 하는 설계는 현실적이지 않다.**

## 0.2 V4.3에서 확정한 다섯 가지 교정

1. **활성 엔진 예산**
   설치 가능한 엔진 수는 많아도, 한 편집 프레임에서 활성화하는 주 렌더 코어는 하나로 제한한다.

2. **Vello는 적극 활용하되 단독 필수 코어로 고정하지 않는다**
   Vello는 대량 벡터와 편집 오버레이의 주력 후보지만 공식 프로젝트가 알파 단계이고, Vello Hybrid·CPU도 API 안정성이 아직 보장되지 않는다. 자체 IR과 어댑터 뒤에 둔다.

3. **CanvasKit은 조판·Skia 효과·기준 출력의 생산 경로로 둔다**
   WebGL2·소프트웨어 표면과 Paragraph·ImageFilter·RuntimeEffect를 활용하되, WASM 객체 수명과 번들 비용을 엄격히 통제한다.

4. **WebGPU는 최고 품질 경로이지 유일 경로가 아니다**
   WebGL2, CanvasKit Software, Vello CPU 또는 tiny-skia, 서버·로컬 브리지를 단계적으로 둔다.

5. **포맷 수는 로드맵 규모이지 완전 호환 개수가 아니다**
   직접 왕복, 구조형 가져오기, 시각형 가져오기, 로컬 브리지, 원본 보존을 명확히 표시한다.

## 0.3 권장 생산 런타임

```text
React 19 UI / CommandRegistry
        │
        ├─ Main thread: UI·접근성·포인터 수집만
        │
        ├─ Input Worker: 교정·재샘플링·예측·SAB ring
        │
        ├─ Rust/WASM Render Worker
        │    ├─ 단일 wgpu/WebGPU Device 소유
        │    ├─ Sparse Tile Raster Core
        │    ├─ EffectGraph Compute
        │    ├─ Vello Adapter
        │    ├─ CanvasKit same-realm adapter — 상호운용 PoC 통과 시
        │    └─ GPU Resource/Budget Manager
        │
        ├─ CanvasKit Isolated Service — 상호운용 실패·출력 경로
        │    ├─ Paragraph·PathEffect·SkSL·ImageFilter
        │    └─ 큰 RenderIsland·Export/Reference Renderer
        │
        ├─ Natural Media Worker
        │    ├─ Hokusai/libmypaint compatibility
        │    └─ Wet-media state preparation
        │
        ├─ 3D Worker
        │    ├─ Three.js/Babylon
        │    └─ Rapier; Jolt는 선택 로드
        │
        ├─ Format Worker Pool
        └─ Storage Worker: OPFS journal·checkpoint·quota
```

### 한 프레임의 활성 엔진 상한

```text
주 2D 합성 코어     1개
보조 벡터/조판 코어 0~1개
3D 렌더 아일랜드   0~1개
이미지 분석 Worker  프레임 비동기
포맷·출력 Worker    편집 프레임 밖
```

엔진별 객체 단위 전환은 금지하고, 큰 `RenderIsland` 단위로만 전환한다.

---

# 1. 감사 범위와 증거 수준

## 1.1 이번 감사가 검토한 것

- 엔진 공식 저장소와 공식 문서가 밝히는 성숙도
- 브라우저별 WebGPU·Worker·OffscreenCanvas·OPFS 경로
- JS↔WASM, CPU↔GPU, 엔진↔엔진 경계의 복사 비용
- 대형 캔버스, 레이어, 필터, 자연매체의 메모리 모델
- 입력 지연과 Preview/Final 교체 구조
- Vello·CanvasKit·Google Ink·Hokusai의 실제 채택 위험
- CSP 비공개 포맷과 브러시 이식의 현실적 범위
- 저장소 손실, GPU device loss, quota·탭 종료 복구
- 브라우저 호환성과 포맷 호환성을 동시에 지키는 폴백
- 성능·품질을 자동 검증할 벤치마크 계약

## 1.2 증거 등급

| 등급 | 의미 | 제품 의사결정 |
|---|---|---|
| E0 | 표준·공식 안정 API와 자체 통제 코드 | 생산 코어 가능 |
| E1 | 공식 구현, 널리 검증됐으나 통합 시험 필요 | 생산 후보 |
| E2 | 공식 프로젝트가 실험·알파·API 불안정 | 어댑터·기능 플래그 |
| E3 | 소규모·신규 프로젝트 또는 제한된 벤치마크 | vendoring·golden test 필수 |
| E4 | 라이선스 불명·코드형 데모·논문 구현 | 클린룸 재구현만 |
| E5 | 비공개 포맷·대상 앱 의존 | 브리지·원본 보존 |

## 1.3 현재 사이트에 대한 판단 제한

실제 코드 접근 전에는 다음을 확정할 수 없다.

- React가 매 포인터 이벤트마다 재렌더되는지
- Canvas2D·PixiJS·WebGL·WebGPU 중 현재 어떤 렌더러를 쓰는지
- 문서 전체 크기 텍스처를 레이어별로 생성하는지
- Undo가 전체 비트맵 스냅샷인지 타일 diff인지
- 자동 저장이 명령 저널인지 주기적 전체 직렬화인지
- WASM 메모리 누수와 CanvasKit 객체 해제가 관리되는지
- GPU context loss 후 복구 가능한지
- 모바일 Safari의 메모리 압박에서 문서가 안전한지

따라서 코드베이스에 `/studio/diagnostics`를 먼저 추가하고, 이후 모든 아키텍처 결정을 수치로 확정한다.

---

# 2. 구현 가능성 등급표

| 영역 | 판정 | 실제 채택 방식 | 핵심 위험 |
|---|---|---|---|
| React UI·CommandRegistry | 생산 준비 | 즉시 채택 | 고주파 상태를 React에 넣는 실수 |
| Pointer Events 입력 | 생산 준비 | 브라우저 기능 탐지 + 폴백 | predicted/raw 지원 차이 |
| Custom WebGPU sparse tiles | 조건부 생산 | 핵심 자체 코어 | 구현 난도·device loss |
| WebGL2 sparse tile fallback | 생산 필요 | 호환성 경로 | 효과 품질과 pass 제한 |
| CanvasKit WebGL/Software | 생산 후보 | 조판·효과·출력 | 번들·WASM 수명 |
| CanvasKit WebGPU interop | 조건부 | PoC 통과 시 | 브라우저·빌드별 차이 |
| Vello Classic | 조건부 | 벡터 아일랜드 | 알파·API 변경 |
| Vello Hybrid | 실험 | WebGL/WebGPU 대안 | 기능 동등성 미완성 |
| Vello CPU | 조건부 | 검수·출력·폴백 | API 안정성 없음 |
| Perfect Freehand | 생산 후보 | 빠른 가변 폭 선 | 자연매체·고급 메시 한계 |
| Google Ink Stroke Modeler | 조건부 | 입력 모델 실험 | 정밀 트레이싱과 성격 충돌 |
| Google Ink 전체 메시 브러시 | 연구 | P2 기능 플래그 | C++→WASM·렌더 어댑터 |
| Hokusai | 조건부 | `.myb` 호환·자연매체 | 작은 생태계·릴리스 성숙도 |
| libmypaint 직접 WASM | 조건부 | 비교·호환 백엔드 | C 의존성·표면 어댑터 |
| WebGPU Wet Media | 연구→제품 | 활성 타일 한정 | 수치 안정성·모바일 비용 |
| Rust/WASM XPBD 브러시 | 조건부 | 펜촉·리본부터 | 브러시모 수 증가 비용 |
| Three.js + Rapier | 생산 후보 | 3D 주력 | 2D와 GPU context 공유 |
| JoltPhysics.js | 선택형 | 천·소프트바디 지연 로드 | 번들·CPU 비용 |
| OPFS journal | 생산 필수 | 저장 코어 | 영구 저장 승인·quota |
| SharedArrayBuffer | 조건부 | 격리 편집 origin | COOP/COEP와 외부 자산 |
| Yjs/Loro 협업 | 생산 후보 | 의미 객체만 CRDT | 픽셀을 CRDT화하는 실수 |
| PSD·ORA·SVG·PDF | 생산 우선 | 구조형 adapter | Photoshop 고유 기능 |
| `.clip/.cmc/.sut` 직접 완전 왕복 | 비현실적 전제 | 보존·부분 해석·브리지 | 비공개 규격·법적 검토 |
| 313개 포맷 직접 편집 | 비현실적 전제 | 등급형 registry | 유지보수·보안·회귀 비용 |

---

# 3. 최종 생산 아키텍처: 넓은 엔진 포트폴리오, 좁은 활성 경로

## 3.1 세 개의 2D 런타임 프로필

### Profile A — WebGPU Studio

최상위 성능 경로다.

```text
Rust/WASM wgpu RenderCore
├─ Custom Sparse Tile Renderer
├─ Custom EffectGraph Compute
├─ Vello vector island
├─ shared texture registry
└─ final compositor

CanvasKit
└─ 조판·SkSL·특수 효과가 필요한 큰 아일랜드만 비동기 제공
```

권장 사용 환경:

- 안정적인 WebGPU adapter가 있음
- 필요한 texture format과 limit를 통과함
- Worker WebGPU 또는 OffscreenCanvas 경로가 정상임
- 편집 origin이 cross-origin isolated임

### Profile B — CanvasKit Production

Vello 또는 custom WebGPU 경로가 불안정할 때의 고품질 경로다.

```text
CanvasKit WebGL 또는 WebGPU
├─ vector/path/text/effect
├─ raster tile image composition
└─ reference export

Custom WebGL2 Tile Renderer
└─ 대용량 래스터 brush와 dirty tile
```

CanvasKit과 WebGL2 compositor를 객체마다 교차하지 않는다. 텍스트·효과 그룹을 하나의 CanvasKit surface로 렌더해 texture island로 합성한다.

### Profile C — Compatibility/Safe

```text
Custom WebGL2 또는 PixiJS 중 하나
+ CanvasKit Software 또는 Vello CPU/tiny-skia
+ 저해상도 proxy tile
+ 자연매체·3D·대형 필터 품질 단계 축소
```

기능을 삭제하기보다 preview 해상도, 활성 젖은 타일, 파티클 수, 3D 보조 패스 수를 줄인다. 원본 문서 의미와 최종 고품질 출력 가능성은 유지한다.

## 3.2 단일 GPU 소유권

최고 성능을 위해 편집 프레임의 GPU 리소스 수명은 하나의 `GpuResourceAuthority`가 통제한다.

```rust
pub trait RenderBackend {
    fn capabilities(&self) -> BackendCapabilities;
    fn compile_island(&mut self, island: &RenderIslandIR) -> CompiledIsland;
    fn render(&mut self, frame: &FrameContext, island: &CompiledIsland);
    fn release(&mut self, key: ResourceKey);
    fn on_device_lost(&mut self, snapshot: &RecoverySnapshot);
}
```

### 금지 사항

- 엔진마다 독립 WebGPU device를 무조건 생성
- 매 프레임 CanvasKit→CPU→Vello 재업로드
- 단일 레이어 안에서 오브젝트마다 렌더러 교체
- `readPixels`로 중간 합성
- React 컴포넌트 unmount에 GPU 해제를 암묵적으로 맡김

## 3.3 CanvasKit과 Vello의 현실적인 결합

CanvasKit은 호출자가 제공한 WebGPU `GPUDevice`·`GPUTexture`를 받는 API를 제공한다. 그러나 Vello의 웹 경로와 같은 device를 공유하는 것이 현재 배포 빌드에서 자동으로 해결되는 것은 아니며, 서로 다른 Worker 사이에서 같은 GPU 객체를 자유롭게 전달할 수 있다고 가정해서도 안 된다.

따라서 다음 순서로 구현한다.

1. Rust/wgpu 코어 내부에서 Vello와 custom compute를 같은 Render Worker·device에 결합한다.
2. CanvasKit WebGPU의 외부 device·texture 연동을 **같은 JS realm/Render Worker 안에서** 별도 PoC로 검증한다.
3. 성공하면 `Interop Level 4`로 같은 texture registry를 사용한다.
4. 실패하면 CanvasKit을 별도 Worker 또는 같은 Worker의 독립 surface로 격리하고, 큰 조판·효과 아일랜드만 `ImageBitmap` 또는 제한된 texture copy로 합성한다.
5. 어떤 경우에도 객체 단위 전환이나 매 프레임 CPU readback은 허용하지 않는다.

## 3.4 엔진 지연 로딩

```text
기본 편집 진입
→ UI + Input + Raster Core + 기본 Vector만

벡터 작업공간
→ Vello module 로드

고급 텍스트·SkSL·출력
→ CanvasKit module 로드

MyPaint 브러시 최초 사용
→ Hokusai module 로드

3D 작업면 진입
→ Three/Rapier 로드

이미지 분석 도구 사용
→ OpenCV module 로드
```

각 WASM 모듈은 content hash와 ABI version으로 캐시하고, 초기 첫 획 전에 필요한 최소 셰이더만 워밍업한다.

---

# 4. 브라우저 호환성 정밀 설계

## 4.1 기능 존재가 아니라 실제 기능·limit를 측정

```ts
interface RuntimeCapabilities {
  webgpu: {
    available: boolean;
    workerAvailable: boolean;
    features: Set<string>;
    limits: Record<string, number>;
    preferredFormat?: string;
    timestampQuery: boolean;
  };
  webgl2: {
    available: boolean;
    extensions: Set<string>;
    maxTextureSize: number;
  };
  wasm: {
    simd: boolean;
    threads: boolean;
    memory64: boolean;
  };
  storage: {
    opfs: boolean;
    syncAccessHandle: boolean;
    persistentGranted: boolean;
    quota: number;
    usage: number;
  };
  input: {
    rawUpdate: boolean;
    coalesced: boolean;
    predicted: boolean;
    pressure: boolean;
    tilt: boolean;
    twist: boolean;
  };
}
```

## 4.2 브라우저별 운영 원칙

| 환경 | 기본 경로 | 반드시 둘 폴백 |
|---|---|---|
| Chromium desktop | WebGPU Studio | WebGL2·CanvasKit |
| Safari 26+ | WebGPU 가능 시 Studio | CanvasKit WebGL·CPU |
| Firefox 최신 | 실제 adapter·feature 통과 시 WebGPU | WebGL2·CPU |
| iPadOS Safari | 제한된 Studio/Battery | 타일·자연매체 제한 |
| Android Chromium | 기기별 benchmark 후 선택 | WebGL2·Battery |
| 인앱 WebView | Compatibility | 파일·클립보드 제한 안내 |

## 4.3 Worker 경로 실패에 대비

WebGPU와 OffscreenCanvas가 각각 지원되더라도 조합 경로가 모든 환경에서 동일하게 안정적이라고 가정하지 않는다.

```text
Worker WebGPU 정상
→ Render Worker

Worker WebGPU 실패, main WebGPU 정상
→ Main GPU Scheduler + Worker geometry

OffscreenCanvas 실패
→ main canvas 렌더 + 계산 Worker

WebGPU 실패
→ WebGL2

GPU 모두 실패
→ CPU Safe Mode
```

## 4.4 cross-origin isolation 전략

WASM threads와 `SharedArrayBuffer`는 cross-origin isolation이 필요하다. 외부 이미지·폰트·3D 자산이 COEP를 깨뜨리지 않도록 편집기 origin을 분리한다.

```text
studio.toonstudio.cloud
→ COOP/COEP 활성화
→ 프록시 또는 자체 호스팅 자산
→ SAB·WASM threads·고성능 편집

share.toonstudio.cloud
→ 외부 embed 친화적 검토·공유 shell
→ 비격리 폴백
```

비격리 환경에서는 SAB 대신 프레임 단위 transferable `ArrayBuffer` batch를 사용한다.

---

# 5. 입력 지연과 필기감 계약

## 5.1 고주파 데이터는 React를 통과하지 않는다

```text
pointerrawupdate / pointermove
→ main-thread capture 0-copy normalization
→ SAB ring 또는 transferable batch
→ Input Worker
→ preview geometry
→ Render Worker queue
```

React에는 다음 저주파 상태만 전달한다.

- 현재 도구 이름
- 브러시 크기·불투명도 표시
- 문서 dirty 상태
- 저장·동기화 상태
- 초당 10회 이하 성능 HUD

## 5.2 입력 샘플 구조

```rust
#[repr(C)]
pub struct PointerSample {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
    pub tilt_x: f32,
    pub tilt_y: f32,
    pub twist: f32,
    pub timestamp_us: u32,
    pub flags: u16,
}
```

개별 샘플마다 JS→WASM 함수를 호출하지 않고, 1프레임 또는 일정 개수의 batch로 넘긴다.

## 5.3 네 가지 입력 프로필

| 프로필 | 목적 | 처리 성격 |
|---|---|---|
| Ink Smooth | G펜·손글씨 | 예측·스프링·부드러움 우선 |
| Precision Trace | 트레이싱·자 | 예측 최소·위치 정확도 우선 |
| Texture Preserve | 연필·목탄 | 미세한 손 떨림 일부 보존 |
| Physics Gesture | 리본·헤어 | 속도·가속도·방향 연속성 우선 |

Google Ink Stroke Modeler는 부드러운 필기를 위한 후보지만 정밀 트레이싱에서는 별도 프로필이 필요하다. 초기 생산 경로는 자체 Rust 필터와 Perfect Freehand/Vello를 사용하고, Google Ink 전체 메시 경로는 PoC 통과 후 추가한다.

## 5.4 지연 목표

아래 수치는 제품 목표이며 실제 기기 벤치마크로 검증한다.

| 지표 | Studio 기준 목표 | 최소 허용 |
|---|---:|---:|
| main-thread 입력 처리 p95 | 0.5ms 이하 | 1.0ms 이하 |
| preview 제출 p95 | 4ms 이하 | 8ms 이하 |
| input-to-photon p50 | 25ms 이하 | 35ms 이하 |
| input-to-photon p95 | 40ms 이하 | 60ms 이하 |
| 일반 획 pointer-up 후 final 수렴 | 50ms 이하 | 100ms 이하 |
| 자연매체·물리 획 final 수렴 | 150ms 이하 | 300ms 이하 |
| drawing 중 UI long task | 50ms 이상 0건 | 세션당 1건 이하 |

예측 획은 최종 획과 다른 seed를 사용하지 않으며, final 도착 시 화면이 튀지 않도록 공통 중심선과 압력 모델을 사용한다.

---

# 6. 대형 캔버스·타일·메모리 구조

## 6.1 전체 캔버스 텍스처 금지

8K RGBA8 한 장은 약 256MB 수준이며, 레이어마다 전체 텍스처를 만들면 브라우저 메모리는 즉시 한계에 도달한다. 모든 래스터 레이어는 희소 타일로 저장한다.

```text
RasterLayer
└─ SparseVirtualTexture
   ├─ PageTable
   ├─ TileMetadata
   ├─ GPUResidentPool
   ├─ CPUCompressedCache
   └─ OPFSChunkIndex
```

## 6.2 권장 타일 계층

```text
Brush working tile
→ 256×256 기본, 모바일 128×128 선택

Hokusai tile
→ 64×64 내부 타일
→ 4×4 또는 8×8을 macro page로 묶음

Export tile
→ 필터 halo와 메모리에 따라 512~2048 가변
```

Hokusai의 작은 타일을 GPU page table에 개별 등록하지 말고 macro page로 묶어 관리 비용과 경계 복사를 줄인다.

## 6.3 타일 상태

```ts
interface TileRecord {
  key: TileKey;
  version: number;
  dirtyRect: Rect;
  gpuSlot?: number;
  mipMask: number;
  contentHash?: string;
  opfsChunk?: string;
  wetState?: WetTileState;
  alphaSummary: AlphaSummary;
  recoveryGeneration: number;
}
```

## 6.4 GPU 메모리 예산

절대 MB를 모든 기기에 고정하지 않는다.

```text
실제 adapter limits
+ 성공적으로 할당 가능한 probe texture
+ 최근 device pressure·eviction
+ 문서 working set
→ 동적 GPU budget
```

정책:

- viewport 주변 타일 우선
- 현재 획의 타일 pin
- 화면 밖 mip 우선 퇴출
- 젖은 타일은 상태 압축 후 퇴출
- 3D depth·normal·ID pass는 필요 시 생성
- 필터 중간 texture는 graph lifetime 분석으로 재사용
- texture atlas fragmentation을 주기적으로 정리

## 6.5 색상·정밀도

- UI preview는 가능한 경우 선형 색공간에서 합성
- 일반 래스터 저장은 8-bit 또는 16-bit 옵션
- 자연매체·필터 중간 계산은 지원 기기에서 half-float
- premultiplied alpha 계약을 모든 엔진에 통일
- 출력 직전에 ICC·gamut·tone mapping 수행
- 고급 출력은 타일 단위 2× 또는 4× supersampling 가능

---

# 7. 벡터·텍스트 엔진의 실제 배치

## 7.1 Vello

### 적극 활용

- 수천~수십만 개 동적 path
- 가변 폭 선화 outline
- 컷·말풍선·선택·앵커·가이드
- 협업 커서·편집 오버레이
- GPU compute 기반 벡터 아일랜드

### 격리 필요

- 공식 상태가 알파
- API 변경 가능성
- Hybrid·CPU가 기능 동등성을 완성하지 못함
- 웹이 모든 경로에서 최우선 타깃이라고 가정할 수 없음

### 채택 계약

```text
StudioDocument / ToonSceneIR
→ VelloAdapter
→ pinned version
→ visual golden corpus
→ backend swap 가능
```

Vello 타입을 저장 포맷이나 플러그인 ABI에 노출하지 않는다.

## 7.2 CanvasKit

### 주력 역할

- Paragraph·CJK 조판
- PathEffect
- SkSL RuntimeEffect
- ImageFilter
- Skottie
- PDF·이미지 기준 렌더
- WebGPU 실패 시 WebGL·Software 표면

### 성능 규칙

- custom CanvasKit build로 불필요 모듈 제외
- `Make`·`new`로 생성한 객체를 명시적으로 `.delete()`
- PathBuilder·Paint·Font·ParagraphStyle pooling
- 한 프레임에서 임시 SkPath 대량 생성 금지
- 모듈을 기본 초기 번들에 포함하지 않고 필요 시 로드
- Paragraph 결과와 glyph atlas 캐시

## 7.3 Perfect Freehand·Lyon·Kurbo

초기 생산 경로는 이 조합이 가장 낮은 위험으로 가변 폭 선을 제공한다.

```text
PointerSamples
→ Rust stabilizer
→ centerline
→ width profile
→ Lyon/Kurbo outline
→ Vello 또는 CanvasKit fill
```

Perfect Freehand는 JS 프로토타입과 빠른 폴백에 쓰고, 대형 문서의 최종 기하는 Rust 구현으로 옮긴다.

## 7.4 Google Ink

- Stroke Modeler는 별도 입력 엔진 실험
- 전체 Ink는 메시 기반 고급 펜의 P2 후보
- Android 렌더 유틸리티를 브라우저용으로 그대로 사용할 수 있다고 가정하지 않음
- C++→WASM, mesh ABI, shader, hit-test, export 변환이 필요
- API 안정성 보장이 없으므로 문서 원본은 `StrokeIR`로 유지

---

# 8. 브러시 엔진의 품질·성능 보완

## 8.1 단일 `BrushProgramIR`

```ts
interface BrushProgramIR {
  input: InputDynamicsGraph;
  stabilizer: StabilizerGraph;
  geometry: GeometryGraph;
  tip: TipGraph;
  material: MaterialGraph;
  color: ColorMixGraph;
  physics?: PhysicsGraph;
  output: BrushOutputContract;
  deterministicSeed: bigint;
  engineHints: EngineHint[];
}
```

브러시 프리셋은 특정 엔진의 옵션 객체가 아니다. Hokusai, Vello, CanvasKit, WebGPU, CPU 폴백으로 다시 컴파일할 수 있는 의미 그래프다.

## 8.2 JS/WASM 경계 최소화

나쁜 구조:

```text
각 dab마다 JS 함수
→ WASM 호출
→ GPU draw call
```

최종 구조:

```text
Pointer sample batch
→ WASM이 centerline·dynamics batch 생성
→ storage buffer에 한번 업로드
→ compute shader가 dab/mesh 확장
→ indirect draw 또는 tile compute
```

## 8.3 GPU dab renderer 개선

- tip atlas와 mipmap
- spacing을 arc length로 계산
- 큰 브러시는 stamp 수를 무조건 늘리지 않고 anisotropic footprint 사용
- random은 획 seed와 dab index로 결정
- dirty tile bitset을 GPU에서 생성
- 동일 blend·tip·material의 dab batch를 합침
- opacity와 flow를 분리
- 저배율에서는 mip 기반 누적, 고배율에서는 실제 coverage
- 지우개도 별도 CPU path가 아니라 동일 shader의 blend variant

## 8.4 선화 품질 개선

- 중심선과 최종 외곽선을 모두 보존
- 코너 검출 후 smoothing 강도 자동 감소
- endpoint 보정은 pointer-up 이후 짧은 구간만
- pressure curve를 장치 교정과 브러시 스타일로 분리
- tilt·azimuth discontinuity 제거
- 확대율별 analytic AA 또는 coverage mask
- export에서 고해상도 재래스터 가능

## 8.5 품질 평가 corpus

```text
직선·원·S곡선
급격한 코너
저속↔고속
압력 0→1→0
짧은 시작·끝 taper
tilt 8방향
회전 sweep
교차선
선 겹침
지우개
10분 연속 드로잉
고배율·저배율
장치별 동일 획
```

측정값:

- RMS jitter
- corner deviation
- endpoint error
- pressure monotonicity
- predicted overshoot
- line-width variance
- coverage gap
- 확대율별 aliasing
- 엔진별 visual diff

---

# 9. 자연매체의 현실적인 2계층 구조

## 9.1 `.myb` 호환 계층

```text
Hokusai 우선
+ libmypaint reference backend
+ mypaint-brushes corpus
+ ToonTileSurface adapter
```

Hokusai 저장소가 제공하는 높은 stock brush 일치도는 유망하지만 프로젝트 자체 측정치다. ToonStudio는 동일 corpus를 자체 CI에서 다시 렌더하고 결과를 독립 검증해야 한다.

채택 조건:

- pinned commit 또는 vendored fork
- 196개 stock brush golden
- x86·ARM·Safari·Firefox 결과 비교
- tile seam 0
- 30분 smudge soak에서 메모리 안정
- preset parsing fuzz test

## 9.2 프리미엄 Wet Media 계층

Hokusai만으로 종이 흡수, backrun, granulation, 장기 건조, 임파스토를 모두 해결하지 않는다.

```text
Active Wet Tile
├─ pigment
├─ fixed pigment
├─ water/wetness
├─ velocity
├─ absorption
├─ paper height/fiber
├─ viscosity
└─ height/normal
```

## 9.3 계산 비용 제한

- viewport 안과 주변의 젖은 타일만 시뮬레이션
- 동시 활성 wet tile 상한을 품질 프로필별로 설정
- 화면 밖 타일은 낮은 주파수
- 임계 wetness 아래에서 정적 타일로 bake
- 대형 캔버스 전체 pressure solve 금지
- interactive preview는 적은 iteration
- idle·export에서 iteration 증가
- 모바일에서는 diffusion·granulation을 근사 shader로 대체 가능

## 9.4 자연매체 품질 검사

- edge darkening
- pigment mass conservation
- tile seam
- 반복 재현성
- 같은 seed의 교차 브라우저 결과
- 종이 텍스처 주기성
- 색 혼합 ΔE
- 5분·30분·2시간 건조 단계
- stroke overlap 순서 의존성

---

# 10. 필터·효과 성능 보완

## 10.1 `EffectGraphCompiler`

```text
EffectGraphIR
→ type/color-space validation
→ bounds·halo analysis
→ constant folding
→ adjacent color-op fusion
→ separable-kernel rewrite
→ downsample pyramid
→ tile schedule
→ backend selection
→ preview/export variants
```

## 10.2 자동 최적화

| 패턴 | 변환 |
|---|---|
| 밝기→대비→채도→opacity | 단일 WGSL/SkSL pass |
| 큰 Gaussian blur | downsample pyramid + separable blur |
| 여러 동일 mask | mask texture 재사용 |
| 화면 밖 adjustment | 실행 생략 |
| 정적 filter island | 결과 캐시 |
| 3D depth 기반 효과 | depth pass를 여러 효과가 공유 |
| export-only 고정밀 효과 | 편집 중 proxy |

## 10.3 CPU·GPU 선택

- 작은 국소 타일: GPU compute
- 매우 작은 단발 이미지: WASM CPU가 더 빠를 수 있음
- OpenCV 형태학: Worker/WASM, 결과 mask만 GPU 업로드
- 대형 리사이즈·포맷 변환: wasm-vips 또는 Local Bridge
- 결정적 검수: CPU renderer
- 실시간 색상 조정: WGSL 또는 SkSL

## 10.4 필터 수용 기준

- filter on/off 1프레임 내 반응
- 조정 슬라이더 중 60fps 목표
- 큰 blur preview가 main thread를 막지 않음
- tile edge halo 없음
- preview와 export의 허용 오차 명시
- 색공간 전환 전후 clipping·banding 검사

---

# 11. 3D·물리의 실제 경계

## 11.1 생산 기본

```text
Three.js
+ three-vrm
+ three-mesh-bvh
+ Rapier
+ glTF Transform
```

이 조합은 VRM 포즈, 카메라, 라이트, 충돌, 소품 배치, GLB 최적화까지 현실적인 생산 범위다.

## 11.2 조건부 기능

- JoltPhysics.js: 천·소프트바디·고급 래그돌이 실제 필요할 때만 로드
- OpenCascade/replicad: CAD workspace에서만 로드
- Manifold: Boolean worker로 격리
- MuJoCo WASM: 연구·정밀 접촉 실험, 기본 제품 번들 제외

## 11.3 2D와의 연결

3D 렌더러를 매 레이어 안에 직접 혼합하지 않는다.

```text
Scene3D
→ color/depth/normal/object-ID passes
→ one 3D render island
→ 2D compositor texture
→ vector line extraction는 비동기 worker
```

3D 카메라나 포즈가 바뀔 때만 보조 pass를 갱신하고, 정지한 장면은 texture·vector result를 캐시한다.

## 11.4 물리 브러시 경계

Rapier 강체를 브러시모마다 만들지 않는다.

- 펜촉·브러시모: 자체 경량 XPBD
- 리본·로프·헤어: 제한된 입자 체인
- 3D 장면·오브젝트: Rapier
- 천·소프트바디: Jolt 선택형
- 유체·안료: WebGPU compute

---

# 12. 저장·복구 아키텍처 보완

## 12.1 OPFS는 빠른 로컬 저장소이지 백업이 아니다

브라우저 저장은 기본적으로 best-effort일 수 있고, 사용자가 데이터를 삭제할 수 있다. 따라서 다음 세 층을 둔다.

```text
Layer 1  OPFS command journal + tile chunks
Layer 2  periodic portable recovery package
Layer 3  optional encrypted cloud/project sync
```

## 12.2 지속 저장 흐름

```text
명령 확정
→ command journal append
→ 변경 tile chunk append
→ journal fsync/close 정책
→ UI에 local-safe generation 표시
→ idle checkpoint
→ cloud sync generation 표시
```

`unload` 또는 탭 종료 이벤트에 마지막 저장을 맡기지 않는다.

## 12.3 Storage Worker

`FileSystemSyncAccessHandle`을 사용할 수 있는 dedicated worker에서 다음을 수행한다.

- append-only journal
- content-addressed tile chunks
- checkpoint compaction
- orphan chunk GC
- quota monitor
- recovery verification
- schema migration snapshot

## 12.4 저장 상태 UX

```text
로컬 안전
클라우드 동기화 중
클라우드 안전
저장 공간 부족
영구 저장 미승인
복구 패키지 오래됨
```

이 상태를 상단에 상시 표시하고, `navigator.storage.persist()` 승인 여부와 quota 추정치를 Capability Center에서 보여준다.

## 12.5 GPU device loss 복구

```text
device.lost
→ 신규 입력 임시 CPU preview
→ GPU adapter/device 재생성
→ pipeline cache 재컴파일
→ viewport 타일을 OPFS/CPU cache에서 복원
→ vector scene 재컴파일
→ 편집 재개
```

GPU texture만 유일한 원본으로 두지 않는다.

---

# 13. 협업 구조 보완

## 13.1 CRDT에 넣을 것

- 레이어·그룹·객체 metadata
- 벡터 획·텍스트·말풍선
- 3D 장면의 의미 transform
- 댓글·승인·작업 상태
- 브러시 프리셋 참조와 seed
- 타일 버전·content hash

## 13.2 CRDT에 넣지 않을 것

- 픽셀 하나마다 CRDT 노드
- 매 유체 simulation frame
- GPU texture bytes
- 모든 파티클 위치
- 대형 GLB·PSD binary 자체

대형 binary는 content-addressed object store로 전송하고 CRDT는 참조만 공유한다.

## 13.3 결정성과 베이크

자연매체·물리·파티클은 다음을 저장한다.

```text
input samples
+ preset version
+ engine version
+ seed
+ quality profile
+ final baked tile/vector result
```

재생은 가능하지만, 협업의 최종 정답은 베이크 결과다.

---

# 14. 포맷·CSP 호환성의 실구현 보완

## 14.1 313개 포맷 표기의 의미 변경

레지스트리는 다음을 의미한다.

```text
직접 왕복 가능한 포맷
+ 구조형 import/export 후보
+ 시각형 import 후보
+ Local ToonBridge 후보
+ 원본 보존·미리보기 후보
```

제품 UI의 “지원 포맷”에는 검증을 통과한 항목만 노출한다.

## 14.2 출시 우선 포맷

### 직접 구조형 우선

- PSD/PSB
- OpenRaster
- PNG/APNG, JPEG, WebP, AVIF, TIFF
- SVG/SVGZ
- PDF
- ABR, MYB, GPL/ASE/ACO 계열 팔레트
- GLB/glTF, VRM, OBJ
- WAV, MP3/AAC/Opus, MP4/WebM의 지원 코덱
- PPTX export와 제한적 import

### 보존·부분 해석 우선

- `.clip/.lip`
- `.cmc/.csnf`
- `.sut/.sutg/.laf`
- 폐쇄형 Procreate·Affinity·Sketch 버전별 프로젝트
- BLEND, Maya, C4D 등의 네이티브 프로젝트

## 14.3 `.clip/.cmc/.sut`의 현실적인 계약

공식 공개 사양이 없는 포맷은 다음만 보장한다.

- 원본 파일 불변 보존
- magic·container·thumbnail·composite 안전 분석
- 확인된 구조만 의미 객체로 변환
- 모르는 블록은 opaque payload로 보존
- PSD/PSB·PNG·페이지별 표준 출력 브리지
- 대상 앱에서 재개방 시험을 통과한 출력만 “왕복” 표시
- 역공학·배포 범위는 법무·라이선스 검토

## 14.4 가져오기 보안

모든 parser는 sandbox worker에서 실행한다.

- 압축 폭탄 제한
- 이미지 dimension·pixel count 제한
- XML entity 금지
- recursion·node count 제한
- font·shader·script 실행 금지
- time/memory budget
- fuzz corpus
- 오류 파일 원본 보존

---

# 15. CSP 전환 UI를 유지하면서 React 성능을 지키는 방법

## 15.1 상태 분리

```text
React state
→ 패널·메뉴·선택 요약·저장 상태

External document store
→ LayerGraph·CommandLog·Selection model

Worker-owned state
→ pointer stream·brush dynamics·GPU scene·tiles
```

## 15.2 Layer Tree

- 행 virtualization
- 펼친 하위 트리만 materialize
- thumbnail은 비동기 우선순위 큐
- opacity slider 중 문서 전체 직렬화 금지
- drag 중 임시 overlay만 갱신
- 다중 선택 명령은 단일 transaction

## 15.3 Inspector

- `requestAnimationFrame` 단위로 값 commit
- preview와 document commit 분리
- 숫자 입력은 local draft 후 확정
- brush graph 변경 시 영향을 받는 shader만 재컴파일
- 무거운 설정은 “적용 비용” 표시

## 15.4 CommandRegistry

모든 메뉴·단축키·Quick Deck·Selection HUD·도움말은 동일 CommandID를 사용한다. 이 구조는 기능 발견성과 테스트 자동화를 동시에 높인다.

## 15.5 CSP 이질감 최소화와 ToonStudio 개선의 균형

- 기본 배치는 CSP 사용자가 예상하는 위치
- 기능명은 ToonStudio 표준명 하나, CSP 구·신 용어는 검색 별칭
- Tool Shift와 modifier key를 완전 지원
- Quick Access는 Quick Deck으로 1동작 유지
- 고급 설정은 숨기되 검색과 도움말에서 항상 접근 가능
- 사용자가 적응하면 더 짧은 동선의 추천을 비강제적으로 제시

---

# 16. 성능·품질 벤치마크 계약

## 16.1 참조 기기 등급

| 코드 | 환경 | 목적 |
|---|---|---|
| D-H | 고성능 데스크톱 GPU | Studio 최대 품질 |
| D-I | 통합 GPU 데스크톱·노트북 | 일반 생산 기준 |
| T-H | 최신 고성능 태블릿 | 펜 중심 기준 |
| M-M | 중급 Android 모바일 | Battery/Lite 기준 |
| CPU | GPU 차단·실패 환경 | Safe Mode |

실제 모델명과 브라우저 버전은 CI 대시보드에서 고정한다.

## 16.2 장면 corpus

| ID | 장면 | 핵심 스트레스 |
|---|---|---|
| S01 | 4K, 50 래스터 레이어 | 기본 타일 합성 |
| S02 | 8K, 희소 100 레이어 | page table·eviction |
| S03 | 100,000 vector paths | Vello/CanvasKit 비교 |
| S04 | 10,000 glyph CJK 문서 | Paragraph·glyph cache |
| S05 | 512px textured brush | dab batch·atlas |
| S06 | 64개 동시 wet tile | compute·bake |
| S07 | blur·LUT·tone 20노드 | pass fusion |
| S08 | VRM 5체 + props | 3D island |
| S09 | 5인 협업 + binary tile | CRDT·chunk sync |
| S10 | PSD 2GB급 합성 테스트 | streaming·memory |
| S11 | 4시간 soak drawing | leak·journal |
| S12 | device loss·탭 freeze | recovery |

## 16.3 주요 성능 목표

| 범주 | 목표 |
|---|---|
| 4K 일반 편집 | D-I에서 60fps 목표 |
| 8K 희소 문서 | D-I에서 pan/zoom 30~60fps |
| 레이어 목록 | 10,000행에서도 UI 입력 차단 없음 |
| 벡터 장면 | 100k path pan/zoom에서 프레임 예산 유지 |
| 브러시 | 연속 10분 입력에서 샘플 손실·메모리 증가 제한 |
| 필터 | 조정 슬라이더 preview가 비동기·취소 가능 |
| 저장 | 명령 확정 후 local-safe generation 100ms 목표 |
| 복구 | 강제 종료 후 마지막 journal generation까지 복원 |
| 내보내기 | tile streaming으로 전체 비트맵 상주 금지 |

## 16.4 품질 목표

### 선화

- corner·endpoint error 임계값
- line width curve 오차
- 400% 확대 aliasing 검사
- 예측↔final 위치 jump

### 자연매체

- 타일 경계 seam 0
- 물·안료 질량 오차
- same-seed 재현성
- paper texture 반복 감지
- 색상 ΔE2000

### 필터·합성

- premultiplied alpha edge fringe 없음
- linear-light 합성 기준
- cross-backend visual diff
- preview·export 허용 오차

### 파일

- 레이어 수·순서·이름·마스크 보존율
- 텍스트 editability
- blend·ICC·font 대체 보고
- 대상 앱 reopen 성공
- reference composite와 SSIM/ΔE 비교

---

# 17. 필수 PoC 게이트

| 게이트 | 검증 내용 | 통과 기준 | 실패 시 조치 |
|---|---|---|---|
| G-R0 | 현재 코드 계측 | 입력·렌더·저장 flame chart 확보 | 기능 개발 중지 후 계측부터 |
| G-R1 | WebGPU sparse tile | 4K/8K corpus와 device loss 통과 | WebGL2 core 우선 |
| G-R2 | Vello 100k path | 성능·메모리·visual golden 통과 | CanvasKit/자체 tessellation |
| G-R3 | CanvasKit 조판·SkSL | CJK·메모리 soak·명시 해제 통과 | HarfBuzz+Vello/CPU |
| G-R4 | Vello/CanvasKit/WebGPU interop | CPU readback 없이 큰 island 합성 | 엔진 격리·ImageBitmap |
| G-I1 | 입력 worker | Chrome/Safari/Firefox 지연 목표 | main GPU fallback |
| G-B1 | `.myb` corpus | stock preset golden·seam·soak | libmypaint bridge |
| G-B2 | Wet Media | 활성 타일 상한 내 fps·안정성 | 근사 shader·기능 플래그 |
| G-B3 | Google Ink | 포팅 비용·메시 품질이 이점 증명 | 자체 Rust+Vello 유지 |
| G-F1 | EffectGraph | pass fusion·halo·cancel 통과 | CanvasKit/CPU 분리 |
| G-S1 | OPFS crash recovery | kill/freeze/quota 시 복원 | cloud/recovery 강화 |
| G-C1 | 협업 | 5인·offline merge·tile chunk | lock 기반 단계 출시 |
| G-P1 | PSD/ORA 왕복 | 구조·시각 재개방 기준 통과 | 지원 등급 하향 |
| G-CSP1 | `.clip/.sut` | 보존·부분 해석·오류 안전 | Local ToonBridge만 |
| G-X1 | cross-engine parity | 허용 diff 내 결과 | backend별 출력 표시 |

어떤 실험 엔진도 해당 게이트를 통과하기 전 기본 경로가 될 수 없다.

---

# 18. 위험 레지스터

## 18.1 Green — 지금 채택해도 되는 기반

- React UI와 CommandRegistry
- Pointer Events 기반 입력 추상화
- 자체 문서 IR·CommandLog
- 희소 타일 데이터 모델
- Worker·OPFS journal
- CanvasKit의 제한된 조판·출력 경로
- Perfect Freehand 또는 Rust outline
- Three.js·Rapier 기본 3D
- PSD·ORA·SVG·GLB 등 공개 포맷 adapter
- 의미 객체 CRDT + binary chunk 분리

## 18.2 Yellow — 게이트 뒤 조건부 채택

- Vello 생산 벡터 경로
- CanvasKit WebGPU 외부 device 공유
- Worker WebGPU를 모든 지원 브라우저의 기본으로 사용
- Hokusai를 유일 자연매체 엔진으로 사용
- 대형 WebGPU Wet Media
- Jolt 소프트바디
- Google Ink Stroke Modeler
- Memory64 codec worker
- `.sut` 고충실 변환

## 18.3 Red — 현재 완전 지원을 약속하면 안 됨

- `.clip/.cmc` 완전 직접 왕복
- 모든 CSP 브러시의 픽셀 완전 동일성
- 313개 포맷의 모두 직접 편집
- 16K 수백 레이어를 전부 GPU 상주
- 모바일에서 고해상도 wet media·physics·3D·협업 동시 최고 품질
- Vello·CanvasKit·Three.js가 항상 같은 GPU device를 공유한다는 전제
- OPFS만으로 영구 백업이 된다는 전제
- 라이선스 없는 공개 코드를 직접 복사

---

# 19. 수정된 구현 순서

## Stage A — 계측·문서 계약

1. `/studio/diagnostics`
2. input latency recorder
3. frame·GPU·memory HUD
4. 문서·CommandLog·TileStore 계약
5. crash-recovery harness
6. visual golden infrastructure

완료 조건: 현재 앱의 병목을 재현 가능한 수치로 설명할 수 있어야 한다.

## Stage B — 하나의 생산 2D 코어

1. sparse tile store
2. WebGPU raster core
3. WebGL2 fallback
4. worker input
5. preview/final stroke
6. OPFS journal
7. device-loss recovery

완료 조건: 4K·8K corpus와 4시간 soak를 통과한다.

## Stage C — 벡터·텍스트

1. Rust stabilizer·outline
2. Vello adapter
3. CanvasKit paragraph/effect island
4. cross-engine golden
5. CSP형 Layer/Tool UI

완료 조건: Vello가 실패해도 문서를 열고 출력할 수 있다.

## Stage D — CSP 사용자 이식

1. PSD/PSB·ORA
2. ABR·MYB·팔레트
3. CSP shortcut/workspace
4. `.clip/.cmc/.sut` preserve-first
5. Brush Fidelity Lab
6. Local ToonBridge

완료 조건: 이식 손실이 객체별 보고서로 노출된다.

## Stage E — 자연매체·필터

1. Hokusai corpus
2. EffectGraph compiler
3. wet-media 제한형
4. XPBD 펜촉·리본
5. export quality rerender

완료 조건: interactive quality와 final quality가 명시적이고 재현 가능하다.

## Stage F — 3D·협업·고급 포맷

1. Three/Rapier island
2. VRM·depth/normal/ID
3. 의미 객체 CRDT
4. binary chunk sync
5. 단계적 포맷 registry 확대

완료 조건: 2D 핵심 성능을 떨어뜨리지 않고 기능이 지연 로드된다.

## Stage G — 연구 기능

- Google Ink full mesh backend
- advanced wet pigment
- Jolt cloth/soft body
- CAD kernel
- semantic continuity AI
- 실험 포맷 parser

연구 기능은 기본 문서 형식과 생산 경로를 변경할 권한이 없다.

---

# 20. 품질·성능을 더 올릴 수 있는 추가 수단

## 20.1 소스 의미 보존과 출력 재렌더

픽셀 결과만 저장하지 않고 원본 샘플·중심선·압력·브러시 그래프를 저장하면 화면에서는 저비용 preview를 쓰고, 출력에서는 더 높은 sampling·AA·필터 precision으로 재렌더할 수 있다.

## 20.2 동적 해상도와 LOD

- 그리는 동안 현재 획 주변만 full quality
- 화면 밖 자연매체 낮은 frequency
- 저배율에서 vector flatten tolerance 증가
- 3D 보조 패스 절반 해상도
- 필터 preview proxy, idle final
- 사용자 입력이 멈추면 자동 refine

## 20.3 파이프라인 사전 워밍업

- 기본 브러시 shader
- normal/multiply/erase blend
- common filter kernels
- glyph atlas
- tip atlas
- Vello pipeline

문서 열기 후 idle 시간에 비동기 준비하고 첫 획 직전에 컴파일하지 않는다.

## 20.4 자동 비용 예측

필터·브러시·3D 기능을 실행하기 전에 예상 타일 수, 중간 texture, wet tile 수, GPU pass를 계산한다.

```text
안전
주의
Lite preview 권장
최종 출력에서만 실행 권장
```

사용자는 품질 저하가 아니라 계산 시점과 preview 품질을 선택한다.

## 20.5 서버는 폴백·출력 전용

서버 렌더는 일상 필기 경로에 넣지 않는다. 다음 용도로 한정한다.

- 매우 큰 출력
- 직접 지원하기 어려운 전문 포맷 변환
- 저사양 기기의 final rerender
- 팀 검수용 결정적 렌더
- 악성 파일 격리 분석

## 20.6 자동 성능 회귀 차단

PR마다 다음을 비교한다.

- JS bundle·WASM module 크기
- first-stroke latency
- shader compile count
- GPU allocation peak
- 100k path frame time
- tile upload bytes
- OPFS journal latency
- CanvasKit live object count
- visual golden diff

임계값을 넘은 PR은 자동 차단한다.

---

# 21. 최종 권장 패키지 경계

```text
packages/
├─ studio-document
├─ command-kernel
├─ input-core
├─ brush-program-ir
├─ stroke-rust
├─ render-core-wgpu
├─ render-vello-adapter
├─ render-canvaskit-service
├─ render-webgl2-fallback
├─ tile-store
├─ effect-graph
├─ natural-hokusai
├─ natural-wetmedia
├─ physics-brush-xpbd
├─ scene3d-three
├─ physics-scene-rapier
├─ text-layout
├─ format-gateway
├─ format-psd
├─ format-ora
├─ format-svg-pdf
├─ format-csp-preserve
├─ toonbridge-client
├─ storage-opfs
├─ collab-backend
├─ capability-center
├─ quality-orchestrator
├─ diagnostics
├─ benchmark-corpus
└─ ui-react
```

각 엔진 adapter는 공통 IR만 받고, 서로의 런타임 객체를 직접 참조하지 않는다.

---

# 22. 최종 아키텍처 결정

## 22.1 출시 핵심 경로

```text
React UI
+ Rust/WASM input·stroke
+ Custom sparse tile renderer
+ Vello 조건부 vector island
+ CanvasKit text/effect/export service
+ WebGL2/CPU safe mode
+ OPFS journal·checkpoint
+ PSD/ORA/SVG/GLB 우선 포맷
+ CSP workspace·shortcut·preserve-first migration
```

## 22.2 품질 확장 경로

```text
Hokusai `.myb`
+ Wet Media active tiles
+ XPBD nib/ribbon
+ Three/Rapier
+ cross-engine final rerender
```

## 22.3 연구 경로

```text
Google Ink full mesh
+ advanced pigment physics
+ Jolt cloth/soft body
+ direct proprietary format parser
+ CAD kernel
```

## 22.4 가장 중요한 원칙

> ToonStudio의 경쟁력은 엔진의 개수가 아니라, **한 시점에 필요한 엔진만 활성화하고, 모든 결과를 공통 문서·품질 계약·복구 체계 아래 통제하는 능력**에서 나온다.

이 구조라면 V4.2에서 제안한 광범위한 기능을 포기하지 않으면서도, 실제 개발은 안정적인 생산 코어부터 시작하고 고위험 기능을 측정 가능한 게이트 뒤에 둘 수 있다.

---

# 23. 공식 기술 자료

- WebGPU specification: https://www.w3.org/TR/webgpu/
- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- WebKit WebGPU: https://webkit.org/blog/17128/webgpu-and-hdr-support-in-safari-26-beta/
- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- SharedArrayBuffer security: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Storage persistence: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- Vello: https://github.com/linebender/vello
- CanvasKit: https://skia.org/docs/user/modules/canvaskit/
- CanvasKit changelog: https://skia.googlesource.com/skia/+/refs/heads/main/modules/canvaskit/CHANGELOG.md
- Google Ink: https://github.com/google/ink
- Ink Stroke Modeler: https://github.com/google/ink-stroke-modeler
- Hokusai: https://github.com/reearth/hokusai
- libmypaint: https://github.com/mypaint/libmypaint
- Pointer Events Level 3: https://www.w3.org/TR/pointerevents3/
- Clip Studio Paint file manual: https://help.clip-studio.com/en-us/manual_en/210_file/Open_file.htm

---

# 부록 A. V4.2 전체 통합 문서

아래에는 CSP 무이질감 전환, 최대 포맷 상호운용, UI/UX 동선, 브러시·필터·3D·경쟁 제품 분석을 포함한 V4.2 전체 내용을 원문으로 보존한다. V4.3의 실구현성 판정과 충돌할 경우 V4.3 본문의 위험 등급·게이트·활성 엔진 예산을 우선한다.

# ToonStudio CSP 무이질감 전환·최대 확장자 상호운용·직관적 UI/UX 정교화 아키텍처 V4.2

## Clip Studio Paint 사용자가 작업 습관·브러시·소재·프로젝트를 가능한 많이 유지하면서, 브라우저의 장점과 ToonStudio의 멀티엔진 품질을 즉시 얻도록 설계한 최종 정교화안

- 기준일: **2026-08-07**
- 대상 서비스: `https://www.toonstudio.cloud/studio`
- 선행 문서: V4.1 브라우저 호환성·최대 포맷 상호운용성 아키텍처 전체를 부록으로 보존
- 이번 V4.2의 최우선 목표: **Clip Studio Paint 사용자의 인지·조작·파일·소재·단축키 전환 비용 최소화**
- 확장 파일 레지스트리: **313개 포맷/규격 행**
- CSP 전환 UI/UX·명령 동선 매핑: **63개 항목**

> **최종 원칙:** CSP를 시각적으로 복제하지 않는다. 대신 사용자가 이미 학습한 `도구 → 도구 그룹 → 도구 속성 → 고급 설정`, `레이어 → 레이어 속성`, `Quick Access`, `Command Bar`, `Selection Launcher`, `Workspace`, `임시 도구 전환`의 **정신 모델·공간 기억·동작 의미**를 유지한다. ToonStudio 고유의 시각 언어, 접근성, 웹 협업, 비파괴 그래프, 다중 엔진 구조는 그 위에 점진적으로 확장한다.

> **포맷 정책:** 공개 규격은 직접 왕복을 목표로 하고, 비공개 규격은 `직접 해석 가능한 부분 + 원본 불변 보존 + 표준 포맷 브리지 + 객체별 호환성 보고서`를 함께 제공한다. “열린다”와 “원본 의미가 보존된다”를 같은 말로 사용하지 않는다.


# 0. 한 페이지 실행 결론

ToonStudio의 전환 전략은 다음 다섯 계층으로 고정한다.

```text
CSP 사용자 진입
  ↓
CSP Migration Workspace
  ↓
Migration Center
  ├─ .clip/.cmc/.lip 프로젝트
  ├─ .sut/.sutg/.abr/.tos 브러시
  ├─ .cls/.aco/.cgs/.grd 색상·그라데이션
  ├─ .laf 자동 작업
  ├─ 3D·포즈·레거시 파일
  └─ 작업공간·단축키·소재 폴더
  ↓
공통 IR
  ├─ StudioDocument / LayerGraph
  ├─ BrushProgramIR / StrokeIR
  ├─ PaletteIR / GradientIR
  ├─ AutomationGraph
  ├─ Scene3DIR / TimelineIR
  └─ WorkspaceProfile / InputBindingMap
  ↓
품질 최적 멀티엔진
  ├─ Vello / CanvasKit / Google Ink
  ├─ Custom WebGPU / Hokusai / libmypaint
  ├─ OpenCV / Photon / wasm-vips
  └─ Three.js / Rapier / Jolt / OCCT
```

사용자에게는 복잡한 파이프라인이 아니라 다음 네 가지 상태만 보여준다.

| 상태 | 사용자 의미 | 제품 동작 |
|---|---|---|
| 정확 | 구조와 시각이 높은 신뢰도로 이식됨 | 바로 편집 가능 |
| 근사 | 일부 효과가 대응 엔진으로 변환됨 | 전후 비교와 조정 제공 |
| 베이크 | 원본 의미를 대상 엔진이 표현하지 못해 픽셀/메시로 고정됨 | 원본 노드는 별도 보존 |
| 보존 전용 | 안전하게 해석할 수 없음 | 원본 유지, 미리보기·브리지·대체 경로 제안 |

CSP 사용자가 처음 실행한 뒤의 이상적인 흐름은 다음과 같다.

```text
“Clip Studio에서 왔어요” 선택
→ 사용 장치와 손잡이·펜 환경 선택
→ CSP 파일/브러시/팔레트/설정 드롭
→ 30초 내 첫 작업공간 생성
→ 브러시 비교 시트에서 필기감 자동 교정
→ 익숙한 CSP형 UI로 작업 시작
→ 필요할 때만 ToonStudio 고유 그래프·협업·3D 기능을 점진 노출
```


# 1. “이질감 없는 전환”의 정확한 정의

이질감은 색상이나 아이콘의 유사성이 아니라 **예측 가능성의 붕괴**에서 발생한다. 다음 여섯 요소를 보존해야 한다.

1. **공간 기억:** 펜·지우개는 왼쪽, 레이어는 오른쪽, 자주 쓰는 속성은 캔버스 가까이에 있다는 기대.
2. **명령 의미:** `Space`를 누르는 동안 이동, 보조키를 놓으면 이전 도구로 돌아오는 동작.
3. **선택 후 동선:** 선택 영역을 만든 직후 변형·반전·삭제·채우기를 포인터 근처에서 수행하는 흐름.
4. **프리셋 중심 작업:** 브러시를 도구 종류가 아니라 이름·그룹·최근 사용·즐겨찾기로 찾는 습관.
5. **레이어 의미:** 참조·밑그림·톤·표현색·벡터·컷·말풍선 같은 만화 제작용 역할.
6. **복구 신뢰:** 저장 중인지, 자동 복구가 가능한지, 외부 파일을 다시 열 수 있는지 명확히 보이는 상태.

반대로 다음은 복제하지 않는다.

- CELSYS의 아이콘 이미지·트레이드 드레스·브랜드 자산
- 불필요한 모달 중첩과 숨은 설정
- 데스크톱 앱의 파일 경로·메모리 제약을 웹에 그대로 옮긴 구조
- 같은 명령이 메뉴·패널마다 다른 이름을 갖는 문제
- 포맷 손실을 사용자에게 알리지 않는 저장 흐름

ToonStudio는 **익숙한 정신 모델을 유지하고 더 짧고 일관된 동선으로 재구성**해야 한다.


# 2. CSP 버전·용어 차이를 흡수하는 명칭 계층

Clip Studio Paint 5.0 계열에서는 이전의 `Sub Tool` 용어가 `Tool`, `Sub Tool palette`가 `Tool Group palette`, `Sub Tool Detail`이 `Advanced Tool Settings`로 변경되었다. 장기간 CSP를 사용한 사람은 구 명칭을 계속 검색할 가능성이 높다.

ToonStudio는 화면에 한 가지 기본 명칭만 표시하되 검색·도움말·마이그레이션에는 모든 별칭을 유지한다.

```ts
interface TerminologyAlias {
  canonicalId: string;
  toonLabel: LocalizedString;
  aliases: Array<{
    product: 'csp' | 'photoshop' | 'krita' | 'procreate';
    versionRange?: string;
    locale: string;
    terms: string[];
  }>;
}
```

예시:

```text
canonical: tool.presetBrowser
toon label: 브러시·도구 그룹
aliases:
  CSP 5.x: Tool Group
  CSP 4.x 이하: Sub Tool / 서브 툴 / 보조 도구
  Photoshop: Brush Presets
  Krita: Brush Presets
```

명령 검색에서 `서브툴 상세`, `보조 도구 상세`, `Advanced Tool Settings`, `브러시 엔진 설정`을 입력해도 같은 Inspector를 열어야 한다. 메뉴 이름을 버전별로 바꾸는 것이 아니라 **용어 지식 그래프**가 검색을 흡수한다.


# 3. CSP Migration Workspace: 기본 화면 배치

데스크톱·펜 디스플레이용 기본 배치는 CSP 사용자의 공간 기억을 보존한다.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Menu │ Action Bar │ 문서 탭 │ 저장·복구·동기화·렌더 상태           │
├──────┬──────────────┬───────────────────────────────┬───────────────┤
│ Tool │ Preset       │ Context Tool Bar              │ Color/Navigator│
│ Rail │ Browser      ├───────────────────────────────┤               │
│      │              │                               ├───────────────┤
│      │              │            Canvas             │ Layer Effects │
│      │              │                               │ Inspector     │
│      │              │                               ├───────────────┤
│      │              │                               │ Layer Tree    │
├──────┴──────────────┴───────────────────────────────┴───────────────┤
│ 상태/입력 힌트 │ Timeline·Page Manager·Reference Desk 선택 도킹    │
└─────────────────────────────────────────────────────────────────────┘
```

## 3.1 화면 구성 원칙

- **왼쪽 1단계:** Tool Rail. 도구 종류만 표시한다.
- **왼쪽 2단계:** Preset Browser. 선택한 도구의 프리셋·그룹·검색·즐겨찾기·최근 사용을 표시한다.
- **캔버스 상단:** Context Tool Bar. 현재 작업에서 자주 바꾸는 5~9개 속성만 노출한다.
- **오른쪽 상단:** 색상·내비게이터·참조 미니뷰.
- **오른쪽 중단:** 고급 도구 또는 레이어 효과 Inspector.
- **오른쪽 하단:** Layer Tree. 문서 의미 구조의 기준 위치다.
- **하단:** 타임라인·페이지·스크립트·3D·검토가 필요할 때만 펼쳐진다.
- **선택 직후:** Selection HUD가 선택 영역 가까이에 나타난다.
- **펜 버튼/단축키:** Quick Deck 또는 색상·레이어 팝업이 커서 위치에 나타난다.

## 3.2 태블릿 배치

태블릿에서는 같은 정보 구조를 유지하되 화면을 복제하지 않는다.

```text
상단: Action Bar + 모드 + 저장 상태
왼쪽 또는 오른쪽: 손잡이에 따른 Tool Rail
하단: 크기·불투명도 Tool Slider + Undo/Redo
레이어·브러시·색: 하단 시트 또는 분할 패널
고급 설정: 전체 높이 Inspector 시트
```

- 펜과 손가락의 역할을 분리한다.
- UI 크기는 화면 해상도가 아니라 실제 CSS 크기·입력 장치·사용자 설정으로 결정한다.
- 패널을 닫아도 동일 기능을 Quick Deck·명령 검색에서 찾을 수 있어야 한다.
- 왼손 모드에서 단순 미러링하지 말고 엄지 도달 영역과 캔버스 가림을 다시 계산한다.


# 4. CSP 기능과 ToonStudio UI 대응표

| CSP에서 익숙한 개념 | ToonStudio 구성요소 | 전환 설계 |
| --- | --- | --- |
| Tool palette | Tool Rail | 왼쪽 도구군의 공간 기억 유지 |
| Tool Group / 구 Sub Tool | Preset Browser | 신·구 CSP 용어를 모두 검색 별칭으로 제공 |
| Tool Property | Context Tool Bar | 크기·불투명도·안정화 등 빈번한 값만 노출 |
| Advanced Tool Settings / 구 Sub Tool Detail | Advanced Inspector | 전체 브러시 그래프와 양방향 연결 |
| Quick Access | Quick Deck | 도구·명령·오토액션·색상을 같은 슬롯에 등록 |
| Command Bar | Action Bar | 상단 고정 명령과 저장·복구 상태를 함께 표시 |
| Selection Launcher | Selection HUD | 선택 직후 포인터 근처에 변형·채우기·삭제 노출 |
| Layer / Layer Property | Layer Tree / Effects Inspector | 레이어 의미와 비파괴 효과를 분리 표시 |
| Material | Asset Vault | 브러시·톤·이미지·3D·템플릿을 통합 자산 그래프로 관리 |
| Sub View | Reference Desk Mini | 참조·색 추출·출처·팔레트 생성 연결 |
| Auto Action | Automation Recipe | 실행 전 영향 미리보기·샌드박스·완전 Undo |
| Workspace | Workspace Profile | 레이아웃·단축키·Action Bar·단위를 하나의 프로필로 이식 |
| Simple / Studio Mode | Focus / Studio Mode | 기능을 삭제하지 않고 노출 밀도만 변경 |
| Companion Mode | Remote Deck PWA | 스마트폰을 Quick Deck·색·제스처·프리뷰 리모컨으로 활용 |


# 5. 모든 UI를 하나로 묶는 CommandRegistry

메뉴·단축키·Action Bar·Quick Deck·Selection HUD·컨텍스트 메뉴·도움말·플러그인에서 같은 명령을 서로 따로 구현하면 조작감이 무너진다. 모든 진입점은 하나의 `CommandRegistry`를 사용한다.

```ts
interface CommandDescriptor {
  id: string;
  label: LocalizedString;
  aliases: TerminologyAlias[];
  category: string[];
  iconToken: string;
  defaultBindings: InputBinding[];
  cspCompatibleBindings?: InputBinding[];
  enableWhen: PredicateIR;
  visibleWhen: PredicateIR;
  execute: CommandHandlerRef;
  undoPolicy: 'atomic' | 'transaction' | 'nonMutating';
  permissions: Permission[];
  helpNodeId: string;
  telemetryKey: string;
}
```

## 5.1 동일 명령의 여러 표현

```text
command: selection.transform
├─ Edit 메뉴
├─ Selection HUD 버튼
├─ Quick Deck 슬롯
├─ 단축키
├─ 우클릭 메뉴
├─ 펜 버튼
├─ Remote Deck
└─ HelpGraph의 실행 예제
```

모든 위치에서 활성 조건·이름·도움말·Undo 단위가 동일해야 한다.

## 5.2 CSP 단축키 프로필

- 설치 시 `ToonStudio 기본`, `Clip Studio 전환`, `Photoshop 전환`, `Krita 전환`을 선택할 수 있다.
- CSP의 단축키는 사용자 맞춤 가능하므로 “CSP에는 항상 이 키”라고 가정하지 않는다.
- 일반적인 캔버스 내비게이션과 임시 전환은 CSP형 기본값을 제공하되 가져온 사용자 설정이 우선한다.
- 충돌 시 명령 우선순위와 문맥을 시각적으로 보여주고, 한 번에 해결하는 충돌 마법사를 제공한다.
- 누르고 있는 동안 전환하는 `momentary`, 한 번 눌러 유지하는 `sticky`, 두 번 눌러 잠그는 `latch`를 구분한다.

```ts
interface InputBinding {
  device: 'keyboard' | 'penButton' | 'mouse' | 'touch' | 'remote';
  chord: string;
  phase: 'press' | 'hold' | 'release' | 'doubleTap' | 'drag';
  context?: PredicateIR;
  behavior: 'invoke' | 'momentaryTool' | 'toggle' | 'analogAdjust';
}
```

## 5.3 조작감 수용 기준

- 키 릴리스 후 임시 도구가 1프레임 내 원래 도구로 복귀.
- 보조키를 누른 상태에서 도구가 바뀌어도 보조키 상태가 끊기지 않음.
- 브러시 크기 드래그는 캔버스를 가리지 않고 연속값을 제공.
- 포인터와 손가락이 동시에 들어와도 획·팬·핀치가 잘못 분류되지 않음.
- 모든 입력은 `Input Trace`로 재생 가능해 장치별 오류를 디버깅할 수 있음.


# 6. 첫 실행 CSP 이식 마법사

Migration Center는 단순 파일 업로더가 아니라 **사용자 습관까지 옮기는 단계형 이식 도구**다.

## 6.1 단계 1 — 사용자 환경

- Windows/macOS/iPad/Android/Chromebook 중 기존 CSP 환경
- 키보드·액정 태블릿·일반 태블릿·마우스·터치
- 왼손/오른손
- 주 작업: 일러스트, 웹툰, 출판 만화, 애니메이션, 3D 참조
- Simple/Studio 중 익숙한 모드

## 6.2 단계 2 — 데이터 소스

```text
개별 파일 드롭
폴더 선택
ZIP 묶음
클라우드에서 내려받은 소재
CSP에서 내보낸 PSD/PSB·SUT·CLS·LAF
Local ToonBridge가 사용자가 선택한 CELSYS 폴더를 읽어 만든 Migration Bundle
```

Local ToonBridge는 다음 원칙을 지켜야 한다.

- 사용자가 선택한 폴더 밖을 스캔하지 않는다.
- 원본 설정을 수정하지 않는다.
- 전송 전에 읽을 파일 목록과 크기를 보여준다.
- 기본값은 로컬 변환이며 서버 업로드는 명시적으로 선택한다.
- 폰트·유료 소재·라이선스가 불명확한 자산은 권리 상태를 표시한다.

## 6.3 단계 3 — 분류

```text
프로젝트        .clip .lip .cmc .csnf .ipv .xpg .cpg .cst
브러시·도구     .sut .sutg .abr .tos
색상·그라데이션 .cls .aco .ase .gpl .cgs .grd
자동화          .laf
이미지·레이어   .psd .psb .ora .png .tiff .webp ...
3D·포즈         .cs3c .cs3o .cs3s .fbx .obj .glb .gltf .vrm .bvh .pep ...
작업공간        레이아웃·단축키·Command Bar·단위·소재 컬렉션
```

## 6.4 단계 4 — 미리보기와 신뢰도

각 항목에는 다음 배지를 표시한다.

```text
정확 95–100%       직접 구조 매핑 및 회귀 검증
높음 80–94%        일부 엔진 파라미터 근사
부분 40–79%        주요 내용만 구조화, 나머지 원본 보존
보존 전용          안전한 해석 불가, 원본과 미리보기만 유지
오류               손상·암호화·의존 자산 누락
```

퍼센트는 막연한 AI 점수가 아니라 다음 체크의 가중 합으로 계산한다.

- 객체 수·유형 보존
- 레이어 순서·마스크·클리핑
- 텍스트·폰트·줄바꿈
- 브러시 팁·텍스처·동역학
- 색공간·ICC·표현색
- 애니메이션 프레임·타이밍
- composite 시각 차이
- 원본 앱 재개방 결과

## 6.5 단계 5 — 전환 워크스페이스 생성

- CSP형 기본 패널 배치
- 가져온 단축키 중 지원 명령 적용
- Quick Deck에 사용 빈도 상위 도구 배치
- 브러시 그룹과 최근 사용 순서 이식
- 팔레트와 참조 이미지를 Asset Vault 컬렉션으로 구성
- 사용자의 CSP 버전에 맞는 명칭 별칭 활성화

## 6.6 단계 6 — 완료 후 대시보드

```text
총 1,238개 항목
정확 1,102
근사 91
베이크 23
보존 전용 19
오류 3

[바로 작업 시작]
[브러시 비교]
[오류 3개 해결]
[전체 보고서 내보내기]
```


# 7. 파일 확장자 호환성의 최종 계층

V4.2 레지스트리는 **313개 행**으로 확장한다. 이는 모든 포맷을 같은 수준으로 읽고 쓴다는 의미가 아니다. 사용자를 잃지 않기 위해 다음 다섯 지원 방식을 조합한다.

```text
A. Browser Direct
   JS/WASM/브라우저 API로 직접 읽고 쓰기

B. Sandboxed Experimental Adapter
   비공개·역공학 포맷을 Worker에서 제한적으로 해석

C. Local ToonBridge
   사용자의 PC에서 CSP·Krita·Blender·LibreOffice·FFmpeg·FreeCAD와 변환

D. Private Conversion Service
   사용자가 허용한 파일만 격리 컨테이너에서 일시 변환

E. Preserve & Preview
   원본 바이트를 불변 보존하고 썸네일·메타데이터·대체 출력 경로 제공
```

## 7.1 지원 등급

| 등급 | 정의 | UI 표시 |
|---|---|---|
| F0 | ToonStudio 네이티브 완전 보존 | 완전 편집 가능 |
| F1 | 공개 규격 기반 높은 직접 왕복 | 구조 편집 가능 |
| F2 | 상당한 구조·의미 보존 | 일부 기능 근사 |
| F3 | 주요 의미 또는 시각 보존 | 호환성 보고서 필수 |
| F4 | 로컬/서버 브리지 중심 | 변환기 필요 |
| F5 | 원본 보존·미리보기·대체 출력 | 직접 편집 제한 |

## 7.2 분야별 등록 규모

| 분야 | 등록 행 |
| --- | --- |
| 브러시·색상·폰트 | 59 |
| 애니메이션·영상·오디오·타임라인 | 58 |
| 3D·VRM·CAD·BIM | 53 |
| 래스터·HDR·RAW·텍스처 | 36 |
| Office·출판·문서 | 35 |
| 벡터·PDF·다이어그램 | 28 |
| 네이티브·프로젝트 | 27 |
| 웹·아카이브·교환 | 17 |

## 7.3 포맷 수를 늘려도 제품이 무거워지지 않는 구조

각 포맷 어댑터는 동적 모듈이며 기본 번들에 포함하지 않는다.

```ts
interface FormatAdapterManifest {
  id: string;
  extensions: string[];
  magicSignatures: MagicSignature[];
  mimeTypes: string[];
  importTier: 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
  exportTier: 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
  runtime: 'main' | 'worker' | 'wasm-worker' | 'local-bridge' | 'server';
  memoryBudget: number;
  permissions: string[];
  licenseClass: string;
  decoder: ModuleRef;
  encoder?: ModuleRef;
  validator?: ModuleRef;
  reopenHarness?: ModuleRef;
}
```

파일을 확장자로만 판별하지 않는다.

```text
확장자
+ MIME
+ magic bytes
+ ZIP 내부 manifest
+ XML namespace
+ 파일 크기/entropy
→ FormatSniffer confidence
```

악성 ZIP bomb·SVG 스크립트·PDF 액션·Office 매크로·폰트 취약점·3D 메모리 폭증을 차단하는 Sandbox가 decoder보다 먼저 실행되어야 한다.


# 8. CSP 프로젝트 포맷의 현실적인 구현 범위

## 8.1 `.clip` / `.lip`

`.clip`은 사용자 확보에 가장 중요하지만 비공개 포맷이다. 제품 UI에서 “완전 지원”을 먼저 약속하면 신뢰를 잃는다.

### 권장 경로

```text
.clip 드롭
→ 원본을 content hash로 즉시 보존
→ 격리 Worker에서 버전·thumbnail·composite·layer metadata 분석
→ 지원 layer/object를 StudioDocument로 생성
→ 알 수 없는 블록은 OpaquePayloadStore에 보존
→ composite와 해석 결과 시각 비교
→ 불확실하면 PSD/PSB 브리지 제안
```

### 직접 해석 후보

- BSD-2-Clause 계열의 실험적 clean-room loader는 구조 연구와 회귀 corpus에 활용 가능.
- LGPL 파서는 별도 프로세스/모듈 경계를 법무 검토한다.
- 완성도가 낮은 프로젝트를 곧바로 제품 데이터 모델로 사용하지 않는다.
- `.clip` 직접 쓰기는 장기 연구로 두고, 초기에는 원본 보존 + `.toonstudio` 저장 + PSD/ORA/PNG/CLIP용 결과 폴더를 제공한다.

## 8.2 `.cmc`

공식 구조상 `.cmc`는 여러 페이지의 `.clip` 파일을 관리하는 관리 파일이다. ToonStudio는 이를 단일 바이너리로 평탄화하지 않고 다음처럼 매핑한다.

```text
CMC management folder
├─ management metadata
├─ page001.clip
├─ page002.clip
└─ ...

→ ProductionGraph
   ├─ Series/Episode
   ├─ Page order
   ├─ Page settings
   ├─ Cover/body role
   └─ original file links
```

페이지 파일 누락·이름 변경·중복을 사전 진단하고, 원본 폴더는 수정하지 않는다.

## 8.3 `.csnf`

네임·대사 흐름을 `StoryGraph`와 `DialogueGraph`에 연결하되, 알 수 없는 구조는 원본으로 보존한다. 대사 순서·페이지 연결·줄바꿈·화자 추정을 별도 신뢰도로 표시한다.

## 8.4 레거시 파일

`.ipv`, `.xpg`, `.cpg`, `.cst`는 CSP 사용자군이 보유한 과거 자산을 유입하는 통로다. 최신 웹 엔진에 맞게 억지로 완전 재현하기보다 CSP가 수행하는 레거시 변환 결과와 차등 검증하고, 변환 규칙을 `LegacyMappingProfile`로 버전 관리한다.


# 9. 브러시·도구 이식: `.sut/.sutg/.abr/.tos`

브러시 마이그레이션의 목표는 파일이 등록되는 것이 아니라 **손에 느껴지는 결과가 유지되는 것**이다.

## 9.1 공통 `BrushProgramIR`

```ts
interface BrushProgramIR {
  identity: {
    sourceFormat: string;
    sourceHash: string;
    sourceName: string;
    sourceVersion?: string;
  };
  input: {
    pressureCurve: CurveIR;
    tiltCurve?: CurveIR;
    velocityCurve?: CurveIR;
    rotationMode?: string;
  };
  geometry: {
    backendPreference: string[];
    size: DynamicValue;
    spacing: DynamicValue;
    angle: DynamicValue;
    scatter?: DynamicValue;
  };
  materials: {
    tips: AssetRef[];
    textures: AssetRef[];
    paper?: AssetRef;
  };
  deposition: {
    opacity: DynamicValue;
    flow: DynamicValue;
    blend: string;
    pickup?: DynamicValue;
    smudge?: DynamicValue;
    wetness?: DynamicValue;
  };
  stabilization: StabilizerGraphIR;
  unknownParameters: OpaqueField[];
  migrationConfidence: ConfidenceReport;
}
```

## 9.2 파일별 전략

| 포맷 | 전략 | 주의점 |
|---|---|---|
| `.sut` | clean-room parser로 팁·텍스처·동역학을 추출하고 원본도 보존 | 공개 완전 사양이 없으므로 버전별 corpus 필요 |
| `.sutg` | 그룹·순서·프리셋을 컬렉션 단위로 이식 | 그룹 내 외부 소재 누락 검사 |
| `.abr` | Photoshop/CSP 공용 유입 통로로 우선 성숙시킴 | ABR 버전·듀얼 브러시·컬러 동역학 차이 |
| `.tos` | 레거시 보존·CSP 브리지·부분 변환 | 데스크톱 레거시 중심 |

AGPL 또는 비상업 라이선스인 공개 추출기는 상용 코어에 직접 넣지 않는다. 동작 사양을 이해하고 독립 구현을 검증하는 연구 도구로만 사용하거나, 라이선스에 맞는 분리 배포를 법무 검토한다.

## 9.3 엔진 매핑

```text
CSP G펜·매핑펜
→ Google Ink 또는 Rust Stabilizer + Vello outline

CSP 벡터 펜
→ StrokeIR + Vello/CanvasKit

CSP 일반 래스터 브러시
→ Custom WebGPU Dab + Sparse Tiles

CSP 수채·유화·혼색
→ Hokusai/libmypaint + WebGPU Wet Media

CSP 이미지·장식 브러시
→ Vello image stamp 또는 WebGPU stamp atlas

CSP 스프레이·파티클
→ WebGPU Particle Backend

CSP 리본·털·물리 브러시
→ Rust/WASM XPBD + Vello/WebGPU bake
```

## 9.4 Brush Fidelity Lab

이식 직후 자동 생성되는 표준 시트:

- 압력 0→1 직선
- 느림/보통/빠름 속도 sweep
- tilt 0°/30°/60°
- 곡률이 큰 S자
- 시작·끝 taper
- 점찍기·짧은 획
- 겹칠 때 흐름 누적
- 색 pickup/deposit
- 종이 텍스처 반응
- 4K·8K 큰 크기 성능

사용자는 CSP에서 캡처한 기준 획 또는 제공한 스크린샷과 비교해 `더 얇게`, `더 묵직하게`, `끝을 짧게`, `번짐을 줄이기` 같은 고수준 보정을 선택한다. 시스템은 개별 파라미터를 자동 조정하되 원본과 변환값을 모두 유지한다.


# 10. 색상·그라데이션·자동 작업·작업공간 이식

## 10.1 색상 세트

```text
.cls / .aco / .ase / .gpl / .kpl / .swatches / .afpalette
→ PaletteGateway
→ PaletteIR
```

`PaletteIR`은 단순 RGB 배열이 아니라 다음을 저장한다.

- 이름·그룹·정렬 순서
- 원본 색공간과 profile
- spot/process/registration 여부
- 투명색·보호색
- 원본 파일 hash와 출처
- 프로젝트·캐릭터·브랜드 역할

## 10.2 그라데이션

`.cgs`, `.grd`, `.ggr`, SVG gradient, CSS gradient, LUT를 `GradientIR`로 통합한다. stop 색·위치·중간점·불투명도·보간 색공간·반복 방식을 분리해 보존한다.

## 10.3 Auto Action `.laf`

CSP의 Auto Action을 임의 JavaScript로 변환하지 않는다.

```text
LAF command
→ 알려진 Command ID 매핑
→ 지원 파라미터 검증
→ 위험 명령 차단
→ 실행 계획 미리보기
→ 하나의 Undo transaction
```

지원하지 않는 명령은 자동으로 건너뛰지 않고 `중단`, `사용자 확인`, `대체 recipe`, `베이크된 결과 사용` 중 선택하게 한다.

## 10.4 Workspace

CSP workspace가 포함하는 팔레트 배치·단축키·Command Bar·단위를 ToonStudio의 다음 구조로 이식한다.

```ts
interface WorkspaceProfile {
  semanticZones: DockZone[];
  panelInstances: PanelInstance[];
  actionBar: CommandGroup[];
  quickDeckSets: QuickDeckSet[];
  inputBindings: InputBindingMap;
  units: UnitProfile;
  deviceOverrides: Record<string, Partial<WorkspaceProfile>>;
  terminologyProfile: string;
}
```

픽셀 좌표를 그대로 가져오지 않고 `왼쪽 도구`, `오른쪽 레이어`, `하단 타임라인` 같은 의미 영역으로 변환한 뒤 현재 화면 크기에 맞춰 재배치한다.


# 11. CSP 레이어 의미를 잃지 않는 LayerGraph

CSP 사용자가 PSD만 통해 이동할 때 가장 많이 잃는 것은 픽셀이 아니라 **레이어의 역할**이다. ToonStudio는 다음 타입을 별도 의미 노드로 보존한다.

```text
RasterLayer
EditableStrokeLayer / VectorLayer
LayerGroup
LayerMask / VectorMask
ClippingRelation
ReferenceRole / DraftRole
ExpressionColor(Color/Gray/Monochrome)
ToneEffect
LayerColorEffect
FillLayer / GradientLayer
AdjustmentLayer
TextObject / BalloonObject
FrameBorderGroup
SelectionChannel
Ruler / PerspectiveRuler / SymmetryRuler
ImageMaterial / LinkedFileObject
Scene3DLayer
AnimationFolder / Cel / CameraTrack
PaperLayer
```

## 11.1 CSP → ToonStudio → 외부 포맷

```text
CSP Vector Layer
→ EditableStrokeLayer(StrokeIR)
→ PSD 출력 시 editable vector를 완전 표현할 수 없으면
   1) raster composite layer
   2) SVG sidecar
   3) ToonStudio metadata
   4) 원본 CLIP payload link
   를 함께 제공
```

## 11.2 레이어 아이콘과 상태

- 아이콘만으로 의미를 전달하지 않고 이름·툴팁·색·상태 배지를 함께 사용한다.
- 참조/밑그림/잠금/클리핑/마스크/톤/벡터 상태는 좁은 화면에서도 우선 표시한다.
- 레이어 선택과 visibility toggle의 hit target을 분리해 오작동을 줄인다.
- `Alt/Option` 단독 보기, Shift 범위 선택, Ctrl/Cmd 비연속 선택 등 데스크톱 관행을 제공한다.
- 드래그 중 예상 삽입 위치와 클리핑·그룹 관계 변화를 미리 보여준다.

## 11.3 Layer Tree 성능

- 1만 레이어에서도 가상화.
- 화면에 보이는 행만 React에서 렌더.
- 썸네일은 Worker와 우선순위 큐에서 생성.
- 레이어 이름·역할·자산·댓글·수정자를 SQLite FTS로 검색.
- 눈 아이콘 연타·solo·다중 토글은 하나의 배치 명령으로 처리.


# 12. 조작 동선을 줄이는 UX 규칙

## 12.1 1–2–3 노출 규칙

- **1단계:** 자주 쓰는 행동은 캔버스 또는 고정 패널에서 한 번에.
- **2단계:** 중간 빈도의 행동은 컨텍스트 HUD·팝업·검색에서 두 번 이내.
- **3단계:** 고급·파괴적·관리 행동만 Inspector나 설정의 세 단계까지 허용.

## 12.2 포인터 이동 거리 예산

| 작업 | 목표 |
|---|---|
| 브러시 선택 → 크기 조정 | 250px 이내 또는 단축키 |
| 선택 → 변형 | Selection HUD 180px 이내 |
| 레이어 생성 → 이름 변경 | 같은 위치에서 연속 입력 |
| 색 선택 → 최근 브러시 복귀 | 포인터 왕복 없이 팝업 닫힘 |
| 마스크 생성 → 브러시 시작 | 현재 도구 유지, 자동 대상 전환 |
| 컷 선택 → 말풍선 생성 | 문맥 툴바에서 2클릭 이내 |

## 12.3 상태를 숨기지 않기

화면 상단에 작은 상태 배지를 고정한다.

```text
저장됨 / 로컬 변경 / 동기화 중 / 오프라인
WebGPU / WebGL2 / CPU Safe Mode
브러시 Preview / Final 정제 중
외부 파일 연결 정상 / 변경됨 / 누락
포맷 호환성 문제 3개
```

## 12.4 모달 최소화

- 브러시 속성은 즉시 미리보기와 inline 적용.
- 필터는 캔버스 오버레이 Inspector에서 조정.
- 저장 경고는 작업을 막지 않고 문제 객체를 목록화.
- 파일 변환은 background job으로 진행하고 페이지·레이어 단위로 먼저 열 수 있음.
- 위험한 작업만 확인하며, 확인창에는 실제 영향과 복구 방법을 함께 표시.

## 12.5 일관된 직접 조작

```text
클릭/탭       선택
더블클릭      이름 또는 세부 설정
드래그        이동/재배치
Alt/Option    복제 또는 일시 색 추출—문맥에 따라 명시
Shift         범위·비율·각도 제약
Ctrl/Cmd      비연속 선택·정밀 조작
Space         캔버스 이동
Esc           현재 임시 작업 취소, 문서 상태는 유지
Enter         현재 작업 확정
```

같은 제스처가 패널마다 정반대 의미를 갖지 않도록 `InteractionContract` 테스트를 둔다.


# 13. 웹에서 CSP보다 더 편해져야 하는 기능

이식만 잘해도 사용자는 시험해 볼 수 있지만, 정착하려면 웹이 더 편해야 한다.

## 13.1 파일을 열기 전에 보는 마이그레이션 미리보기

- 브라우저에서 폴더·ZIP·프로젝트를 스캔하고 파일 수·용량·예상 손실을 먼저 표시.
- 200페이지 `.cmc`도 첫 페이지부터 점진적으로 열림.
- 손상 파일은 나머지 프로젝트를 막지 않음.

## 13.2 브러시가 왜 다르게 보이는지 설명

```text
차이 원인
- 원본 팁 이미지 1개 누락
- CSP의 특정 texture blending을 WebGPU 근사로 변환
- 압력 최소값이 장치에서 0.08부터 시작
- 종이 profile이 현재 문서에 없음
```

단순히 “호환되지 않음”이라고 말하지 않고 자동 수정 버튼을 제공한다.

## 13.3 공유 가능한 작업환경

WorkspaceProfile을 URL/QR로 공유하되 폰트·유료 브러시·개인 파일은 포함하지 않는다. 받는 기기의 화면과 입력 장치에 맞춰 의미 위치를 다시 배치한다.

## 13.4 브라우저 간 이어 그리기

- OPFS 로컬 우선.
- 계정 연결 시 content-addressed chunks만 동기화.
- 작업 중인 브러시·레이어·캔버스 위치·선택한 색까지 장치 handoff.
- 낮은 사양 장치에서는 동일 문서를 proxy 품질로 열고 의미 구조는 유지.

## 13.5 CSP와 병행 사용

초기에는 완전한 대체를 강요하지 않는다.

```text
ToonStudio에서 작업
→ PSD/PSB + SVG sidecar + PNG composite + Interop Report
→ CSP에서 후속 작업
→ 변경된 PSD를 ToonStudio에서 다시 가져와 semantic diff
```

사용자가 기존 제작 파이프라인을 유지하면서 점진적으로 이동할 수 있게 한다.


# 14. 브라우저 호환성 아키텍처

브라우저 호환성은 파일 포맷 지원과 별개다. 다음 단계로 품질을 낮추되 기능 의미는 유지한다.

```text
WebGPU + WASM Threads + OPFS
→ WebGPU + single-thread WASM
→ WebGL2 + CanvasKit/PixiJS
→ WebGL2 + CPU filters
→ CanvasKit Software / Vello CPU / tiny-skia
→ 서버 렌더 proxy(선택)
```

## 14.1 런타임 Capability Matrix

- WebGPU adapter·feature·texture limits
- WebGL2 extensions
- WASM SIMD·threads·Memory64 실험 여부
- SharedArrayBuffer와 cross-origin isolation
- OffscreenCanvas
- OPFS와 SyncAccessHandle
- File System Access picker
- Pointer raw/coalesced/predicted events
- pressure·tilt·twist·tangential pressure
- WebCodecs codec/profile
- devicePixelRatio·색역·HDR
- 메모리 압박·백그라운드 탭 정책

## 14.2 입력 폴백

```text
pointerrawupdate/coalesced
→ pointermove coalesced
→ pointermove
→ mouse/touch synthetic pressure
```

예측 샘플은 preview에만 사용하고 확정 StrokeIR에는 실제 샘플만 기록한다.

## 14.3 저장 폴백

```text
File System Access
→ OPFS native project
→ OS file picker/import-export
→ drag/drop
→ clipboard/share target
→ Blob download
```

브라우저가 로컬 폴더 핸들을 지원하지 않아도 프로젝트 편집과 복구가 가능해야 한다.


# 15. 품질·성능 최적 멀티엔진 배치

CSP 사용자에게 이질감이 적으려면 UI만 비슷해서는 안 되고, 획·레이어·변형이 즉각 반응해야 한다.

| 기능 | 주 엔진 | 보조/폴백 |
|---|---|---|
| 정밀 잉킹 | Google Ink / Rust Stabilizer + Vello | Perfect Freehand·CanvasKit |
| 대량 벡터 선화 | Vello | CanvasKit·Vello CPU |
| PathEffect·문단·SkSL | CanvasKit | Vello/CPU |
| 래스터 브러시 | Custom WebGPU Sparse Tiles | PixiJS WebGL2·CPU tiles |
| 자연매체 | Hokusai/libmypaint + Wet Media WebGPU | 정적 dab 근사 |
| 스머지·혼색 | WebGPU compute | Hokusai/WASM |
| 선택·형태학 | OpenCV.js/WGSL | CPU OpenCV/Photon |
| 대형 이미지 | wasm-vips | server/local libvips |
| 텍스트/CJK | HarfBuzz·Parley·CanvasKit | DOM IME overlay |
| 3D·VRM | Three.js/Babylon.js | server preview |
| 물리 | Rapier/Jolt/XPBD | baked animation |
| 최종 검수 렌더 | CanvasKit Software·Vello CPU·tiny-skia | WebGPU export |

## 15.1 Preview/Final 이중 경로

```text
0–8ms   입력 샘플·preview stroke
8–32ms  안정화·동역학·타일 반영
idle    고품질 곡선·물리·안료 정제
finish  결정적 StrokeIR/TileDiff 저장
```

미리보기와 최종 결과가 눈에 띄게 튀지 않도록 동일한 seed·압력 곡선·색상 모델을 공유한다.

## 15.2 엔진 전환 단위

객체 하나마다 Vello/CanvasKit/PixiJS를 오가지 않는다. 큰 Render Island로 묶는다.

```text
Vector Ink Island
Text/Paragraph Island
Raster Tile Island
Wet Media Island
3D Auxiliary Pass Island
UI Overlay Island
```

엔진 간 CPU readback을 최후 수단으로 두고 GPUTexture/ImageBitmap/Shared Tile 순으로 연결한다.


# 16. 파일 가져오기·내보내기 UX

## 16.1 열기와 가져오기를 사용자 관점에서 통합

사용자는 “Open과 Import의 차이”를 먼저 결정할 필요가 없다.

```text
파일 드롭
→ FormatSniffer
→ 단독 문서인지, 현재 문서에 삽입할 자산인지 추천
→ [새 문서로 열기] [현재 문서에 삽입] [자산으로 등록]
```

CSP의 도구·소재 파일을 캔버스에 드롭하면 Preset Browser/Asset Vault에 등록되고, 이미지·3D는 현재 문서 삽입을 우선 제안한다.

## 16.2 내보내기 대상 중심 UI

```text
CSP로 계속 작업
Photoshop으로 전달
Krita/MyPaint로 전달
인쇄소 제출
웹툰 플랫폼 업로드
PPT/문서에 삽입
Blender/3D 도구로 전달
영상 편집기로 전달
```

사용자가 확장자를 먼저 알아야 하는 대신 목적을 선택하면 최적 패키지를 추천한다.

예: `CSP로 계속 작업`

```text
project.psd / project.psb
vector-sidecar.svg
composite.png
fonts-report.html
ToonStudio-interop.json
original-links/
```

## 16.3 호환성 보고서

```ts
interface InteropIssue {
  nodeId: string;
  severity: 'info' | 'warning' | 'blocking';
  status: 'exact' | 'approximated' | 'baked' | 'preserved-only' | 'dropped';
  reason: string;
  targetLimitation?: string;
  visualDelta?: number;
  suggestedFixes: CommandRef[];
}
```

보고서는 저장 전에 요약하고, 전체 JSON/HTML로 내보낼 수 있어 팀과 공유한다.


# 17. 모노레포·모듈 경계

```text
apps/
  studio-web
  migration-center
  remote-deck-pwa
  toonbridge-desktop

packages/core/
  studio-document
  command-registry
  terminology-graph
  workspace-profile
  input-binding-engine
  layer-graph
  brush-program-ir
  format-gateway
  interop-report

packages/formats/
  csp-clip-experimental
  csp-cmc
  csp-brush
  csp-color
  csp-action
  psd-psb
  openraster
  image-codecs
  office-ooxml
  vector-svg-pdf
  three-d
  animation-media
  archive-gateway

packages/render/
  vello-adapter
  canvaskit-adapter
  webgpu-raster
  pixi-webgl-fallback
  cpu-reference
  hybrid-framegraph

packages/migration/
  csp-profile
  brush-fidelity-lab
  workspace-mapper
  asset-deduplicator
  format-corpus
  reopen-harness
```

각 `formats/*` 패키지는 다음을 독립적으로 가진다.

- 라이선스·출처 manifest
- fuzz corpus
- 최대 메모리·파일 크기 제한
- parser/encoder 버전
- schema migration
- golden files
- 보안 정책
- 브라우저·Local Bridge·서버 실행 가능 여부


# 18. 단계별 구현 로드맵

## R0 — 측정과 계약

- 현재 ToonStudio의 실제 도구·메뉴·레이어·저장 동선 계측
- CSP 사용자 10~20명으로 카드 소팅·첫 작업 관찰
- Command ID·LayerGraph·FormatAdapter 계약 고정
- CSP 전환 테스트 corpus 확보: 버전·OS·작품 유형·브러시 유형별 사용자 소유 샘플
- 상표·아이콘·라이선스 경계 감사

## R1 — CSP형 작업공간과 명령 시스템

- Tool Rail / Preset Browser / Context Tool Bar / Advanced Inspector
- Layer Tree / Effects Inspector
- Quick Deck / Action Bar / Selection HUD
- CSP 용어 별칭과 명령 검색
- Momentary Tool Switch·Modifier Map·CSP navigation preset
- Focus/Studio 전환

## R2 — 안정적인 교환 포맷

- PSD/PSB·ORA·PNG/TIFF/WebP·SVG/PDF
- ABR·ACO/ASE/GPL·MYB·KPP/Krita bundle
- glTF/GLB/VRM/OBJ·영상/오디오 기본 포맷
- FormatInteropReport·reopen harness

## R3 — CSP 마이그레이션 핵심

- `.sut/.sutg/.cls` clean-room adapters
- Brush Fidelity Lab
- `.cmc` page graph와 `.clip` preserve-first import
- `.laf` 제한적 AutomationGraph 변환
- CSP Migration Workspace 생성
- Local ToonBridge 설정 번들

## R4 — 고난도 프로젝트·레거시

- `.clip` 직접 해석 범위 확대
- `.csnf/.ipv/.xpg/.cpg/.cst`
- `.cs3*`, `.c2f*`, `.pep`, 6KT/6KH/LWO/LWS
- Workspace/shortcut semantic mapping
- 버전별 differential tests

## R5 — 양방향 파이프라인과 차별화

- CSP 전달 패키지 생성
- 변경된 PSD/PSB 재가져오기와 semantic diff
- 팀 브러시·워크스페이스 공유
- Remote Deck PWA
- 원고 연속성·플랫폼 preflight
- 브러시·엔진 시각 동등성 검사


# 19. 테스트와 수용 기준

## 19.1 전환 UX KPI

| 지표 | 목표 |
|---|---:|
| 홈 → 첫 획 | 신규 20초, CSP 전환 30초 이내 |
| CSP형 Workspace 선택 → 익숙한 핵심 패널 발견 | 10초 이내 |
| 브러시 파일 드롭 → 테스트 획 가능 | 5초 이내(일반 파일) |
| 선택 → 변형 실행 | 평균 2초 미만 |
| 단축키 충돌 해결 | 3단계 이내 |
| 강제 종료 후 복구 성공 | 지원 환경 99.9% 이상 |
| 저장 중 획 지연 증가 | 5% 미만 |
| 4K 문서 기본 펜 preview | 60/120Hz 디스플레이에서 프레임 budget 유지 |
| 마이그레이션 손실 미고지 | 0건 |

## 19.2 포맷 테스트

```text
Parser unit test
Property-based test
Fuzz test
Malformed file test
ZIP bomb test
Large file streaming test
Round-trip structural test
Target app reopen test
Visual pixel/ΔE/SSIM test
Text layout diff
Layer semantic diff
Cross-browser test
```

## 19.3 CSP 브러시 테스트 corpus 축

- CSP 버전별
- Windows/macOS/iPad
- 래스터/벡터
- 원형/이미지/듀얼 팁
- 압력·기울기·속도·랜덤
- 수채·혼색·스머지
- 스프레이·리본·장식
- 소재 누락·외부 텍스처
- 매우 작은/큰 브러시
- 8/16-bit·Color/Gray/Monochrome 문서

## 19.4 UI 회귀

- 마우스·키보드
- Wacom/Windows Ink/Apple Pencil/Android stylus
- 왼손·오른손
- 100%/125%/200% OS scaling
- 11인치 태블릿부터 4K 듀얼 모니터
- 한국어·일본어·영어 긴 명칭
- 고대비·스크린리더·키보드 전용


# 20. 보안·라이선스·신뢰

- 사용자가 보유한 CSP 파일과 소재는 기본적으로 로컬에서 처리한다.
- 서버 변환 시 암호화·지역 선택·자동 삭제·감사 로그를 제공한다.
- 외부 파일의 스크립트·매크로·Office VBA·PDF action·SVG script는 실행하지 않는다.
- 폰트·브러시·텍스처·3D 모델의 라이선스를 RightsGraph에 기록한다.
- 비공개 포맷 parser는 clean-room 기록, 테스트 출처, 법무 검토를 유지한다.
- GPL/AGPL/LGPL/비상업 코드는 permissive 코어와 분리하고 배포 방식별 의무를 자동 검사한다.
- 원본 파일은 변환 과정에서 수정하지 않으며 content hash로 무결성을 확인한다.
- “지원” 표시는 실제 버전별 회귀 테스트를 통과한 범위만 공개한다.


# 21. V4.2 최종 판단

CSP 사용자를 확보하기 위한 가장 중요한 순서는 다음과 같다.

```text
1. PSD/PSB·ABR·SUT·CLS·CMC/CLIP preserve의 신뢰
2. CSP형 공간 배치·Quick Access·Selection Launcher·임시 도구 동작
3. 브러시 필기감 비교·자동 교정
4. 레이어의 만화 제작 의미 보존
5. 페이지·말풍선·톤·3D·애니메이션 동선
6. 웹의 공유·복구·장치 전환·협업 우위
7. 더 넓은 포맷과 다른 제품군으로 확장
```

파일 확장자 숫자만 늘리는 것은 사용자 확보로 이어지지 않는다. **열기 전 기대 수준, 열고 난 뒤 편집 가능 범위, 다시 내보낼 때의 손실, 기존 앱으로 돌아갈 경로**까지 하나의 UX로 제공해야 한다.

ToonStudio의 목표는 “CSP와 비슷한 웹 앱”이 아니다.

> **CSP 사용자가 첫날에는 익숙하게 쓰고, 일주일 뒤에는 더 짧은 동선과 더 안전한 파일 전환을 체감하며, 장기적으로는 협업·3D·절차 그래프·멀티포맷 출고 때문에 되돌아갈 이유가 줄어드는 창작 운영체제**가 최종 제품 목표다.


# 22. 공식 매뉴얼·기술 참고 자료

아래 자료는 V4.2의 CSP 동선·포맷·설정 모델을 검증하는 주요 공식 근거다. 링크와 제품 버전은 구현 착수 시 다시 고정한다.

- [Clip Studio Paint 5.0 업데이트 및 용어 변경](https://help.clip-studio.com/en-us/manual_en/030_new/030_new.htm)
- [Clip Studio Paint 인터페이스](https://help.clip-studio.com/en-us/manual_en/690_interface/690_interface.htm)
- [Command Bar](https://help.clip-studio.com/en-us/manual_en/690_interface/Command_Bar.htm)
- [Quick Access Palette](https://help.clip-studio.com/en-us/manual_en/690_interface/Quick_Access_Palette.htm)
- [Selection Launcher](https://help.clip-studio.com/en-us/manual_en/330_selection/Selection_Launcher.htm)
- [Workspace 등록·가져오기](https://help.clip-studio.com/en-us/manual_en/690_interface/Register_and_manage_your_workspace.htm)
- [Preferences: 임시 도구 전환·태블릿·터치·복구·저장](https://help.clip-studio.com/en-us/manual_en/720_preferences/Preferences.htm)
- [Tablet interface와 Studio/Simple Mode](https://help.clip-studio.com/en-us/manual_en/090_tablet/Tablet_interface.htm)
- [Companion Mode](https://help.clip-studio.com/en-us/manual_en/840_options/Companion_Mode.htm)
- [도구 가져오기·내보내기](https://help.clip-studio.com/en-us/manual_en/150_tools/Importing_and_exporting_tools.htm)
- [브러시 파일 추가](https://help.clip-studio.com/en-us/manual_en/240_brushes/Adding_new_brushes.htm)
- [Auto Actions와 LAF](https://help.clip-studio.com/en-us/manual_en/720_preferences/Auto_Actions.htm)
- [Materials 유형·워크스페이스·색상·자동 작업](https://help.clip-studio.com/en-us/manual_en/630_material/Materials_in_Clip_Studio_Paint.htm)
- [Open file과 지원 포맷](https://help.clip-studio.com/en-us/manual_en/210_file/Open_file.htm)
- [Exporting files](https://help.clip-studio.com/en-us/manual_en/210_file/Exporting_files.htm)
- [CMC 관리 파일과 페이지 파일](https://help.clip-studio.com/en-us/manual_en/570_pages/Management_Files_and_Page_Files.htm)
- [3D 파일 가져오기](https://help.clip-studio.com/en-us/manual_en/660_3d/Importing_3D_Files.htm)
- [애니메이션 내보내기](https://help.clip-studio.com/en-us/manual_en/600_animation/Export_animation.htm)
- [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/)
- [File System API·OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)

공개 매뉴얼로 확인할 수 없는 로그인 전용 소재 내부 데이터, 사용자별 설정 폴더의 모든 버전 차이, 비공개 파일 구조는 추정과 확인을 구분한다. 구현 시 사용자 소유 테스트 파일·공식 앱 재개방·법무 검토를 결합한다.


# 부록 A. CSP 전환 UI/UX·명령 동선 전체 매핑

| 매핑ID | 분야 | CSP 개념·기능 | ToonStudio 대응 | 기본 노출명 | 검색 별칭 | 데스크톱 동선 | 태블릿 동선 | 마이그레이션 정책 | 핵심 모듈 | 우선순위 | 수용 기준 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cspmap.entry.001 | 진입 | 새 캔버스 | New Project Wizard | 새 작품 | 새 캔버스, New, 일러스트, 만화, 웹툰, 애니메이션 | File > New 또는 홈 | 홈의 큰 새 작품 버튼 | CSP 작품 용도·해상도·기본 표현색 프리셋 이식 | ProjectTemplateRegistry | P0 | CSP 사용자 90%가 설명 없이 새 원고 생성 |
| cspmap.entry.002 | 진입 | 파일 열기 | Migration-aware Open | 열기/가져오기 | Open, 가져오기, CLIP 열기, PSD 열기 | 드래그앤드롭·File > Open | 파일 앱·공유 시트 | 확장자 탐지 후 일반 열기/마이그레이션 자동 분기 | FormatGateway | P0 | 파일 선택 후 1단계 안에 캔버스 또는 보고서 표시 |
| cspmap.entry.003 | 진입 | CLIP STUDIO 프로젝트 | Project Hub | 프로젝트 | 작품 관리, 프로젝트, 최근 파일, 클라우드 | 홈/사이드바 | 홈 카드 | 원본 .clip/.cmc와 변환본을 한 카드에 묶음 | ProjectIndex + SQLite WASM | P0 | 최근·복구·원본 상태를 한 화면에서 식별 |
| cspmap.mode.004 | 모드 | Simple Mode | Focus Mode | 집중 모드 | 간단 모드, Simple, 초보 모드 | View > Workspace Mode | 상단 모드 버튼 | 필수 도구·레이어·색·되돌리기만 노출 | WorkspaceProfile | P0 | 3초 내 전환, 문서 상태 불변 |
| cspmap.mode.005 | 모드 | Studio Mode | Studio Mode | 스튜디오 모드 | 전문가 모드, Studio, 전체 기능 | 기본 데스크톱 | 상단 모드 버튼 | CSP형 팔레트 구성을 기본 프리셋으로 제공 | WorkspaceProfile | P0 | CSP 핵심 팔레트 위치를 첫 시선에 발견 |
| cspmap.tool.006 | 도구 | Tool palette | Tool Rail | 도구 | Tool, 툴, 도구 팔레트 | 왼쪽 세로 레일 | 왼손/오른손 도킹 | CSP 도구군 순서 프리셋 제공 | ToolRegistry | P0 | 펜·지우개·채우기·선택이 1클릭 |
| cspmap.tool.007 | 도구 | Tool Group palette / 구 Sub Tool | Preset Browser | 브러시·도구 그룹 | Sub Tool, 서브툴, Tool Group, 보조 도구 | Tool Rail 옆 접이식 패널 | 하단 시트·팝업 | 구/신 CSP 명칭을 검색 별칭으로 동시 유지 | PresetLibrary | P0 | 기존 용어 어느 쪽으로도 검색 결과 동일 |
| cspmap.tool.008 | 도구 | Tool Property palette | Context Tool Bar | 도구 속성 | Tool Property, 도구 프로퍼티, 브러시 속성 | 캔버스 상단 또는 좌측 하단 | 캔버스 하단 HUD | 크기·불투명도·안정화·혼색 등 자주 쓰는 값만 노출 | PropertySchema | P0 | 주요 속성 변경이 1클릭 또는 1제스처 |
| cspmap.tool.009 | 도구 | Advanced Tool Settings / 구 Sub Tool Detail | Advanced Inspector | 고급 도구 설정 | Sub Tool Detail, 보조 도구 상세, Advanced Tool Settings | 오른쪽 Inspector 탭 | 전체 화면 시트 | CSP 카테고리와 BrushGraph 양방향 연결 | BrushGraphInspector | P0 | 모든 노출값 검색·즐겨찾기·초기화 가능 |
| cspmap.tool.010 | 도구 | Tool Settings lock/reset/save default | Preset State Controls | 잠금·초기화·기본값 저장 | 기본값, 잠금, reset, save default | 속성 헤더 | 점 3개 메뉴 | 프리셋 원본/사용자 변경/문서 override를 구분 | PresetVersioning | P0 | 실수로 프리셋 원본 덮어쓰기 방지 |
| cspmap.quick.011 | 빠른 동작 | Quick Access palette | Quick Deck | 빠른 실행 | Quick Access, 퀵 액세스, 즐겨찾기 | 좌/우 도킹 또는 팝업 | 스마트폰 Remote Deck·하단 시트 | 도구·명령·오토액션·색상을 같은 슬롯에 등록 | CommandRegistry | P0 | 사용자가 30초 내 새 세트 생성·재배치 |
| cspmap.quick.012 | 빠른 동작 | Command Bar | Action Bar | 명령 바 | Command Bar, 커맨드 바, 상단 바로가기 | 상단 고정·사용자 그룹 | 상단 축약 | CSP형 기본 그룹 + ToonStudio 고유 상태 배지 | CommandRegistry | P0 | 저장·Undo·변형·좌우반전 즉시 발견 |
| cspmap.quick.013 | 빠른 동작 | Selection Launcher | Selection HUD | 선택 도구막대 | Selection Launcher, 선택 런처, 플로팅 바 | 선택 영역 근처 | 손가락을 가리지 않는 자동 위치 | 변형·반전·채우기·삭제·톤·마스크를 문맥 노출 | ContextActionResolver | P0 | 선택 후 상용 명령 80%가 포인터 이동 180px 이내 |
| cspmap.quick.014 | 빠른 동작 | Pop-up palettes | Pop-up Panels | 팝업 패널 | 팝업 팔레트, palette popup | 단축키/펜 버튼으로 커서 근처 | 롱프레스/제스처 | 색·레이어·브러시·Quick Deck를 임시 표시 | OverlayManager | P0 | 호출·선택·닫기가 한 손동작으로 완료 |
| cspmap.input.015 | 입력 | Tool shift | Momentary Tool Switch | 누르는 동안 도구 전환 | 임시 도구, tool shift, hold shortcut | 단축키 홀드 | Remote Deck 모드키 홀드 | 홀드/토글 임계시간 사용자 설정 | InputBindingEngine | P0 | 키 릴리스 시 정확히 원도구 복귀 |
| cspmap.input.016 | 입력 | Modifier Key Settings | Context Modifier Map | 보조키 설정 | Modifier, Shift Ctrl Alt, 보조 키 | 도구·버튼·장치별 매핑 | 펜 버튼·손가락·Remote Deck | CSP 프로필을 기본 제공하되 충돌 검사 | InputBindingEngine | P0 | 도구별 보조키 의미를 UI에서 즉시 확인 |
| cspmap.input.017 | 입력 | Space Hand | Temporary Pan | 임시 손 도구 | Space, pan, hand | Space 홀드 | 한 손가락/두 손가락 설정 | CSP 내비게이션 프리셋 | ViewportController | P0 | 획과 팬 오인식 0.1% 미만 |
| cspmap.input.018 | 입력 | Shift+Space Rotate | Temporary Rotate | 임시 회전 | rotate canvas, 캔버스 회전 | Shift+Space 홀드 | 두 손가락 회전 | 회전 스냅·원점 복귀 제공 | ViewportController | P0 | 회전 중 입력 지연 증가 없음 |
| cspmap.input.019 | 입력 | Ctrl/Cmd+Space Zoom | Temporary Zoom | 임시 확대/축소 | zoom, 캔버스 확대 | Ctrl/Cmd+Space | 핀치 | 마우스·펜 방향 옵션 제공 | ViewportController | P0 | 포인터 아래 지점 유지 |
| cspmap.input.020 | 입력 | Alt Eyedropper | Temporary Eyedropper | 임시 스포이드 | Alt, color pick, 색 추출 | Alt 홀드 | 펜 버튼/롱프레스 | 표시색·레이어색·참조색 모드 기억 | ColorSampler | P0 | 릴리스 즉시 이전 브러시 상태 복귀 |
| cspmap.input.021 | 입력 | Brush size drag | Brush HUD Drag | 브러시 크기 드래그 | 크기 변경, Ctrl Alt drag, HUD | 사용자 지정 조합키+드래그 | 화면 홀드+드래그 | 크기·불투명도·경도 2D HUD 옵션 | BrushHUD | P0 | 캔버스를 보며 정밀 조정 |
| cspmap.input.022 | 입력 | Tablet input frequency | Input Quality Profile | 입력 품질 | Prefer speed, Prefer quality, 샘플링 | Capability Center | 자동 추천·수동 전환 | 장치별 샘플 누락·지연 측정 후 추천 | InputProfiler | P0 | 99퍼센타일 입력 지연과 누락률 표시 |
| cspmap.layer.023 | 레이어 | Layer palette | Layer Tree | 레이어 | Layer, 레이어 팔레트 | 오른쪽 기본 도킹 | 하단 시트/오른쪽 도킹 | CSP 아이콘 의미와 비슷한 순서, 다른 시각 언어 | LayerGraph | P0 | 래스터·벡터·폴더·마스크를 즉시 구분 |
| cspmap.layer.024 | 레이어 | Layer Property palette | Layer Effects Inspector | 레이어 속성 | Layer Property, 표현색, 톤, 레이어 컬러 | 레이어 탭 상단/Inspector | 레이어 상세 시트 | 표현색·톤·경계·색상·효과를 비파괴 노드로 매핑 | EffectGraph | P0 | CSP 원본 의미와 ToonStudio 확장 상태 동시 표시 |
| cspmap.layer.025 | 레이어 | Reference layer | Reference Role | 참조 레이어 | reference, 참조, 채우기 참조 | 레이어 아이콘/컨텍스트 | 스와이프 메뉴 | 복수 역할 태그로 확장 | LayerRoleGraph | P0 | 채우기·자동선택이 동일 역할을 공유 |
| cspmap.layer.026 | 레이어 | Draft layer | Draft Role | 밑그림 레이어 | draft, 밑그림, 스케치 | 레이어 아이콘 | 레이어 메뉴 | 내보내기·채우기·AI 참조 여부를 분리 설정 | LayerRoleGraph | P0 | 출고 프리셋에서 예측 가능한 제외 |
| cspmap.layer.027 | 레이어 | Vector layer | Editable Stroke Layer | 벡터 레이어 | vector, 선 수정, 선폭 수정 | 새 레이어 메뉴 | 추가 버튼 길게 누르기 | StrokeIR·Vello/CanvasKit·Google Ink 결과 유지 | VectorLayerBackend | P0 | 선폭·제어점·브러시 재적용 가능 |
| cspmap.layer.028 | 레이어 | Frame border folder | Panel Frame Group | 컷 테두리 폴더 | frame border, 컷, 칸 | Comic 메뉴/레이어 추가 | 웹툰 퀵툴 | 컷 마스크·거터·독서순서를 의미 객체로 저장 | ComicGraph | P0 | 컷 분할 후 레이어 자동 배치 |
| cspmap.layer.029 | 레이어 | Balloon/Text layer | Dialogue Object | 말풍선·텍스트 | balloon, 대사, 말풍선, text | Text & Balloon 도구 | 하단 텍스트 시트 | 텍스트·꼬리·화자·번역을 분리된 의미 객체로 저장 | DialogueGraph | P0 | 언어 변경 후 자동 재배치 |
| cspmap.layer.030 | 레이어 | Tone | Procedural Tone Node | 스크린톤 | tone, 망점, 톤 | Layer Property/Filter | 톤 HUD | LPI·각도·농도·모아레 검사를 실시간 노드화 | WebGPU Tone Engine | P0 | 확대율과 무관한 안정적 출력 |
| cspmap.layer.031 | 레이어 | Correction layer | Adjustment Layer | 보정 레이어 | tonal correction, adjustment, 보정 | Layer > New Adjustment | 추가 메뉴 | EffectGraph 비파괴 노드로 직접 매핑 | EffectGraph | P0 | PSD/ORA 출력 시 지원 여부 보고 |
| cspmap.layer.032 | 레이어 | File object | Linked Asset | 연결 파일 | file object, linked, 파일 오브젝트 | File > Import/Create linked | 자산 메뉴 | 원본·프록시·버전·변환 행렬을 유지 | AssetGraph | P1 | 원본 변경 시 명시적 업데이트 |
| cspmap.layer.033 | 레이어 | 2D camera folder | Camera Track Group | 2D 카메라 | 2D camera, 카메라 폴더 | Animation 메뉴 | 타임라인 시트 | 카메라를 공통 TimelineGraph로 매핑 | TimelineGraph | P1 | GIF/영상/웹 프리뷰 동일 동작 |
| cspmap.color.034 | 색상 | Color Wheel palette | Color Wheel | 색상환 | Color Wheel, 컬러 휠 | 오른쪽 상단 | 팝업/Remote Deck | HSV/HSL/OKLCH·gamut 상태 표시 | ColorEngine | P0 | 색상 선택 후 즉시 브러시 반영 |
| cspmap.color.035 | 색상 | Color Set palette | Palette Library | 색상 세트 | Color Set, 팔레트, cls, aco | 도킹 패널 | 하단 시트 | .cls/.aco/ASE/GPL 등 통합 라이브러리 | PaletteGateway | P0 | 가져온 순서·이름·투명색 유지 |
| cspmap.color.036 | 색상 | Intermediate/Approximate Color | Color Lab Panels | 색상 탐색 | 중간색, 근사색, 컬러 히스토리 | 색상 탭 | 스와이프 탭 | CSP 패널을 단일 Color Lab로 통합 | ColorEngine | P1 | 동일 기능 중복 없이 목적별 탭 |
| cspmap.color.037 | 색상 | Color Mixing | Mixing Pad | 색 혼합 | color mixing, 믹싱, 팔레트 | 팝업 패널 | Remote Deck/전면 패널 | Spectral.js·Hokusai와 브러시 혼색 연동 | PigmentEngine | P1 | 혼합 결과를 색상 세트로 드래그 |
| cspmap.asset.038 | 자료 | Material palette | Asset Vault | 소재 | Material, 소재, Assets | 왼쪽/오른쪽 도킹 | 전체 화면 자산 브라우저 | 이미지·브러시·톤·3D·템플릿·워크스페이스 통합 | AssetGraph | P0 | 드래그만으로 적합한 대상에 설치/삽입 |
| cspmap.asset.039 | 자료 | Sub View palette | Reference Desk Mini | 보조 보기 | Sub View, 레퍼런스, 참고 이미지 | 탭/플로팅 | Remote Deck 카메라 연동 | 픽업 팔레트·뒤집기·비교·출처 보존 | ReferenceGraph | P0 | 현재 작업을 가리지 않고 참조 전환 |
| cspmap.asset.040 | 자료 | Item Bank | Project Assets | 프로젝트 자산 | Item Bank, 아이템 뱅크, 파일 목록 | 프로젝트 패널 | 자산 시트 | 대용량 이미지·오디오·3D 프록시와 사용처 표시 | AssetGraph | P1 | 미사용·누락·중복 자산 검출 |
| cspmap.automation.041 | 자동화 | Auto Action | Automation Recipe | 자동 작업 | Auto Action, 오토액션, laf, 매크로 | Automation 패널 | Quick Deck 실행 | 명령 ID 기반 안전한 레시피로 변환 | AutomationGraph | P1 | 실행 전 영향 미리보기·취소 가능 |
| cspmap.automation.042 | 자동화 | Shortcut Settings | Shortcut & Gesture Studio | 단축키·제스처 | shortcut, 단축키, 키 설정 | Preferences | 설정 전체화면 | CSP 프리셋·사용자 충돌 해결·검색 | InputBindingEngine | P0 | 모든 명령을 ID·별칭으로 검색 |
| cspmap.workspace.043 | 작업공간 | Workspace | Workspace Profile | 작업공간 | workspace, 팔레트 배치, 워크스페이스 | Window > Workspace | 모드 선택기 | 레이아웃·단축키·Action Bar·단위·장치 오버라이드 | WorkspaceManager | P0 | 장치 크기가 달라도 의미 위치 유지 |
| cspmap.workspace.044 | 작업공간 | Workspace material | Shareable Workspace Package | 작업공간 패키지 | workspace material, 설정 공유 | 가져오기 센터 | 클라우드/QR | CSP 직접 읽기 불가 시 설정 스크린샷·내보내기 번들 안내 | MigrationCenter | P2 | 미지원 요소가 보고서에 명시 |
| cspmap.workspace.045 | 작업공간 | Palette docking | Dock Layout Engine | 패널 배치 | palette, dock, 패널 | 드래그·탭·자동 숨김 | 스냅 도킹·하단 시트 | CSP형 좌·우 팔레트 스택 프리셋 | DockLayout | P0 | 실수 이동 잠금·되돌리기 제공 |
| cspmap.misc.046 | 내비게이션 | Navigator palette | Navigator | 내비게이터 | Navigator, 썸네일, 회전 | 오른쪽 상단 | 핀치 미니맵 | 줌·회전·반전·표시영역을 한 패널에 유지 | ViewportController | P0 | 캔버스 상태와 1프레임 내 동기화 |
| cspmap.misc.047 | 내비게이션 | Flip horizontal/vertical | View Mirror | 좌우·상하 반전 보기 | mirror, flip, 좌우반전 | Action Bar·View | 두 손가락/Quick Deck | 보기 반전과 실제 변형을 명확히 구분 | ViewportController | P0 | 상태 표시와 Undo 오인 방지 |
| cspmap.misc.048 | 내비게이션 | Webtoon Preview | Scroll Preview | 웹툰 스크롤 미리보기 | webtoon preview, 스마트폰 보기 | 별도 프리뷰 창 | Remote Deck/전화 화면 | 플랫폼별 폭·간격·안전영역·로딩 시뮬레이션 | PublishPreview | P0 | 실기기 너비 프리셋 전환 |
| cspmap.misc.049 | 페이지 | Page Manager/Story | Episode & Page Manager | 에피소드·페이지 | Page Manager, Story, 페이지 관리, cmc | 왼쪽 프로젝트 트리 | 페이지 썸네일 시트 | .cmc 구조를 ProjectGraph로 매핑 | ProductionGraph | P0 | 페이지 재정렬·추가·일괄 설정이 비파괴 |
| cspmap.misc.050 | 페이지 | Story Editor | Dialogue & Script Editor | 대사·스크립트 | Story Editor, 대사 편집, 스토리 에디터 | 분할 문서 보기 | 전체화면 텍스트 편집 | 말풍선 ID와 대사·번역·TTS를 연결 | StoryGraph | P1 | 캔버스·대본 양방향 선택 |
| cspmap.animation.051 | 애니메이션 | Timeline palette | Timeline | 타임라인 | timeline, 애니메이션 | 하단 도킹 | 전체화면/하단 시트 | 셀·키프레임·카메라·오디오를 공통 트랙으로 표현 | TimelineGraph | P1 | CSP 단축키·프레임 개념 별칭 제공 |
| cspmap.3d.052 | 3D | 3D layer/Object Launcher | Pose Stage + Object HUD | 3D·포즈 | 3D layer, Object Launcher, 포즈 | 선택 객체 근처 HUD | 하단 3D 컨트롤 | VRM/glTF/OBJ/FBX/BVH/PEP 경로를 통합 | Scene3DIR | P1 | 포즈·카메라·빛을 동일 문서에 저장 |
| cspmap.misc.053 | 보조기기 | Companion Mode | Remote Deck PWA | 스마트폰 리모컨 | Companion, 리모컨, 스마트폰 | QR 연결 | 스마트폰 PWA | Quick Deck·색·제스처·참조·웹툰 프리뷰 제공 | RemoteDeck | P1 | 동일 LAN 또는 안전한 세션 연결 |
| cspmap.storage.054 | 저장 | Recovery data | Continuous Journal | 자동 복구 | recovery, 복구, autosave | 상태 바·History | 상태 바 | 명령 저널+타일 diff+체크포인트 | OPFSJournal | P0 | 강제 종료 후 마지막 확정 동작까지 복구 |
| cspmap.storage.055 | 저장 | Background save | Non-blocking Save | 백그라운드 저장 | background save, 저장 중 작업 | 상태 배지 | 상태 배지 | 스냅샷 시점을 명시하고 이후 변경은 다음 저널에 기록 | StorageWorker | P0 | 저장 중 입력 프레임 저하 5% 이하 |
| cspmap.storage.056 | 저장 | Save compatibility mode | Versioned Native Package | 버전 호환 저장 | compatibility mode, 하위 버전 | Save Options | 내보내기 시트 | 스키마 마이그레이션+fallback snapshot+opaque 노드 보존 | SchemaMigration | P1 | 구버전 뷰어가 최소 composite를 표시 |
| cspmap.help.057 | 도움말 | Icon explanation | Context Help | 도구 도움말 | help, 설명, F1, 아이콘 설명 | hover/F1 | 탭 후 설명·영상 | CSP·Photoshop 용어 역검색과 현재 상태 진단 | HelpGraph | P0 | 어떤 도구도 2단계 내 도움말 도달 |
| cspmap.accessibility.058 | 접근성 | Touch interface scaling | Adaptive Density | 터치 UI 크기 | touch UI, interface scaling | Preferences | 자동·수동 | 펜·손가락·화면 크기에 따라 hit target 조절 | AdaptiveUI | P0 | 최소 터치 타깃 44 CSS px |
| cspmap.accessibility.059 | 접근성 | Interface color/density | Theme & Contrast | 테마·대비 | dark, light, density, UI 색 | Preferences | 설정 | 다크/라이트/고대비·색각 보조·중립 캔버스 | DesignTokenSystem | P0 | WCAG 대비 검사 통과 |
| cspmap.migration.060 | 마이그레이션 | 사용자 설정 폴더/클라우드 | CSP Migration Center | CSP에서 가져오기 | CELSYS, 설정 이전, 브러시 이식 | 홈 > 가져오기 | 클라우드/파일 선택 | 사용자 동의하에 Local ToonBridge가 목록화하고 원본은 보존 | MigrationCenter | P0 | 가져오기 전 어떤 데이터가 읽히는지 명시 |
| cspmap.migration.061 | 마이그레이션 | 소재 정리 | Migration Collections | 이전한 소재 | 다운로드 소재, material, asset | Asset Vault 컬렉션 | 자산 시트 | 원본 폴더·CSP 태그·출처·라이선스·사용 빈도 유지 | AssetGraph | P0 | 중복 해시·누락 팁·깨진 링크 검출 |
| cspmap.migration.062 | 마이그레이션 | 브러시 테스트 | Brush Fidelity Lab | 브러시 비교 | brush test, 필기감 비교 | Migration Report | 테스트 캔버스 | 압력별 선·점·곡선·혼색 표준 시트 자동 생성 | BrushFidelityHarness | P0 | 시각 차이와 원인·대체 엔진 표시 |
| cspmap.migration.063 | 마이그레이션 | 파일 변환 결과 | Interop Report | 호환성 보고서 | conversion report, 손실, 호환성 | 열기 후 사이드 패널 | 요약 카드 | 정확/근사/Bake/보존 전용을 객체별 표시 | InteropReport | P0 | 사용자가 숨은 손실 없이 저장 결정을 내림 |


# 부록 B. CSP 전환·핵심 포맷 요약

전체 313개 포맷/규격의 세부 엔진·브리지·보존·검증 전략은 별도 CSV에 수록한다. 아래 표는 CSP 전환 경로가 명시된 핵심 항목이다.

| 분야 | 포맷 | 확장자 | 가져오기 | 내보내기 | 우선순위 | CSP 전환 경로 |
| --- | --- | --- | --- | --- | --- | --- |
| 네이티브·프로젝트 | Adobe Photoshop Document | PSD | F2 | F2 | P0 | CSP에서 PSD로 저장/복제한 파일을 가장 안정적인 구조형 이관 경로로 사용 |
| 네이티브·프로젝트 | Adobe Photoshop Large Document | PSB | F2 | F2 | P0 | 대형 CSP 원고의 PSB 중간 교환 경로 |
| 네이티브·프로젝트 | Clip Studio Multi-page Management | CMC | F3/F5 | F5 | P0 | CSP 프로젝트 폴더 선택 → 페이지 트리 생성 → 각 페이지 변환·상태 표시 |
| 네이티브·프로젝트 | Clip Studio Paint Project | CLIP | F3/F5 | F5 | P0 | 파일 드롭 → 안전 분석 → 페이지/레이어/미리보기 복원 → 불확실 객체 표시 → PSD 브리지 제안 |
| 네이티브·프로젝트 | OpenRaster | ORA | F1 | F1 | P0 | CSP와 Krita/MyPaint 사이의 공개 레이어 교환 보조 경로 |
| 네이티브·프로젝트 | ibisPaint Work File | IPV | F2/F3 | F5 | P0 | CSP 사용자도 자주 교환하므로 Migration Center 공통 처리 |
| 브러시·색상·폰트 | Adobe XMP Metadata | XMP | F1 | F1 | P0 | Asset Vault 권리·출처 이식 |
| 브러시·색상·폰트 | Clip Studio Color Set | CLS | F1/F2 | F2 | P0 | 색상 세트 드롭 → Palette Library |
| 브러시·색상·폰트 | Clip Studio Sub Tool | SUT | F5 | F5 | P0 | 브러시 마이그레이션 마법사에서 팁·텍스처·동역학·압력 곡선을 BrushProgramIR로 변환 |
| 브러시·색상·폰트 | Clip Studio Tool Group | SUTG | F2/F3 | F3 | P0 | 그룹 단위 드롭 → 컬렉션·태그·프리셋 생성 |
| 브러시·색상·폰트 | Photoshop Brush | ABR | F2 | F2 | P0 | CSP와 Photoshop이 모두 사용하는 중간 브러시 교환 포맷으로 우선 지원 |
| 3D·VRM·CAD·BIM | Clip Studio 3D Background | CS3S | F3/F5 | F5 | P1 | 배경 장면 이식 |
| 3D·VRM·CAD·BIM | Clip Studio 3D Character | CS3C | F3/F5 | F5 | P1 | 3D Migration Center |
| 3D·VRM·CAD·BIM | Clip Studio 3D Object | CS3O | F3/F5 | F5 | P1 | 3D Migration Center |
| Office·출판·문서 | Adobe InDesign Markup | IDML | F2 | F2 | P1 | CSP 원고를 출판 조판 워크플로로 연결 |
| Office·출판·문서 | Hancom HWP | HWP | F3/F4 | F4 | P1 | 한국 사용자 문서 이식 |
| Office·출판·문서 | Hancom HWPX | HWPX | F2 | F2 | P1 | 한국 사용자 문서 이식 |
| 네이티브·프로젝트 | Clip Studio Name File | CSNF | F4/F5 | F5 | P1 | 대사/네임 파일을 StoryRoom으로 이식 |
| 네이티브·프로젝트 | Clip Studio Paint Legacy Document | LIP | F3/F5 | F5 | P1 | LIP를 먼저 .clip 또는 PSD로 변환 권장 |
| 벡터·PDF·다이어그램 | Graphviz DOT | DOT/GV | F1 | F1 | P1 | 다이어그램 기능 |
| 벡터·PDF·다이어그램 | Mermaid | MMD/MERMAID | F1 | F1 | P1 | 스토리/아키텍처 다이어그램 |
| 벡터·PDF·다이어그램 | OpenDocument Graphics | ODG | F2 | F2 | P1 | 문서/프레젠테이션 사용자 이식 |
| 벡터·PDF·다이어그램 | PDF Forms Data | FDF/XFDF | F1/F2 | F2 | P1 | 검토 주석 이식 |
| 브러시·색상·폰트 | Adobe Curves Preset | ACV | F1/F2 | F2 | P1 | CSP/Photoshop 보정 프리셋 이식 |
| 브러시·색상·폰트 | Adobe Photoshop Gradient | GRD | F2 | F2 | P1 | CSP/Photoshop 공용 그라데이션 이전 |
| 브러시·색상·폰트 | Clip Studio Auto Action Set | LAF | F3/F5 | F4/F5 | P1 | 자동 작업 가져오기 → 실행 전 영향 미리보기 |
| 브러시·색상·폰트 | Clip Studio Gradient Set | CGS | F3/F4 | F3/F4 | P1 | CSP 그라데이션 세트를 Palette Lab으로 이동 |
| 브러시·색상·폰트 | GIMP Gradient | GGR | F1 | F1 | P1 | Gradient Library |
| 브러시·색상·폰트 | Krita Palette | KPL | F1/F2 | F2 | P1 | Krita/CSP 색상 세트 통합 |
| 브러시·색상·폰트 | Procreate Swatches | SWATCHES | F2 | F2 | P1 | iPad 사용자 팔레트 이식 |
| 애니메이션·영상·오디오·타임라인 | Live2D Runtime Model | MOC3/MODEL3.JSON | F2/F3 | F3 | P1 | 캐릭터 리그 재생 |
| 웹·아카이브·교환 | Gzip | GZ | F1 | F1 | P1 | 압축 자산 |
| 웹·아카이브·교환 | Zstandard | ZST | F1 | F1 | P1 | 고속 콘텐츠 청크 |
| 3D·VRM·CAD·BIM | Additive Manufacturing Format | AMF | F1/F2 | F2 | P2 | 3D 출력 |
| 3D·VRM·CAD·BIM | LightWave Object/Scene | LWO/LWS | F2 | F3 | P2 | CSP 3D 사용자의 직접 이식 |
| 3D·VRM·CAD·BIM | Rhinoceros 3D | 3DM | F2/F3 | F3 | P2 | 디자인/CAD 사용자 |
| 3D·VRM·CAD·BIM | Substance Archive | SBSAR | F3/F4 | F4 | P2 | 절차 재질 사용 |
| 3D·VRM·CAD·BIM | VRoid Studio Project | VROID | F5 | F5 | P2 | VRoid 사용자 이식 |
| Office·출판·문서 | Advanced Comic Book Format | ACBF | F1/F2 | F2 | P2 | 디지털 만화 출판 |
| Office·출판·문서 | AsciiDoc | ADOC/ASCIIDOC | F1 | F1 | P2 | 기획/도움말 |
| Office·출판·문서 | Hancom Show | SHOW | F4/F5 | F5 | P2 | 프레젠테이션 사용자 |
| Office·출판·문서 | LaTeX | TEX/LTX | F1/F2 | F2 | P2 | 논문/수식 문서 |
| Office·출판·문서 | MHTML Web Archive | MHTML/MHT | F2 | F3 | P2 | 레퍼런스 보관 |
| Office·출판·문서 | Mobipocket/Kindle | MOBI/AZW/AZW3/KFX | F3/F4 | F3/F4 | P2 | 전자책 사용자 |
| Office·출판·문서 | Rich Text Format | RTF | F2 | F2 | P2 | 대사/문서 |
| Office·출판·문서 | Scribus Document | SLA/SLA.GZ | F1/F2 | F2 | P2 | 오픈 출판 |
| 네이티브·프로젝트 | ComicStudio Page | CPG | F3/F4 | F5 | P2 | CSP 레거시 이전 센터 |
| 네이티브·프로젝트 | ComicStudio Work | CST | F3/F4 | F5 | P2 | CST → CMC/페이지 트리 변환 |
| 네이티브·프로젝트 | IllustStudio Document | XPG | F3/F4 | F5 | P2 | CSP 레거시 이전 센터 |
| 래스터·HDR·RAW·텍스처 | Quite OK Image | QOI | F1 | F1 | P2 | 빠른 임시 교환 |
| 벡터·PDF·다이어그램 | BPMN | BPMN/XML | F1 | F1 | P2 | 웹툰·디자인 제작 공정과 승인 흐름을 다이어그램으로 이식 |
| 벡터·PDF·다이어그램 | D2 Diagram | D2 | F1 | F1 | P2 | 빠른 기획 도식 |
| 벡터·PDF·다이어그램 | GeoJSON | GEOJSON/JSON | F1 | F1 | P2 | 배경/지도 제작 |
| 벡터·PDF·다이어그램 | PlantUML | PUML/PLANTUML | F1 | F1 | P2 | 문서/기획 다이어그램 |
| 브러시·색상·폰트 | 3D LUT | 3DL | F1/F2 | F2 | P2 | 영상/사진 LUT |
| 브러시·색상·폰트 | ASC CDL | CDL/CCC/CC | F1 | F1 | P2 | 영상 색보정 |
| 브러시·색상·폰트 | Adobe Action | ATN | F3/F5 | F5 | P2 | Auto Action/Automation Center로 변환 |
| 브러시·색상·폰트 | Adobe Custom Shape | CSH | F2/F3 | F3 | P2 | 도형/장식 자산으로 이전 |
| 브러시·색상·폰트 | Affinity Palette | AFPALETTE | F3/F5 | F5 | P2 | Affinity 사용자 이전 |
| 브러시·색상·폰트 | Clip Studio Pose Studio Pose | PEP | F3/F4 | F5 | P2 | PoseStage로 가져와 VRM/BVH와 함께 retarget |
| 브러시·색상·폰트 | Clip Studio Tool Set Legacy | TOS | F3/F4 | F5 | P2 | 레거시 브러시 이전 |
| 브러시·색상·폰트 | GIMP/Krita Curves | CRV | F2 | F2 | P2 | 보정 프리셋 이식 |
| 브러시·색상·폰트 | GIMP/Krita Levels | LEV | F2 | F2 | P2 | 보정 프리셋 이식 |
| 브러시·색상·폰트 | Krita Dynamics | GDYN | F2/F3 | F3 | P2 | 브러시 동역학 이식 |
| 브러시·색상·폰트 | Krita Tool Preset | GTP | F2/F3 | F3 | P2 | 도구 프리셋 이식 |
| 브러시·색상·폰트 | Krita Workspace | KWS | F2/F3 | F3 | P2 | 작업공간 마이그레이션 |
| 브러시·색상·폰트 | SwatchBooker Palette | SBZ | F1/F2 | F2 | P2 | 전문 팔레트 |
| 애니메이션·영상·오디오·타임라인 | Core Audio Format | CAF | F1/F2 | F2 | P2 | Apple 오디오 자산 |
| 애니메이션·영상·오디오·타임라인 | Inochi2D Puppet | INP/INX | F2 | F2 | P2 | 오픈 2D 리그 |
| 애니메이션·영상·오디오·타임라인 | Live2D Cubism Model | CMO3 | F4/F5 | F5 | P2 | Live2D 사용자 이식 |
| 애니메이션·영상·오디오·타임라인 | Live2D Motion/Expression/Physics | MOTION3.JSON/EXP3.JSON/PHYSICS3.JSON | F2/F3 | F3 | P2 | 리그 애니메이션 |
| 애니메이션·영상·오디오·타임라인 | MLT/Kdenlive Project | MLT/KDENLIVE | F2 | F2 | P2 | 오픈 영상 편집 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz Raster Level | TLV/TZP/TZU | F2/F3 | F3 | P2 | 셀 애니메이션 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz Scene | TNZ | F2/F3 | F3 | P2 | 오픈 애니메이션 |
| 애니메이션·영상·오디오·타임라인 | OpenToonz Vector Level | PLI | F2/F3 | F3 | P2 | 벡터 셀 |
| 애니메이션·영상·오디오·타임라인 | Spine Editor Project | SPINE | F3/F5 | F5 | P2 | 게임 2D 리그 |
| 웹·아카이브·교환 | Bzip2 | BZ2 | F1 | F1 | P2 | 압축 자산 |
| 웹·아카이브·교환 | XZ/LZMA | XZ/LZMA | F1 | F1 | P2 | 압축 자산 |
| 3D·VRM·CAD·BIM | 3D PDF Geometry | U3D/PRC | F3/F4 | F4 | P3 | 3D PDF 자산 |
| 3D·VRM·CAD·BIM | ACIS SAT/SAB | SAT/SAB | F3/F4 | F4 | P3 | CAD 사용자 수용 |


# 부록 C. V4.1 전체 통합 문서

아래에는 기존 V4.1의 브라우저 호환성·최대 포맷 상호운용성·창작 생태계·브러시·필터·멀티엔진 설계를 원문 그대로 보존한다. 상충하는 표현이 있을 경우 V4.2의 CSP 전환·명령·포맷 정책이 우선한다.

---


# ToonStudio 창작 생태계 초확장 · 브라우저 호환성·최대 포맷 상호운용성·품질·성능 최종 아키텍처 V4.1

## 유사 드로잉 앱뿐 아니라 레퍼런스·포즈·색상·스토리·배경·3D·자산·검수·출판·교육·자동화 서비스를 하나의 브라우저 창작 운영체제로 통합하는 설계

- 기준일: 2026-08-06
- 대상: `https://www.toonstudio.cloud/studio`
- 최우선순위: **브라우저 실행 호환성을 단계적 폴백으로 최대화하면서, 내부 품질·필기감·성능을 유지하고, 파일·확장자·프로젝트·브러시·3D·미디어 포맷 상호운용성을 가능한 최대 범위로 제공**
- 확장 레지스트리: 제품·서비스 **266개**, 엔진·라이브러리·공개 코드 **139개**, 합계 **405개**
- 기존 V4의 브러시 315종·필터/효과/분석 노드 616종·드로잉 외 기능 1,045종과 생태계 작업면을 보존하고, 이번 V4.1에서 브라우저 호환성과 최대 포맷 상호운용성 계층을 최상위 정책으로 추가한다.

> 이 문서는 “모든 프로젝트를 한 번들에 넣자”는 제안이 아니다. 각 제품의 강점은 기능 패턴으로, 각 오픈소스의 강점은 교체 가능한 어댑터와 백엔드로 흡수한다. 런타임에는 현재 문서·기기·도구에 필요한 모듈만 동적으로 로드한다.


> **V4.1 정정 — 호환성의 두 축을 분리한다.** 이 문서에서 `브라우저 호환성`은 Chromium·Firefox·Safari·iPadOS·Android WebView 등에서 기능 탐지와 폴백으로 편집기를 실행하는 능력을 뜻한다. `파일·포맷 호환성`은 Photoshop·Clip Studio·Krita·Procreate·Figma·PowerPoint·Blender·CAD·영상 도구 사용자들의 원본을 최대한 가져오고 다시 내보내는 상호운용성을 뜻한다. 두 목표는 서로 대체하지 않는다. **브라우저 호환성은 렌더·저장·스레드의 단계적 폴백으로 넓히고, 파일 호환성은 직접 코덱·WASM·서버/로컬 브리지·원본 보존을 함께 사용해 최대화한다.** 이전 부록에 남아 있는 “호환성보다 품질”이라는 표현은 이 V4.1 원칙으로 대체한다.

# 0. 최종 실행 결론

ToonStudio의 최종 제품 정의는 더 이상 “웹 드로잉 앱”이 아니다.

```text
ReferenceDesk      레퍼런스 수집·정리·출처·색상·구도
PracticeLab        제스처·선·필압·해부학 훈련
StoryRoom          스크립트·세계관·샷·컷·대사
PoseStage          VRM·인체·손·표정·카메라·조명
SceneBuilder       평면도·배경·지도·3D·절차 장면
DrawingStudio      벡터·래스터·자연매체·필터·웹툰
AnimationDesk      프레임·리깅·상태·오디오·애니매틱
ReviewTheater      버전·비교·주석·승인·감사
PublishCenter      웹툰·인쇄·슬라이드·영상·웹 패키지
AssetVault         브러시·폰트·이미지·3D·오디오·권리
AutomationLab      노드·템플릿·데이터·배치·플러그인
CapabilityCenter   장치·브라우저·저장·GPU·필압 진단
```

이 모든 작업면은 별도 파일을 만들지 않고 하나의 `CreatorProjectGraph`를 서로 다른 방식으로 보여준다. 캐릭터, 장소, 소품, 컷, 슬라이드, 3D 장면, 대사, 검수 댓글, 자산 라이선스가 동일한 안정 ID로 연결되어야 한다.

최종 핵심 원칙은 다음 여섯 가지다.

1. **품질·상호운용성 동시 우선:** 내부 문서 모델과 브러시 결과는 외부 포맷의 한계에 맞춰 낮추지 않으며, 별도 FormatGateway와 브리지로 외부 포맷 수와 왕복 보존을 최대화한다.
2. **상호작용 우선:** 미리보기는 즉시, 최종 품질은 비동기 정제하는 이중 경로를 사용한다.
3. **엔진 전문화:** Vello·CanvasKit·WebGPU·Hokusai·Three.js 등을 렌더 아일랜드 단위로 배치한다.
4. **명시적 손실:** 내보내기에서 래스터화·색공간 변환·기능 손실이 생기면 `QualityDebtReport`로 보여준다.
5. **웹의 장점 극대화:** URL 공유·무가입 임시 작업·실시간 검토·오프라인·장치 전환·도움말 실행화를 기본으로 한다.
6. **창작 전 과정 연결:** 레퍼런스와 스토리부터 검수와 배포까지 의미 데이터를 유지한다.

# 1. 조사 범위와 증거 수준

## 1.1 제품을 “메뉴 개수”가 아니라 창작 여정으로 분해

```text
발견·레퍼런스
→ 스토리·기획
→ 포즈·장면 블로킹
→ 드로잉·디자인
→ 애니메이션·영상
→ 검토·승인
→ 현지화·출판
→ 자산·권리·버전 보존
```

매뉴얼이나 공개 기능 페이지에서 확인한 기능은 이 여정의 어느 병목을 없애는지로 평가한다. 동일한 기능이 여러 제품에 있어도 UX와 데이터 모델이 다르면 별도 패턴으로 기록한다.

## 1.2 증거 수준

| 등급 | 의미 | 채택 규칙 |
|---|---|---|
| A | 공식 매뉴얼·도움말·공식 저장소에서 직접 확인 | 구현 명세의 근거로 사용 가능 |
| B | 공식 제품 페이지·공식 소개·공개 데모에서 확인 | 기능 방향으로 사용, 세부 동작은 구현 직전 재감사 |
| C | 장기 꼬리 제품군·공개 리뷰·역사적 사례 | 아이디어 백로그로만 사용 |
| D | 코드가 공개됐지만 라이선스 없음 | 동작 사양만 추출하고 클린룸 재구현 |
| R | 연구·고비용·무거운 엔진 | 실험 플래그 뒤에 격리 |

로그인 뒤 동적으로만 보이는 메뉴와 플랜별 제한은 공개 자료만으로 완전 확인할 수 없다. 따라서 “모든 제품의 모든 메뉴를 완전히 열람했다”고 주장하지 않으며, 구현 착수 직전에 버전·플랜·라이선스를 다시 고정한다.

# 2. 확장한 유사·보조 서비스 생태계

| 분야 | 등록 제품·서비스 수 | ToonStudio로 흡수할 핵심 작업면 |
|---|---|---|
| 3D·배경·지도 | 25 | SceneBuilder·CAD·Map Surface |
| 검토·승인 | 12 | ReviewTheater·ApprovalFlow |
| 데이터·자동화 | 15 | AutomationLab·DataBindingGraph |
| 레퍼런스·자산관리 | 20 | ReferenceDesk·AssetVault |
| 무료·공개 자산 | 20 | AssetConnector·RightsGraph |
| 무한 캔버스·노트 | 24 | ReferenceDesk·Knowledge Canvas·PDF 주석 |
| 미디어·오디오 | 15 | AnimationDesk·Audio/Video Surface |
| 배포·현지화 | 14 | PublishCenter·LocalizationGraph |
| 색상·폰트 | 17 | PaletteLab·FontVault·Accessibility |
| 스토리·웹툰·프리프로덕션 | 20 | StoryRoom·Storyboard·ProductionGraph |
| 웹 드로잉·공동작화 | 24 | DrawingStudio·QuickSketch·공동작화 세션 |
| 절차·벡터·문서 | 20 | Vector/Template/Publishing Surface |
| 페인팅·애니메이션 | 25 | PaintStudio·Pixel·AnimationDesk |
| 포즈·연습 | 15 | PoseStage·PracticeLab |

## 2.1 제품별 상세 레지스트리 사용법

동봉 CSV에서 각 제품은 다음 관점으로 정리되어 있다.

- **핵심강점:** 해당 제품이 사용자 시간을 줄이는 방식
- **ToonStudio 반영기능:** 그대로 복제하지 않고 공통 모듈로 바꾼 결과
- **권장엔진조합:** 실제 품질·성능을 낼 수 있는 엔진 배치
- **채택방식:** 직접 채택, 격리 어댑터, UX 참고, 클린룸 중 하나
- **증거수준:** 기능 주장에 대한 신뢰도

장기 꼬리 서비스는 기능 탐색 폭을 늘리기 위한 것이며, 모두 핵심 의존성으로 넣지 않는다.

# 3. 경쟁 제품에서 추출한 최상위 UX 원칙

## 3.1 0초 진입과 점진적 전문화

첫 화면에는 다음 세 가지 행동만 강조한다.

```text
[바로 그리기]  계정 없이 로컬 임시 문서
[파일 열기]    PSD·이미지·PDF·SVG·프로젝트
[프로젝트 만들기] 스토리·웹툰·일러스트·슬라이드·3D 템플릿
```

Kleki·Excalidraw·Draw.Chat처럼 진입 장벽을 낮추되, 작업이 커지면 “정식 프로젝트로 승격”시킨다. 임시 문서도 OPFS 저널을 사용하며, 로그인은 저장 안전성과 협업을 확장하는 선택이지 첫 획의 전제 조건이 아니다.

## 3.2 문맥형 UI와 레이어↔노드 이중 표현

Graphite가 보여주는 핵심은 레이어 패널과 노드 그래프가 서로 다른 문서를 편집하는 것이 아니라 같은 절차 구조를 두 수준으로 보여준다는 점이다.

```text
초보자: 도구·레이어·속성
전문가: BrushGraph·EffectGraph·ProceduralGraph
개발자: Plugin/Automation Graph
```

캔버스에서 브러시를 바꾸면 노드 파라미터가 갱신되고, 노드에서 값을 바꾸면 캔버스 도구의 속성도 갱신된다. “고급 모드로 들어가면 이전 편집이 깨지는 문제”를 없앤다.

## 3.3 실수 방지형 Review UX

SyncSketch 계열처럼 검토 모드의 기본 도구를 `Move`로 둔다. 주석을 그리려면 명시적으로 펜을 선택하며, 작업 원본과 검토 주석은 서로 다른 문서 브랜치다.

- 프레임·시간 범위 댓글
- 레이저 포인터와 영구 주석 분리
- 주석 복사·프레임 오프셋
- 버전 겹치기·깜빡이기·차이 보기
- 승인·수정 요청·조건부 승인
- 고객은 원본 편집 권한 없이 검토 링크만 사용

## 3.4 레퍼런스를 주변 도구가 아닌 작업 코어로

PureRef·Milanote·Eagle·Are.na의 강점을 결합한다.

- 항상 위·클릭 통과·반투명 트레이싱
- 이미지·영상·GIF·PDF·오디오·웹 링크 혼합
- 그룹·계층·노트·체크리스트·색상·카메라 태그
- 출처 URL·작가·라이선스·수집 날짜 자동 기록
- 중복·유사 이미지·색상 검색
- 참조 이미지를 잘라 브러시 팁·팔레트·3D 장면으로 보내기

## 3.5 도움말은 읽는 문서가 아니라 실행 가능한 그래프

상태 바의 입력 힌트, 영상 툴팁, 작업 레시피를 결합한다.

```text
HelpGraph(CommandID)
→ 현재 도구·선택·장치·브라우저 상태 분석
→ 10초 미리보기 또는 단계별 예제
→ 현재 문서의 복제 브랜치에서 명령 실행
→ 사용자가 승인하면 실제 문서에 적용
```

# 4. 최종 제품 데이터 모델: `CreatorProjectGraph`

```text
CreatorProjectGraph
├─ IdentityGraph
│  ├─ Character / Costume / Expression / Pose
│  ├─ Location / Prop / Material
│  └─ Brand / Style / Palette
├─ ReferenceGraph
│  ├─ Source / License / Creator / URL
│  ├─ Image / Video / Audio / PDF / Note
│  └─ Tag / Group / Similarity / Color
├─ StoryGraph
│  ├─ Series / Episode / Scene / Beat
│  ├─ Dialogue / Action / Narration
│  └─ Continuity / Timeline / Relationship
├─ VisualGraph
│  ├─ Surface / Artboard / Panel / Slide / Frame
│  ├─ Layer / Object / Stroke / Text / Balloon
│  └─ Effect / Mask / Adjustment / Material
├─ SceneGraph3D
│  ├─ Camera / Light / VRM / Mesh / Room
│  ├─ Constraint / Physics / Animation
│  └─ RenderPass / 2DLinkedLayer
├─ ProductionGraph
│  ├─ Task / Assignee / Status / Deadline
│  ├─ Version / Branch / Review / Approval
│  └─ PublishTarget / Localization / Audit
├─ AssetGraph
│  ├─ ContentHash / Version / Variant
│  ├─ Rights / Attribution / CommercialUse
│  └─ Proxy / Thumbnail / LOD
└─ AutomationGraph
   ├─ Template / Variable / DataBinding
   ├─ Trigger / Action / Condition
   └─ Plugin / Model / ExportRecipe
```

외부 엔진 객체는 저장 원본이 아니다. `SkPath`, `vello::Scene`, `PIXI.Container`, `THREE.Object3D`, `Y.Map`은 모두 재생성 가능한 캐시·어댑터다. 저장 원본은 공통 IR과 안정 ID다.

## 4.1 핵심 공통 IR

```text
PointerSampleIR
StrokeIR
BrushProgramIR
ShapeIR
TextIR
LayoutIR
EffectGraphIR
TimelineIR
InteractionIR
StoryIR
Scene3DIR
PhysicsBakeIR
ReviewIR
AssetIR
RightsIR
ExportIR
```

## 4.2 품질 손실을 데이터로 기록

```ts
interface QualityDebt {
  objectId: string;
  target: 'PSD' | 'SVG' | 'PPTX' | 'PDF' | 'WEBTOON' | 'VIDEO';
  reason: 'unsupported-effect' | 'font-substitution' | 'color-conversion' |
          'rasterized-vector' | 'flattened-3d' | 'missing-profile';
  severity: 'info' | 'visible' | 'blocking';
  previewDiff?: number;
  suggestedFixes: string[];
}
```

호환성 때문에 내부 품질을 낮추지 않고, 내보낼 때 어떤 의미가 손실되는지 알려준다.

# 5. 작업면 아키텍처와 UI 구성

## 5.1 12개 작업면

| 작업면 | 기본 UI | 숨기는 복잡성 | 한 번에 노출할 핵심 |
|---|---|---|---|
| Quick Sketch | 캔버스+브러시 HUD | 노드·제작 관리·3D | 브러시, 색, 지우개, Undo, 저장 |
| Paint Studio | 레이어+브러시+색상 | 스토리·데이터 | 자연매체, 혼색, 필터, 레이어 |
| Comic Studio | 컷+말풍선+톤+3D | CAD·데이터 차트 | 컷, 대사, 참조 레이어, 출력 규격 |
| Vector Design | 레이어+속성+노드 선택 | 자연매체 | 경로, Appearance, Auto Layout |
| Photo Edit | 레이어+선택+EffectGraph | 스토리·애니매틱 | 마스크, 보정, 리터칭 |
| Reference Desk | 무한 보드+자산 패널 | 브러시 고급 설정 | 수집, 정리, 오버레이, 출처 |
| Practice Lab | 참조+타이머+분석 | 제작 관리 | 세션, 선·필압 피드백, 기록 |
| Story Room | 문서+카드+타임라인 | GPU 설정 | 스크립트, 장면, 캐릭터, 세계관 |
| Pose/Scene | 3D 뷰+포즈+카메라 | PSD 호환 | 포즈, 조명, 카메라, 보조 패스 |
| Animation Desk | 캔버스+타임라인+오디오 | 출판 DTP | 키·프레임·리그·오니언 스킨 |
| Review Theater | 미디어+주석+댓글 | 원본 편집 도구 | 비교, 댓글, 승인, 발표 |
| Publish Center | 미리보기+프리플라이트 | 브러시 | 타깃, 손실 보고, 패키지, 업로드 |

## 5.2 공통 화면 뼈대

```text
┌───────────────────────────────────────────────────────────────┐
│ App Bar · Project · Workspace · Save/Sync · Share · Command  │
├────────┬─────────────────────────────────────┬────────────────┤
│ Tools  │                                     │ Context Panel  │
│ +Quick │          Main Surface               │ Properties     │
│ Access │                                     │ Layers/Assets  │
├────────┴─────────────────────────────────────┴────────────────┤
│ Context Hints · Timeline/Pages · Performance · Recovery       │
└───────────────────────────────────────────────────────────────┘
```

### 캔버스 주변 UI 우선순위

1. 펜 끝 근처의 작은 HUD: 크기·불투명도·색상·Undo
2. 도구별 상단 Control Bar: 현재 도구에만 필요한 값
3. 오른쪽 Context Panel: 상세 편집
4. Command Palette: 숨겨진 모든 명령과 경쟁 제품 용어 검색
5. 노드 그래프: 전문가가 요청할 때만 오버레이

## 5.3 입력 장치별 자동 전환

| 장치 | UI 변경 |
|---|---|
| 마우스+키보드 | 메뉴·단축키·정밀 Inspector 강화 |
| 펜 디스플레이 | 큰 터치 타깃·방사 HUD·키보드 없는 조작 |
| 태블릿 | 양손 제스처·하단 도구·가변 패널 |
| 휴대폰 | 한손 모드·세로 Quick Bar·패널 full-sheet |
| 트랙패드 | 부드러운 pan/zoom/rotate·제스처 충돌 방지 |
| 저사양 | 애니메이션 최소화·proxy·필터 LOD |

## 5.4 UI 기술 배치

```text
React 19 + TypeScript       앱 셸·패널·명령
React Aria + Radix          접근성 있는 메뉴·대화상자·목록
Floating UI                 펜 HUD·툴팁·팝오버
XState                      도구·제스처·검토·출고 상태 머신
Zustand/Jotai               저주파 UI 상태
TanStack Virtual            레이어·자산·프리셋 대규모 목록
FlexLayout adapter          도킹·분할·멀티모니터 프로필
Comlink                     Worker RPC
ICU4X/i18next               국제화
```

# 6. 최종 멀티엔진 품질·성능 아키텍처

```text
Input Plane
  Pointer Events L3 → Shared Ring → Stabilizer/Prediction

Semantic Plane
  CreatorProjectGraph → CommandBus → DependencyGraph

Compile Plane
  StrokeCompiler / EffectCompiler / LayoutCompiler / SceneCompiler
  → RenderIslandCompiler → QualityOrchestrator

Execution Plane
  Vello | CanvasKit | Custom WebGPU | PixiJS/WebGL2 | CPU
  Hokusai/libmypaint | OpenCV/vips | Three.js | Physics

Persistence Plane
  OPFS chunks + SQLite metadata + CRDT + Review/Publish services
```

## 6.1 엔진 역할의 최종 경계

| 영역 | 주력 | 보조·폴백 | 선택 이유 |
|---|---|---|---|
| 대량 동적 벡터 | Vello | CanvasKit·Vello CPU | 많은 path와 편집 오버레이 |
| 고급 Path/Text/Effect | CanvasKit | Vello·resvg | Skia PathEffect, Paragraph, SkSL, ImageFilter |
| 최고급 mesh 잉킹 | Google Ink WASM | Perfect Freehand/Lyon | 예측된 mesh stroke와 brush behavior |
| 래스터 브러시 | Custom WebGPU sparse tiles | PixiJS/WebGL2·CPU | 큰 캔버스·dab·smudge 최적화 |
| 자연매체 dynamics | Hokusai/libmypaint | 자체 brush simulator | `.myb`, smudge, pigment 기반 |
| 물·안료·임파스토 | Custom WebGPU compute | 저해상도 WebGL/WASM | 활성 타일 유체·높이장 |
| 절차 그래픽 | 자체 ProceduralGraph, Graphite 참고 | CanvasKit/Vello | 도구 UI와 노드의 동일 문서 표현 |
| SVG·Lottie | ThorVG/resvg/Velato/Skottie | CanvasKit | 경량 asset·애니메이션 |
| 이미지 분석 | OpenCV.js | WGSL·Photon | 선택·형태학·lineart·inpaint |
| 대형 이미지 | wasm-vips | image-rs/Photon | streaming·리사이즈·타일 pyramid |
| 문서 조판 | HarfBuzz+ICU4X+CanvasKit | Canvas Editor adapter | CJK·RTL·페이지·표 |
| 무한 보드 | LeaferJS/js-draw/custom viewport | PixiJS | 상호작용 scene tree와 SVG 주석 |
| 3D | Three.js | Babylon.js | 생태계·VRM·custom pass |
| 장면 강체 | Rapier | Box2D-WASM/Jolt | 기본 성능·WASM·결정성 |
| 브러시모·리본 | 자체 Rust/WASM XPBD | Verlet 참고 | 미세 제약을 가볍고 결정적으로 제어 |
| 정밀 관절/접촉 | MuJoCo WASM 연구 모듈 | Jolt/Rapier | 정밀 pose/contact 실험 |
| 협업 | Loro 또는 Yjs 중 하나 | Automerge | 트리 이동·history 또는 생태계 |
| 저장 | OPFS + SQLite WASM | IndexedDB | 대형 binary와 metadata 분리 |

## 6.2 `QualityOrchestrator`

엔진을 브라우저 이름만 보고 선택하지 않는다.

```text
score = visual_quality
      + interaction_latency
      + determinism
      + memory_fit
      + backend_maturity
      + export_fidelity
      - texture_copy_cost
      - warmup_cost
      - quality_debt
```

### 입력 신호

- GPU adapter, max texture, storage buffer, timestamp query
- WebGL2 extension, WASM SIMD/threads, SharedArrayBuffer
- 문서 path·glyph·tile·filter·3D draw call 수
- 현재 펜 입력 빈도와 화면 refresh rate
- OPFS quota·메모리 압박·배터리 상태
- 내보내기 타깃과 요구 색공간

### 결과

- 렌더 아일랜드 엔진
- preview/export quality level
- tile size·mip·cache residency
- filter pass fusion 계획
- fallback 사유와 사용자 메시지

## 6.3 `GPUInteropBroker`

```text
L4 동일 GPUDevice TextureView 공유
L3 ExternalTexture / shared render target
L2 ImageBitmap·VideoFrame 전달
L1 SharedArrayBuffer tile
L0 CPU readback + upload — 최후 수단
```

객체마다 엔진을 바꾸지 않고 큰 아일랜드 단위로 합성한다. CPU readback이 필요한 효과는 정지 시점·내보내기·저해상도 preview로 제한한다.

# 7. 브러시 시스템 V4: 품질 중심 18개 백엔드

## 7.1 공통 입력 파이프라인

```text
pointerrawupdate / coalesced / predicted events
→ device calibration
→ sample de-jitter and resampling
→ corner/endpoint aware stabilizer
→ pressure·tilt·twist·velocity dynamics
→ BrushProgramIR
→ backend route
→ preview stroke
→ asynchronous final refinement
→ Vello/CanvasKit/WebGPU composition
```

## 7.2 백엔드와 담당 브러시

| # | 백엔드 | 담당 |
|---:|---|---|
| 1 | Google Ink Mesh | 최고급 G펜·붓펜·서명형 잉킹 |
| 2 | Vello Analytic | 모노라인·도형·수천 개 벡터 선 |
| 3 | Perfect Freehand/Lyon | 경량 가변 폭·폴백 |
| 4 | CanvasKit PathEffect/SkSL | dash·corner·discrete·특수 외곽·Shader brush |
| 5 | WebGPU Dab | 연필·마커·에어브러시·텍스처·듀얼팁 |
| 6 | Hokusai | `.myb` 자연매체·스머지·혼색 |
| 7 | libmypaint | 호환 기준·프리셋 비교 |
| 8 | Wet Media Compute | 수채·수묵·번짐·건조·안료 침전 |
| 9 | Impasto Height | 유화·아크릴·팔레트나이프·노멀 |
| 10 | XPBD Nib/Bristle | 펜촉·평붓·브러시모 갈라짐 |
| 11 | Particle/SDF | 비·눈·불꽃·꽃잎·잉크튐·먼지 |
| 12 | Strand/Ribbon | 머리카락·털·로프·체인·리본 |
| 13 | Pixel/Indexed | 픽셀·디더·타일·스프라이트 |
| 14 | Clone/Heal | 복제·힐링·패치·콘텐츠 이동 |
| 15 | Filter Brush | 블러·샤픈·Dodge/Burn·Liquify |
| 16 | Procedural Stamp | 식생·건물·장식·지도·데이터 스탬프 |
| 17 | 3D Surface | UV·triplanar·depth-aware·ID-aware paint |
| 18 | Text/Glyph | 효과음·문자·수식·아이콘·가변 폰트 브러시 |

## 7.3 대표 최상위 조합

| 브러시 | 입력·형상 | 재질·물리 | 출력 |
|---|---|---|---|
| 만화 G펜 | Google Ink Stroke Modeler + mesh | 탄성 nib·잉크 잔량 | WebGPU mesh + Vello 편집 proxy |
| 매핑펜 | Rust low-latency stabilizer + Lyon | 미세 pressure curve | Vello/CanvasKit |
| 캘리그래피 | tilt/twist + nib polygon | torsion·friction | Vello fill path |
| 연필 | WebGPU dab + FastNoiseLite | paper height·grain | sparse raster tiles |
| 색연필 | Hokusai dynamics + tip texture | spectral pickup/deposit | Hokusai tile→Vello |
| 마커 | flow accumulation | edge overlap·solvent | WebGPU blend |
| 수채 | Hokusai injection | WebGPU water/pigment/absorption/drying | external texture→Vello |
| 수묵 | XPBD bristle | low-res velocity + pigment settling | WebGPU wet tile |
| 유화 | bristle contact | viscosity·height·pickup/deposit | color+height+normal tiles |
| 드라이브러시 | bristle contacts | paper peaks·reservoir depletion | sparse dab |
| 집중선 | procedural ray graph | jitter·perspective | Vello |
| 식생 | Poisson/blue-noise placement | wind field·depth | Vello stamp or GPU particles |
| 머리카락 | guide stroke | XPBD strands·collision | vector bake or raster |
| 3D 잉크 | raycast/UV | depth/normal/object ID | texture layers + linked 2D stroke |

## 7.4 `Brush DNA`

브러시는 이름이 아니라 그래프와 버전으로 저장한다.

```text
Input.Pressure → Curve → Radius
Input.Velocity → Inverse → Flow
Input.Tilt → NibAngle
Paper.Height → ContactMask
Bristle.Contact → DabEmitter
Pigment.Pickup → SpectralMix → Deposit
Wetness → Diffusion → EdgeDeposit
```

서로 다른 엔진의 강점을 한 프리셋에서 조합하되, 실행 경계는 명시한다. 예를 들어 Hokusai의 dynamics가 WebGPU wet-media field에 물·안료를 주입하고, 최종 타일은 Vello 장면에 합성된다.

# 8. 필터·효과·분석 아키텍처 V4

## 8.1 `EffectGraphCompiler`

```text
EffectGraphIR
→ type/color-space validation
→ bounds/halo analysis
→ time dependency
→ mask propagation
→ constant folding
→ pass fusion
→ tile schedule
→ backend selection
→ preview/export variants
```

## 8.2 기능군별 최적 배치

| 기능군 | 주력 | 이유 |
|---|---|---|
| Exposure/Contrast/HSL/Matrix | WGSL 또는 CanvasKit SkSL | pass fusion이 쉬움 |
| Curves/LUT/Selective Color | WGSL + Color.js/Culori | 색공간 제어와 실시간성 |
| Blur/Shadow/Glow | CanvasKit ImageFilter·WGSL pyramid | 성숙한 필터와 큰 반경 최적화 |
| Bilateral/Guided/Surface Blur | WebGPU compute | custom neighborhood kernel |
| Sharpen/Deconvolution | WebGPU/FFT WASM | 고품질 경계·주파수 처리 |
| Morphology/Distance/Contour | OpenCV.js·WGSL | 선택·라인·마스크 분석 |
| Liquify/Mesh Warp | WebGPU vector field | 연속 상호작용 |
| Perspective/Lens | WGSL + geometry solver | 고정밀 보정 |
| Screen tone/Halftone | procedural WGSL + Vello mask | 해상도 독립 패턴 |
| Moiré 검사 | FFT WASM + GPU heatmap | 출력 전 위험 시각화 |
| Photo→Lineart | OpenCV + depth/normal optional | Canny/DoG/contour 결합 |
| Inpaint/Heal | OpenCV + optional ONNX | 작은 영역과 고급 모델 분리 |
| Large resize/format | wasm-vips | 스트리밍·메모리 효율 |
| ICC/soft proof | LittleCMS/skcms | 정확한 프로파일 변환 |
| Depth/Normal/ID effect | Three.js pass + WebGPU | 3D 정보 기반 합성 |
| Video effect | WebCodecs + WebGPU | frame zero-copy 지향 |
| AI helper | ONNX Runtime Web | backend capability 기반 |

## 8.3 새롭게 추가할 분석·검수 필터

- 선화 끊김·미세 gap heatmap
- 반복 무늬·복제 흔적 탐지
- 모아레·망점 충돌 예측
- 색각 이상·저대비·말풍선 가독성 시뮬레이션
- 컷 간 캐릭터 색·의상·소품 연속성 비교
- 좌우 반전·손잡이·상처 위치 불일치 탐지
- 3D 카메라와 2D 퍼스 일치도
- 선 굵기·텍스트 크기 플랫폼 최소값 검사
- 인쇄 bleed·trim·safe area·overprint preview
- 압축 후 banding·halo·block artifact 예측
- AI 생성·외부 자산 provenance 누락 경고

# 9. 보조 서비스에서 가져온 10개 전용 모듈

## 9.1 `ReferenceDesk`

- 브라우저 확장·클립보드·드래그·URL로 수집
- 원본 출처·작가·라이선스·수집 날짜 자동 기록
- 항상 위·반투명·클릭 통과·트레이싱 오버레이
- 그룹·계층·스택·슬라이드쇼·GIF 프레임 추출
- 로컬 색상·유사 이미지·OCR·태그 검색
- 이미지의 팔레트·수평선·소실점·카메라 FOV 후보 추출
- 참조를 캔버스 옆에 두되 출력에는 포함하지 않는 `NonExportLayer`

## 9.2 `PracticeLab`

- 30초·1분·2분·5분 포즈 세션
- 워밍업→제스처→구조→긴 포즈 class mode
- 선 속도·멈춤·되돌림·압력 범위·곡률 heatmap
- 원본 선과 안정화 결과 비교
- 개인별 장치 교정과 brush feel profile
- 정답 판정 대신 “선의 망설임·관찰 시간·비율 변화” 피드백
- 연습 결과를 비공개로 저장하고 원할 때만 공유

## 9.3 `PaletteLab`

- 조화 규칙·OKLCH·gamut·색각 시뮬레이션
- 이미지·장면·영화 스틸에서 팔레트·그라데이션 추출
- 웹툰 에피소드 전체의 색 연속성 그래프
- 팔레트를 현재 컷·슬라이드·3D 재질에 즉시 시뮬레이션
- 안료 혼색과 화면 RGB 혼색을 명확히 구분

## 9.4 `StoryRoom`

- 스크립트 문단을 장면·비트·대사·행동으로 구조화
- 장면 카드·플롯라인·캐릭터 아크·세계관 문서
- 스크립트↔샷리스트↔스토리보드↔애니매틱 양방향 연결
- 사용자 정의 필드: 카메라·조명·사운드·감정·소품·연속성
- 대사 변경 시 말풍선과 자막을 영향 분석

## 9.5 `PoseStage`

- VRM/GLB/OBJ, 다인 포즈, IK/FK, 손·표정
- 카메라 FOV·렌즈·roll·saved slots
- key/fill/rim light와 그림자
- color/depth/normal/canny/OpenPose/object-ID 패스
- 2D 그림 위 카메라 매칭과 ground plane 추정
- 포즈 결과를 editable guide lines로 변환

## 9.6 `SceneBuilder`

- 2D 평면도와 치수→3D 룸
- 벽·문·창문·계단·가구·다층 구조
- 지도 stamp·terrain brush·road/river graph
- 등각·1/2/3점 투시 카메라
- 재사용 가능한 `SceneStamp`와 스타일 팩
- 3D line/depth/normal/ID 패스를 컷과 연결

## 9.7 `AssetVault`

- 이미지·브러시·폰트·3D·HDRI·재질·오디오·템플릿 통합
- 콘텐츠 해시·중복·유사도·색상·태그·스마트 폴더
- 썸네일·proxy·LOD·PBR 채널 자동 생성
- CC0/CC-BY/상용 조건을 `RightsGraph`로 기록
- 프로젝트 내 사용 자산과 최종 산출물의 BOM 생성

## 9.8 `ReviewTheater`

- 버전 stack, A/B, wipe, overlay, pixel diff
- 프레임·시간 범위·영역 댓글
- 펜·도형·레이저·tracing-paper·onion-skin 주석
- 승인 단계, 담당자, 마감, 감사 보고서
- 저해상도 proxy 검토 후 원본 좌표로 정확히 매핑

## 9.9 `PublishCenter`

- 웹툰 세로 슬라이스·파일 크기·색상·안전 영역 검사
- PSD/SVG/PDF/PPTX/PNG/JPEG/WebP/AVIF/MP4/HTML 패키지
- 포트폴리오·케이스 스터디·SNS 파생 이미지
- 번역 언어별 말풍선 overflow와 폰트 fallback 검사
- 품질 손실·라이선스 누락·모델 provenance를 blocking issue로 표시

## 9.10 `AutomationLab`

- 데이터 변수 기반 템플릿·대량 생성
- 노드 그래프, 조건, 반복, 파일 감시, webhook
- 브러시·필터·내보내기 플러그인
- QuickJS expression과 Extism WASM sandbox
- 모든 자동 작업을 취소·재생 가능한 Command로 기록

# 10. 경쟁사와 차별되는 구현 가능한 창의 기능

## 10.1 레퍼런스·학습

- 출처와 라이선스가 유지되는 드래그 앤 드롭 레퍼런스
- 참조 이미지 클릭 통과 트레이싱 오버레이
- 한 이미지에서 팔레트·소실점·렌즈·조명 방향 동시 추출
- 레퍼런스의 GIF·영상에서 좋은 프레임을 바로 자산화
- 유사 이미지 중복 묶음과 대표본 선택
- 저작권 불명확 자산을 출고 전 자동 차단
- 타이머 제스처 연습과 선 자신감 heatmap
- 사용자 장치별 필압 범위와 dead-zone 자동 교정
- 원시 입력·보정 입력·최종 획의 삼중 비교
- 연습 세션을 개인 커리큘럼으로 자동 구성

## 10.2 브러시·재질

- Brush DNA 교배와 A/B 블라인드 비교
- 다른 엔진의 특성을 연결하는 Cross-Engine Brush Graph
- 브러시모별 색·물·안료 잔량
- 종이의 높이·흡수·섬유 방향에 따른 접촉
- 작업 중 브러시 세척·오염·재충전
- 3D 장면 바람장을 공유하는 털·입자 브러시
- 선택 영역 SDF와 충돌하는 잉크 튐
- 그린 뒤 압력·안정화·펜촉을 재적용하는 비파괴 획
- 색+높이+거칠기+노멀을 동시에 그리는 재질 브러시
- 저사양에서는 동일 모양을 유지하며 물리 단계만 단순화

## 10.3 스토리·연속성

- 스크립트에서 장면·샷·컷·대사 초안 자동 생성
- 대사 변경이 말풍선·자막·음성에 미치는 영향 그래프
- 캐릭터 의상·상처·소품의 컷 간 연속성 검사
- 시간대·날씨·조명·팔레트 연속성 검사
- 독서 방향과 말풍선 순서 시뮬레이션
- 컷 높이·여백·시선 이동 기반 스크롤 리듬 분석
- 장면마다 카메라 축·180도 규칙·시선 일치 검사
- 세계관 지도·타임라인·관계도를 원고와 연결
- 한 캐릭터 컴포넌트를 웹툰·슬라이드·애니메이션에서 공유
- 스토리 Branch와 작화 Branch를 별도 병합

## 10.4 3D·물리

- 2D 평면도를 3D 룸으로 변환하고 다시 편집 가능한 치수로 유지
- 3D 외곽선·접힘선·재질 경계·그림자 경계를 별도 벡터 그룹으로 생성
- 3D object-ID를 2D 채우기 참조 영역으로 사용
- 카메라 변경 후 기존 2D 선화의 영향 영역만 재생성
- 천·머리카락·액세서리 물리를 선화 가이드로 bake
- 충돌 지점에서 효과선·먼지·파편 브러시 자동 생성
- 캐릭터 발 접지와 손-소품 접촉 자동 보정
- 동일 장면의 물리 seed별 연출 후보 보드
- 실내 자산의 충돌 없는 자동 배치와 스타일 팩
- 장면의 depth/normal을 필터·안개·조명에 재사용

## 10.5 검토·버전

- 의미 객체 단위 diff: 대사·포즈·색·레이어·필터
- 벡터와 래스터의 시각 diff를 함께 보여주는 compare
- 프레임·시간 범위에 붙는 paint-over 주석
- 검토 주석을 다음 버전에 좌표 변환해 복사
- Branch별 승인과 부분 병합
- 고객용 링크에서 원본 자산 다운로드 권한 분리
- 댓글에서 수정 작업을 Command로 생성
- 승인 이력과 출고 파일 해시를 감사 보고서로 저장
- Vello·CanvasKit·CPU 렌더 결과의 시각 동등성 검사
- 창작 재생 디버거로 언제 품질이 달라졌는지 추적

## 10.6 웹 UI·신뢰

- 가입 없이 첫 획 후 프로젝트 승격
- 저장 위치·마지막 체크포인트·복구 가능 상태를 항상 표시
- WebGPU 실패 시 문서 손실 없는 Safe Mode 전환
- 무거운 필터 적용 전 VRAM·시간·품질 비용 표시
- 현재 장치에서 가능한 최대 브러시 크기와 레이어 수 안내
- 도구 아이콘 hover 영상과 현재 문서에서 실행 가능한 예제
- Photoshop·Clip Studio 용어로도 검색되는 Command Palette
- 펜 디스플레이 무키보드 모드와 모바일 한손 모드
- 캔버스 근처 HUD는 작업 중 투명해지고 펜을 떼면 복원
- 모든 장시간 작업은 취소·일시중지·저품질 preview 제공

## 10.7 출판·현지화

- 웹툰·슬라이드·숏폼·포스터·웹 인터랙션의 의미 보존 변환
- 플랫폼별 안전영역·최소 글자·파일 크기 프리플라이트
- 번역 언어별 말풍선 자동 재레이아웃과 오버플로 비교
- 폰트 라이선스·subset·대체 결과 보고
- 출고물마다 포함 자산과 AI 모델의 Rights BOM
- 색공간·ICC·HDR/SDR 변환 전후 preview
- PSD 호환성 보고서와 시각 차이 heatmap
- 에피소드·언어·플랫폼 파생 파일을 한 Publish Recipe로 재생성
- 독자용 접근성 대체 텍스트·읽기 순서 패키지
- 작품 페이지·과정 GIF·case study 자동 생성

## 10.8 자동화·AI

- AI 결과를 마스크·프롬프트·모델 버전이 있는 비파괴 노드로 저장
- 로컬 WebGPU/WebNN/WASM과 서버 실행을 품질·개인정보로 선택
- 선택·깊이·포즈·OCR·번역·업스케일을 교체 가능한 모델 슬롯으로 제공
- AI가 문서 객체를 직접 바꾸지 않고 제안 Branch를 생성
- 데이터 행마다 포스터·카드·컷을 대량 생성
- 제작 상태 변화가 리뷰·출고·백업 자동화를 트리거
- 자연어를 CommandGraph로 변환하되 실행 전 변경 미리보기
- 플러그인의 파일·네트워크·GPU 권한을 사용자에게 표시
- 성능 한도를 넘는 플러그인을 자동 중단
- AI·플러그인 결과를 결정적 bake로 협업자에게 전달

> 위 목록은 총 **80개**의 V4 차별화 기능이며, 기존 문서의 차별화 기능과 중복되지 않도록 “전 과정 연결·품질·복구·의미 보존” 관점으로 확장했다.

# 11. 물리엔진과 시뮬레이션 최종 배치

| 요구 | 엔진 | 판단 |
|---|---|---|
| 3D 기본 강체·관절·충돌 | Rapier | 기본 탑재 |
| 2D 말풍선·스티커·소품 | Box2D-WASM | 가볍고 성숙한 선택 모듈 |
| 빠른 TS 2D 프로토타입 | Planck.js·p2-es | 개발·테스트용 |
| 천·소프트바디·부력·고급 관절 | JoltPhysics.js | 필요 시 동적 로드 |
| 정밀 인체·기계 접촉 | MuJoCo WASM | Pose/Physics Lab 연구 기능 |
| PhysX 호환·차량·고급 캐릭터 | PhysX WebIDL | 엔터프라이즈 실험, 라이선스·번들 주의 |
| 가벼운 3D 폴백 | cannon-es | PoC·교육용 |
| 브러시모·펜촉·리본 | 자체 Rust/WASM XPBD | 범용 물리 대신 직접 최적화 |
| 수채·수묵·유화 | WebGPU fluid/pigment | 강체엔진 사용 금지 |
| 입자 효과 | WebGPU particle + SDF | 대량 병렬 처리 |

### 물리 데이터 계약

```text
PhysicsInput  = pointer/scene state + preset version + seed
PhysicsState  = Worker/GPU 내부 transient data
PhysicsBake   = final vector paths / tile patches / transforms / keys
Collaboration = Input command + Bake, not every simulation frame
```

물리엔진을 여러 개 기본 번들에 넣지 않는다. 문서에서 실제 필요한 기능을 분석해 동적으로 로드하며, 동일 영역에 두 엔진을 동시에 사용하지 않는다.

# 12. 성능·메모리·지연 목표

## 12.1 체감 지연 계약

| 작업 | 목표 |
|---|---|
| 원시 입력 수집 | 이벤트 발생 즉시 ring buffer 기록 |
| 화면상 preview stroke | 가능한 경우 다음 refresh 이전 |
| preview→정제 결과 교체 | 시각적으로 튀지 않는 cross-fade/geometry morph |
| 도구 전환 | 이미 로드된 도구는 즉시 |
| 큰 필터 | 저해상도 preview 후 타일 정제 |
| Undo | 화면 내 영향 영역 우선 복원 |
| 자동 저장 | UI thread 차단 금지 |

고정된 밀리초 숫자는 디스플레이·브라우저·장치에 따라 달라지므로 제품은 실제 `pointer-to-present`를 측정해 profile을 선택한다.

## 12.2 Worker Mesh

```text
UI Thread           React·접근성·Command dispatch
Input Worker        raw/coalesced samples·calibration
Brush Worker        Rust/WASM stabilizer·StrokeIR·XPBD
Render Worker       Vello·WebGPU·Pixi fallback·FrameGraph
Image Worker        OpenCV·Photon·vips·codec
Text Worker         shaping·layout·font subset
3D Worker           Three/Babylon·Rapier/Jolt·geometry
Media Worker        WebCodecs·Mediabunny·waveform
Storage Worker      OPFS chunks·SQLite journal·checkpoint
Collab Worker       Loro/Yjs·presence·binary transfer
AI Worker           ONNX/WebNN/WebGPU model runtime
```

## 12.3 대형 문서 정책

- 희소 256/512px 타일과 mip pyramid
- 화면 안·활성 stroke 주변 타일만 GPU 상주
- 젖은 자연매체 타일만 시뮬레이션하고 건조 시 bake
- 벡터 장면을 공간 index로 shard
- 텍스트 glyph·brush tip·SVG asset atlas
- 레이어별 alpha summary와 empty tile 제거
- GPU memory pressure 시 proxy quality만 낮추고 문서 의미는 유지
- checkpoint는 Command Journal + tile diff + content-addressed chunks
- 같은 자산·필터 결과를 프로젝트 전역 content hash로 재사용

## 12.4 성능을 UI에 보이는 방식

- 브러시 크기 슬라이더에 현재 장치의 안전 범위 표시
- 무거운 노드에 live/paused/baked 상태 배지
- 필터 적용 전 메모리·복사·품질 비용 요약
- 프레임 저하 시 원인 엔진·레이어·노드 표시
- Lite Mode 전환 전 무엇이 단순화되는지 미리보기
- 내보내기는 편집과 분리된 worker/job으로 실행

# 13. 저장·협업·복구·보안

## 13.1 저장 구조

```text
OPFS
├─ content-addressed raster/vector chunks
├─ brush tips·paper textures·3D/audio assets
├─ checkpoints·crash recovery
└─ export cache

SQLite WASM
├─ project metadata·stable IDs
├─ command journal index
├─ asset tags·rights·search
├─ version/branch/review graph
└─ telemetry stored locally by default
```

## 13.2 협업 경계

```text
CRDT
  layer/object tree, text, vector objects, story, comments, status

Binary chunks
  raster tiles, PSD, GLB/VRM, audio/video, baked simulations

Presence
  cursor, viewport, active tool, temporary selection, laser pointer
```

래스터 픽셀과 물리 프레임을 CRDT에 넣지 않는다. CRDT는 한 프로젝트에서 Loro·Yjs·Automerge 중 하나만 선택한다.

## 13.3 보안

- 리뷰 링크와 편집 링크의 권한 분리
- 비공개 자산은 임베드 proxy와 만료 URL 사용
- 플러그인은 Extism/Worker/iframe sandbox와 permission manifest 사용
- 파일 parser·shader·AI 모델에 CPU/GPU/메모리/시간 한도
- 외부 URL import는 MIME·크기·리디렉션·추적 방지 검사
- 로컬 우선 모드에서는 원본이 서버에 전송되지 않음을 명확히 표시

# 14. 호환성 최종 원칙: 브라우저는 폭넓게 실행하고, 파일·확장자는 최대한 연결한다

## 14.1 서로 다른 두 종류의 호환성

| 축 | 의미 | 최종 정책 |
|---|---|---|
| **브라우저 실행 호환성** | 브라우저·OS·GPU·메모리·입력 장치가 달라도 작업 가능한가 | 기능 탐지, 다단계 렌더러, Worker/메인 스레드 폴백, OPFS/IndexedDB 폴백, WebCodecs/FFmpeg 폴백으로 최대화 |
| **파일·포맷 상호운용성** | 다른 창작 도구의 원본을 가져오고 다시 전달할 수 있는가 | 직접 파서·WASM 코덱·표준 변환·로컬 브리지·서버 브리지·원본 바이트 보존을 모두 사용해 최대화 |
| **내부 품질** | ToonStudio 내부에서 편집 가능한 정보와 최종 시각 품질 | 외부 포맷의 한계에 맞춰 낮추지 않음. 외부 포맷으로 나갈 때만 필요한 최소 범위를 선택적으로 bake |

따라서 다음 두 문장은 동시에 참이어야 한다.

```text
낮은 사양·제한된 브라우저에서도 문서를 열고 편집할 수 있다.
+ Photoshop·Clip Studio·Krita·Figma·PowerPoint·Blender 등에서 온 파일을 가능한 많이 받아들인다.
```

호환성을 이유로 전문 기능을 삭제하지 않는다. 브라우저가 약하면 **미리보기 품질·동시 계산량·GPU 상주량**을 낮추고, 문서 의미와 원본 자산은 유지한다. 대상 포맷이 기능을 표현하지 못하면 원본 ToonStudio 노드를 유지한 채 대상 포맷용 표현만 생성한다.

---

## 14.2 브라우저 호환성 계약

브라우저 이름을 기준으로 기능을 고정하지 않고 실제 API·GPU limits·코덱·저장소를 실행 시 측정한다.

```ts
interface RuntimeCapabilityProfile {
  input: {
    pointerEvents: boolean;
    pressure: boolean;
    tilt: boolean;
    twist: boolean;
    coalescedEvents: boolean;
    predictedEvents: boolean;
    pointerRawUpdate: boolean;
  };

  graphics: {
    webgpu: boolean;
    webgl2: boolean;
    offscreenCanvas: boolean;
    maxTextureDimension2D: number;
    maxStorageBufferBindingSize: number;
    preferredCanvasFormat?: string;
    knownGpuWorkarounds: string[];
  };

  compute: {
    wasm: boolean;
    wasmSimd: boolean;
    wasmThreads: boolean;
    sharedArrayBuffer: boolean;
    crossOriginIsolated: boolean;
    workerCount: number;
  };

  storage: {
    opfs: boolean;
    opfsSyncAccess: boolean;
    indexedDB: boolean;
    fileSystemAccessPicker: boolean;
    estimatedQuota: number;
    persisted: boolean;
  };

  media: {
    webCodecs: boolean;
    supportedDecoders: string[];
    supportedEncoders: string[];
  };
}
```

### 공식 API 기준에서 확인되는 핵심 차이

- WebGPU는 모던 Chromium 계열에서 강한 경로이지만 다른 브라우저에서는 부분 지원 또는 구현 차이가 남아 있으므로 필수 전제가 될 수 없다.
- OPFS는 브라우저 전반에 널리 제공되는 샌드박스 저장 기반이지만, 사용자가 임의의 로컬 폴더를 고르는 File System Access picker는 Firefox·Safari 계열에서 동일하게 제공되지 않는다.
- WebCodecs는 브라우저가 API를 제공하더라도 실제 코덱·프로파일·하드웨어 가속 지원이 기기마다 다르므로 `isConfigSupported()` 결과를 기준으로 결정해야 한다.
- SharedArrayBuffer와 WASM threads는 교차 출처 격리 헤더에 영향을 받으므로, 임베드·외부 리소스 정책 때문에 격리가 불가능한 배포에서도 단일 스레드 경로가 작동해야 한다.
- OffscreenCanvas와 Pointer Events는 폭넓게 쓸 수 있지만, 세부 입력 속성·Worker 컨텍스트·GPU 드라이버 오류를 런타임에서 검증한다.

### 지원 정책

```text
공식 지원
├─ Chromium 계열 데스크톱·Android의 현재 안정판과 이전 2개 주요판
├─ Firefox 데스크톱의 현재 안정판과 이전 2개 주요판
├─ Safari / iPadOS / iOS의 현재 주요판과 이전 주요판
├─ Samsung Internet 현재판과 이전 주요판
└─ Android WebView는 버전명이 아니라 capability probe로 등급 결정
```

구형 브라우저를 완전히 차단하기보다 `Safe Mode`로 열 수 있게 하되, 보안 업데이트가 끝난 브라우저에는 민감 파일·협업 기능을 제한할 수 있다.

---

## 14.3 브라우저별 실행 등급

| 등급 | 요구 능력 | 렌더·계산 경로 | 제공 범위 |
|---|---|---|---|
| **R4 Studio GPU** | WebGPU, Worker, OPFS, WASM SIMD, 가능하면 threads | Vello·CanvasKit GPU·Custom WebGPU·Three.js/Babylon WebGPU | 전체 브러시·실시간 자연매체·대형 필터·3D·영상 |
| **R3 Modern GPU** | WebGPU 또는 안정적 WebGL2, Worker, OPFS | Vello/CanvasKit/Pixi WebGL2 혼합, 유체·필터 축소 | 전체 편집, 자연매체 품질·파티클 수 자동 조정 |
| **R2 Compatible** | WebGL2, WASM, IndexedDB/OPFS | PixiJS·CanvasKit WebGL·WASM Worker | 벡터·래스터·필터·3D 기본, 고비용 시뮬레이션 비동기 |
| **R1 Safe** | Canvas2D 또는 CanvasKit software, Worker 선택 | CanvasKit software·Vello CPU·tiny-skia·서버 보조 | 문서 열기·기본 편집·검토·출고, 실시간 고급 효과 제한 |
| **R0 Viewer** | 최소 JS·이미지 표시 | 서버 렌더 프록시·타일 뷰어 | 읽기·댓글·승인·다운로드 |

R1/R2에서도 프로젝트 기능을 삭제하지 않는다. 고급 수채·임파스토·대형 3D는 proxy 타일 또는 비동기 bake로 처리하고, 강한 장치에서 다시 열면 원본 파라미터로 최고 품질을 재생성한다.

---

## 14.4 브라우저별 주요 폴백

### Chromium·Edge·ChromeOS·Android Chromium

- WebGPU·File System Access·WebCodecs를 우선 탐지한다.
- 사용자가 선택한 파일 핸들을 저장할 수 있을 때 “원본 위치에 저장”을 제공한다.
- GPU 드라이버 블랙리스트·저전력 GPU·Android thermal throttling에 따라 WebGL2 또는 품질 하향을 선택한다.

### Firefox

- File System Access picker가 없는 환경에서는 `<input type=file>`, drag/drop, clipboard, download, Web Share, OPFS 프로젝트를 결합한다.
- WebGPU 기능이 부족하거나 불안정하면 Vello Hybrid WebGL·CanvasKit WebGL·PixiJS를 사용한다.
- 동일한 문서를 유지하면서 저장 UX만 “브라우저 프로젝트 + 내보내기”로 바꾼다.

### Safari·iPadOS·iOS

- Pencil 입력·터치 제스처·화면 회전·메모리 압박·백그라운드 탭 중단을 별도 시험한다.
- OPFS/IndexedDB 저널과 짧은 체크포인트 주기로 탭 종료에 대비한다.
- 파일 앱·Share Sheet·드래그 앤 드롭·사진 라이브러리 입력을 통합한다.
- WebGPU·WebCodecs는 API 존재 여부가 아니라 실제 adapter·codec probe로 사용한다.

### Android WebView·인앱 브라우저

- WebGPU·스토리지 quota·파일 picker·다운로드 동작이 호스트 앱 설정에 따라 달라지므로 R0~R4를 매번 측정한다.
- 문제가 있으면 외부 정식 브라우저로 안전하게 넘기는 “Continue in Browser” 기능을 제공한다.

---

## 14.5 렌더러·스레드·저장 폴백 그래프

```text
Rendering
WebGPU
→ Vello / CanvasKit GPU / Custom WebGPU
→ WebGL2: CanvasKit / PixiJS / ThorVG
→ CPU: Vello CPU / CanvasKit software / tiny-skia
→ server tile proxy

Compute
WASM SIMD + Threads
→ WASM SIMD single-thread
→ plain WASM
→ JavaScript reference implementation
→ server job

Storage
File System Access handle
→ OPFS project + explicit export
→ IndexedDB chunks
→ memory-only temporary document + frequent download warning

Media
WebCodecs hardware path
→ WebCodecs software path
→ ffmpeg.wasm / codec WASM
→ private conversion worker/server
```

`QualityOrchestrator`는 단순히 기능을 켜고 끄는 것이 아니라 다음 비용을 비교한다.

```text
예상 pointer-to-present 지연
GPU·CPU 메모리
타일 업로드량
필터 halo 크기
WASM 복사량
배터리·발열
문서 재현 결정성
브라우저별 알려진 버그
```

---

## 14.6 브라우저 호환성 테스트 매트릭스

- 실제 Wacom·Huion·XP-Pen·Surface Pen·Apple Pencil·Samsung S Pen 입력
- pressure/tilt/twist/coalesced/raw 샘플 캡처와 손실률
- WebGPU adapter 생성 실패·device lost·shader compilation error
- WebGL context lost와 복구
- 4K·8K·세로 30,000px·수백 레이어 문서
- iPadOS 메모리 압박·앱 전환·화면 잠금·PWA 복귀
- Android 저사양·WebView·키보드·펜 버튼
- OPFS quota·private mode·storage eviction
- cross-origin isolation이 있는 배포와 없는 임베드 배포
- WebCodecs codec/profile/hardware acceleration 조합
- 브라우저 자동 업데이트 전후 시각·입력 회귀

브라우저별 실패는 `RuntimeCapabilityReport`에 기록하고, 파일 포맷 손실 보고서와 분리한다.

---

## 14.7 파일·포맷 상호운용성의 목표

ToonStudio는 사용자를 자체 포맷에 가두지 않는다. 다음 다섯 가지를 동시에 제공한다.

1. **최대한 많은 직접 import/export**
2. **다른 앱으로 돌아갔을 때 편집 구조가 남는 round-trip**
3. **직접 해석하지 못한 원본 데이터를 버리지 않는 opaque preservation**
4. **브라우저만으로 무거운 변환이 어려울 때 로컬·서버 브리지**
5. **실제 대상 앱에서 재개방한 결과를 자동 비교하는 호환성 QA**

내부 `.toonstudio` 문서는 최고 품질의 원본이며, 외부 파일은 열 때 다음 세 가지를 함께 저장한다.

```text
원본 바이트 또는 안전한 원본 참조
+ ToonStudio 의미 객체로 해석한 결과
+ 원본 앱과 비슷하게 보이는 렌더 fallback
```

---

## 14.8 `FormatGateway` 아키텍처

```text
File / URL / Clipboard / Cloud Provider
→ FormatSniffer
→ SecuritySandbox
→ StreamingDecoder
→ FormatValidator
→ SemanticImporter
→ OpaquePayloadPreserver
→ StudioDocument Normalizer
→ PreviewBuilder
→ FormatInteropReport
```

```text
StudioDocument
→ TargetFormatProfile
→ SemanticMapper
→ UnsupportedFeaturePlanner
→ SelectiveBake / Flatten / Approximation
→ StreamingEncoder
→ Validator
→ Target-App Reopen Test
→ Visual/Semantic Diff
→ FormatInteropReport
```

### 공통 인터페이스

```ts
interface FormatAdapter {
  id: string;
  extensions: string[];
  mimeTypes: string[];

  sniff(input: ByteSource): Promise<SniffResult>;
  inspect(input: ByteSource): Promise<FormatInspection>;
  import(input: ByteSource, options: ImportOptions): Promise<ImportResult>;
  export(document: StudioDocument, options: ExportOptions): Promise<ByteStream>;
  validate?(input: ByteSource): Promise<ValidationResult>;
  preserveOpaque?: boolean;
}
```

파서는 메인 UI 스레드에서 실행하지 않는다. 파일 크기 제한, 재귀 깊이, 압축 해제 비율, 이미지 dimensions, XML entity, ZIP bomb, shader/codec time limit를 sandbox에서 검사한다.

---

## 14.9 외부 포맷을 손실 없이 다시 넘기기 위한 `ForeignObjectEnvelope`

```ts
interface ForeignObjectEnvelope {
  sourceFormat: string;
  sourceVersion?: string;
  sourceApplication?: string;

  originalBlobRef: ContentHash;
  opaqueChunks: OpaqueChunkRef[];
  semanticMap: ForeignToStudioMap[];
  fallbackPreview: AssetRef;

  importWarnings: InteropIssue[];
  editPolicy: "native" | "hybrid" | "preserve-only" | "bridge";
}
```

예를 들어 PSD의 알 수 없는 additional layer information block, PPTX의 지원하지 않는 extension part, glTF extension, SVG namespace, Office relationship을 안전한 경우 그대로 보존한다. ToonStudio에서 수정하지 않은 영역은 재저장할 때 원본 청크를 되삽입해 round-trip 손실을 줄인다.

원본 바이트 보존은 보안 검증을 통과한 파일에만 적용하고, 실행성 매크로·스크립트·외부 링크는 격리한다.

---

## 14.10 상호운용성 지원 등급

| 등급 | 의미 | 예시 |
|---|---|---|
| **F0 Native** | ToonStudio 의미·시각·버전·자산을 완전 보존 | `.toonstudio` |
| **F1 Direct Round-trip** | 브라우저/WASM에서 구조를 직접 읽고 쓰며 높은 왕복 보존 | PNG, SVG, OpenRaster, glTF/GLB, VRM, Excalidraw JSON |
| **F2 Structured** | 레이어·객체·텍스트 등을 상당 부분 보존하나 일부 기능은 metadata/fallback 필요 | PSD/PSB, PDF, PPTX, Sketch, Aseprite |
| **F3 Visual/Semantic** | 시각 또는 핵심 의미를 보존하지만 완전 왕복은 아님 | AI PDF-compatible, EPS, Keynote, CDR, 일부 3D |
| **F4 Bridge** | 브라우저 직접 처리보다 LibreOffice·Blender·FFmpeg·OpenCascade 등의 로컬/서버 변환을 사용 | legacy Office, BLEND, C4D, STEP 복합 변환, ProRes |
| **F5 Preserve/Preview** | 닫힌 포맷을 원본 그대로 보관하고 preview·공식 export 경로를 안내 | CLIP/SUT, Procreate, Affinity, AEP, INDD 일부 |

F4/F5는 “미지원”이 아니라 사용자 이탈을 막기 위한 현실적인 호환 계층이다. 공식 SDK·문서·라이선스가 확보되면 F2/F1로 승격한다.

---

## 14.11 최우선 사용자 확보 포맷

### P0 — 출시 전 필수

```text
프로젝트·레이어: PSD, PSB, OpenRaster, SVG, PDF
일반 이미지: PNG, JPEG, WebP, AVIF, GIF, TIFF
브러시·색상: ABR, MYB, Krita/GIMP preset, ASE/ACO/GPL palette
디자인·문서: PPTX, ODP, Sketch, Excalidraw, draw.io
3D·아바타: glTF, GLB, VRM, OBJ, FBX import, STL
영상·오디오: MP4, WebM, GIF/APNG, WAV, MP3, AAC, FLAC, SRT/VTT
웹툰·출판: CBZ, EPUB 3, PDF/X profile, 플랫폼별 이미지 package
폰트: TTF, OTF, WOFF, WOFF2, variable/color font
```

### P1 — 전문 사용자 전환

```text
KRA, XCF, Aseprite, HEIC/HEIF, JPEG XL, OpenEXR, camera RAW
AI/EPS, DXF, VSDX, IDML, DOCX/ODT/XLSX/ODS
USD/USDZ, Alembic, DAE, PLY, 3MF, IFC, STEP, IGES
Lottie, Rive, Spine/DragonBones JSON, OTIO/EDL/FCPXML
OpenType feature·ICC·OCIO·MaterialX·KTX2
```

### P2 — 브리지·보존으로 최대 범위 확보

```text
CLIP/LIP/SUT, Procreate, Affinity, Painter, Rebelle, MediBang project
Figma .fig, Canva native project, Keynote, legacy PPT/DOC/XLS
CDR/CMX, DWG, SKP, BLEND, C4D, Maya, 3ds Max
AEP, INDD, QuarkXPress, MXF, ProRes/DNxHR 특수 조합
```

---

## 14.12 형식군별 권장 엔진 조합

| 형식군 | 브라우저 직접 경로 | 선택형 로컬/서버 브리지 | 보존 전략 |
|---|---|---|---|
| PSD/PSB | `@webtoon/psd` 빠른 검사·WASM decode + `ag-psd` 구조 읽기/쓰기 + CanvasKit 기준 렌더 | Photoshop/Krita 검증 runner 선택 | unknown block·원본 blob·composite preview 보존 |
| OpenRaster/Krita/GIMP | ORA ZIP/XML 직접 + PNG/SVG layer | Krita/GIMP headless 또는 local bridge | native layer와 원본 프로젝트 동시 보관 |
| SVG/PDF/EPS/AI | SVG parser + resvg/ThorVG/Vello; PDF.js import; CanvasKit/PDF writer export | MuPDF/qpdf/Ghostscript/Inkscape | vector/text 유지, 복잡 효과만 선택 bake |
| Office/프레젠테이션 | OOXML parser + PptxGenJS exporter + HarfBuzz/CanvasKit layout | LibreOffice headless | OOXML unknown part·relationship 보존, target-app reopen test |
| 일반 이미지 | 브라우저 ImageDecoder + image-rs/Photon/wasm-vips | OpenImageIO/ImageMagick/libvips | ICC/EXIF/XMP·bit depth·alpha 유지 |
| 고급 이미지 | libavif/libheif/libjxl/libtiff/OpenEXR WASM | OpenImageIO/libvips | 원본 색공간·HDR metadata·multi-channel sidecar |
| 브러시·프리셋 | MYB direct, ABR/GIMP/Krita parser, BrushIR 변환 | 원본 앱 export helper | 원본 preset + BrushIR + 렌더 thumbnail |
| 3D·VRM | Three.js/Babylon loaders, glTF Transform, three-vrm, Assimp WASM 일부 | Blender/OpenUSD/OpenCascade | 원본 scene + normalized Scene3DIR + extension payload |
| CAD/BIM | web-ifc, OpenCascade WASM, replicad | FreeCAD/OCCT/ODA 선택 | exact B-Rep와 preview mesh를 분리 |
| 영상·오디오 | WebCodecs + Mediabunny + codec WASM | FFmpeg worker/server | 원본 stream copy 우선, edit decision과 proxy 분리 |
| 타임라인 | OpenTimelineIO JSON/adapter | OTIO Python service, NLE plugin | edit decision·media reference·effect fallback 분리 |
| 출판 | EPUB/HTML/SVG 직접, PDF export | Pandoc/LibreOffice/Scribus | semantic HTML과 인쇄 PDF를 함께 패키지 |

Ghostscript·FFmpeg·Blender·LibreOffice·OpenCascade 등은 빌드 옵션과 라이선스가 다르므로 별도 서비스·로컬 브리지로 격리하고 SBOM과 고지를 자동 생성한다.

---

## 14.13 브라우저만으로 부족한 포맷을 위한 `ToonBridge`

브라우저 호환성을 포기하지 않으면서 포맷 수를 늘리기 위해 선택형 브리지 세 가지를 둔다.

```text
Client-only
  파일이 기기 밖으로 나가지 않음
  JS/WASM/브라우저 API로 처리

Local ToonBridge
  Tauri/Rust 기반 로컬 companion
  설치된 Blender·Krita·LibreOffice·FFmpeg·FreeCAD와 통신
  대형 파일·비공개 원본을 로컬에서 변환

Private Conversion Service
  격리 container job
  대규모 배치·서버 렌더·특수 codec·legacy format
  원본 자동 삭제·지역 선택·암호화·감사 로그
```

사용자는 파일별로 처리 위치를 선택할 수 있어야 한다. `Client-only`가 불가능한 포맷이라고 해서 업로드를 강제하지 않고, Local ToonBridge 설치 또는 공식 앱에서 표준 포맷으로 변환하는 방법을 제시한다.

---

## 14.14 대용량 파일 처리

- `File.arrayBuffer()`로 전체 파일을 한 번에 읽지 않고 `Blob.stream()`·`slice()`와 OPFS 임시 파일을 사용한다.
- PSD/PSB·TIFF·EXR·ZIP package는 header와 directory를 먼저 읽어 빠른 preview를 만든다.
- 4GB를 넘는 자산은 content-addressed chunk와 64-bit offset을 사용하는 내부 패키지로 분리한다.
- WASM 32-bit memory를 넘는 디코더는 타일 스트리밍·다중 Worker·서버/로컬 bridge를 선택한다.
- 카메라 RAW·영상·3D는 원본을 그대로 보존하고 화면에 필요한 proxy만 생성한다.
- ZIP bomb·decompression bomb·비정상 dimensions·재귀 relationship을 사전에 차단한다.

---

## 14.15 색상·폰트·메타데이터 호환성

파일 확장자만 열리는 것은 충분하지 않다. 다음 데이터를 가능한 한 유지해야 한다.

```text
ICC / CICP / EXIF / XMP / IPTC
bit depth / alpha / premultiplied state
HDR transfer / mastering metadata
spot color / overprint / bleed / trim box
OpenType features / variable axes / vertical metrics
font embedding / subset / license flag
layer blend / mask / clipping / adjustment
animation timing / frame rate / audio sync
3D units / axis / handedness / material / skeleton / morph
```

LittleCMS·skcms·OpenColorIO·HarfBuzz·FreeType·fontTools 계열을 사용해 색상과 글꼴을 별도 자산 그래프로 관리한다. 대상 포맷이 해당 메타데이터를 지원하지 않으면 sidecar와 publish manifest에 보존한다.

---

## 14.16 `FormatInteropReport`와 `RuntimeCapabilityReport` 분리

### 브라우저 실행 보고서

```text
RuntimeCapabilityReport
- WebGPU/WebGL/CPU 경로
- 필압·기울기·coalesced input
- WASM SIMD/threads
- OPFS/File picker
- WebCodecs codec 지원
- 활성 품질 프로필
- 알려진 브라우저·GPU workaround
```

### 파일 상호운용 보고서

```text
FormatInteropReport
- 직접 보존된 객체
- 근사 변환된 객체
- 선택적으로 bake된 객체
- 원본 opaque payload 보존 여부
- 폰트 대체
- 색공간·ICC 변환
- target-app 재개방 결과
- visual/semantic diff
- 다시 편집 가능한 정도
- 권장 대체 포맷
```

사용자가 “현재 브라우저에서 고급 수채 미리보기가 느리다”는 문제와 “PPTX가 특정 필터를 표현하지 못한다”는 문제를 혼동하지 않게 한다.

---

## 14.17 대상 앱 실검증 자동화

파일 생성 성공만으로 호환 완료로 판정하지 않는다.

```text
Exporter fixture
→ 파일 생성
→ Microsoft PowerPoint / LibreOffice / Photoshop / Krita / Blender 등에서 재개방
→ 화면 렌더 또는 구조 추출
→ Golden image·object tree와 비교
→ 포맷별 회귀 점수 기록
```

자동 실행이 어려운 상용 앱은 CI 전용 테스트 머신이나 수동 인증 corpus를 사용한다. 릴리스별로 `Format Compatibility Dashboard`를 공개해 “읽기”, “쓰기”, “왕복”, “시각 보존”, “텍스트 편집”, “레이어 보존”을 따로 표시한다.

---

## 14.18 네이티브 `.toonstudio` 개방형 패키지

```text
project.toonstudio
├─ manifest.json
├─ document/
│  ├─ graph.cbor
│  ├─ commands/
│  └─ schemas/
├─ assets/<content-hash>
├─ foreign/
│  ├─ original PSD/PPTX/GLB...
│  └─ opaque chunks
├─ previews/
├─ fonts/
├─ color/
├─ rights/
├─ versions/
└─ checksums/
```

- ZIP64 또는 스트리밍 container
- 공개 schema와 version migration
- CBOR/JSON 디버그 표현
- 콘텐츠 주소형 자산 중복 제거
- 선택형 암호화와 서명
- 원본 외부 파일의 안전한 보존
- 다른 도구가 최소한 preview·자산·manifest를 읽을 수 있는 공개 SDK

자체 포맷을 개방형으로 설계하면서도 PSD·PPTX·SVG·PDF·glTF 등 사용자가 실제로 쓰는 포맷을 적극 지원해야 전환 장벽이 낮아진다.

---

## 14.19 전체 포맷 레지스트리

별도 CSV에는 다음 계열을 세부 확장자 단위로 정리한다.

- 네이티브·레이어·프로젝트
- 래스터·HDR·RAW·GPU texture
- 벡터·PDF·DTP·다이어그램
- Office·슬라이드·문서·스프레드시트
- 브러시·색상·폰트·LUT
- 3D·VRM·CAD·BIM·point cloud
- 애니메이션·리깅·타임라인
- 영상·오디오·자막
- 웹툰·전자책·아카이브

각 행에는 import/export 등급, 브라우저 직접 경로, 로컬/서버 브리지, 권장 라이브러리, 원본 보존 방식, 우선순위와 한계를 기록한다.

---

## 14.20 구현 우선순위 수정

| 단계 | 브라우저 호환성 | 포맷 호환성 |
|---|---|---|
| **C0** | capability probe, WebGL2/CPU Safe Mode, OPFS/IndexedDB | PNG/JPEG/WebP/SVG/PDF/PSD 읽기, native package |
| **C1** | WebGPU·Worker·WASM SIMD, context loss recovery | PSD/PSB 쓰기, ORA, PPTX, glTF/VRM, ABR/MYB, 영상 기본 |
| **C2** | Safari/iPadOS·Android 장시간 soak, no-SAB mode | KRA/XCF/Aseprite, HEIC/JXL/EXR/RAW, Office/ODF, 3D 확장 |
| **C3** | 브라우저·GPU remote workaround database | Local ToonBridge, LibreOffice/Blender/FFmpeg/OpenCascade 변환 |
| **C4** | 저사양 자동 proxy·서버 타일 | 닫힌 프로젝트 포맷 preserve/bridge, target-app 자동 재개방 QA |

이 우선순위는 **브라우저 호환성과 포맷 호환성을 모두 제품 성장의 핵심 기능**으로 취급한다.

### V4.1 근거 자료

- WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- File System Access: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- WebCodecs: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- Pointer Events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- SharedArrayBuffer/cross-origin isolation: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- PSD/PSB: https://github.com/webtoon/psd , https://github.com/Agamnentzar/ag-psd
- OpenRaster: https://www.openraster.org/
- SVG 2: https://www.w3.org/TR/SVG2/
- PDF 2.0: https://pdfa.org/resource/iso-32000-2/
- OOXML: https://ecma-international.org/publications-and-standards/standards/ecma-376/
- ODF: https://docs.oasis-open.org/office/
- EPUB 3.3: https://www.w3.org/TR/epub-33/
- glTF: https://registry.khronos.org/glTF/
- VRM: https://vrm.dev/en/
- OpenEXR: https://openexr.com/
- KTX 2: https://registry.khronos.org/KTX/
- AVIF/HEIF/JPEG XL/TIFF: https://github.com/AOMediaCodec/libavif , https://github.com/strukturag/libheif , https://github.com/libjxl/libjxl , https://libtiff.gitlab.io/libtiff/
- PPTX: https://gitbrent.github.io/PptxGenJS/
- PDF import: https://github.com/mozilla/pdf.js/
- Timeline interchange: https://github.com/AcademySoftwareFoundation/OpenTimelineIO

# 15. 바이브코딩으로 구현 가능한 범위

| 등급 | 대표 작업 | 판단 |
|---|---|---|
| V0 조립 | 메뉴·패널·템플릿·자산 브라우저·리뷰 UI | 매우 적합 |
| V1 제품 기능 | 스토리 카드·레퍼런스·PaletteLab·PublishCenter | 적합 |
| V2 어댑터 | Vello·CanvasKit·Leafer·js-draw·OpenCV 연결 | 적합하지만 회귀시험 필요 |
| V3 성능 코어 | Worker·OPFS·타일·CRDT·GPU interop | 전문 설계자 감독 필요 |
| V4 품질 엔진 | 필기감·안료·브러시모·색관리·CJK·PSD | AI 코딩 보조는 가능하나 실기기/시각 검증 필수 |
| V5 연구 | 정밀 물리·완전 포맷 왕복·고급 AI | 장기 실험 모듈 |

## 15.1 AI 코딩 도구에 맡기기 좋은 작업

- 외부 SDK adapter와 capability wrapper
- CommandRegistry·schema·migration·type guard
- 패널·inspector·template UI
- Worker message·Comlink interface
- WGSL/SkSL 초안과 CPU reference implementation
- fixture·fuzz·visual regression·Playwright 테스트
- SBOM·license notice·source registry 자동 생성
- 경쟁 제품 기능별 prototype branch

## 15.2 사람이 직접 검증해야 하는 작업

- 스타일러스 지연·압력·기울기·endpoint feel
- premultiplied alpha·linear/sRGB·ICC
- GPU texture lifetime·context loss·memory pressure
- CJK·RTL·IME·font fallback
- PSD/PDF/PPTX의 시각·의미 손실
- fluid/XPBD 수치 안정성
- CRDT conflict와 branch merge
- 타사 코드·브러시·모델·자산 라이선스

# 16. 구현 로드맵

## R0 — 계측·문서 코어

- 현재 ToonStudio 메뉴·입력·저장·렌더 경계 감사
- `CreatorProjectGraph`, `CommandBus`, `StableID`, schema migration
- CapabilityCenter와 실기기 펜·GPU benchmark
- OPFS journal·checkpoint·crash recovery
- 제품·엔진 SBOM과 레지스트리

## R1 — 드로잉 품질 기반

- Pointer Events pipeline·device calibration·preview/final stroke
- Vello·CanvasKit·WebGPU RenderIsland
- 희소 타일·레이어·마스크·Undo
- G펜·연필·마커·에어브러시·벡터 획
- EffectGraph의 색보정·블러·선택·변형

## R2 — 웹 UI/UX 우위

- Quick Sketch·Adaptive Workspace·Command Palette
- HelpGraph·영상 툴팁·진단·Safe Mode
- ReferenceDesk·PaletteLab·AssetVault
- 모바일 한손·펜 디스플레이 무키보드 모드

## R3 — 웹툰·스토리·검토

- StoryRoom·ComicGraph·말풍선·톤·연속 채우기
- Script→Shot→Panel, animatic
- ReviewTheater·버전 비교·승인·외부 링크
- PublishCenter·웹툰 플랫폼 preflight

## R4 — 자연매체·3D·배경

- Hokusai/libmypaint·WetMedia·XPBD bristle
- PoseStage·VRM·카메라·조명·보조 패스
- SceneBuilder·룸·지도·자산 배치
- 3D→editable 2D lineart

## R5 — 애니메이션·출판·현지화

- Timeline·rig·state machine·audio/video
- Page/Spread·CJK·PDF/PPTX·font subset·color management
- LocalizationGraph·다국어 말풍선·번역 검수

## R6 — 자동화·플러그인·고급 차별화

- Brush DNA·ProceduralGraph·data-driven templates
- Extism plugin SDK·QuickJS expressions
- semantic branch/diff/merge·continuity analysis
- AIEditNode·local/server model routing
- Rights BOM·engine equivalence·creation replay debugger

# 17. 최종 완료 판정 체크리스트

## 품질

- [ ] 펜 장치별 raw/coalesced/predicted 입력을 기록·재생한다.
- [ ] preview와 final stroke 교체가 육안으로 튀지 않는다.
- [ ] 브러시별 pressure·tilt·speed response regression이 있다.
- [ ] 색상·감마·alpha가 모든 엔진 경계에서 동일하다.
- [ ] 자연매체 타일 경계·건조·혼색의 시각 회귀가 있다.
- [ ] CPU 기준 렌더와 GPU 결과 차이를 측정한다.

## 성능

- [ ] 편집 UI가 렌더·저장·AI 작업에 의해 차단되지 않는다.
- [ ] 엔진 간 CPU readback이 telemetry로 탐지된다.
- [ ] memory pressure에서 proxy/LOD로 안전하게 전환한다.
- [ ] context loss와 Worker crash 후 문서가 복구된다.
- [ ] 대형 세로 웹툰·8K·수백 레이어·긴 세션 soak test가 있다.

## UI/UX

- [ ] 계정 없이 첫 획까지 갈 수 있다.
- [ ] 현재 저장·동기화·복구 상태가 항상 보인다.
- [ ] 모든 도구는 키보드·펜·터치 중 최소 두 입력 경로를 제공한다.
- [ ] 기능은 메뉴·검색·문맥 메뉴·도움말에서 같은 Command ID를 쓴다.
- [ ] 검토 모드에서 원본을 실수로 편집할 수 없다.
- [ ] 저사양·모바일·펜 디스플레이 workspace를 실제 기기로 검증한다.

## 생태계

- [ ] 레퍼런스 출처와 라이선스가 자산에 남는다.
- [ ] 스토리·컷·대사·포즈·3D·검토·출고가 안정 ID로 연결된다.
- [ ] 외부 자산·플러그인·AI 모델의 Rights BOM이 생성된다.
- [ ] 모든 내보내기는 CompatibilityReport를 생성할 수 있다.
- [ ] 무라이선스 공개 코드는 clean-room 외에는 사용하지 않는다.

# 18. 최종 판단

최상위 품질은 엔진 수 자체에서 나오지 않는다. 다음 네 층이 동시에 성립해야 한다.

```text
1. 전문 엔진을 올바른 아일랜드에 배치
2. 공통 의미 문서와 명령 모델로 엔진을 통제
3. 실기기 계측과 시각 회귀로 품질을 검증
4. 복잡성을 숨기는 Adaptive UI와 실행 가능한 도움말
```

ToonStudio의 가장 방어력 높은 차별점은 Clip Studio의 기능 수, Photoshop의 호환성, Figma의 협업, PureRef의 레퍼런스, Boords의 스토리보드, PoseMy.Art의 포즈, Floorplanner의 배경, Frame.io의 검토를 각각 흉내 내는 것이 아니다. 이 기능들이 **한 프로젝트의 동일한 캐릭터·장면·자산·버전·권리 그래프를 공유하도록 연결하는 것**이다.

따라서 최종 코어는 다음 조합으로 확정한다.

```text
CreatorProjectGraph + CommandBus + QualityOrchestrator
Vello + CanvasKit + Custom WebGPU + CPU deterministic baseline
Hokusai/libmypaint + XPBD + WetMedia
LeaferJS/js-draw + Graphite-inspired ProceduralGraph
Three.js + Rapier + Box2D/Jolt optional
OpenCV + wasm-vips + LittleCMS + ONNX Runtime Web
Loro/Yjs + OPFS + SQLite WASM
Adaptive Workspace + HelpGraph + CapabilityCenter
```

# 19. 검증한 주요 공식·공개 소스

아래는 V4 확장에 직접 사용한 대표 소스다. 각 제품의 플랜·버전·라이선스는 구현 직전 다시 고정해야 한다.

- Drawpile: https://drawpile.net/
- Kleki Help: https://kleki.com/help/
- Draw.Chat: https://draw.chat/
- Graphite Features/Manual/Codebase: https://graphite.rs/features/ · https://graphite.rs/learn/ · https://graphite.rs/volunteer/guide/codebase-overview/
- Rnote: https://rnote.flxzt.net/
- Lorien: https://github.com/mbrlabs/Lorien
- js-draw: https://github.com/personalizedrefrigerator/js-draw
- LeaferJS: https://www.leaferjs.com/
- Canvas Editor: https://github.com/Hufe921/canvas-editor
- PureRef Handbook: https://www.pureref.com/handbook/
- Milanote: https://milanote.com/
- PoseMy.Art: https://posemy.art/
- Line of Action: https://line-of-action.com/
- Coolors: https://coolors.co/
- Adobe Color: https://color.adobe.com/
- Boords: https://boords.com/
- Plottr: https://plottr.com/
- World Anvil: https://www.worldanvil.com/
- Frame.io Help: https://help.frame.io/
- SyncSketch Support: https://support.syncsketch.com/
- Filestage Help: https://help.filestage.io/
- Floorplanner: https://floorplanner.com/
- Planner 5D: https://planner5d.com/
- Inkarnate: https://inkarnate.com/
- Poly Haven: https://polyhaven.com/
- ambientCG: https://ambientcg.com/
- Kenney: https://kenney.nl/assets
- Box2D: https://box2d.org/
- JoltPhysics.js: https://github.com/jrouwe/JoltPhysics.js
- MuJoCo: https://github.com/google-deepmind/mujoco

# 20. 핵심 서비스→기능→엔진 매핑 요약

| 서비스 | 고유 강점 | 흡수 기능 | 권장 조합 |
|---|---|---|---|
| Magma | 실시간 공동 작화, 레이어 소유권, 역할별 레이아웃, 도구별 영상 도움말 | 공동작화 세션, 레이어 잠금·소유권, Adaptive Workspace, 영상 툴팁 | Custom WebGPU + Vello + Loro/Yjs + React Aria |
| Drawpile | 다중 브러시 엔진, 200개 이상 브러시, 애니메이션, 권한형 세션, 자동 복구 | 세션 권한, 호스트 제어, 동기화 스머지, 타임랩스, 복구 가능한 공동 작화 | WebGPU brush backend + Hokusai/libmypaint + Loro + OPFS |
| Kleki | 계정 없이 즉시 시작, 경량 브라우저 저장, 단순한 도구·터치 UX | Quick Sketch, 임시 로컬 문서, 탭 복구, 간단 모드, 브라우저 한계 안내 | CanvasKit/PixiJS Lite + OPFS/IndexedDB + Pointer Events |
| Draw.Chat | PDF·이미지·지도·웹페이지 위 실시간 주석, 통화·화면공유, 압력·기울기 | 검토 보드, 교육 모드, PDF/지도 주석, 통화·파일전송, 비회원 링크 | Vello annotation + PDF.js + WebRTC + Loro/Yjs |
| Graphite | node-based vector+raster nondestructive editor | BrushGraph·문서 구조 | Rust |
| Rnote | Rust 기반 벡터 드로잉, PDF/이미지 주석, 무한 캔버스, 적응형 UI | Study/Annotate Workspace, 페이지+무한 캔버스 혼합 | Vello/CanvasKit + PDF.js + adaptive UI |
| Lorien | pressure strokes·infinite canvas·SuperEraser | stroke 저장·벡터 지우개 참고 | Godot |
| Concepts | 편집 가능한 벡터 획, 무한 캔버스, 실제 단위·측정·스냅 | 정밀 스케치, 이동 가능한 아트보드, 실척 도면, 벡터 획 사후 편집 | Vello + StrokeIR + Constraint/Snap engine |
| PureRef | 항상 위·클릭 통과·투명 오버레이·이미지 그룹·노트·GIF 프레임 | ReferenceDesk, tracing overlay, global picker, grouped refs | LeaferJS/PixiJS + desktop/PWA overlay bridge |
| Milanote | 이미지·영상·폰트·색·오디오·문서가 섞인 제작 보드 | Moodboard, shot list, call sheet, worldbuilding board | LeaferJS + AssetGraph + KnowledgeGraph |
| PoseMy.Art | 브라우저 포즈·다중 인물·카메라·조명·OBJ, depth/canny/normal/OpenPose 출력 | PoseStage, AI/lineart용 보조 패스, 저장 카메라 | Three.js + VRM + Rapier + render passes |
| Line of Action | 인물·동물·손발·얼굴·환경 연습과 class mode | 워밍업→긴 포즈→휴식의 수업 모드 | PracticeGraph + adaptive sessions |
| Coolors | 빠른 팔레트 생성·이미지 추출·접근성·시각화 | PaletteLab, 잠금 색상, 이미지 팔레트, 현재 장면 미리보기 | Color.js/Culori + WebGPU palette preview |
| Boords | 그리드·샷리스트·스크립트·프레임 편집과 공유 검토 | 다중 보기, 스크립트 자동 프레임, 사용자 정의 필드, 애니매틱 | StoryGraph + ReviewGraph + media timeline |
| Frame.io | 프레임/범위 댓글·주석·비교·버전·승인·리뷰 링크 | ReviewTheater, overlay/difference compare, version stack, approval | Proxy renderer + Vello annotations + ReviewGraph |
| SyncSketch | 펜·레이저·도형·압력/속도 dynamics, onion skin whiteboard, 영상/음성 채팅 | 검토 전용 펜 툴바, accidental edit 방지, annotation copy/frame offset | Vello annotation + TimelineGraph + WebRTC |
| Floorplanner | 2D/3D 평면도·가구·다층·고해상도 출력 | FloorplanGraph, 자동 벽/방, 2D↔3D | replicad/OpenCascade + Three.js |
| Inkarnate | 지도 자산·스탬프·브러시·레이어·마스크·필터 | Scene Stamp, terrain brush, clip mask, map styles | WebGPU brush + asset stamping + Vello labels |
| Poly Haven | CC0 HDRI·PBR 텍스처·3D 모델, 가입·페이월 없음 | CC0 Asset Connector, HDRI/재질/모델 원클릭 설치 | AssetVault + glTF/KTX2 pipeline |
| Polotno | 템플릿·동적 변수·이미지/영상 편집과 프로그래매틱 생성 | TemplateGraph, 변수 기반 대량 생성, 화이트라벨 UI | Konva/CanvasKit + TemplateGraph + export workers |

---

# 부록 A. 이전 웹 드로잉 UI/UX 최상위 품질 멀티엔진 전체 명세

# ToonStudio 웹 드로잉 UI/UX 최상위 품질 · 초확장 멀티엔진 최종 아키텍처

## 웹사이트형 드로잉 제품의 실제 메뉴·도움말·온보딩·복구·협업 UX를 중심으로 Vello·CanvasKit·WebGPU·자연매체·물리·3D를 재배치한 통합 설계

- 대상: `https://www.toonstudio.cloud/studio`
- 기준일: 2026-08-06 (Asia/Seoul)
- 본 문서는 기존 **경쟁제품 매뉴얼 기반 초확장 멀티엔진 아키텍처**를 대체·포함하는 상위 통합본이다.
- 기술 기본값: React 19 + TypeScript, Rust/WASM, WebGPU 우선, WebGL2·CPU 폴백, OPFS local-first, Yjs 기반 의미 객체 협업
- 설계 목표: 기능 개수뿐 아니라 **첫 진입, 도구 발견, 필기감, 오류 회복, 모바일 조작, 접근성, 협업, 파일 왕복, 성능 자동 적응**에서 웹 제품의 우위를 만든다.

## 문서 범위

| 항목 | 수록 범위 |
| --- | --- |
| 웹형·웹 전환형 제품 상세 UX 분석 | 26개 |
| 공식·공개 핵심 근거 | 37개 |
| 적응형 Workspace 프로필 | 11종 |
| 웹 UI/UX 핵심 라이브러리 의사결정 | 17종 |
| 렌더·계산·저장 엔진 역할군 | 19종 |
| 대표 브러시 엔진 조합 | 20계열 |
| 대표 필터 엔진 조합 | 24계열 |
| 웹 전용 차별화 기능 | 31종 |
| 이전 통합본 포함 범위 | 85개 경쟁 제품군, 143개 엔진·라이브러리 계열, 브러시 315종, 필터·분석 노드 616종, 드로잉 외 기능 1,045종 |

> **조사 한계:** 공개 공식 도움말과 접근 가능한 제품 페이지를 중심으로 분석했다. 로그인 이후 동적 UI가 외부에 노출되지 않는 ToonStudio·Tooning Plus의 내부 메뉴 전체를 검증했다고 주장하지 않는다. 제품 버전·브라우저·플랜·라이선스는 구현 시점에 다시 고정하고 회귀 감사해야 한다.

---

# 0. 최종 실행 결론

ToonStudio가 웹에서 데스크톱 도구를 이기려면 “기능을 더 많이 넣는 것”만으로는 부족하다. 최종 우위는 다음 다섯 층이 동시에 완성될 때 생긴다.

```text
1. Experience Layer
   즉시 시작 · 적응형 UI · 문맥 작업 · 도움말 · 모바일 · 접근성

2. Product Core
   CommandRegistry · ToolStateMachine · StudioProjectGraph · VersionGraph

3. Quality Engines
   Vello · CanvasKit · Custom WebGPU · Hokusai · XPBD · OpenCV · 3D/Physics

4. Reliability Layer
   Worker Mesh · Sparse Tiles · OPFS Journal · Recovery · Capability/Fallback

5. Production OS
   협업 · 검수 · 출고 · 권리 · 다중 포맷 · 플러그인 · 자동화
```

웹 전용 최종 차별점은 다음과 같다.

- **Adaptive Studio UI:** 사용자 숙련도·화면 크기·입력 장치·현재 작업·GPU 성능·협업 역할에 따라 같은 문서를 다른 UI로 편집한다.
- **Command-driven product:** 메뉴, 단축키, 문맥 작업, 도움말, 플러그인, 권한, 분석을 하나의 `CommandRegistry`에서 생성한다.
- **Browser Capability Center:** 필압·GPU·저장·클립보드·WASM·코덱 상태를 자동 검사하고 대체 경로를 보여준다.
- **Two-stage low-latency stroke:** 예측 preview와 결정적 canonical stroke를 분리해 브라우저에서도 즉각적인 필기감을 만든다.
- **Render Island architecture:** 객체가 아니라 장면 아일랜드별로 Vello·CanvasKit·WebGPU·Pixi·ThorVG·CPU 엔진을 선택한다.
- **Local-first + encrypted collaboration:** OPFS 복구와 서버가 내용을 읽지 못하는 snapshot 공유, 의미 객체 CRDT를 함께 제공한다.
- **Manual as executable product:** 도움말에서 현재 문서에 샘플을 만들고 명령을 실행하며 문제를 자동 진단한다.
- **Professional fallback:** WebGPU 실패가 문서 손상이나 빈 화면으로 이어지지 않고 WebGL/CPU safe mode로 전환된다.

# 1. 조사 방법과 증거 수준

## 1.1 웹 제품은 기능 목록보다 사용자 여정으로 분석한다

각 제품을 다음 순서로 평가했다.

```text
방문 → 첫 문서/파일 → 도구 발견 → 펜 입력 → 속성 변경 → 레이어/객체
→ Undo/복구 → 공유/협업 → 모바일/태블릿 → 도움말/문제 해결 → 내보내기
```

평가 점수는 공식 벤치마크가 아니라 공개 매뉴얼과 제품 구조를 바탕으로 한 **설계 비교용 휴리스틱**이다. 절대 순위로 사용하지 않는다.

## 1.2 공식·공개 소스

| ID | 자료 | URL | 주요 근거 |
| --- | --- | --- | --- |
| S01 | Magma Editor UI | https://help.magma.com/en/articles/6871160-magma-s-editor-user-interface | 도구별 영상 툴팁, Recent Tools, 패널·상태바·시퀀스·통신 구조 |
| S02 | Magma Layout Modes | https://help.magma.com/en/articles/10586978-magma-layout-modes | Super Simple·Simple·Full·2열 레이아웃 |
| S03 | Magma Brush | https://help.magma.com/en/articles/6871478-brush | 필압·기울기·스캐터·텍스처·듀얼 브러시·전달 |
| S04 | Magma Layers | https://help.magma.com/en/articles/6413262-creating-a-layer-and-layer-controls | 레이어 소유권·개인 가시성·권한·클리핑 |
| S05 | Magma Getting Started | https://help.magma.com/en/articles/15254322-getting-started-in-magma | 브라우저·펜·모바일·지연 문제 진단 |
| S06 | Kleki Home | https://kleki.com/home/ | 즉시 시작, HUD, 16 레이어, 필압, 제스처, 필터 |
| S07 | Kleki Help | https://kleki.com/help/ | 브라우저 저장·탭 복구·PSD 제한·채우기 팁 |
| S08 | Photopea Open/Save | https://www.photopea.com/learn/opening-saving | PSD 중심 파일 모델, 드래그·붙여넣기·다중 포맷 |
| S09 | Photopea Brush Tools | https://www.photopea.com/learn/brush-tools | 팁·다이내믹·스캐터·색상·ABR·필압 |
| S10 | Photopea Learn | https://www.photopea.com/learn/ | 데스크톱급 메뉴·도구·비파괴 편집 |
| S11 | Figma Draw | https://help.figma.com/hc/en-us/articles/31440394517143-Explore-Figma-Draw | 모드 전환 시 도구막대·사이드바 재구성 |
| S12 | Penpot Workspace | https://help.penpot.app/user-guide/designing/workspace-basics/ | 무한 캔버스·페이지·보드·검색·단축키 패널·가이드 |
| S13 | tldraw Collaboration | https://tldraw.dev/sdk-features/collaboration | 동시 편집·커서·뷰포트 추적·충돌 처리 |
| S14 | tldraw UI | https://tldraw.dev/examples/ui | 교체 가능한 UI 슬롯과 도구 상태 기계 |
| S15 | Excalidraw E2EE | https://plus.excalidraw.com/blog/end-to-end-encryption | URL fragment 키 기반 서버 비가독 공유 |
| S16 | Draw.Chat Manual | https://draw.chat/ko/manyual.html | 무가입 보드·PDF·지도·WebRTC·AI·권한·스타일러스 |
| S17 | WBO | https://wbo.ophir.dev/?lang=en | 오픈소스 실시간 무한 보드·링크 공유·지속 저장 |
| S18 | JS Paint | https://jspaint.app/about | 브라우저에서 데스크톱 UI를 충실히 재현한 사례 |
| S19 | Spline UI | https://docs.spline.design/basics/understanding-splines-ui | 상단 도구·아웃라이너·속성·플레이 모드 |
| S20 | Spline Collaboration | https://docs.spline.design/sharing-collaboration-and-workspaces/real-time-collaboration-in-3-d | 실시간 3D 협업·자동 저장·역할·커서 |
| S21 | SketchUp for Web | https://help.sketchup.com/en/sketchup-web/sketchup-web | 웹에서 데스크톱 코어를 단순화한 인터페이스 |
| S22 | SketchUp Web Features | https://help.sketchup.com/en/sketchup-web/web-features | 브라우저 단축키 충돌·확장 제한·기능 차이 |
| S23 | React Aria | https://react-aria.adobe.com/ | 기기 적응형 접근성·드래그앤드롭·키보드 다중 선택 |
| S24 | Radix Primitives | https://www.radix-ui.com/primitives | 비스타일 접근성 프리미티브·초점·중첩 메뉴 |
| S25 | Floating UI | https://floating-ui.com/docs/computeposition | 툴팁·팝오버·컨텍스트 UI 위치 계산 |
| S26 | XState | https://stately.ai/docs/xstate | 도구·제스처·비동기 작업 상태 기계와 액터 |
| S27 | FlexLayout | https://github.com/caplin/FlexLayout | React 도킹·탭·분할 레이아웃 |
| S28 | dnd-kit Accessibility | https://docs.dndkit.com/guides/accessibility | 키보드·스크린리더 드래그앤드롭 |
| S29 | CanvasKit | https://skia.org/docs/user/modules/canvaskit/ | Skia WASM, Path·Text·ImageFilter·SkSL·Skottie |
| S30 | Vello | https://github.com/linebender/vello | Rust/wgpu GPU 벡터 렌더링 |
| S31 | ThorVG | https://github.com/thorvg/thorvg | SVG·Lottie·CPU·WebGL·WebGPU 벡터 엔진 |
| S32 | PixiJS Renderer | https://pixijs.com/8.x/guides/components/renderers | 안정적인 WebGL 경로와 발전 중인 WebGPU 경로 |
| S33 | Rapier | https://rapier.rs/docs/ | Rust/WASM 2D·3D 강체·충돌·관절·스냅샷 |
| S34 | JoltPhysics.js | https://github.com/jrouwe/JoltPhysics.js | WASM 고급 강체·천·소프트바디 선택 백엔드 |
| S35 | Pointer Events 3 | https://www.w3.org/TR/pointerevents3/ | raw·coalesced·predicted 입력과 펜 각도 |
| S36 | OPFS | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system | 브라우저 로컬 고성능 파일 저장 |
| S37 | OffscreenCanvas | https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas | Worker 렌더링과 메인 스레드 분리 |

# 2. 웹사이트형 드로잉·편집 제품 UX 비교

## 2.1 설계용 휴리스틱 점수

| 제품 | 즉시 시작 | 전문 편집 | 브러시 | 학습성 | 협업 | 복구/저장 | 모바일 | 확장성 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Magma | 4 | 4 | 4 | 5 | 5 | 3 | 5 | 4 |
| Kleki | 5 | 2 | 3 | 5 | 1 | 4 | 5 | 4 |
| Photopea | 4 | 5 | 3 | 3 | 1 | 3 | 3 | 4 |
| Figma Draw | 4 | 4 | 3 | 5 | 5 | 5 | 4 | 5 |
| Penpot | 4 | 4 | 2 | 4 | 5 | 5 | 4 | 5 |
| tldraw | 5 | 3 | 2 | 5 | 5 | 4 | 5 | 5 |
| Excalidraw | 5 | 2 | 2 | 5 | 5 | 5 | 5 | 5 |
| Draw.Chat | 5 | 2 | 3 | 5 | 5 | 2 | 5 | 3 |
| WBO | 5 | 1 | 1 | 5 | 5 | 4 | 5 | 5 |
| Sketchpad | 5 | 3 | 3 | 5 | 3 | 3 | 5 | 3 |
| Pixlr | 5 | 4 | 3 | 5 | 2 | 3 | 5 | 2 |
| Sumo Paint | 4 | 3 | 4 | 4 | 2 | 3 | 4 | 3 |
| miniPaint | 5 | 3 | 2 | 4 | 1 | 4 | 4 | 5 |
| Piskel | 5 | 3 | 2 | 5 | 1 | 4 | 3 | 5 |
| JS Paint | 5 | 2 | 1 | 5 | 1 | 4 | 4 | 5 |
| Adobe Express | 5 | 4 | 2 | 5 | 5 | 5 | 5 | 4 |
| Canva | 5 | 4 | 2 | 5 | 5 | 5 | 5 | 4 |
| Boxy SVG | 4 | 4 | 1 | 4 | 1 | 4 | 3 | 3 |
| Spline | 4 | 4 | 1 | 5 | 5 | 5 | 4 | 4 |
| SketchUp Web | 3 | 5 | 1 | 4 | 3 | 5 | 4 | 4 |
| CSP Simple/Studio | 3 | 5 | 5 | 4 | 3 | 5 | 5 | 4 |
| Krita | 2 | 5 | 5 | 3 | 1 | 5 | 3 | 5 |
| Photoshop Web | 4 | 5 | 3 | 4 | 5 | 5 | 4 | 4 |
| Concepts | 4 | 4 | 4 | 5 | 2 | 5 | 5 | 3 |
| Polotno | 5 | 4 | 2 | 5 | 3 | 4 | 5 | 5 |
| Tooning 공개 범위 | 4 | 3 | 2 | 5 | 3 | 4 | 5 | 2 |

점수의 해석은 다음과 같다. `5`는 해당 제품의 대표 강점, `3`은 실용적, `1`은 제품 목표상 비중이 낮음을 뜻한다. 예를 들어 Excalidraw의 브러시 점수는 낮지만 이는 제품 실패가 아니라 화이트보드라는 목표 선택이다.

## 2.2 제품별 상세 분석

### 2.3 Magma — 전문 실시간 공동 작화

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 링크 또는 대시보드에서 캔버스에 진입하며 설치가 없다. 협업 초대가 편집 흐름 안에 존재한다. |
| 정보 구조 | 상단 메뉴·Quick Actions, 좌측 도구, 중앙 캔버스, 우측 속성·브러시·레이어·통신, 하단 상태·시퀀스로 전문 앱 문법을 유지한다. |
| 드로잉·입력 | 필압·기울기·안정화·팁·스캐터·텍스처·듀얼 브러시·색상/전달 다이내믹을 단계적으로 노출한다. |
| 레이어·객체 | 레이어 소유자 표시, 개인/전역 가시성, 양도·관리자 지정·클리핑 등 협업 의미가 레이어 모델에 들어간다. |
| 협업 | 커서·채팅·음성·영상·레이어 소유권·권한·아트잼을 편집기 내부에 통합한다. |
| 저장·복구 | 버전과 수정 기록이 있지만 브라우저·장치·브러시 복잡도에 따른 지연을 도움말에서 적극 안내한다. |
| 반응형·모바일 | Super Simple·Simple·Full·2열을 제공하고 모바일은 자동으로 단순 레이아웃으로 이동한다. |
| 도움말·발견성 | 도구 아이콘 hover 시 설명과 동영상, 브라우저·태블릿별 문제 해결 문서를 제공한다. |
| ToonStudio에 채택 | 숙련도/화면별 레이아웃, Recent Tools 6칸, 영상 툴팁, 개인 가시성, 레이어 checkout, 통신 패널을 채택한다. |
| 피해야 할 점 | 협업 편의를 위해 레이어 소유권이 과도한 잠금으로 작동하지 않게 객체·영역 단위 soft lock과 제안 모드를 병행한다. |
| 근거 | S01–S05 |

### 2.4 Kleki — 경량 웹 페인팅

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 첫 화면에서 즉시 그릴 수 있고 계정·프로젝트 생성 절차가 거의 없다. |
| 정보 구조 | 도구 수를 억제하고 HUD로 색·크기·불투명도를 어느 위치에서든 바꾼다. |
| 드로잉·입력 | 필압 크기·불투명도, 안정화, 터치 제스처, Blend·Smudge·Chemy 등 소수의 명확한 브러시에 집중한다. |
| 레이어·객체 | 16 레이어·블렌드·기본 변형·필터를 제공해 경량성과 기능의 경계를 명확히 한다. |
| 협업 | 주력 기능이 아니며 개인 창작에 초점이 있다. |
| 저장·복구 | 브라우저 저장과 5분 뒤 1분 간격 탭 복구를 제공하면서 정식 자동 저장이 아님을 명확히 알린다. |
| 반응형·모바일 | 데스크톱·Android·iPad를 지원하고 터치 제스처를 핵심 조작으로 둔다. |
| 도움말·발견성 | 채우기 Grow·Tolerance 같은 실전 레시피와 메모리 절전 탭 문제까지 직접 설명한다. |
| ToonStudio에 채택 | 즉시 시작, 캔버스 HUD, 복구 상태의 정직한 설명, 실전 레시피형 도움말, 저사양 safe mode를 채택한다. |
| 피해야 할 점 | 레이어 수와 브러시 품질을 제품 전체 상한으로 삼지 말고 Lite 프로필로만 유지한다. |
| 근거 | S06–S07 |

### 2.5 Photopea — 웹 PSD·래스터/벡터 편집

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 파일 열기·드래그·클립보드 붙여넣기로 즉시 문서화하며 기존 PSD 사용자 지식을 활용한다. |
| 정보 구조 | Photoshop형 메뉴·도구·패널·단축키를 브라우저에 이식해 전문 기능 발견 비용을 낮춘다. |
| 드로잉·입력 | 원형/패턴 팁, 경도, 간격, 팁 다이내믹, 스캐터, 색상 다이내믹, 필압, ABR 입출력을 제공한다. |
| 레이어·객체 | PSD를 주 문서 모델로 두고 Smart Object·Smart Filter·마스크·벡터·텍스트를 보존한다. |
| 협업 | 공동 작화보다 파일 호환과 개인 편집이 우선이다. |
| 저장·복구 | 현대 브라우저 File System Access·클라우드 저장 연계를 활용하지만 로컬 저널 UX는 더 강화할 여지가 있다. |
| 반응형·모바일 | 고밀도 데스크톱 UI를 유지하므로 작은 화면에서는 학습·조작성 부담이 커질 수 있다. |
| 도움말·발견성 | 도구별 간결한 웹 문서와 실제 메뉴 경로를 제공한다. |
| ToonStudio에 채택 | 드래그·붙여넣기·PSD 중심 round-trip, 데스크톱 단축키 호환, 비파괴 객체를 채택한다. |
| 피해야 할 점 | 모든 기능을 처음부터 노출하는 단일 고밀도 레이아웃은 피하고 작업 모드·검색·문맥 UI를 덧댄다. |
| 근거 | S08–S10 |

### 2.6 Figma Draw — 협업 디자인+일러스트

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 기존 디자인 파일에서 Draw 모드로 전환해 같은 객체·컴포넌트와 그림을 연결한다. |
| 정보 구조 | 작업 모드에 따라 도구막대와 좌우 사이드바를 다시 구성하고 드로잉 속성만 간결하게 노출한다. |
| 드로잉·입력 | Pencil·Brush·텍스처·가변 폭·패턴·반복·방사 변형·heal/delete 등 편집 가능한 벡터를 강조한다. |
| 레이어·객체 | 벡터 네트워크·컴포넌트·변수·Auto Layout·디자인 토큰과 일러스트 객체가 공존한다. |
| 협업 | 멀티플레이·코멘트·Dev Mode·버전이 제품 문법에 내장된다. |
| 저장·복구 | 클라우드 자동 저장과 버전 기록이 기본 기대치다. |
| 반응형·모바일 | 캔버스 작업은 데스크톱 중심이지만 UI 모드 전환이 복잡도를 줄인다. |
| 도움말·발견성 | 기능별 도움말과 작업 예제가 촘촘하며 모드 차이를 명시한다. |
| ToonStudio에 채택 | 문서 공유는 유지한 채 UI만 바꾸는 Persona/Mode, 비파괴 반복·패턴·가변 폭, 컴포넌트+브러시 결합을 채택한다. |
| 피해야 할 점 | 모드마다 기능이 사라지는 혼란을 줄이기 위해 명령 검색에서는 전체 기능과 현재 모드 제한 이유를 보여준다. |
| 근거 | S11 |

### 2.7 Penpot — 오픈소스 웹 디자인

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 무한 캔버스에서 바로 작업하되 페이지·보드로 논리와 출력 영역을 분리한다. |
| 정보 구조 | 메인 메뉴·레이어·속성·페이지의 익숙한 구조와 레이어 검색·유형 필터·찾기/바꾸기를 제공한다. |
| 드로잉·입력 | 전문 회화보다 SVG·레이아웃·컴포넌트·디자인 시스템에 초점이 있다. |
| 레이어·객체 | 페이지·보드·레이어·컴포넌트·Variant·토큰·Flex/Grid를 웹 표준에 가깝게 관리한다. |
| 협업 | 브라우저 기반 공동 디자인과 버전 미리보기를 지원한다. |
| 저장·복구 | 파일·버전·오픈 포맷 구조가 장기 이동성과 자체 호스팅에 유리하다. |
| 반응형·모바일 | 반응형 레이아웃 자체를 편집 대상으로 삼는다. |
| 도움말·발견성 | ? 단축키 패널, 카테고리·검색, 상세 사용자 가이드가 편집기와 연결된다. |
| ToonStudio에 채택 | 검색 가능한 레이어 트리, human-readable 프로젝트, Flex/Grid/토큰, 단축키 검색 패널을 채택한다. |
| 피해야 할 점 | 드로잉 품질이 디자인 객체 기능에 종속되지 않도록 브러시 코어는 별도 엔진으로 유지한다. |
| 근거 | S12 |

### 2.8 tldraw — 무한 캔버스 SDK

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 기본 UI가 완성된 무한 캔버스를 즉시 제공하며 SDK 사용자는 UI 슬롯을 교체할 수 있다. |
| 정보 구조 | 도구를 상태 기계, 문서를 검증된 Store, UI를 교체 가능한 컴포넌트 슬롯으로 분리한다. |
| 드로잉·입력 | 화이트보드형 freehand와 도형에 강하지만 자연매체 회화 코어는 아니다. |
| 레이어·객체 | 스키마·마이그레이션·페이지·카메라·세션 상태가 명확히 분리된다. |
| 협업 | sync 패키지가 충돌 해결·presence·커서·뷰포트 follow를 담당한다. |
| 저장·복구 | 스토어 snapshot·IndexedDB·세션 상태 분리·스키마 migration이 좋은 참고다. |
| 반응형·모바일 | 완성 UI와 제스처가 다양한 화면에 적응한다. |
| 도움말·발견성 | SDK 문서와 예제가 풍부하며 사용자 앱이 기능을 점진적으로 대체할 수 있다. |
| ToonStudio에 채택 | ToolStateMachine, 검증 Store, 세션/문서 분리, UI 슬롯, 페이지별 카메라를 아키텍처 원리로 채택한다. |
| 피해야 할 점 | 프로덕션 라이선스와 제품 종속성을 검토하고 핵심 문서 모델을 외부 Store 타입에 고정하지 않는다. |
| 근거 | S13–S14 |

### 2.9 Excalidraw — 손그림 화이트보드

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 한 화면에서 즉시 그리며 계정이나 설정을 요구하지 않는 대표적 low-friction UX다. |
| 정보 구조 | 소수 도구·명확한 속성·라이브러리·공유를 전면에 두고 시각 정체성을 일관되게 유지한다. |
| 드로잉·입력 | 정밀 회화보다는 손그림 도형·다이어그램·설명에 특화한다. |
| 레이어·객체 | 간단한 벡터 장면과 재사용 라이브러리를 중심으로 한다. |
| 협업 | 실시간 협업과 링크 공유를 제공하며 암호 키를 URL fragment에 둔 E2EE 공유 모델이 강점이다. |
| 저장·복구 | 로컬 우선과 파일 저장이 단순해 사용자가 데이터 위치를 이해하기 쉽다. |
| 반응형·모바일 | 저밀도 UI와 큰 타깃으로 다양한 장치에서 접근이 쉽다. |
| 도움말·발견성 | 조작을 UI 자체가 설명하도록 설계해 도움말 의존도가 낮다. |
| ToonStudio에 채택 | 즉시 빈 캔버스, 암호화 공유, 손그림 스타일, 재사용 라이브러리, 낮은 인지 부하를 채택한다. |
| 피해야 할 점 | 단순성을 전문 도구 제한으로 연결하지 말고 Simple 프로필 안에서만 유지한다. |
| 근거 | S15 |

### 2.10 Draw.Chat — 교육·문서 공동 주석

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 회원가입 없이 한 번에 보드를 만들고 무작위 링크로 공유한다. |
| 정보 구조 | 그리기·파일·배경·협업·통신을 교육 과업 중심으로 묶는다. |
| 드로잉·입력 | 펜·마커·형광펜·크레용·지우개와 일부 필압·기울기 반응을 제공한다. |
| 레이어·객체 | PDF·이미지·지도·오디오·비디오를 보드 배경/자료로 다룬다. |
| 협업 | 보기·그리기·채팅 권한, WebRTC 통화, 실시간 보드와 AI 보조를 통합한다. |
| 저장·복구 | 보드는 임시일 수 있음을 안내하고 저장·이미지 출력·보드 관리 기능을 제공한다. |
| 반응형·모바일 | 컴퓨터·태블릿·휴대폰, 스타일러스, 손가락 이동을 폭넓게 고려한다. |
| 도움말·발견성 | 기본부터 제스처까지 15개 범주의 단계별 매뉴얼과 설정 생성기를 제공한다. |
| ToonStudio에 채택 | 무가입 게스트 세션, PDF/지도 주석, 권한별 링크, 통화·AI·템플릿·임베드 API를 채택한다. |
| 피해야 할 점 | 임시 저장 정책은 전문 창작 문서에 부적합하므로 ToonStudio는 OPFS 저널과 명시적 보존 상태를 제공한다. |
| 근거 | S16 |

### 2.11 WBO — 오픈소스 실시간 무한 보드

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 공개·무작위 비공개·이름 있는 보드를 링크만으로 만든다. |
| 정보 구조 | 기능을 최소화하고 협업과 무한 공간을 전면에 둔다. |
| 드로잉·입력 | 기본 선과 보드 상호작용에 집중한다. |
| 레이어·객체 | 큰 가상 보드에 많은 사용자가 동시에 추가하는 단순 모델이다. |
| 협업 | 익명 다중 사용자와 실시간 지속 저장이 핵심이다. |
| 저장·복구 | 보드 상태가 지속되지만 공개 보드는 일시적일 수 있다. |
| 반응형·모바일 | 낮은 복잡도로 다양한 장치에서 작동한다. |
| 도움말·발견성 | 첫 화면 설명만으로 진입 가능하다. |
| ToonStudio에 채택 | 익명 임시 세션, 링크 기반 보드, 공개 Jam의 최소 흐름을 채택한다. |
| 피해야 할 점 | 전문 작업에서는 무제한 익명 쓰기를 기본값으로 두지 않고 권한·감사 로그를 둔다. |
| 근거 | S17 |

### 2.12 JS Paint — 브라우저 데스크톱 UI 재현

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 익숙한 Windows Paint 화면을 곧바로 제공한다. |
| 정보 구조 | 메뉴·창·대화상자·도구·도움말까지 원본 데스크톱 메타포를 충실히 재현한다. |
| 드로잉·입력 | 기본 픽셀 페인트와 간단한 도구가 중심이다. |
| 레이어·객체 | 단일 이미지와 제한적 편집 상태를 명확히 유지한다. |
| 협업 | 핵심 기능이 아니다. |
| 저장·복구 | 오프라인·클립보드·네이티브형 열기/저장 경험을 제공한다. |
| 반응형·모바일 | 데스크톱 메타포가 작은 화면에서는 제약이 있지만 향수와 학습 비용 면에서 강하다. |
| 도움말·발견성 | 운영체제 창처럼 도움말을 편집기 안에 띄운다. |
| ToonStudio에 채택 | 웹에서도 데스크톱급 창·메뉴·파일 경험을 정교하게 구현할 수 있다는 기준으로 활용한다. |
| 피해야 할 점 | 과거 UI를 그대로 복제하지 말고 현대 접근성·터치·반응형을 보완한다. |
| 근거 | S18 |

### 2.13 Sketchpad — 교육·범용 그래픽

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 템플릿·클립아트·텍스트·브러시를 통해 비전문가도 즉시 결과를 만든다. |
| 정보 구조 | 작업별 도구와 커스터마이즈 가능한 Quick Tools를 제공한다. |
| 드로잉·입력 | 브러시·미러·타일·생성형 브러시와 도형·텍스트를 함께 제공하지만 공식 FAQ상 태블릿 필압은 제한된다. |
| 레이어·객체 | 도형·이미지·텍스트·경로·레이어를 통합한다. |
| 협업 | 다중 사용자 기능이 있으나 전문 작화 권한 모델은 제한적이다. |
| 저장·복구 | 로컬 문서와 웹 기반 접근을 강조한다. |
| 반응형·모바일 | 교실·Chromebook·터치 환경에 적합한 큰 도구와 간단한 흐름이 강점이다. |
| 도움말·발견성 | 사용 설명서와 단축키·포인트 편집 안내가 구체적이다. |
| ToonStudio에 채택 | 템플릿·에셋·Quick Tools, 생성형 브러시의 놀이성, 교육 온보딩을 채택한다. |
| 피해야 할 점 | 필압·자연매체가 없는 상태를 전문가 모드까지 확장하지 않는다. |
| 근거 | 공식 Sketchpad 가이드·FAQ |

### 2.14 Pixlr — AI 중심 웹 이미지 편집

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 이미지 열기·붙여넣기·AI 배경 제거 같은 과업 진입점을 전면에 둔다. |
| 정보 구조 | 좌측 도구·상단 속성·레이어·필터의 전통 구조와 원클릭 AI 작업을 결합한다. |
| 드로잉·입력 | 기본 브러시·커스텀 브러시·클론·샤픈·마스크 수정 도구를 제공한다. |
| 레이어·객체 | 레이어 이미지 편집과 빠른 결과 생성이 중심이다. |
| 협업 | 주력 차별점은 아니다. |
| 저장·복구 | 프로젝트 저장과 웹 내 작업을 제공하지만 전문 로컬 우선 설명은 제한적이다. |
| 반응형·모바일 | 빠른 과업 중심 UI가 모바일·비전문가에게 유리하다. |
| 도움말·발견성 | 도구별 짧은 튜토리얼과 AI 레시피를 제공한다. |
| ToonStudio에 채택 | 첫 화면 Task Launcher, 배경 제거 후 마스크 보정, AI 결과의 즉시 수동 수정 흐름을 채택한다. |
| 피해야 할 점 | AI 버튼이 원본 보존·실패 원인·결과 비교 없이 파괴적으로 작동하지 않게 한다. |
| 근거 | Pixlr 공식 도구·에디터 문서 |

### 2.15 Sumo Paint — 웹 창작 스위트 페인팅

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 브러시·필터·텍스트·심볼을 큰 갤러리로 제공해 탐색 자체를 창작 경험으로 만든다. |
| 정보 구조 | 전통 편집기 구조와 제품군 허브를 결합한다. |
| 드로잉·입력 | 다수의 브러시·레이어 효과·필터와 창작형 도구를 강조한다. |
| 레이어·객체 | 레이어·색상 레이어·렌즈·조정·스케일 등의 기능을 제공한다. |
| 협업 | 제품군 커뮤니티와 공유에 가깝다. |
| 저장·복구 | 웹 계정/프로젝트 흐름을 사용한다. |
| 반응형·모바일 | 브라우저 접근성을 강점으로 삼는다. |
| 도움말·발견성 | 기능 설명은 상대적으로 얕아 탐색 의존도가 높다. |
| ToonStudio에 채택 | 브러시·효과 갤러리, 시각적 프리셋 탐색, 즉시 미리보기 마켓을 채택한다. |
| 피해야 할 점 | 프리셋 수가 정보 구조를 압도하지 않게 태그·검색·즐겨찾기·품질 등급을 둔다. |
| 근거 | Sumo 공식 기능 페이지 |

### 2.16 miniPaint — 오픈소스 브라우저 이미지 편집

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 서버 업로드 없이 브라우저에서 이미지 편집을 시작한다. |
| 정보 구조 | 레이어·도구·필터의 전통 구조를 가볍게 구현한다. |
| 드로잉·입력 | 기본 브러시·도형·선택·필터를 제공한다. |
| 레이어·객체 | 로컬 처리와 오픈소스 확장성이 강점이다. |
| 협업 | 핵심 기능이 아니다. |
| 저장·복구 | 클라이언트 처리와 프라이버시가 좋지만 대형 문서 복구는 별도 설계가 필요하다. |
| 반응형·모바일 | 기본 웹 UI로 폭넓게 접근한다. |
| 도움말·발견성 | 오픈소스 코드가 주요 학습 자료다. |
| ToonStudio에 채택 | 로컬 전용 모드와 서버 비전송 보장을 제품 기능으로 제공한다. |
| 피해야 할 점 | Canvas 픽셀만을 유일한 런타임 원본으로 두지 않고 명령·타일 저널을 둔다. |
| 근거 | miniPaint 공식 저장소·사이트 |

### 2.17 Piskel — 웹 픽셀 아트·스프라이트

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 픽셀 아트라는 좁은 과업에 맞춰 그리기·프레임·미리보기를 즉시 노출한다. |
| 정보 구조 | 도구, 프레임 목록, 라이브 애니메이션 미리보기, 내보내기를 단일 화면에 둔다. |
| 드로잉·입력 | 픽셀 단위 펜·색·미러·프레임 복제·onion skin에 특화한다. |
| 레이어·객체 | 프레임과 레이어를 스프라이트 단위로 관리한다. |
| 협업 | 핵심 기능이 아니다. |
| 저장·복구 | 오프라인 빌드와 파일 내보내기가 가능하다. |
| 반응형·모바일 | 모바일 지원은 제한적이어서 작은 화면 전용 재설계 필요성을 보여준다. |
| 도움말·발견성 | 도구가 좁고 직접적이어서 학습 부담이 낮다. |
| ToonStudio에 채택 | Pixel Persona, 실시간 타일/애니메이션 미리보기, 프레임 스트립을 채택한다. |
| 피해야 할 점 | 일반 드로잉 UI 안에 픽셀 기능을 섞지 말고 전용 샘플링·스냅·내보내기 프로필을 둔다. |
| 근거 | Piskel 공식 저장소·사이트 |

### 2.18 Adobe Express — 템플릿·영상·간편 디자인

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 결과물 유형과 템플릿에서 시작하고 AI·자산 검색을 전면에 둔다. |
| 정보 구조 | 선택한 객체/장면에 필요한 속성만 노출하고 영상에서는 장면·모든 레이어 타임라인을 전환한다. |
| 드로잉·입력 | 전문 브러시보다 주석·장식·간단 그리기에 가깝다. |
| 레이어·객체 | 페이지·장면·레이어·템플릿·브랜드 자산·애니메이션을 연결한다. |
| 협업 | 공유·검토·브랜드 팀 작업과 배포가 강하다. |
| 저장·복구 | 클라우드 저장과 다중 기기 연속성이 기본이다. |
| 반응형·모바일 | 기기·작업 유형에 따라 UI를 단순화하며 모바일 흐름이 강하다. |
| 도움말·발견성 | 과업형 도움말과 최신 기능 안내가 빠르게 갱신된다. |
| ToonStudio에 채택 | 템플릿/목표 기반 시작, 장면/전체 타임라인 전환, 객체별 In/Out/Loop 애니메이션, 브랜드 안전 가이드를 채택한다. |
| 피해야 할 점 | 템플릿이 원본 구조를 평탄화하지 않게 컴포넌트·토큰·의미 객체를 유지한다. |
| 근거 | Adobe Express 공식 도움말 |

### 2.19 Canva — 올인원 템플릿 디자인

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 문서 유형·템플릿·AI 검색으로 시작해 빈 캔버스 공포를 없앤다. |
| 정보 구조 | 자산 검색·템플릿·페이지·레이어·앱·데이터·미디어를 과업 중심으로 노출한다. |
| 드로잉·입력 | 전문 드로잉보다 도형·화이트보드·애니메이션·콘텐츠 조립에 강하다. |
| 레이어·객체 | 페이지·요소·표·차트·비디오·오디오·앱을 하나의 편집 모델에 둔다. |
| 협업 | 댓글·공유·프레젠테이션·브랜드·팀 템플릿이 강하다. |
| 저장·복구 | 클라우드 자동 저장·버전·배포가 기본이다. |
| 반응형·모바일 | 모바일과 데스크톱 모두 결과 중심 흐름을 유지한다. |
| 도움말·발견성 | 검색 가능한 대형 도움말과 템플릿 자체가 학습 자료 역할을 한다. |
| ToonStudio에 채택 | Universal Asset Search, 결과 유형 전환, 브랜드/권리 검사, Data Binding, 앱 플러그인 표면을 채택한다. |
| 피해야 할 점 | 에셋 과잉이 전문 드로잉의 집중을 방해하지 않도록 Focus Mode에서 완전히 접을 수 있게 한다. |
| 근거 | Canva 공식 Help Center |

### 2.20 Boxy SVG — 웹 표준 벡터 편집

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | SVG를 열거나 빈 문서에서 직접 조작한다. |
| 정보 구조 | 캔버스 위 geometry·transform·paint 컨트롤과 패널을 조밀하게 결합한다. |
| 드로잉·입력 | 브러시보다 path·shape·gradient·boolean·guide에 강하다. |
| 레이어·객체 | SVG DOM과 가까운 구조로 표준 포맷 가역성이 좋다. |
| 협업 | 핵심 기능이 아니다. |
| 저장·복구 | SVG·SVGZ와 PNG/JPG/WebP/PDF/HTML5 내보내기가 강점이다. |
| 반응형·모바일 | 데스크톱 정밀 조작에 적합하다. |
| 도움말·발견성 | 표준 용어와 직접 조작이 학습 기반이다. |
| ToonStudio에 채택 | SVG 원본 보기·편집, on-canvas paint editor, manual/smart guide, 표준 우선 export를 채택한다. |
| 피해야 할 점 | DOM과 렌더 객체를 문서 원본과 동일시하지 않고 자체 ShapeIR과 round-trip 검증을 둔다. |
| 근거 | Boxy SVG 공식 도움말 |

### 2.21 Spline — 협업 웹 3D·인터랙션

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 대시보드·라이브러리·커뮤니티 예제에서 바로 장면을 복제해 시작할 수 있다. |
| 정보 구조 | 탭, 상단 도구, 좌측 Outliner/Assets, 우측 속성, Play/Presentation의 명확한 3D 편집 구조다. |
| 드로잉·입력 | 2D 브러시가 아니라 벡터·프레임·3D 오브젝트와 이벤트 제작에 초점이 있다. |
| 레이어·객체 | 장면·오브젝트·컴포넌트·상태·이벤트·카메라·조명·재질·자산을 다룬다. |
| 협업 | 자동 저장, 실시간 커서, viewer/editor 역할, 3D 공간에 붙는 comment를 제공한다. |
| 저장·복구 | 클라우드 파일·공유·팀 라이브러리를 기본으로 한다. |
| 반응형·모바일 | 웹 3D의 복잡성을 상단/좌우 패널과 Play 모드로 분리한다. |
| 도움말·발견성 | 짧은 주제형 문서와 라이브러리 예제로 학습 경로를 만든다. |
| ToonStudio에 채택 | Outliner/Assets 전환, 3D comment pin, Play Mode, 이벤트 상태, 예제 복제 학습을 채택한다. |
| 피해야 할 점 | 2D와 3D를 탭으로 단절하지 말고 같은 Shot/Asset/Component를 공유하게 한다. |
| 근거 | S19–S20 |

### 2.22 SketchUp for Web — 브라우저 3D 모델링

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 브라우저에서 데스크톱 코어를 간소화해 모델링을 시작한다. |
| 정보 구조 | Home, 주/확장 툴바, 패널, 메뉴, Search for Tools를 사용해 복잡한 명령을 검색 가능하게 한다. |
| 드로잉·입력 | 선·면·push/pull·측정·스냅 등 3D 직접 모델링 입력에 특화한다. |
| 레이어·객체 | 모델·컴포넌트·재질·스타일·위치·클라우드 파일을 다룬다. |
| 협업 | Link Sharing·Trimble Connect를 사용한다. |
| 저장·복구 | 클라우드 저장과 다운로드를 제공한다. |
| 반응형·모바일 | 웹 버전은 데스크톱 기능을 의도적으로 줄이고 브라우저 단축키 충돌과 확장 부재를 문서화한다. |
| 도움말·발견성 | 도구/명령 검색과 웹 전용 차이를 별도 안내한다. |
| ToonStudio에 채택 | 명령 검색, inferences/snapping 피드백, 웹/데스크톱 기능 차이 표시, 기능 대체 경로 안내를 채택한다. |
| 피해야 할 점 | 웹 제한을 숨기지 말고 capability report와 대체 export/bridge를 제공한다. |
| 근거 | S21–S22 |

### 2.23 Clip Studio Simple/Studio — 태블릿 전문 작화

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | Simple Mode는 도구와 팔레트를 줄이고 Studio Mode는 전체 전문 패널을 제공한다. |
| 정보 구조 | Palette dock, Quick Access, Sub Tool, Tool Property, 소재·3D·타임라인을 사용자 정의한다. |
| 드로잉·입력 | 다양한 브러시·자·퍼스·벡터·채우기·톤·3D·애니메이션을 하나의 전문 체계로 묶는다. |
| 레이어·객체 | 레이어 유형·말풍선·컷·집중선·3D·애니메이션 셀 등 웹툰 의미 객체가 풍부하다. |
| 협업 | 웹 협업보다 클라우드·팀 제작과 파일 워크플로에 가깝다. |
| 저장·복구 | 장치·클라우드·소재 생태계와 긴 기간 축적된 안정성이 강하다. |
| 반응형·모바일 | Simple/Studio 전환과 Companion Mode가 화면·역할 분리를 잘 보여준다. |
| 도움말·발견성 | 대형 공식 매뉴얼과 Tips·소재 커뮤니티가 학습 생태계를 만든다. |
| ToonStudio에 채택 | Simple/Studio 전환, Quick Access, 팝업 팔레트, 웹툰 의미 객체, 브러시 소재 생태계를 채택한다. |
| 피해야 할 점 | 기능 수를 그대로 복제하지 말고 검색·적응형 UI·브라우저 협업으로 정보 밀도를 관리한다. |
| 근거 | Clip Studio 공식 매뉴얼 |

### 2.24 Krita — 오픈소스 전문 페인팅

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 전문 도커 기반이지만 Tab Canvas-only와 Popup Palette로 집중을 빠르게 회복한다. |
| 정보 구조 | 도커·워크스페이스·브러시 프리셋·보조선·필터 마스크를 사용자가 재구성한다. |
| 드로잉·입력 | 다수 브러시 엔진, 글로벌 필압 커브, 보조선, Instant Preview, 자연매체·텍스처가 강하다. |
| 레이어·객체 | 래스터·벡터·필터/투명/색상 마스크·참조 이미지·애니메이션을 관리한다. |
| 협업 | 주력 기능이 아니다. |
| 저장·복구 | 데스크톱 파일과 자동 저장이 중심이다. |
| 반응형·모바일 | 태블릿/캔버스 전용 흐름은 좋지만 웹·모바일 적응은 별도 설계가 필요하다. |
| 도움말·발견성 | 오픈 매뉴얼과 브러시 엔진 설명이 깊다. |
| ToonStudio에 채택 | Canvas-only, Popup Palette, Instant Preview, 전역 필압 커브, 참조 이미지 객체를 채택한다. |
| 피해야 할 점 | 도커 수를 기본 화면에 모두 노출하지 않고 작업 역할별 workspace로 큐레이션한다. |
| 근거 | Krita 공식 매뉴얼 |

### 2.25 Photoshop Web — 웹 전문 이미지 편집

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 클라우드 문서·공유 링크·웹에서 열기 흐름으로 기존 Adobe 자산과 연결한다. |
| 정보 구조 | 데스크톱 개념을 유지하되 Contextual Task Bar로 선택 객체·도구에 맞는 다음 행동을 제안한다. |
| 드로잉·입력 | 브러시·선택·마스크·비파괴 조정·생성형 작업을 웹에 단계적으로 제공한다. |
| 레이어·객체 | Smart Object/Filter, 조정, 마스크, 레이어를 원본 보존 중심으로 다룬다. |
| 협업 | 공유·댓글·클라우드 문서 기반 협업이 강하다. |
| 저장·복구 | 클라우드 자동 저장과 버전이 핵심이다. |
| 반응형·모바일 | 웹 제약 안에서 핵심 도구와 문맥 작업을 우선 노출한다. |
| 도움말·발견성 | Contextual Task Bar 자체가 마이크로 온보딩 역할을 한다. |
| ToonStudio에 채택 | 문맥 작업막대, 다음 행동 추천, 생성형 결과의 마스크·변형·레이어 편입을 채택한다. |
| 피해야 할 점 | 추천이 사용자의 전문 워크플로를 방해하지 않게 고정·숨김·학습 초기화 옵션을 둔다. |
| 근거 | Adobe Photoshop 공식 도움말 |

### 2.26 Concepts — 무한 벡터 스케치

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 무한 캔버스와 도구 휠로 아이디어 스케치를 즉시 시작한다. |
| 정보 구조 | 8개 도구 슬롯, 중앙 크기·불투명도·스무딩 링, 최근 도구와 라이브 미리보기를 손 가까이에 둔다. |
| 드로잉·입력 | 압력·기울기·속도 다이내믹, 편집 가능한 벡터 스트로크, 가이드·측정에 강하다. |
| 레이어·객체 | 스트로크를 벡터 객체로 유지하고 선택·변형·정밀 도구와 결합한다. |
| 협업 | 주력은 개인 스케치지만 공유 워크플로가 있다. |
| 저장·복구 | 장치 중심 문서와 동기화를 제공한다. |
| 반응형·모바일 | 태블릿·펜·터치에 매우 최적화돼 있다. |
| 도움말·발견성 | 도구 휠의 시각적 피드백과 예제가 발견성을 높인다. |
| ToonStudio에 채택 | 사용자 정의 도구 휠, 라이브 브러시 커서, 펜 주변 HUD, 무한 캔버스 측정·스케일을 채택한다. |
| 피해야 할 점 | 원형 UI만 강제하지 않고 키보드·마우스 사용자는 도킹/단축키 경로를 유지한다. |
| 근거 | Concepts 공식 매뉴얼 |

### 2.27 Polotno — 웹 템플릿 편집 SDK

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | 템플릿과 데이터로 편집기를 빠르게 구성하고 프로그램 방식으로 대량 콘텐츠를 생성한다. |
| 정보 구조 | 화이트라벨 UI·캔버스·에셋·내보내기·비즈니스 규칙을 SDK 표면으로 제공한다. |
| 드로잉·입력 | 전문 페인팅보다 요소 배치·템플릿·자동 생성에 강하다. |
| 레이어·객체 | 페이지·텍스트·이미지·비디오·템플릿을 JSON형 모델로 관리한다. |
| 협업 | 호스트 제품이 협업을 구성한다. |
| 저장·복구 | 서버·저장소 선택을 제품에 맡긴다. |
| 반응형·모바일 | 임베드와 모바일 UI 커스터마이즈가 강하다. |
| 도움말·발견성 | SDK 문서와 샘플이 풍부하다. |
| ToonStudio에 채택 | TemplateRuntime, 데이터 병합, 화이트라벨 Extension Slots, headless render API를 채택한다. |
| 피해야 할 점 | 상용 SDK 종속 대신 자체 ProjectGraph 위에 유사 인터페이스를 구현한다. |
| 근거 | Polotno 공식 문서 |

### 2.28 Tooning Editor / 3D Studio — 캐릭터·웹툰·3D 콘텐츠

| 분석 축 | 관찰·해석 |
| --- | --- |
| 진입·온보딩 | My Work 대시보드에서 편집기와 3D Studio로 진입하는 클라우드형 구조다. |
| 정보 구조 | 공개 페이지에서는 캐릭터·표정·포즈·스토리텔링·웹툰/영상 제작 지향을 확인할 수 있으나 로그인 후 메뉴 전체는 외부 분석으로 검증하기 어렵다. |
| 드로잉·입력 | 전문 자유 드로잉보다는 캐릭터·배경·장면 조립과 AI 보조가 중심인 것으로 보인다. |
| 레이어·객체 | CharacterActor·PoseState·ExpressionState·SceneTemplate로 일반화할 수 있다. |
| 협업 | 클라우드 작업·공유 가능성을 참고하되 실제 권한 세부는 직접 제품 감사가 필요하다. |
| 저장·복구 | My Work 기반 프로젝트 보관 구조를 참고한다. |
| 반응형·모바일 | 웹 서비스형 접근과 낮은 학습 비용이 목표다. |
| 도움말·발견성 | 공개 설명과 로그인 내부 도움말을 분리해 조사해야 한다. |
| ToonStudio에 채택 | 캐릭터 포즈/표정 원클릭 상태, 장면 템플릿, 2D/3D 작업 전환, 교육형 콘텐츠 조립을 채택한다. |
| 피해야 할 점 | 검증되지 않은 내부 메뉴를 사실로 단정하지 않고 실제 계정 기반 UX audit 항목으로 남긴다. |
| 근거 | Tooning 공개 제품 페이지·동적 편집기 제한 |

# 3. 경쟁 제품에서 추출한 웹 UX 우위 원칙

| 원칙 | 구현 의미 |
| --- | --- |
| 즉시 가치 | 대시보드·회원가입보다 빈 캔버스나 열린 파일을 먼저 보여준다. 계정은 저장·협업 시점에 요구할 수 있다. |
| 복잡도 적응 | 초보·집중·전문·검수·발표 UI를 별도 문서 모드가 아니라 동일 문서의 `WorkspaceProfile`로 구현한다. |
| 문맥 우선 | 선택된 객체와 도구에 필요한 속성만 우선 노출하고 전체 기능은 메뉴·Command Palette에서 항상 검색 가능하게 유지한다. |
| 손 가까운 조작 | 펜 주변 HUD, radial menu, Recent Tools, on-canvas handles로 커서 이동 거리를 줄인다. |
| 실수 회복 | Undo뿐 아니라 crash recovery, branch, before/after, compatibility report, 왜 동작하지 않는지 진단을 제공한다. |
| 개인 보기와 공유 상태 분리 | 개인 가시성·패널 배치·카메라·선택은 사용자 세션에, 실제 레이어·문서 변화만 공유 그래프에 둔다. |
| 기기 역할 분리 | 펜은 그리기, 손가락은 카메라, 키보드는 명령, 보조 폰은 palette/shortcut/preview로 역할을 정한다. |
| 도움말의 실행 가능성 | 메뉴 경로만 적는 정적 문서가 아니라 현재 모드를 감지하고 명령을 실행·강조·되돌릴 수 있게 한다. |
| 기능 제한의 정직한 표시 | 브라우저·GPU·파일 포맷이 지원하지 않는 기능은 숨기지 않고 이유·근사·서버/데스크톱 bridge를 보여준다. |
| 성능 품질을 UI로 관리 | 자동 품질 저하가 몰래 일어나지 않게 현재 프로필·원인·원복 조건·고품질 bake 옵션을 표시한다. |

# 4. 최종 Adaptive Workspace 아키텍처

## 4.1 워크스페이스 프로필

| 프로필 | 주 사용자/작업 | 기본 노출 UI | 참고 장점 |
| --- | --- | --- | --- |
| Quick Start | 처음 방문·간단 수정 | 캔버스·색·크기·Undo·저장만 | Kleki·Excalidraw |
| Focus Draw | 선화·필기 | 캔버스 전용, radial HUD, Recent Tools, 레이어 최소 | Krita Canvas-only·Concepts |
| Paint Studio | 자연매체·채색 | 브러시·색·레이어·참조·믹서·종이 패널 | CSP·Krita·Magma |
| Vector / Design | 일러스트·UI·도형 | 레이어·속성·컴포넌트·변수·Auto Layout | Figma Draw·Penpot·Boxy SVG |
| Comic / Webtoon | 컷·대사·톤·3D | 페이지/스크롤·말풍선·컷·캐릭터·제작 상태 | Clip Studio·Storyboard |
| Photo / Composite | 리터치·합성 | 선택·마스크·채널·Smart Object·EffectGraph | Photopea·Photoshop |
| Animate | 프레임·리깅·모션 | 타임라인·도프시트·그래프·오디오·미리보기 | Rive·Storyboard·Adobe Express |
| 3D / Pose | VRM·룸·카메라 | Outliner·Assets·Properties·Play·Shot | Spline·SketchUp |
| Review / Teach | 검수·교육·발표 | 댓글·레이저·권한·통화·버전·follow | Magma·Draw.Chat·Spline |
| Present / Publish | 발표·출고 | 슬라이드·미리보기·프리플라이트·분석·배포 | PowerPoint·Canva·Genially |
| Custom | 전문 사용자 | 도킹·팝아웃·매크로·단축키·플러그인 | CSP Studio·Photopea·Krita |

`WorkspaceProfile`은 프로젝트 파일과 분리해 사용자·기기별로 저장한다. 다른 사용자가 같은 문서를 열어도 자신의 패널·제스처·도구 슬롯을 유지한다.

```ts
interface WorkspaceProfile {
  id: string;
  persona: "quick" | "draw" | "paint" | "vector" | "comic" | "photo" |
           "animate" | "3d" | "review" | "present" | "custom";
  deviceClass: "desktop" | "tablet" | "phone" | "dual-screen";
  panelLayout: DockLayoutSnapshot;
  toolSlots: ToolPresetRef[];
  gestureMap: GestureBinding[];
  shortcutMap: ShortcutBinding[];
  qualityPreference: "auto" | "latency" | "balanced" | "quality";
  accessibility: AccessibilityPreferences;
}
```

## 4.2 화면 구조

```text
┌──────────────────────────────────────────────────────────────────┐
│ App Bar: 문서·모드·저장·공유·명령 검색·Capability 상태          │
├─────────────┬──────────────────────────────────────┬─────────────┤
│ Tool Rail   │ Canvas / Artboard / 3D / Timeline   │ Inspector   │
│ + Favorites │  ├─ Context HUD                     │ + Layers    │
│ + Mode      │  ├─ Reference pins                  │ + Assets    │
│             │  └─ Presence / comments             │ + History   │
├─────────────┴──────────────────────────────────────┴─────────────┤
│ Status / Sequence / Timeline / Performance / Storage             │
└──────────────────────────────────────────────────────────────────┘

Phone: Tool Rail→하단 툴바, Inspector→한 번에 하나의 bottom sheet
Tablet: Canvas 중심 + 좌우 edge palette + radial HUD
Desktop: 1열/2열/다중 도킹 + popout window
```

## 4.3 UI 엔진·라이브러리 배치

| 기능 | 권장 엔진/라이브러리 | 사용 범위 | 판정 |
| --- | --- | --- | --- |
| Accessible component behavior | React Aria | 컬렉션·키보드 다중 선택·가상 포커스·외부 파일 DnD | 기본 선택 |
| Overlay primitives | Radix Primitives | Dialog·Menu·Popover·Tabs·Toolbar의 초점·ARIA | 기본 선택 |
| Floating placement | Floating UI + CSS Anchor Positioning | 툴팁·컨텍스트 속성·펜 주변 HUD 충돌 회피 | 점진적 향상 |
| Docking workspace | FlexLayout adapter / Dockview 후보 | 탭·분할·도킹·팝아웃·레이아웃 JSON | 어댑터 뒤 채택 |
| Panel resizing | react-resizable-panels 또는 자체 CSS Grid | 패널 최소/최대·키보드 조절·저장 | 경량 경로 |
| Drag and drop | React Aria DnD / dnd-kit | 레이어·에셋·패널 정렬, 터치·키보드·스크린리더 | 용도별 선택 |
| Tool state machines | XState + 자체 typed events | 펜·선택·변형·텍스트·제스처·비동기 export | 핵심 |
| Transient UI state | Zustand/Jotai 후보 | 패널·hover·modal·사용자 설정 | 문서 상태와 분리 |
| Immutable patches | Immer 또는 자체 CommandDiff | UI·명령 패치 생성 | 핵심 문서에는 자체 포맷 |
| Virtualization | TanStack Virtual | 수천 레이어·자산·프리셋·버전 목록 | 핵심 |
| Command palette | cmdk 후보 + CommandRegistry | 메뉴·도구·설정·도움말·매크로 통합 검색 | 핵심 |
| Hotkeys | 자체 ShortcutResolver + tinykeys 참고 | 브라우저 충돌·키보드 배열·chord·pen button | 직접 개발 |
| Schema validation | Zod / Valibot 후보 | 플러그인·문서·명령 payload 검증 | 핵심 |
| Worker RPC | Comlink + binary protocol | UI 작업은 Comlink, 고주파 입력/타일은 직접 메시지 | 혼합 |
| Localization | ICU4X + i18next/FormatJS | 한국어·CJK·RTL·복수형·명령 검색 동의어 | 핵심 |
| Telemetry | OpenTelemetry Web + 자체 로컬 지표 | 첫 획·프레임·오류·복구·도구 발견 | 옵트인/프라이버시 |
| Testing | Playwright + Vitest + Storybook | 브라우저·입력·접근성·시각 회귀·컴포넌트 | 핵심 |

UI 라이브러리 자체의 상태를 문서 원본으로 쓰지 않는다. 모든 메뉴·단축키·툴팁·권한·도움말은 공통 명령 메타데이터에서 파생한다.

```ts
interface CommandDescriptor<P = unknown> {
  id: string;
  labelKey: string;
  category: string[];
  icon?: IconId;
  defaultShortcuts: Shortcut[];
  contexts: ContextPredicate[];
  capability?: CapabilityPredicate;
  permission?: PermissionPredicate;
  execute(ctx: CommandContext, payload: P): Promise<CommandResult>;
  help: { summary: string; video?: AssetRef; recipe?: RecipeRef[] };
  telemetry?: { event: string; privacy: "local" | "opt-in" };
  pluginExposure: "none" | "invoke" | "extend";
}
```

# 5. 최종 메뉴·명령 정보 구조

모든 명령은 상단 메뉴, Command Palette, 컨텍스트 메뉴, 툴팁, 단축키, 플러그인 API에서 같은 ID를 사용한다. 모바일에서는 메뉴를 그대로 축소하지 않고 **과업 카드와 검색**으로 변환한다.

## 5.1 파일

- 새 프로젝트
- 빠른 빈 캔버스
- 템플릿에서 새로 만들기
- 클립보드에서 새로 만들기
- 카메라/스캐너에서 가져오기
- 열기
- 최근 문서
- 로컬 파일 연결
- URL/클라우드에서 열기
- PSD/PSB 가져오기
- SVG/PDF 가져오기
- PPTX 가져오기
- GLB/VRM/OBJ 가져오기
- 저장
- 다른 이름으로 저장
- checkpoint 만들기
- 버전 이름 지정
- 브랜치 만들기
- 복구 센터
- 저장 상태/용량
- 내보내기
- 빠른 PNG/WebP
- PSD 호환 내보내기
- SVG/PDF
- PPTX
- 동영상/GIF
- GLB/VRM
- 웹 패키지
- 플랫폼 출고 패키지
- 프리플라이트
- 권리 BOM
- 문서 정보
- 닫기

## 5.2 편집

- 실행 취소
- 다시 실행
- 히스토리 패널
- 잘라내기
- 복사
- 병합 복사
- 붙여넣기
- 제자리에 붙여넣기
- 새 레이어로 붙여넣기
- 모두 선택
- 선택 해제
- 환경설정
- 단축키
- 제스처
- 펜 보정
- 명령 검색
- 매크로/액션
- 찾기/바꾸기

## 5.3 보기

- 확대/축소
- 화면 맞춤
- 100%
- 캔버스 회전/반전
- Canvas-only
- 분할 보기
- 새 창
- 참조 창
- 미니맵
- 그레이스케일 미리보기
- 색맹 시뮬레이션
- 소프트 프루프
- 픽셀 미리보기
- 벡터 외곽선
- 오버프린트
- 그리드
- 가이드
- 자
- 스냅
- 안전 영역
- 성능 오버레이
- 협업 커서
- 개인 가시성

## 5.4 캔버스

- 캔버스 크기
- 이미지 크기
- 해상도/DPI
- 자르기/확장
- 회전/뒤집기
- 투명 여백 제거
- 타일 모드
- 대칭 모드
- 무한 캔버스로 전환
- 아트보드/페이지/슬라이드 추가
- 웹툰 세로 스트립 설정
- 배경/종이 재질
- 색상 프로필
- 타임랩스 설정

## 5.5 레이어

- 새 래스터/벡터/텍스트/3D/조정/참조 레이어
- 그룹/폴더
- 복제
- 스마트 연결 객체
- 컴포넌트화
- 마스크
- 벡터 마스크
- 클리핑
- Alpha Lock
- 블렌드
- 레이어 스타일
- 효과 그래프
- 병합/평탄화
- 래스터화
- 트림
- 소유권/checkout
- 개인 가시성
- 검색/필터
- 정렬/배분
- 레이어 컴프
- 플랫폼 상태
- 색상 라벨
- 태그
- 삭제

## 5.6 선택

- 사각/타원/올가미/다각형
- 마술봉
- 색상 범위
- 초점 영역
- 피사체/사람/말풍선/컷 선택
- 레이어 투명도 선택
- 확장/축소
- Feather
- Smooth
- Border
- Grow similar
- Quick Mask
- 선택 저장/불러오기
- 벡터화
- 선택에서 마스크

## 5.7 변형

- 자유 변형
- 정확한 수치 변형
- Perspective
- Distort
- Warp
- Mesh Warp
- Puppet
- Liquify
- Content-aware Scale
- Flip/Rotate
- Pivot
- Align/Distribute
- Constraint
- Auto Layout
- Repeat/Radial/Grid
- Path 따라 배치
- 물리 정착

## 5.8 브러시

- 브러시 선택
- 최근 도구
- 프리셋 저장
- 가져오기/내보내기
- Brush Studio
- Brush Graph
- Dual/Multi Tip
- 팁 만들기
- 필압/속도/기울기/회전 매핑
- 안정화
- 텍스처/종이
- 혼색/스머지
- 브러시모 물리
- 파티클
- 대칭/자/퍼스
- Brush DNA 혼합
- 브러시 팩 관리
- 라이선스/출처
- 회귀 테스트

## 5.9 필터

- 조정 레이어
- 밝기/색상
- 블러/샤픈
- 노이즈/질감
- 왜곡/Liquify
- 스타일화
- 웹툰 톤/선화
- 렌즈/카메라
- 3D Depth/Normal 효과
- AI 보조
- 필터 갤러리
- Effect Graph
- 프리셋 저장
- 필터 마스크
- 고품질 렌더
- 백엔드/품질 진단

## 5.10 벡터

- 펜/노드
- Vector Network
- Shape Builder
- Boolean
- Offset Path
- Simplify/Smooth
- 가변 폭
- Outline/Expand
- Live Path Effect
- Pattern Along Path
- Text on Path
- Gradient Mesh
- Envelope
- Perspective Grid
- 벡터 지우개
- 교차점까지 지우기
- 래스터 추적

## 5.11 텍스트·말풍선

- 텍스트
- 세로쓰기
- 문단/문자 스타일
- 변수 폰트
- 폰트 대체
- 루비/금칙
- Text on Path
- 말풍선 생성
- 꼬리 편집
- 대사 연결
- 자동 크기
- 번역 Variant
- 효과음 스타일
- 읽기 순서
- 접근성 대체 텍스트
- 폰트 권리 검사

## 5.12 웹툰·스토리

- 작품/화/장면/샷/컷
- 스크립트 가져오기
- 대사 분해
- 콘티 생성
- 컷 분할/병합
- 세로 스크롤 리듬
- 톤/집중선/속도선
- 캐릭터·의상·소품 상태
- 연속성 검사
- 읽기 순서 검사
- 플랫폼 미리보기
- 팀 역할/검수
- 번역/현지화
- 출고 패키지

## 5.13 애니메이션

- 타임라인
- 프레임/셀
- Onion Skin
- 키프레임
- 도프시트
- 그래프 에디터
- 리깅
- 상태 머신
- 오디오/비디오
- 립싱크
- 카메라
- 모션 패스
- Lottie/Rive 가져오기
- 타임랩스
- 프록시
- WebCodecs 내보내기

## 5.14 3D·물리

- 3D 오브젝트/VRM 가져오기
- 룸 빌더
- 모델링
- Sculpt
- Boolean
- 재질/UV
- 텍스처 페인트
- 카메라/조명
- 포즈/IK/FK
- 표정/Look-at
- 강체/관절
- 천/헤어/로프
- 물리 배치
- Bake
- Line/Shadow/Depth/Normal/ID 패스
- 3D→2D 벡터 선화
- WebXR 미리보기

## 5.15 협업

- 공유
- 초대/권한
- 게스트 링크
- E2EE snapshot
- 커서/Presence
- Follow
- 레이저
- 댓글/핀
- 음성/영상
- 레이어 소유권
- soft lock
- 제안 브랜치
- 비교/merge
- 리뷰 상태
- 감사 로그
- 교육/감독 모드
- 오프라인 변경 동기화

## 5.16 창

- 워크스페이스 프로필
- 패널 표시/숨김
- 도킹/팝아웃
- 도구
- 속성
- 색상
- 브러시
- 레이어
- 자산
- 참조
- 히스토리
- 타임라인
- 3D Outliner
- 댓글
- 통신
- 성능
- 저장 상태
- 도움말
- 레이아웃 저장/초기화

## 5.17 도움말

- 명령 검색
- 대화형 시작
- 현재 도구 도움말
- 영상 툴팁
- 레시피
- 단축키
- 브라우저/장치 호환
- 왜 그려지지 않나요?
- 성능 진단
- 복구 안내
- 파일 호환 보고서
- 새 기능
- 마이그레이션
- 플러그인 SDK
- 문제 신고
- 진단 번들 내보내기

# 6. 도움말·온보딩·진단을 제품 코어로 만드는 구조

## 6.1 `HelpGraph`

```text
CommandDescriptor
 ├─ 메뉴명/단축키/아이콘
 ├─ 10초 영상 툴팁
 ├─ 설명·주의·브라우저 제한
 ├─ 대화형 Recipe
 ├─ 문제 진단 규칙
 ├─ 버전별 변경점
 └─ 플러그인/자동화 API
```

### 도움말 표면
- 아이콘 hover·long-press: 3–10초 무음 영상, 한 줄 설명, 단축키, 현재 사용 가능 여부
- 속성 옆 “?”: 파라미터가 선에 어떤 영향을 주는지 live mini-canvas
- Command Palette: 기능명뿐 아니라 “선이 떨려요”, “흰 테두리 없이 채우기” 같은 자연어·동의어 검색
- Recipe: 현재 문서의 복제 브랜치에서 단계별로 명령을 실행하고 완료 후 적용/폐기
- Shortcut panel: 현재 workspace와 키보드 배열에 맞춰 충돌·대체키 표시
- Compatibility report: 브라우저·GPU·파일별 미지원 이유와 권장 대체 경로
- Diagnostic bundle: 개인정보를 제외한 capability·로그·재현 명령·GPU 정보·문서 통계를 내보내기
- Versioned manual: 기능 버전과 문서 schema 버전을 명시하고 오래된 프로젝트 migration을 연결

## 6.2 “왜 그려지지 않나요?” 진단 순서

1. 현재 레이어가 잠김·숨김·읽기 전용·다른 사용자가 checkout했는가?
2. 선택 영역이 비어 있거나 Quick Mask·Alpha Lock·Clipping이 제한하는가?
3. 브러시 불투명도·Flow·색상 alpha·레이어 opacity가 0에 가까운가?
4. 벡터 도구가 래스터 레이어, 래스터 도구가 읽기 전용 객체에 적용되는가?
5. 스타일러스 입력이 브라우저 스크롤/필기 기능에 가로채졌는가?
6. GPU context가 손실됐거나 shader compile이 실패했는가?
7. OPFS quota·메모리·탭 절전·저전력 모드가 작업을 제한하는가?
8. 협업 권한·브랜치·리뷰 상태가 쓰기를 차단하는가?

진단 결과에는 **바로 고치기**, **일시 우회**, **자세히 보기**, **변경 취소**를 함께 제공한다.

# 7. 브라우저·장치 Capability Center

| 범주 | 진단 항목 |
| --- | --- |
| 입력 | PointerEvent, pointerrawupdate, coalesced/predicted, pressure/tilt/twist, hover, pen buttons |
| 그래픽 | WebGPU adapter/features/limits, WebGL2 extensions, max texture, context loss test |
| WASM | SIMD, threads, crossOriginIsolated, shared memory, module cache |
| 저장 | OPFS, sync access handle in worker, File System Access, quota/persistence status |
| 클립보드/파일 | Async Clipboard, drag/drop, directory handle, image decode/encode |
| 미디어 | WebCodecs codecs, AudioWorklet, MediaRecorder, WebRTC, camera/mic permission |
| 화면 | fullscreen, PWA install, multi-screen/window, DPR, color-gamut, HDR media query |
| 접근성 | reduced motion, forced colors, contrast, screen reader keyboard route |

## 7.1 품질 등급

| 등급 | 조건 | 기능 정책 |
| --- | --- | --- |
| Tier A – Pro GPU | WebGPU + WASM SIMD/threads + OPFS | Vello/CanvasKit/WebGPU full, WetMedia/3D 고품질, 120Hz 옵션 |
| Tier B – Standard | WebGPU 또는 안정 WebGL2 + WASM SIMD | 대부분 기능, solver/particle adaptive, 60Hz 목표 |
| Tier C – Compatible | WebGL2 + 제한 WASM | Pixi/CanvasKit WebGL, 자연매체 근사, 낮은 타일 cache |
| Tier D – Safe | Canvas2D/CPU WASM | 문서 열기·기본 편집·export·복구, 고급 효과는 bake/read-only |
| Server/Headless | CPU renderer + optional GPU worker | thumbnail, batch export, compatibility verification |

등급은 기기 브랜드로 결정하지 않고 런타임 probe와 실제 2초 내외 micro-benchmark로 결정한다. 사용자는 Auto 결과를 덮어쓸 수 있고, 고품질 bake는 인터랙티브 미리보기와 별도로 실행할 수 있다.

# 8. 최종 멀티엔진 아키텍처

```text
React / Adaptive Workspace / Accessibility
                │
CommandRegistry ├─ HelpGraph ─ ShortcutResolver ─ CapabilityProbe
                │
ToolStateMachine / GestureRouter / ContextActionResolver
                │
StudioProjectGraph + CommandBus + VersionGraph
                │
StrokeIR · ShapeIR · TextIR · LayerGraph · EffectGraph · Scene3DIR
                │
RenderIslandCompiler + ComputePlanner + CodecRouter
                │
┌──────────┬───────────┬───────────┬─────────┬──────────┬──────────┐
│ Vello    │ CanvasKit │ WebGPU    │ PixiJS  │ ThorVG   │ CPU/WASM │
│ Vector   │ Skia/Text │ Pixel/FX  │ WebGL   │ SVG/Lot. │ Export   │
└──────────┴───────────┴───────────┴─────────┴──────────┴──────────┘
                │
HybridFrameGraph / GPUInteropBroker / Single Present Owner
                │
OPFS Journal · Binary Tiles · Yjs Metadata · E2EE · Server Export
```

## 8.1 엔진별 최종 역할

| 영역 | 주 엔진 | 장점 활용 | 폴백 |
| --- | --- | --- | --- |
| 대량 동적 벡터·선화 | Vello Classic/Hybrid | 가변 폭 outline, 수천 path, 편집 오버레이 | CanvasKit/tiny-skia |
| Skia 호환 벡터·텍스트·효과 | CanvasKit | Paragraph, PathEffect, ImageFilter, SkSL, Skottie | software CanvasKit |
| 고성능 래스터·유체·필터 | Custom WebGPU | 희소 타일, dab, smudge, wet media, particle, compute DAG | WebGL2/Pixi/CPU WASM |
| 안정 WebGL 스프라이트·타일 | PixiJS WebGL | 레퍼런스 보드, 타일 합성, 스프라이트, fallback | Canvas2D |
| SVG·Lottie 경량 아일랜드 | ThorVG | 다수 작은 SVG/Lottie, 벡터 애니메이션 | resvg/CanvasKit |
| 결정적 SVG/CPU 출력 | resvg + tiny-skia | 썸네일·서버/Worker export·회귀 기준 | CanvasKit CPU |
| 자연매체 프리셋 | Hokusai + libmypaint 비교 | .myb, smudge, spectral mix, tile surface | GPU raster approximation |
| 벡터 기하 | Kurbo/Lyon/Paper.js/Clipper2 | offset·boolean·intersection·stroke outline | CanvasKit PathOps |
| 선 보정 | Perfect Freehand + fit-curve + 자체 Rust | 압력 outline, Bézier, One-Euro/Spring/Lazy | JS 단순화 |
| 이미지 분석·형태학 | OpenCV.js | 마술봉·모폴로지·엣지·perspective·inpaint | WebGPU custom |
| CPU/WASM 필터 | Photon + wasm-vips | 경량 필터·대형 resize·batch·codec 전처리 | CanvasKit CPU |
| 3D 장면 | Three.js + Babylon.js 선택 어댑터 | VRM·NPR·WebXR·shader·scene | 정적 GLB render |
| 3D/2D 강체 물리 | Rapier | 충돌·관절·sensor·snapshot·배치 | Box2D/Planck |
| 천·소프트바디 | JoltPhysics.js 동적 모듈 | cloth·soft body·고급 ragdoll | 자체 XPBD bake |
| 펜촉·브러시모·리본 | Custom Rust/WASM XPBD | 수백 경량 제약·결정적 seed·bake | 간이 spring |
| CAD·Boolean | Manifold + replicad/OpenCascade | 강건 mesh boolean·parametric feature | Three CSG preview |
| 텍스트 shaping | HarfBuzz/Parley/ICU4X | CJK·RTL·줄바꿈·font fallback | CanvasKit Paragraph |
| 협업 | Yjs + binary tile/version service | 의미 객체 CRDT, presence, branch, binary assets | read-only snapshot |
| 로컬 저장 | OPFS + SQLite WASM index | journal·checkpoint·asset index·quota | IndexedDB |

## 8.2 Render Island 라우팅

```ts
type Backend = "vello" | "canvaskit" | "webgpu" | "pixi-webgl" |
               "thorvg" | "cpu";

interface RouteCost {
  capability: number;      // 기능 정확도
  visualParity: number;    // 기준 렌더 일치도
  frameCost: number;
  memoryCost: number;
  transferCost: number;    // 엔진 간 복사 비용
  recoveryRisk: number;
}

selectBackend(island, device, quality, currentFrameGraph): Backend
```

라우팅은 “이 기능은 항상 CanvasKit”처럼 정적이지 않다. 예를 들어 작은 Gaussian blur는 CanvasKit, 장축 8K 레이어의 큰 blur는 WebGPU tiled pass, 서버 썸네일은 CPU로 보낸다.

## 8.3 엔진 간 교환 우선순위

1. 동일 `GPUDevice`의 `GPUTexture`/view 공유
2. 같은 HybridFrameGraph 안에서 render/compute pass 연결
3. ExternalTexture 또는 엔진별 texture import
4. ImageBitmap transferable
5. SharedArrayBuffer 타일
6. CPU readback — export·검사 외에는 금지

# 9. 브러시 품질 최종 배치

| 브러시 계열 | 주 조합 | 품질 핵심 | 폴백 |
| --- | --- | --- | --- |
| G펜·매핑펜 | Pointer L3 + Rust stabilizer + Perfect Freehand/Kurbo + Vello | 낮은 지연, 모서리 보존, 가변 폭 사후 편집 | CanvasKit outline |
| 모노라인·기술 펜 | Kurbo/Lyon path + Vello stroke | 균일 폭·고정밀 AA·벡터 편집 | CanvasKit |
| 캘리그래피·평붓 | tilt/twist + XPBD nib + outline fill + Vello | 펜촉 회전·탄성·방향성 | CanvasKit |
| 연필·샤프 | WebGPU dab + FastNoiseLite + paper texture + Vello compose | 입자·압력·종이 결·누적 농도 | CanvasKit SkSL |
| 목탄·파스텔·분필 | Hokusai/libmypaint + procedural tip + GPU pickup/deposit | 입자 깨짐·번짐·종이 고점 접촉 | raster approximation |
| 마커·형광펜 | WebGPU dab + multiply/transparency + edge pooling | 겹침·끝 고임·chisel nib | CanvasKit blend |
| 에어브러시 | WebGPU compute particles/density field | 큰 반경에서도 균일·저노이즈·마스크 | Pixi particle |
| 수채화 | Hokusai injection + custom WetMedia WebGPU + Spectral mix | wet-on-wet, backrun, granulation, paper absorption | reduced tile solver |
| 수묵·먹 | InkWash clean-room + WetMedia + fiber flow + Vello line | 농담·번짐·먹 고임·붓 갈라짐 | Hokusai raster |
| 유화·아크릴·과슈 | XPBD bristle + pigment reservoir + height/normal tiles | pickup/deposit·점성·임파스토·팔레트 나이프 | Hokusai flat mode |
| 드라이브러시 | XPBD bristle contact + paper height + sparse dab | 털 갈라짐·부분 접촉·잔량 감소 | multi-tip stamp |
| 스머지·믹서 | WebGPU gather/scatter + pigment model + bristle reservoir | 기존 색 pickup·운반·deposit | CanvasKit blur proxy |
| 스프레이·입자 | WebGPU particles + SDF collision + deterministic seed | 잉크 튐·먼지·눈·꽃잎·잔디 | PixiJS particle |
| 패턴·장식 | Vello/CanvasKit path sampling + image atlas + Poisson disk | 잎·체인·레이스·건물·톤 반복 | Pixi sprite |
| 리본·로프·헤어 | Rust XPBD + curve fitting + Vello fill/stroke | 처짐·관성·탄성·충돌 후 벡터 bake | Planck/Verlet preview |
| 픽셀·디더 | integer grid WebGPU/Canvas2D + palette LUT | 정수 스냅·색 제한·tile preview·onion skin | CPU |
| 벡터 패턴·아트 브러시 | Vello + CanvasKit PathEffect + SVG tip | 확대 무손실·path-aligned 반복·폭 재편집 | ThorVG/resvg |
| 3D 표면 페인트 | Three/Babylon UV picking + WebGPU texture tiles | seam-aware clone·PBR 채널·2D/3D 동시 보기 | CPU bake |
| 물리 파편·효과선 | Rapier/Jolt scene events + WebGPU/Vello bake | 충돌점에서 파편·먼지·충격선 자동 생성 | static preset |
| AI 보조 브러시 | ONNX Runtime Web/Transformers.js adapter + reversible mask node | 선 정리·질감 제안·선택 보조, 원본과 seed 보존 | 서버 inference |

## 9.1 공통 입력 파이프라인

```text
pointerrawupdate / coalesced / predicted
→ 장치 프로필·압력 dead-zone·기울기/회전 교정
→ timestamp 정규화·resampling
→ 브러시별 stabilizer graph
→ pressure/velocity/tilt/twist dynamics
→ preview backend (즉시)
→ canonical backend (정확)
→ StrokeIR + TileDiff + seed 저장
→ Vello/CanvasKit/WebGPU 최종 합성
```

## 9.2 필기감 UI
- 장치별 압력 그래프와 최소 압력·최대 압력·dead zone을 실시간 시각화한다.
- Stabilizer는 숫자 하나가 아니라 `즉시`, `균형`, `정밀`, `긴 선`, `캘리그래피` 프로필과 고급 그래프를 제공한다.
- 브러시 크기 커서는 실제 팁·회전·산란 범위·예상 불투명도를 보여준다.
- 예측 stroke는 흐리거나 별도 overlay로 표시하지 않고 canonical 결과와 시각적으로 자연스럽게 교체한다.
- 브러시가 지연되면 원인이 크기·spacing·입자·wet solver·stabilizer 중 무엇인지 속성 패널에서 알려준다.
- 프리셋 저장 시 엔진 버전·tip·paper·color model·license·fallback preset을 함께 기록한다.

# 10. 필터·효과 최종 배치

| 필터군 | 주 조합 | 품질/구조 | 폴백 |
| --- | --- | --- | --- |
| 노출·밝기·대비·감마 | CanvasKit ColorFilter/SkSL | 단일 패스 실시간, 조정 레이어 | Photon/CPU |
| Levels·Curves | WebGPU LUT/curve texture + CanvasKit | 16/32-bit 확장 가능한 비파괴 노드 | CPU LUT |
| HSL·HSV·Vibrance·색상 균형 | SkSL/WebGPU color space shader + Color.js/Culori | 선택 색역·gamut 정책 | Photon |
| Gradient Map·Duotone·LUT | WebGPU 1D/3D LUT + CanvasKit compose | 미리보기·프리셋·색상 관리 | CPU |
| Gaussian/Box/Directional Blur | CanvasKit ImageFilter 작은 반경; WebGPU 대형/다중패스 | 아일랜드 크기·반경으로 자동 라우팅 | Photon |
| Bilateral·Surface·Median Blur | Custom WebGPU + OpenCV.js fallback | 엣지 보존·피부·톤 정리 | CPU WASM |
| Sharpen·Unsharp·High Pass | CanvasKit convolution/SkSL + WebGPU | 실시간·마스크·blend | Photon |
| Bloom·Glow·Drop Shadow | CanvasKit ImageFilter 또는 WebGPU graph | 벡터/래스터 공통 비파괴 효과 | ThorVG |
| Noise·Grain·Paper | FastNoiseLite WGSL + texture synthesis | 결정적 seed·해상도 독립 질감 | CanvasKit SkSL |
| Halftone·Screen Tone·Dither | WebGPU analytic pattern + Vello vector tone | 모아레 경고·출력 DPI 인지 | CanvasKit |
| Edge·Line Extraction | OpenCV.js/Canny + WebGPU Sobel/XDoG + vector trace | 사진→선화·깊이/normal 결합 | CPU |
| Morphology·Gap Close | OpenCV.js distance/morphology + GPU jump flood | 선화 닫기·선택 확장·채우기 | CPU |
| Magic Wand·Color Range | GPU flood fill + OpenCV color segmentation | 표시 레이어·참조 정책·tolerance preview | CPU |
| Liquify·Warp·Mesh | WebGPU displacement grid + CanvasKit sampling | 브러시형 push/twirl/pucker·비파괴 mesh | CPU |
| Perspective·Lens·Fisheye | OpenCV calibration + WebGPU resample | 카메라·3D와 파라미터 공유 | CanvasKit |
| Content-aware / Inpaint | OpenCV Telea/Navier + optional ONNX model | 마스크·confidence·reversible node | 서버 모델 |
| Chromatic aberration·Glitch | SkSL/WebGPU | 실시간 모션 가능 효과 | CanvasKit |
| Oil/Cartoon/Crosshatch | WebGPU multi-pass + vector hatch generator | 스타일 분리·강도·마스크 | Photon |
| Depth/Normal/ID 기반 효과 | Three/Babylon G-buffer + WebGPU graph | DOF·안개·선폭·색상·재조명 | static passes |
| Text/Vector Appearance | CanvasKit PathEffect/ImageFilter + Vello scene | 다중 stroke/fill·offset·shadow·roughen | resvg |
| SVG Filter | ThorVG/resvg/CanvasKit + custom unsupported nodes | 표준 round-trip과 fallback report | rasterize |
| Video/Animation effects | WebCodecs + WebGPU frame graph | 타임라인 keyframe·proxy·export | ffmpeg.wasm |
| Color-managed print proof | LittleCMS WASM candidate + CanvasKit/output pipeline | ICC soft proof·gamut warning·CMYK preview | server preflight |
| AI semantic adjustment | ONNX Runtime Web + segmentation/depth | 사람·하늘·말풍선·캐릭터별 조정 마스크 | server inference |

필터는 레이어에 즉시 굽지 않고 `EffectGraphIR`의 노드로 저장한다. 노드별로 ROI 확장, 타일 halo, 색상 공간, premultiplied alpha, bit depth, GPU/CPU 결정성을 명시한다.

```ts
interface EffectNodeIR {
  id: string;
  type: string;
  version: number;
  inputs: PortRef[];
  params: Record<string, unknown>;
  roi: "local" | "expanded" | "global";
  colorContract: ColorContract;
  alphaContract: "premultiplied" | "straight";
  preferredBackends: Backend[];
  deterministicSeed?: number;
}
```

# 11. 웹 제품 차별화 기능과 구현 서비스

| 기능 | 사용자 가치·행동 | 구현 서비스 |
| --- | --- | --- |
| 즉시 시작 | 빈 캔버스를 셸 로드 직후 표시하고 무거운 WASM/브러시는 idle/lazy load | ShellLoader + FeatureChunkRegistry |
| Task Launcher | 빈 문서·PSD/PDF/PPTX/이미지 열기·클립보드·카메라·템플릿·공동 보드 | ImportRouter + TemplateRegistry |
| Adaptive Workspace | 기기·화면·펜·역할·작업·성능에 따라 패널과 도구를 재배치 | WorkspaceProfileEngine |
| Contextual Task Bar | 선택 객체와 최근 명령에 맞는 다음 행동을 제안 | ContextActionResolver |
| Recent Tools | 도구+속성 snapshot을 1–9 슬롯에 저장 | ToolPresetSnapshot |
| Radial HUD | 펜 주변에 색·크기·불투명도·스무딩·최근 도구 | Floating UI + Canvas overlay |
| Canvas-only | Tab/제스처 한 번으로 모든 UI를 숨기고 필요한 HUD만 표시 | WorkspaceCommand |
| Command Palette | 명령·설정·도움말·에셋·레이어·플러그인·매크로 검색 | CommandRegistry + fuzzy index |
| Searchable Layer Tree | 이름·유형·소유자·태그·효과·상태로 필터 | VirtualizedTree + index |
| Personal Visibility | 나에게만 레이어 숨김/격리, 공유 문서에는 영향 없음 | UserViewState |
| Layer Ownership/Checkout | 소유·요청·양도·soft lock·제안 layer | CollabPolicyService |
| Reference Workspace | 캔버스 밖 이미지·웹 캡처·색 팔레트·3D 참고를 핀 | ReferenceGraph |
| Browser Capability Center | GPU·필압·클립보드·OPFS·스레드·저장 quota·브라우저 충돌 표시 | CapabilityProbe |
| Why Can’t I Draw? | 레이어 잠금·선택·alpha lock·권한·GPU·펜 문제를 자동 진단 | ActionDiagnosticGraph |
| Storage Health | 저널 상태·마지막 checkpoint·quota·동기화·오프라인 여부를 항상 확인 | StorageStatusService |
| Crash Recovery Center | 탭·문서·브랜치별 복구점과 변경 미리보기 | JournalBrowser |
| E2EE Share | 암호 키를 URL fragment/초대 키로 분리한 비공개 공유 | EncryptedSnapshotShare |
| Follow/Teach Mode | 교사·감독 시점 따라가기, ghost stroke, 임시 레이저, 제어 요청 | PresenceChannel |
| Tool Video Tooltip | hover/long-press 시 짧은 애니메이션과 현재 문서로 실습 | HelpGraph + DemoRunner |
| Interactive Manual | 설명에서 명령 실행·샘플 생성·설정 강조·되돌리기 | CommandRegistry 기반 docs |
| Shortcut Visualizer | 현재 모드·키보드 배열·브라우저 충돌을 반영한 검색 패널 | ShortcutResolver |
| Pen Calibration Lab | 필압·기울기·twist·지연·팜리젝션·버튼을 장치별 저장 | InputProfileStore |
| Performance Autopilot | 프레임·메모리·배터리·온도 추정에 따라 품질을 단계 조절 | QualityGovernor |
| Safe Mode | WebGPU 실패 시 WebGL/CPU, 복잡 브러시를 기본 dab로, 문서는 보존 | FallbackCoordinator |
| Multi-window / Popout | 참조·레이어·타임라인·발표자 보기를 별도 창으로 | BroadcastChannel + layout sync |
| PWA/Offline | 셸·도움말·최근 브러시·프로젝트를 오프라인 제공 | Service Worker + OPFS |
| Session Replay | 명령·입력·엔진 라우팅·성능 사건을 시간순 재생 | DeterministicEventLog |
| Semantic Undo | “필터 강도 변경”, “컷 분할”, “포즈 변경” 단위로 설명되는 undo | CommandBus |
| Branch & Proposal | 원본을 건드리지 않는 제안 브랜치와 의미 diff/merge | VersionGraph |
| Rights BOM | 브러시·폰트·3D·음원·AI 모델의 출처·상업 조건 추적 | RightsGraph |
| Multi-format Semantic Publish | 웹툰→슬라이드→영상→카드뉴스 변환 시 의미 객체 유지 | ExportGraph |

# 12. Worker·메모리·성능 최종 설계

## 12.1 Worker 토폴로지

| 실행 영역 | 담당 | 금지/주의 |
| --- | --- | --- |
| UI Main | React·DOM·접근성·Command dispatch | 포인터 raw loop와 픽셀 계산 금지 |
| Input Worker | 샘플 정규화·예측·stabilizer·ring buffer | SharedArrayBuffer가 없으면 transferable batch |
| Brush WASM Worker | BrushGraph·outline·XPBD·preset | 결정적 seed·versioned kernels |
| Render Worker | OffscreenCanvas·WebGPU/WebGL frame graph | 단일 present owner |
| Image Worker Pool | OpenCV·Photon·vips·codec·thumbnail | 우선순위와 취소 지원 |
| 3D/Physics Worker | Three/Babylon scene update·Rapier/Jolt | render와 simulation clock 분리 |
| Storage Worker | OPFS journal·checkpoint·hash·quota | sync access handle 단일 소유 |
| Sync Worker | Yjs·presence·binary upload·E2EE | 래스터 픽셀을 CRDT로 만들지 않음 |
| AI Worker | ONNX/Transformers·segmentation·depth | 모델 lazy load·메모리 격리 |

## 12.2 품질·성능 목표

| 항목 | 구현 정책 | 완료 판정 |
| --- | --- | --- |
| 첫 캔버스 표시 | 셸과 빈 캔버스를 먼저 표시하고 대형 엔진은 비동기 로드 | 중급 모바일/노트북에서 지연을 체감하지 않는 수준을 제품 SLO로 계측 |
| 첫 획 피드백 | 예측 preview는 현재 frame 안, canonical 결과는 다음 수 frame 안 | 120Hz 기기는 8.3ms, 60Hz는 16.7ms frame budget을 기준으로 설계 |
| 메인 스레드 | pointer loop·브러시 계산·타일 합성 금지 | React commit과 입력 중 긴 작업을 trace에서 제거 |
| 레이어 스크롤 | 가상화·썸네일 지연 생성·검색 인덱스 | 수천 객체에서도 입력과 스크롤이 독립적으로 유지 |
| 대형 문서 | 희소 타일·dirty region·GPU residency LRU·OPFS spill | 8K 및 장축 웹툰을 전체 텍스처 복제 없이 처리 |
| 엔진 교환 | GPUTexture 공유 우선, ImageBitmap, SharedArrayBuffer, CPU readback 순 | 매 frame CPU readback 0건을 기본 완료 조건으로 |
| 복구 | Command journal과 tile diff, checkpoint, checksum | 프로세스 종료·탭 폐기·GPU context loss 시 마지막 일관 상태 복원 |
| 적응 품질 | 장치·배터리·프레임·메모리 기반 LOD/solver iteration 조절 | 품질 저하는 사용자에게 이유와 원복 조건을 표시 |
| 접근성 | 모든 패널·레이어·자산·명령은 키보드 대체 경로 제공 | 스크린리더 live region과 고대비/축소 모션 포함 |
| 파일 호환 | 보존/근사/래스터화/누락을 호환 보고서로 표시 | “저장 성공”이 아니라 시각 diff와 구조 보존률을 테스트 |

## 12.3 희소 타일 정책

- 래스터 레이어를 문서 전체 크기 texture로 상시 보유하지 않고 256/512px sparse tile과 mip pyramid로 유지한다.
- 현재 뷰·브러시 주변·효과 halo만 GPU resident로 두고 나머지는 CPU compressed cache 또는 OPFS chunk로 내린다.
- Undo는 전체 캔버스 snapshot이 아니라 명령 + dirty tile before/after diff + 주기 checkpoint를 사용한다.
- Webtoon 장축 문서는 y-range sharding과 viewport prefetch로 다루고 전체 합성은 export 시 스트리밍한다.
- 레이어 썸네일·navigator·멀티유저 cursor는 저해상도 별도 graph에서 갱신해 주 렌더를 막지 않는다.
- GPU context loss 시 IR과 CPU/OPFS 타일에서 자원을 재생성하며 외부 엔진 객체를 저장 원본으로 사용하지 않는다.

# 13. 접근성·모바일·터치

## 13.1 접근성
- 레이어 트리·자산 그리드·브러시 목록은 가상화하면서도 논리 포커스와 screen reader 위치를 유지한다.
- 드래그앤드롭은 키보드 pick/move/drop/cancel과 live announcement를 제공한다.
- 캔버스에는 `graphics-document` 의미와 선택 객체 요약, 키보드 이동·변형·정렬 명령을 제공한다.
- 색상만으로 레이어·사용자·상태를 구분하지 않고 아이콘·패턴·텍스트를 병행한다.
- 고대비·forced colors·reduced motion·큰 포인터·왼손잡이·색각 시뮬레이션을 지원한다.
- 영상 툴팁에는 텍스트 설명과 자막을 제공하고 자동 재생은 사용자 설정을 따른다.

## 13.2 모바일·태블릿 입력 계약
- Stylus only drawing: 펜은 그리기, 손가락은 pan/zoom/rotate를 기본값으로 한다.
- 2손가락 pan/zoom, 2/3손가락 undo/redo, 4손가락 UI toggle을 사용자 정의한다.
- 화면 가장자리에 color/brush/layer handle을 두고 한 번에 하나의 bottom sheet만 연다.
- 가상 Shift/Alt/Ctrl/Space modifier와 pen button mapping을 제공한다.
- 브라우저 chrome을 숨기는 fullscreen/PWA 안내와 저전력 모드·Scribble·Windows Ink 진단을 제공한다.
- 화면 회전·DPR 변화·split screen에서 캔버스 좌표와 패널 배치를 안전하게 재계산한다.

# 14. 협업·복구·보안

## 14.1 협업 데이터 경계

```text
CRDT / 의미 객체
  레이어 메타데이터 · 벡터 · 텍스트 · 말풍선 · 컷 · 댓글 · 상태 · 명령

Binary object store
  래스터 타일 · PSD/영상 · GLB/VRM · brush texture · baked simulation

Presence
  커서 · viewport · active tool · 임시 선택 · 레이저 · voice state

User-local view
  개인 가시성 · panel layout · quality · camera · guide visibility
```

## 14.2 복구·보안 기능
- OPFS command journal과 checksum을 Worker에서 순차 기록한다.
- checkpoint는 문서 IR과 tile chunk index를 원자적으로 교체한다.
- 서버 업로드 전 자산을 content hash로 중복 제거하고 E2EE workspace에서는 client-side 암호화한다.
- 공유 링크는 viewer/comment/editor와 만료·암호·다운로드·재공유 권한을 분리한다.
- 플러그인은 capability token과 Worker/iframe sandbox에서 실행하며 network/file/GPU 접근을 명시적으로 허용한다.
- 복구 센터는 마지막 정상 상태, 미동기화 변경, 손상 chunk, 적용 가능한 repair를 시각화한다.

# 15. 바이브코딩 구현 가능 범위

| 등급 | 적합 범위 | 필수 통제 |
| --- | --- | --- |
| A – 매우 적합 | UI 셸, 메뉴, 패널, 검색, 도움말, 템플릿, command registry, CRUD, adapter, 테스트 fixture | 스펙과 스냅샷 테스트를 주면 반복 구현이 빠름 |
| B – 적합 | 문서 스키마, 파일 mapping, CRDT metadata, node editor, export wrapper, worker RPC | 명확한 인터페이스·작은 vertical slice 필요 |
| C – 보조 가능 | WGSL 필터, path geometry, 타일 cache, WebGPU interop, PSD round-trip | golden corpus·profiling·전문 review 필수 |
| D – 연구 주도 | 필기감, 안료 유체, 브러시모 물리, CJK 조판, 색관리, CAD topology | AI 생성 코드는 실험 초안이며 수치/시각 검증이 핵심 |

## 15.1 바이브코딩 운영 규칙
- 기능을 UI 파일 단위가 아니라 `Command → IR change → backend adapter → golden test`의 vertical slice로 요청한다.
- 외부 엔진 타입이 도메인 모델로 새지 않도록 adapter interface와 fixture를 먼저 만든다.
- Shader·WASM은 참조 이미지, 수치 범위, 성능 입력, fallback 결과를 테스트에 포함한다.
- AI가 생성한 라이선스 설명이나 API 이름을 신뢰하지 않고 lockfile·공식 저장소·빌드 결과로 검증한다.
- 한 번에 여러 렌더러를 수정하지 않고 동일 IR을 기준으로 한 backend parity test를 유지한다.
- 기능 완료 정의에 키보드·터치·모바일·context loss·undo·save/reopen·collaboration을 포함한다.

# 16. 구현 로드맵

| 단계 | 완료 범위 |
| --- | --- |
| R0 계측·계약 | CommandRegistry, CapabilityProbe, BrowserMatrix, benchmark/golden corpus, license SBOM |
| R1 웹 UX 셸 | Quick Start, adaptive workspace, docking, command palette, help graph, diagnostics, accessibility |
| R2 입력·문서·저장 | Pointer L3, StrokeIR, CommandBus, sparse tiles, OPFS journal, crash recovery |
| R3 전문 드로잉 | Vello/CanvasKit/WebGPU routing, vector/raster brushes, layers, selection, fill, EffectGraph |
| R4 자연매체·웹툰 | Hokusai, wet media, physics brush, comic semantics, CJK balloons, tones, long canvas |
| R5 협업·제작 | Yjs metadata, binary tiles, ownership, personal visibility, review/teach, branch/merge |
| R6 3D·애니메이션 | VRM, room, Rapier/Jolt, 3D→2D, timeline, WebCodecs, interactive presentation |
| R7 호환·출고 | PSD/PPTX/PDF/SVG/GLTF reports, preflight, rights BOM, server/headless render |
| R8 차별화·자동화 | Adaptive UI learning, continuity QA, Brush DNA, semantic multi-format publish, replay debugger |

# 17. 최종 완료 기준

| 영역 | 완료 판정 |
| --- | --- |
| UX | 처음 사용자가 템플릿 없이 캔버스를 만들고 선을 그려 저장·복구하는 핵심 흐름을 도움 없이 완료한다. |
| Discoverability | 모든 명령이 메뉴·검색·도움말에서 같은 이름/상태로 발견되며 비활성 이유를 설명한다. |
| Pen | 지원 장치에서 pressure/tilt가 일관되고 빠른 획·느린 획·endpoint·모서리 회귀 테스트를 통과한다. |
| Rendering | 같은 IR의 Vello·CanvasKit·WebGL·CPU 출력 차이가 정의한 tolerance 안에 있다. |
| Performance | 메인 스레드 장기 작업·매 프레임 readback·전체 캔버스 복제가 계측에서 발견되지 않는다. |
| Recovery | 탭 종료·프로세스 중단·quota 부족·GPU context loss 후 일관된 복구 경로가 있다. |
| Mobile | 작은 화면에서 한 손가락 UI 조작과 펜+손가락 입력이 충돌하지 않는다. |
| Accessibility | 레이어·자산·명령·속성을 키보드로 조작하고 상태 변화가 보조 기술에 전달된다. |
| Collaboration | 두 사용자의 동시 변경, offline rejoin, ownership transfer, personal visibility, branch merge를 재현한다. |
| Interop | 각 포맷 export에서 보존·근사·래스터화·누락 항목과 시각 diff를 보고한다. |
| License | 배포물과 생성 자산에 대해 SBOM·Rights BOM·제3자 고지가 자동 생성된다. |

# 18. 핵심 차별화 결론

ToonStudio의 방어 가능한 경쟁력은 개별 브러시나 필터가 아니라 다음 결합에서 나온다.

```text
Magma의 협업 레이어·적응형 UI
+ Kleki의 즉시 시작·복구 정직성
+ Photopea의 파일 호환·전문 메뉴
+ Figma/Penpot의 컴포넌트·변수·검색 가능한 객체
+ CSP/Krita/Concepts의 펜·브러시·집중 UI
+ Excalidraw/Draw.Chat의 링크 공유·교육·보안
+ Spline/SketchUp의 웹 3D 직접 조작
+ Vello/CanvasKit/WebGPU/Hokusai/Physics의 최상위 품질
= 웹에서만 가능한 적응형 창작 운영체제
```

가장 먼저 구현해야 할 것은 1,000개의 추가 메뉴가 아니라 `CommandRegistry`, `WorkspaceProfile`, `CapabilityProbe`, `StrokeIR`, `RenderIslandCompiler`, `OPFS Journal`이다. 이 여섯 경계가 안정되면 브러시·필터·3D·협업 기능을 바이브코딩으로 빠르게 추가해도 전체 품질이 무너지지 않는다.

---

# 부록 A. 이전 경쟁제품 매뉴얼 기반 초확장 멀티엔진 전체 명세

아래에는 기존 최종 문서 전체를 보존해 브러시 315종, 필터·효과·분석 노드 616종, 드로잉 외 기능 1,045종, 경쟁 제품·엔진·라이선스·로드맵의 상세 목록을 한 파일에서 확인할 수 있게 했다.

# ToonStudio 경쟁제품 매뉴얼 기반 초확장 멀티엔진 진짜 최종 아키텍처

## PPT·Clip Studio·Photoshop·Illustrator·Figma·Canva·Magma·Tooning·Storyboard·2D/3D·CAD·출판·인터랙티브 콘텐츠를 하나의 브라우저 창작 OS로 통합하는 설계

- 대상: `https://www.toonstudio.cloud/studio`
- 기준일: 2026-08-06 (Asia/Seoul)
- 목표: 공개된 경쟁 제품의 공식 도움말·매뉴얼·제품 문서를 기능 단위로 분해하고, 무료·오픈소스 엔진과 공개 코드를 최대한 조합해 브러시·필터·디자인·프레젠테이션·웹툰·스토리보드·애니메이션·3D·CAD·협업·출판·출고 기능을 확장
- 기술 전제: React 19 + TypeScript UI, Rust/WASM 계산 코어, WebGPU 우선, WebGL2·CPU 폴백, OPFS 로컬 우선 저장
- 핵심 원칙: **경쟁사 UI를 복제하지 않고 기능을 공통 IR·그래프·서비스로 환원한 뒤, 하나의 프로젝트에서 여러 작업면으로 재사용한다.**

> **조사 범위의 정직한 한계:** “시장에 존재하는 모든 제품의 모든 매뉴얼”을 문자 그대로 완전 열람했다고 주장하지 않는다. 본 문서는 공식 공개 도움말이 확인되는 핵심 제품을 심층 분석하고, 다수의 보조 제품을 기능 참조군으로 포함했다. 로그인·동적 렌더링·비공개 도움말로 세부 메뉴가 노출되지 않는 Tooning Plus 같은 제품은 공개 제품 페이지와 확인 가능한 설명만 반영했다. 실제 개발 착수 전에는 제품 버전 변화와 라이선스를 다시 확인해야 한다.

---

# 0. 실행 결론

ToonStudio는 더 이상 “Clip Studio와 비슷한 웹 드로잉 앱”으로 정의하면 안 된다. 최종 목표는 다음을 하나의 문서 운영체제에 결합하는 것이다.

```text
Clip Studio / Procreate / Painter / Rebelle
→ 전문 브러시·자연매체·웹툰·3D 작화

Photoshop / Illustrator / Affinity / InDesign
→ 비파괴 필터·벡터 Appearance·색상·출판·파일 호환

Figma / Penpot / Miro / Magma
→ 컴포넌트·변수·자동 레이아웃·실시간 협업·리뷰

PowerPoint / Keynote / Canva / Pitch / Prezi / Gamma / Visme / Genially
→ 슬라이드·자동 레이아웃·전환·발표·인터랙션·데이터·배포

Storyboard Pro / Boords / Storyboarder / Harmony / OpenToonz / Rive / Live2D
→ 대본·샷·패널·애니매틱·리깅·상태 머신·2D 애니메이션

Blender / Spline / SketchUp / Fusion / Onshape
→ 3D·물리·절차·CAD·구성·브랜치·where-used
```

최종 구조는 다음과 같다.

```text
React 19 UI / Workspace Modes
        │
        ▼
StudioProjectGraph
 ├─ DocumentGraph
 ├─ SurfaceGraph       # canvas/page/slide/panel/timeline/3D/diagram
 ├─ ComponentGraph
 ├─ ConstraintLayoutGraph
 ├─ InteractionGraph
 ├─ TimelineGraph
 ├─ ProductionGraph
 ├─ DataBindingGraph
 ├─ RightsGraph
 └─ ExportGraph
        │
        ▼
Common IR Layer
StrokeIR · ShapeIR · TextIR · LayoutIR · EffectGraphIR
ChartIR · DiagramIR · AnimationIR · Scene3DIR · CADFeatureIR
        │
        ▼
Render / Compute / Codec / Collaboration Routers
        │
        ├─ Vello
        ├─ CanvasKit / Skia
        ├─ Custom WebGPU
        ├─ ThorVG / PixiJS / resvg / tiny-skia
        ├─ Hokusai / libmypaint / Rust-WASM XPBD
        ├─ OpenCV.js / Photon / wasm-vips
        ├─ Three.js / Babylon.js / Rapier / Jolt / Box2D
        ├─ replicad / OpenCascade / Manifold
        ├─ Vega / ECharts / D3 / Cytoscape / ELK / Mermaid
        ├─ HarfBuzz / ICU4X / Parley / Taffy / Cassowary
        ├─ PptxGenJS / ag-psd / PDF.js / WebCodecs
        └─ Yjs / OPFS / SQLite WASM / WebRTC
        │
        ▼
HybridFrameGraph + Worker Mesh + Local-first Storage
```

가장 중요한 설계 결정은 다음 여섯 가지다.

1. **하나의 프로젝트에 여러 작업면**을 둔다. 무한 캔버스, 아트보드, 페이지, 슬라이드, 웹툰 컷, 스토리보드 프레임, 타임라인, 3D 장면, 다이어그램이 같은 자산과 컴포넌트를 참조한다.
2. **Vello와 CanvasKit을 경쟁시키지 않는다.** Vello는 대량 동적 벡터, CanvasKit은 Skia 필터·텍스트·PathEffect·호환 출력, Custom WebGPU는 픽셀·유체·대형 효과를 담당한다.
3. **Figma의 변수·컴포넌트, PowerPoint의 마스터·전환, Genially/Spline의 이벤트를 공통 그래프로 통합**한다.
4. **웹툰 의미 객체와 제작 그래프**를 제품의 핵심 차별점으로 삼는다. 대본·장면·샷·컷·캐릭터·대사·자산·검수·출고가 연결돼야 한다.
5. **바이브코딩은 조합과 응용 기능을 크게 가속하지만 품질 엔진을 대체하지 않는다.** 브러시 감각, 색상, CJK, PSD/PPTX, CAD, GPU interop은 계측·전문 검증이 필요하다.
6. **기능 수가 아니라 교환 가능한 IR과 회귀 테스트가 장기 경쟁력**이다.

# 1. 조사 방법과 매뉴얼 신뢰도

## 1.1 분석 방식

각 경쟁 제품의 메뉴명을 그대로 복사하지 않고 다음 질문으로 기능을 분해했다.

1. 사용자가 편집하는 **의미 객체**는 무엇인가?
2. 기능이 문서·렌더·레이아웃·시간·상호작용·자산·협업 중 어느 그래프에 속하는가?
3. 어떤 오픈소스 엔진이 계산과 렌더링을 가장 잘 담당하는가?
4. 바이브코딩으로 조립 가능한가, 전문 엔진 개발이 필요한가?
5. 원본을 보존한 채 다른 작업면과 출력 포맷으로 재사용할 수 있는가?
6. 경쟁사 기능을 그대로 따라가는 대신 어떤 상위 기능으로 일반화할 수 있는가?

## 1.2 신뢰도 등급

- **심층:** 공식 사용자 가이드·도움말의 주요 범주와 대표 세부 문서를 검토
- **참조:** 공식 매뉴얼·제품 문서에서 핵심 범주를 확인해 기능 영감으로 사용
- **공개 범위:** 로그인·동적 페이지 제약 때문에 공개 제품 설명과 접근 가능한 자료만 반영
- **코드 참조:** 정식 라이브러리가 아니어도 공개 저장소·데모·논문 구현을 분석하되 라이선스에 따라 직접 사용·격리·클린룸을 구분

## 1.3 제품군 분포

| 제품군 | 제품 수 |
| --- | --- |
| DTP·출판 | 2 |
| 2D 리깅·합성·애니메이션 | 1 |
| 2D 스켈레탈 애니메이션 | 1 |
| 2D 파라메트릭 캐릭터 | 1 |
| 3D DCC·2D Grease Pencil | 1 |
| 3D 스토리보드·웹툰 | 1 |
| 3D 텍스처·재질 | 1 |
| AI 스토리텔링 | 1 |
| CAD·제조·파라메트릭 | 1 |
| UI·디자인 시스템·프로토타입 | 1 |
| 간편 콘텐츠 제작 | 1 |
| 경량 공동 드로잉 | 1 |
| 경량 만화·페인팅 | 1 |
| 경량 웹 페인팅 | 1 |
| 다이어그램 | 1 |
| 다이어그램·데이터 연동 | 1 |
| 드로잉 기반 모션 | 1 |
| 드로잉·보조선 | 1 |
| 만화·클라우드 협업 | 1 |
| 모바일 만화·드로잉 | 1 |
| 모바일 페인팅 | 1 |
| 모션 그래픽 3D | 1 |
| 모션·합성 | 1 |
| 무한 벡터 스케치 | 1 |
| 무한 보드·워크숍·다이어그램 | 1 |
| 무한 캔버스 SDK | 1 |
| 문서·테이블·자동화 | 1 |
| 물리 자연매체 | 1 |
| 벡터 2D 애니메이션 | 1 |
| 벡터 모션 생태계 | 1 |
| 벡터·래스터 통합 | 1 |
| 벡터·타이포그래피 | 1 |
| 블록 문서·데이터베이스 | 1 |
| 비주얼 웹 제작 | 1 |
| 사진·래스터 편집 | 1 |
| 사진·래스터 합성 | 1 |
| 스케치 화이트보드 | 1 |
| 시각 워크스페이스 | 1 |
| 실시간 공동 작화 | 1 |
| 영상 편집·노드 합성 | 1 |
| 오픈소스 2D 애니메이션 | 1 |
| 오픈소스 DTP | 1 |
| 오픈소스 디자인·코드 | 1 |
| 오픈소스 벡터 | 1 |
| 오픈소스 스토리보드 | 1 |
| 오픈소스 이미지 편집 | 1 |
| 오픈소스 파라메트릭 CAD | 1 |
| 오픈소스 페인팅·애니메이션 | 1 |
| 웹 3D 디자인 | 1 |
| 웹 3D·인터랙션 | 1 |
| 웹 PSD 편집 | 1 |
| 웹 사진 편집 | 1 |
| 웹 스토리보드·리뷰 | 1 |
| 웹 이미지 편집 | 1 |
| 웹 캐릭터·영상 제작 | 1 |
| 웹툰·일러스트·애니메이션 | 1 |
| 인터랙티브 벡터 런타임 | 1 |
| 인터랙티브 웹 디자인 | 1 |
| 인터랙티브 콘텐츠·교육 | 1 |
| 자연매체·벡터 드로잉 | 1 |
| 자연매체·브러시 | 1 |
| 자연매체·스크립트 | 1 |
| 전문 3D 애니메이션 | 1 |
| 전문 스토리보드·애니매틱 | 1 |
| 절차·시뮬레이션 | 1 |
| 제약 기반 자동 레이아웃 | 1 |
| 줌 기반 프레젠테이션 | 1 |
| 직관적 3D·건축 | 1 |
| 초보 3D·회로 | 1 |
| 카드 기반 AI 문서·프레젠테이션·웹 | 1 |
| 캐릭터·웹툰·교육 콘텐츠 | 1 |
| 클라우드 CAD·버전 | 1 |
| 클라우드 프레젠테이션 | 1 |
| 태블릿 페인팅 | 1 |
| 템플릿 기반 올인원 디자인 | 1 |
| 템플릿 캐릭터 애니메이션 | 1 |
| 프레임 애니메이션 | 1 |
| 프레젠테이션 | 1 |
| 프레젠테이션·교육·업무 | 1 |
| 프레젠테이션·인포그래픽·데이터 | 1 |
| 플로차트·와이어프레임·문서 | 1 |
| 픽셀 아트·스프라이트 | 1 |
| 협업 프레젠테이션 | 1 |
| 협업 화이트보드 | 1 |

총 **85개 제품·제품군**을 문서에 명시적으로 포함했다. 이 중 핵심 제품은 아래에서 매뉴얼 기능을 상세 분해하고, 나머지는 기능 참조군과 엔진 요구사항에 반영했다.

# 2. 경쟁 제품 공식 매뉴얼·기능 커버리지

| 제품 | 분류 | 검토 깊이 | 공식 문서에서 확인한 강점 | ToonStudio 아키텍처에 흡수할 원리 | 공식/공개 문서 |
| --- | --- | --- | --- | --- | --- |
| Clip Studio Paint | 웹툰·일러스트·애니메이션 | 심층 | 래스터·벡터 레이어, 브러시, 자·퍼스, 톤, 컷, 3D 포즈, 소재, 애니메이션, 페이지 관리 | 웹툰 의미 객체와 브러시·소재 생태계를 제품 코어로 | https://help.clip-studio.com/ |
| Adobe Photoshop | 사진·래스터 합성 | 심층 | Smart Object/Filter, 조정 레이어, 마스크·채널, HDR, 레이어 컴프, 선택·리터치·자동화 | 비파괴 그래프, 스마트 연결 자산, 고급 색·마스크 | https://helpx.adobe.com/photoshop/user-guide.html |
| Adobe Illustrator | 벡터·타이포그래피 | 심층 | Appearance 스택, 다중 fill/stroke, 그래픽 스타일, 브러시, 심볼, Gradient Mesh, Perspective, 3D | 벡터 객체의 비파괴 AppearanceGraph와 심볼 인스턴스 | https://helpx.adobe.com/illustrator/user-guide.html |
| Adobe Fresco | 자연매체·벡터 드로잉 | 심층 | 라이브 브러시, 픽셀·벡터 브러시, 터치·스타일러스, 멀티기기 작업 | 자연매체·벡터·래스터 브러시를 하나의 프리셋 UX로 | https://helpx.adobe.com/fresco/user-guide.html |
| Krita | 오픈소스 페인팅·애니메이션 | 심층 | 브러시 엔진군, 보조선, 변형, 필터 마스크, 벡터, 애니메이션, 색상 관리 | 브러시 엔진을 모듈화하고 보조선·비파괴 마스크를 일급 객체로 | https://docs.krita.org/ |
| Procreate | 태블릿 페인팅 | 심층 | Brush Studio, Dual Brush, QuickShape, 가이드·대칭, Page Assist, 애니메이션, 3D 페인팅, 제스처 | 낮은 학습 비용과 고밀도 제스처·브러시 편집 UX | https://help.procreate.com/procreate/handbook |
| Procreate Dreams | 드로잉 기반 모션 | 심층 | 트랙·타임라인, Performing, 플립북, 키프레임, 비디오·오디오 | 그리기와 애니메이션을 같은 입력 모델로 연결 | https://help.procreate.com/dreams/handbook |
| Rebelle | 물리 자연매체 | 심층 | 수채·유화·아크릴·잉크, 안료 혼색, granulation, impasto, 젖음·건조·불기, 종이 | 물·안료·브러시모·종이를 분리한 물리 상태장 | https://www.escapemotions.com/products/rebelle/support |
| Corel Painter | 자연매체·브러시 | 심층 | Thick Paint, Watercolor, Liquid Ink, Fluid Paint, Particle Brush, Image Hose, Clone, Audio Expression | 입력 표현식과 매체별 엔진을 노드형 BrushGraph로 | https://product.corel.com/help/Painter/ |
| ArtRage | 자연매체·스크립트 | 참조 | 물감 혼합, 스티커 스프레이, 클로너, 액션 스크립트, 캔버스 질감 | 브러시 실행 기록과 재생 가능한 액션 스크립트 | https://www.artrage.com/manuals/ |
| Affinity Photo | 사진·래스터 편집 | 심층 | Live Filter/Mask, blend range, RAW, HDR, panorama, focus merge, frequency separation, macros, export slices | 라이브 필터·마스크·배치·전문 사진 워크플로 | https://affinity.help/photo2/en-US.lproj/index.html |
| Affinity Designer | 벡터·래스터 통합 | 참조 | Designer/Pixel persona, symbols, constraints, vector/raster brushes, export persona | 작업 모드별 UI를 바꾸되 공통 문서는 유지 | https://affinity.help/designer2/en-US.lproj/index.html |
| GIMP | 오픈소스 이미지 편집 | 참조 | GEGL 필터, 레이어·마스크·채널, 경로, 플러그인, 배치 | 필터 플러그인과 CPU 기준선·스크립트 생태계 | https://docs.gimp.org/ |
| Inkscape | 오픈소스 벡터 | 참조 | SVG, path effects, extensions, pattern along path, envelope/perspective, text | SVG 중심 객체와 Live Path Effect 그래프 | https://inkscape-manuals.readthedocs.io/ |
| Photopea | 웹 PSD 편집 | 심층 | PSD, Smart Object/Filter, 레이어 스타일, 벡터, actions/scripts, variables, artboards, layer comps | 브라우저에서 데스크톱 파일 호환과 고밀도 메뉴 구현 가능성 | https://www.photopea.com/learn/ |
| Pixlr | 웹 사진 편집 | 참조 | 온라인 레이어 편집, 변형·왜곡, 필터, AI 제거·확장, PXZ 저장 | 빠른 진입·임시 로컬 프로젝트·AI 원클릭 UX | https://pixlr.com/editor/ |
| ibisPaint | 모바일 만화·드로잉 | 참조 | 커스텀 브러시, 벡터 레이어, 프레임 분할, 만화 배경 필터, 클라우드·작업 과정 | 모바일 우선 웹툰 기능과 강의·공유 생태계 | https://ibispaint.com/lecture/ |
| MediBang Paint | 만화·클라우드 협업 | 참조 | 만화 캔버스, 컷 가이드, 톤·소재, 클라우드 폰트, 그룹 프로젝트 | 웹툰 템플릿·소재·팀 프로젝트의 단순화 | https://medibangpaint.com/en/use/ |
| Infinite Painter | 모바일 페인팅 | 참조 | 200+ 브러시, 커스텀 편집, 압력곡선, 필터·Liquify, PSD, 타임랩스 | 태블릿 UI·도킹과 브러시 탐색성 | https://www.infinitestudio.art/painter/help/ |
| Concepts | 무한 벡터 스케치 | 심층 | 무한 캔버스, 편집 가능한 벡터 획, smoothing, 측정·그리드·스냅, 객체 라이브러리 | 획 자체를 편집 가능한 객체로 유지하는 설계 | https://concepts.app/en/tutorials/ |
| Autodesk SketchBook | 드로잉·보조선 | 참조 | 브러시, 예측 획, Perspective guides, symmetry, Copic colors | 저마찰 도구 전환과 보조선 UX | https://help.autodesk.com/view/SKETPRO/ |
| FireAlpaca | 경량 만화·페인팅 | 참조 | 경량 브러시, 만화 템플릿, perspective snap, onion skin | 저사양 모드와 간결한 UI | https://firealpaca.com/en/topics/ |
| Aseprite | 픽셀 아트·스프라이트 | 참조 | 픽셀 브러시, 타일맵, 팔레트, onion skin, 태그·프레임, 스프라이트시트 | 정수 좌표·팔레트·타일맵 전용 렌더 경로 | https://www.aseprite.org/docs/ |
| Kleki | 경량 웹 페인팅 | 참조 | 설치 없는 레이어 드로잉, 빠른 로딩, 기본 필터 | 즉시 실행되는 Lite 모드 | https://kleki.com/ |
| Sumo Paint | 웹 이미지 편집 | 참조 | 브러시·도형·레이어·필터의 웹 통합 | 웹 앱 내 여러 창작 모드 통합 | https://sumo.app/paint/ |
| Magma | 실시간 공동 작화 | 심층 | 공동 페인팅, 음성·영상·채팅·댓글, PSD Sync, 멀티보드, 브러시 공유, 권한·프레젠테이션 | 작화 엔진보다 협업 세션·리뷰·권한을 제품 차별점으로 | https://help.magma.com/ |
| Aggie.io | 경량 공동 드로잉 | 참조 | 링크 기반 실시간 공동 캔버스와 레이어 | 가입 장벽 없는 세션형 협업 | https://aggie.io/ |
| Figma | UI·디자인 시스템·프로토타입 | 심층 | Auto Layout, components/variants/properties/slots, variables/modes, prototype conditions, libraries, Dev Mode, Code Connect | 컴포넌트·변수·상태·개발 인계를 공통 객체 모델에 | https://help.figma.com/ |
| FigJam | 협업 화이트보드 | 참조 | 스티키·스탬프·타이머·투표·템플릿·커서 채팅 | 퍼실리테이션 도구와 가벼운 실시간 상호작용 | https://help.figma.com/hc/en-us/categories/360002042553-FigJam |
| Penpot | 오픈소스 디자인·코드 | 심층 | SVG/CSS/HTML/JSON, Grid/Flex, components, tokens, libraries, plugins/API/MCP, self-hosting | 웹 표준 기반 IR과 오픈 플러그인·자체 호스팅 | https://help.penpot.app/ |
| Miro | 무한 보드·워크숍·다이어그램 | 심층 | 보드, 다이어그램, Docs, Slides, AI, layers, focus mode, Mermaid, 퍼실리테이션 | Canvas-as-prompt와 보드·문서·슬라이드 간 변환 | https://help.miro.com/ |
| Whimsical | 플로차트·와이어프레임·문서 | 참조 | flowchart, wireframe, mind map, docs, templates, collaboration | 구조화 콘텐츠를 빠르게 시각화하는 모드 | https://help.whimsical.com/ |
| diagrams.net | 다이어그램 | 참조 | 다양한 도형 라이브러리, 연결선, 레이아웃, XML, 오프라인 | 도형 팔레트·연결 규칙·오프라인 저장 | https://www.drawio.com/doc/ |
| Lucidchart | 다이어그램·데이터 연동 | 참조 | 데이터 연결, 조직도, 프로세스, 댓글·협업, 프레젠테이션 | 데이터 바인딩된 다이어그램과 조직 모델 | https://lucid.co/help |
| Creately | 시각 워크스페이스 | 참조 | 데이터베이스형 객체, 다이어그램, whiteboard, 문서, 템플릿 | 도형을 데이터 레코드로 취급 | https://creately.com/guides/ |
| Excalidraw | 스케치 화이트보드 | 참조 | 손그림 스타일, 무한 캔버스, 라이브러리, 협업, Mermaid 변환 | 가벼운 스케치 모드와 rough 스타일 | https://docs.excalidraw.com/ |
| tldraw | 무한 캔버스 SDK | 참조 | shape util, bindings, camera, history, multiplayer SDK | 무한 캔버스 객체 모델 참고; 프로덕션 라이선스 별도 검토 | https://tldraw.dev/ |
| Microsoft PowerPoint | 프레젠테이션·교육·업무 | 심층 | Slide Master, themes/layouts, Morph/Zoom, animations/triggers, SmartArt/charts, 3D, presenter, speaker coach, add-ins | 페이지·슬라이드 마스터, 전환·발표·확장 SDK를 통합 | https://support.microsoft.com/powerpoint |
| Apple Keynote | 프레젠테이션 | 심층 | Magic Move, builds/transitions, live video, narration, 3D USDZ, Magic Chart, collaboration | 고품질 전환과 발표·미디어·3D 결합 | https://support.apple.com/guide/keynote/ |
| Google Slides | 클라우드 프레젠테이션 | 참조 | 실시간 협업, themes/layouts, linked charts/slides, transitions, Gemini 보조 | 링크된 외부 데이터와 간단한 공동 편집 | https://support.google.com/docs/topic/1382883 |
| Canva | 템플릿 기반 올인원 디자인 | 심층 | Brand Kit, templates, assets/apps, docs/whiteboard/presentation/video, charts, animation, resize, publish | 콘텐츠 유형을 하나의 템플릿·브랜드·에셋 계층으로 | https://www.canva.com/help/ |
| Adobe Express | 간편 콘텐츠 제작 | 참조 | 템플릿, 페이지, 사진·영상·오디오, 애니메이션, resize, 브랜드, 빠른 공유 | 초보자 모드와 소셜 출력 프리셋 | https://helpx.adobe.com/express/user-guide.html |
| Pitch | 협업 프레젠테이션 | 심층 | templates/styles, connected data, comments/reactions, version history, embeds, offline, analytics | 프레젠테이션 자체를 영업·분석 채널로 | https://help.pitch.com/ |
| Prezi | 줌 기반 프레젠테이션 | 심층 | Overview/Frames/Topics, zoom path, presenter view, broadcast, analytics, story blocks | 슬라이드 순서 외 공간 기반 내러티브 | https://support.prezi.com/ |
| Beautiful.ai | 제약 기반 자동 레이아웃 | 심층 | Smart Slides, 자동 재배치, 슬라이드별 AI 변형, Team Slides, where-used, classic 자유 모드 | ConstraintLayout과 자유 편집 간 양방향 전환 | https://support.beautiful.ai/ |
| Gamma | 카드 기반 AI 문서·프레젠테이션·웹 | 심층 | cards, themes, responsive 문서·웹, embeds, collaboration, analytics, AI 생성, PPTX/PDF export | 슬라이드·문서·웹을 동일 block graph로 표현 | https://help.gamma.app/ |
| Visme | 프레젠테이션·인포그래픽·데이터 | 심층 | charts/data widgets, 3D graphics, animation timeline, interactivity, forms, brand/workflow/approval, HTML5/LMS | 데이터·양식·교육·승인을 창작 문서에 연결 | https://support.visme.co/ |
| Genially | 인터랙티브 콘텐츠·교육 | 심층 | hover/click interactions, windows/tooltips/audio/drag, page transitions, effects, multi-action, quizzes | 공통 Event/Action/Condition 그래프 | https://help.genially.com/ |
| Tome | AI 스토리텔링 | 참조 | AI narrative, embeds, responsive story pages, sharing | 내용 구조에서 시각 스토리 자동 생성 | https://tome.app/ |
| Notion | 블록 문서·데이터베이스 | 참조 | blocks, database views, relations, templates, comments, publish | 블록과 데이터뷰를 창작 문서 메타데이터에 | https://www.notion.com/help |
| Coda | 문서·테이블·자동화 | 참조 | tables/views/formulas/buttons/automations/packs | 문서 내부의 계산·액션·외부 연결 | https://help.coda.io/ |
| Adobe InDesign | DTP·출판 | 심층 | Parent pages, threaded text, reflow, styles, books/TOC/index, data merge, preflight, PDF/EPUB/HTML | 페이지 흐름·조판·프리플라이트를 별도 엔진으로 | https://helpx.adobe.com/indesign/user-guide.html |
| Affinity Publisher | DTP·출판 | 심층 | master pages, linked resources, studio link, preflight, data merge, books | 연결 자산과 편집 모드 간 원본 공유 | https://affinity.help/publisher2/en-US.lproj/index.html |
| Scribus | 오픈소스 DTP | 참조 | frames/master pages/layers, ICC/spot, PDF/X, preflight, forms, scripting | 인쇄 출력과 오픈 포맷·스크립팅 | https://wiki.scribus.net/canvas/Help:Manual_Quickstart |
| Tooning Editor | 캐릭터·웹툰·교육 콘텐츠 | 공개 범위 | 캐릭터 포즈·표정·부분 변형, 배경·소품·템플릿, AI 스토리·이미지, 공유 보드 | 비전문가도 조립 가능한 캐릭터·장면 시스템 | https://tooning.io/editor-information |
| Tooning Plus 3D Studio | 3D 스토리보드·웹툰 | 공개 범위 | 시나리오에서 3D 장면·스토리보드 제작, 캐릭터·배경 배치 | 대본→장면→카메라→2D 출력 파이프라인 | https://plus.tooning.io/3d-studio/ |
| Toon Boom Storyboard Pro | 전문 스토리보드·애니매틱 | 심층 | scene/sequence/panel, Stage/Camera view, 2D/3D, timeline, camera, audio, captions, annotations, animatic | 스토리·샷·패널·카메라·오디오의 생산 그래프 | https://docs.toonboom.com/help/storyboard-pro/ |
| Boords | 웹 스토리보드·리뷰 | 심층 | script import/AI breakdown, cast consistency, custom fields, animatic waveform/timing, sharing/review | 스크립트 파서와 캐릭터 연속성·클라이언트 리뷰 | https://boords.com/docs |
| Wonder Unit Storyboarder | 오픈소스 스토리보드 | 심층 | 6개 드로잉 도구, 보드 메타데이터, animatic, Photoshop round-trip, 종이 워크시트 import, NLE export | 속도 우선 콘티 모드와 외부 편집기 라운드트립 | https://wonderunit.com/storyboarder/ |
| Toon Boom Harmony | 2D 리깅·합성·애니메이션 | 심층 | node view, deformers, composite/effects, rigging, camera, drawing substitutions | 노드 합성과 캐릭터 리그·드로잉 교체 | https://docs.toonboom.com/help/harmony/ |
| OpenToonz | 오픈소스 2D 애니메이션 | 심층 | Xsheet, FX schematic, plastic mesh, hooks, tracker, particles, graph editor, render farm | 노출표·노드 FX·배치 렌더 | https://opentoonz.readthedocs.io/ |
| Synfig Studio | 벡터 2D 애니메이션 | 참조 | 파라메트릭 벡터, bones/cutout, tween, layers | 벡터 파라미터 애니메이션 | https://synfig.readthedocs.io/ |
| Pencil2D | 프레임 애니메이션 | 참조 | bitmap/vector tracks, onion skin, timeline, camera | 단순 플립북 모드 | https://www.pencil2d.org/doc/ |
| Rive | 인터랙티브 벡터 런타임 | 심층 | bones/weights, constraints, state machines, data binding/view models, joysticks, runtime | 상태 머신·데이터 바인딩된 벡터 캐릭터 | https://rive.app/docs |
| Live2D Cubism | 2D 파라메트릭 캐릭터 | 심층 | parameters/keyforms, deformers, ArtMesh, glue/skinning, physics, motion bake | 2D 캐릭터의 파라미터·물리·표정 시스템 | https://docs.live2d.com/en/cubism-editor-manual/ |
| Spine | 2D 스켈레탈 애니메이션 | 심층 | bones, weights, constraints, skins, mesh, events, runtime | 게임·인터랙티브용 경량 2D 리그 | https://esotericsoftware.com/spine-user-guide |
| Vyond | 템플릿 캐릭터 애니메이션 | 심층 | scene library, character actions/expressions, TTS/lip-sync, timeline, continue scene, bulk asset/audio edit, brand/export | 대량 장면 교체·TTS·캐릭터 자동 립싱크 | https://help.vyond.com/ |
| Animaker | 웹 캐릭터·영상 제작 | 참조 | scene/overall timeline, character assets, text/video/audio, templates | 초보자용 장면 단위 영상 편집 | https://support.animaker.com/ |
| Adobe After Effects | 모션·합성 | 심층 | comps/precomps, keyframes/graph, expressions, shape/text, masks/mattes, effects, camera/3D, templates, roto | 시간 기반 EffectGraph·expression·precompose | https://helpx.adobe.com/after-effects/user-guide.html |
| LottieFiles | 벡터 모션 생태계 | 참조 | Lottie preview/edit/optimize, dotLottie, collaboration, runtime export | 경량 벡터 모션 패키지와 검증 | https://help.lottiefiles.com/ |
| Blender | 3D DCC·2D Grease Pencil | 심층 | modeling/sculpt/UV/material/nodes/animation/rigging/simulation/compositing, Grease Pencil, Geometry Nodes, Line Art | 2D·3D·절차·노드·애니메이션을 단일 장면 그래프로 | https://docs.blender.org/manual/en/latest/ |
| Spline | 웹 3D·인터랙션 | 심층 | 3D modeling, states/events/actions, variables, physics/collision/game controls, particles, post FX, code export | 3D 객체와 UI 이벤트·변수를 동일 InteractionGraph로 | https://docs.spline.design/ |
| SketchUp | 직관적 3D·건축 | 심층 | push/pull, components, scenes, sections, styles, shadows, LayOut, configurable live components | 빠른 룸·배경 모델링과 장면 상태·2D 문서 연동 | https://help.sketchup.com/ |
| Autodesk Fusion | CAD·제조·파라메트릭 | 심층 | parametric history, equations, bodies/components/assemblies, mesh conversion, drawings, configurations, analysis | 파라메트릭 FeatureGraph와 구성 변형 | https://help.autodesk.com/view/fusion360/ENU/ |
| Onshape | 클라우드 CAD·버전 | 심층 | documents/workspaces/versions/branches/merge, configurations, assemblies, where-used | CAD 수준의 브랜치·병합·where-used를 자산 시스템에 | https://cad.onshape.com/help/ |
| FreeCAD | 오픈소스 파라메트릭 CAD | 참조 | workbenches, parametric model tree, constraints, TechDraw, Python | 모듈형 작업대·파라메트릭 객체 | https://wiki.freecad.org/Manual |
| Tinkercad | 초보 3D·회로 | 참조 | primitive boolean, workplane, alignment, codeblocks, circuits | 초보자용 제한된 모델링 모드 | https://www.tinkercad.com/learn |
| Vectary | 웹 3D 디자인 | 참조 | 3D objects/materials/lighting, interactions, AR, web embeds | 웹 배포 중심 3D 구성 | https://help.vectary.com/ |
| Maya | 전문 3D 애니메이션 | 참조 | modeling/rigging/animation/dynamics/graphs/rendering | 고급 리깅·그래프 편집 기능 참조 | https://help.autodesk.com/view/MAYAUL/ |
| Cinema 4D | 모션 그래픽 3D | 참조 | MoGraph, fields/effectors, procedural modeling, animation, rendering | 클로너·필드·절차 모션 그래프 | https://help.maxon.net/c4d/ |
| Houdini | 절차·시뮬레이션 | 참조 | node proceduralism, geometry, particles, fluids, crowds, PDG | 절차 콘텐츠 생성과 비파괴 노드 | https://www.sidefx.com/docs/houdini/ |
| Substance 3D Painter/Designer | 3D 텍스처·재질 | 참조 | layered materials, smart masks, generators, baking, node materials | 3D 표면 페인팅과 재질 노드 | https://helpx.adobe.com/substance-3d-painter/home.html |
| DaVinci Resolve/Fusion | 영상 편집·노드 합성 | 참조 | edit/cut/fusion/color/fairlight, node compositing, tracking, color management | 장면·클립·노드 합성·색상·오디오 통합 | https://www.blackmagicdesign.com/products/davinciresolve/training |
| Framer | 인터랙티브 웹 디자인 | 참조 | responsive layout, components, CMS, animations, web publish | 디자인 문서를 실제 반응형 웹으로 | https://www.framer.com/help/ |
| Webflow | 비주얼 웹 제작 | 참조 | box model, grid/flex, CMS, interactions, publish, forms | LayoutIR에서 HTML/CSS 출력 | https://help.webflow.com/ |

# 3. 핵심 경쟁 제품별 매뉴얼 기능 분해

## 3.1 Clip Studio Paint

- 공식/공개 문서: https://help.clip-studio.com/
- 핵심 범위: 래스터·벡터 레이어, 브러시, 자·퍼스, 톤, 컷, 3D 포즈, 소재, 애니메이션, 페이지 관리
- 구조적 교훈: **웹툰 의미 객체와 브러시·소재 생태계를 제품 코어로**

1. 브러시 프리셋·입력 Dynamics·보조 도구·소재를 하나의 `ToolPreset` 계층으로 관리
2. 래스터·벡터·3D·애니메이션 셀·톤·컷 프레임을 서로 다른 레이어 타입으로 제공
3. 퍼스자·대칭자·평행선자·곡선자·특수자에 획을 스냅
4. 참조 레이어·Gap Close·둘러싸고 칠하기·남은 틈 탐지 같은 만화 채색 기능
5. 3D 포즈·손·머리·소품·VRM·파노라마를 작화 가이드와 선/톤 출력으로 연결
6. 소재 등록·Assets 배포·작업공간·Auto Action·브러시 가져오기
7. 타임라인·셀·Onion Skin·Light Table·카메라 워크
8. 페이지 관리·레이어 컴프·플랫폼별 일괄 출력

### 권장 구현 배치

`BrushProgram/StrokeIR + LayerGraph + EffectGraph + Vello/CanvasKit/WebGPU + codec adapters`

## 3.2 Adobe Photoshop

- 공식/공개 문서: https://helpx.adobe.com/photoshop/user-guide.html
- 핵심 범위: Smart Object/Filter, 조정 레이어, 마스크·채널, HDR, 레이어 컴프, 선택·리터치·자동화
- 구조적 교훈: **비파괴 그래프, 스마트 연결 자산, 고급 색·마스크**

1. Smart Object 원본과 인스턴스, Smart Filter·마스크·조정 레이어의 완전 비파괴 체인
2. 레이어·그룹·클리핑·채널·알파·Blend If·레이어 스타일·컴프
3. 선택/마스크 정제, 내용 인식, healing/clone, frequency separation, Camera Raw
4. 16/32bpc, HDR, 프로파일 변환, proof, gamut warning
5. Actions·scripts·batch·variables·generator형 자동화
6. 아트보드와 Export As/Slices, linked assets, 라이브러리
7. 텍스트·도형·패스·Warp·Perspective·Vanishing Point
8. 필터 갤러리·Neural/AI 계열은 플러그인형 가역 작업으로 취급

### 권장 구현 배치

`BrushProgram/StrokeIR + LayerGraph + EffectGraph + Vello/CanvasKit/WebGPU + codec adapters`

## 3.3 Adobe Illustrator

- 공식/공개 문서: https://helpx.adobe.com/illustrator/user-guide.html
- 핵심 범위: Appearance 스택, 다중 fill/stroke, 그래픽 스타일, 브러시, 심볼, Gradient Mesh, Perspective, 3D
- 구조적 교훈: **벡터 객체의 비파괴 AppearanceGraph와 심볼 인스턴스**

1. 한 객체에 여러 fill/stroke/effect를 쌓는 `AppearanceGraph`
2. 가변 폭 프로파일, art/scatter/calligraphic/pattern/bristle brushes
3. 심볼·인스턴스·그래픽 스타일·recolor·global swatches
4. pathfinder/shape builder/offset/live corners/envelope/perspective grid
5. gradient mesh/freeform gradient/image trace
6. 텍스트 온 패스·영역 텍스트·타이포 스타일·글리프
7. 3D extrude/revolve/material/lighting
8. SVG/PDF/EPS/AI 호환 보고서와 appearance flatten 정책

### 권장 구현 배치

`BrushProgram/StrokeIR + LayerGraph + EffectGraph + Vello/CanvasKit/WebGPU + codec adapters`

## 3.4 Figma

- 공식/공개 문서: https://help.figma.com/
- 핵심 범위: Auto Layout, components/variants/properties/slots, variables/modes, prototype conditions, libraries, Dev Mode, Code Connect
- 구조적 교훈: **컴포넌트·변수·상태·개발 인계를 공통 객체 모델에**

1. Auto Layout·Grid·constraints를 통합한 `ConstraintLayoutGraph`
2. component/instance/variant/property/slot과 nested property
3. 색·숫자·문자·불리언 variables, modes, aliases, expressions
4. prototype overlay, smart animate, conditional/multiple actions, scroll/sticky/fixed
5. 팀 라이브러리·버전·브랜치·댓글·멀티플레이
6. Dev Mode inspect, token/code snippet, Code Connect
7. assets/styles/variables의 published contract와 breaking change 검사
8. 디자인→인터랙션→개발 handoff를 하나의 문서 원본에서

### 권장 구현 배치

`ComponentGraph + TokenGraph + ConstraintLayoutGraph + InteractionGraph + Yjs + Dev/Export adapters`

## 3.5 Microsoft PowerPoint

- 공식/공개 문서: https://support.microsoft.com/powerpoint
- 핵심 범위: Slide Master, themes/layouts, Morph/Zoom, animations/triggers, SmartArt/charts, 3D, presenter, speaker coach, add-ins
- 구조적 교훈: **페이지·슬라이드 마스터, 전환·발표·확장 SDK를 통합**

1. Slide Master·layout·theme·placeholder·section을 `PageTemplateGraph`로
2. Morph의 객체 매칭, move/resize/rotate/color/text morph와 Zoom 내비게이션
3. entrance/emphasis/exit/motion path/trigger를 `InteractionTimeline`로
4. SmartArt·charts·tables·icons·3D models·media와 linked data
5. presenter view·notes·laser/ink·recording·caption·speaker coach
6. 공유·댓글·버전·reuse slides·theme variants
7. PPTX/OOXML import/export와 fidelity report
8. Office add-in과 같은 HTML/JS plugin surface

### 권장 구현 배치

`PageTemplateGraph + ConstraintLayoutGraph + InteractionGraph + TimelineGraph + PptxGenJS/Web renderer`

## 3.6 Adobe InDesign

- 공식/공개 문서: https://helpx.adobe.com/indesign/user-guide.html
- 핵심 범위: Parent pages, threaded text, reflow, styles, books/TOC/index, data merge, preflight, PDF/EPUB/HTML
- 구조적 교훈: **페이지 흐름·조판·프리플라이트를 별도 엔진으로**

1. Parent page·page section·spread·bleed·slug·column/grid
2. linked/threaded text frames와 Smart Text Reflow
3. paragraph/character/object/table/cell styles와 style inheritance
4. books·chapters·TOC·index·footnote/endnote·cross-reference
5. data merge·conditional text·GREP style·find/change
6. linked resources·package·preflight·separations·PDF/X
7. EPUB/HTML5/interactive PDF·forms·buttons
8. CJK 세로쓰기·금칙·루비·문자 조판

### 권장 구현 배치

`PageFlowGraph + HarfBuzz/ICU4X + style system + preflight/export graph`

## 3.7 Magma

- 공식/공개 문서: https://help.magma.com/
- 핵심 범위: 공동 페인팅, 음성·영상·채팅·댓글, PSD Sync, 멀티보드, 브러시 공유, 권한·프레젠테이션
- 구조적 교훈: **작화 엔진보다 협업 세션·리뷰·권한을 제품 차별점으로**

1. 동일 래스터 문서에 여러 사용자가 저지연 획을 추가하되 타일 충돌을 제어
2. 음성·영상·카메라·화면 공유를 작화 세션과 결합
3. chat/comments/pins/permissions/presentation/version history
4. multi-board와 reference window, 팀 리뷰 동선
5. PSD Sync와 외부 파일 갱신
6. 팀·크리에이터 브러시 팩과 공유
7. Art Jam·교육·멘토링 세션
8. 작화 퍼포먼스 상태와 네트워크 품질 표시

### 권장 구현 배치

`SparseTileRenderer + Yjs/presence + binary tile store + WebRTC + review/permission services`

## 3.8 Tooning Editor

- 공식/공개 문서: https://tooning.io/editor-information
- 핵심 범위: 캐릭터 포즈·표정·부분 변형, 배경·소품·템플릿, AI 스토리·이미지, 공유 보드
- 구조적 교훈: **비전문가도 조립 가능한 캐릭터·장면 시스템**

1. 캐릭터 포즈·표정·헤어·얼굴·색·소품·배경을 조립 가능한 `CharacterTemplate`로
2. 부분 신체 변형과 스타일 프리셋으로 비전문가도 장면 제작
3. 웹툰·포스터·발표·카드뉴스 템플릿
4. AI 텍스트/이미지/스토리 보조
5. 게시·댓글·좋아요 같은 콘텐츠 커뮤니티
6. 교실/팀 환경의 모니터링·안전·템플릿 배포
7. 공개 페이지는 동적·로그인 중심이므로 내부 편집 세부는 저장소 감사 필요
8. ToonStudio에서는 템플릿 조립 결과를 완전 편집 가능한 객체로 유지

### 권장 구현 배치

`ProductionGraph + WebtoonGraph + TimelineGraph + Scene3DIR + review/export services`

## 3.9 Toon Boom Storyboard Pro

- 공식/공개 문서: https://docs.toonboom.com/help/storyboard-pro/
- 핵심 범위: scene/sequence/panel, Stage/Camera view, 2D/3D, timeline, camera, audio, captions, annotations, animatic
- 구조적 교훈: **스토리·샷·패널·카메라·오디오의 생산 그래프**

1. script→sequence→scene→panel→layer의 계층
2. Stage View와 Camera View를 분리하고 2D/3D 카메라를 같은 패널에
3. 패널 duration·transition·audio waveform·captions·notes
4. camera move·layer transform·3D object animation
5. animatic 편집과 PDF/movie/NLE export
6. shot/scene metadata와 production tracking
7. voice/sketch annotations와 review
8. 콘티에서 Harmony/편집기로 전달 가능한 패키지

### 권장 구현 배치

`ProductionGraph + WebtoonGraph + TimelineGraph + Scene3DIR + review/export services`

## 3.10 Blender

- 공식/공개 문서: https://docs.blender.org/manual/en/latest/
- 핵심 범위: modeling/sculpt/UV/material/nodes/animation/rigging/simulation/compositing, Grease Pencil, Geometry Nodes, Line Art
- 구조적 교훈: **2D·3D·절차·노드·애니메이션을 단일 장면 그래프로**

1. Outliner·collection·object/data 분리와 modifier stack
2. Geometry Nodes와 node tool로 절차 모델링
3. Grease Pencil을 3D 공간의 벡터/드로잉 객체로
4. Line Art로 3D 윤곽을 2D 선화로
5. armature/constraint/IK/driver/NLA/graph editor
6. material/shader/compositor nodes
7. rigid/cloth/fluid/particle simulation과 bake
8. Python addon처럼 샌드박스형 플러그인 API

### 권장 구현 배치

`Scene3DIR/CADFeatureIR + Three/Babylon + Rapier/Jolt + Manifold/OpenCascade + Vello/CanvasKit 2D projection`

## 3.11 Spline

- 공식/공개 문서: https://docs.spline.design/
- 핵심 범위: 3D modeling, states/events/actions, variables, physics/collision/game controls, particles, post FX, code export
- 구조적 교훈: **3D 객체와 UI 이벤트·변수를 동일 InteractionGraph로**

1. 3D 객체의 states/events/actions와 transition sequence
2. number/string/boolean/time/counter/random variables 및 object property binding
3. mouse/keyboard/scroll/drag/distance/collision/trigger events
4. conditional·set variable·variable control·animation actions
5. physics, gravity, collision, game controls, particles, post processing
6. 웹 public URL/viewer/Vanilla/React/Next/R3F code export
7. draft→production 배포 상태
8. 2D UI와 3D scene을 동일 `InteractionGraph`에서 연결

### 권장 구현 배치

`Scene3DIR/CADFeatureIR + Three/Babylon + Rapier/Jolt + Manifold/OpenCascade + Vello/CanvasKit 2D projection`

## 3.12 Visme

- 공식/공개 문서: https://support.visme.co/
- 핵심 범위: charts/data widgets, 3D graphics, animation timeline, interactivity, forms, brand/workflow/approval, HTML5/LMS
- 구조적 교훈: **데이터·양식·교육·승인을 창작 문서에 연결**

1. presentation/document/infographic/chart/whiteboard/video/microsite를 공통 project로
2. charts·3D charts·data widgets·tables·live data·interactive maps
3. animation timeline에서 slide duration·transition·object/audio sync
4. hotspot/window/link/audio/form 같은 interactivity
5. brand kit·brand wizard·content blocks·slide library
6. assignment/approval/workflow/roles/locks
7. HTML5, transparent PNG, print bleed, LMS/SCORM 계열 export
8. analytics와 published project settings

### 권장 구현 배치

`PageTemplateGraph + ConstraintLayoutGraph + InteractionGraph + TimelineGraph + PptxGenJS/Web renderer`

## 3.13 Genially

- 공식/공개 문서: https://help.genially.com/
- 핵심 범위: hover/click interactions, windows/tooltips/audio/drag, page transitions, effects, multi-action, quizzes
- 구조적 교훈: **공통 Event/Action/Condition 그래프**

1. hover/click/drag/page/scroll 이벤트
2. window/tooltip/audio/link/page/scroll-to/drag-and-drop 액션
3. 한 요소에 여러 action과 condition을 조합
4. page transition과 element animation
5. interactive image/hotspot/effect
6. quiz/game/교육 콘텐츠의 상태·점수·분기
7. 공유·embed·web publish
8. `InteractionGraphIR`을 2D/3D/슬라이드 모두에 공통 적용

### 권장 구현 배치

`PageTemplateGraph + ConstraintLayoutGraph + InteractionGraph + TimelineGraph + PptxGenJS/Web renderer`

## 3.14 Beautiful.ai

- 공식/공개 문서: https://support.beautiful.ai/
- 핵심 범위: Smart Slides, 자동 재배치, 슬라이드별 AI 변형, Team Slides, where-used, classic 자유 모드
- 구조적 교훈: **ConstraintLayout과 자유 편집 간 양방향 전환**

1. 콘텐츠 의미에 따라 자동 배치되는 Smart Slide template
2. 요소 수·텍스트 길이·이미지 비율 변화에 따른 제약 재배치
3. 같은 콘텐츠의 대체 레이아웃 추천
4. AI로 특정 슬라이드만 재작성·재구성·이미지 교체
5. Smart→Classic 자유 편집 전환
6. Team Slide를 여러 deck에서 공유하고 where-used 확인
7. 브랜드·권한·공유 라이브러리
8. `ConstraintLayout`이 깨지면 명시적으로 자유 모드로 materialize

### 권장 구현 배치

`PageTemplateGraph + ConstraintLayoutGraph + InteractionGraph + TimelineGraph + PptxGenJS/Web renderer`

## 3.15 Gamma

- 공식/공개 문서: https://help.gamma.app/
- 핵심 범위: cards, themes, responsive 문서·웹, embeds, collaboration, analytics, AI 생성, PPTX/PDF export
- 구조적 교훈: **슬라이드·문서·웹을 동일 block graph로 표현**

1. 슬라이드보다 유연한 responsive card/document/page 모델
2. block 단위 reorder·nest·layout·theme
3. 웹 embed와 외부 콘텐츠 connector
4. presentation/document/website publishing
5. AI outline→cards 생성과 선택적 재작성
6. 공유·댓글·analytics
7. PDF/PPTX export의 폰트·효과 호환성 보고
8. 동일 콘텐츠를 화면 폭에 맞춰 재흐름

### 권장 구현 배치

`PageTemplateGraph + ConstraintLayoutGraph + InteractionGraph + TimelineGraph + PptxGenJS/Web renderer`

## 3.16 Rive

- 공식/공개 문서: https://rive.app/docs
- 핵심 범위: bones/weights, constraints, state machines, data binding/view models, joysticks, runtime
- 구조적 교훈: **상태 머신·데이터 바인딩된 벡터 캐릭터**

1. 벡터 shape·bone·mesh·weight
2. IK/distance/transform/rotation/scale constraints
3. state machine과 trigger/bool/number input
4. joystick·pointer interaction
5. view model/data binding과 list/image/artboard property
6. 웹·앱 runtime에서 작은 파일로 재생
7. 디자인 타임과 런타임 contract 분리
8. ToonStudio의 캐릭터·UI 모션에 `StateMachineIR` 재사용

### 권장 구현 배치

`BrushProgram/StrokeIR + LayerGraph + EffectGraph + Vello/CanvasKit/WebGPU + codec adapters`

## 3.17 Live2D Cubism

- 공식/공개 문서: https://docs.live2d.com/en/cubism-editor-manual/
- 핵심 범위: parameters/keyforms, deformers, ArtMesh, glue/skinning, physics, motion bake
- 구조적 교훈: **2D 캐릭터의 파라미터·물리·표정 시스템**

1. ArtMesh와 deformers의 계층
2. parameter와 keyform interpolation
3. glue/skinning/mesh deformation
4. physics groups와 input/output normalization
5. physics 결과를 motion keyframe으로 bake
6. expression/pose/motion 파일 분리
7. 캐릭터 얼굴·몸의 2D 파라메트릭 제어
8. PSD layer naming과 import contract

### 권장 구현 배치

`BrushProgram/StrokeIR + LayerGraph + EffectGraph + Vello/CanvasKit/WebGPU + codec adapters`

## 3.18 Onshape

- 공식/공개 문서: https://cad.onshape.com/help/
- 핵심 범위: documents/workspaces/versions/branches/merge, configurations, assemblies, where-used
- 구조적 교훈: **CAD 수준의 브랜치·병합·where-used를 자산 시스템에**

1. document/workspace/version/branch의 분리
2. branch compare/merge와 immutable version
3. configuration table과 parameter variants
4. part studio/assembly/drawing의 참조
5. where-used와 release management
6. 동시 편집과 세밀한 history
7. link document/version pinning
8. 이를 브러시·컴포넌트·3D 자산 버전 관리에 적용

### 권장 구현 배치

`Scene3DIR/CADFeatureIR + Three/Babylon + Rapier/Jolt + Manifold/OpenCascade + Vello/CanvasKit 2D projection`

# 4. 경쟁 기능을 공통 엔진 요구사항으로 환원한 최종 매트릭스

아래 표의 난이도는 바이브코딩 관점의 상대 등급이다. `A`는 기존 라이브러리 조합 중심, `D`는 별도 품질 엔진·연구·대규모 회귀 검증이 필요한 영역이다.

| 기능군 | 구현 기능 범위 | 최적 하이브리드 엔진 조합 | 난이도 |
| --- | --- | --- | --- |
| 입력·필압·제스처 | raw/coalesced/predicted pointer, pressure/tilt/twist/barrel, 장치 교정, hover, multi-touch, gesture mapping | Pointer Events L3 + Rust/WASM input worker + stroke-stabilizer/lazy-brush 참고 + WebHID 선택 | A/B |
| 벡터 잉크 | G펜·매핑펜·캘리그래피·가변폭·사후 폭 수정·벡터 지우개 | Perfect Freehand + Kurbo/Lyon + Vello + CanvasKit PathEffect + Paper.js/Bezier.js | B/C |
| 래스터 Dab 브러시 | 원형·텍스처·듀얼팁·스프레이·리본·패턴·클론·힐링 | Custom WebGPU sparse tile + PixiJS fallback + CanvasKit/SkSL 보조 | C |
| 자연매체 | 연필·목탄·파스텔·수채·수묵·유화·아크릴·과슈·스머지 | Hokusai/libmypaint + MyPaint presets + WebGPU pigment/wetness + Spectral.js + Vello/CanvasKit 합성 | C/D |
| 브러시 물리 | 탄성 펜촉·브러시모·리본·헤어·로프·천·점착·충돌 | Rust/WASM XPBD + Rapier/Box2D scene physics + WebGPU particle/field | D |
| 픽셀·타일맵 | 1px 정수 획, 팔레트, 디더, 타일맵, onion skin, sprite sheet | Custom integer tile renderer + gifenc/WebCodecs + CanvasKit nearest sampling | B |
| 보조선·자 | 퍼스·대칭·평행·방사·곡선·shape guide·measurement | ConstraintGeometry + Paper.js/Kurbo + Vello overlay + three.js camera projection | B |
| 선택·마스크 | magic wand, color/luma range, matting, morphology, vector/raster mask, quick mask | OpenCV.js + WebGPU flood/SDF + Clipper2 + Vello/CanvasKit clip | B/C |
| 스마트 채우기 | gap close, reference layers, surround-and-fill, underfill, leak detection | WebGPU flood/JFA + OpenCV morphology + LayerGraph reference policy | C |
| 레이어·합성 | groups, masks, clipping, adjustment, live filter, blend-if, styles, comps | LayerGraph + WebGPU FrameGraph + CanvasKit ImageFilter + Vello/Peniko blend + Pixi fallback | C |
| 사진 보정 | RAW-like controls, levels/curves, HSL, LUT, HDR, denoise, sharpen, lens | WebGPU EffectGraph + OpenCV.js + Photon + wasm-vips + Color.js/Culori | B/C |
| 고급 필터 | blur gallery, displacement, liquify, morphology, halftone, line extraction, tone | Custom WGSL passes + CanvasKit SkSL/ImageFilter + OpenCV + FFT WASM | C/D |
| 벡터 Appearance | multi fill/stroke, live path effects, symbols, brushes, styles | AppearanceGraphIR + Vello/CanvasKit + PathKit/Clipper2 + SVG/resvg | B/C |
| 텍스트·CJK 조판 | paragraph styles, vertical text, ruby, kinsoku, text on path, reflow | HarfBuzz + ICU4X + Parley/Fontkit + CanvasKit Paragraph + Vello glyphs | C/D |
| 페이지·출판 | parent pages, spreads, threaded frames, books, TOC/index, data merge, preflight | PageFlowGraph + Paged.js/Vivliostyle 참고 + HarfBuzz/ICU4X + PDF engine | B/C |
| 슬라이드·발표 | masters/layouts, Morph/Zoom, presenter, notes, recording, polls, coach | PageTemplateGraph + InteractionTimeline + PptxGenJS + Web Audio/WebRTC + analytics | B/C |
| 스마트 레이아웃 | auto layout, grid/flex, responsive cards, smart slides, constraints | Taffy/Yoga + Cassowary/Kiwi + custom LayoutSolver + ELK for graphs | B/C |
| 컴포넌트·변수 | components/instances/variants/slots, tokens, modes, aliases, configuration tables | ComponentGraph + TokenGraph + JSON Schema + dependency/where-used index | B |
| 프로토타입·인터랙션 | hover/click/drag/scroll/collision, conditions, state, variables, local storage | InteractionGraphIR + XState + Rive-style state machines + Rapier events + sandbox runtime | B/C |
| 차트·데이터 시각화 | charts, maps, data widgets, dashboards, linked/live data | Vega/Vega-Lite + ECharts + D3 + Observable Plot + DuckDB-WASM/Arquero | A/B |
| 다이어그램·그래프 | flowchart, UML, mindmap, network, org, ERD, automatic layout | Mermaid + Cytoscape.js + ELKjs + Dagre + Graphviz WASM + Vello/CanvasKit render | A/B |
| 테이블·스프레드시트 | cell formats, formula, merge, sort/filter, data binding, charts | HyperFormula + DuckDB-WASM + custom grid virtualization + CSV/Arrow | B/C |
| 무한 캔버스·보드 | references, sticky, comments, frames, links, voting, timer, facilitation | Custom camera + Vello/PixiJS + Yjs + spatial index RBush + WebRTC | B |
| 웹툰·컷·말풍선 | panel split, gutters, balloon tails, dialogue link, tone, vertical export | Semantic WebtoonGraph + Vello/CanvasKit + HarfBuzz + polygon clipping | B/C |
| 스크립트·스토리보드 | script import, scene/shot/panel, cast continuity, notes, shot lists | Fountain parser + NLP pipeline + ProductionGraph + asset/character references | A/B |
| 애니매틱 | frame duration, waveform, subtitles, camera, transitions, review link | TimelineGraph + Web Audio + Peaks.js/WaveSurfer + WebCodecs/Mediabunny | B |
| 2D 애니메이션 | Xsheet, cels, onion skin, keyframes, graph, deformers, bones, substitutions | TimelineGraph + Rive/Spine-like rig IR + Vello/CanvasKit + custom mesh deform | C/D |
| 모션 그래픽 | precomp, expressions, nodes, mattes, particles, templates | EffectGraph + QuickJS sandbox + WebGPU + React Flow/Rete + Lottie/ThorVG | C/D |
| 3D 장면·VRM | outliner, camera, light, material, pose, IK, VRM, NPR passes | Three.js primary + Babylon optional island + three-vrm + Rapier + BVH + postprocessing | B/C |
| 3D 모델링 | primitive, extrude, bevel, boolean, modifiers, room builder, geometry nodes | Three.js + Manifold + replicad/OpenCascade worker + meshoptimizer + node graph | C/D |
| CAD·파라메트릭 | constraints, dimensions, feature history, configurations, assemblies, STEP | replicad/OpenCascade.js + solver + Manifold + occt-import-js + dedicated WASM worker | D |
| 3D 텍스처 페인팅 | UV view, projection, seam bleed, normal/roughness/ID layers, baking | Three.js/Babylon + WebGPU tiles + xatlas WASM + KTX2/Basis + BVH raycast | C/D |
| 물리·게임형 장면 | rigid/soft body, joints, triggers, collision, game controls, particles | Rapier main + Jolt optional + Box2D 2D + WebGPU particles + XState | C/D |
| 오디오·TTS·립싱크 | record, waveform, trim, ducking, TTS, phoneme, character sync | Web Audio + AudioWorklet + Tone.js + WebCodecs + optional cloud TTS + Rhubarb-style phoneme | B/C |
| 영상 편집·출력 | trim/split/speed/transition/caption/alpha, timeline, proxies | WebCodecs + Mediabunny/MP4Box + ffmpeg.wasm fallback + WebGPU effects | C |
| PSD·PPTX·PDF·SVG | round-trip, compatibility report, embedded fonts, flatten policy | @webtoon/psd + ag-psd + PptxGenJS/custom OOXML + PDF.js/pdf-lib + resvg | C/D |
| 저장·Undo·버전 | journal, checkpoints, branch, compare, merge, autosave, recovery | OPFS + SQLite/wa-sqlite + command log + content-addressed chunks + semantic diff | B/C |
| 실시간 협업 | presence, comments, locks, raster conflict, review, voice/video | Yjs/Hocuspocus + WebRTC/WebSocket + binary tile store + permission service | B/C |
| 자산·소재·브랜드 | asset packs, templates, Brand Kit, rights, linked assets, where-used | AssetRegistry + object storage + content hashes + dependency graph + license BOM | A/B |
| 플러그인·자동화 | brush/effect/import/export/panel/action scripts, MCP, macro | Plugin SDK + Web Worker/iframe + SES/QuickJS + WIT/WASM component boundary | B/C |
| AI 보조 | reversible generate/edit, layout, line/color, script breakdown, continuity checks | ONNX Runtime Web/Transformers.js + server model adapters + command previews + provenance | B/C/D |
| 접근성·프리플라이트 | contrast, alt text, reading order, caption, seizure/motion, print checks | axe-core + Color.js + rule engine + OCR optional + export validators | A/B |
| 분석·퍼블리싱 | view duration, slide/panel heatmap, share links, embed, SEO, LMS | Event pipeline + privacy-preserving analytics + static/web renderer + SCORM adapter | A/B |

# 5. 경쟁사를 넘어설 차별화 기능

다음 기능은 어느 한 경쟁사의 단순 복제가 아니라, 여러 제품의 장점을 같은 문서 그래프에 결합할 때 가능한 상위 기능이다.

| 차별화 기능 | 사용자 가치 | 구현 아키텍처 | 난이도 |
| --- | --- | --- | --- |
| 하나의 문서, 여러 작업면 | 같은 원본을 무한캔버스·페이지·슬라이드·웹툰·타임라인·3D·다이어그램으로 전환 | StudioProjectGraph + SurfaceView adapters | B |
| 의미 기반 웹툰 객체 | 컷·말풍선·대사·캐릭터·소품·카메라·효과음을 픽셀이 아니라 연결된 객체로 관리 | WebtoonGraph + TextIR + Scene3D links | B/C |
| 대본에서 제작 그래프 자동 생성 | 스크립트를 장면·샷·패널·등장인물·소품·로케이션·대사로 분해 | Fountain/Markdown parser + NLP + ProductionGraph | B |
| 캐릭터 연속성 검사 | 컷 사이 복장·색·소품·상처·키·광원·좌우 방향 불일치 탐지 | CharacterStateGraph + vision embeddings + rules | C |
| 시선·180도 룰·축 검사 | 스토리보드와 3D 카메라에서 화면 방향·시선·동선 오류를 경고 | CameraGraph + 3D spatial analysis | B/C |
| 3D→편집 가능한 2D 선화 | 깊이·normal·object ID·line art를 벡터/톤 레이어로 분해 | Three/Babylon passes + Vello vectorization + OpenCV | C/D |
| 물리→브러시 | 충돌·바람·관성·천·유체 결과를 속도선·먼지·잉크·리본 획으로 변환 | Rapier/Jolt + WebGPU particles + BrushOutputIR | D |
| 브러시→3D 재질 | 2D 스트로크가 3D 표면의 albedo/normal/roughness/height를 동시에 갱신 | SurfacePaintGraph + WebGPU + KTX2 | C/D |
| 다중 엔진 시각 동등성 검사 | Vello·CanvasKit·CPU·WebGL 결과 차이를 자동 heatmap으로 측정 | Golden corpus + perceptual diff + backend matrix CI | C |
| 적응형 품질 라우팅 | GPU·배터리·메모리·문서 복잡도에 따라 엔진·샘플·타일 크기를 자동 선택 | CapabilityRouter + telemetry-free local benchmark | C |
| 브러시 감각 캘리브레이션 | 사용자의 필압 습관을 짧은 테스트로 학습해 프리셋에 적용 | DeviceProfile + pressure/velocity model fitting | B/C |
| 브러시 DNA와 교배 | 두 브러시의 geometry/material/dynamics/physics 노드를 선택적으로 혼합 | Typed BrushGraph + compatibility rules | B/C |
| 실제 안료 팔레트 | 색상 피커와 팔레트에서 물감 혼색·오염·건조·세척을 시뮬레이션 | Spectral pigment model + Hokusai/WebGPU | C/D |
| 시간이 흐르는 캔버스 | 젖은 영역·건조·번짐·먼지·빛이 작업 중 시간에 따라 변화하고 freeze/bake 가능 | WetMediaTimeline + active tiles | D |
| 선화 의도 보존 보정 | 모서리·교차·taper·캘리그래피 방향을 구분해 보정 강도를 동적으로 변경 | Feature-aware stabilizer WASM | C |
| 콘텐츠 유형 자동 변환 | 웹툰 컷을 슬라이드·릴스·영상·카드뉴스·세로 스크롤로 재배치 | ConstraintLayout + semantic objects + export profiles | B/C |
| 프레젠테이션 중 라이브 작화·3D | 발표 화면에서 드로잉·카메라·물리·변수를 실시간 조작하고 기록 | PresentationRuntime + InteractionGraph + render islands | B/C |
| 관객 반응 기반 분기 발표 | 투표·질문·진행 속도에 따라 슬라이드·애니매틱·데모 경로 변경 | Event service + state machine + privacy analytics | B |
| 버전 브랜치형 창작 | 컷·슬라이드·브러시·3D 장면을 분기하고 의미 단위로 비교·병합 | Semantic snapshot/merge + content-addressed assets | C |
| 어디에 쓰였나(Where-used) | 컴포넌트·소재·브러시·폰트·3D 자산의 모든 사용 위치와 영향도 표시 | DependencyGraph + reverse index | A/B |
| 권리·출처 BOM | 브러시 팁·폰트·이미지·3D·AI 결과의 라이선스·출처·사용 조건을 출고물에 포함 | RightsGraph + signed provenance | B |
| AI 수정의 완전 가역성 | 생성 결과를 픽셀 덮어쓰기가 아니라 command/selection/mask/model metadata로 저장 | AICommand + before/after + seed/model/license | B/C |
| 스타일 락과 의미 락 | AI·팀원이 특정 캐릭터 디자인·브랜드·말풍선 규칙을 위반하지 못하게 제약 | Constraint policies + design tokens + validators | B |
| 출고 시각 차이 예측 | PSD/PPTX/PDF/SVG/영상 변환 전에 누락·대체·래스터화와 예상 diff를 표시 | ExportCapabilityGraph + dual-render diff | C/D |
| 플랫폼별 안전 영역·가독성 | 웹툰·인스타·유튜브·PPT·인쇄 규격의 crop/safe/font/모아레 검사 | PreflightRuleEngine + platform profiles | A/B |
| 창작 리플레이 디버거 | 획·필터·레이어·3D·협업 명령을 시간축에서 재생하고 문제 원인을 추적 | Deterministic command log + snapshots | C |
| 성능 예산 Inspector | 레이어·필터·엔진별 GPU 시간·메모리·타일·캐시 비용을 시각화 | WebGPU timestamp queries + profiler UI | C |
| 저사양 자동 간소화 | 실시간 미리보기만 필터·3D·유체를 축약하고 최종 출력은 고품질 재계산 | QualityProfile + deferred final renderer | B/C |
| 다국어 말풍선 자동 재조판 | 번역 길이와 세로쓰기·루비·금칙에 맞춰 말풍선과 컷 내 배치를 재조정 | HarfBuzz/ICU4X + BalloonLayoutSolver | C |
| 대사-입모양-표정 통합 | 대사·TTS·phoneme·감정 태그가 2D/3D 캐릭터와 자동 연결 | AudioGraph + lip-sync + Rive/Live2D/VRM adapters | C |
| 작화 역할별 뷰 | 콘티·선화·채색·배경·편집·검수 담당자가 같은 문서를 다른 UI와 권한으로 사용 | RoleView + permissions + task graph | A/B |
| 검수 차이 맵 | 이전 버전과 현재 버전의 픽셀·벡터·텍스트·3D·메타데이터 차이를 한 화면에 | Semantic diff + image diff + timeline diff | B/C |
| 오프라인 우선 공동 작업 | 인터넷이 끊겨도 OPFS에서 작업하고 재연결 시 의미 명령과 타일을 병합 | Yjs + OPFS journal + conflict queue | C |
| 세션형 멘토링 | 멘토가 획·레이어·카메라를 임시 제어하고 원작자는 승인/되돌리기 | Delegated permissions + suggestion branches | B |
| 작업 과정 학습 자료화 | 타임랩스가 단순 영상이 아니라 도구·의도·단계가 붙은 인터랙티브 튜토리얼 | Command log + annotations + replay runtime | B/C |
| 브러시 자동 회귀 실험실 | 태블릿 입력 corpus로 프리셋 변경 전후의 지연·형태·질감을 자동 비교 | Input replay + metrics + golden images | C |
| 모델·엔진 교체 가능 AI | 동일 AI 명령을 로컬 ONNX와 서버 모델에서 실행하고 품질·비용·권리를 비교 | ModelRouter + capability/rights metadata | B/C |
| 문서 내 미니앱 | 슬라이드·보드·3D 장면 안에 변수·폼·차트·퀴즈·게임 로직을 삽입 | InteractionGraph + sandboxed plugin widgets | B/C |
| 프로시저럴 소재 | 노드 그래프로 톤·패턴·브러시 팁·배경·3D 재질을 생성하고 seed로 재현 | NodeGraph + FastNoiseLite + WebGPU + Ezu-style typed DAG | C |
| 웹툰 리듬 분석 | 컷 크기·대사량·스크롤 거리·시선 흐름·클리프행어를 분석 | WebtoonLayout metrics + reading simulation | B/C |
| 접근성 시뮬레이터 | 색각·저시력·난독·모션 민감·스크린리더 순서를 미리보기 | Color transforms + layout/accessibility tree + motion rules | B |
| 프라이버시 보존 분석 | 발표·작품 반응을 개인 식별 없이 집계하고 로컬에서 민감 이벤트를 필터 | Edge aggregation + differential privacy options | C |
| 브라우저 장애 복구 렌더 | WebGPU context loss 시 Vello CPU/CanvasKit software/Pixi WebGL로 작업을 계속 | Renderer failover + serialized IR | C |
| 다중 포맷 의미 보존 패키지 | 원본·PSD·PPTX·PDF·SVG·GLB·영상과 호환 보고서를 한 publish bundle로 | ExportGraph + manifest + checksums | C |
| 사용자 정의 작업 모드 생성 | 도구·패널·단축키·엔진 품질·권한을 조합해 스튜디오 템플릿으로 배포 | WorkspaceSchema + plugin panels + policy presets | A/B |

# 6. 최종 제품 도메인 모델

## 6.1 `StudioProjectGraph`

```ts
export interface StudioProjectGraph {
  id: ProjectId;
  schemaVersion: number;

  documents: Record<DocumentId, StudioDocument>;
  surfaces: Record<SurfaceId, WorkSurface>;
  assets: AssetRegistry;

  components: ComponentGraph;
  tokens: TokenGraph;
  constraints: ConstraintLayoutGraph;
  interactions: InteractionGraph;
  timeline: TimelineGraph;
  production: ProductionGraph;
  dataBindings: DataBindingGraph;
  rights: RightsGraph;
  exports: ExportGraph;

  history: SemanticHistory;
  collaboration: CollaborationState;
}

export type SurfaceKind =
  | "infinite-canvas"
  | "artboard"
  | "page"
  | "spread"
  | "slide"
  | "webtoon-strip"
  | "storyboard-frame"
  | "animation-scene"
  | "timeline"
  | "diagram"
  | "dashboard"
  | "3d-scene"
  | "cad-workbench"
  | "presentation-runtime";
```

이 모델이 중요한 이유는 같은 캐릭터·브러시·색 토큰·3D 장면·차트·대사를 여러 작업면에서 참조할 수 있기 때문이다. PowerPoint식 슬라이드와 Clip Studio식 원고를 별도 프로젝트로 만들면 자산·버전·협업·출고가 다시 분리된다.

## 6.2 객체 IR

```ts
export type ObjectIR =
  | StrokeObjectIR
  | RasterObjectIR
  | ShapeObjectIR
  | TextObjectIR
  | BalloonObjectIR
  | FrameObjectIR
  | ComponentInstanceIR
  | ChartObjectIR
  | DiagramObjectIR
  | MediaObjectIR
  | Scene3DObjectIR
  | CADFeatureObjectIR
  | WidgetObjectIR;
```

외부 엔진의 런타임 객체를 저장 원본으로 사용하지 않는다.

- `SkPath`, `vello::Scene`, `PIXI.Container`, `THREE.Object3D`, `Rapier.RigidBody`, `Y.Map`은 캐시·어댑터 객체다.
- 저장 원본은 안정 ID, 의미 속성, 참조, 명령, 프리셋 버전, seed다.
- 엔진 교체와 백엔드 폴백은 IR에서 다시 컴파일한다.

## 6.3 `ConstraintLayoutGraph`

Figma Auto Layout, Beautiful.ai Smart Slides, Gamma cards, PowerPoint layouts, InDesign frames를 하나로 일반화한다.

```ts
interface ConstraintLayoutNode {
  id: string;
  display: "absolute" | "flex" | "grid" | "flow" | "smart";
  minSize?: Size;
  maxSize?: Size;
  padding: Insets;
  gap: number;
  alignment: Alignment;
  constraints: LayoutConstraint[];
  breakpoints?: LayoutBreakpoint[];
  semanticRole?: "title" | "body" | "media" | "chart" | "caption";
  overflow: "clip" | "scroll" | "paginate" | "continue-frame";
}
```

- 일반 Flex/Grid: Taffy 또는 Yoga
- 선형 제약과 smart slide: Cassowary/Kiwi + 자체 비용 함수
- 다이어그램 자동 배치: ELK/Dagre/Graphviz
- 텍스트 흐름: HarfBuzz/ICU4X + PageFlowGraph
- AI는 직접 좌표를 생성하기보다 의미 슬롯·제약을 선택한다.

## 6.4 `InteractionGraph`

Figma prototype, Genially/Visme interactivity, PowerPoint triggers, Rive state machines, Spline events/variables를 통합한다.

```ts
interface InteractionGraph {
  variables: Record<string, VariableDef>;
  states: Record<string, StateDef>;
  events: EventNode[];
  conditions: ConditionNode[];
  actions: ActionNode[];
  transitions: TransitionNode[];
}

type EventType =
  | "start" | "pointer-down" | "pointer-up" | "hover"
  | "drag" | "scroll" | "key" | "timer" | "audio-cue"
  | "variable-change" | "state-change" | "collision"
  | "distance" | "viewport-enter" | "data-change";

type ActionType =
  | "set-property" | "set-variable" | "play-animation"
  | "navigate" | "open-overlay" | "play-audio"
  | "emit-particle" | "apply-physics" | "run-plugin"
  | "submit-form" | "branch-presentation";
```

런타임은 XState 계열 state machine과 sandboxed expression evaluator를 사용한다. 사용자가 작성한 식은 QuickJS WASM 또는 SES에서 실행하고 문서·네트워크 권한을 capability로 제한한다.

## 6.5 `ProductionGraph`

```text
Series
 └─ Episode
     └─ Sequence
         └─ Scene
             └─ Shot
                 └─ Panel / Board
                     ├─ Camera
                     ├─ Characters
                     ├─ Dialogue
                     ├─ Action
                     ├─ Assets
                     ├─ Tasks
                     ├─ Reviews
                     └─ Publish Targets
```

Storyboard Pro·Boords·Tooning·Clip Studio의 기능을 하나로 묶어, 대본 변경이 컷·대사·TTS·입모양·애니매틱·출고까지 추적되게 한다.

## 6.6 `DataBindingGraph`

- CSV/JSON/Google Sheets/API/SQL/Arrow/Parquet를 데이터 소스로 연결
- 차트·표·텍스트·색·3D 속성·슬라이드 반복에 바인딩
- PowerPoint/Google Slides linked charts, Figma variables, Visme data widgets, Coda formulas를 일반화
- DuckDB-WASM에서 로컬 쿼리, Arquero에서 가벼운 변환
- 데이터 스냅샷과 live mode를 구분하고 출고 시 재현 가능한 버전을 pin

## 6.7 `RightsGraph`

```ts
interface RightsRecord {
  assetId: string;
  sourceUri?: string;
  author?: string;
  licenseId?: string;
  usageScope?: string[];
  attribution?: string;
  aiModel?: string;
  aiModelVersion?: string;
  promptHash?: string;
  generatedAt?: string;
  restrictions?: string[];
}
```

브러시 팁·폰트·사진·3D·AI 결과가 출고물 어디에 사용됐는지 추적하고, 플랫폼 제출 전에 경고한다.

# 7. 최종 멀티엔진 라우팅 아키텍처

## 7.1 엔진은 객체가 아니라 Render Island 단위로 선택

```text
StudioProjectGraph
→ Surface Compiler
→ Semantic Object Flattening
→ Render Island Partition
→ Capability/Cost/Quality Evaluation
→ Engine Adapter
→ GPUInteropBroker
→ HybridFrameGraph
→ Present Surface
```

한 프레임 안에서 매 객체마다 엔진을 바꾸면 texture copy와 상태 전환이 폭증한다. 다음 경계로 아일랜드를 묶는다.

- 같은 clip/mask/blend/effect chain
- 같은 색공간과 sample count
- 같은 업데이트 빈도
- 같은 출력 해상도·LOD
- 같은 엔진 기능 요구
- 같은 collaboration dirty range

## 7.2 최종 역할 분담

### Vello

- 대량 동적 벡터·선화·도형·가변 폭 외곽선
- 선택·가이드·그리드·앵커·협업 커서
- Vello Classic/Hybrid/CPU를 capability별 선택
- 텍스트와 래스터 타일을 최종 장면에 배치

### CanvasKit / Skia

- PathEffect, SkSL RuntimeEffect, ImageFilter chain
- Paragraph와 복잡한 텍스트·fallback
- Skottie/Lottie, Skia 호환 출력
- CPU/software 기준 렌더와 브라우저별 회복 경로

### Custom WebGPU

- 희소 타일 래스터 Dab
- 수채·수묵·유화·스머지·안료·임파스토
- 대형 morphology·distance field·JFA·FFT·Liquify
- 파티클·벡터장·3D surface paint
- 최종 다중 패스 합성과 GPU resource lifetime

### PixiJS

- 레퍼런스 보드, 래스터 타일, 스프라이트, 대량 이미지
- 안정적인 WebGL2 폴백
- 저사양·호환 모드의 인터랙션 레이어

### ThorVG / resvg / tiny-skia

- SVG/Lottie 경량 재생
- 결정적 CPU 결과·썸네일·서버 렌더·회귀 기준

### Three.js / Babylon.js

- 기본 3D DCC/VRM/웹툰 장면은 Three.js
- WebXR, Node Material, 특정 WebGPU/게임형 기능은 Babylon 아일랜드
- 같은 장면에서 엔진을 섞지 않고 `Scene3DIR`을 한 엔진으로 컴파일

### CAD

- 파라메트릭 B-Rep은 replicad/OpenCascade 전용 Worker
- 빠른 mesh boolean은 Manifold
- 2D sketch/constraint는 별도 solver
- 표시·선택은 Three.js/Babylon, 2D 도면은 Vello/CanvasKit

## 7.3 GPU 교환 우선순위

```text
1. 동일 GPUDevice의 GPUTexture 직접 공유
2. 동일 canvas/context 내 render pass 연결
3. external texture / texture view import
4. ImageBitmap transfer
5. SharedArrayBuffer tile patch
6. 최후에만 CPU readback
```

WebGPU·CanvasKit·Vello의 실제 공유 가능성은 브라우저와 빌드에 따라 다르므로, `GPUInteropCapabilities`를 런타임에서 측정한다.

## 7.4 Worker Mesh

```text
main-ui
 ├─ input-worker
 ├─ brush-worker-wasm
 ├─ render-worker-webgpu
 ├─ effect-worker
 ├─ text-layout-worker
 ├─ codec-worker
 ├─ scene-3d-worker
 ├─ cad-worker
 ├─ physics-worker
 ├─ collab-worker
 ├─ storage-worker
 └─ thumbnail/export-worker
```

- React는 고주파 포인터·입자·브러시모 상태를 보유하지 않는다.
- Worker 간 바이너리 프로토콜은 schema-versioned MessagePack/FlatBuffers 계열로 고정한다.
- shared ring buffer가 가능한 경우 입력·Dab batch·타일 dirty queue에 사용한다.

## 7.5 장애 회복

```text
WebGPU primary 실패
→ Vello Hybrid WebGL / PixiJS WebGL
→ CanvasKit WebGL
→ CanvasKit software / Vello CPU / tiny-skia
→ 편집은 계속하고 고급 효과만 proxy 표시
```

문서 원본이 특정 엔진 객체에 묶이지 않기 때문에 가능한 구조다.

# 8. 브러시·필터·전체 기능의 확장 원칙

이 문서의 부록에는 기존 멀티엔진 마스터 명세 전체를 포함한다. 여기서는 경쟁 제품 분석으로 새로 추가되는 기능을 요약한다.

## 8.1 브러시 추가 범주

- 프레젠테이션 라이브 잉크와 레이저·강조 표시
- 화이트보드의 스티키·도형·커넥터와 손그림 변환
- Figma/Illustrator식 editable vector stroke와 Appearance
- Painter/Rebelle식 입력 Expression·입자·Thick Paint·스펙트럴 안료
- Storyboarder식 초고속 콘티 전용 6도구 프로필
- Aseprite식 팔레트·타일맵·픽셀 브러시
- 3D surface material channel brush
- 물리 기반 리본·헤어·천·파편·충격선 브러시
- 데이터 바인딩 브러시: 데이터 값에 따라 색·크기·밀도·모양 변화
- 상태 머신 브러시: hover/click/time/collision에 따라 애니메이션하는 획

## 8.2 필터 추가 범주

- PowerPoint/Canva식 그림 효과·배경 제거·그림자·반사·soft edges·bevel
- Photoshop/Affinity식 RAW·HDR·live masks·blend ranges·frequency separation
- Illustrator식 live path effect·recolor·appearance stack
- 웹툰 배경화·톤·모아레·선 추출·깊이 기반 선·그림자
- After Effects/Fusion식 시간 기반 effect, matte, tracking, expression
- 3D depth/normal/ID 기반 DOF·fog·rim·outline·relight
- 접근성·플랫폼 프리플라이트 필터
- 데이터/차트 스타일 변환과 테마 재색상

## 8.3 비드로잉 기능 추가 범주

- 슬라이드 마스터·Smart Slide·Morph/Zoom·발표자·speaker coach
- component/variant/variable/token/Dev Mode
- page flow·parent page·threaded text·preflight·data merge
- charts/data widgets/live data/forms/quizzes/SCORM
- script→shot→panel→animatic→TTS/lip-sync
- Xsheet·rig·state machine·node effect·expressions
- 3D/CAD·physics·configurations·branch/merge·where-used
- 웹 publish·embed·analytics·SEO·accessibility·rights BOM

# 9. 오픈소스 엔진·라이브러리 최종 레지스트리

총 **143개 엔진·라이브러리·표준·공개 코드 계열**을 역할 기준으로 배치했다. 라이선스는 도입 시점의 저장소와 포함 의존성을 SBOM으로 다시 확인해야 한다.

| 프로젝트 | 영역 | 기술 | 라이선스(요약) | 고유 강점 | 채택 등급 |
| --- | --- | --- | --- | --- | --- |
| Vello | 2D 벡터 GPU | Rust/wgpu | MIT/Apache-2.0 | 동적 대량 벡터·가변폭·오버레이 | 핵심 |
| CanvasKit/Skia | 2D·텍스트·필터 | C++/WASM/WebGL/WebGPU | BSD-3-Clause | Skia 호환 PathEffect·SkSL·ImageFilter·Paragraph | 핵심 |
| ThorVG | SVG·Lottie·벡터 | C++/WASM/WebGL/WebGPU | MIT | 경량 벡터·애니메이션 | 선택 |
| PixiJS | 2D 텍스처·스프라이트 | TS/WebGL/WebGPU | MIT | 타일·레퍼런스·WebGL 폴백 | 핵심 |
| resvg | SVG 렌더 | Rust/WASM | MIT/Apache-2.0 | 결정적 SVG 래스터화 | 핵심 |
| tiny-skia | CPU 2D | Rust/WASM | BSD-3-Clause | CPU 폴백·썸네일 | 핵심 |
| PathKit | 경로 연산 | Skia/WASM | BSD-3-Clause | Skia path ops | 선택 |
| Blend2D | CPU 2D | C++ | Zlib | 서버·네이티브 CPU 렌더 참고 | 참고 |
| femtovg | OpenGL 벡터 | Rust/OpenGL | MIT | 경량 벡터 폴백 | 참고 |
| lyon | 벡터 tessellation | Rust | MIT/Apache-2.0 | 경로 tessellation | 핵심 |
| kurbo | 2D 기하 | Rust | MIT/Apache-2.0 | Bezier/path 공통 수학 | 핵심 |
| Paper.js | 벡터 기하 | JS/Canvas | MIT | path boolean·편집 PoC | 선택 |
| Clipper2 | polygon clipping | C++ ports | BSL-1.0 | offset/boolean | 핵심 |
| Fabric.js | 객체 캔버스 | TS/Canvas | MIT | 오브젝트 편집·구조 참고 | 참고 |
| Konva | 캔버스 장면그래프 | TS/Canvas | MIT | transformer·hit test·가이드 참고 | 선택 |
| Rough.js | 손그림 벡터 | TS | MIT | 스케치 스타일 | 선택 |
| Two.js | 멀티 렌더 벡터 | JS | MIT | 프로토타이핑 | 참고 |
| Pts.js | 창작 코딩 기하 | TS | Apache-2.0 | 절차 그래픽 | 참고 |
| regl | WebGL 함수형 레이어 | JS/WebGL | MIT | 빠른 shader PoC | 참고 |
| TWGL.js | WebGL 헬퍼 | JS/WebGL | MIT | WebGL 폴백 구현 | 선택 |
| Hokusai | 자연매체 브러시 | Rust/WASM | MIT/Apache-2.0 | MyPaint .myb·타일·스머지·스펙트럴 | 핵심 후보 |
| libmypaint | 브러시 엔진 | C/WASM | ISC | MyPaint 브러시 기준선 | 핵심 후보 |
| mypaint-brushes | 브러시 프리셋 | Data | CC0/GPL 혼재 확인 | 자연매체 프리셋 | 검토 |
| Perfect Freehand | 가변폭 잉크 | TS | MIT | 압력 기반 outline | 핵심 |
| stroke-stabilizer | 획 필터 | TS | 라이선스 재확인 | 필터 체인·예측 참고 | 참고 |
| lazy-brush | 획 보정 | JS | MIT | lazy radius | 선택 |
| Atrament.js | 경량 드로잉 | JS/Canvas | MIT | 입력·smoothing 기준 | 참고 |
| Signature Pad | 서명 획 | TS/Canvas | MIT | 속도 기반 폭·Bezier | 참고 |
| fit-curve | Bezier fitting | JS | MIT | 점→cubic curve | 핵심 |
| smooth-fit-curve | 곡선 fitting | TS | MIT | 현대 TS 대안 | 선택 |
| simplify-js | 점 단순화 | JS | BSD-2-Clause | RDP 단순화 | 핵심 |
| Bezier.js | Bezier 수학 | JS | MIT | length/intersection/offset | 핵심 |
| p5.brush | 창작 브러시 | JS/WebGL | 라이선스 확인 | 효과 브러시 PoC | 참고 |
| FastNoiseLite | 절차 노이즈 | C++/ports | MIT | 종이·팁·재질·패턴 | 핵심 |
| simplex-noise | 노이즈 | TS | MIT | JS 미리보기 | 선택 |
| OpenCV.js | 비전·형태학 | C++/WASM | Apache-2.0 | 선택·마스크·엣지·인페인트 | 핵심 |
| Photon | 이미지 필터 | Rust/WASM | Apache-2.0 | CPU/WASM 보정·컨볼루션 | 선택 |
| wasm-vips | 대형 이미지 | C/WASM | MIT wrapper + LGPL deps | 대형 변환·피라미드 | 격리 |
| Squoosh codecs | 이미지 코덱 | WASM | 코덱별 상이 | AVIF/WebP/JPEG XL 등 | 선택 |
| libjxl | JPEG XL | C++/WASM | BSD-3-Clause | JXL codec | 선택 |
| UPNG.js | PNG | JS | MIT | PNG/APNG encode/decode | 선택 |
| gifenc | GIF encoder | JS | MIT | 빠른 GIF 출력 | 선택 |
| Color.js | 색공간 | JS | MIT | 색 변환·deltaE·gamut | 핵심 |
| Culori | 색공간 | JS | MIT | OKLCH 등 컬러 유틸 | 핵심 |
| Spectral.js | 스펙트럴 혼색 | JS | MIT | 안료형 색 혼합 | 선택 |
| LittleCMS WASM | ICC 색관리 | C/WASM | MIT | ICC transform | 핵심 후보 |
| OpenColorIO | 색 파이프라인 | C++/WASM 가능 | BSD-3-Clause | 영화 색관리·LUT | 선택 |
| fft.js/RustFFT | FFT | JS/Rust WASM | MIT/Apache | 주파수 필터·deconvolution | 선택 |
| HarfBuzz WASM | 텍스트 shaping | C/WASM | MIT | 복합 스크립트·CJK | 핵심 |
| ICU4X | 국제화 | Rust/WASM | Unicode-3.0 | 분절·locale·bidi 보조 | 핵심 |
| Parley | 텍스트 레이아웃 | Rust | MIT/Apache-2.0 | Linebender 텍스트 레이아웃 | 핵심 후보 |
| fontkit | 폰트 | JS | MIT | font parse/subset/layout 보조 | 선택 |
| opentype.js | 폰트·glyph | JS | MIT | 폰트 도구·path | 선택 |
| Taffy | Flex/Grid layout | Rust/WASM | MIT/Apache-2.0 | 고성능 CSS layout | 핵심 |
| Yoga | Flexbox layout | C++/WASM | MIT | Flex layout 기준 | 선택 |
| Kiwi/Cassowary | 제약 레이아웃 | JS/C++ | MIT/BSD 계열 | 스마트 슬라이드·constraints | 핵심 |
| Paged.js | paged media | JS | MIT | HTML paged layout 참고 | 선택 |
| Vivliostyle | 웹 출판 | JS | AGPL-3.0 | paged media 기능 참고/격리 | 참고 |
| ProseMirror | 리치 텍스트 | JS | MIT | 구조화 텍스트 편집 | 핵심 후보 |
| Lexical | 리치 텍스트 | TS | MIT | React 텍스트 편집 | 선택 |
| Tiptap Core | 리치 텍스트 | TS | MIT core/상용 확장 | 편집 UX | 검토 |
| D3 | 데이터 시각화 | JS | ISC | 저수준 시각화·scale | 핵심 |
| Apache ECharts | 차트 | TS/Canvas/SVG | Apache-2.0 | 대규모 차트·대시보드 | 핵심 |
| Vega | 시각화 문법 | JS/Canvas/SVG | BSD-3-Clause | 저수준 선언형 grammar | 핵심 |
| Vega-Lite | 시각화 문법 | TS/JSON | BSD-3-Clause | 고수준 chart spec | 핵심 |
| Observable Plot | 차트 | JS/SVG | ISC | 빠른 탐색형 차트 | 선택 |
| Chart.js | 차트 | JS/Canvas | MIT | 일반 차트 | 선택 |
| AntV G2 | 차트 문법 | TS/Canvas/SVG | MIT | Grammar of Graphics | 선택 |
| Cytoscape.js | 그래프 | JS | MIT | 네트워크 시각화·분석 | 핵심 |
| Sigma.js | 그래프 | TS/WebGL | MIT | 대규모 network 렌더 | 선택 |
| Mermaid | 텍스트 다이어그램 | TS | MIT | 20+ 다이어그램·텍스트 spec | 핵심 |
| ELKjs | 자동 레이아웃 | JS | EPL-2.0 OR GPL-3.0+ | 포트·계층 그래프 layout | 격리/검토 |
| Dagre | 그래프 레이아웃 | JS | MIT | 간단 layered layout | 선택 |
| Graphviz WASM | 그래프 레이아웃 | C/WASM | EPL-1.0 | DOT와 자동 배치 | 격리 |
| DuckDB-WASM | 분석 DB | WASM | MIT | 대용량 CSV/Parquet/Arrow 분석 | 핵심 |
| Arquero | 테이블 변환 | JS | BSD-3-Clause | 브라우저 데이터 wrangling | 선택 |
| HyperFormula | 스프레드시트 수식 | TS | GPLv3/상용 | 격리 또는 자체 수식 엔진 | 검토 |
| PptxGenJS | PPTX 생성 | TS/OOXML | MIT | 브라우저/Node PPTX export | 핵심 |
| @webtoon/psd | PSD parse | TS | 라이선스 확인 | 고속 PSD 읽기 | 핵심 후보 |
| ag-psd | PSD read/write | TS | MIT | PSD 구조 왕복 | 핵심 |
| PDF.js | PDF parse/view | JS/WASM | Apache-2.0 | PDF import/view | 핵심 |
| pdf-lib | PDF create/edit | TS | MIT | PDF export·form | 선택 |
| MuPDF.js | PDF/XPS/EPUB | C/WASM | AGPL/상용 | 고급 문서 처리 | 격리 |
| PptxGenJS | PPTX | TS | MIT | slides/charts/tables/templates | 핵심 |
| JSZip | OOXML container | JS | MIT OR GPL-3.0 | PPTX/DOCX zip | 핵심 |
| fflate | 압축 | TS | MIT | 고속 ZIP | 선택 |
| WebCodecs | 미디어 codec API | Browser | 표준 | 실시간 decode/encode | 핵심 |
| Mediabunny | 미디어 toolkit | TS/WebCodecs | MPL-2.0 | 브라우저 mux/demux | 선택 |
| MP4Box.js | MP4 | JS | BSD-3-Clause | ISO-BMFF parse/mux | 선택 |
| ffmpeg.wasm | 미디어 변환 | C/WASM | LGPL/GPL 구성별 | fallback export | 격리 |
| Tone.js | Web Audio | TS | MIT | 음악·오디오 graph | 선택 |
| WaveSurfer.js | waveform | TS/Web Audio | BSD-3-Clause | 오디오 파형 UI | 선택 |
| Essentia.js | 오디오 분석 | C++/WASM | AGPL-3.0 | 특징 추출 참고/격리 | 검토 |
| Three.js | 3D renderer | JS/WebGL/WebGPU | MIT | 3D·VRM·도구 생태계 | 핵심 |
| Babylon.js | 3D engine | TS/WebGL/WebGPU/WebXR | Apache-2.0 | WebGPU·node material·XR·physics | 선택 아일랜드 |
| PlayCanvas Engine | 3D engine | TS/WebGL/WebGPU | MIT | 웹 3D·editor inspiration | 선택 |
| @pixiv/three-vrm | VRM | TS/Three | MIT | VRM load/control | 핵심 |
| three-mesh-bvh | BVH | TS/Three | MIT | raycast·spatial query | 핵심 |
| glTF Transform | glTF processing | TS | MIT | glTF optimize/transform | 핵심 |
| meshoptimizer | mesh compression | C++/WASM | MIT | mesh optimize | 핵심 |
| Draco | mesh compression | C++/WASM | Apache-2.0 | geometry compression | 선택 |
| Basis Universal/KTX2 | texture compression | C++/WASM | Apache-2.0 | GPU texture compression | 핵심 |
| Manifold | mesh boolean | C++/WASM | Apache-2.0 | robust mesh CSG | 핵심 |
| replicad | browser CAD | TS/OpenCascade WASM | MIT | code-based parametric CAD | 핵심 후보 |
| OpenCascade.js | CAD kernel WASM | C++/WASM | LGPL-2.1 with exception 확인 | B-Rep/STEP/IGES | 격리 |
| occt-import-js | CAD import | C++/WASM | LGPL-2.1 | STEP/IGES/BREP import | 격리 |
| JSCAD | parametric CAD | JS | MIT | CSG·code CAD | 선택 |
| Maker.js | 2D CAD | JS | MIT | 2D paths/models/export | 선택 |
| verb-nurbs | NURBS | JS | MIT | NURBS curves/surfaces | 선택 |
| Rapier | physics | Rust/WASM | Apache-2.0 | 2D/3D rigid·joints·determinism | 핵심 |
| JoltPhysics.js | physics | C++/WASM | MIT | 고성능 rigid·soft body 선택 | 선택 |
| Box2D | 2D physics | C++/WASM | MIT | 2D joints/collision | 선택 |
| Matter.js | 2D physics | JS | MIT | 빠른 2D PoC | 참고 |
| cannon-es | 3D physics | JS | MIT | 경량 3D fallback | 참고 |
| Ammo.js | Bullet WASM | C++/WASM | Zlib | soft body 참고 | 참고 |
| Floaty | PBD/PBF | Rust/WASM | 라이선스 확인 | 브러시모·유체 연구 | 참고 |
| xatlas WASM | UV unwrap | C++/WASM | MIT | UV atlas | 선택 |
| Yjs | CRDT | JS | MIT | 실시간 공유 타입·offline | 핵심 |
| Hocuspocus | Yjs server | TS | MIT | 협업 backend | 핵심 |
| Automerge | CRDT | Rust/JS | MIT | branchable local-first 참고 | 선택 |
| Dexie | IndexedDB | TS | Apache-2.0 | 메타데이터 DB | 선택 |
| wa-sqlite | SQLite WASM | C/WASM | MIT | OPFS SQLite | 핵심 후보 |
| SQLite WASM | DB | C/WASM | Public Domain | 로컬 메타·인덱스 | 핵심 |
| OPFS | 파일 저장 | Browser | 표준 | 대형 타일·저널·복구 | 핵심 |
| WebRTC | P2P media/data | Browser | 표준 | 음성·영상·저지연 presence | 핵심 |
| RBush | spatial index | JS | MIT | 2D hit/search | 핵심 |
| FlatBuffers/MessagePack | binary IPC | multi | Apache/MIT | Worker·WASM 메시지 | 선택 |
| XState | state machine | TS | MIT | InteractionGraph runtime | 핵심 |
| QuickJS WASM | script sandbox | C/WASM | MIT | expression/plugin sandbox | 핵심 후보 |
| SES | JS sandbox | JS | Apache-2.0 | capability security | 선택 |
| React Flow | node editor | React/TS | MIT core | Effect/Brush/Logic graph UI | 핵심 |
| Rete.js | node editor | TS | MIT | 플러그인형 graph | 선택 |
| LiteGraph.js | node graph | JS | MIT | runtime graph 참고 | 참고 |
| ONNX Runtime Web | ML runtime | C++/WASM/WebGPU | MIT | 로컬 모델 실행 | 핵심 후보 |
| Transformers.js | ML models | TS/WASM/WebGPU | Apache-2.0 | browser transformers | 선택 |
| MediaPipe Tasks | vision/audio | C++/WASM | Apache-2.0 | segmentation/pose/face | 선택 |
| TensorFlow.js | ML | JS/WebGL/WebGPU | Apache-2.0 | 기존 모델 생태계 | 선택 |
| WebLLM | LLM runtime | TS/WebGPU | Apache-2.0 | 로컬 LLM 선택 | 선택 |
| axe-core | accessibility | JS | MPL-2.0 | 웹 접근성 검사 | 핵심 |
| Playwright | E2E | TS | Apache-2.0 | 브라우저 회귀 | 핵심 |
| Vitest | unit test | TS | MIT | 코어 테스트 | 핵심 |
| pixelmatch/SSIM | visual diff | JS | ISC/MIT | 렌더 회귀 | 핵심 |
| WebGPU timestamp queries | GPU profiling | Browser | 표준 | 렌더 비용 측정 | 핵심 |

# 10. 바이브코딩으로 가능한 범위와 넘지 말아야 할 경계

| 등급 | 정의 | 대표 기능 | 현실적 개발 방식 |
| --- | --- | --- | --- |
| V0 — 조합·설정 | 기존 라이브러리 API를 연결하고 UI/설정/템플릿을 구현 | 차트·다이어그램·기본 슬라이드·에셋·댓글·단축키·간단 export | AI 코딩 주도 가능, 자동 테스트 필수 |
| V1 — 응용 기능 | 문서 모델 위에 여러 라이브러리를 어댑터로 통합 | 컴포넌트·변수·슬라이드 마스터·스토리보드·애니매틱·브랜드·워크플로 | AI 코딩 비중 높음, 설계 리뷰 필요 |
| V2 — 성능 코어 | Worker·WASM·WebGPU·희소 타일·CRDT·codec을 결합 | 대형 캔버스·필터 graph·PSD/PPTX·영상·3D 표면 페인팅 | 전문가가 경계·프로파일·테스트를 설계해야 함 |
| V3 — 품질 엔진 | 수학·물리·색·텍스트·파일 충실도를 직접 구현 | 브러시 필기감·수채/유화·CJK 조판·HDR/ICC·CAD·semantic merge | AI는 코드 생산 보조, 전문 검증이 주도 |
| V4 — 연구 기능 | 논문·실험 코드를 제품화하고 장치·브라우저별 안정성 확보 | 실시간 안료 유체·브러시모·완전 PSD/PSB·강건 CAD·AI 연속성 | 연구·계측·회귀 corpus 없이 출시 금지 |

## 10.1 바이브코딩이 특히 강한 영역

- React 패널·도구 옵션·단축키·명령 팔레트
- 라이브러리 adapter와 feature flag
- 템플릿·브랜드·에셋 관리
- 차트·다이어그램·폼·퀴즈·슬라이드 UI
- Yjs 기반 댓글·presence·메타데이터 동기화
- PptxGenJS/PDF/SVG export wrapper
- 테스트 scaffold·storybook·fixture·migration
- plugin manifest·sandbox API·documentation
- 경쟁 기능의 반복적인 UI와 CRUD

## 10.2 바이브코딩만 믿으면 위험한 영역

- 브러시 지연·필압·taper·모서리 보존
- WebGPU resource hazard와 cross-engine synchronization
- 희소 타일의 메모리·LRU·context loss
- 수채·유화·안료·브러시모 물리
- HDR/ICC/CMYK/spot color와 premultiplied alpha
- 한중일 세로쓰기·금칙·루비·폰트 fallback
- PSD/PSB/PPTX/AI/STEP 왕복 충실도
- CAD topology와 robust boolean
- CRDT와 래스터 타일 충돌·의미 병합
- 라이선스·폰트·모델·AI 데이터 권리

## 10.3 권장 AI 코딩 운영 규칙

1. 기능 요구를 `IR 계약 → adapter → fixture → golden test → UI` 순서로 구현한다.
2. AI가 엔진 내부 객체를 문서 스키마에 노출하지 못하게 lint rule을 둔다.
3. 각 엔진 adapter에는 capability manifest와 fallback을 의무화한다.
4. 브러시·필터는 수치 테스트와 시각 golden corpus를 모두 통과해야 한다.
5. 외부 코드 복사는 라이선스 스캐너와 provenance 기록을 거친다.
6. 무라이선스 데모는 동작 사양만 추출하고 독립 구현한다.
7. 성능 목표를 통과하지 못한 기능은 자동으로 proxy 품질로 내려간다.
8. “작동한다”와 “상용 제작에 안전하다”를 별도 완료 상태로 관리한다.

# 11. 단계별 최종 로드맵

| 단계 | 구현 범위 | 완료 산출물 |
| --- | --- | --- |
| R0 감사·계측 | 현재 ToonStudio 저장소·메뉴·렌더러·문서 포맷·번들·성능·브라우저 지원을 계측; 경쟁 기능 baseline 자동 캡처 | RendererCapabilities, feature inventory, SBOM, benchmark corpus |
| R1 공통 문서 OS | StudioProjectGraph, CommandBus, stable IDs, schema migration, OPFS journal, worker protocol | 기존 UI와 새 엔진을 분리할 최소 토대 |
| R2 드로잉·레이어 P0 | 입력·보정·Vello/CanvasKit 벡터·WebGPU 타일·레이어·선택·Undo·autosave | 전문 드로잉의 체감 품질 확보 |
| R3 디자인·슬라이드·보드 | ConstraintLayout, components/variables, PageTemplate, charts/diagrams, InteractionGraph, PPTX export | PPT/Figma/Canva/Miro 영역 확장 |
| R4 웹툰·스토리보드 OS | script/scene/shot/panel, 말풍선, 톤, 3D guide, animatic, review/approval, vertical export | Clip Studio·Storyboard Pro·Tooning 차별화 |
| R5 자연매체·필터 | Hokusai/libmypaint, wet media, pigment, physical nib/bristle, advanced EffectGraph, color pipeline | 브러시·필터 품질 상위권 |
| R6 2D/3D 애니메이션 | timeline/Xsheet, rigs/deformers/state machines, Three/Babylon, VRM, physics, surface painting | Rive/Live2D/Blender/Spline 영역 연결 |
| R7 출판·파일·출고 | CJK layout, page flow, preflight, PSD/PPTX/PDF/SVG/GLB/video compatibility report | 업무·교육·상업 제작 워크플로 완성 |
| R8 생태계·신뢰 | plugin SDK, asset marketplace, rights BOM, semantic branches, analytics, accessibility, enterprise controls | 장기 경쟁 우위와 수익화 기반 |
| R9 연구 차별화 | physical media, cross-engine equivalence, continuity AI, physics-to-brush, adaptive routing | 경쟁사에 없는 기능을 제품 수준으로 |

## 11.1 우선순위 원칙

### P0 — 기반이 없으면 다른 기능이 부채가 됨

- StudioProjectGraph·CommandBus·stable ID·schema migration
- Pointer/Input/Worker·OPFS journal·Undo/checkpoint
- Vello/CanvasKit/WebGPU adapter와 Render Island Compiler
- sparse tile·LayerGraph·EffectGraph
- 성능·시각 회귀·라이선스 SBOM

### P1 — 사용자에게 즉시 체감되는 전문 기능

- 고품질 펜·보정·벡터·레이어·선택·채우기
- PSD 1차·PPTX export·PDF/SVG
- 슬라이드/보드/웹툰 작업면
- components/variables/layout
- comments/review/asset registry
- 3D reference/VRM/pose/camera

### P2 — 경쟁 우위를 만드는 통합

- script/storyboard/animatic
- natural media/advanced filters
- InteractionGraph와 발표 runtime
- charts/data/diagram
- text/CJK/publishing
- timeline/rig/state machine
- 3D room/modeling/surface paint

### P3 — 연구·차별화

- pigment fluid·bristle physics·impasto
- semantic branch/merge
- continuity/shot analysis
- physics-to-brush
- full compatibility diff
- CAD·advanced color·cross-engine equivalence

# 12. 구현 완료 판정 기준

## 12.1 기능 완료

- 메뉴가 보이는 것만으로 완료하지 않는다.
- 명령 Undo/Redo·autosave·schema migration·협업·export·fallback을 모두 검증한다.
- 터치·펜·마우스·키보드·접근성 입력을 검증한다.
- 적어도 Chrome/Edge/Safari/Firefox의 지원 프로필을 문서화한다.

## 12.2 품질 완료

- 브러시 입력 replay corpus와 장치별 profile 비교
- Vello/CanvasKit/WebGPU/WebGL/CPU 시각 diff
- 4K·8K·세로 30,000px·100/300/1,000 레이어 장기 테스트
- GPU context loss와 tab suspend/resume
- PSD/PPTX/PDF/SVG/GLB round-trip compatibility report
- CJK·RTL·emoji·variable font·누락 폰트 corpus
- 색공간·premultiplied alpha·HDR·ICC test chart
- 2인·10인·50인 협업과 네트워크 단절·재연결

## 12.3 상용 완료

- 라이선스 SBOM·NOTICE·소스 제공 의무·폰트·모델·브러시 팩 검토
- 사용 자산 RightsGraph와 export BOM
- 보안 위협 모델·plugin sandbox·업로드 파일 검증
- privacy·analytics opt-out·enterprise retention
- 비용·GPU/서버·스토리지 예산과 quota

# 13. 공식 매뉴얼·기술 소스 레저

| 제품/프로젝트 | 공식·공개 문서 | 검토 깊이 |
| --- | --- | --- |
| Clip Studio Paint | https://help.clip-studio.com/ | 심층 |
| Adobe Photoshop | https://helpx.adobe.com/photoshop/user-guide.html | 심층 |
| Adobe Illustrator | https://helpx.adobe.com/illustrator/user-guide.html | 심층 |
| Adobe Fresco | https://helpx.adobe.com/fresco/user-guide.html | 심층 |
| Krita | https://docs.krita.org/ | 심층 |
| Procreate | https://help.procreate.com/procreate/handbook | 심층 |
| Procreate Dreams | https://help.procreate.com/dreams/handbook | 심층 |
| Rebelle | https://www.escapemotions.com/products/rebelle/support | 심층 |
| Corel Painter | https://product.corel.com/help/Painter/ | 심층 |
| ArtRage | https://www.artrage.com/manuals/ | 참조 |
| Affinity Photo | https://affinity.help/photo2/en-US.lproj/index.html | 심층 |
| Affinity Designer | https://affinity.help/designer2/en-US.lproj/index.html | 참조 |
| GIMP | https://docs.gimp.org/ | 참조 |
| Inkscape | https://inkscape-manuals.readthedocs.io/ | 참조 |
| Photopea | https://www.photopea.com/learn/ | 심층 |
| Pixlr | https://pixlr.com/editor/ | 참조 |
| ibisPaint | https://ibispaint.com/lecture/ | 참조 |
| MediBang Paint | https://medibangpaint.com/en/use/ | 참조 |
| Infinite Painter | https://www.infinitestudio.art/painter/help/ | 참조 |
| Concepts | https://concepts.app/en/tutorials/ | 심층 |
| Autodesk SketchBook | https://help.autodesk.com/view/SKETPRO/ | 참조 |
| FireAlpaca | https://firealpaca.com/en/topics/ | 참조 |
| Aseprite | https://www.aseprite.org/docs/ | 참조 |
| Kleki | https://kleki.com/ | 참조 |
| Sumo Paint | https://sumo.app/paint/ | 참조 |
| Magma | https://help.magma.com/ | 심층 |
| Aggie.io | https://aggie.io/ | 참조 |
| Figma | https://help.figma.com/ | 심층 |
| FigJam | https://help.figma.com/hc/en-us/categories/360002042553-FigJam | 참조 |
| Penpot | https://help.penpot.app/ | 심층 |
| Miro | https://help.miro.com/ | 심층 |
| Whimsical | https://help.whimsical.com/ | 참조 |
| diagrams.net | https://www.drawio.com/doc/ | 참조 |
| Lucidchart | https://lucid.co/help | 참조 |
| Creately | https://creately.com/guides/ | 참조 |
| Excalidraw | https://docs.excalidraw.com/ | 참조 |
| tldraw | https://tldraw.dev/ | 참조 |
| Microsoft PowerPoint | https://support.microsoft.com/powerpoint | 심층 |
| Apple Keynote | https://support.apple.com/guide/keynote/ | 심층 |
| Google Slides | https://support.google.com/docs/topic/1382883 | 참조 |
| Canva | https://www.canva.com/help/ | 심층 |
| Adobe Express | https://helpx.adobe.com/express/user-guide.html | 참조 |
| Pitch | https://help.pitch.com/ | 심층 |
| Prezi | https://support.prezi.com/ | 심층 |
| Beautiful.ai | https://support.beautiful.ai/ | 심층 |
| Gamma | https://help.gamma.app/ | 심층 |
| Visme | https://support.visme.co/ | 심층 |
| Genially | https://help.genially.com/ | 심층 |
| Tome | https://tome.app/ | 참조 |
| Notion | https://www.notion.com/help | 참조 |
| Coda | https://help.coda.io/ | 참조 |
| Adobe InDesign | https://helpx.adobe.com/indesign/user-guide.html | 심층 |
| Affinity Publisher | https://affinity.help/publisher2/en-US.lproj/index.html | 심층 |
| Scribus | https://wiki.scribus.net/canvas/Help:Manual_Quickstart | 참조 |
| Tooning Editor | https://tooning.io/editor-information | 공개 범위 |
| Tooning Plus 3D Studio | https://plus.tooning.io/3d-studio/ | 공개 범위 |
| Toon Boom Storyboard Pro | https://docs.toonboom.com/help/storyboard-pro/ | 심층 |
| Boords | https://boords.com/docs | 심층 |
| Wonder Unit Storyboarder | https://wonderunit.com/storyboarder/ | 심층 |
| Toon Boom Harmony | https://docs.toonboom.com/help/harmony/ | 심층 |
| OpenToonz | https://opentoonz.readthedocs.io/ | 심층 |
| Synfig Studio | https://synfig.readthedocs.io/ | 참조 |
| Pencil2D | https://www.pencil2d.org/doc/ | 참조 |
| Rive | https://rive.app/docs | 심층 |
| Live2D Cubism | https://docs.live2d.com/en/cubism-editor-manual/ | 심층 |
| Spine | https://esotericsoftware.com/spine-user-guide | 심층 |
| Vyond | https://help.vyond.com/ | 심층 |
| Animaker | https://support.animaker.com/ | 참조 |
| Adobe After Effects | https://helpx.adobe.com/after-effects/user-guide.html | 심층 |
| LottieFiles | https://help.lottiefiles.com/ | 참조 |
| Blender | https://docs.blender.org/manual/en/latest/ | 심층 |
| Spline | https://docs.spline.design/ | 심층 |
| SketchUp | https://help.sketchup.com/ | 심층 |
| Autodesk Fusion | https://help.autodesk.com/view/fusion360/ENU/ | 심층 |
| Onshape | https://cad.onshape.com/help/ | 심층 |
| FreeCAD | https://wiki.freecad.org/Manual | 참조 |
| Tinkercad | https://www.tinkercad.com/learn | 참조 |
| Vectary | https://help.vectary.com/ | 참조 |
| Maya | https://help.autodesk.com/view/MAYAUL/ | 참조 |
| Cinema 4D | https://help.maxon.net/c4d/ | 참조 |
| Houdini | https://www.sidefx.com/docs/houdini/ | 참조 |
| Substance 3D Painter/Designer | https://helpx.adobe.com/substance-3d-painter/home.html | 참조 |
| DaVinci Resolve/Fusion | https://www.blackmagicdesign.com/products/davinciresolve/training | 참조 |
| Framer | https://www.framer.com/help/ | 참조 |
| Webflow | https://help.webflow.com/ | 참조 |

## 13.1 핵심 기술 공식 소스

- Vello: https://github.com/linebender/vello
- CanvasKit: https://skia.org/docs/user/modules/canvaskit/
- ThorVG: https://github.com/thorvg/thorvg
- PixiJS: https://pixijs.com/
- Hokusai: https://github.com/reearth/hokusai
- Pointer Events Level 3: https://www.w3.org/TR/pointerevents3/
- WebGPU: https://www.w3.org/TR/webgpu/
- Rapier: https://rapier.rs/docs/
- Babylon.js: https://www.babylonjs.com/
- Three.js: https://threejs.org/docs/
- Spline docs: https://docs.spline.design/
- Penpot: https://help.penpot.app/
- Vega-Lite: https://vega.github.io/vega-lite/
- Cytoscape.js: https://js.cytoscape.org/
- ELKjs: https://github.com/kieler/elkjs
- PptxGenJS: https://gitbrent.github.io/PptxGenJS/
- Yjs: https://docs.yjs.dev/
- OPFS: https://developer.mozilla.org/docs/Web/API/File_System_API/Origin_private_file_system

## 13.2 Tooning 조사 주의

`plus.tooning.io/editor/myWork`와 `plus.tooning.io/3d-studio/myWork`는 로그인·클라이언트 렌더링 중심이라 외부 도구로 내부 메뉴 전체를 열람할 수 없었다. 따라서 본 문서는 다음만 반영했다.

- 공개된 Tooning editor 제품 설명
- 공개된 Tooning Plus/3D Studio 설명
- 접근 가능한 최근 소개 자료에서 교차 확인되는 캐릭터·표정·포즈·부분 변형·AI·템플릿·공유 기능

실제 개발 전에는 사용자가 접근 가능한 계정으로 화면 녹화·메뉴 inventory·프로젝트 파일 입출력을 직접 감사해야 한다.

# 14. 최종 결론

경쟁 제품을 많이 조사한 결과, ToonStudio가 가져야 할 최종 정체성은 다음과 같다.

> **“브라우저에서 실행되는 드로잉 앱”이 아니라, 그림·디자인·슬라이드·웹툰·스토리보드·애니메이션·3D·CAD·출판·협업·배포를 하나의 의미 문서와 멀티엔진으로 연결하는 Creator Operating System.**

가장 현실적인 성공 순서는 다음이다.

1. 기존 드로잉 품질과 대형 문서 안정성을 먼저 확보한다.
2. Figma식 컴포넌트·변수와 PowerPoint식 페이지·발표를 공통 그래프로 올린다.
3. 웹툰·스토리보드 의미 모델과 3D·애니매틱을 결합한다.
4. 자연매체·물리·고급 필터·출판·파일 호환을 순차 고도화한다.
5. 경쟁사에 없는 연속성 검사·physics-to-brush·다중 작업면·semantic branch·rights BOM으로 차별화한다.

무료·오픈소스 엔진만으로도 매우 넓은 범위를 만들 수 있다. 그러나 “라이브러리를 많이 넣는 것”이 아니라 **공통 IR, 엔진 경계, 폴백, 회귀 corpus, 라이선스 통제**가 최종 품질을 결정한다.


---

# 부록 A. 기존 멀티엔진 브러시·필터·전체 기능 상세 마스터 명세

아래 부록은 이전 최종 기술 문서의 전체 내용을 보존한다. 본문 1~14장의 경쟁 제품·프레젠테이션·디자인·출판·스토리보드·인터랙션 확장안이 우선하며, 충돌 시 본문의 `StudioProjectGraph`, `ConstraintLayoutGraph`, `InteractionGraph`, `ProductionGraph` 설계를 적용한다.

# ToonStudio 최종 멀티엔진 하이브리드 마스터 아키텍처

## CanvasKit·Vello·WebGPU·ThorVG·PixiJS·Hokusai·OpenCV·3D·물리·파일 호환을 결합한 브러시·필터·전체 기능 최종 설계

- 대상 서비스: `https://www.toonstudio.cloud/studio`
- 기준일: 2026-08-06
- 목표: 무료·오픈소스 엔진과 공개 구현을 최대한 활용해 브라우저에서 데스크톱급 드로잉·웹툰·벡터·자연매체·3D·협업·출고 기능 구현
- 기술 전제: React 19 + TypeScript UI, Rust/WASM 계산 코어, WebGPU 우선, WebGL2·CPU 폴백
- 최우선 목표: **기능 수보다 품질·지연·대형 문서 안정성·파일 호환·상용 배포 안전성을 우선하면서, 각 엔진의 강점만 선택적으로 결합**
- 문서 상태: 기존 Vello 중심 설계, 브러시 품질 설계, 물리엔진 설계, 공개 코드 조사, 필터·파일·3D 설계를 통합하고 CanvasKit·ThorVG·resvg·tiny-skia 등을 확장한 최종본

---


> **현행 서비스 감사 범위:** 공개 URL은 클라이언트 렌더링 중심이어서 외부 페이지 조회만으로 현재 내부 렌더러·Worker·저장 포맷·GPU 자원 구조를 확정할 수 없다. 따라서 이 문서는 목표 아키텍처와 통합 기준을 제시하며, 실제 적용 전 R0 단계에서 저장소·번들·성능 프로파일을 대조해야 한다.

# 문서 구성

- 0. 최종 결론
- 1. 단일 엔진이 아닌 멀티엔진이 필요한 이유
- 2. 최상위 모듈 경계
- 3. 공통 문서와 중간 표현
- 4. Render Island Compiler
- 5. 최종 렌더러 역할 배치
- 6. CanvasKit을 최대 활용하는 구조
- 7. Vello와 CanvasKit의 공존 규칙
- 8. ThorVG·PixiJS·resvg·tiny-skia의 확장 역할
- 9. GPU Interop Broker와 최종 FrameGraph
- 10. 품질 프로필
- 11. 최종 브러시 아키텍처
- 12. 최종 비파괴 필터·효과 아키텍처
- 13. 전체 제품 기능 최종 구현 매트릭스
- 14. 희소 타일·레이어·메모리 아키텍처
- 15. 레이어·마스크·합성 세부 설계
- 16. 선택·채우기·채색 보조 세부 설계
- 17. 텍스트·말풍선·CJK 조판
- 18. 파일·코덱·호환 아키텍처
- 19. 색상·안료·출력 관리
- 20. 3D·VRM·모델링·2D 합성
- 21. 애니메이션·타임랩스·영상
- 22. Undo·저장·복구·협업
- 23. 플러그인·브러시 생태계
- 24. AI 보조의 위치
- 25. 성능 설계
- 26. 품질·회귀·완료 기준
- 27. 라이선스·상용 배포 등급
- 28. 단계별 구현 로드맵
- 29. 기능 우선순위 판단 기준
- 30. 최종 패키지 선택
- 31. 최종 기술 확정안
- 32. 오픈소스·공개 코드 엔진 레지스트리
- 33. 보조 엔진·프로토타이핑 코드의 정확한 배치
- 34. 코드만 공개된 데모·논문 구현 수집 체계
- 35. 대표 브러시·필터 구현 레시피
- 36. 공식 검증 소스
- 37. 구현 완료 판정 체크리스트
- 38. 최종 수량 요약
- 39. 마지막 결론

# 0. 최종 결론

ToonStudio의 최종 구조는 단일 렌더러가 아니라 **공통 문서 모델 위에 여러 전문 엔진을 배치하는 멀티엔진 구조**가 되어야 한다.

```text
React / TypeScript UI
        │
        ▼
StudioDocument + CommandBus + DependencyGraph
        │
        ▼
BrushProgram / StrokeIR / ToonSceneIR / EffectGraph / TextIR / SceneDocument
        │
        ▼
RenderIslandCompiler + CapabilityRouter + CostModel
        │
        ├─ Vello Classic / Hybrid / CPU
        ├─ CanvasKit WebGPU / WebGL / Software
        ├─ Custom WebGPU Sparse Raster / Compute
        ├─ ThorVG WebGPU / WebGL / CPU
        ├─ PixiJS WebGL / WebGPU
        ├─ resvg / tiny-skia / PathKit
        ├─ Hokusai / libmypaint / Rust-WASM XPBD
        ├─ OpenCV.js / Photon / wasm-vips
        └─ Three.js / Rapier / Manifold / BVH
        │
        ▼
HybridFrameGraph + GPUInteropBroker
        │
        ▼
단일 최종 Present Surface
```

핵심은 “모든 객체를 매 프레임 서로 다른 엔진에 보내는 것”이 아니다. 연속된 레이어·마스크·효과를 **렌더 아일랜드(Render Island)** 로 묶은 뒤, 해당 묶음 전체를 가장 적합한 엔진에 맡긴다.

최종 권장 역할은 다음과 같다.

1. **Vello**: 대량·동적 벡터 선화, 가변 폭 획, 패스·도형, 벡터 오버레이, 최종 벡터 중심 장면
2. **CanvasKit**: Skia 호환 렌더링, 고급 PathEffect, SkSL RuntimeEffect, ImageFilter 체인, 텍스트·조판, Lottie, 고품질 호환 출력
3. **자체 WebGPU**: 희소 타일 래스터 브러시, 자연매체 유체, 스머지, 파티클, 대형 다중 패스 필터, GPU 최종 합성
4. **ThorVG**: 경량 SVG·Lottie·벡터 애니메이션, 저사양·빠른 미리보기·임베디드형 경로
5. **PixiJS**: 래스터 타일·레퍼런스 보드·스프라이트·이벤트·WebGL2 폴백·대량 이미지 오버레이
6. **resvg + tiny-skia**: 결정적 SVG 래스터화, 썸네일, 서버·CPU 폴백, 시각 회귀 기준선
7. **Paper.js + Kurbo + PathKit + Clipper2**: 벡터 기하·Boolean·offset·trim·교차·경로 편집
8. **Hokusai + libmypaint + MyPaint 프리셋**: 유화·수채·연필·목탄·스머지 등 자연매체 기본 동역학
9. **Rust/WASM XPBD + WebGPU Wet Media**: 브러시모·탄성 펜촉·리본·헤어·수묵·수채·안료·임파스토
10. **OpenCV.js + Photon + wasm-vips**: 선택·형태학·인페인팅·CPU 필터·대형 이미지 일괄 처리
11. **Three.js + Rapier + three-mesh-bvh + Manifold**: 3D 참조·VRM·물리 배치·모델링·NPR 패스
12. **OPFS + Yjs**: 로컬 우선 저장·복구·버전·협업

> 최상위 품질은 라이브러리를 많이 넣는 것 자체에서 나오지 않는다. 공통 IR, 정확한 라우팅, 타일·캐시·Worker 설계, 품질 회귀 테스트, 프리셋 튜닝이 결합될 때 나온다.

---

# 1. 단일 엔진이 아닌 멀티엔진이 필요한 이유

## 1.1 엔진별 강점이 완전히 다름

- Vello는 복잡하고 동적인 벡터 장면을 GPU compute로 처리하는 데 강점이 있다.
- CanvasKit은 Skia의 넓은 2D 그래픽 API, 이미지 필터, 경로 효과, 텍스트, SkSL, 호환성에 강하다.
- 자체 WebGPU는 픽셀 상태가 계속 변화하는 브러시·유체·스머지·파티클·전역 필터에 가장 유연하다.
- ThorVG는 SVG와 Lottie를 작고 빠르게 처리하는 독립 경로로 가치가 있다.
- PixiJS는 텍스처·스프라이트·이벤트·WebGL 생태계가 강하다.
- resvg와 tiny-skia는 GPU 상태와 무관한 결정적 CPU 결과를 만드는 데 적합하다.
- Hokusai·libmypaint는 브러시 동역학과 자연매체 프리셋 생태계를 제공한다.
- OpenCV.js는 컴퓨터 비전·형태학·인페인팅에 강하지만 실시간 레이어 합성 엔진은 아니다.

## 1.2 잘못된 하이브리드 방식

다음 방식은 피해야 한다.

- 한 획의 점마다 Vello와 CanvasKit을 오가며 렌더링
- 레이어마다 서로 다른 GPU 캔버스를 만들고 매 프레임 `readPixels`
- Skia 객체·Vello Scene·Pixi Container를 문서 저장 원본으로 사용
- 모든 엔진을 초기 번들에 포함
- 엔진 기능 중복을 그대로 UI에 노출
- WebGPU 지원 여부만으로 백엔드를 고정
- GPU 텍스처 공유가 모든 브라우저에서 된다고 가정
- CPU와 GPU 결과 차이를 검증하지 않음
- GPL·무라이선스 코드를 permissive 라이브러리처럼 직접 편입

## 1.3 올바른 하이브리드 방식

```text
문서 의미 객체
→ 공통 중간 표현
→ 렌더 아일랜드 분할
→ 아일랜드별 기능·비용 분석
→ 한 개의 전문 백엔드 선택
→ 결과를 공통 GPU 텍스처 또는 벡터 장면으로 반환
→ 단일 FrameGraph에서 합성
```

---

# 2. 최상위 모듈 경계

```text
apps/studio
packages/
  document-core/
  command-bus/
  dependency-graph/
  schema-migration/
  input-core/
  device-calibration/
  stroke-ir/
  brush-program/
  brush-runtime/
  brush-presets/
  layer-graph/
  effect-graph/
  selection-core/
  text-layout/
  balloon-engine/
  animation-core/
  scene-3d/
  collaboration/
  storage-opfs/
  codec-registry/
  plugin-sdk/

renderers/
  renderer-router/
  render-island-compiler/
  frame-graph/
  gpu-interop/
  vello-adapter/
  canvaskit-adapter/
  webgpu-raster/
  webgpu-compute/
  thorvg-adapter/
  pixi-adapter/
  resvg-adapter/
  tiny-skia-adapter/
  canvas2d-recovery/

brush-backends/
  vector-ink/
  skia-path-effect/
  raster-dab/
  natural-media/
  wet-media/
  bristle-physics/
  particle/
  procedural/
  pixel/
  retouch/
  surface-paint/

workers/
  input-worker/
  brush-worker/
  render-worker/
  effect-worker/
  codec-worker/
  physics-worker/
  scene-worker/
  storage-worker/
  thumbnail-worker/
```

React는 UI, 패널, 명령 생성, 접근성 DOM을 담당한다. 고주파 포인터 처리·브러시 계산·렌더링·필터·코덱·물리는 Worker와 WASM/GPU에 둔다.

---

# 3. 공통 문서와 중간 표현

## 3.1 `StudioDocument`

모든 엔진보다 상위에 존재하는 유일한 저장 원본이다.

```ts
interface StudioDocument {
  schemaVersion: number;
  documentId: string;
  metadata: DocumentMetadata;

  artboards: ArtboardNode[];
  layers: LayerGraph;
  assets: AssetRegistry;
  brushes: BrushPresetRegistry;
  effects: EffectGraphRegistry;
  textStyles: TextStyleRegistry;
  colorProfiles: ColorProfileRegistry;
  scenes3D: SceneDocumentRegistry;
  timelines: TimelineRegistry;

  branches: BranchMetadata[];
  rightsManifest: RightsManifest;
}
```

## 3.2 공통 IR

| IR | 역할 |
|---|---|
| `PointerSampleIR` | 원시 포인터·펜 입력 |
| `StrokeIR` | 원본 샘플, 필압, 기울기, 보정, seed, preset 버전 |
| `BrushProgramIR` | 브러시 노드 그래프와 실행 계획 |
| `BrushOutputIR` | 벡터·타일·외부 텍스처·유체 주입·높이맵 결과 |
| `ToonSceneIR` | 패스·이미지·텍스트·클립·레이어·필터의 공통 2D 장면 |
| `TextIR` | 글자·스크립트·언어·문단·세로쓰기·루비·fallback |
| `EffectGraphIR` | 비파괴 필터 DAG |
| `SelectionIR` | 벡터·래스터·의미 객체 선택 |
| `SceneDocumentIR` | 3D 오브젝트·카메라·조명·포즈·물리 |
| `TimelineIR` | 셀·키프레임·오디오·카메라·효과 |
| `ExportIR` | 포맷·색공간·레이어 보존·출고 정책 |

## 3.3 외부 객체를 저장하지 않는 이유

다음 객체는 런타임 캐시일 뿐이다.

```text
vello::Scene
CanvasKit.SkPath / SkPaint / SkPicture
PIXI.Container / Texture
paper.Path
ThorVG Paint / Scene
THREE.Object3D
cv.Mat
```

엔진 버전이 바뀌거나 폴백을 사용해도 동일 문서를 열 수 있어야 하므로, 저장 형식은 자체 안정 스키마를 사용한다.

---

# 4. Render Island Compiler

## 4.1 아일랜드 단위

아일랜드는 다음 조건을 공유하는 연속 노드 묶음이다.

- 동일한 좌표계와 클립 범위
- 동일한 색공간과 premultiplied-alpha 정책
- 상호 의존하는 블렌드·마스크·필터
- 동일 백엔드에서 처리 가능한 기능 집합
- 변경 빈도와 캐시 수명
- 출력 해상도와 타일 크기
- GPU 텍스처 공유 가능성

## 4.2 예시

```text
[벡터 선화 레이어 1~12]
  → Vello Island

[SkSL 색수차 + MatrixConvolution + DropShadow가 걸린 효과음 그룹]
  → CanvasKit Island

[수채 레이어 + 젖음 마스크 + 안료 확산]
  → Custom WebGPU Wet-Media Island

[SVG 장식 + Lottie 효과]
  → ThorVG Island

[레퍼런스 이미지 60개 + 썸네일 + 선택 핸들]
  → PixiJS Island

[최종 SVG 호환 검증]
  → resvg/tiny-skia Reference Island
```

## 4.3 라우팅 비용 모델

```ts
interface RenderCostEstimate {
  capabilityScore: number;
  expectedGpuMs: number;
  expectedCpuMs: number;
  wasmBoundaryCalls: number;
  textureCopies: number;
  temporaryBytes: number;
  cacheReuseScore: number;
  visualParityRisk: number;
  browserRisk: number;
}
```

라우터는 “기능을 지원한다”만 확인하지 않고 다음을 계산한다.

- path·glyph·image 수
- dirty 영역 비율
- 필터 halo와 패스 수
- clip·mask 깊이
- 정적·동적 비율
- GPU 메모리 예산
- JS↔WASM 호출 수
- 텍스처 복사 횟수
- 확대율·출력 해상도
- 브라우저·GPU·드라이버 블랙리스트
- 과거 실측 프로파일

---

# 5. 최종 렌더러 역할 배치


## 5.1 엔진별 최종 역할

| 엔진 | 스택 | 고유 강점 | 주 담당 기능 | 주의점 | 등급 |
| --- | --- | --- | --- | --- | --- |
| Vello Classic | Rust/wgpu | GPU compute 중심 대규모 벡터 렌더링 | 동적 선화, 복잡한 패스, 가변 폭 outline, 벡터 편집 오버레이 | 알파 상태이며 blur/filter, 메모리, glyph cache 진화 중 | A/기능 플래그 |
| Vello Hybrid | Rust/wgpu·WebGL | CPU path 처리 + GPU raster/composite | 이미지·그라데이션·혼합이 많은 벡터 아일랜드, WebGL 폴백 | 현재 마스크·복합 필터 제약을 capability probe로 격리 | A/기능 플래그 |
| Vello CPU | Rust/WASM SIMD | GPU 없는 결정적 벡터 렌더 | 썸네일, 테스트, 복구, 서버·Worker 출력 | 대형 동적 장면은 GPU보다 느림 | A/폴백 |
| CanvasKit | C++/Skia→WASM | 가장 넓은 Skia 2D API, PathEffect, SkSL, ImageFilter, Paragraph, Skottie | 고급 효과, 텍스트, 호환 출력, 필터 체인, Skia 기준선 | 큰 WASM·명시적 메모리 해제·JS↔WASM 비용 관리 필요 | A/주력 |
| CanvasKit WebGPU | Skia Graphite/WebGPU 경로 | GPU 디바이스·캔버스·텍스처 surface | Skia 효과를 WebGPU 프레임그래프에 통합 | 브라우저·빌드별 기능 검증 필수 | A/점진 |
| CanvasKit WebGL | Skia Ganesh/WebGL | 성숙한 GPU 경로 | WebGPU 미지원 환경의 고품질 Skia 폴백 | GPU 자원 공유 제약 | A/호환 |
| CanvasKit Software | Skia CPU/WASM | 결정적 CPU 렌더 | 인쇄·썸네일·시각 회귀·GPU 장애 복구 | 대형 실시간 장면에는 제한 | A/폴백 |
| ThorVG | C++/WASM | 경량 retained vector, SVG·Lottie·텍스트·효과 | SVG/Lottie 미리보기, 저사양, 다수 소형 애니메이션 | 전체 SVG·고급 편집은 별도 검증 | A/보조 |
| ThorVG WebGPU | C++/WebGPU | 경량 GPU 벡터 | 애니메이션·UI·장식 아일랜드 | CanvasKit/Vello와 중복하므로 아일랜드 단위 | A/보조 |
| ThorVG WebGL | C++/WebGL | 브라우저 호환 SVG/Lottie | 구형·호환 브라우저 | 기능 비교 회귀 필요 | A/폴백 |
| PixiJS WebGL | TypeScript/WebGL2 | 안정적 텍스처·스프라이트·이벤트·배치 | 래스터 타일, 레퍼런스 보드, 선택 오버레이, 입자 프리뷰 | 벡터 전문·자연매체 코어로 사용하지 않음 | A/주력 보조 |
| PixiJS WebGPU | TypeScript/WebGPU | 모던 GPU 텍스처 렌더 | WebGPU 이미지 보드·스프라이트 실험 | 브라우저 구현 차이로 기본값은 보수적 | A/실험 |
| resvg/usvg | Rust/WASM | 정적 SVG 파싱·정규화·결정적 렌더 | SVG import/export 검증, 썸네일, 서버 출력 | 인터랙티브 scene graph는 아님 | A/기준선 |
| tiny-skia | Rust/WASM/CPU | 작고 결정적인 CPU 2D raster | CPU 폴백, 테스트, 경량 출력 | 텍스트 미지원, 고급 효과 한계 | A/폴백 |
| PathKit | Skia PathOps→WASM | Skia Boolean·path ops | 벡터 합치기·빼기·교차·XOR·simplify | CanvasKit custom build와 중복 가능 | A/기하 |
| Paper.js | JavaScript | 벡터 path 모델·Boolean·hit test·segment 편집 | 편집 툴, 프로토타입, 기하 검증 | 대형 렌더 코어가 아닌 편집 계층 | A/기하 |
| Kurbo | Rust | 정밀 2D 곡선·path·offset 기반 | Vello·WASM 벡터 기하 | 일부 고급 Boolean은 별도 엔진 필요 | A/기하 |
| Clipper2 | C++/WASM | 견고한 polygon clipping·offset | 선택·채우기 경계·outline·expand/contract | Bezier는 flatten/재구성 필요 | A/기하 |
| Bezier.js | JavaScript | Bezier length·split·intersections·projection | 펜 path 분석·편집·arc-length stamp | 고성능 핵심은 Rust 포팅 고려 | A/유틸 |
| flatten-js | TypeScript | 2D geometry primitives와 Boolean | 도형 편집·스냅·측정 | 렌더러 아님 | A/기하 |
| Custom WebGPU Raster | WGSL/TypeScript/Rust | 희소 타일 dab, blending, masks | 모든 고성능 래스터 브러시와 레이어 합성 | 가장 많은 자체 QA 필요 | 자체 핵심 |
| Custom WebGPU Compute | WGSL | 유체·스머지·파티클·대형 필터 | 자연매체·전역 효과·GPU 분석 | WebGL/CPU 대체 경로 필요 | 자체 핵심 |
| Hokusai | Rust/WASM | MyPaint 호환 자연매체·타일 surface·smudge·spectral mix | 유화·수채·연필·목탄·혼색 | 프로젝트 성숙도와 프리셋별 회귀 필요 | A/PoC→주력 |
| libmypaint | C/WASM | 검증된 MyPaint brush dynamics | 호환 기준·프리셋 생태계·대체 자연매체 | WASM surface adapter·멀티스레드 구축 필요 | A/격리 |
| OpenCV.js | C++/WASM | 비전·형태학·contour·inpaint·transform | 선택, 자동 닫기, 라인 추출, 스마트 보정 | 실시간 렌더러가 아님; cv.Mat 해제 필수 | A/분석 |
| Photon | Rust/WASM | 경량 CPU 이미지 보정·컨볼루션 | 작은 필터, Worker 폴백, 프리셋 처리 | 대형 실시간 필터는 WebGPU 우선 | A/폴백 |
| wasm-vips | C/WASM | 대형 이미지 스트리밍·저메모리 처리 | 대형 리사이즈, 포맷 변환, 피라미드, 배치 출력 | LGPL 구성요소·배포 고지 확인 | B/Worker |
| Three.js | TypeScript/WebGL/WebGPU | 3D scene·camera·materials·loaders | 3D 레퍼런스, 모델링, NPR, 텍스처 페인트 | 2D 문서 원본으로 사용하지 않음 | A/3D |
| Rapier | Rust/WASM | 2D/3D rigid body·collision·joints | 소품 배치, 포즈 접촉, scene physics | 브러시모에는 자체 XPBD가 더 적합 | A/물리 |
| JoltPhysics.js | C++/WASM | 고급 물리·soft body·cloth | 천·소프트바디 선택 모듈 | 큰 번들·Rapier와 중복 | A/동적 로드 |
| three-mesh-bvh | TypeScript | 고속 mesh raycast·spatial query | 표면 스냅, 3D 페인트, 충돌 보조 | Three.js 전용 계층 | A/3D |
| Manifold | C++/WASM | 견고한 manifold mesh Boolean | 웹 모델링·컷·union·difference | 대형 mesh 비용 관리 | A/3D |
| Yjs | TypeScript/CRDT | 오프라인·실시간 공유 타입 | 벡터·텍스트·메타데이터·리뷰 협업 | 래스터 픽셀 전체 CRDT 금지 | A/협업 |
| Canvas2D | Browser API | 최후 복구·접근성·간단 preview | GPU 초기화 실패, 경량 썸네일 | 전문 렌더 품질 기준이 아님 | 내장 폴백 |

## 5.2 엔진 선택의 최종 우선순위

### 벡터 선화

```text
복잡한 동적 벡터·가변 폭 획
→ Vello Classic

Skia PathEffect·SkSL·고급 필터가 결합된 벡터
→ CanvasKit

SVG/Lottie 자산 미리보기·애니메이션
→ ThorVG

정적 SVG 호환·결정적 출력
→ resvg

CPU 복구·회귀
→ Vello CPU 또는 tiny-skia
```

### 래스터

```text
브러시 dab·타일·스머지·습식 매체
→ Custom WebGPU

이미지 필터·SkSL·Skia 호환 효과
→ CanvasKit

레퍼런스 보드·타일 sprite·WebGL 폴백
→ PixiJS

형태학·인페인팅·컴퓨터 비전
→ OpenCV.js

대형 파일·배치 변환
→ wasm-vips
```

### 텍스트

```text
IME 입력
→ DOM overlay

레이아웃·shaping
→ HarfBuzz/Parley + Fontique/Skrifa

Skia 호환 문단·출력
→ CanvasKit Paragraph

대량 벡터 scene 통합
→ glyph outline/cache + Vello

경량 SVG/Lottie 텍스트
→ ThorVG

PDF·SVG·PSD 출고
→ Export adapter + font embedding/subset
```

---

# 6. CanvasKit을 최대 활용하는 구조

## 6.1 CanvasKit의 위치

CanvasKit은 단순 폴백이 아니라 다음 네 역할을 동시에 수행한다.

1. **Skia 호환 기준선**: 브라우저와 서버에서 동일 계열의 Skia 결과를 확보
2. **고급 효과 백엔드**: PathEffect, MaskFilter, ColorFilter, ImageFilter, RuntimeEffect
3. **텍스트·조판 백엔드**: Paragraph, font manager, glyph metrics, text-on-path 보조
4. **출력·검증 백엔드**: 고해상도 렌더, 썸네일, visual diff 기준, Lottie/Skottie

## 6.2 권장 커스텀 빌드

초기 전체 번들을 그대로 싣지 말고 CI에서 목적별 CanvasKit 변형을 만든다.

```text
canvaskit-core.wasm
  Path / Paint / Canvas / Image / Surface
  ColorSpace / Blend / Clip
  PathOps / PathBuilder

canvaskit-text.wasm
  Paragraph / FontMgr / shaping 관련 기능
  CJK·세로쓰기 보조 데이터는 앱 계층

canvaskit-effects.wasm
  SkSL RuntimeEffect
  ImageFilter / ColorFilter / MaskFilter
  PathEffect / Blender

canvaskit-animation.wasm
  Skottie / Lottie
  필요 프로젝트에서만 동적 로드

canvaskit-reference.wasm
  Software backend
  테스트·썸네일·출력용
```

실제 Skia 빌드 플래그와 CanvasKit 공개 API는 버전별로 변할 수 있으므로, 기능 플래그를 자동 검출하고 CI에서 API snapshot을 생성한다.

## 6.3 CanvasKit 자원 규칙

- `SkPath`, `SkPaint`, `SkImage`, `SkSurface`, `SkShader`, `SkImageFilter`는 명시적으로 해제한다.
- 프레임마다 객체를 생성하지 않고 pool·cache를 둔다.
- 현재 경로 API가 immutable인 버전에서는 `PathBuilder`로 배치 생성한다.
- 수천 개 stamp는 반복 JS 호출보다 `drawAtlas`, picture recording, typed-array batch를 우선한다.
- SkPicture는 정적 장면 캐시에 사용하고 편집 원본으로 저장하지 않는다.
- filter bounds와 halo를 사전에 계산해 필요한 타일만 확장한다.
- GPU surface가 context loss를 만나면 IR에서 다시 생성한다.

## 6.4 CanvasKit PathEffect로 추가할 기능

| PathEffect | 구현 기능 |
|---|---|
| Dash | 파선, 점선, 바느질, 레일, 말풍선 점선 |
| Discrete | 손떨림·거친 잉크·스케치 윤곽 |
| Corner | 코너 라운딩, 말풍선·도형 부드럽게 |
| Path1D | 경로를 따라 이미지·도형 stamp 반복 |
| Path2D | 2D 격자·패턴·스크린톤 배치 |
| Sum/Compose | 여러 path effect 조합 |
| Trim | 시작·끝 애니메이션, 선 그리기 reveal |
| Stroke/Fill 변환 | 윤곽 확장·outline·장식선 |

## 6.5 CanvasKit SkSL RuntimeEffect로 추가할 기능

- 종이·캔버스·노이즈 셰이딩
- 수채 경계·granulation 표시
- 만화 잉크 불균일
- RGB split·chromatic aberration
- halftone·Bayer·blue-noise dither
- heat haze·ripple·wave
- scanline·glitch·CRT
- emboss·normal-lighting
- inner/outer glow
- procedural gradient
- palette mapping
- texture warp
- tone curve approximation
- custom blender
- live material preview
- 3D depth·normal·ID 패스 결합
- 브러시 팁 procedural generation

SkSL은 복잡한 다중 패스 유체나 전역 prefix-sum을 대신하지 않는다. 단일·소수 입력을 갖는 국소 효과는 CanvasKit에, 전역·반복 solver는 WebGPU EffectGraph에 둔다.

## 6.6 CanvasKit ImageFilter로 추가할 기능

- Blur, DropShadow, DropShadowOnly
- ColorFilter chain
- Blend, Arithmetic blend
- Compose, Merge
- Crop, Offset, Tile
- MatrixTransform
- MatrixConvolution
- DisplacementMap
- Magnifier
- Dilate, Erode
- RuntimeShader filter
- diffuse·specular lighting
- image source filter
- shader source filter

이 필터들은 객체·레이어 단위의 작은 효과와 호환 출력에 우선 사용한다. 8K 전체 문서의 다중 패스는 자체 타일 EffectGraph로 컴파일한다.

---

# 7. Vello와 CanvasKit의 공존 규칙

## 7.1 Vello 우선 장면

- 수천~수십만 개의 path가 지속적으로 변하는 선화
- 가변 폭 outline을 많이 포함하는 벡터 레이어
- GPU compute 방식이 유리한 복잡한 겹침·클립
- 선택·앵커·가이드 같은 동적 오버레이
- Vello 장면으로 직접 조립 가능한 텍스트 outline·이미지·gradient

## 7.2 CanvasKit 우선 장면

- Skia PathEffect를 여러 개 조합한 선
- SkSL RuntimeEffect가 주요 시각 표현인 레이어
- 복합 ImageFilter·ColorFilter가 포함된 그룹
- Paragraph 기반 문단·Skottie·Skia 호환 자산
- Skia 결과와 시각 일치를 보장해야 하는 출력
- CPU software renderer로 동일 결과를 재현해야 하는 장면

## 7.3 둘 사이의 교환

```text
Vello Island
→ GPU texture
→ CanvasKit filter island
→ GPU texture
→ HybridFrameGraph

CanvasKit Island
→ GPU texture / ImageBitmap
→ Vello image node
→ Vello vector overlay
→ HybridFrameGraph
```

가장 좋은 경로는 동일 `GPUDevice` 또는 외부 GPU texture를 공유하는 것이지만, 엔진·브라우저 조합별로 반드시 feature probe와 회귀 테스트를 거친다. 공유가 불안정하면 `ImageBitmap` 전송을 사용하고, CPU readback은 출력·복구에 한정한다.

---

# 8. ThorVG·PixiJS·resvg·tiny-skia의 확장 역할

## 8.1 ThorVG

ThorVG는 다음 기능의 독립 아일랜드로 사용한다.

- SVG Tiny 중심의 빠른 미리보기
- Lottie·dotLottie 재생과 편집 preview
- 수백 개의 소형 animated sticker
- UI 아이콘·벡터 asset
- 저사양 CPU/SIMD 경로
- WebGL·WebGPU의 경량 vector path
- headless asset validation
- animation frame extraction
- blur·shadow·tint·tritone·color replacement 등 내장 효과

## 8.2 PixiJS

PixiJS는 다음 기능에 특화한다.

- 수백~수천 개 레퍼런스 이미지 보드
- 래스터 타일 sprite batching
- texture atlas·mipmap·texture GC
- drag·hit test·pointer event overlay
- selection handles·transform preview
- particle preview
- WebGL2 production fallback
- filter preview와 GPU sprite effects
- thumbnail wall·asset browser
- animation onion-skin texture stacking

## 8.3 resvg와 tiny-skia

- SVG import 결과의 결정적 기준선
- SVG export round-trip visual diff
- GPU와 무관한 CI screenshot
- 썸네일·preview 생성
- 서버·CLI 렌더
- 장애 복구
- 폰트·SVG feature 호환 보고
- 프린트용 중간 raster 검증

---

# 9. GPU Interop Broker와 최종 FrameGraph

## 9.1 교환 등급

```text
Level 0: 동일 GPUDevice·GPUTexture 직접 공유
Level 1: 외부 texture import/export
Level 2: ImageBitmap 또는 VideoFrame 전송
Level 3: OffscreenCanvas 간 copy
Level 4: CPU tile buffer
```

Level 0이 항상 가능하다고 가정하지 않는다. 런타임은 엔진·브라우저·GPU별 지원표를 유지한다.

## 9.2 단일 Present 소유자

혼합 장면에서는 자체 `HybridFrameGraph`가 최종 화면을 소유한다.

```text
Vello texture
CanvasKit texture
Wet-media texture
Pixi texture
Three.js color/depth/normal/ID
        │
        ▼
HybridFrameGraph
  color conversion
  premultiply normalization
  masks
  cross-engine blend
  final tone-map
  overlays
        │
        ▼
Present
```

벡터만 있는 경량 문서는 Vello가 직접 present할 수 있고, Skia 호환 모드는 CanvasKit이 직접 present할 수 있다. 그러나 문서 도중 present owner를 자주 바꾸지 않는다.

## 9.3 색상 계약

모든 백엔드는 다음 메타데이터를 반환한다.

```ts
interface RenderSurfaceContract {
  colorSpace: "srgb" | "display-p3" | "linear-srgb" | "rec2020";
  transfer: "srgb" | "linear" | "pq" | "hlg";
  alphaMode: "premultiplied" | "straight" | "opaque";
  pixelFormat: string;
  origin: "top-left" | "bottom-left";
  contentScale: number;
}
```

---

# 10. 품질 프로필

| 프로필 | 주 경로 | 대상 |
|---|---|---|
| Ultra WebGPU | Vello + CanvasKit WebGPU + Custom WebGPU + Three.js WebGPU | 데스크톱 고성능 |
| Standard WebGPU | Vello/CanvasKit 선택 + 타일 WebGPU, 제한된 습식 solver | 일반 데스크톱·신형 태블릿 |
| Compatible WebGL2 | CanvasKit WebGL + PixiJS + ThorVG WebGL + CPU brush 일부 | Safari·구형 GPU |
| CPU/Recovery | CanvasKit Software + Vello CPU + tiny-skia + Canvas2D | GPU 장애·CI·서버 |
| Mobile Saver | 작은 타일·낮은 습식 해상도·부분 프레임·동적 로드 | 모바일·저메모리 |


# 11. 최종 브러시 아키텍처

## 11.1 공통 입력 파이프라인

```text
Pointer Events Level 3
→ pointerrawupdate
→ coalesced samples
→ predicted samples
→ 장치별 pressure/tilt/twist 보정
→ timestamp 정규화
→ Rust/WASM resampler
→ 브러시별 stabilizer graph
→ StrokeIR
→ BrushProgram
→ 전문 백엔드
→ BrushOutputIR
→ Render Island
```

## 11.2 입력·보정 엔진 배치

| 기능 | 주 구현 | 보조·참고 |
|---|---|---|
| 원시 입력 | Pointer Events | pointer-tracker |
| 필압·기울기·twist | Browser API + 장치 프로필 | Wacom 샘플·Pressure.js 레거시 |
| 시간 재샘플링 | 자체 Rust/WASM | Catmull-Rom·Hermite |
| One-Euro | 자체 Rust | 공개 One-Euro 구현 참고 |
| Lazy stabilizer | 자체 Rust/WASM | lazy-brush |
| Spring stabilizer | 자체 XPBD/Spring | stroke-stabilizer 참고 |
| 속도 기반 선폭 | BrushProgram mapping | Signature Pad 참고 |
| 가변 폭 outline | Perfect Freehand | Kurbo·Bezier.js |
| Bézier fitting | fit-curve/smooth-fit-curve | 자체 SIMD 포팅 |
| 단순화 | simplify-js 또는 Rust RDP | corner preservation |
| endpoint correction | 자체 Worker | stroke-stabilizer 참고 |
| 예측 미리보기 | predicted events + transient path | 확정 샘플 도착 시 재조정 |

## 11.3 `BrushProgram` 노드

```text
Input
  Position / Pressure / Velocity / Acceleration / Direction
  Tilt / Azimuth / Altitude / Twist / Time / Distance / Curvature
  Random / Seed / LayerSample / PaperSample / Wetness / ColorPickup

Filter
  Clamp / Curve / Smooth / OneEuro / Spring / LazyRadius
  Hysteresis / DeadZone / Quantize / CornerPreserve / Predict

Geometry
  Centerline / Outline / NibSweep / DabEmitter / Ribbon
  BristleBundle / ParticleEmitter / PatternAlongPath / ShapeScatter

Material
  Solid / Gradient / ImageTip / ProceduralTip / Paper
  Pigment / Water / Oil / Wax / Charcoal / Graphite / Marker

Dynamics
  Size / Opacity / Flow / Spacing / Scatter / Rotation
  Aspect / Hardness / Jitter / Pickup / Deposit / Smudge
  Wetness / Viscosity / Granulation / BristleSpread / Reservoir

Output
  VelloPath / CanvasKitPicture / RasterTilePatch
  ExternalGpuTexture / WetMediaInjection / ParticleBake
  HeightNormalTile / SurfacePaintPatch
```

## 11.4 브러시 백엔드 최종 11종

| 백엔드 | 주 엔진 | 가장 잘하는 것 | 출력 |
|---|---|---|---|
| VectorInkBackend | Vello + Perfect Freehand + Kurbo | 가변 폭 잉킹·사후 편집 | vector path |
| SkiaBrushBackend | CanvasKit | PathEffect·SkSL·drawAtlas·Skia 효과 | picture/path/texture |
| RasterDabBackend | Custom WebGPU | 대형 래스터 dab·혼합·마스크 | sparse tile |
| NaturalMediaBackend | Hokusai/libmypaint | MyPaint 동역학·자연매체 프리셋 | tile patch |
| WetMediaBackend | WebGPU Compute | 물·안료·흡수·건조 | external texture |
| BristlePhysicsBackend | Rust/WASM XPBD | 브러시모·펜촉·pickup/deposit | dabs/height |
| ParticleBackend | WebGPU | 대량 입자·충돌·벡터장 | texture/vector bake |
| ProceduralVectorBackend | Vello/CanvasKit | 집중선·톤·패턴·장식 | vector scene |
| PixelBackend | WebGPU/CPU | 픽셀 퍼펙트·인덱스·디더 | integer tile |
| RetouchBackend | WebGPU/OpenCV/CanvasKit | 힐링·클론·블러·리퀴파이 | tile patch |
| SurfacePaintBackend | Three.js/WebGPU | 3D UV·projection·PBR 채널 | texture set |

## 11.5 2단계 획 표시

필기 지연을 줄이기 위해 획을 두 단계로 표시한다.

```text
Transient Preview
  저비용 centerline 또는 dab
  predicted sample 포함
  현재 프레임 즉시 표시

Committed Stroke
  확정된 샘플로 재계산
  고품질 geometry/texture/physics
  dirty tile만 교체
```

Transient 결과는 문서에 저장하지 않는다. Committed 결과와 차이가 눈에 띄지 않도록 동일 seed와 파라미터를 사용한다.

## 11.6 브러시별 최종 엔진 배치표

아래 표는 315개 브러시 변형을 구현할 때의 기본 라우팅이다. 실제 preset은 장치·문서·품질 프로필에 따라 보조 백엔드를 선택할 수 있다.

| 분류 | 브러시 | 주 백엔드 | 활용 라이브러리·엔진 | 품질·성능 전략 |
| --- | --- | --- | --- | --- |
| 선화·펜 | G펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 매핑펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 스푼펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 스쿨펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 둥근펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 카부라펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 만년필 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 펠트 라이너 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 모노라인 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 테크니컬 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 극세선 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 굵은 잉크 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 압력 없는 균일 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 속도 반응 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 압력 반전 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 테이퍼 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 양끝 테이퍼 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 거친 잉크 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 마른 잉크 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 번지는 잉크 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 캘리그래피 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 평촉 캘리그래피 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 브로드 엣지 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 브러시 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 수정 가능한 벡터 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 퍼스자 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 대칭자 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 곡선자 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 픽셀 스냅 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 선화·펜 | 애니메이션 클린업 펜 | Vello VectorInk + CanvasKit SkiaBrush | Perfect Freehand, Kurbo, fit-curve, Bezier.js, stroke-stabilizer, CanvasKit PathEffect | 원본 샘플·중심선·폭 프로파일 유지; Vello 대량 동적 선화, CanvasKit 특수 PathEffect |
| 연필·건식 매체 | HB 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 2B 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 4B 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 6B 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | H 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 샤프 0.3 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 샤프 0.5 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 목수 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 색연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 유성 색연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 수채 색연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 흑연 블록 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 연필 측면 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 연필 크로스해칭 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 연필 점묘 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 거친 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 매끈한 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 종이결 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 목탄 스틱 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 목탄 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 압축 목탄 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 버드나무 목탄 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 백색 분필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 컬러 분필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 소프트 파스텔 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 오일 파스텔 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 콩테 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 크레용 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 왁스 크레용 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 지우개 연필 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 연필·건식 매체 | 반죽 지우개 | Custom WebGPU RasterDab + Hokusai | Hokusai/libmypaint, FastNoiseLite, texture-synthesis, CanvasKit SkSL | 종이 height/roughness와 팁 atlas; 미세 입자·압력·기울기·회전 반응 |
| 마커·에어브러시 | 알코올 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 워터 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 코픽형 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 브로드 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 치즐 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 브러시 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 형광펜 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 투명 형광펜 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 불투명 페인트 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 포스카형 마커 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 소프트 에어브러시 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 하드 에어브러시 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 입자 에어브러시 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 노이즈 에어브러시 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 스프레이 캔 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 미세 분무 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 거친 분무 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 벽면 스프레이 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 그라데이션 에어브러시 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 마커·에어브러시 | 마스크 에어브러시 | Custom WebGPU RasterDab | CanvasKit drawAtlas/SkSL, PixiJS particle preview, Poisson disk | flow 누적과 알코올 edge 모델; 대량 dab은 GPU indirect/batch |
| 수채·수묵·잉크 | 둥근 수채붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 평붓 수채 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 워시 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 대걸레 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 세필 수채 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 마른 수채붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 젖은 수채붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 물 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 색상 번짐 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 안료 침전 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | Granulation 수채 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | Backrun 수채 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | Edge-darkening 수채 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | Wet-on-wet | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | Wet-on-dry | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | Lift-out 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 소금 효과 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 알코올 효과 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 마스킹 플루이드 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 수묵 세필 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 수묵 중붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 수묵 대붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 먹 번짐 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 먹 농담 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 발묵 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 갈필 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 먹 튀김 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 캘리그래피 먹붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 세척되지 않은 혼색 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 종이 흡수 반응 붓 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 수채·수묵·잉크 | 수채 스펀지 | Hokusai + WebGPU WetMedia | libmypaint, InkWash clean-room, Stable Fluids/PBF 참고, Spectral.js | 활성 타일만 물·안료·흡수·건조 계산; 최종 텍스처를 Vello/CanvasKit에 합성 |
| 유화·아크릴·과슈 | 둥근 유화붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 평붓 유화 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Filbert 유화 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Fan Brush | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Bristle Brush | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Palette Knife | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Impasto Knife | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Wet Oil | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Dry Oil | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Oil Mixer | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Oil Smudge | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | Loaded Dual-color Brush | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 아크릴 평붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 아크릴 Dry Brush | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 아크릴 Glaze | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 과슈 불투명 붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 과슈 워시 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 템페라 붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 벽화 붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 페인트 롤러 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 스펀지 페인트 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 두꺼운 페인트 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 얇은 Glaze | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 금속 안료 붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 유화·아크릴·과슈 | 진주 안료 붓 | Hokusai + WebGPU PaintHeight + XPBD Bristle | libmypaint, Spectral.js, FastNoiseLite, CanvasKit lighting filters | pickup/deposit·점성·높이·normal; 브러시모 접촉은 Rust/WASM XPBD |
| 장식·패턴·식생 | 나뭇잎 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 잔디 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 수풀 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 나뭇가지 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 꽃잎 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 꽃송이 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 덩굴 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 이끼 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 나무껍질 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 돌 질감 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 벽돌 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 구름 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 별 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 반짝이 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 빛 알갱이 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 보케 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 눈송이 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 빗방울 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 먼지 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 연기 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 불꽃 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 재 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 파편 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 유리 파편 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 털 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 짧은 털 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 긴 털 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 깃털 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 비늘 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 체인 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 로프 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 철망 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 레이스 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 봉제선 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 지퍼 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 천 주름 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 패턴 타일 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 만다라 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 기하 패턴 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 랜덤 도형 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 문자 스탬프 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 이미지 스탬프 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 장식·패턴·식생 | 다중색 스탬프 | Vello/CanvasKit VectorStamp + WebGPU Particle | Poisson disk, FastNoiseLite, CanvasKit Path1D/Path2D, PixiJS | 적은 수는 벡터 인스턴스, 대량은 GPU particle 후 bake |
| 웹툰·만화 효과 | 집중선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 방사 집중선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 곡선 집중선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 속도선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 평행 속도선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 가속 속도선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 감속 속도선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 떨림선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 충격선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 번개선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 감정선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 불안선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 어두운 분위기선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 빛줄기 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 잔상선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 액션 블러 브러시 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 망점 10% | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 망점 20% | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 망점 30% | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 망점 40% | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 원형 망점 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 선형 망점 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 크로스 망점 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 모래톤 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 노이즈톤 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 그라데이션 톤 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 구름톤 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 천 질감 톤 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 배경 플래시 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 효과음 외곽선 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 효과음 그림자 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 말풍선 꼬리 펜 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 컷 테두리 펜 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 프레임 분할 펜 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 배경 소실점 브러시 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 도시 창문 반복 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 군중 실루엣 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 웹툰·만화 효과 | 나무 실루엣 | Vello + CanvasKit + WebGPU Procedural | Kurbo, Paper.js, CanvasKit PathEffect/SkSL, Rough.js 참고 | 편집 가능한 절차 벡터를 우선하고 톤·노이즈는 해상도 독립 shader |
| 보정·리터치 | 투명 지우개 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 소프트 지우개 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 하드 지우개 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 벡터 지우개 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 교차점까지 지우기 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 선 전체 지우기 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 배경 지우개 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 블러 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 샤픈 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 스머지 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 손가락 문지르기 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 믹서 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 클론 스탬프 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 힐링 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 스팟 힐링 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Dodge | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Burn | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Sponge | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 채도 증가 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 채도 감소 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 색상 교체 브러시 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 마스크 칠하기 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | 선택 칠하기 | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Quick Mask | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Liquify Push | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Liquify Pull | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Liquify Twirl | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Liquify Bloat | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 보정·리터치 | Liquify Pucker | WebGPU Retouch + OpenCV.js | CanvasKit ImageFilter, OpenCV.js, Photon, PatchMatch/Poisson 참고 | 작은 객체 효과는 CanvasKit, 대형 픽셀 수정은 타일 compute |
| 물리·절차·리본 | 탄성 G펜 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 탄성 매핑펜 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 갈라지는 브러시모 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 다중 브러시모 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 브러시모 잉크 저장 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 회전 지연 평붓 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 리본 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 천 리본 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 로프 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 체인 물리 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 전선 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 덩굴 물리 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 머리카락 가닥 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 머리카락 묶음 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 털 흐름 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 깃털 물리 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 붕대 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 실·끈 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 중력 파티클 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 바람 파티클 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 소용돌이 파티클 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 충돌 파티클 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 점착 파티클 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 벡터장 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | SDF 회피 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 표면 부착 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 음악 반응 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 시간 기반 성장 브러시 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 절차적 균열 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 물리·절차·리본 | 절차적 번개 | Rust/WASM XPBD + WebGPU Particle + Vello | Rapier(장면), verlet/Floaty 참고, Kurbo | 입력 명령+seed를 저장하고 최종 vector/tile로 bake |
| 픽셀·도트·디더 | 1px 픽셀펜 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 2px 픽셀펜 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 픽셀 클러스터 펜 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 픽셀 퍼펙트 선 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 인덱스 팔레트 펜 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 타일맵 펜 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 스프라이트 펜 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | Bayer 2×2 디더 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | Bayer 4×4 디더 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | Bayer 8×8 디더 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | Blue-noise 디더 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | Floyd–Steinberg 디더 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | Atkinson 디더 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 도트 스크린 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | LCD 픽셀 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 게임보이 팔레트 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | NES 팔레트 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 픽셀·도트·디더 | 커스텀 제한 팔레트 | PixelBackend + CanvasKit SkSL | Culori, blue-noise/Bayer code, PixiJS nearest-neighbor | integer 좌표·팔레트·nearest sampling 강제 |
| 3D 표면·텍스처 | 3D 표면 컬러 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D 마스크 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D Roughness 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D Metallic 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D Normal 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D Height 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D Emissive 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | 3D ID 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Seam-aware 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Triplanar 페인트 | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Projection Paint | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Clone Across UV | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Decal Brush | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Material Stamp | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Vertex Color Paint | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Weight Paint | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | UV Island Fill | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Curvature Mask Brush | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | AO Dirt Brush | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |
| 3D 표면·텍스처 | Edge Wear Brush | Three.js SurfacePaint + Custom WebGPU | three-mesh-bvh, xatlas/meshopt, OpenCV, CanvasKit preview | raycast→UV/tri-planar stamp; seam dilation과 channel packing |


# 12. 최종 비파괴 필터·효과 아키텍처

## 12.1 `EffectGraphIR`

```ts
interface EffectNodeIR {
  id: string;
  type: string;
  version: number;
  inputs: EffectPortRef[];
  params: Record<string, unknown>;

  boundsPolicy: "same" | "expand" | "global" | "unknown";
  colorContract: ColorContract;
  alphaContract: AlphaContract;
  preferredBackends: BackendId[];
  deterministicSeed?: number;

  cachePolicy: "none" | "tile" | "island" | "persistent";
  qualityTiers: QualityTierSpec[];
}
```

필터는 레이어 픽셀에 즉시 파괴적으로 적용하지 않고 DAG 노드로 유지한다. 사용자가 명시적으로 “래스터화”하거나 파일 포맷이 요구할 때만 베이크한다.

## 12.2 필터 컴파일 순서

```text
EffectGraph
→ 상수 접기
→ 같은 색상 변환 합치기
→ 불필요한 premultiply 제거
→ 필터 bounds·halo 계산
→ 타일 가능/전역 분류
→ backend capability 분석
→ CanvasKit ImageFilter DAG / WGSL pass / OpenCV Worker로 분할
→ 중간 surface 재사용 계획
→ low-res preview
→ full-quality commit
```

## 12.3 백엔드 선택 규칙

| 필터 성격 | 권장 엔진 |
|---|---|
| 객체·작은 그룹의 blur/shadow/color | CanvasKit ImageFilter/ColorFilter |
| SkSL로 표현 가능한 국소 shader | CanvasKit RuntimeEffect |
| 대형 레이어의 다중 패스 | Custom WebGPU EffectGraph |
| 유체·반복 solver·전역 histogram | Custom WebGPU Compute |
| morphology·contour·inpaint·분석 | OpenCV.js |
| 작은 CPU 필터·Worker fallback | Photon |
| 대형 이미지 배치·리사이즈·코덱 | wasm-vips |
| SVG 기준선·CPU visual diff | resvg/tiny-skia |
| WebGL 즉시 preview | PixiJS filter 또는 custom GLSL |
| 3D depth/normal/ID 결합 | Three.js + HybridFrameGraph |
| 벡터 기하 효과 | Vello/CanvasKit + Kurbo/PathKit |

## 12.4 CanvasKit과 WebGPU 필터의 경계

CanvasKit을 사용하면 Skia의 검증된 filter semantics와 software fallback을 얻을 수 있다. 반면 다음 조건에서는 자체 WebGPU가 더 적합하다.

- 4K·8K·세로 수만 픽셀의 전체 레이어
- 많은 타일에 같은 필터를 적용
- 입력 텍스처가 3개 이상인 복잡한 DAG
- 반복 계산이 필요한 유체·deconvolution·optical flow
- histogram·prefix sum·distance field와 같은 전역 계산
- 브러시와 필터가 같은 타일 cache를 공유해야 하는 경우
- 3D depth·normal·motion vector를 결합하는 경우

## 12.5 필터 616종 최종 배치표

아래는 구현 가능한 필터·효과·분석 노드를 최대 범위로 정리한 것이다. 이름이 유사한 효과도 사용자 목적과 파라미터·백엔드가 달라 독립 preset 또는 노드로 제공할 수 있다.

| 분류 | 필터·효과 | 주 백엔드 | 활용 라이브러리·엔진 | 품질·성능 전략 |
| --- | --- | --- | --- | --- |
| 색상·채널·톤 | 밝기 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 대비 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 노출 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 감마 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 오프셋 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 검정점 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 흰점 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 레벨 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | RGB 커브 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 채널별 커브 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Luma 커브 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 로그 커브 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색조 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 채도 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 명도 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Vibrance | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Temperature | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Tint | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | White Balance | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Color Balance | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Selective Color | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Channel Mixer | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Color Lookup LUT 1D | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Color Lookup LUT 3D | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Gradient Map | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Duotone | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Tritone | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Posterize | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Threshold | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Solarize | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Invert | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Sepia | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Grayscale | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색상화 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색상 교체 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색 범위 변경 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Hue vs Hue | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Hue vs Sat | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Hue vs Luma | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Luma vs Sat | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Shadow/Mid/Highlight | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Split Toning | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Lift/Gamma/Gain | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | ASC CDL | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Filmic Tone Map | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | ACES Tone Map | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Reinhard Tone Map | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | AgX 유사 Tone Map | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Gamut Compression | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Soft Proof | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색맹 시뮬레이션 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색맹 보정 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 채널 스왑 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Alpha Premultiply | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Alpha Unpremultiply | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Alpha Threshold | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Alpha Curve | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Color Key | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Chroma Key | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Skin Tone Preserve | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Ink Color Replace | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Palette Map | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | Indexed Color Reduce | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 색상·채널·톤 | 색상 수 제한 | CanvasKit ColorFilter/SkSL + Custom WebGPU | Color.js, Culori, LittleCMS/WASM, Vello blend | 객체·소규모는 CanvasKit, 대형 조정 레이어는 fused WGSL; 색공간 변환은 별도 color pipeline |
| 블러·샤픈·복원 | Box Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Gaussian Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Stack Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Tent Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Dual Kawase Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Bokeh Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Lens Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Depth Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Motion Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Directional Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Radial Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Zoom Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Spin Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Surface Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Bilateral Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Guided Filter | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Median Filter | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Kuwahara Filter | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Anisotropic Diffusion | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Domain Transform Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Smart Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Bloom Blur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Unsharp Mask | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | High Pass Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Laplacian Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Sobel Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Smart Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Edge-aware Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Deconvolution Richardson–Lucy | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Wiener Deconvolution | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Motion Deblur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Lens Deblur | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Denoise Before Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Anti-alias Refine | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Jagged Edge Smooth | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Upscale Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Downscale Sharpen | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Local Contrast | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Clarity | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Texture | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Dehaze | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Defringe | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Chromatic Fringing Correction | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 블러·샤픈·복원 | Halo Suppression | CanvasKit ImageFilter + WebGPU EffectGraph | OpenCV.js, Photon, wasm-vips | 작은 filter DAG는 Skia, 큰 radius·전역·반복 solver는 타일 WebGPU; 출력은 vips |
| 노이즈·질감·디더 | Uniform Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Gaussian Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Poisson Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Salt & Pepper | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Film Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Monochrome Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Color Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Blue Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Perlin Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Simplex Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Worley Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Fractal Brownian Motion | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Turbulence | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Paper Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Canvas Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Watercolor Paper | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Wood Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Stone Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Metal Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Fabric Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Leather Grain | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Scratch | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Dust | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Old Film | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | VHS Noise | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Scanline | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | CRT Mask | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Pixel Grid | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Moiré Generate | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Moiré Reduction | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Bayer 2×2 | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Bayer 4×4 | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Bayer 8×8 | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Blue-noise Dither | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Floyd–Steinberg | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Jarvis–Judice–Ninke | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Stucki | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Atkinson | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Sierra | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Burkes | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Random Dither | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Halftone Dot | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Halftone Line | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Halftone Cross | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | CMYK Halftone | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Newsprint | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Screen Tone | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Granulation | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Pigment Separation | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Texture Synthesis | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 노이즈·질감·디더 | Seamless Tile | CanvasKit SkSL + WebGPU Procedural | FastNoiseLite, simplex-noise, blue-noise code, texture-synthesis | 해상도 독립 procedural shader와 seed 저장; 인쇄톤은 주파수·각도 고정 |
| 왜곡·변형·리퀴파이 | Affine Transform | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Perspective Transform | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Four-point Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Mesh Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Cage Transform | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Puppet Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | MLS Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Thin Plate Spline | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Displacement Map | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Vector Field Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Flow Map Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Polar Coordinates | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Rectangular to Polar | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Fisheye | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Lens Distortion | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Barrel Distortion | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Pincushion Distortion | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Chromatic Lens Distortion | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Panorama Warp | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Wave | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Sine Wave | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Ripple | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Water Ripple | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Twirl | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Whirlpool | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Pinch | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Bulge | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Spherize | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Cylinder | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Shear | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Zigzag | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Wind | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Shear Smear | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Pixel Stretch | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Datamosh-like Displace | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Glitch Slice | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | RGB Channel Offset | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Push | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Pull | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Twirl | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Pucker | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Bloat | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Reconstruct | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Liquify Freeze Mask | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Content-aware Scale | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Seam Carving | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Perspective Crop | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Straighten | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Camera Shake | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Heat Haze | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Refraction | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 왜곡·변형·리퀴파이 | Magnifier | WebGPU EffectGraph | CanvasKit Displacement/Matrix, OpenCV.js, Paper/Kurbo | 국소 warp는 GPU, 기하 변형은 vector IR, content-aware는 Worker/WASM |
| 빛·그림자·합성 | Drop Shadow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Inner Shadow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Long Shadow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Contact Shadow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Ambient Shadow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Outer Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Inner Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Bloom | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Lens Flare | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | God Rays | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Light Rays | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Volumetric-like Rays | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Vignette | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Spotlight | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Gradient Light | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Relight from Normal | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Diffuse Lighting | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Specular Lighting | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Rim Light | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Matcap | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Emboss | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Bevel | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Chisel Bevel | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Satin | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Chrome | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Glass | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Frosted Glass | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Refraction Glass | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Metallic Sheen | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Pearlescent | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Iridescence | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Holographic | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Anisotropic Highlight | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Neon Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Electric Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Fire Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Heat Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Color Dodge Glow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Shadow Tint | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Highlight Tint | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | AO Composite | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Depth Fog | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Atmospheric Perspective | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Z-depth Blur | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Normal Map Generate | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Height Map Generate | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Normal Combine | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Height-to-Shadow | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | 3D ID Colorize | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Depth Edge | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Fresnel Mask | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 빛·그림자·합성 | Lighting Pass Mixer | CanvasKit ImageFilter/SkSL + WebGPU | Vello blend, Three.js normal/depth, Pixi preview | 객체 효과는 Skia, 다중 pass와 3D pass 결합은 FrameGraph |
| 선화·웹툰·만화 | 사진 선화 추출 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | XDoG Line Art | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Canny Line Art | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Sobel Line Art | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Laplacian Line Art | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | DoG Line Art | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Color Edge | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Vector Trace Preview | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 굵게 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 가늘게 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 균일화 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 흔들림 보정 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 끊김 연결 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Gap Close | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 교차 정리 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 먼지 제거 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 흰점 제거 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 검정점 제거 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 선화 투명화 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 흰 배경 제거 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 검정선 색상화 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Closed Region Detect | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 남은 틈 검출 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 자동 언더필 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 셀 셰이딩 분리 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 그림자 영역 추출 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 하이라이트 영역 추출 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 톤 자동 변환 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 망점 변환 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 망점 각도 변경 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 망점 주파수 변경 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 망점 닷게인 보정 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 모아레 검출 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 모아레 감소 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 톤 깨짐 복원 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 집중선 생성 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 속도선 생성 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 평행선 생성 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 크로스해칭 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 점묘화 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 목판화 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 잉크 번짐 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 거친 잉크 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 만화 Posterize | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 셀 애니메이션 룩 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 뉴스프린트 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 효과음 Outline | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 효과음 Extrude | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 말풍선 그림자 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 컷 경계 보정 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 웹툰 세로 리샘플 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 컷 자동 분리 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 패널 간격 통일 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 원근선 추출 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 3D NPR Line Merge | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Depth-aware Line Weight | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Occluded Line Remove | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Color Hold | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 라인 아트 색 분리 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | Screen Tone Mask | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 톤 아래 흰색 보존 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 선화·웹툰·만화 | 인쇄용 흑백 이진화 | OpenCV.js + WebGPU + Vello/CanvasKit | VTracer, Potrace 참고, Kurbo, FastNoiseLite | 분석·형태학 후 편집 가능한 vector 또는 mask로 변환; 톤은 shader |
| 형태학·선택·마스크 | Dilate | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Erode | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Open | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Close | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Morphological Gradient | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Top Hat | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Black Hat | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Distance Transform | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Signed Distance Field | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Connected Components | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Contour Extract | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Contour Simplify | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Convex Hull | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Concave Hull | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Skeletonize | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Thinning | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Pruning | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Hole Fill | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Flood Fill | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Region Grow | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Watershed | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | GrabCut | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Magic Wand | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Color Range Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Luma Range Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Alpha Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Edge-aware Feather | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Gaussian Feather | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Expand | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Contract | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Smooth | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Border | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Remove Islands | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Fill Holes | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Selection Refine Hair | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Blur | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Sharpen | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Levels | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Invert | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Combine Add | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Combine Subtract | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask Intersect | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Mask XOR | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Vector Mask Rasterize | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Raster Mask Vectorize | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Quick Mask Overlay | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Object ID Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Depth Range Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Normal Direction Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Curvature Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | AO Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 형태학·선택·마스크 | Material ID Select | OpenCV.js + WebGPU Morphology | CanvasKit Dilate/Erode, Clipper2, PathKit | 작은 mask는 Skia, 대형 mask는 compute; contour는 vector selection으로 보존 |
| 보정·인페인팅·복제 | Clone Stamp | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Aligned Clone | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Perspective Clone | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Pattern Stamp | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Healing Brush | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Spot Healing | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Patch Tool | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Poisson Blend | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Telea Inpaint | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Navier–Stokes Inpaint | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | PatchMatch Inpaint | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Content-aware Fill | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Content-aware Move | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Red-eye Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Dust & Scratch Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Dead Pixel Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Hot Pixel Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Banding Reduction | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Posterization Smooth | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | JPEG Artifact Reduction | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | WebP Artifact Reduction | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Color Bleed Fix | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Fringe Removal | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | White Matte Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Black Matte Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Edge Decontaminate | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Transparent Pixel Color Fix | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Seamless Clone | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Texture Repair | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Line Art Repair | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Speech Bubble Cleanup | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Text Removal Assist | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Screen Tone Repair | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Moiré Repair | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Scan Cleanup | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Perspective Document Flatten | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Page Curl Flatten | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Paper Stain Remove | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Background Normalize | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 보정·인페인팅·복제 | Ink Density Normalize | WebGPU Retouch + OpenCV.js | CanvasKit, PatchMatch/Poisson 공개 구현 참고, Photon | brush-local 처리·dirty tiles; 자동 채움은 preview와 commit 분리 |
| 스타일·예술 효과 | Oil Paint Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Watercolor Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Gouache Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Acrylic Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Ink Wash Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Pencil Sketch | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Colored Pencil | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Charcoal Sketch | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Pastel Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Crayon Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Chalk Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Marker Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Comic Stylize | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Anime Cel | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Poster Art | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Cutout | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Stained Glass | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Mosaic | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Voronoi Mosaic | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Pointillism | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Crosshatch | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Engraving | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Woodcut | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Linocut | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Etching | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Lithography | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Screen Print | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Risograph | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Pixel Art | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | ASCII Art | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Low Poly | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Paper Cut | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Origami Fold | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Embroidery | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Knitting | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Halftone Pop Art | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Duotone Poster | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Glitch Art | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Databending | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Vaporwave | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Cyberpunk Neon | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Retro Print | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Old Manga | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Blueprint | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Photocopy | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Fax | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Thermal Print | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Stamp | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Rubber Stamp | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Graffiti | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Spray Paint | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Neon Sign | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Hologram | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Clay Render | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Plastic Toy | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 스타일·예술 효과 | Miniature Tilt Shift | CanvasKit SkSL + WebGPU EffectGraph | OpenCV.js, Photon, Hokusai, texture-synthesis | live preview는 저해상도, commit은 타일 full-quality; 스타일별 non-destructive node |
| 시간·애니메이션·영상 | Frame Blend | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Optical Flow Interpolation | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Motion Trail | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Echo | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Onion Skin Composite | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Temporal Denoise | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Temporal Blur | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Frame Difference | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Flicker Reduction | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Stabilization | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Rolling Shutter Correction | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Time Remap | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Posterized Time | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Loop Seam | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Ping-pong Loop | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Boil Line Effect | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Boil Fill Effect | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Random Frame Hold | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Camera Shake Generator | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Film Gate Weave | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Dust Temporal | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Rain Temporal | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Snow Temporal | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Particle Trail | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Motion Vector Visualize | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Depth Motion Blur | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Vector Motion Blur | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Animated Gradient | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Animated Noise | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Animated Tone | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Lottie Effect Bake | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | GIF Palette Optimize | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Sprite Sheet Pack | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Frame Deduplicate | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Delta Frame Encode | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 시간·애니메이션·영상 | Timelapse Exposure Normalize | WebGPU Temporal + WebCodecs | OpenCV optical flow, ffmpeg.wasm fallback, ThorVG/Skottie | frame cache와 motion/depth vector 사용; 인코딩은 WebCodecs 우선 |
| 3D·깊이·NPR | Depth Map Import | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Normal Map Import | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Object ID Import | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Material ID Import | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | World Position Import | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | UV Pass Import | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Depth-based Fog | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Depth-based Selection | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Depth-based Blur | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Depth-based Outline | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Normal-based Outline | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Crease Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Silhouette Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Suggestive Contour | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Ridge/Valley Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Occlusion Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Shadow Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Material Boundary Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Line Weight by Depth | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Line Weight by Light | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Line Weight by Curvature | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Hidden Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | X-ray Line | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Technical Drawing | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Toon Shading | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Ramp Shading | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Matcap Shading | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Hatching by Normal | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Hatching by Light | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Crosshatch by Curvature | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Ambient Occlusion | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Curvature Map | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Thickness Map | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Cavity Map | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Edge Wear | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Dirt Mask | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Triplanar Texture | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | UV Seam Dilation | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Normal Detail Combine | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Height Parallax Preview | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | PBR Channel Pack | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Decal Composite | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Shadow Catcher | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Ground Contact | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Camera Match Overlay | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | Perspective Grid from Camera | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | 3D-to-Line Vectorize | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | 3D-to-Tone | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 3D·깊이·NPR | 3D Color Hold | Three.js/WebGPU + Vello/CanvasKit | three-mesh-bvh, OpenCV, Manifold | 3D pass 생성 후 vector/raster NPR; line은 가능하면 편집 가능한 path |
| 출력·유틸리티·분석 | Resize Nearest | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Resize Bilinear | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Resize Bicubic | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Resize Lanczos | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Resize Mitchell | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Resize Area | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Content-aware Resize | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Rotate 90 | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Arbitrary Rotate | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Canvas Expand | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Canvas Trim | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Auto Crop | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Transparent Border Trim | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Tile Pyramid | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Mipmap Generate | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Thumbnail Generate | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Contact Sheet | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Channel Extract | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Channel Pack | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Alpha Extract | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Alpha Pack | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Premultiply Check | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Out-of-gamut Warning | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Clipping Warning | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Ink Coverage | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Histogram | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Waveform | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Vectorscope | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | False Color | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Focus Peaking | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Edge Map Preview | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Difference View | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | SSIM Heatmap | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | DeltaE Heatmap | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Pixel Grid Overlay | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Safe Area Overlay | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Bleed Overlay | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Print Margin | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | DPI Convert | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | ICC Convert | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Soft Proof | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | CMYK Preview | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Spot Color Preview | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Color Profile Embed | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Metadata Strip | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Metadata Preserve | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Watermark | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | QR Embed | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Copyright Mark | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | File Integrity Hash | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Layer Complexity Analyze | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | GPU Cost Heatmap | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Filter Cost Heatmap | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Dirty Tile Visualize | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Moiré Risk Analyze | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Font Missing Analyze | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | PSD Compatibility Analyze | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |
| 출력·유틸리티·분석 | Export Preflight | wasm-vips + CanvasKit Software + resvg | OpenCV.js, LittleCMS, Photon, tiny-skia | 대형 배치·코덱은 vips, 결정적 검증은 CPU renderer, 진단은 Worker |


# 13. 전체 제품 기능 최종 구현 매트릭스

## 13.1 기능 계층 원칙

- 기능은 React 컴포넌트에 종속시키지 않는다.
- 모든 사용자 행위는 `CommandBus` 명령으로 표현한다.
- 렌더러는 기능 상태의 원본이 아니라 결과 생성기다.
- 저장·Undo·협업은 의미 객체와 명령을 기준으로 한다.
- GPU 결과는 cache이며 문서와 분리한다.
- 파일 import는 곧바로 내부 객체로 변환하고 호환 손실을 기록한다.
- 기능이 특정 엔진에서만 가능하면 capability flag와 fallback을 함께 정의한다.
- 고비용 기능은 preview quality와 commit quality를 분리한다.

## 13.2 1,045개 기능 최종 배치표

아래 표는 드로잉 외 레이어·선택·벡터·텍스트·웹툰·파일·애니메이션·3D·협업·저장·AI·접근성·보안까지 포함한다.

| 영역 | 구현 기능 | 주 모듈 | 활용 엔진·라이브러리 | 구현 원칙 |
| --- | --- | --- | --- | --- |
| 캔버스·뷰포트 | 유한 아트보드 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 무한 캔버스 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 다중 아트보드 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 세로 웹툰 캔버스 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 페이지 만화 캔버스 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 회전 캔버스 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 미러 뷰 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 듀얼 뷰 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 분할 뷰 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 미니맵 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | Navigator | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 픽셀 그리드 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 투명도 격자 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 원근 그리드 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 등각 그리드 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 사용자 그리드 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 자 스케일 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | Safe Area | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | Bleed | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | Trim Mark | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 줌 중심 유지 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 커서 중심 줌 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 부드러운 팬 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 관성 팬 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 터치 제스처 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 트랙패드 제스처 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 캔버스 색상 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 작업 영역 프리셋 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 레퍼런스 주변 공간 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 전체 화면 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | Presentation Mode | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 색상 교정 Preview | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | 고해상도 타일 스트리밍 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | LOD 미리보기 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 캔버스·뷰포트 | GPU 상태 복구 | ViewportCore + RenderIslandCompiler | Vello/CanvasKit/PixiJS/Custom WebGPU, DOM gestures | 카메라 상태와 문서 좌표 분리; 대형 공간은 scene shard·LOD |
| 레이어·합성 | 래스터 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 벡터 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 텍스트 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 말풍선 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 3D 연결 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 애니메이션 셀 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 조정 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 필터 마스크 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 마스크 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 벡터 마스크 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 빠른 마스크 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 그룹 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 폴더 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 중첩 그룹 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 클리핑 레이어 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Alpha Inheritance | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 투명도 잠금 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 픽셀 잠금 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 위치 잠금 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 전체 잠금 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 색상 표시 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Pass-through 그룹 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Isolated 그룹 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Knockout | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Blend If | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 채널별 블렌드 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Blend Range | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 스타일 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 스마트 객체 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 링크된 객체 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 복제 인스턴스 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 심볼·마스터 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 컴프 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Platform Variant | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 현지화 Variant | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 검열 Variant | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Visibility Set | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Reference Layer | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Draft Layer | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Guide Layer | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 선화 참조 폴더 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Auto Select Layer | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 검색 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 태그 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 필터링 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 색상 라벨 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 썸네일 크기 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 다중 선택 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 일괄 이름 변경 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 일괄 변환 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 병합 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 표시 레이어 병합 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 새 레이어로 합치기 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | Flatten Copy | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 레이어·합성 | 레이어 복원 포인트 | LayerGraph + HybridFrameGraph | Vello, CanvasKit, WebGPU, PixiJS | semantic DAG가 원본; 엔진별 island로 컴파일 |
| 블렌딩·채널 | Normal | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Darken | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Multiply | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Color Burn | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Linear Burn | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Darker Color | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Lighten | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Screen | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Color Dodge | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Linear Dodge | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Lighter Color | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Overlay | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Soft Light | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Hard Light | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Vivid Light | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Linear Light | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Pin Light | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Hard Mix | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Difference | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Exclusion | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Subtract | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Divide | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Hue | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Saturation | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Color | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Luminosity | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Plus | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Modulate | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Source In | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Source Out | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Destination In | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Destination Out | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Source Atop | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Destination Atop | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | XOR | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 채널 On/Off | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | RGB 채널 보기 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Alpha 보기 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | CMYK 채널 Preview | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Spot Channel | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Depth Channel | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Normal Channel | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Object ID Channel | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | Material ID Channel | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 멀티채널 이미지 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 채널 복사 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 채널 붙여넣기 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 채널 혼합 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 채널을 마스크로 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 블렌딩·채널 | 마스크를 채널로 | HybridFrameGraph | Peniko/Vello, CanvasKit Blender, WGSL | premultiplied·color-space 계약을 강제하고 미지원 모드는 offscreen |
| 선택·채우기 | 사각 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 타원 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 자유 올가미 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 다각형 올가미 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Polyline 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 마술봉 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 색 범위 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 밝기 범위 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 투명 픽셀 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 레이어 경계 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 벡터 객체 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 경로 세그먼트 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 텍스트 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 3D 객체 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Object ID 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Depth Range 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 추가 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 빼기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 교차 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 XOR | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 반전 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 전체 선택 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 해제 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 저장 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 불러오기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 채널 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Quick Mask | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 이동 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 변형 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 복사·붙여넣기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 Feather | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 Smooth | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 Expand | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 Contract | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 Border | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선택 Hole Fill | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 작은 섬 제거 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 머리카락 경계 Refine | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Edge Decontaminate | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Flood Fill | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Reference Layer Fill | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Displayed Layers Fill | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | Gap Close Fill | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 둘러싸고 칠하기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 연속 채색 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 남은 틈 채우기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 선화 아래 자동 확장 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 색상 오차 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 투명도 임계값 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 영역 미리보기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 채우기 벡터화 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 그라데이션 채우기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 메시 그라데이션 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 패턴 채우기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 톤 채우기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 3D ID 채우기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 폐영역 자동 인식 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 다중 영역 일괄 채우기 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 선택·채우기 | 색상 세트 자동 채색 | SelectionCore + WebGPU/OpenCV | Clipper2, PathKit, Vello/CanvasKit | vector mask와 raster mask 동시 보존; 대형 flood fill은 GPU |
| 변형·정렬·가이드 | 이동 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 회전 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 균일 크기 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 비균일 크기 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 기울이기 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Perspective Transform | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Free Transform | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Distort | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Warp | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Mesh Transform | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Cage Transform | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Puppet Transform | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Transform Again | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 수치 Transform | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Pivot 편집 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 변환 기준점 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Bounding Box | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Anchor Handles | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Align Left | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Align Center | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Align Right | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Align Top | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Align Middle | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Align Bottom | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 가로 분배 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 세로 분배 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 간격 동일 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 크기 동일 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 회전 동일 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 픽셀 스냅 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Grid Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Guide Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Anchor Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Path Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Center Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Edge Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Intersection Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Angle Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Perspective Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 3D Surface Snap | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Smart Guide | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 거리 표시 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 각도 표시 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 치수 도구 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 측정 도구 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Protractor | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Parallel Ruler | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Symmetry Ruler | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Radial Symmetry | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Perspective Ruler 1점 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Perspective Ruler 2점 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Perspective Ruler 3점 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Fisheye Ruler | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Concentric Circle Ruler | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Curve Ruler | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Custom Ruler | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | Ruler별 브러시 제한 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 가이드 잠금 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 변형·정렬·가이드 | 가이드 숨기기 | GeometryCore | Paper.js, Kurbo, Clipper2, Konva 알고리즘 참고 | 문서 좌표에서 비파괴 transform; snap spatial index |
| 벡터·도형·패스 | Pen Tool | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Pencil Vector Tool | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Line | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Polyline | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Rectangle | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Rounded Rectangle | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Ellipse | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Polygon | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Star | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Spiral | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Arc | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Pie | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Arrow | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Callout | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Custom Shape | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Boolean Union | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Boolean Subtract | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Boolean Intersect | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Boolean XOR | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Divide | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Trim | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Extend | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Join | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Close Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Open Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Reverse Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Offset Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Outline Stroke | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Simplify | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Smooth | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Corner Convert | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Curve Convert | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Add Anchor | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Delete Anchor | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Break Anchor | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Join Anchor | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Handle Symmetry | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Handle Independent | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Path Length | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Path Measure | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Path Direction | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Stroke Width Profile | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Variable Width Points | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Brush Along Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Pattern Along Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Text Along Path | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Blend Shapes | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Shape Morph | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Vector Eraser | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | 교차점까지 벡터 지우기 | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | 선 전체 벡터 지우기 | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | 벡터 선폭 일괄 수정 | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | 벡터 색 일괄 수정 | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | 벡터 Rasterize | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | Raster Vectorize | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | SVG Import | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | SVG Export | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | DXF 기본 Import | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | PDF Vector Import | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 벡터·도형·패스 | AI 호환 범위 Import | VectorCore | Kurbo, Paper.js, PathKit, Clipper2, Vello, CanvasKit | 기하는 renderer와 분리; path cache와 incremental compile |
| 텍스트·말풍선·식자 | 가로쓰기 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 세로쓰기 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | CJK shaping | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 한글 조합 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 양방향 텍스트 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 루비 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 후리가나 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 금칙 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 행두·행말 규칙 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 문단 정렬 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 양쪽 정렬 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 자간 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 행간 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 문단 간격 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Baseline Shift | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Tracking | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Kerning | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Ligature | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Variable Font | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | OpenType Feature | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Fallback Font | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Font Missing Report | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Font Embed | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Font Subset | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 글자별 스타일 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 문단 스타일 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Character Style | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Style Token | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Outline | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Fill | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Gradient | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Pattern | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Stroke | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 다중 Stroke | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Shadow | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 텍스트 Warp | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Text on Path | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Text in Shape | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Auto Fit | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Auto Size | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | Overflow 표시 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 타원 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 사각 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 구름 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 폭발 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 생각 말풍선 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 속삭임 말풍선 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 전자음 말풍선 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 꼬리 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 다중 꼬리 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 꼬리 자동 연결 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 화자 연결 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 대사 ID | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 번역 ID | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 충돌 회피 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 말풍선 자동 크기 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 대사 흐름 순서 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 식자 교정 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 대사 CSV Import | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 대사 CSV Export | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 언어별 Variant | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 효과음 Text | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 효과음 원근 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 효과음 왜곡 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | 효과음 Material | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 텍스트·말풍선·식자 | PSD Text 보존 | TextLayout + BalloonEngine | HarfBuzz/Parley, CanvasKit Paragraph, Vello, fontkit/opentype | DOM IME와 렌더를 분리; CJK·세로쓰기·폰트 보고 |
| 웹툰·페이지·스토리 | 컷 프레임 생성 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 자동 분할 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 간격 조절 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 병합 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 분리 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 순서 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 읽기 순서 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 세로 스크롤 Preview | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 모바일 Preview | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 태블릿 Preview | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 데스크톱 Preview | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 플랫폼별 폭 Preview | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 긴 이미지 분할 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 업로드 규격 검사 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 페이지 관리자 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 양면 페이지 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 표지·내지 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 재단선 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 여백 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 페이지 템플릿 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 템플릿 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 말풍선 템플릿 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 캐릭터 시트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 표정 시트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 포즈 시트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 소품 시트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 배경 시트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컬러 스크립트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 스토리보드 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 콘티 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 썸네일 보드 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 샷 리스트 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 에피소드 관리자 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 시즌 관리자 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 시리즈 바이블 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 캐릭터 관계 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 장소 데이터베이스 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 시간대·날씨 태그 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 소품 연속성 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 의상 연속성 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 색상 연속성 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 장면 연속성 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 대사 검색 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 효과음 검색 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷별 수정 상태 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 작업 담당자 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 검수 상태 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 마감일 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 승인 단계 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 플랫폼 Variant | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 현지화 Variant | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 검열 Variant | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 스포일러 마킹 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 콘텐츠 경고 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 출고 패키지 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 에피소드 차이 비교 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 컷 재사용 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 배경 재사용 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 웹툰·페이지·스토리 | 카메라 재사용 | WebtoonSemanticCore | LayerGraph, TextIR, TimelineIR, OPFS/Yjs | 컷·대사·화자·에피소드 ID를 픽셀과 분리 |
| 색상·팔레트·관리 | HSV Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | HSL Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | RGB Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Lab Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | LCH Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | OKLab Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | OKLCH Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | CMYK Preview Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 색상 휠 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 삼각형 Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 사각 Picker | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 컬러 슬라이더 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 최근 색상 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 보조 색상 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 전경·배경색 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 색상 교환 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Eyedropper | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 평균 색상 추출 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 표시 색상 추출 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 레이어 색상 추출 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 3D 표면 색상 추출 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 팔레트 생성 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 이미지 팔레트 추출 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 조화색 추천 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 보색 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 유사색 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 분할 보색 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 삼각 조화 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 사각 조화 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 온도 조화 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 명도 단계 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 채도 단계 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 캐릭터 팔레트 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 장면 팔레트 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 브랜드 팔레트 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 공유 팔레트 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 팔레트 버전 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 팔레트 잠금 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 팔레트 태그 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 팔레트 검색 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Spot Color | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Global Color | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Linked Color | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 색상 토큰 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Spectral Mix | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Pigment Palette | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Paint Contamination | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Brush Rinse | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Color History | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Gamut Warning | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Soft Proof | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | ICC Profile | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Display P3 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | sRGB | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Linear sRGB | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | Rec.2020 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | HDR Preview | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 색차 DeltaE | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 색상·팔레트·관리 | 색상 접근성 검사 | ColorCore | Color.js, Culori, Spectral.js, LittleCMS/WASM, CanvasKit | UI 색·표시 색·안료 혼색·출력 색을 분리 |
| 이미지·파일·호환 | PNG Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | JPEG Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | WebP Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | AVIF Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | GIF Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | BMP Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | TIFF Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | OpenEXR Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | HDR Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | HEIF 조건부 Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | SVG Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | PDF Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | PSD Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | PSD Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | PSB Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | PSB Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | ORA Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | KRA 참조 Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | CLIP 참조 Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | ASE/ASEPRITE Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | APNG Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Animated WebP Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Sprite Sheet Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | ICO Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | ICNS Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Raw RGBA Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Clipboard Image | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Drag & Drop | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Paste SVG | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Paste Text | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Paste Layer | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Asset Link Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | GLTF/GLB Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | OBJ Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | STL Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | PLY Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | FBX 조건부 Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | DAE Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | VRM Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | USDZ 조건부 Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | STEP/IGES 변환 Bridge | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | SKP 변환 Bridge | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | DXF Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Brush .myb Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | ABR 분석 Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Brush Pack Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Palette ASE Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | LUT CUBE Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Lottie JSON Import/Export | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | dotLottie Import | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Project Package | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Incremental Save | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Autosave | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Recovery Open | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Import Compatibility Report | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Export Preflight | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Visual Diff Report | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Missing Asset Report | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 이미지·파일·호환 | Rights Manifest | CodecRegistry | ag-psd, @webtoon/psd, resvg, wasm-vips, glTF Transform | 포맷별 adapter·호환 보고·round-trip corpus |
| 애니메이션·타임라인 | 프레임 타임라인 | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | 셀 타임라인 | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | 키프레임 | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Hold Key | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Tween | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Graph Editor | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Dope Sheet | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Exposure Sheet | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Onion Skin | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Light Table | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Frame Flip | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Loop Range | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Playback Range | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | FPS 설정 | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Drop Frame Preview | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Audio Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Waveform | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Lip Sync Marker | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Camera Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | 3D Object Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Layer Transform Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Opacity Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Filter Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Mask Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Text Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Lottie Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Particle Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Physics Bake Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Pose Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Expression Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Cel Reuse | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Cel Link | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Cel Duplicate | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Frame Insert | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Frame Delete | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Frame Reverse | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Frame Hold | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Frame Blend | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Motion Path | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Easing Preset | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Custom Easing | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Motion Blur | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Depth Motion Blur | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Vector Motion Blur | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Camera Shake | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Parallax | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Multi-plane Camera | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Peg | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Bone Rig | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Deformer | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Mesh Deform | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | IK | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | FK | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Constraint | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Audio Scrub | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Subtitle Track | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Marker | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Comment Marker | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Version Compare | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | GIF Export | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | MP4 Export | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | WebM Export | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Image Sequence | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Sprite Sheet | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Lottie Export | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 애니메이션·타임라인 | Timelapse Export | TimelineCore | Vello/CanvasKit/ThorVG, WebCodecs, ffmpeg.wasm | 편집 데이터와 인코딩 분리; frame cache와 worker |
| 3D·VRM·모델링 | 3D Viewport | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Orthographic Camera | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Perspective Camera | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Camera Bookmark | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Camera Match | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Focal Length | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Sensor Size | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Depth of Field Preview | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Lights | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | HDRI | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Shadow | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | NPR Material | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Toon Ramp | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Outline | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Depth Pass | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Normal Pass | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Object ID Pass | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Material ID Pass | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | UV Pass | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | World Position Pass | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | GLTF Loader | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | VRM Loader | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | OBJ Loader | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | STL Loader | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | PLY Loader | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Scene Outliner | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Collection | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Parenting | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Transform | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Pivot | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Grid Snap | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Vertex Snap | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Surface Snap | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Bounding Box Snap | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Room Builder | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Wall | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Floor | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Ceiling | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Door | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Window | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Stairs | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Primitive Modeling | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Extrude | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Inset | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Bevel | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Loop Cut | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Knife | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Bridge | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Fill Hole | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Mirror | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Array | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Solidify | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Boolean | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Subdivision Preview | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Decimate | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Remesh 조건부 | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | UV Viewer | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | UV Unwrap Bridge | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Texture Paint | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Material Editor | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | PBR Channels | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | VRM Pose | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | VRM Expression | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Look At | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | IK/FK | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Hand Pose | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Pose Library | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Retarget | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Multi-character Pose | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Foot Grounding | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Contact Pose | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Ragdoll Draft | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Cloth Preview | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Hair Physics | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Accessory Physics | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Object Drop | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Stack | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Collision Avoidance | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Physics Bake | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | 3D-to-Line | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | 3D-to-Tone | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | 3D-to-Shadow | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | 3D Layer Link | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Partial Re-render | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 3D·VRM·모델링 | Blender Bridge | SceneDocument + 3D Adapter | Three.js, three-vrm, Rapier, BVH, Manifold, glTF Transform | 3D 런타임 객체는 cache; 2D 연결 패스와 bake 결과 저장 |
| 협업·검수·프로젝트 | 실시간 공동 편집 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 오프라인 편집 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Presence | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 협업 커서 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 사용자 색상 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 현재 도구 표시 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 현재 레이어 표시 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 범위 Lock | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 레이어 Lock | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 컷 Lock | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 텍스트 Lock | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 3D Scene Lock | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 낙관적 편집 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Conflict 표시 | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | CRDT Merge | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Comment Pin | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 영역 Comment | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 프레임 Comment | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 3D Comment | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Reply Thread | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Mention | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Emoji Reaction | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Resolve | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Reopen | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Review Request | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Approval | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Reject | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Revision Required | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Task Assignment | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Due Date | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Priority | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Label | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Checklist | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Reference Attachment | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | External Review Link | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Guest Access | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | View-only | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Comment-only | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Editor | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Admin | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Audit Log | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Activity Feed | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Notification | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Email Digest | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Version Snapshot | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Named Version | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Branch | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Merge | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Compare | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Semantic Diff | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Pixel Diff | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Layer Diff | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Text Diff | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | 3D Diff | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Restore | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Fork | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Template | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Team Library | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Shared Brush | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Shared Palette | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Shared Material | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Shared Pose | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Shared Scene | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Asset Approval | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 협업·검수·프로젝트 | Rights Review | CollaborationCore | Yjs, binary object store, WebRTC/WebSocket provider | CRDT는 의미 객체; 래스터·3D asset은 chunk reference |
| 저장·복구·성능 | OPFS Project Store | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Command Journal | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Incremental Checkpoint | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Crash Recovery | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Tab Close Recovery | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Power Loss Recovery | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Asset Chunking | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Raster Tile Chunk | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Content-addressed Storage | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Deduplication | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Compression | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Lazy Load | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Streaming Load | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Background Save | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Save Queue | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Save Status | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Offline Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | PWA Install | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Service Worker | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | IndexedDB Metadata | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Memory Budget | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | GPU Budget | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Tile Eviction | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | LRU Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Mipmap Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Glyph Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Path Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Brush Tip Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Shader Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Pipeline Cache | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Prewarm | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Worker Pool | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | SharedArrayBuffer | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Atomics Ring Buffer | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | OffscreenCanvas | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Dirty Region | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Sparse Tile | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Partial Render | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Scene Sharding | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | LOD | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Dynamic Resolution | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Quality Tier | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Frame Budget | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Input Latency Meter | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | GPU Timer | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | CPU Profiler | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Memory Profiler | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Texture Inspector | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Context Loss Recovery | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Device Capability Test | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Browser Compatibility Test | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Fallback Router | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Telemetry Opt-in | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 저장·복구·성능 | Performance Report | StorageCore + ResourceManager | OPFS, IndexedDB, Workers, WebGPU query | 명령 저널·체크포인트·타일 cache·예산 기반 퇴출 |
| 플러그인·자동화·스크립팅 | Plugin Manifest | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Permission System | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Sandboxed Worker Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | WASM Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Brush Node Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Filter Node Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Importer Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Exporter Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Panel Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Command Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | 3D Tool Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Automation Plugin | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Asset Provider | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Versioned API | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Capability Negotiation | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Plugin Dependency | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Plugin Signature | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Plugin Update | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Plugin Disable | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Crash Isolation | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Resource Limit | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Network Permission | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | File Permission | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | GPU Permission | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | UI Slot | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Context Menu Slot | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Toolbar Slot | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Inspector Slot | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Shortcut Registration | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Document Event | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Selection Event | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Render Hook 제한 | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Headless Batch | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Macro Record | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Macro Playback | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Command Palette | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Scripting Console | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Workflow Template | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Preset Generator | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Batch Rename | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Batch Export | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Batch Resize | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Batch Format Convert | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | CLI Bridge | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Webhook | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | REST API | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | WebSocket API | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Automation Queue | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Job Retry | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Job Log | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| 플러그인·자동화·스크립팅 | Deterministic Seed | Plugin SDK | Worker/WASM sandbox, JSON schema, capability tokens | 직접 DOM/GPU 접근 금지; 버전·권한·자원 제한 |
| AI·지능형 보조 | 배경 제거 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 인물 분할 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 머리카락 분할 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 얼굴 랜드마크 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 손 랜드마크 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 포즈 추정 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 깊이 추정 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Normal 추정 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Line Art 추출 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 사진 만화화 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 자동 채색 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Flat Color Assist | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Shadow Suggest | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Highlight Suggest | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Palette Suggest | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Color Match | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Style Reference Assist | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Upscale | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Denoise | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Deblur | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Artifact Remove | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Inpaint | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Outpaint | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Object Remove | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Text Remove | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Speech Bubble Detect | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Panel Detect | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Character Detect | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Face Restore 제한 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Pose Search | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Asset Search | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Semantic Search | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Auto Tag | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Caption | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | OCR | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 대사 추출 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 번역 보조 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 맞춤법 검사 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 금칙 검사 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 말풍선 순서 추정 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 연속성 오류 탐지 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 캐릭터 색상 오류 탐지 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 소품 누락 탐지 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 손가락 오류 탐지 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 원근 오류 보조 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | 3D Camera Match | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Brush Recommendation | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Preset Search | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Layer Name Suggest | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Export Error Explain | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Performance Auto Tune | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Local Model 실행 | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Cloud Provider Adapter | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Model License Registry | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | Consent·Provenance | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| AI·지능형 보조 | AI 결과 Metadata | AI Adapter Layer | ONNX Runtime Web, Transformers.js, MediaPipe, provider adapters | 모델 라이선스 별도; 비파괴 결과·provenance·사용자 동의 |
| 접근성·UX·입력 | 키보드 단축키 | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | 단축키 사용자화 | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Command Palette | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Radial Menu | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Quick Access | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Touch Bar 유사 패널 | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | 펜 버튼 매핑 | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Eraser Tip | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Barrel Button | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Right Click | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Modifier Key | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Sticky Modifier | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | One-handed Mode | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Left-handed UI | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | 큰 터치 타깃 | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | High Contrast UI | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Color-blind UI | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Screen Reader Labels | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Keyboard Navigation | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Focus Ring | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Reduced Motion | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | UI Scale | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Font Scale | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Panel Dock | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Panel Float | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Panel Collapse | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Workspace Save | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Workspace Sync | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Multi-monitor | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Fullscreen | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Tablet Mode | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Mobile Mode | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Responsive Panels | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Gesture Customization | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Hover Preview | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Cursor Shape | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Brush Outline | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Brush Tilt Preview | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Pressure Meter | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Latency Indicator | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Autosave Indicator | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Undo History Panel | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Search Everywhere | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Context Help | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Interactive Tutorial | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Sample Project | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Onboarding | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Crash-safe Feedback | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Privacy Settings | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Telemetry Control | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | Language Pack | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 접근성·UX·입력 | RTL UI | React UI + InputCore | ARIA, Pointer Events, command system | 캔버스 기능을 키보드·스크린리더용 의미 명령으로 노출 |
| 보안·라이선스·품질 | SBOM | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | License Scanner | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Third-party Notice | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | GPL Boundary Check | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Model License Check | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Asset Rights Metadata | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Font License Metadata | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Brush Pack License | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Texture License | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Export Rights Manifest | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | CSP | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | COOP/COEP | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Cross-origin Isolation | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Plugin Sandbox | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | WASM Integrity | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Subresource Integrity | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Signed Plugin | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Rate Limit | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Quota Limit | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Memory Limit | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Zip Bomb Protection | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Image Bomb Protection | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Malformed PSD Protection | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Malformed SVG Protection | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Shader Timeout | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | GPU Hang Detection | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Worker Watchdog | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Crash Report Redaction | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Local-first Privacy | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Encryption at Rest 선택 | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Encrypted Share | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Access Token Expiry | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Audit Log | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Unit Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Property Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Fuzz Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Visual Regression | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Golden Image | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Cross-backend Diff | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Cross-browser Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Pen Device Matrix | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Performance Benchmark | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Long-session Soak Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Context Loss Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Crash Recovery Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Import/Export Round-trip | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Color DeltaE Test | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | PSD Compatibility Corpus | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | SVG Compatibility Corpus | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Brush Golden Corpus | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Filter Golden Corpus | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | 3D Scene Corpus | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Accessibility Audit | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Security Review | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |
| 보안·라이선스·품질 | Release Gate | Governance + CI | license scanner, fuzzers, Playwright, golden corpus | 상용 배포 gate로 자동화; 코드·모델·asset 라이선스 분리 |


# 14. 희소 타일·레이어·메모리 아키텍처

## 14.1 전체 크기 텍스처를 레이어마다 만들지 않는다

8K RGBA8 한 장은 약 256MiB이고, 작업용 float·중간 필터·mipmap까지 포함하면 훨씬 커진다. 따라서 래스터 레이어는 희소 타일로 저장한다.

```text
RasterLayer
  SparseTileMap
    TileKey(layerId, mip, x, y)
      version
      dirtyBounds
      alphaSummary
      colorSpace
      cpuChunkRef
      gpuResidency
      contentHash
      lastUsedFrame
```

권장 기본 타일은 256×256 또는 512×512이며, 브러시 반경·필터 halo·GPU 특성에 따라 profile별로 선택한다.

## 14.2 다단 캐시

```text
L0  현재 획 transient buffer
L1  화면에 보이는 GPU tiles
L2  최근 사용 GPU/CPU compressed tiles
L3  OPFS chunk store
L4  checkpoint/package
```

- 현재 화면의 mip만 GPU에 유지한다.
- 멀리 있는 타일은 CPU 압축 또는 OPFS에 둔다.
- 필터 결과는 `input hash + node version + params + quality` 키로 캐시한다.
- wet-media 활성 타일은 건조 후 정적 래스터로 베이크한다.
- vector island는 geometry·tessellation·glyph cache를 분리한다.
- engine-specific cache는 context loss 후 재생성할 수 있어야 한다.

## 14.3 dirty-region 렌더

```text
stroke bounds
→ brush halo
→ affected mask/filter bounds
→ dependent island bounds
→ visible viewport intersection
→ dirty tiles only
```

전체 scene invalidation은 다음 경우에만 허용한다.

- 전역 색공간 변경
- 전체 문서 resize
- 전역 histogram·content-aware 연산
- renderer backend 전환
- schema migration 후 cache 재구축

## 14.4 대형 세로 웹툰

세로 수만~수십만 픽셀 문서는 하나의 GPU surface로 만들지 않는다.

```text
Document Coordinate (f64)
→ Scene Shard (예: 세로 4096~8192px 단위)
→ Visible Shards
→ Tile Mip
→ Render Island
```

컷·말풍선·텍스트·3D 연결 객체는 shard 경계를 넘어갈 수 있으므로 의미 객체는 전역 좌표를 유지하고 렌더 cache만 분할한다.

---

# 15. 레이어·마스크·합성 세부 설계

## 15.1 `LayerGraph`

```ts
type LayerNode =
  | RasterLayer
  | VectorLayer
  | TextLayer
  | BalloonLayer
  | AdjustmentLayer
  | GroupLayer
  | MaskLayer
  | FilterMaskLayer
  | LinkedObjectLayer
  | Scene3DLayer
  | AnimationLayer
  | GuideLayer;
```

LayerGraph는 트리처럼 보이지만 다음 연결 때문에 내부적으로 DAG가 될 수 있다.

- 스마트 객체 인스턴스
- 여러 레이어가 공유하는 마스크
- 참조 레이어
- 3D scene pass 공유
- 조정 레이어 입력 범위
- linked asset
- 플랫폼·현지화 variant

순환 참조는 저장 시 validation으로 차단한다.

## 15.2 마스크 경로

| 마스크 종류 | 주 경로 |
|---|---|
| 단순 벡터 clip | Vello 또는 CanvasKit |
| Skia mask/filter가 결합 | CanvasKit |
| 큰 래스터 mask | WebGPU R8/R16 texture |
| 선택 영역 | SelectionIR + WebGPU/OpenCV |
| SVG mask | resvg/ThorVG 파싱 후 IR |
| 3D Object ID mask | Three.js pass → FrameGraph |
| filter mask | EffectGraph input |
| 복합 mask Boolean | Clipper2/PathKit 또는 WebGPU |

## 15.3 블렌드 모드

내부 블렌드 의미를 자체 enum으로 정의하고 Vello·CanvasKit·WGSL·PSD에 각각 매핑한다. 백엔드마다 수학·색공간이 다를 수 있으므로 golden corpus로 검증한다.

```text
BlendIR
  Porter-Duff
  Artistic Blend
  HSL Component Blend
  Arithmetic Blend
  Custom Blender
```

HSL 계열 혼합은 어떤 색공간에서 계산하는지 문서 정책을 명시한다. PSD 왕복은 Photoshop 호환 모드를 별도 제공한다.

---

# 16. 선택·채우기·채색 보조 세부 설계

## 16.1 SelectionCore

선택은 단일 alpha bitmap이 아니라 다음을 함께 가질 수 있다.

```ts
interface SelectionIR {
  vectorContours?: VectorContourSet;
  rasterMask?: TileMask;
  semanticRefs?: SemanticObjectRef[];
  feather: FeatherSpec;
  transform: Matrix3;
}
```

벡터 선택은 확대·변형 품질을 유지하고, 래스터 선택은 복잡한 머리카락·반투명 경계를 표현한다.

## 16.2 스마트 채우기

```text
참조 레이어 수집
→ 선화 raster proxy
→ gap close
→ distance field
→ GPU flood fill
→ anti-aliased boundary reconstruction
→ underfill expansion
→ SelectionIR 또는 fill patch
```

지원 옵션:

- 선택한 레이어·참조 폴더·표시 레이어
- 선의 투명도 임계값
- gap close 거리와 방향
- 채우기 확장·수축
- 여러 폐영역 연속 채우기
- 둘러싸고 칠하기
- 남은 틈 표시
- 색상 세트·캐릭터 팔레트 기반 채색
- 3D Object ID·Material ID 기반 채우기
- 채색 결과를 벡터 영역으로 보존

## 16.3 OpenCV.js 사용 경계

OpenCV.js는 다음 분석에 사용한다.

- morphology
- connected components
- contour
- distance transform
- watershed
- GrabCut
- inpainting
- perspective correction
- line/edge extraction

`cv.Mat`를 UI state나 문서에 저장하지 않고 Worker 내부에서 즉시 해제한다. 대형 mask는 타일 overlap을 두거나 GPU morphology로 처리한다.

---

# 17. 텍스트·말풍선·CJK 조판

## 17.1 입력과 렌더 분리

```text
DOM textarea/contenteditable
→ IME composition
→ TextIR
→ shaping/layout
→ CanvasKit Paragraph 또는 glyph outline
→ Vello/CanvasKit/ThorVG render island
```

Canvas 안에서 직접 IME를 구현하지 않는다. 접근성·복사·붙여넣기·한글 조합은 DOM overlay를 사용한다.

## 17.2 엔진 배치

- shaping: HarfBuzz 계열 또는 Parley
- font discovery/fallback: Fontique·fontkit·opentype.js
- Skia 문단과 호환 출력: CanvasKit Paragraph
- 대량 동적 벡터 glyph: Vello glyph cache/outline
- SVG/Lottie asset text: ThorVG
- PDF/SVG/PSD export: 전용 exporter와 font subset
- 세로쓰기·루비·금칙: ToonStudio 자체 layout policy

## 17.3 말풍선 의미 모델

```ts
interface BalloonNode {
  shape: BalloonShapeIR;
  tails: BalloonTailIR[];
  speakerId?: string;
  dialogueId: string;
  languageVariants: Record<string, TextIR>;
  readingOrder: number;
  autoLayout: BalloonAutoLayout;
}
```

말풍선은 단순 도형이 아니라 화자·대사·번역·읽기 순서와 연결한다. 이를 통해 자동 식자, 번역 교체, 충돌 회피, 대사 검색, 검수 차이를 지원한다.

---

# 18. 파일·코덱·호환 아키텍처

## 18.1 `CodecRegistry`

```ts
interface CodecAdapter {
  id: string;
  probe(input: ByteSource): Promise<ProbeResult>;
  import(input: ByteSource, options: ImportOptions): Promise<ImportResult>;
  export(doc: StudioDocument, options: ExportOptions): Promise<ExportResult>;
  capabilityReport(): CodecCapabilities;
}
```

모든 import/export는 다음 보고서를 반환한다.

```text
보존됨
근사 변환됨
래스터화됨
누락됨
지원하지 않음
폰트 누락
색공간 변경
블렌드 차이
스마트 객체 처리
시각 diff 예상
```

## 18.2 PSD·PSB

권장 이중 구조:

```text
@webtoon/psd
→ 빠른 읽기·분석·썸네일

ag-psd
→ 읽기·쓰기·구조 왕복

ToonStudio PSD Mapping
→ LayerGraph/TextIR/EffectGraph와 PSD 의미 매핑

CanvasKit/resvg reference render
→ 시각 비교
```

조정 레이어·스마트 객체·텍스트·벡터 마스크·특수 블렌드는 지원 범위를 명시하고, 보존할 수 없으면 원본 blob과 fallback render를 함께 유지한다.

## 18.3 SVG

```text
usvg/resvg
→ 정규화·기준 렌더

ThorVG
→ 빠른 SVG asset/preview

Vello/CanvasKit
→ 편집 가능한 내부 path와 최종 scene

SVG Compatibility Report
→ unsupported filter/text/font/external resource
```

## 18.4 대형 이미지와 포맷 변환

wasm-vips는 다음 Worker 작업에 적합하다.

- 대형 리사이즈
- pyramidal image
- tiled output
- batch conversion
- thumbnail/contact sheet
- format transcode
- metadata handling

브라우저 codec과 WebCodecs가 더 효율적인 포맷은 native API를 먼저 사용한다.

## 18.5 프로젝트 포맷

```text
project.toonpkg
  manifest.json
  document.cbor
  commands/
  checkpoints/
  tiles/
  vectors/
  text/
  scenes3d/
  animations/
  assets/
  previews/
  rights/
  compatibility/
```

CBOR 또는 FlatBuffers/MessagePack 계열 바이너리를 검토하되, schema migration과 unknown-field preservation이 필수다.

---

# 19. 색상·안료·출력 관리

## 19.1 네 가지 색상 문제를 분리

1. UI picker와 팔레트
2. 문서 working color space
3. 브러시 내부 안료 혼색
4. 화면·출력 color transform

RGB 선형 보간을 실제 안료 혼합으로 사용하지 않는다.

## 19.2 권장 조합

- Color.js·Culori: 색공간 변환·보간·색차·gamut 유틸리티
- Spectral.js 또는 자체 spectral model: 팔레트·안료 혼색
- Hokusai spectral mixing: 자연매체 획 내부
- LittleCMS WASM 또는 서버 bridge: ICC·CMYK·soft proof
- CanvasKit/Skia color space: Skia island과 출력
- WebGPU color pipeline: 최종 합성·HDR·Display P3

## 19.3 내부 정책

- 기본 working space는 linear sRGB 또는 사용자 선택 wide-gamut를 검토
- UI 색상은 perceptual space(OKLCH 등) 지원
- 모든 GPU texture에 color contract
- premultiplied alpha 일관성
- export 시 ICC embed·convert 선택
- CMYK는 단순 수식 preview와 실제 ICC 변환을 구분
- blend mode는 호환 모드와 물리적 linear 모드를 구분
- visual regression은 DeltaE와 pixel diff를 함께 사용

---

# 20. 3D·VRM·모델링·2D 합성

## 20.1 엔진 조합

```text
Three.js
+ three-vrm
+ Rapier
+ three-mesh-bvh
+ Manifold WASM
+ glTF Transform
+ Meshoptimizer
+ KTX2/Basis
+ Draco
+ xatlas/UV bridge
```

## 20.2 SceneDocument

Three.js `Object3D`가 아니라 자체 scene schema를 저장한다.

```text
SceneDocument
  Nodes
  MeshAssets
  Materials
  Cameras
  Lights
  Constraints
  Poses
  PhysicsSettings
  RenderPassSettings
  2DLinkBindings
```

## 20.3 2D 연결

3D scene은 다음 독립 pass를 만든다.

- color
- line
- depth
- normal
- object ID
- material ID
- shadow
- AO
- UV
- world position
- motion vector

FrameGraph는 이 pass를 Vello/CanvasKit/WebGPU 필터와 결합한다.

예시:

```text
3D depth
→ depth-aware line weight
→ Vello vector line

3D object ID
→ color flat selection
→ WebGPU fill mask

3D normal
→ CanvasKit/SkSL hatching
→ comic shading

3D shadow
→ adjustment layer
→ artist-editable mask
```

## 20.4 물리

- Rapier: 장면 강체·충돌·관절·자동 배치
- 자체 XPBD: 브러시모·리본·헤어·천의 경량 제작 도구
- Jolt 선택 모듈: 고급 soft body·cloth
- physics 결과는 preview 후 transform/keyframe/vector/tile로 bake
- 협업은 전체 simulation frame이 아니라 command·seed·bake 결과를 공유

---

# 21. 애니메이션·타임랩스·영상

## 21.1 렌더 구조

```text
TimelineIR
→ frame dependency analysis
→ unchanged island reuse
→ changed cells only render
→ GPU/CPU frame cache
→ WebCodecs encode
```

## 21.2 역할

- Vello: 벡터 셀·선화·도형·텍스트
- CanvasKit/Skottie: Lottie·Skia effects·호환 렌더
- ThorVG: 다수 경량 Lottie
- WebGPU: particles·wet media·temporal effects
- Three.js: camera·3D animation
- WebCodecs: 브라우저 인코딩·디코딩
- ffmpeg.wasm: 미지원 codec·복잡 mux fallback
- wasm-vips: image sequence·sprite sheet·thumbnail

## 21.3 타임랩스

전체 화면 비디오를 계속 저장하지 않고 명령 로그와 주기적 checkpoint를 사용한다.

```text
Command Log
+ StrokeIR
+ layer visibility events
+ camera events
+ checkpoints
→ 타임랩스 재생
→ 필요한 프레임만 렌더
```

민감한 레이어·참조 이미지를 타임랩스에서 제외할 수 있어야 한다.

---

# 22. Undo·저장·복구·협업

## 22.1 Undo

```text
Vector/Text/Object
→ inverse command 또는 immutable snapshot

Raster
→ dirty tile before/after diff

Wet/Physics
→ input command + seed + bake patch

Global transform
→ structural command

Checkpoint
→ 주기적 document state + tile manifest
```

전체 캔버스를 매 명령마다 복사하지 않는다.

## 22.2 OPFS

```text
OPFS
  journal/
  checkpoints/
  tiles/
  assets/
  previews/
  temp/
  recovery/
```

- autosave는 command journal append를 우선
- checkpoint는 idle·명령 수·데이터 크기 기준
- content hash로 asset/tile 중복 제거
- quota 부족을 미리 감지
- 임시 렌더 cache와 영구 데이터 분리
- 저장 중 탭 종료·크래시 recovery test

## 22.3 협업

Yjs/CRDT에 넣을 것:

- 레이어 메타데이터
- 벡터 객체
- 텍스트·말풍선
- 컷·읽기 순서
- 3D transform·pose·camera
- comments·tasks·review state
- preset references

binary object store에 넣을 것:

- raster tile chunks
- PSD·이미지
- GLB·VRM
- brush texture
- baked physics/wet result
- audio/video

전송하지 않을 것:

- 모든 물리 particle frame
- 모든 wet-media 내부 field
- 매 프레임 GPU texture
- 엔진-specific cache

---

# 23. 플러그인·브러시 생태계

## 23.1 플러그인 종류

- BrushNode
- BrushBackend
- EffectNode
- VectorTool
- SelectionTool
- Importer
- Exporter
- Panel
- Command
- Automation
- 3D tool
- Asset provider
- AI provider

## 23.2 안전 경계

플러그인은 기본적으로 Worker 또는 WASM sandbox에서 실행한다.

```text
Capability Token
  document.read
  document.write.commands
  selection.read
  asset.read
  asset.write
  network.domain-list
  gpu.compute-limited
  ui.panel
```

직접 DOM·원시 파일 시스템·공유 GPU device 접근은 제한한다. shader는 시간·메모리·workgroup 제한과 validation을 거친다.

## 23.3 프리셋 포맷

Brush preset은 단순 JSON 파라미터가 아니라 버전이 있는 graph package다.

```text
preset.json
graph.cbor
tips/
papers/
patterns/
preview.webp
license.json
author.json
compatibility.json
signature.json
```

프리셋에는 코드·텍스처·폰트·모델의 라이선스를 따로 기록한다.

---

# 24. AI 보조의 위치

AI는 기본 렌더 코어가 아니라 선택형 adapter다.

```text
ONNX Runtime Web
Transformers.js
MediaPipe
WebGPU model backend
Cloud provider adapter
```

원칙:

- 모델 라이선스는 엔진 라이선스와 별도 검토
- 결과를 조정 레이어·마스크·새 레이어로 비파괴 저장
- 원본·모델·파라미터·seed·provenance 기록
- 사용자가 클라우드 업로드 여부를 명확히 선택
- 로컬 모델 fallback
- 자동 생성 기능과 분석·보조 기능을 구분
- 출고 패키지에 AI metadata 포함 옵션

---

# 25. 성능 설계

## 25.1 목표 지표

권장 목표값이며 실제 대상 장치별 측정으로 조정한다.

| 지표 | 목표 |
|---|---|
| 포인터 입력→첫 미리보기 | 8~16ms 범위 지향 |
| 일반 획 표시 | 60Hz 이상 |
| 고주사율 펜 | 120Hz preview 가능 경로 |
| 일반 팬·줌 | 60fps |
| 대형 문서 팬·줌 | visible shard만 렌더 |
| Undo | 대부분 100ms 이내 체감 |
| autosave | 입력 blocking 없음 |
| context loss | 문서 손실 없이 복구 |
| 장시간 작업 | 메모리 증가가 안정화 |
| 필터 preview | 저해상도 즉시 + full commit |
| 협업 presence | 문서 데이터와 분리된 저지연 채널 |

## 25.2 Worker 토폴로지

```text
main
  React UI / commands / accessibility

input-worker
  samples / calibration / prediction

brush-worker
  Rust/WASM dynamics / vector geometry / XPBD

render-worker
  Vello / CanvasKit / WebGPU frame graph

effect-worker
  CPU/WASM filters / OpenCV

codec-worker
  PSD / SVG / image / compression

scene-worker
  3D scene / physics / BVH

storage-worker
  OPFS / checkpoint / compression

thumbnail-worker
  CPU reference render
```

브라우저 제약에 따라 일부 Worker를 합치되 인터페이스는 유지한다.

## 25.3 초기 로딩

- UI shell 먼저
- 기본 vector/raster 엔진만 preload
- CanvasKit effects/text는 기능 접근 시 preload 또는 idle preload
- Hokusai는 자연매체 선택 시
- ThorVG는 SVG/Lottie asset 접근 시
- OpenCV는 분석 도구 접근 시
- 3D·Rapier는 3D workspace 접근 시
- Jolt·ffmpeg·AI 모델은 완전 동적 로드
- shader·pipeline은 대표 preset을 idle에서 prewarm

## 25.4 JS↔WASM 비용

- point 하나씩 호출하지 않고 typed-array batch
- PathBuilder·scene recording·drawAtlas 활용
- shared ring buffer
- Worker message는 transferable
- API 호출 수와 데이터 양을 profiler에서 표시
- CanvasKit 객체 생성·delete 수를 계측
- Vello scene compile 시간을 island별로 기록

---

# 26. 품질·회귀·완료 기준

## 26.1 브러시 golden corpus

각 brush preset에 다음 입력을 자동 재생한다.

- 직선·곡선·나선
- 느림·보통·빠름
- 압력 ramp up/down
- tilt·twist sweep
- 짧은 tap
- 급격한 corner
- self-intersection
- 다양한 확대율
- 타일 경계
- 마스크·클립 경계
- 색상·안료 혼합

비교 항목:

- 선폭 오차
- 지연
- overshoot
- endpoint
- aliasing
- texture 반복
- tile seam
- seed 재현성
- CPU/GPU 차이

## 26.2 필터 golden corpus

- 작은 객체와 8K 레이어
- 투명 경계
- wide-gamut
- premultiplied alpha
- 매우 큰 blur radius
- filter chain 순서
- edge tile
- masks
- CanvasKit/WebGPU/CPU 결과 차이
- PSD/SVG round-trip

## 26.3 장기 안정성

- 8시간 soak test
- 반복 Undo/Redo 수만 회
- context loss
- Worker crash
- OPFS quota 부족
- 탭 복구
- 수천 레이어
- 수백 reference image
- 30,000px 이상 세로 문서
- 4K·8K export
- 브라우저 업그레이드 후 migration

---

# 27. 라이선스·상용 배포 등급

| 등급 | 조건 | 사용 정책 |
|---|---|---|
| A | MIT·Apache-2.0·BSD·ISC·Zlib | 직접 의존·수정·vendoring 가능, 고지 유지 |
| B | LGPL·MPL·복합 구성 | Worker/동적 모듈·고지·링킹 방식 검토 |
| C | GPL·AGPL | 코어 직접 편입 금지, 구조·UX·알고리즘 연구 참고 |
| D | LICENSE 없음 | 동작 사양만 분석하고 clean-room 재구현 |
| R | source-available·상업 라이선스 | 별도 계약 전 제품 코어 금지 |
| E | 논문·특허·비상업 샘플 | 연구·비교·벤치마크만 |

## 27.1 반드시 분리할 라이선스

- 엔진 코드
- shader 코드
- brush preset
- brush tip·paper texture
- font
- 3D model
- AI model
- dataset
- Lottie/SVG asset
- 사용자 업로드 asset

## 27.2 무라이선스 공개 코드

InkWash와 같은 공개 소스는 페이지에서 동작과 구조를 관찰할 수 있어도 라이선스가 없으면 직접 복사하지 않는다.

```text
기능 관찰
→ 독립 사양 문서
→ 테스트 입력·출력 정의
→ 다른 담당자가 새 구현
→ 코드 유사성 검토
```

---

# 28. 단계별 구현 로드맵

## R0 — 감사·계측·계약

- 현재 ToonStudio 코드·기능 inventory
- StudioDocument 초안
- CommandBus·schema migration
- 입력 지연·GPU·메모리 benchmark
- 브러시·필터 golden corpus
- 라이선스 SBOM
- RendererCapabilities
- CanvasKit/Vello/ThorVG/WebGPU PoC 비교
- 브라우저·태블릿 device matrix

## R1 — 전문 드로잉 기반

- Pointer Events 입력
- device calibration
- StrokeIR
- stabilizer graph
- Vello VectorInk
- CanvasKit core/effects adapter
- WebGPU RasterDab
- sparse tiles
- LayerGraph
- Undo·OPFS journal
- WebGL2/CPU fallback

## R2 — 편집·레이어·필터

- vector path edit
- selection/fill
- masks·clipping
- adjustment layers
- EffectGraph
- CanvasKit ImageFilter/SkSL
- OpenCV Worker
- text/balloon
- PSD 1차
- SVG/resvg/ThorVG
- color pipeline 기초

## R3 — 자연매체·브러시 차별화

- Hokusai/libmypaint
- MyPaint preset import
- paper/tip pipeline
- spectral mixing
- GPU smudge
- wet-media active tiles
- XPBD bristles
- particle/procedural brushes
- BrushGraph editor
- 100개 이상 품질 preset

## R4 — 웹툰 제작 운영체제

- 컷·대사·읽기 순서 의미 객체
- 페이지/에피소드/시리즈 관리
- 톤·모아레·선화 도구
- 현지화·검열 variant
- timeline/animation
- WebCodecs export
- collaboration/review
- branch/version
- publish preflight

## R5 — 2D·3D·생태계

- SceneDocument
- VRM pose·expression
- Rapier physics
- Manifold modeling
- 3D pass→2D link
- surface paint
- plugin SDK
- asset marketplace-ready metadata
- headless batch
- optional AI adapters
- CMYK/ICC 고도화

## R6 — 품질 마감

- 장치별 필기감 tuning
- cross-backend visual parity
- PSD/PSB corpus
- 8K·장시간 안정성
- memory/autosave recovery
- 접근성
- 보안·fuzz
- preset curation
- 문서·튜토리얼·샘플 프로젝트

---

# 29. 기능 우선순위 판단 기준

```text
점수 =
  사용자 체감 가치
+ 경쟁 제품 격차
+ 웹 고유 차별화
+ 재사용 가능성
+ 라이선스 안전성
- 구현 난이도
- 메모리·성능 위험
- 호환성 위험
- 유지보수 비용
```

우선순위 예:

### P0

- 입력 지연
- 필압·기울기
- 벡터 잉킹
- GPU 래스터
- sparse tile
- Undo·autosave
- 레이어·마스크
- 기본 필터
- selection/fill
- PSD/PNG/SVG
- text/balloon

### P1

- 자연매체
- 스머지·혼색
- 톤·웹툰 필터
- CanvasKit 고급 효과
- 협업·리뷰
- animation
- 3D reference

### P2

- wet-media full solver
- physics bristles
- advanced modeling
- CMYK 완전 고도화
- AI 생태계
- 고급 cloth/soft body
- 복잡한 PSB round-trip

---

# 30. 최종 패키지 선택

## 30.1 기본 번들

```text
React / TypeScript
Pointer Events
StudioDocument / CommandBus
Vello adapter 최소
Custom WebGPU Raster 최소
CanvasKit core 최소
OPFS
Yjs core
PNG/WebP/SVG 기본 codec
```

## 30.2 동적 번들

```text
CanvasKit effects/text/animation
Hokusai/libmypaint
OpenCV.js
wasm-vips
ThorVG
Three.js/Rapier
Jolt
ffmpeg.wasm
AI models
```

## 30.3 직접 채택하지 않고 참고할 것

- Krita core 전체
- ChickenPaint 전체
- GPL 완성형 앱 내부 코드
- 라이선스 없는 demo shader
- 현재 상용 라이선스가 필요한 canvas SDK
- 엔진 식별·라이선스가 불명확한 저장소
- 오래된 프로젝트를 유지보수 없이 production dependency로 고정

---

# 31. 최종 기술 확정안

```text
[UI]
React 19 + TypeScript
React Flow(Brush/Effect Graph UI)

[문서]
StudioDocument + CommandBus + DependencyGraph
CBOR/typed binary + schema migration

[입력]
Pointer Events Level 3
Rust/WASM calibration + stabilizer

[벡터]
Vello Classic/Hybrid/CPU
CanvasKit Path/PathEffect
Kurbo + Paper.js + PathKit + Clipper2

[래스터]
Custom WebGPU sparse tiles
PixiJS WebGL2 compatibility

[자연매체]
Hokusai + libmypaint
WebGPU wet media
Rust/WASM XPBD bristles
Spectral mixing

[필터]
CanvasKit ImageFilter/SkSL
Custom WebGPU EffectGraph
OpenCV.js + Photon + wasm-vips

[SVG/Lottie]
ThorVG + resvg/usvg
CanvasKit Skottie
Vello scene import

[텍스트]
DOM IME + HarfBuzz/Parley
CanvasKit Paragraph + Vello glyph path

[3D]
Three.js + three-vrm
Rapier + BVH + Manifold
glTF Transform + meshopt/KTX2

[저장·협업]
OPFS + IndexedDB metadata
Yjs + binary object store

[출력]
WebCodecs + ffmpeg.wasm fallback
CanvasKit/resvg CPU reference
PSD dual adapters
```

> 최종 제품은 Vello 앱도, CanvasKit 앱도, PixiJS 앱도 아니다. **ToonStudio 자체 문서·브러시·효과·웹툰 의미 모델을 중심으로 여러 엔진을 컴파일 타깃으로 사용하는 창작 운영체제**다.


# 32. 오픈소스·공개 코드 엔진 레지스트리

## 32.1 사용 원칙

이 레지스트리는 “모두 초기 번들에 넣는다”는 목록이 아니다. 각 프로젝트의 고유 강점을 비교하고, 공통 IR 뒤의 adapter 또는 참고 구현으로 배치하기 위한 후보군이다.

- A: 직접 채택 우선
- A/B: PoC와 유지보수 검증 후 채택
- B: 격리·동적 로드·라이선스/배포 검토
- C: copyleft 코드 직접 편입 없이 구조 참고
- D: 라이선스 없음 또는 불명확, clean-room만
- R: 상업 계약 필요 가능성
- E: 비교·연구 전용

## 32.2 128개 엔진·라이브러리·코드 프로젝트

| 분야 | 프로젝트 | 라이선스 | 스택 | 고유 강점 | ToonStudio 역할 | 등급 | 공식·저장소 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2D GPU | pixi-viewport | MIT | TS/PixiJS | drag·pinch·zoom·deceleration·snap | 캔버스 camera UX 참고 | B | https://github.com/pixijs-userland/pixi-viewport |
| 2D GPU | PixiJS | MIT | TS/WebGL/WebGPU | 고성능 sprite·texture·filter ecosystem | 과도기 합성·plugin fallback | A/B | https://github.com/pixijs/pixijs |
| 2D 객체 | Fabric.js | MIT | TS/Canvas | object selection·transform·serialization | 오브젝트 편집 참고 | B | https://github.com/fabricjs/fabric.js |
| 2D 객체 | Konva | MIT | TS/Canvas | scene graph·transformer·events | selection·snap·guide 참고 | B | https://github.com/konvajs/konva |
| 2D 기하 | Two.js | MIT | JS/SVG/Canvas/WebGL | renderer-agnostic vector API | 간단 vector plugin 참고 | B | https://github.com/jonobr1/two.js |
| 3D | @pixiv/three-vrm | MIT | TypeScript | VRM load·pose·expression | VRM 캐릭터 reference | A | https://github.com/pixiv/three-vrm |
| 3D | Basis Universal/KTX2 | Apache-2.0 | C++ / WASM | GPU texture transcoding | 3D·brush texture compression | A | https://github.com/BinomialLLC/basis_universal |
| 3D | glTF Transform | MIT | TypeScript | glTF read/write/optimize | 3D codec·optimization | A | https://github.com/donmccurdy/glTF-Transform |
| 3D | Manifold | Apache-2.0 | C++ / WASM | robust manifold mesh Boolean | 웹 모델링 Boolean | A | https://github.com/elalish/manifold |
| 3D | meshoptimizer | MIT | C++ / WASM | mesh compression·optimization | 3D asset optimization | A | https://github.com/zeux/meshoptimizer |
| 3D | three-mesh-bvh | MIT | TypeScript | fast raycast·spatial query | surface paint·snap·collision query | A | https://github.com/gkjohnson/three-mesh-bvh |
| 3D | Three.js | MIT | TypeScript / WebGL / WebGPU | 웹 3D scene ecosystem | 3D viewport·NPR·surface paint | A | https://github.com/mrdoob/three.js |
| AI | MediaPipe | Apache-2.0 | C++ / WASM / WebGPU | pose·hand·face·segmentation tasks | 포즈·랜드마크·선택 보조 | A/모델 별도 | https://github.com/google-ai-edge/mediapipe |
| AI | ONNX Runtime Web | MIT | C++ / WASM / WebGPU | 브라우저 model inference | 선택형 로컬 AI adapter | A/모델 별도 | https://github.com/microsoft/onnxruntime |
| AI | Transformers.js | Apache-2.0 | JavaScript / ONNX | 브라우저 transformer pipeline | 선택형 semantic/OCR adapter | A/모델 별도 | https://github.com/huggingface/transformers.js |
| GPU | gpu-io | MIT | JS/WebGL | GPGPU workflows·physics·particles·image processing | WebGL compute fallback 참고 | B | https://github.com/amandaghassaei/gpu-io |
| GPU | regl | MIT | JS/WebGL | functional WebGL resource/command abstraction | WebGL 실험·fallback | B | https://github.com/regl-project/regl |
| GPU | wgpu | MIT OR Apache-2.0 | Rust/WebGPU | native+web GPU abstraction | Vello·compute 기반 | A | https://github.com/gfx-rs/wgpu |
| PSD | @webtoon/psd | MIT | TypeScript + WASM image decode | 웹·Node용 빠른 PSD/PSB parse | PSD fast import/analysis | A | https://github.com/webtoon/psd |
| PSD | ag-psd | MIT | TypeScript | PSD read/write | PSD round-trip adapter | A | https://github.com/Agamnentzar/ag-psd |
| SVG | resvg | MIT OR Apache-2.0 | Rust/WASM | 정적 SVG의 결정적 렌더와 usvg 정규화 | SVG 기준선·headless 출력 | A/B | https://github.com/linebender/resvg |
| SVG | resvg-js | MPL-2.0 | Rust / Node / WASM | Node/WASM SVG raster binding | codec worker·CI | B | https://github.com/thx/resvg-js |
| 그래프 UI | BaklavaJS | MIT | TS/Vue | typed ports·plugin graph editor | 타입 포트 설계 참고 | B | https://github.com/newcat/baklavajs |
| 그래프 UI | LiteGraph.js | MIT | JS/Canvas | 실행 가능한 node graph와 editor | 경량 graph 포맷 참고 | B | https://github.com/jagenjo/litegraph.js |
| 그래프 UI | React Flow / xyflow | MIT | React/TS | React node-based UI | BrushGraph editor 주력 | A | https://github.com/xyflow/xyflow |
| 그래프 UI | Rete.js | MIT | TS | dataflow/control-flow visual programming | compiler·plugin 구조 참고 | A/B | https://github.com/retejs/rete |
| 기하 | Bezier.js | MIT | JS | Bezier 길이·projection·split·offset | 곡선 분석·편집 | A | https://github.com/Pomax/bezierjs |
| 기하 | Clipper2 | BSL-1.0 | C++/C#/Delphi | robust clipping·offsetting | outline cleanup·offset | B | https://github.com/AngusJohnson/Clipper2 |
| 기하 | earcut | ISC | JS | 빠른 polygon triangulation | WebGL/Vello 보조 tessellation | A | https://github.com/mapbox/earcut |
| 기하 | fit-curve | MIT | JS | polyline→cubic Bézier fitting | 사후 편집 중심선 | A | https://github.com/soswow/fit-curve |
| 기하 | flatten-js | MIT | JS | 2D geometry·intersection·Boolean | trim·지우개·스냅 | A | https://github.com/alexbol99/flatten-js |
| 기하 | freedraw | MIT | Rust | Perfect Freehand의 Rust 포트 | WASM 중심 outline 후보 | A | https://github.com/ducflair/freedraw |
| 기하 | Kurbo | MIT OR Apache-2.0 | Rust | Bézier/path/affine/stroke geometry | Vello 앞 기하 코어 | A | https://github.com/linebender/kurbo |
| 기하 | Lyon | MIT OR Apache-2.0 OR MPL-2.0 | Rust | GPU path tessellation | 대체 tessellator·검증 | B | https://github.com/nical/lyon |
| 기하 | Paper.js | MIT | JS/Canvas | path Boolean·hit test·smooth·simplify | 편집·Boolean 어댑터 | A | https://github.com/paperjs/paper.js |
| 기하 | Perfect Freehand | MIT | TS/JS | pressure-aware stroke outline | 벡터 잉크 외곽선 | A | https://github.com/steveruizok/perfect-freehand |
| 기하 | polygon-clipping | MIT | JS | Martinez polygon Boolean | 브라우저 Boolean fallback | B | https://github.com/mfogel/polygon-clipping |
| 기하 | simplify-js | BSD-2-Clause | JS | 고속 polyline simplification | 포인트 수 축소 | A | https://github.com/mourner/simplify-js |
| 기하 | smooth-fit-curve | MIT | TS | fit-curve 현대 TS fork | 타입 안전 fitting 대안 | B | https://github.com/Bunny-Editor/smooth-fit-curve |
| 렌더 | Blend2D | Zlib | C++ | JIT CPU vector rasterization | native/server 비교 backend | B | https://github.com/blend2d/blend2d |
| 렌더 | CanvasKit | BSD-3-Clause + Skia third-party notices | C++/WASM/WebGPU/WebGL/CPU | Skia canvas/path/text/effects와 software fallback | Skia 고급 효과·조판·호환 출력 주력 | A/주력 | https://skia.org/docs/user/modules/canvaskit/ |
| 렌더 | femtovg | MIT | Rust/OpenGL | GPU anti-aliased vector drawing | WebGL/native 대안 연구 | B | https://github.com/femtovg/femtovg |
| 렌더 | Peniko | MIT OR Apache-2.0 | Rust | brush·gradient·image·blend primitives | Vello paint model | A | https://github.com/linebender/peniko |
| 렌더 | regl-gpu-lines | MIT | JS/WebGL | GPU instanced screen-space lines | WebGL 선 fallback 연구 | B | https://github.com/rreusser/regl-gpu-lines |
| 렌더 | regl-line2d | MIT | JS/WebGL | join·dash·float64 GPU line | WebGL 절차선 참고 | B | https://github.com/gl-vis/regl-line2d |
| 렌더 | tiny-skia | BSD-3-Clause | Rust/CPU | 작고 결정적인 Skia subset rasterizer | CPU fallback·회귀 기준 | A/폴백 | https://github.com/linebender/tiny-skia |
| 렌더 | Vello | MIT OR Apache-2.0 | Rust/wgpu | GPU compute 중심 2D vector renderer | 주력 vector scene | A | https://github.com/linebender/vello |
| 렌더 | Vello CPU | MIT OR Apache-2.0 | Rust/WASM | CPU/SIMD renderer | export·fallback·golden test | A | https://github.com/linebender/vello |
| 렌더 | Vello Hybrid | MIT OR Apache-2.0 | Rust/wgpu/WebGL | CPU path + GPU raster/composition | 브라우저 기본 후보 | A | https://github.com/linebender/vello |
| 렌더 | webgpu-instanced-lines | MIT | TS/WebGPU | WebGPU instanced lines | 특수 대량 선 backend 참고 | B | https://github.com/rreusser/webgpu-instanced-lines |
| 렌더링 | Canvas2D | Web Platform | Browser API | universal emergency fallback | 복구·접근성 preview | A/폴백 | https://html.spec.whatwg.org/multipage/canvas.html |
| 렌더링 | Skia | BSD-3-Clause | C++ | 성숙한 2D graphics·text·filters·color | CanvasKit 기준 엔진 | A | https://github.com/google/skia |
| 멀티엔진 렌더 | ThorVG | MIT | C++ / WASM / WebGPU / WebGL / CPU | 경량 retained vector, SVG, Lottie, text, effects | 경량 SVG/Lottie render island | A | https://github.com/thorvg/thorvg |
| 멀티엔진 렌더 | thorvg.web | MIT | TypeScript / WASM | WebCanvas와 Lottie web presets | 브라우저 ThorVG adapter | A | https://github.com/thorvg/thorvg.web |
| 물리 | Floaty | MIT | Rust/WASM | PBD/PBF·soft body/fluid coupling·rayon | 브러시모·입자 solver 참고 | B | https://github.com/matsuoka-601/Floaty |
| 물리 | JoltPhysics.js | MIT | C++/WASM | soft body·cloth·bend·pressure·multithread builds | 선택형 고급 천·soft body | B | https://github.com/jrouwe/JoltPhysics.js |
| 물리 | Matter.js | MIT | JS | 2D rigid body web engine | 단순 object/particle prototype | B | https://github.com/liabru/matter-js |
| 물리 | Rapier | Apache-2.0 | Rust/WASM | 고성능 2D/3D rigid body·collision·joints | 장면·오브젝트 물리 | A | https://github.com/dimforge/rapier |
| 물리 | verlet-js | MIT | JS | Verlet constraints·rope·cloth | 초기 브러시모 prototype | B | https://github.com/subprotocol/verlet-js |
| 물리 | Verly.js | MIT | JS | Verlet engine·cloth·rope·tearing | 리본·헤어 UX prototype | B | https://github.com/anuraghazra/Verly.js |
| 벡터 기하 | PathKit | BSD-3-Clause | Skia C++ / WASM | Skia PathOps 추출 | Boolean·simplify·path ops | A | https://github.com/google/skia/tree/main/modules/pathkit |
| 벡터화 | VTracer | MIT | Rust/WASM | raster→vector tracing | 스캔 tip·라인 벡터화 | B | https://github.com/visioncortex/vtracer |
| 보정 | Atrament | MIT | JS/Canvas | adaptive smoothing·pressure·draw/fill/erase | bitmap brush 참고·경량 fallback | A | https://github.com/jakubfiala/atrament |
| 보정 | lazy-brush | MIT | JS | lazy radius와 friction | 긴 선·보정 모드 | A | https://github.com/dulnan/lazy-brush |
| 보정 | Signature Pad | MIT | TS/JS | velocity 기반 variable-width Bézier | 압력 없는 입력 fallback | A | https://github.com/szimek/signature_pad |
| 보정 | stroke-stabilizer | MIT | TS/JS | 필터 체인·One Euro·endpoint·prediction·Catmull-Rom | 보정 알고리즘 소스·검증 | A | https://github.com/usapopopooon/stroke-stabilizer |
| 비OSS 비교 | Aseprite | source-available EULA | C++ | pixel art 전문 UX | 비교만 수행 | E | https://github.com/aseprite/aseprite |
| 비OSS 비교 | Mixbox | 상업/별도 조건 | 다중 언어 | 자연스러운 pigment mixing | Spectral.js/Hokusai 비교 | E/R | https://github.com/scrtwpns/mixbox |
| 색 | Color.js | MIT | JS | 다양한 color spaces·gamut·DeltaE | 색상 관리·품질 비교 | A | https://github.com/color-js/color.js |
| 색 | Culori | MIT | JS | 가벼운 색 변환·보간·difference | UI와 runtime 유틸 | A | https://github.com/Evercoder/culori |
| 색 | Spectral.js | MIT | JS | Kubelka-Munk 계열 spectral pigment mixing | palette·LUT·reservoir 혼색 | A | https://github.com/rvanwijnen/spectral.js |
| 색상 | Little CMS | MIT | C / WASM 가능 | ICC color management | soft proof·CMYK·profile conversion | A/B | https://github.com/mm2/Little-CMS |
| 셰이더 | glsl-pipeline | MIT | TS/WebGL/Three.js | multi-pass·double-buffer shader pipeline | WebGL effect prototype | B | https://github.com/patriciogonzalezvivo/glsl-pipeline |
| 셰이더 | LYGIA | Prosperity + Patron/Commercial | GLSL/HLSL/MSL/WGSL | 방대한 granular shader functions | 별도 상업 권리 없이는 코어 제외 | R | https://github.com/patriciogonzalezvivo/lygia |
| 스타일 | Rough.js | MIT | JS/Canvas/SVG | hand-drawn/sketchy geometry | 스케치 스타일 plugin | A | https://github.com/rough-stuff/rough |
| 습식매체 | InkWash | 라이선스 없음 확인 | HTML/WebGL2 | mobile/fixed pigment·wetness·Stable Fluids·Beer-Lambert | 클린룸 동작 사양 | D | https://github.com/johnowhitaker/inkwash |
| 습식매체 | jeantimex/fluid | MIT | WebGPU/WGSL | SPH·PIC/FLIP 2D/3D | 두꺼운 유체·droplet 연구 | B | https://github.com/jeantimex/fluid |
| 습식매체 | kishimisu WebGPU Fluid | 확인 필요 | WebGPU/WGSL | Stable Fluids demo | 코드 감사 후 참고 | D/B | https://github.com/kishimisu/WebGPU-Fluid-Simulation |
| 습식매체 | mikerkoval/FluidSimulation | MIT | WebGPU/WGSL | Stable Fluids compute·ping-pong | 속도·압력장 골격 | A/B | https://github.com/mikerkoval/FluidSimulation |
| 습식매체 | WebGL-Fluid-Simulation | MIT | WebGL | 모바일 친화 fluid simulation | WebGL2 fallback | A/B | https://github.com/PavelDoGreat/WebGL-Fluid-Simulation |
| 습식매체 | webgl-water | MIT | WebGL | water ripple·caustics | water drop·표면 효과 참고 | B | https://github.com/evanw/webgl-water |
| 습식매체 | writing-on-water | MIT | JS/WebGL | watercolor simulation demo | 수채 알고리즘 참고 | B | https://github.com/arsena21/writing-on-water |
| 영상 | ffmpeg.wasm | MIT + FFmpeg 구성 라이선스 확인 | C/WASM | 브라우저 codec·mux fallback | 영상 export fallback | B | https://github.com/ffmpegwasm/ffmpeg.wasm |
| 영상 | WebCodecs | Web Standard | Browser API | low-level media encode/decode | 영상·animation export | A | https://www.w3.org/TR/webcodecs/ |
| 이미지 | fast_image_resize | MIT OR Apache-2.0 | Rust/WASM SIMD | 고속 고품질 resize·mip | atlas·thumbnail·mip | A | https://github.com/Cykooz/fast_image_resize |
| 이미지 | OpenCV.js | Apache-2.0 | C++/WASM | threshold·morphology·contour·distance transform | tip cleanup·selection·SDF | A/B | https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html |
| 이미지 | Photon | Apache-2.0 | Rust/WASM | 고성능 image processing | tip·filter·worker fallback | A | https://github.com/silvia-odwyer/photon |
| 이미지 | wasm-vips | MIT + LGPL third parties | C/C++/WASM | streaming parallel image pipeline | 대량 brush pack 처리 | B | https://github.com/kleisauke/wasm-vips |
| 입력 | amoshydra/draw | MIT | JS/Canvas | pen/touch pressure drawing 예제 | 경량 입력 참고 | B | https://github.com/amoshydra/draw |
| 입력 | Pointer Events Level 3 | W3C 표준 | Web API | pressure·tilt·twist·coalesced·predicted·raw update | 원시 펜 입력 기준 | A | https://www.w3.org/TR/pointerevents3/ |
| 입력 | pointer-tracker | Apache-2.0 | TS/JS | pointer lifecycle와 고해상도 expanded samples | 입력 수집 어댑터 | A | https://github.com/GoogleChromeLabs/pointer-tracker |
| 입력 | Pressure.js | MIT | JS | Force Touch·구형 pressure API 추상화 | 레거시 fallback | B | https://github.com/stuyam/pressure |
| 입력 | Wacom Signature SDK JS samples | MIT(샘플) | JS | signature/device capture 예제 | 장치 진단 참고 | B | https://github.com/Wacom-Developer/sdk-for-signature-js |
| 자연매체 | brushlib-wasm | 명시 확인 필요 | C/WASM | libmypaint Emscripten port | 권리 확인 전 평가용 | D | https://github.com/eliot-akira/brushlib-wasm |
| 자연매체 | Ezu | MIT OR Apache-2.0 | Rust/WASM | Hokusai 구동 typed node DAG와 painterly ops | BrushGraph·effect graph 설계 참고 | A | https://github.com/reearth/ezu |
| 자연매체 | Hokusai | MIT OR Apache-2.0 | Rust/WASM | .myb·tile surface·smudge·spectral mixing·다양한 inputs | 주력 자연매체 runtime | A | https://github.com/reearth/hokusai |
| 자연매체 | libmypaint | ISC | C | MyPaint 공식 brush engine | 기준선·선택형 자체 WASM | A | https://github.com/mypaint/libmypaint |
| 자연매체 | mypaint-brushes | CC0 raw data / packaging 별도 | Brush data | 검증된 MyPaint preset | 초기 preset과 parity corpus | A/B | https://github.com/mypaint/mypaint-brushes |
| 자연매체 | p5.brush | MIT | JS/WebGL2 | custom tips·watercolor-like fill·hatching·vector field·pressure | 절차 브러시·prototype | A/B | https://github.com/acamposuribe/p5.brush |
| 저장 | OPFS | Web Platform | Browser API | origin-private high-performance files | journal·tiles·checkpoint | A | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system |
| 참고앱 | ChickenPaint | GPL-3.0 | JS/WebGL | 웹 painting application | 성능·기능 비교 | C | https://github.com/thenickdude/chickenpaint |
| 참고앱 | Graphite | Apache-2.0 | Rust | node-based vector+raster nondestructive editor | BrushGraph·문서 구조 | A/B | https://github.com/GraphiteEditor/Graphite |
| 참고앱 | JS Paint | MIT | JS/Canvas | 고전 paint tool UX | 도구 반응·픽셀 UX | A/B | https://github.com/1j01/jspaint |
| 참고앱 | Krita | GPL-3.0-or-later | C++/Qt | 다양한 전문 brush engine | 행동 사양·회귀 목표 | C | https://invent.kde.org/graphics/krita |
| 참고앱 | Lorien | MIT | Godot | pressure strokes·infinite canvas·SuperEraser | stroke 저장·벡터 지우개 참고 | A/B | https://github.com/mbrlabs/Lorien |
| 참고앱 | miniPaint | MIT | JS/Canvas | 브라우저 레이어·필터 편집기 | 웹 도구·패널 참고 | A/B | https://github.com/viliusle/miniPaint |
| 참고앱 | OpenToonz | Modified BSD + 폴더별 상이 | C++/Qt | animation drawing·palette·MyPaint integration | 파일 단위 감사 후 부분 참고 | B/C | https://github.com/opentoonz/opentoonz |
| 참고앱 | Pencil2D | GPL-2.0 | C++/Qt | bitmap/vector animation drawing | 행동 사양·타임라인 참고 | C | https://github.com/pencil2d/pencil |
| 참고앱 | Pixelorama | MIT | Godot | pixel/custom/random brush·patterns·symmetry | 픽셀 브러시 UX | A/B | https://github.com/Orama-Interactive/Pixelorama |
| 창작 코딩 | Pts.js | Apache-2.0 | TS/Canvas/SVG/WebGL | geometry·creative coding·interpolation | 절차 브러시 prototype | B | https://github.com/williamngan/pts |
| 텍스처 | FastNoiseLite | MIT | C++/Rust/JS/GLSL 등 | OpenSimplex·Perlin·Cellular·domain warp | paper/tip/granulation/noise | A | https://github.com/Auburn/FastNoiseLite |
| 텍스처 | poisson-disk-sampling | MIT | JS | variable-density Poisson disk | stamp·spray·fiber 분포 | A | https://github.com/kchapelier/poisson-disk-sampling |
| 텍스처 | simplex-noise.js | MIT | JS | dependency-free seeded 2D/3D/4D noise | 경량 JS preview | A | https://github.com/jwagner/simplex-noise.js |
| 텍스처 | texture-synthesis | MIT OR Apache-2.0 | Rust | example-based texture synthesis/inpainting | 오프라인 paper/tip 생성 | B(archive) | https://github.com/EmbarkStudios/texture-synthesis |
| 텍스트 | Fontique | MIT OR Apache-2.0 | Rust | system font discovery/fallback | font fallback adapter | A/B | https://github.com/linebender/fontique |
| 텍스트 | fontkit | MIT | JavaScript | font format·glyph·subset utility | export/font analysis | A/B | https://github.com/foliojs/fontkit |
| 텍스트 | HarfBuzz | Old MIT | C/C++ / WASM | Unicode text shaping | CJK·복합 script shaping | A | https://github.com/harfbuzz/harfbuzz |
| 텍스트 | opentype.js | MIT | JavaScript | OpenType parse·glyph path | 브라우저 font utility | A | https://github.com/opentypejs/opentype.js |
| 텍스트 | Parley | MIT OR Apache-2.0 | Rust | text layout, line breaking, bidi | Rust TextIR layout | A/B | https://github.com/linebender/parley |
| 텍스트 | Skrifa | MIT OR Apache-2.0 | Rust | font metadata·outlines·variations | glyph outline·font inspect | A/B | https://github.com/googlefonts/fontations |
| 파티클 | particle-emitter | MIT | TS/PixiJS | 검증된 PixiJS emitter | preset 형식·fallback | B | https://github.com/pixijs-userland/particle-emitter |
| 파티클 | particle-emitter-editor | MIT | JS/PixiJS | WYSIWYG emitter editor | Particle Brush editor 참고 | B | https://github.com/pixijs-userland/particle-emitter-editor |
| 파티클 | pixi-particle-system | MIT | TS/PixiJS | 현대적 TS particle system·editor | WebGL fallback·UI 참고 | B | https://github.com/danielpokladek/pixi-particle-system |
| 파티클 | RevoltFX | MIT | TS/PixiJS | nested emitters·effect sequences | 연쇄 효과 preset | B | https://github.com/bma73/revolt-fx |
| 파티클 | three.quarks | MIT | TS/Three.js | GPU instancing·curve params·3D VFX | 3D 효과 브러시 | A/B | https://github.com/Alchemist0823/three.quarks |
| 파티클 | three.quarks-editor | MIT | TS/React | VFX editor | 곡선·emitter UI 참고 | B | https://github.com/Alchemist0823/three.quarks-editor |
| 파티클 | tsParticles | MIT | TS/Canvas/WebGL | 다양한 shape·interaction·emitter | 배경/효과 참고 | B | https://github.com/tsparticles/tsparticles |
| 협업 | Yjs | MIT | TypeScript | CRDT shared types·offline sync | semantic collaboration | A | https://github.com/yjs/yjs |


# 33. 보조 엔진·프로토타이핑 코드의 정확한 배치

## 33.1 Blend2D

Blend2D는 고성능 CPU 2D 렌더링과 JIT 최적화에 강점이 있다. 브라우저 WASM 배포에서는 JIT 제약과 빌드 구성을 검증해야 하므로 기본 코어보다 다음 용도로 둔다.

- CPU raster benchmark
- 서버·데스크톱 bridge
- CanvasKit Software·tiny-skia와 시각/성능 비교
- headless thumbnail 후보
- 특정 플랫폼용 native companion

## 33.2 femtovg

femtovg는 작은 OpenGL/WebGL 계열 벡터 경로에 유리하다.

- 저용량 vector overlay
- embedded workspace
- recovery renderer 연구
- Vello·CanvasKit이 너무 무거운 특수 패널
- Rust UI/desktop companion

다만 제품의 공통 path semantics를 femtovg에 맞추지 않는다.

## 33.3 Two.js·Pts.js·Rough.js

이들은 렌더 코어보다 생성기·UX 효과로 사용한다.

- Two.js: renderer-agnostic 2D scene 아이디어
- Pts.js: 점·벡터·절차 기하·인터랙션
- Rough.js: 손그림 도형 style
- 결과는 `ToonSceneIR` path로 변환
- 대형 문서에는 생성 결과만 저장하고 라이브러리 객체를 유지하지 않음

## 33.4 Fabric.js·Konva

- Transformer·selection·hit test·object control UX 참고
- 레퍼런스 보드나 간단 임베디드 편집기에는 adapter로 사용 가능
- 메인 문서 모델·브러시·필터 코어로 사용하지 않음
- Fabric filter chain을 EffectGraph 원본으로 사용하지 않음
- Konva node를 저장 스키마로 사용하지 않음

## 33.5 regl·gpu-io·GLSL 프로젝트

- WGSL 구현 전 알고리즘 PoC
- WebGL2 폴백 shader
- particle·line·simulation prototype
- production shader는 자체 shader registry로 이관
- 원본 shader 라이선스·precision·color semantics를 기록
- GLSL→WGSL 자동 변환 결과를 그대로 신뢰하지 않고 golden test

## 33.6 완성형 오픈소스 앱 코드

| 프로젝트군 | 흡수할 것 | 직접 코어 편입 |
|---|---|---|
| Krita | 브러시 UX·프리셋 개념·필터·색상 관리 연구 | GPL 코드 직접 편입 금지 |
| OpenToonz | 애니메이션·레벨·스캔·cleanup workflow | 폴더별 라이선스 검토 |
| Graphite | node graph·벡터 편집 architecture | permissive 범위만 adapter/참고 |
| Lorien | 무한 캔버스·stroke 저장 UX | 전체 앱 종속 금지 |
| Pixelorama | 픽셀 애니메이션·palette UX | 코어 대신 기능 참고 |
| miniPaint | 브라우저 이미지 편집 UX | 모듈별 품질·라이선스 검토 |
| JS Paint | 레거시 paint UX·포맷·접근성 | 전문 코어로 사용하지 않음 |
| ChickenPaint | 자연매체·레이어 UX 연구 | GPL 직접 편입 금지 |
| Pencil2D | timeline·onion skin 참고 | GPL 직접 편입 금지 |
| Aseprite | 픽셀 워크플로 비교 | source-available 조건상 직접 채택 금지 |

---

# 34. 코드만 공개된 데모·논문 구현 수집 체계

## 34.1 수집 대상

- 하나의 HTML 파일에 포함된 WebGL/WebGPU demo
- GitHub Pages에서만 실행 가능한 shader
- README가 거의 없는 개인 연구 저장소
- 논문 supplementary code
- 오래된 실험 코드
- CodePen·Shadertoy·Observable 예제
- 블로그에 포함된 최소 구현
- 완성 라이브러리가 아닌 알고리즘 fragment

## 34.2 필수 메타데이터

```ts
interface ResearchCodeRecord {
  name: string;
  sourceUrl: string;
  author?: string;
  licenseStatus: "permissive" | "copyleft" | "restricted" | "none" | "unknown";
  language: string[];
  algorithm: string[];
  inputs: string[];
  outputs: string[];
  gpuRequirements?: string[];
  qualityNotes: string[];
  performanceNotes: string[];
  cleanRoomRequired: boolean;
  patentRisk?: string;
  lastVerifiedAt: string;
}
```

## 34.3 InkWash 흡수 방식

InkWash와 같은 구현에서 추출할 수 있는 것은 다음과 같다.

- 고해상도 pigment/wetness와 저해상도 velocity/pressure 분리
- Gaussian splat 입력
- ping-pong texture
- stable-fluid pass 순서
- 건조·경계 농축·입자 질감의 시각 모델
- 사용자 파라미터 UX
- mobile resolution strategy

라이선스가 명확하지 않다면 shader나 상수를 복사하지 않는다.

```text
관찰 담당
→ 독립 동작 사양·테스트 영상·입출력 작성

구현 담당
→ 사양만 보고 WGSL/Rust 재구현

검토 담당
→ 코드 유사성·라이선스·시각 결과 검토
```

## 34.4 공개 코드에서 제품 코드로 승격하는 단계

```text
Research Sandbox
→ License Gate
→ Algorithm Extraction
→ Minimal PoC
→ Common IR Adapter
→ Golden Test
→ Browser Matrix
→ Performance Budget
→ Security/Fuzz
→ Feature Flag
→ Production
```

## 34.5 라이선스가 있어도 그대로 사용하지 않는 이유

- 오래된 GPU API
- fixed resolution 가정
- straight alpha·sRGB 오류
- 전체 화면만 처리
- 메모리 해제 없음
- mobile precision 문제
- context loss 처리 없음
- 결정적 seed 없음
- 타일·Undo·협업 통합 없음
- 입력 지연 고려 없음

따라서 “오픈소스”는 시작점이며 ToonStudio의 document·tile·worker·quality 계약으로 다시 감싸야 한다.


# 35. 대표 브러시·필터 구현 레시피

## 35.1 브러시 35종 상세 파이프라인

| 기능 | 권장 처리 파이프라인 | 품질 핵심 | 폴백 | 저장·성능 원칙 |
| --- | --- | --- | --- | --- |
| 만화 G펜 | Pointer raw/coalesced → Rust One-Euro+corner preserve → Perfect Freehand outline → Kurbo cleanup → Vello fill | 압력 curve, nib spread, taper, corner join, endpoint | CanvasKit PathBuilder/CPU outline | 원본 samples와 width profile 보존 |
| 매핑펜 | 고주파 resample → 낮은 지연 stabilizer → subpixel outline → Vello | 최소 폭, 미세 anti-alias, pressure dead-zone | CanvasKit stroke/fill | 확대율별 최소 coverage |
| 캘리그래피 | tilt/azimuth/twist → oriented nib sweep → CanvasKit/Vello path | 촉 각도, 모서리, ink pooling | CanvasKit PathEffect | rotation smoothing 별도 |
| 거친 잉크펜 | vector centerline → CanvasKit Discrete PathEffect + SkSL edge noise | 거칠기 seed, 해상도 독립 texture | Vello outline + procedural perturb | export 시 고정 seed |
| 연필 HB | Hokusai/libmypaint dynamics → FastNoiseLite paper → WebGPU dab | grain 크기, pressure graphite density, tilt side shading | CanvasKit SkSL raster brush | paper UV를 문서 좌표에 고정 |
| 색연필 | Hokusai → pigment palette → paper height mask → Vello/CanvasKit 합성 | 색 축적, 왁스, grain fill | WebGPU dab | linear RGB가 아닌 pigment-like mix 옵션 |
| 목탄 | multi-scale particle tip → WebGPU dab → paper morphology | 가루 입자, 번짐, 압력·기울기 | Hokusai preset | 대형 팁은 mip atlas |
| 소프트 파스텔 | Hokusai + paper roughness + pigment pickup | 덩어리·가루·혼색 | WebGPU raster | dirty tile only |
| 알코올 마커 | WebGPU flow accumulation + edge darkening + limited blend | 겹칠 때 농도, 색 번짐, 투명도 | CanvasKit SkSL | preview/commit 동일 transfer |
| 에어브러시 | Poisson/blue-noise particle emitter → WebGPU additive/normal blend | 입자 분포, flow, edge softness | PixiJS/WebGL particle | seed·spacing deterministic |
| 수채 워시 | Hokusai input → WetMedia pigment/water injection → stable-fluid active tiles | wetness, absorption, granulation, edge darkening | Hokusai-only simplified | 건조 타일 즉시 bake |
| Wet-on-wet | wet mask → velocity/pressure solver → spectral pigment advection | 물 양, 확산, backrun | 저해상도 WebGL fluid | simulation resolution adaptive |
| 수묵 발묵 | bristle injection → water/ink fields → paper fiber anisotropy | 농담, 먹 번짐, 갈필 전환 | Hokusai ink preset | ink density를 별도 channel |
| 갈필 | XPBD bristle contacts → sparse dabs → Hokusai deposit | 브러시모 갈라짐, reservoir, paper peaks | procedural multi-tip | bristle count quality tier |
| 유화 | XPBD bristle + Hokusai pigment + height/viscosity WebGPU | pickup/deposit, impasto, spectral mix | Hokusai flat result | height/normal optional tier |
| 팔레트 나이프 | oriented polygon sweep → paint height displacement → normal lighting | knife angle, scrape, ridge | CanvasKit mesh/SkSL approximation | tile halo for height |
| 과슈 | opaque pigment deposition + limited wet mix + paper cover | 불투명도, 재습윤, chalkiness | Hokusai/WebGPU | alpha와 pigment density 분리 |
| 스머지 | source tile sampling → flow-field advection → deposit | sample radius, strength, wetness | CanvasKit displacement/local filter | read/write ping-pong |
| 믹서 브러시 | bristle pickup array → spectral reservoir → deposit | 오염, 세척, 브러시모별 색 | Hokusai smudge | reservoir state in StrokeIR |
| 클론 스탬프 | aligned source transform → WebGPU sampled dabs | source offset, rotation, scale, blending | CanvasKit image shader | source snapshot version 고정 |
| 힐링 브러시 | clone texture → low-frequency color harmonization → Poisson/local blend | 경계 seamless, texture preserve | OpenCV Worker commit | preview는 빠른 approximation |
| 집중선 | semantic center/radius → procedural paths → Vello | 개수, 랜덤, taper, exclusion mask | CanvasKit PathEffect | vector editable |
| 속도선 | gesture vector → path family → Vello/CanvasKit | 가속, 길이 분포, perspective | WebGPU bake | 컷 경계 clip |
| 망점 | screen-space or print-space procedural shader → CanvasKit SkSL/WebGPU | LPI, angle, dot gain, antialias | CPU export via CanvasKit | 화면 확대에도 주파수 의미 보존 |
| 장식 잎 브러시 | path arc length → Poisson/random stamps → CanvasKit Path1D/Vello image nodes | 방향, scale, collision, color jitter | WebGPU particle bake | stamp atlas |
| 털 브러시 | flow direction + XPBD strand bundles → Vello paths | strand count, clumping, taper | multi-line procedural | LOD에서 strand merge |
| 리본 브러시 | spring/XPBD centerline → width frame → Vello outline | 관성, 뒤집힘 방지, torsion | CanvasKit path | bake editable path |
| 체인 브러시 | XPBD link centers → instanced vector/image links | link overlap, collision, twist | CanvasKit drawAtlas | visible segment only |
| 불꽃 파티클 | WebGPU emitter+noise field → sprite/curve particles → composite | lifetime, turbulence, glow | PixiJS WebGL | simulation state 대신 seed+command |
| 연기 브러시 | curl-noise field → particles/volume-like sprites → blur | softness, dissipation, color | PixiJS/WebGL | low-res simulation upscale |
| 픽셀 펜 | integer resample → Bresenham/supercover policy → tile write | pixel perfect, palette lock | Canvas2D ImageData | no antialias |
| 디더 브러시 | coverage → Bayer/blue-noise threshold → indexed tile | pattern origin, palette, gamma | CanvasKit SkSL | document-coordinate pattern |
| 3D 표면 페인트 | BVH raycast → UV/triplanar dabs → seam dilation → PBR texture | channel, projection, backface, occlusion | CPU texture paint fallback | texture version + mesh hash |
| 벡터 지우개 | eraser swept area → PathKit/Clipper2 intersections → path split | 교차점/전체 선/부분 모드 | CanvasKit PathOps | centerline metadata 유지 |
| 연속 채색 브러시 | gesture regions → GPU flood fill queue → gap close → underfill | reference policy, tolerance, expansion | OpenCV/CPU fallback | region mask cache |

## 35.2 필터 25종 상세 파이프라인

| 필터 | 권장 처리 파이프라인 | 품질 핵심 | 폴백·보조 | 라우팅 원칙 |
| --- | --- | --- | --- | --- |
| 대형 Gaussian Blur | EffectGraph bounds → separable/tent/Kawase 선택 → tile halo → WGSL | radius별 algorithm switch, half precision 검증 | CanvasKit ImageFilter | 객체는 CanvasKit, 대형은 WebGPU |
| Drop Shadow | source alpha → blur → offset → color → composite | clip bounds, spread, inner/outer | CanvasKit DropShadow | 작은 객체 Skia 우선 |
| Color Matrix Chain | 여러 색상 노드를 하나의 matrix/curve LUT로 fuse | linear/perceptual space | CanvasKit ColorFilter | 불필요 pass 제거 |
| 3D LUT | tetrahedral/trilinear sampling WGSL | gamut, interpolation, domain | CanvasKit RuntimeEffect | LUT cache |
| Curves | 1D LUT 생성 → WGSL/SkSL sampling | channel/luma, monotonic | CanvasKit SkSL | UI는 spline, runtime은 LUT |
| Surface Blur | edge-aware bilateral/guided filter | radius, threshold, halo | OpenCV Worker | preview downsample |
| Smart Sharpen | edge mask + deconvolution/USM + halo suppression | noise threshold | OpenCV/Photon | full commit worker |
| Motion Blur | directional sample kernel 또는 motion vector | sample count, shutter | CanvasKit convolution for small | quality tier |
| Liquify | displacement field tile → brush edits → WGSL resample | field resolution, freeze mask | CanvasKit displacement preview | field is non-destructive node |
| Perspective Warp | homography/mesh → inverse sampling | resampling, alpha edge | OpenCV/CanvasKit matrix | vector objects transform natively |
| Moiré Reduction | frequency analysis → tone mask → adaptive smoothing/re-screen | tone angle·frequency preserve | OpenCV/wasm-vips | print preview corpus |
| Photo Line Art | multi-scale edge/XDoG → morphology → vector trace optional | line continuity, noise | OpenCV + VTracer | editable vector output option |
| Line Thicken | distance field/morphology with junction preservation | width, corner | CanvasKit Dilate small | vector line modifies width profile |
| Gap Close | directional morphology + contour topology | max gap, angle | CanvasKit/CPU small | fill preprocessing cache |
| Screen Tone | procedural dot/line shader in print coordinates | LPI, angle, dot gain | CanvasKit SkSL | CPU reference export |
| Halftone CMYK | color separation → four screen angles → composite | ICC, rosette, moiré | CanvasKit Software/vips | print mode only |
| Content-aware Fill | mask+source pyramid → PatchMatch/Poisson → refinement | preview vs commit | OpenCV simple inpaint | large task Worker |
| Healing | source texture + target low frequency → Poisson blend | edge continuity | OpenCV | brush-local tile |
| Normal Lighting | height/normal → diffuse/specular Skia/WebGPU | light type, roughness | CanvasKit lighting filter | natural media height reuse |
| Depth Fog | depth pass → curve → color composite | camera near/far | CanvasKit SkSL | 3D pass metadata |
| 3D NPR Outline | depth+normal+ID edge → vector/raster merge | line hierarchy | OpenCV/Vello | vectorize important lines |
| Temporal Denoise | motion compensation → history clamp → blend | ghosting, scene cut | WebGPU | frame cache budget |
| Optical Flow Interpolation | flow estimate → warp → occlusion blend | quality tier | OpenCV Worker | offline/commit |
| SVG Compatibility Render | usvg normalize → resvg/tiny-skia → visual diff | fonts, filters, external refs | CanvasKit reference | report unsupported |
| PSD Round-trip Diff | import→StudioDocument→export→reference raster→SSIM/DeltaE | layer semantics | CanvasKit Software/resvg | CI corpus |


# 36. 공식 검증 소스

다음은 엔진 상태·기능·라이선스·API 확인의 우선 출처다. 블로그 요약보다 공식 문서·공식 저장소·표준을 우선한다.

## 렌더링

- CanvasKit: https://skia.org/docs/user/modules/canvaskit/
- CanvasKit changelog: https://github.com/google/skia/blob/main/modules/canvaskit/CHANGELOG.md
- Skia API: https://api.skia.org/
- SkSL: https://skia.org/docs/user/sksl/
- Skia repository/license: https://github.com/google/skia
- Vello: https://github.com/linebender/vello
- Vello Hybrid docs: https://docs.rs/vello_hybrid/
- ThorVG: https://github.com/thorvg/thorvg
- ThorVG Web: https://github.com/thorvg/thorvg.web
- PixiJS renderers: https://pixijs.com/8.x/guides/components/renderers
- resvg: https://github.com/linebender/resvg
- tiny-skia: https://github.com/linebender/tiny-skia
- PathKit: https://github.com/google/skia/tree/main/modules/pathkit

## 브러시·입력·자연매체

- Pointer Events Level 3: https://www.w3.org/TR/pointerevents3/
- Perfect Freehand: https://github.com/steveruizok/perfect-freehand
- Hokusai: https://github.com/reearth/hokusai
- libmypaint: https://github.com/mypaint/libmypaint
- MyPaint brushes: https://github.com/mypaint/mypaint-brushes
- InkWash demo: https://johnowhitaker.github.io/inkwash/about
- InkWash repository: https://github.com/johnowhitaker/inkwash
- Rapier: https://github.com/dimforge/rapier
- JoltPhysics.js: https://github.com/jrouwe/JoltPhysics.js

## 필터·이미지·색상

- OpenCV.js: https://docs.opencv.org/
- Photon: https://github.com/silvia-odwyer/photon
- wasm-vips: https://github.com/kleisauke/wasm-vips
- libvips: https://github.com/libvips/libvips
- Color.js: https://github.com/color-js/color.js
- Culori: https://github.com/Evercoder/culori
- Little CMS: https://github.com/mm2/Little-CMS

## 3D·협업·저장

- Three.js: https://github.com/mrdoob/three.js
- three-vrm: https://github.com/pixiv/three-vrm
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh
- Manifold: https://github.com/elalish/manifold
- glTF Transform: https://github.com/donmccurdy/glTF-Transform
- Yjs: https://github.com/yjs/yjs
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- WebGPU: https://www.w3.org/TR/webgpu/
- WebCodecs: https://www.w3.org/TR/webcodecs/

---

# 37. 구현 완료 판정 체크리스트

## 문서·엔진

- [ ] `StudioDocument`가 모든 엔진 객체와 독립적이다.
- [ ] schema migration과 unknown-field preservation이 있다.
- [ ] `RenderIslandCompiler`가 capability와 비용을 모두 사용한다.
- [ ] 같은 문서를 Vello·CanvasKit·CPU 기준선으로 렌더해 diff할 수 있다.
- [ ] GPU 텍스처 공유 불가 시 복사 폴백이 자동 동작한다.
- [ ] 한 프레임의 최종 present 소유자가 하나다.

## 브러시

- [ ] raw/coalesced/predicted 입력을 분리한다.
- [ ] 장치별 압력·기울기·twist calibration이 있다.
- [ ] transient preview와 committed stroke가 분리된다.
- [ ] 벡터 획은 사후 폭·압력·taper 편집이 가능하다.
- [ ] 래스터 획은 희소 타일과 dirty bounds를 사용한다.
- [ ] 자연매체는 타일 seam과 건조 재현성을 통과한다.
- [ ] 물리·파티클은 seed와 bake 결과를 저장한다.
- [ ] 최소 100개 curated preset이 golden corpus를 통과한다.

## 필터

- [ ] EffectGraph가 비파괴 DAG다.
- [ ] filter bounds·halo가 정확하다.
- [ ] 색상 노드가 fuse된다.
- [ ] CanvasKit과 WebGPU 라우팅 기준이 자동화됐다.
- [ ] OpenCV·WASM 객체가 Worker에서 안전하게 해제된다.
- [ ] 8K와 세로 장문서에서 타일 처리가 가능하다.
- [ ] CPU reference와 시각 차이를 수치화한다.

## 파일·색상

- [ ] PSD import/export compatibility report가 있다.
- [ ] SVG는 resvg 기준선으로 round-trip 검증한다.
- [ ] 폰트 누락·대체·embed·subset 보고가 있다.
- [ ] color space·alpha contract가 모든 surface에 있다.
- [ ] ICC/soft proof와 단순 CMYK preview를 구분한다.
- [ ] export preflight가 플랫폼 규격을 검사한다.

## 저장·협업

- [ ] 명령 저널과 증분 checkpoint가 있다.
- [ ] OPFS quota·크래시·탭 종료 복구를 시험했다.
- [ ] raster pixels를 CRDT에 직접 넣지 않는다.
- [ ] branch·merge·semantic diff가 있다.
- [ ] 물리·유체 내부 상태를 네트워크로 계속 보내지 않는다.
- [ ] 권한·audit·외부 review link를 제공한다.

## 품질·운영

- [ ] 장시간 soak·context loss·Worker crash 시험을 통과한다.
- [ ] Chrome·Edge·Safari·Firefox 계열의 지원 경로를 capability로 판별한다.
- [ ] 펜 장치 matrix와 실제 사용자 블라인드 테스트가 있다.
- [ ] SBOM·third-party notices·모델·asset 라이선스가 분리돼 있다.
- [ ] 무라이선스 코드는 clean-room 외에는 사용하지 않는다.
- [ ] 플러그인·shader·파일 parser에 자원·시간 제한이 있다.

---

# 38. 최종 수량 요약

이 문서의 구현 목록은 다음 범위를 포함한다.

- 브러시 변형: **315종**
- 필터·효과·분석 노드: **616종**
- 드로잉 외 제품 기능: **1,045종**
- 엔진·라이브러리·공개 코드 레지스트리: **128개**
- 대표 상세 브러시 레시피: **35개**
- 대표 상세 필터 레시피: **25개**
- 최종 아키텍처: Vello·CanvasKit·Custom WebGPU·ThorVG·PixiJS·CPU 기준선을 결합한 Render Island 구조

수량은 제품 UI에 그대로 1,976개의 버튼을 만든다는 의미가 아니다. 동일 엔진 노드·파라미터·preset을 조합해 기능군을 제공하고, 초보자에게는 목적별 preset, 전문가에게는 BrushGraph·EffectGraph를 노출해야 한다.

---

# 39. 마지막 결론

ToonStudio가 취해야 할 가장 강력한 구조는 다음과 같다.

```text
Vello
  대량 동적 벡터와 선화

CanvasKit
  Skia 고급 효과·PathEffect·텍스트·호환 출력

Custom WebGPU
  래스터 브러시·습식 매체·스머지·파티클·전역 필터

ThorVG
  경량 SVG·Lottie·애니메이션

PixiJS
  래스터 타일·레퍼런스 보드·WebGL 폴백

resvg/tiny-skia/CanvasKit Software
  결정적 CPU 기준선·출력·복구

Hokusai/libmypaint/XPBD
  자연매체·필압·브러시모·물리

OpenCV/Photon/wasm-vips
  분석·인페인팅·CPU 폴백·대형 이미지

Three.js/Rapier/Manifold
  3D·VRM·물리·모델링

StudioDocument/CommandBus/OPFS/Yjs
  모든 엔진을 통제하는 제품의 실제 코어
```

**CanvasKit을 추가했다고 Vello를 줄이는 것이 아니며, Vello를 중심에 둔다고 CanvasKit의 성숙한 Skia 기능을 포기하는 것도 아니다.** 두 엔진과 WebGPU·ThorVG·PixiJS를 렌더 아일랜드 단위로 정확히 배치할 때, 브라우저에서 가능한 최고 수준의 품질·성능·기능 확장성을 동시에 확보할 수 있다.
