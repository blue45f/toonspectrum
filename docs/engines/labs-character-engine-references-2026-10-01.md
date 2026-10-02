# character-lab 캐릭터 엔진 참고 문헌 원장 — 2026-10-01

- 상태: **현재(참고 문헌·라이선스 판정 원장)**. 기법별 구현 상태는 표의 `단계`(MVP / Beta / Later)와 character-lab 패리티 체크리스트가 권위다.
  2026-10-01 현재 `apps/character-lab/src/`에는 `contracts/`·`shared/`·`testing/`·`app/shell/`이 작성돼 있고 나머지 모듈은 작업 중이며
  브라우저 실기기 렌더는 검증되지 않았다.
- 출처: 2026-10-01 연구 워크플로우 종합(채택 기법 27건, 참고 코드 47건, 논문 66건, 라이선스 경고 14건, 수치 목표 15건)과 2026-09-30 정찰·물리 설계 보충.
  엔진 선택의 근거는 [엔진 대안 비교 보고서](../reports/character-lab-engine-alternatives-2026-10-01.md), 결정의 권위는
  [ADR-0026](../adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)이다.
- 사용 규칙: 참고 코드는 개념·수식만 가져오고 코드를 복제하지 않는다. MIT/Apache/BSD/CC0는 출처 주석과 함께 재구현할 수 있다.
  GPL/AGPL/LGPL 코드와 비상업 모델은 열람·복제하지 않는다.

## 0. 상충 기법의 선택과 근거

| 주제 | 후보 | 채택 | 근거 |
| --- | --- | --- | --- |
| 엔진 | Babylon.js 9.19 / three.js / PlayCanvas | **Babylon.js 9.19**(exact pin 존재) | WebGPU 엔진·MorphTargetManager 텍스처 모드·BoneIKController·MRT·TAA·glTF serializer를 한 패키지(Apache-2.0)로 제공 |
| 바디 기준 메시 | CC0 MakeHuman 토폴로지(Anny 경로) / 순수 절차 메시 | **순수 절차 메시** | 외부 에셋 0, 토폴로지 고정으로 morph target 호환. CC0 에셋 도입은 ADR로만 재결정 |
| 체형 케이지 좌표 | MVC / Harmonic / Green | **MVC 1차**, 나머지는 같은 인터페이스의 교체 옵션 | 폐형식이라 Node에서 결정적 테스트 가능 |
| 자동 웨이트 | 캡슐 거리 / 열 확산 / BBW | **캡슐 거리(MVP) → 열 확산(Beta) → BBW(Later)**, 전부 베이크 | QP 솔버의 WASM 비용·비결정성 회피 |
| 스키닝 | LBS / DQS / CoR | **LBS 기본 + DQS 비교**, CoR은 실험 전용 | LBS는 Babylon 기본·glTF 호환, CoR 특허 미확인 |
| IK | two-bone / FABRIK / CCD / Jacobian | **사지=two-bone 해석적, 척추·손가락=FABRIK, 폴백=CCD** | 결정적·즉시 수렴 |
| 피부 | Pre-integrated / Separable SSS / Babylon PrePass SSS | **Pre-integrated 1차**, 나머지 비교군 | 단일 패스·곡률 정점 속성, PrePass는 Frame Graph 혼용 이슈 |
| 주선 | 이미지 공간 G-buffer / 오브젝트 공간 컨투어 | **이미지 공간(멀티패스 Sobel + inverted hull) 1단계** | 멀티패스 계약(`passes.ts`)·PSD 레이어 분리에 직결, CPU 참조 Sobel 패리티 |
| 얼굴 그림자 | 램프만 / SDF 텍스처(외부) / SDF 자동 베이크 | **브라우저 내 JFA 자동 베이크** | 외부 에셋 없이 얼굴형 변경에 즉시 대응 |
| 툰 파라미터 | 독자 / MToon 1.0 / lilToon 전체 | **MToon 1.0 호환 기준선 + 확장 필드** | VRM·외부 뷰어 호환 export |
| AA | FXAA / SMAA / TAA / SSAA | **FXAA(preview) → TAA(hero, 베타)**, 캡처는 TAA 수렴 또는 2× SSAA | 정지 뷰어는 수렴 품질, SSAA는 결정적 |
| 하프톤 | 순위 디더 / 오차 확산 / 구조 보존 | **GPU=블루노이즈 순위 디더, CPU export=Ostromoukhov** | 병렬성과 결정적 CPU 경로 분담 |
| 표정 명명 | 독자 16 FACS / ARKit 52 / VRM 16 | **`facs:` 접두사 + ARKit 52 확장 가능, 프리셋은 VRM 16 + override** | MediaPipe FaceLandmarker 1:1, three-vrm override 규칙 |
| 물리 | Havok / Rapier / Jolt / 자체 PBD | **자체 XPBD(1급) + Rapier(보조) + Havok(미설치 표시)** | cloth·결정성·번들([보고서 §6](../reports/character-lab-engine-alternatives-2026-10-01.md)) |

## 1. 채택 기법(모듈별)

모듈 경로는 `apps/character-lab/src/` 기준이며 스펙의 작업 분할(`contracts`·`state`·`presets`·`humanoid`·`outfit`·`physics`·`animation`·`render`·`paint`·`export`·`authored`·`vision`)을 따른다.

| # | 기법 | 모듈 | 알고리즘 요약 | 주요 출처 | 단계 |
| --- | --- | --- | --- | --- | --- |
| 1 | 절차 휴머노이드 메시 | `humanoid/` (`contracts/params.ts`·`morph-names.ts` 입력) | VRM 55본 스켈레톤을 비율표로 배치 → 관절=구·본=캡슐 스피어-메시 프록시 → 본별 단면 프로파일 `ρ(t,θ)=r(t)(1+e cos2θ)(1+Σa_k cos kθ)`를 N_θ=24 링으로 로프트(고정 토폴로지) → 파라미터 ±1을 `param:<key>:+|-` morph로 베이크 → 관절 위치는 링 정점 가중 평균 → 팔꿈치 접힘은 캡슐 SDF smooth-min 투영 | Hyun 2005 스위프, Thiery 2013 Sphere-Meshes, Vaillant 2013 Implicit Skinning, Anny(Apache-2.0, phenotype 매핑 개념만), Allen 2003 | MVP |
| 2 | 체형 케이지·핸들 편집 | `humanoid/`(deform) | MVC 폐형식 가중치(Worker ≤100 ms, 희소 H를 스토리지 버퍼로 compute `v'=H·c'`), 음수 가중치 >1%면 Harmonic/Green 교체. ARAP(Cholesky 캐시 + local/global 3~5회)은 고급 모드. 결과는 항상 morph 델타로 베이크 | Ju 2005 MVC, Joshi 2007, Lipman 2008, Sorkine 2007 ARAP(libigl은 MPL 파일 단위라 수식만) | Beta / ARAP Later |
| 3 | 얼굴 파라메트릭·표정 | `humanoid/`, `contracts/expression.ts` | 고정 토폴로지 + 선형 델타 공간(`FACE_PARAM_KEYS` 15), 델타 블렌드셰이프 `f=b0+Σw_k(b_k−b0)` + corrective(jawOpen×mouthSmile), override(blink/lookAt/mouth: none/block/blend) 배수, Babylon MorphTargetManager 텍스처 모드 100+ 타깃 | Blanz-Vetter 1999(개념), Lewis 2014, ICT-FaceKit(MIT 명명표), ARKit blendShapeLocation, three-vrm `VRMExpressionManager`(MIT, 알고리즘 이식) | MVP |
| 4 | 스켈레톤·자동 웨이트·스키닝·IK | `humanoid/`, `animation/`, `contracts/bones.ts`·`pose.ts` | T-포즈 55본, 포즈=바인드 기준 로컬 회전만(정규화 리그). 웨이트: 캡슐 거리 `w∝1/(d+ε)^4` 상위 4개 → Pinocchio 열 확산 → BBW. LBS 기본 + DQS WGSL 비교. IK: two-bone 해석적(폴 벡터), FABRIK(원뿔·힌지), CCD 폴백. 손 포즈 = 관절각 프리셋 + 손가락 힌지 CCD | three-vrm humanoid(MIT), vrm-specification(사실만), Pinocchio 2007(라이브러리 LGPL 금지), BBW 2011, Kavan 2008 DQS, FABRIK 2011, fullik·THREE.IK(MIT, 구조만) | MVP / 열 확산 Beta / BBW Later |
| 5 | 헤어·의상 물리 | `physics/`, `contracts/physics.ts`·`physics-chain.ts` | 자체 XPBD: 프레임 1/60, 서브스텝 2(dt 1/120), 거리·굽힘 제약 `Δλ=(−C−α̃λ)/(w1+w2+α̃)`, 캡슐 SDF 충돌, `dragForce`만 감쇠, `+−*/sqrt/fround`만 사용(결정적), settle 120(≤600)스텝 후 캡처, 영수증(모델·포즈 해시·스텝·상태 해시). Rapier는 Worker에서 소품·접지 transform만 bake | XPBD(Macklin 2016)·Small Steps 개념, VRMC_springBone 파라미터 호환(수식만), Rapier 결정성 문서 | MVP / GPU compute Beta |
| 6 | PBR 피부·헤어·IBL·그림자·AO | `render/` | 피부: Pre-integrated LUT(N·L × 1/r), 곡률 정점 속성; Separable SSS(BSD-2, 고지 문구) 비교. 헤어: 절차 리본 카드 + 2로브 Kajiya-Kay(Marschner 근사), 툰은 접선 시프트 하이라이트. IBL: Babylon `.env` + DFG split-sum, 절차 스카이 `HDRFiltering.prefilter`, 툰은 SH만. CSM 2~3 + PCF, hero PCSS, 캡슐 AO(≤24) | Karis 2013, Penner 2011, Separable SSS 2015, Scheuermann 2004, Marschner 2003, Filament(Apache-2.0, 빌딩 블록), glTF-Sample-Renderer(Apache-2.0) | MVP / IBL Shadows·OpenPBR Beta |
| 7 | 하이브리드 툰 | `render/`, `contracts/shading.ts` | MToon 1.0 기준선(`shading=N·L+shift`, `linearstep(−1+toony, 1−toony)`) + 정점색 임계 오프셋·폭·z(GG Xrd 규약), 2D 램프(x=s, y=material-id) + 밴드 인덱스 MRT, fwidth 밴드 AA, 얼굴 SDF, 헤어→얼굴 그림자(개념), NiloCat 아웃라인 폭 보정. `ShaderMaterial`(WGSL·GLSL 2벌) + `OutlineRenderer`, NodeMaterial은 베타 토글 | three-vrm mtoon(MIT), NiloCat(MIT), URPSimpleGenshinShaders(MIT 수 줄), lilToon(MIT, 스키마만), GDC 2015 GG Xrd, Lake 2000, X-Toon 2006 | MVP |
| 8 | 얼굴 SDF 자동 베이크 | `render/`(tools) | 각도별 마스크 → SDF → 인접 쌍 전이 보간 → threshold map. GPU JFA 9패스(512²), CPU EDT 참조 패리티 ≤1/255, 재베이크 ≤100 ms | akasaki1211 sdf_shadow_threshold_map(MIT), Anime-SDF-Gen(GPL, UX 개념만) | MVP |
| 9 | 주선·PSD·PNG·glTF 출력 | `render/`, `export/`, `contracts/passes.ts`·`capture.ts` | 단일 MRT(≤32 B/샘플) flat/lit/normal/depth/part-id/material-id → Sobel 채널 분리(깊이=프로파일, 법선=크리즈, ID=경계) → PSD 레이어(ag-psd `writePsdBuffer`, multiply/screen, 클리핑 마스크, Worker). inverted hull(스무스 법선 압출). PNG: premultiplied 누적 → 저장 직전 un-premultiply → sRGB(`rgba8-straight-srgb`). glTF: `GLTF2Export` → glTF-Transform dedup/prune/weld/quantize → extras 레시피 | Saito-Takahashi 1990, Raskar-Cohen 1999, DeCarlo 2003(rtsc GPL 금지), Bénard-Hertzmann 2019, ag-psd(MIT), glTF-Transform(MIT), kurbo(벡터화), glsl-blend(MIT) | MVP / 벡터화·depth peeling 2단계 |
| 10 | 사진 포즈·참고 이미지 추천·UV 페인트 | `vision/`, `paint/`, `contracts/vision.ts`·`paint.ts` | MediaPipe PoseLandmarker 33 → 본 회전·IK 목표, HandLandmarker 21 → 손가락 힌지, FaceLandmarker 52 → `facs:` 1:1, 1€ 필터. 추천: 코사인 Top-K + 결정적 OKLab k-means(MobileNet V3 임베더, SHA 고정). 페인트: Pointer Events coalesced + 1€ + 64 px 타일 롤백, `RawTexture` 데칼 합성(`MeshUVSpaceRenderer` 베타) | MediaPipe tasks-vision(Apache-2.0, 모델 카드 별도), BlazePose, Transformers.js CLIP(확장, 가중치 보류), Todo 2007 | MVP / CLIP 확장 |
| 11 | WebGPU 플랫폼 규약 | `render/`(engine factory·HUD) | 바인드 그룹 g0 프레임/g1 머티리얼/g2 드로우, 3-deep 스테이징 링, 256 B 정렬, 파이프라인 시작 시 전부 생성, `WebGPUEngine.initAsync` + timeout + `device.lost` → 레시피 JSON 복원, compat 모드 4096 축소(기록), `SceneInstrumentation`·`gpuFrameTimeCounter` p50/p95(100 µs 양자화 전제) | toji.dev, WebGPU Fundamentals, MDN 한도표, Babylon 공식 문서(Apache-2.0) | MVP |

## 2. 참고 코드와 라이선스 판정

| 저장소 | 라이선스(확인일) | 활용 방식 | 참고 범위·비고 |
| --- | --- | --- | --- |
| BabylonJS/Babylon.js | Apache-2.0(2026-10-01) | 직접 의존·출처 표기 후 활용 | 공개 API만. PrePass↔Frame Graph 혼용 금지 |
| BabylonJS/Documentation | Apache-2.0 | 활용 | morphTargets·bonesSkeletons·glTFExporter 문서. Playground 스니펫은 패턴만 |
| pixiv/three-vrm | MIT | 활용(알고리즘 이식, three 의존 금지) | VRMHumanBoneName, VRMExpressionManager, VRMLookAt, mtoon 셰이더 |
| ColinLeung-NiloCat/UnityURPToonLitShaderExample | MIT | 활용 | 아웃라인 폭·z 오프셋·remap. 샘플 에셋 금지 |
| NoiRC256/URPSimpleGenshinShaders | MIT | 활용(수 줄) | SDF 샘플링·임계 비교. 게임 에셋·이미지 금지 |
| akasaki1211/sdf_shadow_threshold_map | MIT | 활용(JFA 포팅) | CPU 패리티 |
| iryoku/separable-sss | BSD-2 | 활용(고지 문구 필수) | 비교군 |
| iryoku/smaa | MIT | 활용 | 알파·깊이 에지로 변경 |
| Agamnentzar/ag-psd | MIT | 직접 의존(`patches/ag-psd@31.0.1.patch`) | 8-bit 기준 |
| donmccurdy/glTF-Transform | MIT | 직접 의존 후보(통합 담당 승인 필요) | wasm 인코더 라이선스 재확인 |
| google-ai-edge/mediapipe | Apache-2.0; `.task` 모델은 모델 카드별 | 직접 의존(모델 URL·바이트·SHA 기록 후) | self-host |
| huggingface/transformers.js | Apache-2.0; 가중치 모델별 | 확장 의존성 | MobileCLIP 가중치 보류 |
| naver/anny | Apache-2.0; SMPL-X 경로 비상업 | 개념만(보수적) | SMPL-X 경로 미열람 |
| ICT-VGL/ICT-FaceKit | MIT | 활용(명명표·파트 구성) | 메시는 비교용만 |
| google/filament | Apache-2.0 | 활용 | shading model·IBL·shadowing 빌딩 블록 |
| KhronosGroup/glTF-Sample-Renderer | Apache-2.0 | 활용 | export 패리티 게이트 |
| mrdoob/three.js | MIT | 활용(이식) | Sobel·OutlinePass·SSS·CCDIKSolver·Halftone. 샘플 에셋 금지 |
| noname0310/babylon-mmd | MIT | 활용(구조) | 모프·툰 머티리얼·IK 런타임. MMD 모델 금지 |
| lilxyzw/lilToon | MIT | 개념만(파라미터 스키마) | Unity 매크로 의존 과다 |
| jsantell/THREE.IK, lo-th/fullik | MIT | 개념만 | TS 재작성 |
| boytchev/disfigure | 코드 MIT, 모델 glb 미확인 | 개념만 | 실험 레인 |
| GPUOpen-Effects/TressFX | MIT | 개념만 | 승격 후보 |
| vrm-c/UniVRM | MIT | 개념만(데이터 규칙) | VRM10 경로 재확인 |
| vrm-c/vrm-specification | **미확인**(LICENSE 없음) | 사실만 | 본문 복제 금지 |
| jamieowen/glsl-blend | MIT | 활용 | un-premultiply 후 적용 |
| webgpu/webgpu-samples | BSD-3 | 활용 | mipmap·cornell·bitonicSort |
| gfx-rs/wgpu(naga) | MIT OR Apache-2.0 | CI 도구 | WGSL 검증 |
| linebender/kurbo | Apache-2.0 OR MIT | 활용(포팅) | 주선 벡터화 |
| Unity mesh-to-sdf, NagaSdfTextureToolForUE | MIT | 개념만 | 확장 |
| playcanvas/engine | MIT | 개념만 | outlines·morph·layer-masks 예제 |
| Joy-less/MangaShader | MIT | 개념만 | |
| casiez/OneEuroFilter | 언어별 BSD/MIT, 루트 LICENSE 미확인 | 자체 구현 | 수식 |
| Impeller README / Skia Graphite | BSD-3 | 개념만 | 설계 규약 |
| makehumancommunity/makehuman, mpfb2 | AGPL-3.0 / GPL-3.0(에셋 CC0) | **금지(코드)** | 에셋은 정책상 미포함 |
| animate1978/MB-Lab | AGPL/GPL | **금지** | 프록시 피팅 개념만 |
| stalomeow/StarRailNPRShader, Melioli/HoyoToon | GPL-3.0 | **금지** | 목표 품질·채널 규약 개념만 |
| unitycoder/UNITY-Arc-system-Works-Shader | GPL-3.0 | **금지** | GDC 2015를 1차 출처로 |
| UnityChanToonShaderVer2 / UTS3 | UCL 2.0 / Unity Companion | **금지** | 'MIT' 전제 오류 |
| xht8723/Anime-SDF-Gen, GixoXYZ/BlenderGBHTool | GPL-3.0+ / GPL-2.0+ | **금지** | UX·단계 개념만 |
| boytchev/mannequin.js, zhan-xu/RigNet | GPL-3.0 / GPLv3(상업 별도) | **금지** | disfigure로 대체 |
| ScreenStyle(ScreenVAE) | 커스텀(상업 시 서면 통지) | 보류 | 법무 확인 전 도입 금지 |

## 3. 논문·공개 자료 목록(용도)

- **얼굴·표정**: Lewis et al., Practice and Theory of Blendshape Facial Models(2014) — 델타·corrective·역리깅; Blanz & Vetter(1999) — 선형 델타 공간 개념(BFM 데이터 금지);
  ARKit BlendShapeLocation — 명명; FLAME 라이선스 — 2023 Open만 참조 통계.
- **바디·변형**: Anny(arXiv:2511.03589); SMPL(구조만, 라이선스 비상업); Allen et al.(2003); Hyun et al. 스위프 변형(2005); Thiery et al. Sphere-Meshes(2013);
  Vaillant et al. Implicit Skinning(2013); Ju et al. MVC(2005); Joshi et al. Harmonic Coordinates(2007); Lipman et al. Green Coordinates(2008);
  Sorkine & Alexa ARAP(2007); Sorkine et al. Laplacian Editing(2004).
- **리깅**: Kavan et al. DQS(2008); Le & Hodgins CoR(2016, 특허 미확인); Jacobson et al. BBW(2011); Baran & Popović Pinocchio(2007, 라이브러리 LGPL 금지);
  Aristidou & Lasenby FABRIK(2011); IK Survey(2018).
- **선·툰**: Bénard & Hertzmann, Line Drawings from 3D Models(2019); Saito & Takahashi(1990); Raskar & Cohen(1999); DeCarlo et al. Suggestive Contours(2003);
  Decaudin(1996); Lake et al.(2000); Barla et al. X-Toon(2006); Todo et al.(2007); Motomura, Guilty Gear Xrd(GDC 2015); Unite Tokyo 2018 붕괴3rd;
  Unity Dojo 2021 원신(세부는 '추정'); Blender Line Art 매뉴얼(용어만).
- **PBR·피부·헤어·IBL·AA**: Karis, Real Shading in UE4(2013); Filament 문서; Penner, Pre-Integrated Skin(2011); Jimenez et al. Separable SSS(2015);
  Scheuermann(2004); Marschner et al.(2003); Kajiya & Kay(1989); Yuksel & Tariq 코스(2010); SMAA(2012); TAA Survey(2020); Karis HRAA(2014); FXAA 백서; Porter & Duff(1984).
- **하프톤·패턴·수채**: Phasor Noise(2019); Void-and-Cluster / Georgiev & Fajardo(2016); Ostromoukhov(2001); Structure-Aware Halftoning(2008); Manga Screening(2008);
  ScreenVAE(2020, 코드 보류); Bousseau et al.(2006).
- **입력·ML**: Casiez 1€ Filter(2012); Nancel et al.(2018); Ng et al.(2012); Pointer Events L3; BlazePose(arXiv:2006.10204).
- **플랫폼·표준**: glTF 2.0 사양; VRM 1.0 MToon/humanoid/expressions(라이선스 미확인); toji.dev Best Practices; WebGPU Fundamentals Timing; MDN GPUSupportedLimits;
  W3C WebGPU; Chrome 121 블로그; Skia Graphite 소개; Impeller README.
- **제품 기준**: SHAPER how-to·약관(정식 출시 2026-04-23); VRoid Studio(공개 가이드의 워크플로만).

## 4. 수치 목표(SHAPER 대비, 자체 정의)

| 영역 | 목표 |
| --- | --- |
| 슬롯 | 15슬롯 전부 available, 슬롯당 프리셋 ≥ 8(헤어·상의·하의 ≥ 12), 레시피 JSON 왕복 바이트 동일 |
| 메시·리그 | ≤ 40k tris(헤어 포함 ≤ 60k), 본 55~120, morph ≥ 100(52 표정 + 2×24 params) |
| 프레임 | 1080p standard p95 ≤ 16.6 ms, hero p95 ≤ 33 ms, 슬라이더 체감 지연 ≤ 50 ms |
| 얼굴 SDF | 재베이크 ≤ 100 ms, CPU 참조 대비 오차 ≤ 1/255 |
| 멀티패스 | ≤ 32 B/샘플 단일 MRT, GPU/CPU Sobel 일치 ≥ 99.9% |
| PNG | 투명 픽셀 RGB 0·번짐 0, 2048² ≤ 500 ms |
| PSD | 2048² 레이어 ≥ 10, Worker ≤ 3 s, opaque MAE ≤ 2/255, 클립스튜디오/Photoshop 열기 통과 |
| glTF | morph·skin 보존, 양자화 오차 ≤ 1 LSB, Sample Viewer PSNR ≥ 35 dB, ≤ 15 MB |
| 웨이트·변형 | 열 확산 ≤ 300 ms, BBW ≤ 2 s(베이크), MVC ≤ 100 ms·음수 가중치 < 1%, DQS 단면 손실 ≤ 5% |
| 물리 | 체인 64×16 입자 ≤ 1.0 ms/프레임, 클로스 4×512 ≤ 2.0 ms, settle ≤ 150 ms(rAF 분할), 100스텝 길이 오차 ≤ 1e-6, 2회 실행 상태 해시 동일 |
| IK | FABRIK ≤ 10회·오차 < 1 mm, 손 21→15본 ≤ 5 ms |
| ML(확장) | Pose ≤ 100 ms/장, CLIP ≤ 300 ms/장, 인덱스 ≤ 2,000 썸네일, 추천 ≤ 50 ms |
| 툰 품질 | 밴드 플리커 < 0.1%, 아웃라인 폭 편차 ±10% |
| 플랫폼 | workgroup 64, 256 B 정렬, 바인드 그룹 ≤ 4, 런타임 셰이더 변형 0, device.lost 복원 ≤ 2 s, naga validate 100% |

모든 수치는 브라우저 실측 전까지 "목표"이며 "달성"으로 보고하지 않는다.

## 5. 라이선스 주의

1. **비상업 모델 전면 금지**: SMPL 계열·FLAME 학술판·BFM·SCAPE. Anny의 SMPL-X 경로는 코드도 열람하지 않는다.
2. **GPL/AGPL/LGPL 코드 열람 금지**: MakeHuman, MPFB2, MB-Lab, mannequin.js, RigNet, Pinocchio 라이브러리, rtsc/trimesh2, Blender Line Art,
   StarRailNPRShader, HoyoToon/PrimoToon, UNITY-Arc-system-Works-Shader, Anime-SDF-Gen, BlenderGBHTool. 논문·매뉴얼·README의 개념만 쓰고 1차 출처를 인용한다.
3. **허용 목록 밖 커스텀 라이선스**: Unity-Chan License(UTS2)·Unity Companion License(UTS3)·ScreenStyle·Apple MobileCLIP 가중치 → 도입 금지 또는 법무 확인 전 보류.
4. **특허·약관 미확인**: Le-Hodgins CoR(실험 전용), Kavan dqs.cg(약관 동의 필요 → 수식만), Christoph Peters 블루노이즈·Shadertoy 코드(확인 전 복제 금지).
5. **MPL-2.0 파일 단위**: libigl(bbw.h, arap.h) 부분 포팅 시 파일 출처·수정 공개 의무 → 기본은 수식만 자체 구현.
6. **문서 라이선스 미확인**: vrm-specification(LICENSE 없음), toji.dev, webgpufundamentals.org → 본문·코드 예제 복제 금지, 사실·패턴만.
7. **모델 파일은 코드와 별개**: MediaPipe `.task`, HF Hub ONNX 가중치는 모델 카드별 라이선스를 배포 전 기록. OpenPose류 비상업 모델 금지.
   pose landmarker 모델 SHA-256은 첫 브라우저 검증 시 통합 담당이 고정한다(그 전까지 "미고정·베타").
8. **MIT 저장소의 샘플 에셋 금지**: three.js facecap, babylon-mmd MMD 모델, disfigure glb, NiloCat·lilToon 샘플 모델·텍스처, 게임 에셋과 레퍼런스 이미지 일체.
9. **고지 의무**: Separable SSS 문구, Apache-2.0(NOTICE)·BSD(고지 유지) 출처 표기. 의존성 추가는 통합 담당이 `pnpm install`·`pnpm audit:licenses`로 처리한다.
10. **독점 제품**: SHAPER·VRoid Studio는 공개 가이드의 워크플로만 재현하며 UI·프리셋·에셋 복제와 리버스엔지니어링을 하지 않는다.
11. **저장소 에셋**: 커밋된 `avatar-orion-authored`(CC0, embedded VRM meta가 유일한 직접 근거)와 `reference-character`(CC0-1.0)만 사용하고 출처는
    [제작 에셋 파이프라인 문서](../../apps/character-lab/docs/authored-asset-pipeline.md)를 따른다. `apps/web/public/vrm/*`는 앱 소유라 직접 참조하지 않는다.

## 6. 미확인 항목(후속 세션에서 확인)

vrm-specification 저장소 LICENSE, UniVRM VRM10 하위 파일 경로, Kajiya-Kay 1989·Hyun 2005·Lake 2000 공개 PDF, Pinocchio 저장소 LICENSE,
1€ Filter GitHub 루트 LICENSE, MediaPipe `.task` 모델 카드, HF ONNX 모델 카드, glTF 2.0 사양 저작권 문구, SHAPER 출력 해상도·PSD 레이어 구조 수치,
VRoid 텍스처 해상도 옵션, 원신 캐릭터 셰이더 세부(비공식 자료 의존), Chrome 외 브라우저 timestamp 양자화 정책.

## 7. 관련 저장소 문서

- [ADR-0008 라이선스 격리 정책](../adr/0008-license-isolation-policy.md), [ADR-0018 자동 폴백 금지](../adr/0018-no-automatic-engine-fallback-vello-primary.md),
  [ADR-0019 렌더러 역할 원장](../adr/0019-renderer-role-ledger-single-authority.md), [렌더러 역할 원장(생성)](renderer-roles.md)
- [SHAPER 품질 격차 감사 2026-09-03](../studio-shaper-quality-gap-audit-2026-09-03.md), [Blender 캐릭터 파이프라인](../studio/blender-character-pipeline.md),
  [toonstudio_blender_kit README](../../tools/blender/toonstudio_blender_kit/README.md)
- [apps/character-lab README](../../apps/character-lab/README.md)
