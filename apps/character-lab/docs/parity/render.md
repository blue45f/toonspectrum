# character-lab 패리티 — render 영역(Babylon 어댑터·장면·재질·캡처·pick·물리 다리·뷰포트/렌더 패널)

상태: **current** (2026-10-02, render-beta 작업자 갱신). core가 `docs/shaper-parity-checklist.md`로 집계하기 전의 단일 소스이며 열 구조는 체크리스트와 같다.
이 컨테이너에는 실GPU가 없다. **Node에서는 `NullEngine`까지** 검증했고, 이번 갱신부터 Chrome 151 + **SwiftShader(소프트웨어 렌더러) WebGL2**로 실브라우저 실측을 더했다
('브라우저 검증' 열의 "소프트웨어 렌더러(SwiftShader) 실측"). 이 실측은 셰이더 컴파일·픽셀 존재·상대 비교까지만 보증하며 **실GPU 품질·성능·WebGPU 경로의 증거가 아니다**
(WebGPU는 소프트웨어 어댑터라 요청 시 실패하는 것이 정상). 실GPU·WebGPU로 확인하지 못한 항목은 '미검증', 모의로만 확인한 항목은 비고에 "모의"라고 적었다.
**베타 기능**(NodeMaterial 툰·IBL 그림자·OpenPBR·투영 페인트)은 기본 꺼짐이고, 켜기 전에 엔진 능력을 확인하며, 지원하지 않으면 켜지지 않고 한글 사유를 보이며, 다른 경로로 자동 대체하지 않는다.

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
| 베타·확장 순수 모듈 | `render/{beta-features,toon-reference,openpbr-mapping,projection-paint,joint-offsets,morph-limits,mouth-shade,glb-sparse-morph,material-readiness}.ts` | 베타 상태 타입, 툰 CPU 기준식(`ToonParams`), PBR 프리셋→OpenPBR 매핑, 투영 페인트 포트·수학, 관절 오프셋 합산, morph 한계 보고, 입 안 마스크, GLB sparse 후처리, 재질 준비 폴링 |
| 베타·확장 Babylon 모듈 | `babylon/{beta-controller,beta-support,joint-offset-rig,projection-paint}.ts`, `babylon/materials/{node-toon-material,openpbr-material}.ts`, `babylon/lighting/ibl-shadows.ts` | 베타 수명·직렬화 컨트롤러, 능력 판정, 관절 오프셋 → 본 rest·역바인드, `MeshUVSpaceRenderer` 투영, NodeMaterial 툰 그래프(120블록), OpenPBRMaterial, IBL Shadows 바인더. 무거운 3개는 **동적 import**(별도 청크) |
| 테스트 지원 | `render/testing/{null-engine-harness,procedural-fixture,package-plan-fixture,glb-fixture,cpu-skinning,node-graph-interpreter}.ts` | NullEngine 하네스(테스트가 `render/babylon/**`에 닿는 유일한 문: 능력 덧씌우기·가짜 IBL·모의 readback·베타 로더 주입), CPU 스키닝, NodeMaterial 그래프 해석기 |
| 패널 | `app/shell/panels/{ViewportPane,RenderPanel,projection-paint-driver}.ts(x)`, `viewport-interactions.ts` | 캔버스·HUD·관절 핸들·드로잉 오버레이(스트로크마다 투영/CPU 경로 선택), 셰이딩 프로파일 편집·베타 토글·기능 가용성 표 |

엔진은 계약 밖의 **구조적 보고 포트**도 제공한다(패널이 `hasX(engine)`로 판별, 없으면 비활성+사유): `sceneFeatures()`(CSM·SSS·IBL·TAA·SSAO·MSAA·GPU 타이머·morph/본 텍스처 모드 가용성 **9개 + 확장 6개**: 베타 4 + 체형 관절 오프셋 + GLB morph sparse),
`betaFeatures()`·`setBetaFeature(id, enabled)`(베타 토글 — 엔진 세션 상태이며 `ShadingProfile`(core 동결 strict 계약)에는 필드를 더하지 않는다. 엔진을 다시 고르면 모두 꺼짐), `projectionPaint()`(투영 페인트 포트, 켜져 있을 때만),
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
| 장면 빌더(우수 좌표·투명 clear·톤맵 KHR_PBR_NEUTRAL/ACES/없음·key/fill 광원·캡처 전용 카메라) | 구현됨 | `render/babylon-character-engine.test.ts`(29 중 장면·셰이딩 항목) | SwiftShader 실측: 장면이 뜨고 PBR·툰 캡처 성공(아래 §7). 실GPU 미검증 | |
| 캐스케이드 그림자(CSM, PCF/PCSS, 캐스케이드 1~4) | 구현됨(가용성 게이트) | 같은 파일(NullEngine은 CSM 미지원 → 단일 `ShadowGenerator` 대체와 한글 사유를 보고하는지, 끄면 `off`) | **미검증**(그림자 품질·캐스케이드 경계) | 미지원 엔진은 사유를 `sceneFeatures().cascadedShadows`에 남기고 대체 생성기로 내려간다 |
| 절차 소스 바인딩(VertexData·스킨 4가중치·morph 절대 위치·`metadata.partId`) | 구현됨 | `render/babylon-character-engine.test.ts`, `render/babylon-physics-bridge.test.ts`, `render/babylon-render-integrations.test.ts`(CCW 감김) | SwiftShader 실측(캡처로 형상 확인). 실GPU 미검증 | 소스를 재로드해도 메시·스켈레톤·재질·텍스처·노드가 누적되지 않음, 검증 실패 시 `LabFailure`(리그 비어 있음). **발견·수정**: 절차 메시는 glTF와 같은 CCW 감김인데 장면이 우수 좌표라 기본(시계) 감김이면 앞면이 컬링돼 툰·법선 패스가 뒷면을 그렸다 → `overrideMaterialSideOrientation = CounterClockWise` |
| 제작 패키지 GLB 로드(실제 `public/assets/characters/*/*.glb` 2종) | 구현됨 | `render/babylon-package-load.test.ts`(31: GLB JSON 정답과 메시 이름·프리미티브·morph 수·본 수 대조) | 미검증(텍스처 디코드·KHR 재질 렌더) | Orion: 바디 2 프리미티브 각 morph 40(한 morph가 양쪽에 적용), 본 67·매핑 54, 헤어 LOD0만 가시. `_Outline`·멀티 프리미티브·규약 밖 이름은 합성 GLB로 확인 |
| 헤어 LOD·`_Outline` 셸 정책 | 구현됨 | 같은 파일(`preferredLod` 0·1·2·9, 셸은 toon+hull에서만 가시) | 미검증 | 규약 밖 메시는 숨기고 한글 `notes`로 알림(무음 대체 없음) |
| PBR 재질 프리셋(피부 SSS·헤어 이방성·눈 클리어코트·의상 sheen/clearcoat·unlit 하이라이트) | 구현됨 | `render/material-presets.test.ts`(확산 프로파일 g==b 불변식 포함), 엔진 테스트(프리셋·색 override 반영) | **소프트웨어 렌더러(SwiftShader) 실측**: PBR lit **11,440 px 불투명**(256×384, 평균 휘도 125.0)·flat 11,440 px, 진단 console 오류 0건. 실GPU 셰이딩 품질 미검증 | SSS는 PrePass가 있을 때만(`sssAvailable`), 아니면 사유 보고. **발견·수정(실브라우저)**: ①IBL 텍스처가 임시 프로브 장면에서 만들어졌다 해제돼 PBR이 영원히 미준비 → lit 완전 투명(§5), ②Babylon 9.19 `addDiffusionProfile` (r,b,g) 저장·(r,g,b) 중복 검사 불일치로 console.error 113회 → 프로파일을 g==b로 둔다, ③SSS 재질이 PrePass 없는 캡처 RTT에서 검게 나옴 → lit 패스만 SSS 끈 변종으로 그린다 |
| 툰 셰이딩(ShaderMaterial GLSL+WGSL 2벌, 램프 2~4단, 얼굴 SDF 그림자, 림, hull/edge 외곽선) | 구현됨 | `render/shader-sources.test.ts`(7: 정적 검사), `render/toon-reference.test.ts`(12: CPU 기준식·상수가 두 셰이더 소스 리터럴과 같음·광원 정규화), 엔진 테스트 | **소프트웨어 렌더러(SwiftShader) 실측**: GLSL 컴파일 성공, lit **11,440 px**(평균 휘도 158.1). **WGSL·WebGPU 미검증**, 실GPU 품질 미검증 | 얼굴 SDF는 해석적 생성 맵(`face-sdf.ts`), 저작 SDF 아님. **발견·수정(실브라우저)**: 광원색+환경색 합이 1을 넘어 피부·상의가 흰색으로 날아감 → `normalizeToonLighting`(합이 1을 넘으면 같은 비율로 축소, 광원:환경 비율 보존) |
| **NodeMaterial 툰(베타)** — 코드로 구성한 NodeMaterial 그래프(NME 에디터·JSON 없음), `ToonParams` 의미가 기본 ShaderMaterial 툰과 같다 | 구현됨(베타) | `render/babylon-node-toon.test.ts`(8: GLSL·WGSL 빌드 문자열 생성, **그래프 해석기가 CPU 기준식 `evaluateToon`과 무작위 300 프래그먼트에서 1e-9 안에서 같음**), `render/babylon-beta-features.test.ts`(툰 모드 전환·파라미터 반영·해제·연타·소스 교체·실패·dispose 누수 없음) | **소프트웨어 렌더러(SwiftShader) 실측**: 빌드 5.5 s(120블록, GLSL), lit **11,440 px**·평균 휘도 158.1로 기본 툰과 **같고 픽셀 차이 0**(램프 3·4단 모두 >8/255 픽셀 0, 최대 차 0). **WGSL·WebGPU 미검증** | PBR 모드에서 켜면 "대기"(툰 전용), 툰 모드에서 적용. 외곽선(hull/edge)은 재질과 무관하게 기존 경로. 정점 단계는 인스턴스→본→morph(텍스처 모드 포함)→월드/뷰프로젝션. 그래프는 `fwidth`를 `Derivative` 블록(|dx|+|dy|)으로 표현. 동적 import 청크 `node-toon-material-*.js`(약 200 kB) |
| **IBL Shadows(베타)** — `IblShadowsRenderPipeline` 바인더 | 구현됨(베타, 능력 게이트) | `render/babylon-beta-features.test.ts`(가짜 파이프라인 10: 지원+IBL+PBR에서만 켜짐·툰 모드 대기·IBL 꺼짐 대기·250 ms 재복셀화 제한·생성 실패 사유·켜기/끄기 연타·dispose 후 **GBR·CDF 장면 구성요소와 관찰자 3종 되돌림**을 장면 객체 수로 확인) | **소프트웨어 렌더러(SwiftShader) 실측**(노이즈 PNG는 외부 요청이 막혀 playwright 라우트로 대체): 생성 7.5 s, "재복셀화 1회", 켠 화면이 꺼진 화면과 759 px(최대 차 69/255) 달라지고 끄면 원래와 같음(차이 0). console 오류 0. **실GPU 그림자 품질·스킨/morph 복셀화 정확도·실제 노이즈 텍스처 수신 미검증** | `supportIBLShadows`(WebGL2·WebGPU true, NullEngine·WebGL1 false)+`textureFloatRender` 없으면 한글 사유로 unavailable. **그림자를 받는 재질은 PBR·OpenPBR뿐**(툰은 받지 못해 툰 모드에서는 대기). 파이프라인 생성자가 청색 노이즈 PNG 1장을 assets.babylonjs.com에서 받는다(**외부 요청**, UI에 고지). Babylon `dispose()`가 되돌리지 않는 것(GBR·CDF·관찰자)은 바인더가 되돌린다. 복셀화 셰이더는 본·morph include를 가지나 포즈 변경 뒤 복셀이 맞는지는 미검증(포즈 변경 시 재복셀화 예약만 한다) |
| **OpenPBR(베타)** — `OpenPBRMaterial`, 기존 프리셋 파라미터 규약에서 매핑 | 구현됨(베타, 능력 게이트) | `render/openpbr-mapping.test.ts`(6: 프리셋 11종 범위·클리어코트→coat·sheen→fuzz·이방성·SSS·emissive·unlit), `render/babylon-beta-features.test.ts`(WebGL2 능력 덧씌움: 파라미터 반영·플랜 프리셋/색 변경·툰 모드 대기·해제 누수 없음·**미준비 시 unavailable + 한글 사유**), `render/babylon-capture-readiness.test.ts` | **소프트웨어 렌더러(SwiftShader) 실측**(노이즈 PNG 라우트 대체): 빌드 8.9 s, lit **11,440 px**·평균 휘도 124.6(기본 PBR 125.0), 기본 PBR과 12.6 %의 픽셀이 8/255 넘게 다름(평균 절대차 6.4: BRDF·SSS 모델 차이로 예상된 범위). **실GPU 품질 미검증** | WebGL2 이상 또는 WebGPU 필요(WebGL1·NullEngine은 한글 사유로 불가). **페인트 데칼은 보이지 않는다**(OpenPBRMaterial에 decalMap 플러그인이 없음 — UI·상태 문구에 고지). 피부 SSS는 확산 프로파일 색 대신 평균 자유 경로 약 4 mm·채널 배율로 **근사**. 생성자가 노이즈 PNG를 외부에서 받아 못 받으면 영원히 미준비 → 준비 대기(90초) 뒤 `unavailable`로 보고하고 재질을 해제(재질이 준비되지 않은 채 메시에 끼우면 캐릭터가 사라진다). 캡처 lit 패스는 SSS 가중치를 0으로 둔다 |
| **투영 페인트(베타)** — `MeshUVSpaceRenderer`, paint 도메인의 `paint/stroke` 토큰과 호환 | 구현됨(베타, GPU readback 레인만) | `render/babylon-beta-features.test.ts`(포트·스탬프·모의 readback flush·readback 불가/형식 오류 한글·해제 누수 없음), `app/shell/panels/projection-paint-driver.test.ts`(23: **overlay→PaintLayer 합성(선형 source-over)·스트로크당 `paint/stroke` 1개·undo 토큰 적용 시 바이트 원복·redo·이동 보간·읽기 중 새 스트로크 거절·실패 알림**), `render/projection-paint.test.ts`(8) | **소프트웨어 렌더러(SwiftShader) 실측**: 스탬프 10회(정지 5·팔 들기+팔 길이 morph+팔꿈치 굽힘 5) 모두 CPU pick UV 위치에 알파 255로 칠해짐(거리 0 px, **행 순서 뒤집힘 없음**, 스킨·morph 표면 반영), UV 섬 이음매 근처 스탬프는 반대편 섬에도 칠함(실측 이미지로 확인), 겹침 알파 128→192→224(Porter-Duff 기대 128/192/223), 첫 스탬프 약 1.0–1.4 s(셰이더 컴파일)·이후 20–40 ms. **실GPU·WebGPU, 포인터 흐름(ViewportPane) 통합은 브라우저 미검증** | 결과는 항상 같은 `PaintLayer` RGBA다: 드라이버가 overlay를 레이어에 합성해 변경된 64px 타일을 `session.applyToken`으로 반영하고 돌려받은 역토큰(변경 전 타일)을 undo 토큰으로 **1번만** commit. **불가·한계**: ①GPU 블렌딩은 sRGB 바이트 공간 premultiplied라 **한 스트로크 안에서 겹치는 곳**은 CPU 선형 합성과 미세하게 다르다(같은 색 겹침은 알파가 같다), ②읽기가 끝나기 전에는 새 스트로크를 시작하지 않는다(RTT 공유), ③투영 방향 기준 뒷면은 셰이더가 잘라 얇은 부위의 반대편은 칠하지 않는다, ④랩 모드(UV 감김)는 쓰지 않는다, ⑤NullEngine에는 readback이 없어 지원하지 않는다(사유 표시) |
| **체형 morph 관절 오프셋 소비**(humanoid 요청 §4.1) — `HumanoidModelData.jointOffsets` | 구현됨 | `render/joint-offsets.test.ts`(6), `render/babylon-joint-offsets.test.ts`(13: **해석적 기대값** p = e′ + R(v − e′)를 w=0.25·0.5·1에서 오차 <0.01 mm로 확인, **jointOffsets 없는 대조군은 w=1에서 70 mm 어긋남**, 역바인드 재생성이 없으면 이중 이동해 실패함을 변이 시험으로 확인, 스냅샷 복원·부모 먼저 처리·리그에 없는 morph 무시), `app/render-humanoid-link.integration.test.ts`(7: **실제 `buildHumanoidModel` 결과가 humanoid 기준 구현(`skeletonWithJointOffsets`+`boneWorldMatrices`+`skinPositionsCpu`)과 1e-4 m 안에서 같음**, 체형 morph 18종 무작위 가중치·무작위 포즈 5세트 포함) | 간접 확인만: SwiftShader에서 팔 길이 0.8·팔 들기·팔꿈치 굽힘 상태의 UV 렌더러(GPU 스키닝·morph 셰이더) 투영이 CPU pick 위치와 0 px로 일치. **본 텍스처·morph 텍스처 정점 셰이더로 그린 메시 자체의 직접 비교는 미검증** | 플랜의 체형 morph 가중치 w마다 본 로컬 rest 평행이동에 w×오프셋을 더하고 **역바인드를 morph된 rest에서 다시 만든다**(링크된 노드가 로컬 행렬을 매 프레임 덮어쓰므로 노드 위치도 옮김). 합산 식은 humanoid 기준 구현과 같고(영역 간 import 금지라 재구현) 연결 시험이 일치를 지킨다. 제작 패키지에는 오프셋이 없다 |
| **머리 morph 54개의 텍스처 모드·한계 보고**(humanoid 요청 §4.2) | 구현됨 | `render/morph-limits.test.ts`(6), `render/babylon-render-integrations.test.ts`(54타깃 텍스처 모드 active, 층 한계 32에서 attribute 모드 강등 + 사유·8개 제한·무시되는 활성 수 보고) | **소프트웨어 렌더러(SwiftShader) 실측**: 54타깃 텍스처 모드, 매니저 14개·최대 텍스처 1492×1×54층·합계 약 3.3 MB, 층 한계 2048(이 소프트웨어 렌더러의 `MAX_ARRAY_TEXTURE_LAYERS`) | Babylon은 타깃 수가 층 한계를 넘으면 **무음으로 attribute 모드(동시 활성 8개)로 내려간다** → `sceneFeatures().morphTextureMode`가 사유와 함께 보고(NullEngine은 정점 텍스처 조건이 없어 attribute 모드 + 사유). 활성 타깃 수는 influence>0 개수로 세어 8개 초과분이 무시됨을 정확히 알린다 |
| **입 안 UV 섬 어둡게**(humanoid 요청 §4.3) — `MOUTH_TUBE_RECT`·`MOUTH_CAP_RECT` | 구현됨 | `render/mouth-shade.test.ts`(7), `app/render-humanoid-link.integration.test.ts`(**humanoid UV 레이아웃 상수와 일치**, 실제 head 정점의 입 안 UV가 모두 마스크 영역 안·섬 밖은 어둡지 않음), `render/babylon-render-integrations.test.ts`(PBR·툰(ShaderMaterial·NodeMaterial)·OpenPBR가 같은 마스크를 알베도로 곱함) | GLB로 내보내면 mat:head의 baseColor 텍스처 1장으로 나감(실측). **화면에서 입 안이 어두운지 시각 확인은 미검증** | 알베도에 곱하는 512² 마스크 텍스처(관 입술→안쪽 갈수록 어둡게, 캡 가장 어둡게, 1.5텍셀 번짐). PBR(albedoTexture×색)·툰(albedoSampler×baseColor)이 이미 알베도 텍스처를 곱하므로 셰이더를 바꾸지 않고 두 모드가 같다. 절차 소스의 `head` 파츠에만 적용 |
| 절차 스카이 IBL(`HDRFiltering.prefilter`) | 구현됨 | `render/procedural-sky.test.ts`; 엔진 테스트(NullEngine은 float 큐브 미지원 → `unavailable` 사유), `render/babylon-render-integrations.test.ts`(IBL 생성기가 임시 장면이 아니라 엔진의 **실제 장면**을 받음) | **소프트웨어 렌더러(SwiftShader) 실측**: 환경 텍스처가 장면 수명과 같아 PBR 재질이 준비됨(위 PBR 수치). 실GPU 품질 미검증 | 외부 HDR 없음. IBL 끄기·세기는 `environmentIntensity`로 반영(테스트). **발견·수정**: 임시 프로브 장면에서 만들어 해제하면 텍스처가 함께 파괴된다 → 최종 장면에서 생성(`create()` 순서·`createIbl` 주입 훅)하고 준비 상태를 확인 |
| 후처리(FXAA·블룸·샤프닝·MSAA, SSAO2·TAA 베타) | 구현됨(가용성 게이트) | 엔진 테스트(토글 on/off 상태, 미지원 사유) | **미검증**(품질) | **발견·수정**: NullEngine에서 TAA를 만들어 '활성'으로 보고하고 dispose가 던지던 결함 → `texelFetch` 능력 확인 후 `unavailable` 사유 보고 |
| 멀티패스 캡처(flat·lit·normal·depth·part-id·material-id, MSAA RTT, top-down straight) | 구현됨 | `render/babylon-capture.test.ts`(14), `render/babylon-capture-readiness.test.ts`(11), `render/readback.test.ts`(6) | **소프트웨어 렌더러(SwiftShader) 실측**: PBR·툰 flat·lit 확인(§7), char-core `scripts/browser-probe.mjs` 통과(PBR lit 면적 12.6 %·툰 13.3 %, 모서리 알파 0). **readPixels 행 순서·premultiply 상수는 실GPU·WebGPU 미검증** | NullEngine은 파츠 AABB 합성 래스터 + `provenance.synthetic=true`·`backend="null"`. **모의 readback**(`installFakeReadback`)으로 flipY·premultiply 해제·깊이 디코드 배선만 검증. **캡처는 실제 `material.isReady(mesh)`를 폴링해 모든 재질(PBR·툰·OpenPBR·NodeMaterial)이 준비된 뒤에만 그리고 90초 안에 안 되면 `capture-shader-timeout` LabFailure로 사유를 알린다(무음 폴백·투명 결과 없음)** — 이전 `forceCompilationAsync`는 임시 서브메시로 1.2초 만에 돌아와 실제 변종은 미준비인 채 투명 결과를 냈다 |
| 썸네일(현재 리그에 플랜 일시 적용, 스냅샷 복원) | 구현됨 | `render/babylon-thumbnail.test.ts`, `render/babylon-capture.test.ts` | 미검증 | 적용→렌더→`readPixels` 호출→복원을 한 동기 구간으로 묶어 GPU readback을 기다리는 동안 뷰포트가 원래 상태를 그린다(모의 지연 Promise로 확인) |
| 썸네일 임시 소스(`thumbnailSources=true`, `ThumbnailRequest.source`) | 구현됨 | `render/babylon-thumbnail.test.ts`(11) | 미검증 | 임시 리그는 레이어 마스크로 뷰포트 카메라에서 숨기고 그림자를 받지 않으며 해제 후 메시·스켈레톤·재질·텍스처·노드 수가 불변(절차·패키지, PBR·툰, 실패 경로) |
| 캡처 직렬화 | 구현됨 | 같은 파일(썸네일 readback 대기 중 `renderPasses`가 시작하지 않음, 앞선 실패 뒤에도 실행) | 미검증 | 캡처 카메라·RTT·플랜 일시 적용을 공유하므로 한 번에 하나만 실행 |
| pick(NDC → 파츠·UV·월드 위치·법선·거리) | 구현됨 | `render/babylon-paint-pick.test.ts`(11), `render/triangle-pick.test.ts`(10), Orion 패키지 포즈 pick | 미검증(실제 포인터 입력) | **발견·수정**: Babylon `pickWithRay`는 bind 포즈를 쓰므로 포즈를 바꿔도 옛 위치가 맞고 새 위치가 비었다 → 스킨·morph 반영 위치에 대한 자체 레이캐스트(묶음 AABB 가속, 스킨 행렬·morph 스냅샷 캐시) |
| 페인트 텍스처 업로드(부위별 RGBA8, `invertY=false`, PBR decal·툰 paintSampler 합성) | 구현됨 | `render/babylon-paint-pick.test.ts` | **미검증**(decal 합성 결과) | 크기가 같으면 갱신·다르면 재생성(텍스처 누수 없음), 소스 재로드·device lost 복원 시 새 리그에 다시 부착. `MeshUVSpaceRenderer` 투영 페인트(베타)는 쓰지 않는다 |
| 물리 다리(DI provider, 체인·캡슐 전달, 루트 본 월드 변환, 역산 회전 → 보조 본) | 구현됨 | `render/babylon-physics-bridge.test.ts`(15: 모의 provider) | 미검증(실제 builtin-pbd/rapier와 결합한 장면) | `solver().boneRotations`가 있으면 그 월드 회전, 없으면 입자 위치에서 같은 식으로 계산. unavailable·초기화 실패·receipt 실패는 `LabFailure` |
| HUD(프레임 ms·p95·GPU ms·드로 콜·삼각형·backend·어댑터·물리·셰이딩) | 구현됨 | 엔진 테스트, `render/frame-stats.test.ts`(4) | **미검증**(GPU 타이머) | GPU 타이머 미지원이면 `gpuFrameMs=null`과 사유(`sceneFeatures().gpuTimer`). NullEngine은 어댑터 라벨 `NullEngine` |
| GLB export(morph·스킨·targetNames 보존, `glTF` magic 검증) + **dense morph → sparse 정리** | 구현됨 | 엔진 테스트(절차), 패키지 테스트, `render/glb-sparse-morph.test.ts`(10), `render/babylon-glb-sparse-export.test.ts`(6: **Orion 내보내기 12.36 MB → 3.61 MB**, 정리본을 dense로 풀면 Babylon morph 변위와 1e-5 안에서 같음·멱등) | **소프트웨어 렌더러(SwiftShader) 실측**: 기본 절차 캐릭터 3.12 MB → 2.15 MB(sparse 222·전부 0 36·dense 유지 372), 246 ms, 입 안 마스크가 baseColor 텍스처 1장으로 내보내짐. **외부 뷰어(three.js·Blender 등)에서 sparse가 열리는지는 미검증** | 같은 장면 두 번 export는 같은 바이트. Babylon serializer는 morph를 dense로 쓴다 → 사후 처리(순수 모듈)가 변경 정점이 적은 morph만 glTF 2.0 core sparse accessor로 바꾼다. **한계**: 변경 정점이 많으면(헤어·눈 등 Orion의 26개, 변경 정점 15 % 평균) sparse가 더 커서 dense로 둔다. 전부 0인 accessor는 bufferView 없는 accessor로 바꾼다. 이미 sparse이거나 bufferView를 공유·외부 buffer·확장 사용 등은 건너뛰고 사유를 보고(`sceneFeatures().glbMorphSparse`). **발견·수정**: ①입 안 마스크(RawTexture)가 있으면 readback 없는 NullEngine에서 직렬화가 끝나지 않아 → readback 없는 레인에서만 마스크를 잠시 떼고 내보냄(GPU 레인은 텍스처로 포함, 실측), ②**툰 모드(ShaderMaterial)에서 내보내면 serializer가 "Unsupported material"로 14개 재질을 모두 기본 재질로 내보내던 결함**(실브라우저 경고로 발견) → 내보내는 동안만 파츠의 PBR 재질로 바꿨다 되돌린다(NodeMaterial 툰·OpenPBR도 같음, `babylon-render-integrations.test.ts` 2건. 내보내는 동안 뷰포트가 PBR로 보인다) |
| NullEngine 하네스 | 구현됨 | `render/testing/null-engine-harness.ts`가 모든 `babylon-*.test.ts`의 진입 | — | 테스트가 `render/babylon/**`에 닿는 유일한 문(`architecture.test.ts` 예외). 모의 readback·톤맵 상수·`pickStats` 재export. **이번 갱신**: 능력 덧씌우기(`webGLVersion`·`supportIBLShadows`·`textureFloatRender`·morph 텍스처 층 한계·`isWebGPU`), 가짜 IBL, 베타 로더 주입, UV 렌더러 모의 readback, CPU 스키닝·NodeMaterial 그래프 해석기. 덧씌운 능력은 GPU 능력이 아니라 게이트·수명 배선 검증용이다 |
| ViewportPane(캔버스 등록, 크기, HUD, 프레이밍 3종, 관절 핸들 SVG, 드로잉 오버레이) | 구현됨 | `app/shell/panels/ViewportPane.test.tsx`(29, jsdom), `viewport-interactions.test.ts`(12), `render/viewport-math.test.ts`(6) | **미검증**(실제 캔버스·포인터·카메라 조작) | 핸들 화면 좌표가 Babylon 실제 투영과 일치함을 3개 시점에서 확인. 핸들은 포인터 전용(키보드 대안은 PosePanel) |
| 관절 드래그 → `pose/set`(scope `full`) | 구현됨 | 같은 파일(부모 관절 피벗, 45° 드래그의 FK 목표 오차 <3 mm, 제한 클램프 보고, 취소·Escape·언마운트 복원) | 미검증 | 드래그 중 `engine.applyPlan` 미리보기, **놓을 때 1회** dispatch(1 드래그 = history 1단계). 스켈레톤 포트가 없으면 비활성 + 사유 |
| 모델 위 드로잉(`createPointerPaintDriver`·`clientToNdc`·`normalizePointerPressure`) | 구현됨 | 같은 파일(pick→스트로크→`updatePaintTexture`→`paint/stroke` 토큰 1개, 취소 시 되돌림, 활성 부위 밖 안내) | 미검증 | 드로잉 모드에서는 카메라 조작이 꺼진다(오버레이가 포인터를 가로챔). 투영 페인트(베타)가 켜져 있으면 스트로크마다 `projection-paint-driver`가 투영 경로를 고른다(아래) |
| RenderPanel(모드·품질 프리셋·톤맵·그림자·후처리(TAA/SSAO 베타)·IBL·툰 옵션, **베타 기능 4종 토글**, 기능 가용성 표(기본 9행) + 확장 능력 표, HUD 표) | 구현됨 | `app/shell/panels/RenderPanel.test.tsx`(30, jsdom: 베타 라벨·체크박스 키보드 포커스·`aria-describedby`·비활성+사유·처리 중 `aria-busy`·결과 알림 `aria-live`·실패/대기/미지원 문구·레시피 dispatch 없음) | 미검증(실제 키보드 Space·스크린리더) | IBL 세기는 놓을 때 1회 dispatch. 엔진이 못 켠 기능은 '사용 불가 + 사유'로 표에 남는다. 베타 토글은 레시피에 저장되지 않는다(엔진 세션 상태) |

## 4. 공개 API(요약)

- 진입점: `createBabylonCharacterEngine(options): Promise<CharacterEngine>`(`CharacterEngineFactory`), `BabylonCharacterEngine.create(deps)`(주입 엔진).
- `CharacterEngine` 포트 전체(`loadSource`·`applyPlan`·`setShading`·`setCamera`·`setPhysicsProvider`·`settle`·`renderThumbnail`·`renderPasses`·`pick`·`jointHandles`·
  `updatePaintTexture`·`exportGlb`·`readHud`·`resize`·`dispose`) + `thumbnailSources = true`.
- 보고 포트(구조적): `sceneFeatures()`·`viewportCamera()`·`poseSkeleton()`·`inspectRig()`·`inspectScene()`·`inspectPaint()`·`readBone(name)`·`planDigest()`·`physicsReceipt(poseHash)`·`pendingColliderBones()`·`sourceNotes()`.
- 베타·확장 포트(구조적, `render/beta-features.ts`·`render/projection-paint.ts`): `betaFeatures(): Record<BetaFeatureId, {status, requested, supported, reasonKo?, detail?}>`,
  `setBetaFeature(id, enabled): Promise<BetaFeatureState>`(id: `nodeMaterialToon`·`iblShadows`·`openPbr`·`uvProjectionPaint`; 알 수 없는 id는 한글 LabFailure `beta-unknown`),
  `projectionPaint(): ProjectionPaintPort | null`(`begin`·`setBrush`·`stamp(ndc)`·`flush()`·`cancel`). `sceneFeatures()`는 기본 9개 + `nodeMaterialToon`·`iblShadows`·`openPbr`·`uvProjectionPaint`·`jointOffsets`·`glbMorphSparse`를 돌려준다.
  상태 규칙: 지원 안 함 → `supported=false`·한글 사유(요청해도 켜지지 않고 `unavailable`), 모드 불일치(툰 전용을 PBR에서 켬 등) → `off`+`requested`+사유("대기"), 만들다 실패 → `unavailable`+사유(자동 재시도 없음, 다시 켜면 재시도).
- 순수 모듈: `selectBackend`·`probeGpu`, `initializeEngine`·`createPartialDisposer`·`createLostReporter`, `resolveFraming`, `buildPoseFrameSkeleton`·`readPoseSkeleton`,
  `pixelRay`·`unprojectToViewPlane`·`projectToPixel`, `raycastTriangles`·`computeGroupBoxes`, `createFeatureReport`·`readSceneFeatures`, `packDepthRgba8`, `MATERIAL_PRESETS`,
  `evaluateToon`·`normalizeToonLighting`(툰 CPU 기준식), `mapPresetToOpenPbr`, `sumJointOffsets`, `describeMorphTextureMode`, `generateMouthMask`, `sparsifyGlbMorphTargets`, `waitUntilReady`.
- 용어: 요청서의 `ToonParams`는 `render/toon-reference.ts`의 `ToonParams`(= `ToonUniformValues` 별칭)이고, `PbrParams`는 `MaterialPresetParams`(`render/material-presets.ts`)다.
- 패널 지원: `viewport-interactions`의 `jointLabelKo`·`visibleHandles`·`resolveDragPivot`·`computeJointDrag`·`hudRows`, `projection-paint-driver`의 `createSwitchingPaintDriver`·`createProjectionStrokeDriver`·`compositeOverlayTiles`·`brushBitmapFor`.

## 5. 이번 세션에서 발견·수정한 결함(NullEngine 테스트로 재현·고정)

1. `part.pbr.decalMap` null 가능성 타입 오류(typecheck) → 플러그인 getter가 지연 생성하므로 가드를 두고 켠다.
2. **pick이 bind 포즈를 맞춤**(위 표) → 자체 스킨 반영 레이캐스트로 교체, `pickDirty` 플래그 제거(내용 스냅샷 비교).
3. **ShaderMaterial 해제가 공유 텍스처(white·clear·SDF·페인트)를 함께 파괴**(`dispose(true, true)`) → 소스 재로드·임시 리그 해제 때 툰 재질이 죽은 텍스처를 쓰게 되던 결함 → `forceDisposeTextures=false`.
4. TAA를 지원하지 않는 엔진에서 '활성'으로 거짓 보고하고 dispose가 던짐 → 능력 확인 후 사유 보고. SSAO2도 다중 렌더 타깃·`texelFetch` 확인 추가.
5. PrePassRenderer 미지원 엔진에서 `enablePrePassRenderer()`가 콘솔 오류를 내던 것 → 능력 확인 후 사유만 남김.
6. 뷰포트 카메라 위치가 다음 렌더 전까지 이전 값 → 구면 좌표에서 직접 계산.
7. 썸네일이 주 리그에 플랜을 적용한 채 비동기 readback을 기다리고(뷰포트 깜빡임), 마지막 플랜이 없으면 되돌리지 않고, 캡처가 겹치면 서로 오염되던 결함 → 스냅샷 복원 + 동기 적용 구간 + 직렬화.
8. 이전 작업자 테스트 2건의 오류(`-0` 비교, 2×2 래스터 길이 16)를 바로잡았다.

### 실브라우저(Chrome 151 + SwiftShader WebGL2)에서 발견·수정한 결함 — NullEngine이 놓친 것

9. **PBR lit 패스·뷰포트·썸네일이 완전 투명**(불투명 픽셀 0). 원인 두 가지: ①IBL 큐브 텍스처를 임시 프로브 장면에 만든 뒤 그 장면을 해제해 텍스처가 파괴됐고(`_texture` null) 환경 텍스처를 쓰는 모든 PBR 재질이 `isReady=false`로 영원히 그려지지 않았다 → IBL을 **최종 장면**에 만든다(`create()`가 장면을 먼저 만든다), 생성 뒤 준비 상태를 확인한다. ②캡처가 `forceCompilationAsync`(임시 서브메시 컴파일)로 약 1.2초에 돌아왔지만 실제 렌더 변종은 미준비였다(SwiftShader에서 PBR 한 변종 약 10초) → **실제 `material.isReady(mesh)`를 폴링**(`material-readiness.ts`)하고 90초 안에 안 되면 `capture-shader-timeout` LabFailure로 알린다. 모든 재질(PBR·툰·OpenPBR·NodeMaterial)이 대상이다.
10. 피부 SSS 재질이 PrePass 없는 캡처 RTT에서 **검게** 나옴 → lit 패스(와 준비 폴링)만 SSS를 끈 변종으로 처리하고 동기 구간 뒤 되돌린다(`withScatteringOff`, PBR `isScatteringEnabled`·OpenPBR `subsurfaceWeight`). 뷰포트는 SSS 그대로.
11. Babylon 9.19 `SubSurfaceConfiguration.addDiffusionProfile`이 (r,b,g)로 저장하고 (r,g,b)로 중복 검사 → g≠b인 확산 프로파일은 재질을 만들 때마다 새 프로파일로 등록돼(최대 5개) 초과하면 `console.error`가 **113회** 폭주 → 프리셋 프로파일을 g==b(`[0.75, 0.22, 0.22]`)로 둔다(g==b 불변식 테스트).
12. 툰 과노출(피부·흰 상의가 흰색) → 광원+환경 합 정규화(위 툰 행).
13. 절차 메시 감김 방향(위 장면 행): 툰 림이 배에 번지고 법선 패스 B 채널이 0이던 것이 앞면 컬링 문제였다.
14. **NodeMaterial 툰이 셰이딩 프로파일 변경(램프 단계·림·얼굴 SDF)을 따라가지 않던 결함** — 만들 때만 값을 넣고 `setShading`이 NodeMaterial에는 값을 넣지 않았다. NullEngine 테스트(`툰 파라미터 변경`)가 잡아 수정했고 SwiftShader에서 램프 4단 픽셀 차이 0으로 확인했다. (이전 실측에서 본 3 % 픽셀 차이는 재질 차이가 아니라 **두 캡처 사이에 헤어 물리가 움직인 것**이었다 — 정상 상태 캡처끼리는 차이 0.)
15. 입 안 마스크(RawTexture)가 추가된 뒤 **readback이 없는 NullEngine에서 GLB 내보내기가 끝나지 않던 결함**(기존 export 테스트 2건이 30초 타임아웃) → 그 레인에서만 마스크를 잠시 떼고 내보낸다(GPU 레인은 baseColor 텍스처로 포함, SwiftShader 실측).
16. morph 능력 보고의 활성 타깃 수가 `numInfluencers`(attribute 모드에서 8로 잘림)라 8개 초과분이 무시된다는 사실을 알릴 수 없었다 → influence>0 개수로 센다(테스트 `활성 타깃 11개 중 3개는 무시`).
17. 베타 재질이 준비되지 않은 채 메시에 끼워지면 Babylon이 그 메시를 그리지 않아 캐릭터가 사라진다(OpenPBR은 외부 노이즈 PNG를 못 받으면 영원히 미준비) → 컨트롤러가 준비를 기다린 뒤에만 끼우고 시간 초과 시 `unavailable`+사유로 보고하며 재질을 해제한다(주입 로더로 테스트). **실브라우저에서 이 대기 자체가 거짓 양성이던 것도 발견·수정**: 아직 끼우지 않은 재질을 진짜 메시로 `isReady`하면 그 메시의 서브메시가 이전 PBR의 효과·defines를 들고 있어 true가 나온다(8초 만에 "활성") → 숨긴 복제 메시로 검사한다(복제는 서브메시 상태가 비어 있다). 스텁 없는 실측: 101초 뒤 `unavailable`, 재질·메시 수 원상복구, 캐릭터 유지.
18. **GLB 내보내기가 보는 셰이딩 모드를 따르던 결함**: 툰 모드에서 내보내면 ShaderMaterial을 serializer가 지원하지 않아("Unsupported material 'toon:*'" 경고 14건) 재질이 전부 기본값으로 나갔다 → PBR 재질로 내보낸다(위 GLB 행).

## 6. 스펙 대비 미구현·축소와 이유

격차를 1차·2차로 나누지 않고 요청한 범위를 모두 구현했다. 아래는 **구현했지만 실제로는 할 수 없는 부분**과 검증 한계다.

- NodeMaterial 툰: 구현(베타). 한계: WGSL 경로는 NullEngine에서 코드 문자열 생성까지만 확인했고(WebGPU 어댑터가 소프트웨어라 실제 컴파일 불가) 실제 WebGPU 컴파일은 미검증. 외곽선은 재질과 무관한 기존 경로.
- IBL Shadows: 구현(베타). 한계: 툰 재질은 그림자를 받을 수 없다(툰 모드에서는 대기). 청색 노이즈 PNG를 외부에서 받는다(이 컨테이너는 외부가 막혀 playwright 라우트로 대체해 실측). 실GPU 그림자 품질·스킨/morph 복셀화 정확도 미검증.
- OpenPBR: 구현(베타). **페인트 데칼은 불가**(OpenPBRMaterial에 decalMap 플러그인이 없다 — 이 모드에서는 그린 페인트가 보이지 않는다). SSS는 근사. 노이즈 PNG 외부 요청.
- 투영 페인트: 구현(베타). **불가·한계**: GPU readback이 없는 NullEngine 불가, 읽는 동안 새 스트로크 거절, 겹침 블렌딩은 sRGB 공간이라 CPU 선형 합성과 미세 차이, 얇은 부위 반대편은 안 칠함, UV 랩 모드 없음. `MeshUVSpaceRenderer` 셰이더 파일(GLSL·WGSL) 비동기 로드는 스탬프 큐로 처리.
- 체형 morph 관절 오프셋·머리 morph 한계 보고·입 안 어둡게·GLB sparse: 구현. GLB sparse는 변경 정점이 많은 morph를 dense로 유지(Orion 12.36 → 3.61 MB, 요청서 "13 → 약 4 MB"에 대응하는 이 환경 실측).
- 셰이더(GLSL·WGSL)·후처리·IBL·SSS·CSM의 **실GPU 렌더 결과**: 검증 불가(실GPU 없음). SwiftShader 실측은 존재·상대 비교·콘솔 오류까지.
- 관절 핸들의 키보드 조작: 없음(수치·IK 입력은 PosePanel).
- 자동 대체 없음: 어떤 베타도 지원하지 않는 엔진에서 다른 경로로 바뀌지 않는다(능력 게이트 + 사유).

## 7. 검증 기록(2026-10-02, render-beta 작업자 실측)

### 7.1 Node(명령·결과)

| 명령 | 결과 |
| --- | --- |
| `pnpm --filter @toonstudio/character-lab typecheck` | 오류 0 |
| `pnpm exec vitest run apps/character-lab/src/render apps/character-lab/src/app/shell/panels/RenderPanel.test.tsx apps/character-lab/src/architecture.test.ts apps/character-lab/src/app/render-humanoid-link.integration.test.ts apps/character-lab/src/app/shell/panels/{projection-paint-driver,ViewportPane}.test.*` (루트 설정) | 42파일 / 465케이스 통과(렌더 36파일 356케이스 + RenderPanel 30 + ViewportPane 29 + 투영 드라이버 23 + 연결 7 + architecture 20) |
| `pnpm --filter @toonstudio/character-lab exec vitest run src/render src/app/shell/panels/RenderPanel.test.tsx src/architecture.test.ts …`(앱 설정, 같은 대상) | 42파일 / 465케이스 통과 |
| `pnpm exec vitest run apps/character-lab/src/app apps/character-lab/src/paint apps/character-lab/src/state` (회귀 확인) | 51파일 / 382케이스 통과(app·paint·state 전체) |
| `pnpm exec eslint --max-warnings=0 apps/character-lab/src/render apps/character-lab/src/app/shell/panels/{RenderPanel,ViewportPane}.tsx apps/character-lab/src/app/shell/panels/projection-paint-driver*.ts apps/character-lab/src/app/render-humanoid-link.integration.test.ts` | 오류 0 · 경고 0(import-x/order 포함, `--fix` 적용) |
| `pnpm --filter @toonstudio/character-lab build` (최초 1회 + 준비 대기 수정 뒤 재확인 1회, 둘 다 성공) | 성공(약 3초, 청크 352개·dist 25 MB). **동적 분리 유지**: 진입 청크 `index-*.js`(945 kB)에는 Babylon 엔진·NodeMaterial·OpenPBR·IBL 그림자 코드가 없고(문자열 라벨만) `ThinEngine` 0건, 엔진 청크 `babylon-character-engine-*.js`(881 kB, 베타 컨트롤러·투영 페인트 포함 +약 18 kB)가 `import()`로만 로드된다. 베타 무거운 모듈은 별도 지연 청크: `node-toon-material-*.js`(200 kB), `ibl-shadows-*.js`(78 kB), `openpbrMaterial.pure-*.js`(93 kB)+`openpbr.fragment-*.js`(88–90 kB). `@babylonjs/serializers`(GLB)는 기존대로 별도 청크 |
| `CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs --software --backends webgl2 --require-ready webgl2` (char-core 프로브, 빌드 뒤) | 통과 10 · 실패 0: WebGL2 ready(SwiftShader), 썸네일 6개 failed 0, **PBR lit 투명 PNG 면적 12.6 %·툰 13.3 %**(모서리 알파 0), 슬롯 클릭=history 1단계, pageerror 0 |

### 7.2 소프트웨어 렌더러(SwiftShader) 실측 — 실GPU 증거가 아니다

환경: Chrome 151(Chrome for Testing) headless, `--use-angle=swiftshader`, **WebGL2 명시 선택**(adapter: ANGLE Vulkan SwiftShader), Babylon 9.19.0, vite dev(앱 `composeCharacterLab` 직접 구동), 캡처 256×384·투명 배경·`settleSteps 0`. 스크립트는 저장소 밖(scratch)에 있고 재현은 아래 §8 절차로 한다. assets.babylonjs.com은 이 샌드박스에서 막혀 OpenPBR·IBL 그림자의 노이즈 PNG는 playwright 라우트로 임의 64² PNG를 대신 준 경우만 "스텁"이라 표기한다.

| 항목 | 수정 전 | 수정 후 실측 |
| --- | --- | --- |
| PBR lit 불투명 픽셀 | **0**(완전 투명) | **11,440 px**, 평균 휘도 125.0 (flat 11,440 px·163.3) |
| 툰 lit | 10,277 px(char-core 실측), 피부·상의 흰색 과노출 | **11,440 px**, 평균 휘도 158.1 (flat 11,440 px·163.3) |
| `diffusion profiles` console 오류 | 113회 | **0** |
| 첫 PBR 캡처 시간 | (투명이라 의미 없음) | 3.3 s(셰이더 컴파일 포함), 이후 수백 ms |
| NodeMaterial 툰(스텁 불필요) | — | 빌드 5.5 s·120블록 GLSL, 기본 툰 대비 **0/11,440 px 차이**(램프 3·4단) |
| OpenPBR(스텁) | — | 빌드 8.9 s(게이트 포함 15.6 s), lit 11,440 px·평균 휘도 124.6, 기본 PBR과 12.6 % 픽셀이 >8/255 다름 |
| IBL 그림자(스텁) | — | 생성 7.5 s, 재복셀화 1회, 켠 화면이 끈 화면과 759 px(최대 69/255) 다름, 끄면 원래와 같음 |
| 투영 페인트 | — | 스탬프 10회 모두 CPU pick UV에 알파 255(거리 0 px), 이음매 반대편 섬에도 칠함, 알파 128→192→224, 첫 스탬프 1.0–1.4 s·이후 20–40 ms |
| GLB 내보내기(기본 절차 캐릭터) | — | 3.12 → 2.15 MB, 246 ms, 입 안 마스크 이미지 1장 포함 |
| 머리 morph 텍스처 모드 | — | 54타깃 텍스처 모드·층 한계 2048·합계 약 3.3 MB |

**외부 요청이 막힌 실제 상황(스텁 없음)**: OpenPBR은 노이즈 텍스처가 영원히 오지 않아 재질이 준비되지 않는다. 이전 구현은 준비 대기가 **진짜 메시로 검사해 거짓 양성**(이전 PBR 서브메시 상태)이 나와 8초 만에 "활성"으로 보고하고 캐릭터가 사라졌다 → 숨긴 복제 메시로 검사하도록 고쳤다. 수정 뒤 결과는 **101초 뒤 `unavailable` + 한글 사유**("OpenPBR 재질이 90초 안에 준비되지 않았습니다(미준비 14개) … 외부 텍스처를 받지 못했을 수 있습니다"), 재질은 기본 PBRMaterial 그대로(OpenPBR 0개 남음·복제 프로브 정리로 메시 수 불변), 이후 lit 캡처 11,440 px로 **캐릭터가 사라지지 않음**, 끄면 `off`.

Node 22·4코어 CPU에서 NullEngine으로 잰 참고 수치(GPU 시간 아님): Orion 로드 약 260 ms(14,604 삼각형), 첫 pick(메시 9개 스키닝) 약 25 ms,
캐시된 pick 평균 0.49 ms, 포즈 변경 뒤 첫 pick 약 6 ms, 6패스 합성 캡처(256²) 약 114 ms, 현재 리그 썸네일(128²) 평균 약 22 ms, 임시 소스 썸네일 평균 약 18 ms.
Orion GLB 내보내기(NullEngine): sparse 정리 전 12.36 MB → 후 3.61 MB(변경 정점 15 %, sparse 166·dense 유지 26·건너뜀 0, 약 380 ms).

### 7.3 브라우저 미검증(실GPU·WebGPU·외부 도구·사용자 입력 필요)

- 실GPU·WebGPU 렌더 품질 전반(PBR·툰·SSS·그림자·후처리·IBL), WGSL(NodeMaterial·툰 셰이더) 실제 컴파일.
- IBL Shadows의 실제 그림자 품질·스킨/morph 복셀화 정확도·실제 노이즈 텍스처 수신. OpenPBR의 실제 노이즈 텍스처 수신 시 결과.
- 투영 페인트: 실GPU·WebGPU 결과, `ViewportPane` 포인터 흐름(누르기→이동→놓기→반영→되돌리기) 통합.
- 체형 관절 오프셋: 본 텍스처·morph 텍스처 정점 셰이더로 그린 메시 자체의 직접 비교(UV 렌더러 투영의 간접 일치만 확인).
- GLB sparse를 외부 뷰어(three.js·Blender)가 여는지. 입 안이 화면에서 실제로 어두운지의 시각 확인.
- RenderPanel의 실제 키보드(Space)·스크린리더 조작(jsdom 단위만).

## 8. 브라우저 검증 절차(실GPU 환경, 통합 후)

**A. 이 컨테이너 같은 소프트웨어 렌더러에서의 재현(SwiftShader, 실GPU 증거 아님)**

1. `pnpm --filter @toonstudio/character-lab build` 뒤 `CHARACTER_LAB_BROWSER_PROBE=1 CHARACTER_LAB_CHROMIUM_PATH=<chrome> node apps/character-lab/scripts/browser-probe.mjs --software --backends webgl2 --require-ready webgl2 --out <json> --shots <dir>` — PBR·툰 lit 투명 PNG 면적(≥1.5 %)이 통과해야 한다(PBR이 완전 투명이면 여기서 실패).
2. 개별 수치(§7.2)는 vite dev(`pnpm exec vite --port 4186`)를 띄우고 playwright(Chromium, `--use-angle=swiftshader`)에서 `composeCharacterLab({ subdivisionLevels: 0 })`로 엔진을 만든 뒤 `engine.renderPasses({ width: 256, height: 384, passes: ["flat","lit"], transparentBackground: true, settleSteps: 0 })`의 불투명 픽셀·평균 휘도를 센다. 베타는 `engine.setBetaFeature(id, true)` 뒤 같은 캡처를 비교한다. 외부 요청이 막힌 환경에서 OpenPBR·IBL 그림자는 `page.route("https://assets.babylonjs.com/**", …)`로 PNG를 대신 주면 켜진다(주지 않으면 OpenPBR은 90초 뒤 '사용 불가' + 사유가 정상이다).
3. 첫 `import()`가 새 Babylon 서브패스를 만나면 vite가 의존성을 다시 최적화하며 페이지를 새로 고친다 — 스크립트를 다시 실행한다.

**B. 실GPU(WebGPU·WebGL2) 확인 항목**

1. `pnpm dev:character-lab` → Chrome 113+에서 [WebGPU] 선택 → TopBar 배지·HUD에 backend `webgpu`·어댑터가 뜨는지, 그림자·SSS·IBL 상태가 RenderPanel 표에 '활성'인지.
2. [WebGL2] 선택 → 같은 항목, WebGPU 실패 시 자동으로 WebGL2가 만들어지지 **않는지**(실패 배너만).
3. 썸네일: 헤어 7장이 서로 다른 실루엣인지, 생성 중 뷰포트가 깜빡이지 않는지, 해제 후 메모리가 늘지 않는지.
4. 캡처: 투명 PNG 알파 가장자리(premultiply), 깊이·ID 패스의 행 순서(위아래 뒤집힘 없음) — `RTT_READBACK_FLIP_Y`·`RTT_READBACK_PREMULTIPLIED` 상수 확정.
5. 툰 모드: 셰이더 컴파일 오류 없음, 램프·림·얼굴 SDF 그림자·hull/edge 외곽선, PBR↔툰 전환, 피부·상의가 과노출이 아닌지.
6. 드로잉: 포즈를 바꾼 뒤에도 클릭한 표면에 칠해지는지(UV 방향·`invertY`), decal 합성 색.
7. 관절 핸들: 드래그가 손을 따라가는지, 제한에서 멈추는지, 1 드래그 = 실행 취소 1단계인지.
8. GLB: export한 파일이 외부 뷰어에서 스킨·morph(sparse 포함)로 열리는지, 입 안 마스크가 baseColor로 보이는지.
9. **베타 기능(RenderPanel '베타 기능')**: 각 체크박스를 Tab·Space로 켜고 끄며 상태 문구(활성/대기/사용 불가+사유)가 바뀌는지.
   - NodeMaterial 툰: 툰 모드에서 켜서 기본 툰과 육안 동일한지(WebGPU면 WGSL 컴파일 오류 없음), 램프 단계·림 변경이 따라가는지.
   - OpenPBR: PBR 모드에서 켜서 피부·헤어·의상이 기본 PBR과 크게 다르지 않은지, **페인트가 안 보이는 것이 정상**임을 확인, 네트워크 차단 시 90초 뒤 '사용 불가'.
   - IBL 그림자: PBR 모드에서 켜서 발밑·턱·팔 아래 그림자가 생기는지, 포즈를 바꾸면 그림자가 따라오는지(재복셀화 최소 250 ms), 툰 모드에서는 '대기'.
   - 투영 페인트: 드로잉 모드에서 켜고 팔을 든 포즈의 팔·몸에 칠해지는지, 이음매를 가로질러도 끊기지 않는지, 한 스트로크 = 되돌리기 1단계인지, 읽는 동안 새 스트로크가 거절되며 안내가 뜨는지.
10. 체형 슬라이더(팔 길이 등)를 올리고 팔꿈치를 굽혔을 때 팔이 찢어지지 않는지(관절 오프셋), 입 안이 어두운지.
결과는 `docs/shaper-parity-checklist.md` '브라우저 검증' 열에 날짜·기기·backend와 함께 기록한다(미실행 항목은 '미검증' 유지, 소프트웨어 렌더러 결과는 "소프트웨어 렌더러(SwiftShader) 실측"으로 정직 표기).

## 9. 다른 작업자·core에 전달

- `src/architecture.test.ts`에 한 줄 보정을 적용했다: 엔진 진입점(`render/babylon-character-engine.ts`)은 청크 경계라 `render/babylon/**`를 정적 import하는 유일한 Node 파일이므로 "Node 모듈은 browser 모듈을 정적 import하지 않는다" 규칙에서 제외했다.
- `thumbnailSources`·`ThumbnailRequest.source`는 구현했다. `source/capabilities` 이벤트는 엔진이 직접 emit하지 않고 `app/shell/apply-loop`가 `loadSource`가 돌려준 능력 맵으로 보고한다(엔진 → 스토어 직접 채널 없음). 엔진은 절차 소스에 `ALL_AVAILABLE_CAPABILITIES`, 패키지에 `plan.capabilities`를 돌려준다.
- 리뷰 결함 수정(2026-10-02): `loadSource`는 캡처와 같은 큐(`runExclusive`)에서 한 번에 하나만 실행한다(겹치면 앞 리그가 해제되지 않고 누수). 물리 브리지는 `setProvider`·`bindRig`가 체인을 거부하면 provider를 해제하고 비활성으로 되돌리며(반쯤 초기화된 상태 금지), 프레임 중 스텝 오류는 물리를 중단하고 렌더 루프는 유지한다. 엔진을 계속 쓸 수 있는 이런 비치명 실패(`physics-step-failed`·소스 로드 뒤 `physics-chains-rejected`)는 계약 `EngineFactoryOptions.onFailure`(선택, core 계약에 additive 1필드)로 앱에 올리고 `engine-session`이 `failure` 이벤트로 바꾼다. 브라우저(GPU)에서의 확인은 미수행이다.
- 계약상 `EngineBackend`에 `null`이 없어 NullEngine은 진단 backend를 `webgl2`로 표기하고 HUD 어댑터 라벨 `NullEngine`·캡처 provenance `backend="null"`로 정직하게 구분한다.
- 뷰포트 CSS는 core가 이미 `cl-viewport-*`·`cl-render-*`를 넣었다. 구조적 배치(position·inset·pointer-events)는 패널이 인라인으로 가진다.
- 베타 토글은 `ShadingProfile`(core 동결 strict 계약)에 필드를 더하지 않고 엔진 세션 상태로 둔다. 레시피·히스토리·저장 파일에 들어가지 않으며 엔진을 다시 고르면 꺼진다. 영구 저장이 필요하면 core가 계약을 바꿔야 한다.
- 투영 페인트 드라이버는 `app/shell/panels/projection-paint-driver.ts`에 있고 `ViewportPane`은 드라이버 생성 한 곳만 바꿨다(`createSwitchingPaintDriver`). paint 도메인 코드는 수정하지 않았다 — `session.applyToken`이 돌려주는 역토큰을 `paint/stroke` 토큰으로 쓴다.
- `render/testing/null-engine-harness.ts`에 능력 덧씌우기(`capabilities`)·가짜 IBL·베타 로더 주입 등을 더했다. 덧씌운 능력은 게이트·수명 검증용일 뿐 GPU 능력이 아니다.
- 이전 렌더 커밋의 파일을 최소한으로 수정했다: `character-engine.ts`(베타 배선·IBL 소유권·준비 대기), `capture.ts`(준비 폴링·SSS 끈 lit), `mesh-binding.ts`(CCW·관절 오프셋), `character-rig.ts`(관절 오프셋 적용·스냅샷), `glb-exporter.ts`(sparse 정리), `pick-and-paint.ts`·`skinned-pick.ts`(삼각형 반환), `lighting/ibl.ts`(준비 확인), `material-presets.ts`(g==b), `rig-inspection.ts`(감김 방향). 기존 테스트는 모두 통과한다.
