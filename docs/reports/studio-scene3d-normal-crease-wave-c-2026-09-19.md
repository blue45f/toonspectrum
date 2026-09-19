# Scene3D Wave C — geometry MRT와 각도 기반 LT 선화

상태: 실제 편집기·컷 배치 출력 경로 구현, 로컬 검증 완료. main 머지·운영 배포 또는 장기 고도화 전체 완료를 뜻하지 않는다.

최초 기준 main: `bb0d1979d685d0353a499f3e3ddfdb0c63bea98f` (PR #1833).
재개 시 `27d99f1e5fd9e0fd817e32bf8def5be7b66a6402` main을 병합한 뒤 아래 검증을 다시 실행했다.
작업 브랜치: `feat/scene3d-output-quality-20260919`.

## 해결한 사용자 문제

LT 선화의 `creaseAngleDegrees`는 범위 검증은 있었지만 실제 표면 법선의 각도를 비교하는 단계에는 연결되지 않았다.
이번 변경은 기존 설정을 사용해 선화 픽셀이 실제로 달라지게 한다. 새 문서 필드나 저장 형식 마이그레이션은 없다.

- WebGPU는 기존 beauty + geometry의 두 번 장면 렌더링을 유지하면서 geometry MRT에 depth/normal 두 attachment를 쓴다.
- WebGL2는 독립 MeshNormalMaterial 패스를 비교 기준으로 제공한다. WebGPU 전환이나 숨은 renderer fallback은 없다.
- normal은 **view-space geometry normal**을 RGB8에 인코딩한다. alpha=0은 표면이 없는 픽셀이다. 원본 재질의 normal map을 복원하는 shaded-normal 출력으로 주장하지 않는다.
- 깊이 불연속의 먼 쪽과 빈 배경은 법선 꺾임 선에서 제외한다. 같은 깊이의 경계는 한쪽에만 선을 기록한다.
- `depthOutlineOnly`를 선택하면 기존 윤곽선 경로를 유지한다. normal 없이 호출하는 기존 LT 입력도 유지한다.
- 캔버스로 LT 삽입, 여러 컷의 PNG/PSD artifact 생성에 같은 normal 입력을 전달한다. normal 자체를 새 PNG/PSD 레이어로 내보내는 기능은 이번 범위가 아니다.

## 실제 데이터 흐름

`live scene/camera → color + paired depth/normal capture → owned arrays → LT module Worker → main-line raster → insert / shot artifact`

추가 계약:

- capture request: 선택적 `includeNormals`; paired depth 필수
- adapter capability: `studio-view-normal-rgba8-topdown-v1`
- request/result 검증은 미지원 profile, depth 없는 normal, 누락·길이 불일치·요청하지 않은 normal 반환을 거부
- normal 출력은 다른 캡처가 재사용하거나 변경할 수 없도록 명시적으로 복사
- LT Worker protocol은 2로 변경하고 이전/알 수 없는 버전을 거부
- Worker에는 소유권이 분명한 ArrayBuffer 사본을 전송하며 caller storage를 detach하지 않음
- geometry MRT allocation/readback 비용을 기존 renderer별 자원 풀 예산에 포함
- normal 복사 제출이 동기 실패해도 앞서 제출한 depth fence가 끝나기 전에 자원을 해제하지 않음

WebGPU 구현 식별자는 `studio-three-webgpu-capture-adapter-v3-hdr-mrt-normals`다.
기존 캡처 owner revision 검증이 이전 배치 결과와 새 출력을 섞지 않도록 유지된다.

## 재개 작업: 캡처 복구 결함 수정

분할 viewport와 비동기 GPU copy가 함께 있을 때의 경계를 추가 검증했다.
수정 전 WebGL 회귀 3개, WebGPU 회귀 2개가 실제 실패하는 것을 먼저 확인했다.

- WebGL depth pass가 active cube face/mip, viewport, scissor, scissor-test를 모두 복구하도록 수정했다.
- WebGL depth/normal/color 및 WebGPU color/geometry에서 복구 함수가 예외를 던져도 이미 제출한 GPU copy가 끝날 때까지 기다린다.
- pending copy가 있는 render target을 조기에 dispose하거나 pool에 돌려주지 않는다.
- normal/geometry 복구 예외에서도 depth-excluded 접지 그림자 객체의 가시성을 되돌린다.
- 테스트 7개를 추가했다. 정상 복구, 복구 예외, GPU readback 수명과 visibility를 각각 검사한다.
- 실 브라우저에서도 non-default framebuffer/viewport/scissor를 설정한 상태에서 전체 캡처 후 정확히 복원되는 것을 확인한다.

## 실 브라우저 검증

Chromium `151.0.7922.34`. 프로덕션 renderer factory와 capture adapter, 실제 Vite module Worker를 사용했다.

| 검증 | 실제 Apple GPU | SwiftShader 소프트웨어 GPU |
|---|---:|---:|
| 실제 device vendor | apple | google |
| 실제 device architecture | metal-3 | swiftshader |
| isFallbackAdapter | false | true |
| HDR WebGPU/WebGL 최대 채널 차이 | 0 | 0 |
| WebGL framebuffer/viewport/scissor 복원 | 통과 | 통과 |
| 직교 normal 최대 채널 차이 | 0 | 0 |
| 65×63 원근 normal 비교 표면 픽셀 | 1585 | 1586 |
| 원근 coverage 불일치 픽셀 | 0 | 0 |
| 원근 normal 최대 채널 차이 | 0 | 0 |
| 8회 warm capture 추가 render target | 0 | 0 |
| 전체 render target / dispose 확인 | 13 / 13 | 13 / 13 |
| page/console/request 오류 | 0 | 0 |

독립 HDR 수식의 예상 색 `[231, 188, 124, 255]`, 평면 normal `[128, 128, 255, 255]`와 일치했다.
회전 큐브의 LT Worker 출력 알파 합은 crease 25°/150°에서 실제 GPU `185455` / `146838`, 소프트웨어 GPU `185200` / `146328`였다.
각 장치 안에서 설정이 실제 결과를 바꾼 증거이며 서로 다른 GPU의 픽셀 전체가 동일하다는 의미는 아니다.

2048×2048 / 4096×4096 **컬러 전용** 출력은 각각 16,777,216 / 67,108,864 bytes였다.
Depth/normal/LT는 기존 8,388,608 pixels 예산을 유지한다. 4K 정사각형 전체 멀티패스 완료로 해석하지 않는다.

## 자동 검증

- 확장 Scene3D·캡처·LT·샷 회귀: **73개 파일 / 655개 테스트 통과**.
- 전문 제작 회귀: **34개 파일 / 199개 테스트 통과**.
- 웹 및 API TypeScript 검사 통과.
- 변경된 TS/TSX/MJS 23개 파일 strict lint 통과 (경고 0개).
- `pnpm run build:bundle` 통과. third-party notices 생성 및 static CSP 검증 포함.
- 앞선 Wave C 실행의 `verify-studio-bg3d-webgpu-engine.mjs` 통과 기록 (`failures: []`; 이번 재개에서 별도 재실행하지 않음): 기존 opaque/transparent/depth, KTX2, VRM 허용 오차 및 backend 보호 정책 회귀.
- GPU proof는 `verify-studio-scene3d-capture-resources.mjs`에서 두 lane 모두 통과.

재개 검증 JSON/PNG/로그는 `.qa/scene3d-output-quality/resume/`에 있고 Git에 넣지 않는다.
검증 중 생성된 Vite dependency cache까지 소스로 검사되지 않도록 `/.qa/scene3d-output-quality/`만 정확히 ignore한다. 제품 소스와 테스트 검사 범위는 줄이지 않는다.
위 회귀 집합에는 겹치는 테스트가 있어 통과 수를 더해 독립 테스트 수로 표시하지 않는다.
CI 입력 회귀도 올바른 Vitest runner로 2개 테스트가 통과했다.

재현 명령:

```sh
pnpm run typecheck
pnpm run verify:studio-3d-professional-completion
pnpm exec vitest run scripts/scene3d-output-ci-policy.test.mjs
pnpm run build:bundle
SCENE3D_CAPTURE_GPU_LANE=hardware node scripts/verify-studio-scene3d-capture-resources.mjs
SCENE3D_CAPTURE_GPU_LANE=swiftshader node scripts/verify-studio-scene3d-capture-resources.mjs
```
빌드에는 기존 three-vrm의 조건부 구 API 참조 등 warning이 남아 있다. 무경고 빌드로 주장하지 않는다.

## CI 입력 수정

이전 strict lint 실패의 environment manifest 경로는 올바르고 Git에도 있었다.
원인은 lint sparse checkout이 public assets 전체를 제외하면서 코드가 import하는 두 JSON까지 제외한 것이다.

- refined-v6/manifest.json, expansion-v1/manifest.json만 다시 포함
- 대형 GLB는 계속 제외
- 임시 Git 저장소에서 실제 sparse checkout을 실행하는 회귀 테스트 추가
- 전용 Scene3D CI에서 normal/Worker/insert/shot artifact 계약 테스트를 실행

기존 API 배포용 패키지 해석 오류, 브러시·다른 UI 회귀와 전체 main CI 성공 여부는 이 구현의 로컬 통과와 별개다.
재개 시 PR #1829의 main 수정도 합쳤다. 다른 영역의 회귀를 작업하는 PR #1827을 덮어쓰거나 CI를 우회하지 않는다.

## 남아 있는 범위

완전한 NPR executor, object/material ID와 velocity MRT, GPU 선화 compositor, CSM/TAAU/SSGI/SSS,
전체 자산 eviction, GPU XPBD, IK specialist, Splat 및 엔진 의존성 업그레이드는 아직 완료하지 않았다.
해당 전역 software capability를 이번 작은 MRT 구현만으로 true로 바꾸지 않았다.

이번 pixel corpus는 불투명 평면·회전 큐브·직교/원근 카메라 중심이다. 임의 VRM 전체, alpha-cutout,
변위·normal-map·복잡한 투명 재질 또는 모바일 실기기의 모든 조합에 대한 동등성을 보장하지 않는다.
30분 soak나 실제 기기의 장시간 FPS 개선율도 이번 결과로 주장하지 않는다.
