# ToonStudio 3D 엔진 평가 — 2026-09-12

## 판단과 증거 범위

**현재 결론은 Three.js 편집기를 유지하면서, 이미 구현된 Babylon.js 출력 경로를 제한된 장면부터 검증·확장하는 것이다.** 전체 교체를 정당화하는 현재 기기 성능 비교는 없다. 이번에 확인한 저해상도 출력, PSD 합성 오차, 캡처 도중 포즈 변경, 카메라 프레이밍, 실제 장면과 연결되지 않은 도구는 대체로 제품 구현 문제다. 다른 엔진에서도 같은 계약을 잘못 구현하면 재발한다.

이 보고서는 공식 문서 조사, 현재 저장소의 구현 확인, 이번 작업에서 실행한 제한된 출력 검증을 구분한다. 경쟁 제품과 엔진별 동일 자산의 장시간 실기기 비교는 수행하지 않았다. Shaper의 내부 엔진은 확인하지 않았으며, 엔진의 기능 목록을 Shaper 수준의 결과물 증거로 사용하지 않는다.

공식 문서는 2026-09-12 조회 기준이다. Three의 `dev` 문서와 Context7 예제는 현재 설치 버전보다 앞설 수 있으므로 API 적용에는 설치 버전 확인이 필요하다. Unity는 명시한 6.3 LTS 문서를 기준으로 삼았다.

## 현재 구조: Three 단일 엔진이라는 전제는 틀리다

| 확인 항목 | 현재 코드 근거 | 의미 |
| --- | --- | --- |
| 설치된 렌더러 | `package.json:167-181,234`: Babylon core/loaders 9.19.0, Three 0.184.0, R3F 9.6.1, three-vrm ^3.5.3 | Babylon 도입 자체는 이미 완료된 일이다. |
| 물리 | `package.json:169`: Rapier deterministic compat 0.19.3 | Three에 물리가 없다는 이유만으로 엔진 전체를 바꿀 필요는 없다. |
| 엔진 독립 출력 계약 | `apps/web/src/domains/creator/bg3d/studio-bg3d-capture-adapter.ts:10-72` | RGBA8, straight alpha, sRGB, 위에서 아래로 읽는 픽셀 순서와 비동기 depth 출력 계약이 존재한다. |
| 격리된 전문 출력 작업 | `apps/web/src/domains/creator/bg3d/studio-bg3d-runtime-adapter.ts:48-107,151-163` | 정규 문서 JSON과 SHA·바이트 검증된 GLB 사본을 넘기고 실행·취소·폐기를 분리한다. 엔진 고유 scene 객체를 공유하지 않는다. |
| Babylon 실구현 | `apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-artifact-capture.ts` 및 normal/stable-ID 모듈 | beauty, depth, normal, object ID, material ID 출력 경로가 구현되어 있다. |
| Babylon 현재 자산 제한 | 위 파일 `:373-391,692-728` | meshopt/Draco/BasisU, 이미지·텍스처 배열, 활성 pose/morph/constraints, 비기본 animation, orthographic/lensShift, 비어 있지 않은 sky 등을 거부한다. 현재 캐릭터 편집기나 일반적인 텍스처 배경의 완전 대체재가 아니다. |
| 출력 계약의 기능 열거 | `apps/web/src/domains/creator/bg3d/studio-bg3d-artifact-capture-v2.ts:15-47,163-174` | 256 MiB typed-array 상한과 여러 pass ID가 있다. shadow/AO/emission/velocity가 타입에 있다는 사실은 Babylon 구현 완료를 뜻하지 않는다. |
| 실제 편집기 결합 | `apps/web/src/domains/creator/bg3d/useStudioBg3dEngineRuntime.ts:38-40`, `apps/web/src/domains/creator/bg3d/StudioBg3dEditorSceneGraph.tsx:413,513`의 Drei controls, `apps/web/src/domains/creator/bg3d/studio-bg3d-editor-transform-host.ts:689`의 Three.Box3 | renderer factory 교환 지점은 있지만 편집용 scene graph·gizmo·선택·이벤트 전체가 추상화된 것은 아니다. |
| 캐릭터 출력 결합 | `apps/web/src/domains/creator/vrm/studio-vrm-raster-capture.ts:145-220`, `character-shaper-semantic-psd.ts` | WebGLRenderTarget·readback·Three mesh/material·MToon에 직접 결합한다. |

현재 대화형 프로덕션 경로는 Three이고 다른 후보는 실험/전문 출력 범위다. 과거 설계 문서의 자동 WebGL fallback 설명보다 현재 엔진 선택 코드의 명시적 실패 정책을 우선한다. 사용자에게 알리지 않고 다른 backend로 바꾼 실행은 성능 비교의 동일 조건으로 취급하지 않는다.

문서 데이터는 교체 시 보존할 수 있다. BG3D/Scene3D/VRM/CharacterDocumentV2는 ID·숫자 배열·자산 메타데이터 중심이며, CharacterCommand의 revision/receipt와 순수 two-bone IK도 재사용 가능하다. 다만 현재 RuntimeAdapter에는 함수·AbortSignal·신뢰 검증용 WeakSet이 포함되어 있으므로 Unity/Godot의 WASM·iframe으로 그대로 전송할 수 없다. JSON, 소유권이 분명한 ArrayBuffer, revision을 가진 command/event DTO가 추가로 필요하다.

## 엔진별 웹 실행과 적용 판단

| 후보 | 공식 확인 사항 | ToonStudio 적용 판단 |
| --- | --- | --- |
| Three.js + R3F | Three WebGPURenderer는 WebGPU와 WebGL2 backend 경로를 제공한다. ShaderMaterial, RawShaderMaterial, onBeforeCompile는 그대로 호환되지 않아 node material/TSL 이식이 필요하다. [공식 renderer 문서 소스](https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html) | 편집·VRM·페인팅 투자 재사용이 가장 크다. WebGPU는 단순 생성자 교체로 적용할 수 없다. 현재 WebGL 캐릭터 출력의 품질을 먼저 고정한다. |
| Babylon.js | WebGPUEngine 비동기 초기화 및 지원 확인 후 WebGL Engine 선택이 공식 문서에 있다. [WebGPU](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md), [backend 전환](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUBreakingChanges.md) | 현재 specialist를 활용하는 부분 채택이 가장 구체적이다. 자산·카메라 제한 해소와 동일 문서 출력 검증을 통과한 범위만 확장한다. |
| PlayCanvas | 공식 그래픽 문서는 WebGPU를 Beta로 표시하고 WebGL2 fallback을 설명한다. 공식 React 패키지·웹 컴포넌트가 있다. [그래픽](https://developer.playcanvas.com/user-manual/graphics/), [API](https://api.playcanvas.com/engine/), [브라우저](https://developer.playcanvas.com/user-manual/engine/supported-browsers/) | React 통합이 가능한 웹 엔진 후보다. 현재 계약의 엔진 ID 열거 외 실제 adapter 구현은 확인하지 못했다. 독립 비교 fixture 후보이며 즉시 전환 근거는 없다. |
| Unity | 6.3 LTS에서 WebGL2가 기본이고 WebGPU는 Experimental이다. WebAssembly 기반이며 C# managed threading·일부 .NET/네트워크 기능에 제한이 있다. [WebGPU](https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html), [웹 제한](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-technical-overview.html) | 데스크톱의 편집·애니메이션 도구 강점을 웹 런타임 성능이나 원고 출력 보장으로 해석할 수 없다. C#↔웹 command bridge, 자산 변환, shader, 입력·저장·capture를 상당 부분 재구현해야 한다. |
| Godot | stable 공식 문서는 WASM+WebGL2 Compatibility만 웹에 지원하며 WebGPU 미지원, Godot 4 C# 웹 export 불가를 명시한다. 단일 thread export가 기본이며 다중 thread는 cross-origin isolation 조건이 있다. [웹 export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) | 오픈소스 네이티브 제작 도구 후보지만 웹 렌더링 API 범위를 넓히는 즉시 대안은 아니다. GDScript/엔진 scene과 React 편집 문서 사이의 bridge 구축 비용이 크다. |
| Unreal Engine | 공식 Pixel Streaming은 패키지 앱을 PC/클라우드에서 실행하고 WebRTC 영상과 입력을 주고받는다. 서버 GPU 및 인코더 요구 사항이 있다. [Pixel Streaming](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine), [하드웨어](https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-pixel-streaming-reference) | 클라우드 고품질 렌더 작업 후보다. 브라우저 로컬 엔진과 다른 운영 모델이며 지연·압축·동시 사용자 비용을 측정해야 한다. 현재 검토한 공식 경로에서 UE5의 일반 브라우저 로컬 WASM/WebGPU 배포를 확인하지 못했다. |

WebGPU, WASM, 게임 엔진은 서로 같은 의미가 아니다. WebGPU는 GPU API이고 WASM은 코드 실행 형식이다. WASM이 UV·리깅·출력 합성 오류를 자동으로 해결하지 않으며, GPU API 변경도 재질·알파·색 공간의 일치를 자동 보장하지 않는다.

## 웹툰 제작 기능을 기준으로 본 차이

| 품질 축 | 확인한 기능과 실제 필요한 작업 |
| --- | --- |
| toon/outline | Three에서 현재 MToon·custom material을 사용한다. Unity Toon Shader는 base/두 단계 음영·rim·outline 폭/색/폭 맵을 문서화하지만 조회한 세부 문서는 0.8/0.9 preview 계열이다. 최신 Unity 웹 빌드의 모든 조합이 검증되었다는 근거로 사용하지 않는다. [공식 설정](https://docs.unity3d.com/ja/Packages/com.unity.toonshader%400.9/manual/Parameter-Settings.html), [outline](https://docs.unity3d.com/ja/Packages/com.unity.toonshader%400.9/manual/Outline.html) |
| 선화 | 실루엣 outline, 깊이 경계선, 법선 경계선, 텍스처 내부선은 다른 결과다. 어느 엔진이든 웹툰에 필요한 선 선택·얼굴 내부선 억제·픽셀 기준 선폭을 따로 설계해야 한다. 이번 수정은 어두운 소재 전체가 선화로 채워지던 합성 규칙을 없애고 flat의 Sobel 경계를 사용한다. 단순 outline 기능 유무로 우열을 판정하지 않는다. |
| depth/normal/ID | Three와 Babylon의 현재 코드에 실제 pass가 있다. Babylon 공식 FrameGraph 예제도 독립 depth texture 구성을 제공한다. PlayCanvas API에는 render target, depth reader, world-normal/albedo/opacity shader pass가 있다. 이 API 존재가 우리 문서의 좌표·깊이·alpha 계약 충족을 의미하지는 않는다. [Babylon 예제](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/frameGraph/frameGraphExamples/frameGraphExampleGeometryVAT.md), [PlayCanvas API](https://api.playcanvas.com/engine/) |
| 투명 PNG·PSD | 출력 해상도, premultiplication, 색 공간, 위아래 방향, 카메라 crop, snapshot 원자성이 핵심이다. Unity/Godot/Unreal에서도 ToonStudio 레이어 의미와 합성 규칙을 새로 구현해야 한다. Pixel Streaming 영상은 PSD 레이어 전달 수단이 아니므로 원본 무손실 파일을 별도 생성·전달하는 설계가 필요하다. |
| rig/IK·손/발 접촉 | 현재 VRM와 순수 two-bone solver를 재사용할 수 있다. 엔진에 뼈·애니메이션 API가 있어도 의도한 손 접촉·발 고정·관절 제한·편집 undo가 자동 완성되지는 않는다. 후보별 최종 웹 빌드에서 현재 VRM의 humanoid·expression·spring bone·pose round-trip을 재검증해야 한다. |
| 물리·cloth | 현재 Rapier와 별도 캐릭터 보정이 있다. Babylon 공식 Havok 초기화, PlayCanvas 공식 Ammo WASM 물리가 확인된다. rigid-body 지원을 의상 self-collision·체형 적응 cloth의 완성도로 확장 해석하지 않는다. 각 후보의 필요한 cloth 기능은 동일 의상으로 추가 실험 대상이다. [Havok 연동](https://github.com/BabylonJS/Documentation/blob/master/content/setup/frameworkPackages/es6Support.md), [PlayCanvas 물리](https://developer.playcanvas.com/user-manual/react/guide/physics/) |
| VRM·자산 | three-vrm은 Three용이며 UniVRM은 Unity용 별도 경로다. glTF를 읽는 것만으로 VRM MToon·표정·spring bone·휴머노이드 의미가 보존된다고 볼 수 없다. [three-vrm](https://github.com/pixiv/three-vrm) |
| 품질 좋은 기본 자산 | 얼굴 topology, 변형용 morph, UV, 헤어·의상 제작 품질과 라이선스는 렌더러 밖의 문제다. 엔진 교체로 저품질 자산을 보완한다는 계획은 채택하지 않는다. |

## 라이선스와 자산 호환성

| 범위 | 확인 결과와 적용 경계 |
| --- | --- |
| Three | MIT. [공식 LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| Babylon | Apache-2.0. [공식 저장소](https://github.com/BabylonJS/Babylon.js) |
| PlayCanvas Engine | MIT 계열 허용 조건과 저작권 고지 유지 의무가 공식 LICENSE에 있다. Engine과 호스팅 Editor 서비스 조건은 별개다. [공식 LICENSE](https://github.com/playcanvas/engine/blob/main/LICENSE) |
| Godot | MIT, 배포 시 엔진·포함된 제삼자 고지 의무를 확인한다. 제작 콘텐츠에 엔진 라이선스를 강제하지 않는다고 공식 설명한다. [공식 라이선스](https://godotengine.org/license/) |
| Unity | 독점 소프트웨어 약관이다. 2026-06-30 약관은 서비스 제공자·Platform의 별도 권한 가능성과 최종 사용자에게 Editor 기능/처리를 SaaS로 제공할 때 별도 권한 조항을 포함한다. ToonStudio의 구체적 모델에 적용될 조건은 도입 결정 전에 확인해야 하며, 일반 게임 배포 조건으로 자동 충족한다고 판단하지 않는다. [공식 약관 §2](https://unity.com/legal/editor-terms-of-service/software) |
| Unreal | 이 조사에서 최신 EULA의 ToonStudio SaaS/저작 도구 적용 조건까지 확인하지 않았다. 엔진 후보라는 이유로 사용·재배포·운영 권한이 확보되었다고 기록하지 않는다. |
| 모델·텍스처·VRM | 엔진 라이선스와 별개로 각 자산의 수정·상업 이용·재배포·아바타 사용 범위를 확인한다. VRM 1.0은 지정된 허락·제한을 포함하는 별도 모델 라이선스 체계다. [VRM Public License 1.0](https://vrm.dev/en/licenses/1.0/) |

## 이번 실행에서 얻은 결과

현재 작업의 재실행 결과: `/private/tmp/shaper-qa/webgpu-engine/summary.json`, `browser-result.json`. Chromium **151.0.7922.34**, 실제 WebGPU renderer device가 **google/swiftshader, fallback=true**, WebGL도 **SwiftShader**인 소프트웨어 실행으로 확인했다. 기기 이름을 추측하거나 이 결과를 실제 GPU 성능으로 표시하지 않는다.

| 96×64 제한 fixture | 현재 실행 결과 | 해석 |
| --- | --- | --- |
| opaque WebGPU 대 WebGL2 | RGB/alpha 최대 차이 0, depth 최대 차이 약 1.788×10⁻⁷ | 해당 단순 fixture의 출력 계약 일치를 확인했다. |
| transparent WebGPU 대 WebGL2 | 합성 RGB 최대 차이 0, alpha 차이 0 | 완전 투명 픽셀의 보이지 않는 RGB 차이는 별도 취급한다. |
| VRM MToon | 두 backend 모두 coverage 1,874/6,144. 합성 채널 최대 차이 125/255, alpha 최대 차이 255, 차이 4 초과 채널 230/18,432(약 1.25%) | 캐릭터 backend 자동 전환을 허용할 근거가 아니다. 기존 `webgl-only-vrm-character` 보호를 유지한다. |
| device loss | 이 실행에서 관측 0 | 짧은 fixture 결과이며 장시간 안정성 보장이 아니다. |

검증 스크립트 PASS는 모든 재질이 동등하다는 뜻이 아니다. 위 MToon 차이를 감지하고 의도한 보호 정책을 지킨 상태가 PASS에 포함된다. 해당 실행은 비교 성능, 브라우저 전체, 모바일, 4K 원고, Shaper 동등 품질의 증거가 아니다.

**Babylon 전문 출력의 실기기 두 proof shard를 통과했다.** `pnpm run verify:studio-3d-console`, Chromium 151.0.7922.34의 headed 브라우저에서 실제 생성된 device의 adapter 정보가 `vendor=apple`, `architecture=metal-3`, `isFallbackAdapter=false`였다. 모델명은 이 adapter 정보가 노출하지 않아 추측하지 않는다. 로그는 `/private/tmp/shaper-3d-console-final.log`에 기록했다.

- Babylon WebGPU와 WebGL2의 beauty/depth/normal 정렬: 64×64 fixture 통과.
- canonical top-down object/material ID: row packing이 다른 폭 63·65×64에서 통과.
- Magic 레이어와 원고 PNG: exact 320×180, pillarbox 180×180, letterbox 320×80에서 IoU 1.0, 경계 상자 및 중심 차이 0, worker→PNG 알파 차이 0.

이는 현재 제한된 무텍스처 장면의 출력 정합성 증거다. 텍스처·VRM·큰 장면·고해상도·실기기 성능 비교로 확장하지 않는다. 전체 3D console의 편집 수명주기 검증 결과는 구현 보고서에서 구분한다. 과거 문서의 성능 개선율은 현재 측정치로 인용하지 않는다.

이번 작업의 구현 측정도 구분한다. PSD normalized Multiply/Screen helper의 65,536개 채널 쌍 및 혼합 색 시험은 불투명 RGBA8 재합성 오차 1 이하를 검증했다. 이는 Photoshop/CSP 전체 PSD 합성 실기 검증이 아니며 반투명 가장자리는 별도 대상이다. 카메라 AABB 코너 투영의 독립 무작위 2,000건 시험은 유효 1,649건에서 클립 위반 0이었다. 이 시험은 뒤에 추가된 출력 safe-frame 조합 전체의 실기 검증을 대신하지 않는다.

## 도입 실험과 통과 조건

기존 `studio-bg3d-engine-benchmark-analysis.ts:19-26`은 큰 장면 p95 25% 이상 개선 또는 편집 객체 수 2배, 장면 회귀 5% 이하, 입력 p95 100 ms 이하, gzip 증가 15% 이하, 30분 이상 soak를 기준으로 둔다. 이는 **프로젝트의 도입 기준**이며 이미 달성한 결과나 타사 성능 수치가 아니다. hardware·capture·문서·undo·golden·복구 검증도 함께 필요하다.

| 순서 | 구체적인 실험 | 승격 조건 |
| --- | --- | --- |
| 1 | Three의 동일 고정 문서에서 2K/4K PNG·최대 2K PSD, 가로/세로 crop, 선택/숨김, idle/IK/cloth 동작 중 취소·재시도 | 규격 크기, 동일 snapshot, 취소 후 정상 편집, 원고 합성·알파 경계의 시각 검증 |
| 2 | 기존 Babylon specialist에 정적 텍스처 장면 1종을 우선 지원하고 Three 출력과 비교 | 같은 문서·자산 SHA, 카메라·crop·색 공간, depth/normal/ID 정렬 및 asset provenance 보존 |
| 3 | Character capture를 기존 엔진 독립 artifact 계약에 연결 | 기존 MToon·Surface Ink·옷·손 접촉·PSD 결과를 보존하고 backend 교환 없이도 capture 계약 시험 가능 |
| 4 | 실제 GPU와 모바일에서 Three WebGL/WebGPU, Babylon을 동일 장면으로 실행 | 실제 장치·backend 기록, cold/warm startup·p95 frame/input·메모리·readback·30분 안정성 측정. 위 기존 성능·회귀 기준 충족 |
| 5 | PlayCanvas는 앞 후보로 해결되지 않는 측정 병목이 남을 때 최소 adapter 작성 | 동일 자산·동일 출력 계약·동일 화면 크기로 비교하며 새로운 UI 기능 개발을 섞지 않음 |
| 6 | Unity/Godot/Unreal은 웹 경로로 충족할 수 없는 필수 품질이 재현될 때 별도 proof-of-concept | 사용 조건, 기동·메모리·입력·저장·파일 출력·서버 비용까지 포함한 제품 가치가 전환 비용보다 크다는 근거 |

큰 원고 출력은 색상·깊이·법선·ID·중간 합성 버퍼가 중첩되므로, 작은 뷰포트 FPS만 비교하면 판단이 틀릴 수 있다. 메모리는 동일 출력 크기와 동시 버퍼 수로 측정한다. 게임 엔진의 WASM 다운로드·초기화·자산 업로드, 웹 엔진의 shader compile·decode, 서버 엔진의 세션 생성·왕복 지연을 각각 기록한다. 측정 전 MB·FPS·로딩 초 수를 임의로 제시하지 않는다.

## 현재 적용할 개선과 남는 한계

이번 변경은 Three 편집 경로에서 고해상도 명시 출력, 원자적 export 소유권·취소, 포즈/보조 움직임 정지, PSD 음영 재합성, 다중 선택 코너 기반 프레이밍, 렌즈 구도와 실제 편집 명령 연결을 개선한다. 이는 엔진 유지가 아무 작업도 하지 않는 선택이라는 뜻이 아니라, 이미 재현된 품질 결함의 원인을 직접 제거하는 작업이다.

완료 판단은 기능 이름 수가 아니라 출력 정합성과 실제 작업 성공률로 한다. 자산 조형·UV·체형 변형, 정교한 의상 충돌, 그림용 선화, 큰 장면의 실기기 성능과 경쟁 앱과의 동일 조건 시각 비교는 여전히 남는다. 현재 근거로 전체 재개발이나 특정 게임 엔진 교체가 Shaper 동등 품질을 보장한다고 결론내릴 수 없다.
