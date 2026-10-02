# character-lab 엔진 대안 비교 보고서 — 2026-10-01

- 상태: **역사 자료**(2026-10-01 시점의 평가와 권고). 확정 결정의 권위는
  [ADR-0026](../adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)이다.
- 질문: "네이버웹툰 SHAPER 수준의 3D 캐릭터 제작 흐름을 **웹에서** 게임엔진급 렌더링으로 구현할 엔진 대안은 무엇인가."
- 근거 자료: 2026-09-30 정찰 보고(엔진 대안·3D 스택), 2026-10-01 character-lab 확정 스펙과 연구 종합
  ([참고 문헌 원장](../engines/labs-character-engine-references-2026-10-01.md)), 기존 보고서
  [엔진 평가 2026-09-12](studio-3d-engine-evaluation-2026-09-12.md),
  [SHAPER 경쟁 벤치마크 2026-09-12](shaper-competitive-benchmark-2026-09-12.md),
  [SHAPER 품질 격차 감사 2026-09-03](../studio-shaper-quality-gap-audit-2026-09-03.md),
  [Babylon.js 채택 평가 2026-07-11](../studio-babylonjs-adoption-evaluation-2026-07-11.md).
- 확인 범위: 버전·라이선스·API 존재 여부는 저장소 lockfile, `node_modules` 선언 파일, 공식 문서로 확인한 사실이다.
  **렌더 품질과 성능은 GPU가 없는 이 컨테이너에서 측정하지 않았다.** 이 문서의 수치 목표는 전부 제안값이다.

## 0. 결론 요약

| 항목 | 결정 |
| --- | --- |
| 주 엔진 | Babylon.js 9.19.0 `WebGPUEngine`(사용자 명시 선택) + `Engine`(WebGL2, 명시 대안). 실패 뒤 다른 엔진 자동 시도 금지(ADR-0018) |
| 비교 레인 1 | Three 0.184 `WebGPURenderer` + three-vrm 3.5.3 `MToonNodeMaterial`: "VRM 그대로" 대조군. 이번 범위에서는 **문서 비교 전용**(코드 없음) |
| 비교 레인 2(선택) | PlayCanvas 2.22.6: 미설치. 자동 WebGPU→WebGL 폴백이 기본이라 ADR-0018과 충돌. 문서 전용 |
| 장기 후보 | Bevy 0.18 / wgpu WASM: `wasm-bindgen-cli` 부재로 이 세션에서 렌더 레인 구현·검증 불가 |
| 제외 | Unity, Godot, Unreal(Pixel Streaming), Wonderland, Cocos, Filament WASM |
| 격차의 원인 | **에셋 > 파이프라인 > 엔진**. 엔진 교체만으로 SHAPER 동등 품질을 주장할 수 없다 |
| 에셋 레인 | Blender 제작 레인(`tools/blender/toonstudio_blender_kit`, CC0 Orion 패키지 커밋 완료)과 절차 휴머노이드 레인을 같은 15슬롯·morph·본 계약으로 취급 |
| 물리 | 자체 결정적 PBD/XPBD 체인·클로스(1급) + Rapier 0.19.3(소품·접지, 선택) + Havok(미설치 사유 표시) |
| 베타 표기 | IBL Shadows, OpenPBR, TAA, SSAO2, NodeMaterial 툰, `MeshUVSpaceRenderer` 페인트, VRM 부분 파서, pose 모델 SHA 미고정 |

## 1. 평가 기준

| 기준 | 확인 방법 | 비중 |
| --- | --- | --- |
| 웹 구동(정적 배포) | 설치·서버·외부 에디터 없이 Vite 정적 번들로 실행되는가. 저장소 안에서 빌드가 재현되는가 | 하드 게이트 |
| WebGPU 성숙도 | 공식 문서의 지원 상태 문구, compute·MRT·timestamp query 존재, WebGL2와의 결과 차이 실측 | 상 |
| 라이선스 | `scripts/generate-third-party-notices.mjs` 허용 목록(MIT/Apache-2.0/BSD/ISC/CC0 등)과 상업 이용 조건 | 하드 게이트 |
| 번들 크기 | 트리셰이킹 경계(deep import·sideEffects), wasm 바이너리 크기, 지연 로딩 가능성 | 중 |
| VRM / glTF | glTF 2.0 로더·확장 범위, GLB export, VRM(MToon·humanoid·springbone·expressions) 의미 보존 | 중 |
| 툰 셰이딩 | 커스텀 셰이더(WGSL/GLSL) 경로, 외곽선, 램프·SDF 얼굴 그림자 구현 가능성 | 중 |
| 물리 | 헤어·의상 2차 동작(체인·클로스), 결정성, 번들 비용 | 중 |
| 에디터 UX 구현 난이도 | morph target(100+), 스켈레톤·IK, 모델 위 드로잉(UV 투영), 멀티패스 캡처(PSD 레이어), 썸네일 RTT, 성능 HUD | 상 |
| 이 세션 검증 가능성 | GPU 없는 Node(vitest)에서 장면·morph·스켈레톤·pass 매핑을 헤드리스로 검증할 수 있는가 | 상 |

## 2. 1차 필터 — 브라우저 정적 배포 불가 또는 정책 충돌 경로

| 후보 | 제외 사유(확인 출처) |
| --- | --- |
| Unity 6 | 6.3 LTS 매뉴얼이 "WebGPU is experimental" 명시. 저장소 안에서 빌드 재현 불가, 에디터 약관이 독점 조건. 6.6의 "production" 주장은 2차 출처만 확인됨 |
| Godot 4.7 | 공식 문서: "Godot 4 can only target WebGL 2.0", "does not support WebGPU", C# 웹 export 불가 → WebGPU 상한 자체가 없음 |
| Unreal | 웹 경로는 Pixel Streaming(서버 GPU + WebRTC 영상). "설치 없음·서버 없음" 차별점이 사라지고 PSD 레이어 전달 수단도 아님 |
| Wonderland Engine | 런타임·에디터 EULA(폐쇄), 연매출 $120k 초과분 10% 로열티 → 공급망 정책 충돌 |
| Cocos | 엔진은 MIT이나 README가 "not to be used independently"(Creator 에디터 종속) |
| Filament WASM | npm `filament` 1.53.4(Apache-2.0)는 2024-08 발행으로 C++ 1.77.2와 괴리. 웹은 WebGL 2.0만(WebGPU는 데스크톱·Android만 명시) |

## 3. 후보 비교표

| 기준 | Babylon.js 9.19.0 | Three 0.184 + three-vrm 3.5.3 | PlayCanvas 2.22.6 | Bevy 0.18 / wgpu |
| --- | --- | --- | --- | --- |
| 라이선스 | Apache-2.0 | MIT / MIT | MIT | MIT OR Apache-2.0 |
| 설치 상태 | 루트와 `apps/character-lab` importer에 `core`·`loaders`·`serializers` exact pin | 루트 importer에만 존재(character-lab 미선언) | 미설치(신규 pin·라이선스 감사·`pnpm install` 필요) | crates 관례만 있음(`crates/vendor/wgpu-toon` 29.0.4) |
| WebGPU 성숙도 | 5.0(2022-05)부터 main 병합. `WebGPUEngine.initAsync`, compute shader, snapshot rendering, `gpuFrameTimeCounter`. "WebGPU 장면을 WebGL로 교체 불가" → 단일 선택과 정합 | r184 매뉴얼 "still in an experimental state". `ShaderMaterial`·`onBeforeCompile`·`EffectComposer` 미지원(TSL로 교체). MToonNodeMaterial은 "under development". 저장소 실측(2026-09-12): MToon WebGPU/WebGL2 합성 채널 최대 차 125/255 → 제품은 캐릭터를 WebGL2에 고정 | 공식 문서 "WebGPU (Beta)", "seamlessly fall back from WebGPU to WebGL"(자동 폴백 기본) | 공식 README "currently experimental", 단일 스레드 |
| 번들 크기 | deep ESM import + `sideEffects` 681항목이 트리셰이킹 경계. 제품은 `@babylonjs/*`를 단일 청크로 고정. Havok wasm(~4.4MB)은 미설치 | `three.webgpu`가 `three.core`를 공유해 청크 분리가 역효과였다는 기록. VRM 샘플은 각 11~20MB(apps/web 소유) | 미측정(미설치) | wasm ~13MB → `wasm-opt -Oz` ~4.8MB(공식 예제 README) |
| glTF / VRM | glTF 2.0 로더 확장 풍부(meshopt·Draco·BasisU·KHR_materials_*), `GLTF2Export.GLBAsync`(morph·skin 포함). **VRM 확장 없음** → humanoid·meta만 순수 파서(베타) | VRM 네이티브(MToon·springbone·humanoid·expressions) | glTF 지원, VRM 없음 | glTF 로더 있음, VRM 없음 |
| 툰 셰이딩 | `ShaderMaterial`(WGSL·GLSL 2벌) + 내장 `OutlineRenderer`. NodeMaterial(WGSL 빌드)은 베타 토글 | MToon(VRM 규격 재현이 목표, PBR·IBL·CSM·SSS 스택 아님) | 문서화된 셰이더 청크 | 자체 작성 필요 |
| 물리 | Physics V2 Havok 플러그인(wasm 미설치, cloth 없음). Rapier는 별도 pin | springbone만 | 내장 없음(ammo 연동) | bevy_rapier 등 crates(웹 빌드 불가) |
| 에디터 UX 구현 재료 | `MorphTargetManager`(텍스처 모드, `numMaxInfluencers`), `Skeleton.useTextureToStoreBoneMatrices`, `BoneIKController`·`BoneLookController`, `MeshUVSpaceRenderer`(데칼→UV), `MultiRenderTarget`·`GeometryBufferRenderer`·`PrePassRenderer`·`DepthRenderer`, `CascadedShadowGenerator`, `PBRSubSurfaceConfiguration`, `DefaultRenderingPipeline`·`SSAO2`·`TAA`, `HDRFiltering.prefilter`, `SceneInstrumentation` | morph·skeleton 있음. IK는 예제 수준(`CCDIKSolver`), 후처리·MRT는 TSL 경로(실험) | 그림자 PCF/VSM/PCSS, CSM 1~4, morph·skin·bloom·SSAO·DoF·TAA 문서화. `@playcanvas/react` 선언형 비교 용이 | 캐릭터 툴링 없음 |
| 이 세션 검증 | `NullEngine`으로 vitest 헤드리스 실행 가능 | 헤드리스 없음(모의 필요) | 중 | 불가(`wasm-bindgen-cli` 없음) |
| 판정 | **주 엔진** | **비교 레인 1(VRM 대조군, 문서 전용)** | **비교 레인 2(선택, 문서 전용)** | **장기 후보** |

PlayCanvas를 코드 레인으로 올리려면 exact pin·라이선스 감사·통합 담당의 `pnpm install`이 필요하고, 자동 폴백 옵션을 명시적으로
차단해야 ADR-0018을 지킨다. Bevy/wgpu는 `wasm-bindgen-cli`가 들어온 뒤에만 렌더 레인이 가능하며, 그 전까지는 CPU 전용 C-ABI
wasm(morph 블렌딩·IK·PSD 합성) 레인만 후보다(이 세션에서 빌드·검증하지 않음).

## 4. 왜 설치형이 아니라 웹인가

- 사용자 요구의 원문 요지: "설치형이면 SHAPER 대비 장점이 없다. 웹이 차별점이다." SHAPER는 Windows/macOS 다운로드 제품이다
  ([경쟁 벤치마크 2026-09-12](shaper-competitive-benchmark-2026-09-12.md)).
- 웹의 장점: 설치·플러그인·외부 에디터 없이 즉시 실행, 링크 공유, ToonStudio 웹 파이프라인(투명 PNG·레이어 PSD·레시피 JSON·glTF)과
  같은 브라우저 안에서 직접 연결, 서버 없이 로컬 import/export만으로 동작(정적 Vite).
- 웹의 제약: GPU 접근은 WebGPU/WebGL2뿐이고 기본 한도(2D 텍스처 8192, 버퍼 256MiB)가 있다. 브라우저별 WebGPU 보급 차이가 있어
  엔진은 사용자 명시 선택과 fail-visible로 닫아야 한다. 설치형 엔진의 웹 export(Unity·Godot)는 WebGPU 상한·빌드 재현성·약관 때문에 제외했다.

## 5. "VTuber 라이브러리 격차"의 원인 분해와 레인 결정

| 원인 | 비중 | 근거 |
| --- | --- | --- |
| 에셋 | 가장 큼 | `apps/web/public/vrm/`는 샘플 아바타뿐이고 부위별(눈·코·입·귀·의상) authored 라이브러리가 없다. HDR/.env/.ktx2 환경맵 0개. 2026-09-03 감사: 절차형 헤어가 "smooth PBR primitives… generic 3D" |
| 파이프라인 | 큼 | 캐릭터 경로가 WebGL2에 고정(`webgl-only-vrm-character`), 캡처·PSD가 Three 렌더러 시그니처에 결합, PSD shadow/highlight를 beauty/flat 차분으로 근사, VRM 규격에 파츠 교체·체형 morph 슬롯이 없어 메시 병합·스킨 재바인딩을 앱이 떠안음 |
| 엔진 | 중 | three-vrm의 목표는 VRM 규격 재현이지 PBR·IBL·CSM·SSS·후처리 스택이 아니다. Three WebGPU는 experimental이라 검증 부담이 크다 |

결론: 엔진 교체는 렌더 상한과 멀티패스 프레임 그래프를 **연다**. 그러나 슬롯 카탈로그·명령 타임라인·출력 계약과 authored 에셋·IBL 환경
없이는 격차가 유지된다. 그래서 character-lab은 다음 세 레인을 함께 둔다.

1. **Blender 제작 레인**: `tools/blender/toonstudio_blender_kit` 파이프라인이 만든 패키지를 `apps/character-lab/public/assets/characters/`에
   둔다. 2026-10-01 현재 CC0 `avatar-orion-authored`(GLB 4,045,664 B, 스켈레톤 67 joint, 의미 기반 얼굴 shape key 24개, 툰 헤어 LOD 3단)와
   CC0 `reference-character`가 커밋돼 있다. 로드 계약(메시·shape key·본 이름·SHA-256·품질 게이트)은
   [제작 에셋 파이프라인 문서](../../apps/character-lab/docs/authored-asset-pipeline.md)와
   [Blender 캐릭터 파이프라인](../studio/blender-character-pipeline.md)이 기준이다.
2. **절차 휴머노이드 레인**: VRM 55본 스켈레톤을 코드로 배치하고 본별 단면 프로파일을 로프트한 고정 토폴로지 메시. 체형 파라미터 ±1 결과를
   morph target으로 베이크하므로 외부 에셋 0으로 15슬롯 전부를 채울 수 있다.
3. **공통 계약**: 두 소스를 같은 15슬롯·morph 이름·본 이름 계약(`apps/character-lab/src/contracts/`)으로 취급한다. 모델이 지원하지 않는
   슬롯은 사유를 적고 몰래 바꿔치기하지 않는다(fail-closed).

IBL 환경은 저장소에 HDR이 없으므로 절차 스카이를 `HDRFiltering.prefilter`로 사전 필터링해 시작하고, 사용자 HDR은 로컬 파일 import로 받는다.

## 6. 물리 엔진 결정

| 후보 | 라이선스 | cloth | 결정성 | 번들 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 자체 PBD/XPBD(TS, 선택적 WGSL) | 내부 | 체인·스트립·그리드 + 캡슐 충돌 | 설계로 보장(고정 순서·f32·`sqrt`만) | 0 | **채택(1급)** — 헤어·스커트·리본·jiggle, 포즈 settle 후 캡처 |
| `@dimforge/rapier3d-deterministic-compat` 0.19.3 | Apache-2.0 | 없음 | `enhanced-determinism` + `takeSnapshot()` 해시 | wasm 인라인 | **채택(보조)** — 소품 낙하·접지·접촉, Worker에서 transform만 bake |
| `@babylonjs/havok` 1.3.14 | MIT(wasm 배포) | 없음 | 문서상 보장 없음 | ~4.4MB, 미설치 | 보류 — provider 인터페이스만 두고 `unavailable: 미설치` 사유 표시 |
| JoltPhysics.js 1.1.0 | MIT | SoftBody | npm 빌드 결정성 미확인 | 3.2MB | 확장 후보(별도 provider로만) |
| Ammo.js / cannon-es | zlib / MIT | btSoftBody / 없음 | 미보장 | — | 미채택 |

세 provider는 같은 카탈로그에서 사용자가 하나를 고르고, 실패는 `unavailable`로 노출한다(무음 대체 금지).

## 7. 엔진 레인 표(문서·HUD 동일 표기)

`apps/character-lab/src/contracts/engine.ts`의 `ENGINE_LANES`와 같은 표기다.

| 레인 ID | 표기 | 상태 | 비고 |
| --- | --- | --- | --- |
| `babylon-webgpu` | Babylon 9.19 WebGPU | primary-experimental | 주 엔진(실험, 브라우저 미검증). 사용자 명시 선택, 실패 시 `failed` 노출 |
| `babylon-webgl2` | Babylon 9.19 WebGL2 | explicit-alternative | 명시 대안. 자동 전환 금지 |
| `null` | NullEngine | test-only | 테스트 전용. readback은 `provenance.synthetic=true` |
| `physics-builtin-pbd` | 내장 PBD | available | 결정적 XPBD 체인·캡슐 충돌 |
| `physics-rapier` | Rapier 0.19.3 | available-dynamic | 동적 import. 소품·접지용 |
| `physics-havok` | Havok | unavailable | `@babylonjs/havok` 미설치(라이선스·lockfile 승인 필요) |
| `three-webgpu-vrm` | Three 0.184 WebGPU + three-vrm | docs-only | 비교 문서 전용 |
| `playcanvas` | PlayCanvas | docs-only | 비교 문서 전용(자동 폴백 기본이라 ADR-0018 충돌) |

## 8. 베타·실험 표기 항목(기본값 off)

| 항목 | 사유 |
| --- | --- |
| IBL Shadows(`IblShadowsRenderPipeline`) | 9.x 신규 복셀 기반 기능. 캐릭터 장면에서 아티팩트·성능 미검증 |
| OpenPBR(`OpenPBRMaterial`) | 9.19 선언 파일에 존재하나 9.0 발표문 본문에는 언급 없음 → 안정성 미확인 |
| TAA(`TAARenderingPipeline`) | 정지 캐릭터 뷰어에는 유리하나 실기기 미검증. 캡처는 TAA 수렴 또는 2× SSAA |
| SSAO2 | 토글은 두되 캡처 기본 경로에서 제외 |
| NodeMaterial 툰 | WebGPU에서 WGSL 빌드가 가능하나 `ShaderMaterial`(WGSL·GLSL 2벌)이 기본. 토글로만 유지 |
| `MeshUVSpaceRenderer` 페인트 | 데칼→UV 투영은 베타 옵션. 기본은 같은 UV에 `RawTexture` 데칼 합성 |
| VRM 부분 파서 | Babylon 로더에 VRM 확장이 없어 humanoid·meta만 glb JSON 청크에서 파싱 |
| Havok 의상 dynamics | 미설치·cloth 없음 |
| pose 모델 SHA 미고정 | MediaPipe pose landmarker `.task`의 SHA-256은 첫 브라우저 검증 시 고정. 그 전까지 HUD에 "미고정·베타" 표시 |

## 9. 확인 사실과 미검증 사항의 구분

**정찰·스펙 심사(2026-09-30 ~ 2026-10-01) 기록에 따르면 Node 22.22에서 실행해 확인한 사실**(이 보고서 작성 시 재실행하지 않았다):

- `NullEngine` + `Mesh`/`VertexData`(skin 속성) + `Skeleton`/`Bone` + `MorphTargetManager` + `PBRMaterial` + `RenderTargetTexture(32×32)` +
  `SceneInstrumentation`으로 `scene.render()` 2회 정상.
- `ag-psd` `writePsd`/`readPsd`가 캔버스 스텁으로 Node round-trip 성공(blendMode multiply/screen 보존).
- `@dimforge/rapier3d-deterministic-compat` `init()` + `World.step()` Node 정상.
- Babylon 9.19 모듈 경로(WebGPU 엔진·MRT·compute·CSM·SSAO2·TAA·`MeshUVSpaceRenderer`·`HDRFiltering`·`BoneIKController`·serializers) 존재.

**브라우저 실기기 증거 없이는 "동작"으로 보고하지 않는 항목**:
WebGPU/WebGL2 실제 렌더(SSS·이방성·CSM·SSAO2·TAA·툰 WGSL), 투명 RTT readback 행 순서·premultiply, 썸네일 픽셀, 페인트 텍스처 반영,
MediaPipe CDN 로드·추론 품질, Rapier 브라우저 성능, GLB 실파일 재import, PSD 재합성 MAE 실측, 성능 목표 전부.

## 10. 성능 목표(제안)와 측정 절차

| 지표 | 목표(제안) | 측정 |
| --- | --- | --- |
| 1920×1080 standard 프레임 | p95 ≤ 16.6 ms(hero p95 ≤ 33 ms) | `SceneInstrumentation` + `gpuFrameTimeCounter`, ≥100 프레임 p50/p95 |
| 슬라이더 입력→표시 | ≤ 50 ms | HUD 타임스탬프 |
| 투명 PNG 2048² | ≤ 500 ms, 투명 픽셀 RGB 0·번짐 0 | RTT readback 후 알파 검사 |
| PSD 2048² 레이어 ≥10 | Worker ≤ 3 s, opaque MAE ≤ 2/255 | 재합성 비교 |
| glTF export | morph·skin 보존, Sample Viewer PSNR ≥ 35 dB, ≤ 15 MB | Khronos Sample Viewer 패리티 |

절차: GPU가 있는 환경에서 `pnpm dev:character-lab` 후 Chrome 113+에서 WebGPU를 명시 선택 → HUD에 backend·adapter 표시 → 썸네일·투명
PNG 알파·PSD 레이어·드로잉 반영·MediaPipe 로드 상태를 확인하고 결과를 패리티 체크리스트의 "브라우저 검증" 열에 날짜·기기와 함께 기록한다.
미실행 항목은 "미검증"으로 남긴다.

## 11. 남은 위험

- GPU 없는 컨테이너라 `NullEngine` 통과는 렌더 품질·WebGPU 호환의 증거가 아니다. 모든 보고는 "실기기 미검증"을 명시해야 한다.
- Babylon 로더에 VRM 확장이 없어 기존 VRM 자산의 MToon·표정·spring bone 의미가 소실된다. Three+three-vrm 대조군은 문서로만 두므로
  "VRM 그대로" 대 "Babylon PBR 재구성" 비교는 후속 세션에서 코드 레인을 추가해야 가능하다.
- three-vrm MToon의 WebGPU/WebGL2 색 차이(최대 125/255)가 이미 실측됐으므로 Three WebGPU 레인을 올릴 때는 WebGL2 MToon을 기준선으로 병기해야 한다.
- `@babylonjs/havok`·HDR 환경맵·부위별 authored 파츠 라이브러리는 저장소에 없다. Orion 패키지 1종으로는 "슬롯당 프리셋 ≥8" 목표를
  채울 수 없으며 CC0/상업 이용 가능 자산의 추가 확보가 필요하다.
- Blender 파이프라인 출력은 바이트 수준 재현성이 보장되지 않는다(같은 설정의 두 빌드에서 BIN 청크 일부 차이). SHA-256은 해당 빌드의 무결성
  영수증으로만 쓴다.
- PSD 레이어 정확도(Multiply/Screen 재합성, 반투명 가장자리)는 엔진과 무관한 계약 문제다. 실제 pass 기반으로 바꿔도 픽셀 diff 없이 SHAPER 동등을 주장할 수 없다.
- Unity 6.6 WebGPU "production" 주장은 공식 매뉴얼 문구를 찾지 못했다. 다만 설치형·저장소 내 빌드 불가·약관 때문에 결론은 바뀌지 않는다.

## 12. 출처

- Babylon.js 9.19.0 선언 파일(`node_modules/@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/serializers`), 공식 WebGPU 문서, 9.0 발표문(2026-03-26).
- three r184 매뉴얼 `webgpurenderer`, `@pixiv/three-vrm` 3.5.x README.
- PlayCanvas 공식 그래픽·그림자 문서, npm `playcanvas` 2.22.6·`@playcanvas/react` 0.11.7.
- Bevy 0.18 릴리스 노트와 examples README, `crates/vendor/wgpu-toon`.
- Unity 6.3 LTS 매뉴얼, Godot 4.7 `exporting_for_web`, Wonderland Engine pricing, Cocos engine README, npm `filament` 1.53.4 README.
- 저장소: `docs/adr/0018-no-automatic-engine-fallback-vello-primary.md`, `packages/studio-engine-registry/src/renderer-roles.ts`,
  `config/architecture-boundary-ratchet.json`, `apps/character-lab/src/contracts/engine.ts`, `apps/character-lab/src/contracts/physics.ts`,
  [렌더러 역할 원장](../engines/renderer-roles.md).
