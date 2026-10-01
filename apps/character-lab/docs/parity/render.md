# character-lab 패리티 — render 영역(Babylon 어댑터·장면·재질·캡처·pick·물리 다리·뷰포트/렌더 패널)

상태: **current** (2026-10-01, render 작업자 작성). core가 `docs/shaper-parity-checklist.md`로 집계하기 전의 단일 소스이며 열 구조는 체크리스트와 같다.
이 컨테이너에는 GPU도 DOM 캔버스도 없다. 따라서 **Node에서는 `NullEngine`까지만** 검증했고, 실제 `WebGPUEngine`·`Engine`(WebGL2)로 그린 결과·셰이더 컴파일·
readPixels 행 순서·후처리·IBL·그림자 품질은 모두 '브라우저 검증' 열에 **미검증**으로 둔다. 모의로만 확인한 항목은 비고에 "모의"라고 적었다.

## 1. 엔진 결정과 어댑터 구조

- 주 엔진: Babylon.js 9.19.0 `WebGPUEngine`, 명시 대안: 같은 버전 `Engine`(WebGL2). **사용자가 고른 backend 하나만 만들고** 실패·timeout·소프트웨어 어댑터는
  `LabFailure`로 reject한다. 자동 선택·자동 전환·무음 fallback은 없다(ADR-0018). 요청 backend가 WebGPU면 WebGL 컨텍스트를 요청하지 않는 것을
  `render/babylon-engine-factory.test.ts`가 실제 Babylon 생성자로 확인한다.
- import 정책: `@babylonjs/core` 배럴 금지(서브패스 `….js`만), side-effect import는 `render/babylon/babylon-side-effects.ts` **한 곳**(모든 모듈의 실제 파일
  존재를 `babylon-import-policy.test.ts`가 확인), `@babylonjs/serializers`는 동적 import(청크 분리), DOM 의존 모듈(`engine.js`·`webgpuEngine.js`)은 `engine-factory.ts`에만 있다.

| 계층 | 파일 | 내용 |
| --- | --- | --- |
| 진입점(동적 import 청크 경계) | `render/babylon-character-engine.ts` | `createBabylonCharacterEngine`(요청 backend 하나만), 클래스·상수 재export. `app/composition.ts`의 **단 하나의 동적 import** |
| 엔진 본체 | `render/babylon/character-engine.ts` | `BabylonCharacterEngine`(`CharacterEngine` 포트 + `thumbnailSources` + 보고 포트). DOM 전용 Babylon 모듈을 import하지 않아 NullEngine이 Node에서 같은 클래스를 돌린다 |
| 엔진 생성(브라우저 전용) | `babylon/engine-factory.ts`, `engine-capabilities.ts`(Node-safe) | `WebGPUEngine.initAsync`·`device.lost`·부분 disposer, WebGL2 `Engine`(WebGL1로 내려가면 실패), 능력·어댑터 읽기 |
| 장면·리그 | `scene-builder.ts`, `character-rig.ts`, `mesh-binding.ts`, `package-loader.ts` | 우수 좌표·투명 clear·CSM(PCF/PCSS)·톤맵·PrePass SSS, 절차 소스(VertexData·스킨·morph·metadata), 제작 GLB 로드, 플랜 적용·스냅샷 복원 |
| 재질 | `materials/material-factory.ts`, `materials/toon-shader.ts`, `render/shader-sources.ts`, `render/material-presets.ts` | PBR 프리셋(피부 SSS·헤어 이방성·의상 sheen/clearcoat), 툰·밑색·법선·ID·깊이 ShaderMaterial(GLSL+WGSL 2벌), 얼굴 SDF 그림자 |
| 광원·후처리 | `lighting/ibl.ts`, `postprocess.ts` | 절차 스카이 IBL(`HDRFiltering.prefilter`), DefaultRenderingPipeline·SSAO2(베타)·TAA(베타) — 지원 여부를 먼저 확인하고 사유를 보고 |
| 캡처·pick·페인트 | `capture.ts`, `skinned-pick.ts`, `pick-and-paint.ts`, `render/triangle-pick.ts`, `render/readback.ts`, `render/synthetic-projection.ts` | 멀티패스 RTT(flat/lit/normal/depth/part-id/material-id), 썸네일, 스킨·morph 반영 레이캐스트, 부위별 페인트 텍스처(decal) |
| 물리·HUD·export | `physics-bridge.ts`, `hud.ts`, `glb-exporter.ts`, `render/frame-stats.ts` | DI provider 다리(역산 회전 → 보조 본), SceneInstrumentation·gpuFrameTime·p95, `GLTF2Export.GLBAsync` |
| 순수 모듈 | `capability/select-backend.ts`, `engine-init.ts`, `camera-framing.ts`, `procedural-sky.ts`, `face-sdf.ts`, `scene-features.ts`, `pose-skeleton.ts`, `viewport-camera.ts`, `viewport-math.ts`, `rig-inspection.ts` | Babylon을 모르는 판정·수학·보고 타입 |
| 테스트 지원 | `render/testing/{null-engine-harness,procedural-fixture,package-plan-fixture,glb-fixture}.ts` | NullEngine 하네스(테스트가 `render/babylon/**`에 닿는 유일한 문), 모의 readback |
| 패널 | `app/shell/panels/{ViewportPane,RenderPanel}.tsx`, `viewport-interactions.ts` | 캔버스·HUD·관절 핸들·드로잉 오버레이, 셰이딩 프로파일 편집·기능 가용성 표 |

엔진은 계약 밖의 **구조적 보고 포트**도 제공한다(패널이 `hasX(engine)`로 판별, 없으면 비활성+사유): `sceneFeatures()`(CSM·SSS·IBL·TAA·SSAO·MSAA·GPU 타이머·텍스처 모드 가용성),
`viewportCamera()`(위치·기저·fov·렌더 크기), `poseSkeleton()`(관절 드래그용 포즈 프레임 스켈레톤), `inspectRig()`·`inspectScene()`·`inspectPaint()`·`readBone()`(평문 점검, Babylon 객체 비노출).

## 2. 좌표·리그 규약

- 우수 좌표계, Y-up, 미터, 캐릭터 정면 +Z, 캐릭터 왼쪽 +X. 제작 패키지도 변환 노드 없이 같다(실제 Orion GLB에서 눈이 머리 본보다 +Z, 왼팔이 +X임을 테스트가 확인).
- 포즈 규약: `bone-local`(절차 소스, `local = rest ∘ pose`)과 `model-space`(제작 패키지, Mixamo 등 rest 회전이 항등이 아닌 리그: `local = Rp⁻¹ ∘ pose ∘ Rp ∘ restLocal`).
  Orion에서 `leftUpperArm`을 Z축 −90° 돌리면 팔꿈치·손이 어깨 둘레 해석값과 4자리까지 일치한다(`babylon-package-load.test.ts`).
- 캡처 규약: 래스터는 top-down·straight alpha·sRGB 8bit, 깊이는 RGBA8 24+8bit 패킹(`readback.ts packDepthRgba8` ↔ `export/raster-convert decodeDepth`).
  backend별 행 순서·premultiply 상수(`RTT_READBACK_FLIP_Y`·`RTT_READBACK_PREMULTIPLIED`)는 **브라우저 미검증 가정값**이다.
- 페인트 규약: `PaintLayer` 첫 행 = UV v 0, 텍스처 `invertY=false`를 명시한다(`inspectPaint()`가 값을 노출하고 테스트가 확인).

## 3. 구현 상태 표

| 항목(SHAPER 대응) | 구현 상태 | Node 검증(테스트 파일) | 브라우저 검증 | 비고(베타·사유) |
| --- | --- | --- | --- | --- |
| 백엔드 판정(WebGPU 없음·어댑터 null·소프트웨어 어댑터·한계 미달·WebGL2 없음, 요청 backend만 판정) | 구현됨 | `render/capability/select-backend.test.ts`(11) | 미검증 | `probeGpu`의 실제 `navigator.gpu.requestAdapter`·WebGL2 캔버스 probe는 주입 가능한 함수로 분리 |
| 엔진 팩토리(initAsync·timeout·부분 disposer·device.lost→lost·fallback 없음) | 구현됨 | `render/engine-init.test.ts`(9: 모의), `render/babylon-engine-factory.test.ts`(4: 실제 Babylon 생성자·`navigator.gpu` 스텁) | **미검증**(성공 경로·실제 `device.lost`·WebGL 컨텍스트 손실) | 어댑터 없음→`webgpu-init-failed`, 끝나지 않는 requestAdapter→`engine-init-timeout`, WebGL2 불가→`webgl2-init-failed`. 요청 외 backend 컨텍스트 요청 없음을 단언 |
| Babylon import 정책(서브패스·side-effect 한 곳·직렬화 청크) | 구현됨 | `render/babylon-import-policy.test.ts`(8), `src/architecture.test.ts` | `pnpm --filter @toonstudio/character-lab build`로 청크 분리 확인(§7) | 모든 side-effect 모듈의 실제 파일 존재를 확인 |
| 장면 빌더(우수 좌표·투명 clear·톤맵 KHR_PBR_NEUTRAL/ACES/없음·key/fill 광원·캡처 전용 카메라) | 구현됨 | `render/babylon-character-engine.test.ts`(29 중 장면·셰이딩 항목) | 미검증 | |
| 캐스케이드 그림자(CSM, PCF/PCSS, 캐스케이드 1~4) | 구현됨(가용성 게이트) | 같은 파일(NullEngine은 CSM 미지원 → 단일 `ShadowGenerator` 대체와 한글 사유를 보고하는지, 끄면 `off`) | **미검증**(그림자 품질·캐스케이드 경계) | 미지원 엔진은 사유를 `sceneFeatures().cascadedShadows`에 남기고 대체 생성기로 내려간다 |
| 절차 소스 바인딩(VertexData·스킨 4가중치·morph 절대 위치·`metadata.partId`) | 구현됨 | `render/babylon-character-engine.test.ts`, `render/babylon-physics-bridge.test.ts` | 미검증 | 소스를 재로드해도 메시·스켈레톤·재질·텍스처·노드가 누적되지 않음, 검증 실패 시 `LabFailure`(리그 비어 있음) |
| 제작 패키지 GLB 로드(실제 `public/assets/characters/*/*.glb` 2종) | 구현됨 | `render/babylon-package-load.test.ts`(31: GLB JSON 정답과 메시 이름·프리미티브·morph 수·본 수 대조) | 미검증(텍스처 디코드·KHR 재질 렌더) | Orion: 바디 2 프리미티브 각 morph 40(한 morph가 양쪽에 적용), 본 67·매핑 54, 헤어 LOD0만 가시. `_Outline`·멀티 프리미티브·규약 밖 이름은 합성 GLB로 확인 |
| 헤어 LOD·`_Outline` 셸 정책 | 구현됨 | 같은 파일(`preferredLod` 0·1·2·9, 셸은 toon+hull에서만 가시) | 미검증 | 규약 밖 메시는 숨기고 한글 `notes`로 알림(무음 대체 없음) |
| PBR 재질 프리셋(피부 SSS·헤어 이방성·눈 클리어코트·의상 sheen/clearcoat·unlit 하이라이트) | 구현됨 | `render/material-presets.test.ts`(표), 엔진 테스트(프리셋·색 override 반영) | **미검증**(셰이딩 결과) | SSS는 PrePass가 있을 때만(`sssAvailable`), 아니면 사유 보고 |
| 툰 셰이딩(ShaderMaterial GLSL+WGSL 2벌, 램프 2~4단, 얼굴 SDF 그림자, 림, hull/edge 외곽선) | 구현됨 | `render/shader-sources.test.ts`(7: 정적 검사), 엔진 테스트(PBR↔툰 전환·재질 클래스·외곽선 모드) | **미검증**(셰이더 컴파일 포함) | 이 저장소에 GLSL/WGSL 검증기가 없어 컴파일을 확인하지 못했다. 얼굴 SDF는 해석적 생성 맵(`face-sdf.ts`), 저작 SDF 아님 |
| NodeMaterial 툰 베타 토글 | **미구현** | — | — | 기본 경로가 ShaderMaterial로 스펙 요구를 충족해 베타 토글은 만들지 않았다 |
| 절차 스카이 IBL(`HDRFiltering.prefilter`) | 구현됨 | `render/procedural-sky.test.ts`; 엔진 테스트(NullEngine은 float 큐브 미지원 → `unavailable` 사유) | **미검증** | 외부 HDR 없음. IBL 끄기·세기는 `environmentIntensity`로 반영(테스트) |
| 후처리(FXAA·블룸·샤프닝·MSAA, SSAO2·TAA 베타) | 구현됨(가용성 게이트) | 엔진 테스트(토글 on/off 상태, 미지원 사유) | **미검증**(품질) | **발견·수정**: NullEngine에서 TAA를 만들어 '활성'으로 보고하고 dispose가 던지던 결함 → `texelFetch` 능력 확인 후 `unavailable` 사유 보고 |
| 멀티패스 캡처(flat·lit·normal·depth·part-id·material-id, MSAA RTT, top-down straight) | 구현됨 | `render/babylon-capture.test.ts`(14), `render/readback.test.ts`(6) | **미검증**(readPixels 행 순서·premultiply·셰이더 출력) | NullEngine은 파츠 AABB 합성 래스터 + `provenance.synthetic=true`·`backend="null"`. **모의 readback**(`installFakeReadback`)으로 flipY·premultiply 해제·깊이 디코드 배선만 검증 |
| 썸네일(현재 리그에 플랜 일시 적용, 스냅샷 복원) | 구현됨 | `render/babylon-thumbnail.test.ts`, `render/babylon-capture.test.ts` | 미검증 | 적용→렌더→`readPixels` 호출→복원을 한 동기 구간으로 묶어 GPU readback을 기다리는 동안 뷰포트가 원래 상태를 그린다(모의 지연 Promise로 확인) |
| 썸네일 임시 소스(`thumbnailSources=true`, `ThumbnailRequest.source`) | 구현됨 | `render/babylon-thumbnail.test.ts`(11) | 미검증 | 임시 리그는 레이어 마스크로 뷰포트 카메라에서 숨기고 그림자를 받지 않으며 해제 후 메시·스켈레톤·재질·텍스처·노드 수가 불변(절차·패키지, PBR·툰, 실패 경로) |
| 캡처 직렬화 | 구현됨 | 같은 파일(썸네일 readback 대기 중 `renderPasses`가 시작하지 않음, 앞선 실패 뒤에도 실행) | 미검증 | 캡처 카메라·RTT·플랜 일시 적용을 공유하므로 한 번에 하나만 실행 |
| pick(NDC → 파츠·UV·월드 위치·법선·거리) | 구현됨 | `render/babylon-paint-pick.test.ts`(11), `render/triangle-pick.test.ts`(10), Orion 패키지 포즈 pick | 미검증(실제 포인터 입력) | **발견·수정**: Babylon `pickWithRay`는 bind 포즈를 쓰므로 포즈를 바꿔도 옛 위치가 맞고 새 위치가 비었다 → 스킨·morph 반영 위치에 대한 자체 레이캐스트(묶음 AABB 가속, 스킨 행렬·morph 스냅샷 캐시) |
| 페인트 텍스처 업로드(부위별 RGBA8, `invertY=false`, PBR decal·툰 paintSampler 합성) | 구현됨 | `render/babylon-paint-pick.test.ts` | **미검증**(decal 합성 결과) | 크기가 같으면 갱신·다르면 재생성(텍스처 누수 없음), 소스 재로드·device lost 복원 시 새 리그에 다시 부착. `MeshUVSpaceRenderer` 투영 페인트(베타)는 쓰지 않는다 |
| 물리 다리(DI provider, 체인·캡슐 전달, 루트 본 월드 변환, 역산 회전 → 보조 본) | 구현됨 | `render/babylon-physics-bridge.test.ts`(15: 모의 provider) | 미검증(실제 builtin-pbd/rapier와 결합한 장면) | `solver().boneRotations`가 있으면 그 월드 회전, 없으면 입자 위치에서 같은 식으로 계산. unavailable·초기화 실패·receipt 실패는 `LabFailure` |
| HUD(프레임 ms·p95·GPU ms·드로 콜·삼각형·backend·어댑터·물리·셰이딩) | 구현됨 | 엔진 테스트, `render/frame-stats.test.ts`(4) | **미검증**(GPU 타이머) | GPU 타이머 미지원이면 `gpuFrameMs=null`과 사유(`sceneFeatures().gpuTimer`). NullEngine은 어댑터 라벨 `NullEngine` |
| GLB export(morph·스킨·targetNames 보존, `glTF` magic 검증) | 구현됨 | 엔진 테스트(절차), 패키지 테스트(원본과 스킨 수·joint 수·morph 타깃 합계 일치) | 미검증 | 같은 장면 두 번 export는 같은 바이트. morph 델타를 dense로 써서 원본보다 크다(Orion 약 13 MB) |
| NullEngine 하네스 | 구현됨 | `render/testing/null-engine-harness.ts`가 모든 `babylon-*.test.ts`의 진입 | — | 테스트가 `render/babylon/**`에 닿는 유일한 문(`architecture.test.ts` 예외). 모의 readback·톤맵 상수·`pickStats` 재export |
| ViewportPane(캔버스 등록, 크기, HUD, 프레이밍 3종, 관절 핸들 SVG, 드로잉 오버레이) | 구현됨 | `app/shell/panels/ViewportPane.test.tsx`(29, jsdom), `viewport-interactions.test.ts`(12), `render/viewport-math.test.ts`(6) | **미검증**(실제 캔버스·포인터·카메라 조작) | 핸들 화면 좌표가 Babylon 실제 투영과 일치함을 3개 시점에서 확인. 핸들은 포인터 전용(키보드 대안은 PosePanel) |
| 관절 드래그 → `pose/set`(scope `full`) | 구현됨 | 같은 파일(부모 관절 피벗, 45° 드래그의 FK 목표 오차 <3 mm, 제한 클램프 보고, 취소·Escape·언마운트 복원) | 미검증 | 드래그 중 `engine.applyPlan` 미리보기, **놓을 때 1회** dispatch(1 드래그 = history 1단계). 스켈레톤 포트가 없으면 비활성 + 사유 |
| 모델 위 드로잉(`createPointerPaintDriver`·`clientToNdc`·`normalizePointerPressure`) | 구현됨 | 같은 파일(pick→스트로크→`updatePaintTexture`→`paint/stroke` 토큰 1개, 취소 시 되돌림, 활성 부위 밖 안내) | 미검증 | 드로잉 모드에서는 카메라 조작이 꺼진다(오버레이가 포인터를 가로챔) |
| RenderPanel(모드·품질 프리셋·톤맵·그림자·후처리(TAA/SSAO 베타)·IBL·툰 옵션, 기능 가용성 표, HUD 표) | 구현됨 | `app/shell/panels/RenderPanel.test.tsx`(19, jsdom) | 미검증 | IBL 세기는 놓을 때 1회 dispatch. 엔진이 못 켠 기능은 '사용 불가 + 사유'로 표에 남는다 |

## 4. 공개 API(요약)

- 진입점: `createBabylonCharacterEngine(options): Promise<CharacterEngine>`(`CharacterEngineFactory`), `BabylonCharacterEngine.create(deps)`(주입 엔진).
- `CharacterEngine` 포트 전체(`loadSource`·`applyPlan`·`setShading`·`setCamera`·`setPhysicsProvider`·`settle`·`renderThumbnail`·`renderPasses`·`pick`·`jointHandles`·
  `updatePaintTexture`·`exportGlb`·`readHud`·`resize`·`dispose`) + `thumbnailSources = true`.
- 보고 포트(구조적): `sceneFeatures()`·`viewportCamera()`·`poseSkeleton()`·`inspectRig()`·`inspectScene()`·`inspectPaint()`·`readBone(name)`·`planDigest()`·`physicsReceipt(poseHash)`·`pendingColliderBones()`·`sourceNotes()`.
- 순수 모듈: `selectBackend`·`probeGpu`, `initializeEngine`·`createPartialDisposer`·`createLostReporter`, `resolveFraming`, `buildPoseFrameSkeleton`·`readPoseSkeleton`,
  `pixelRay`·`unprojectToViewPlane`·`projectToPixel`, `raycastTriangles`·`computeGroupBoxes`, `createFeatureReport`·`readSceneFeatures`, `packDepthRgba8`, `MATERIAL_PRESETS`.
- 패널 지원: `viewport-interactions`의 `jointLabelKo`·`visibleHandles`·`resolveDragPivot`·`computeJointDrag`·`hudRows`.

## 5. 이번 세션에서 발견·수정한 결함(NullEngine 테스트로 재현·고정)

1. `part.pbr.decalMap` null 가능성 타입 오류(typecheck) → 플러그인 getter가 지연 생성하므로 가드를 두고 켠다.
2. **pick이 bind 포즈를 맞춤**(위 표) → 자체 스킨 반영 레이캐스트로 교체, `pickDirty` 플래그 제거(내용 스냅샷 비교).
3. **ShaderMaterial 해제가 공유 텍스처(white·clear·SDF·페인트)를 함께 파괴**(`dispose(true, true)`) → 소스 재로드·임시 리그 해제 때 툰 재질이 죽은 텍스처를 쓰게 되던 결함 → `forceDisposeTextures=false`.
4. TAA를 지원하지 않는 엔진에서 '활성'으로 거짓 보고하고 dispose가 던짐 → 능력 확인 후 사유 보고. SSAO2도 다중 렌더 타깃·`texelFetch` 확인 추가.
5. PrePassRenderer 미지원 엔진에서 `enablePrePassRenderer()`가 콘솔 오류를 내던 것 → 능력 확인 후 사유만 남김.
6. 뷰포트 카메라 위치가 다음 렌더 전까지 이전 값 → 구면 좌표에서 직접 계산.
7. 썸네일이 주 리그에 플랜을 적용한 채 비동기 readback을 기다리고(뷰포트 깜빡임), 마지막 플랜이 없으면 되돌리지 않고, 캡처가 겹치면 서로 오염되던 결함 → 스냅샷 복원 + 동기 적용 구간 + 직렬화.
8. 이전 작업자 테스트 2건의 오류(`-0` 비교, 2×2 래스터 길이 16)를 바로잡았다.

## 6. 스펙 대비 미구현·축소와 이유

- NodeMaterial 툰 베타 토글: 미구현(기본 ShaderMaterial로 충족).
- `MeshUVSpaceRenderer` 투영 페인트: 쓰지 않음. 페인트는 paint 도메인이 UV 공간에서 스탬프하고 render는 텍스처만 올린다(decal).
- IBL Shadows·OpenPBR(베타 표기 후보): 구현하지 않았다.
- 셰이더(GLSL·WGSL)·후처리·IBL·SSS·CSM의 **실제 렌더 결과**: 검증 불가(GPU 없음). 구현·가용성 게이트·오류 경로까지만 Node로 확인했다.
- 관절 핸들의 키보드 조작: 없음(수치·IK 입력은 PosePanel).

## 7. 검증 기록(2026-10-01, render 작업자 실측)

| 명령 | 결과 |
| --- | --- |
| `pnpm --filter @toonstudio/character-lab typecheck` | 오류 0 |
| `pnpm exec vitest run apps/character-lab/src/render apps/character-lab/src/app/shell/panels/{ViewportPane,RenderPanel,viewport-interactions}.test.*` (루트 설정) | 25파일 / 265케이스 통과 |
| `pnpm --filter @toonstudio/character-lab exec vitest run src/render …` (앱 설정, 같은 대상) | 25파일 / 265케이스 통과 |
| `pnpm exec vitest run apps/character-lab/src/architecture.test.ts apps/character-lab/src/app` | 36파일 / 250케이스 통과(다른 작업자 테스트가 늘어 직전 248에서 증가) |
| `pnpm exec eslint --max-warnings=0 apps/character-lab/src/render apps/character-lab/src/app/shell/panels/{ViewportPane,RenderPanel,viewport-interactions}* apps/character-lab/src/architecture.test.ts` | 오류 0 · 경고 0 |
| `pnpm --filter @toonstudio/character-lab build` (1회) | 성공(약 6초, dist 24 MB·청크 295개). 진입 청크 `index-*.js`(934 kB)에는 Babylon 엔진 코드가 없고(`ThinEngine` 0건) `import()`로만 `babylon-character-engine-*.js`(862 kB, gzip 212 kB)를 불러온다. `index.html`에는 진입 스크립트와 CSS만 있다. `@babylonjs/serializers`(GLB export)는 별도 지연 청크 `2.0-*.js`(181 kB), 셰이더·후처리도 지연 청크. 500 kB 초과 경고는 엔진·진입·rapier 청크에 대한 것이며 동적 분할이 이미 적용돼 있다 |

Node 22·4코어 CPU에서 NullEngine으로 잰 참고 수치(GPU 시간 아님): Orion 로드 약 260 ms(14,604 삼각형), 첫 pick(메시 9개 스키닝) 약 25 ms,
캐시된 pick 평균 0.49 ms, 포즈 변경 뒤 첫 pick 약 6 ms, 6패스 합성 캡처(256²) 약 114 ms, 현재 리그 썸네일(128²) 평균 약 22 ms, 임시 소스 썸네일 평균 약 18 ms.

## 8. 브라우저 검증 절차(GPU 환경, 통합 후)

1. `pnpm dev:character-lab` → Chrome 113+에서 [WebGPU] 선택 → TopBar 배지·HUD에 backend `webgpu`·어댑터가 뜨는지, 그림자·SSS·IBL 상태가 RenderPanel 표에 '활성'인지.
2. [WebGL2] 선택 → 같은 항목, WebGPU 실패 시 자동으로 WebGL2가 만들어지지 **않는지**(실패 배너만).
3. 썸네일: 헤어 7장이 서로 다른 실루엣인지, 생성 중 뷰포트가 깜빡이지 않는지, 해제 후 메모리가 늘지 않는지.
4. 캡처: 투명 PNG 알파 가장자리(premultiply), 깊이·ID 패스의 행 순서(위아래 뒤집힘 없음) — `RTT_READBACK_FLIP_Y`·`RTT_READBACK_PREMULTIPLIED` 상수 확정.
5. 툰 모드: 셰이더 컴파일 오류 없음, 램프·림·얼굴 SDF 그림자·hull/edge 외곽선, PBR↔툰 전환.
6. 드로잉: 포즈를 바꾼 뒤에도 클릭한 표면에 칠해지는지(UV 방향·`invertY`), decal 합성 색.
7. 관절 핸들: 드래그가 손을 따라가는지, 제한에서 멈추는지, 1 드래그 = 실행 취소 1단계인지.
8. GLB: export한 파일이 외부 뷰어에서 스킨·morph로 열리는지.
결과는 `docs/shaper-parity-checklist.md` '브라우저 검증' 열에 날짜·기기·backend와 함께 기록한다(미실행 항목은 '미검증' 유지).

## 9. 다른 작업자·core에 전달

- `src/architecture.test.ts`에 한 줄 보정을 적용했다: 엔진 진입점(`render/babylon-character-engine.ts`)은 청크 경계라 `render/babylon/**`를 정적 import하는 유일한 Node 파일이므로 "Node 모듈은 browser 모듈을 정적 import하지 않는다" 규칙에서 제외했다.
- `thumbnailSources`·`ThumbnailRequest.source`는 구현했다. `source/capabilities` 이벤트는 엔진이 직접 emit하지 않고 `app/shell/apply-loop`가 `loadSource`가 돌려준 능력 맵으로 보고한다(엔진 → 스토어 직접 채널 없음). 엔진은 절차 소스에 `ALL_AVAILABLE_CAPABILITIES`, 패키지에 `plan.capabilities`를 돌려준다.
- 계약상 `EngineBackend`에 `null`이 없어 NullEngine은 진단 backend를 `webgl2`로 표기하고 HUD 어댑터 라벨 `NullEngine`·캡처 provenance `backend="null"`로 정직하게 구분한다.
- 뷰포트 CSS는 core가 이미 `cl-viewport-*`·`cl-render-*`를 넣었다. 구조적 배치(position·inset·pointer-events)는 패널이 인라인으로 가진다.
