# Scene3D Wave B — 실제 HDR 캡처와 GPU 자원 수명 연결

상태: **구현 및 로컬 검증 완료**. PR #1833의 후속 구현이며, 운영 배포 또는 전체 장기 계획 완료를 의미하지 않는다.

## 실제 제품 경로에 연결한 변경

- Three WebGPU BG3D 캡처의 선형 중간 버퍼를 RGBA16F로 변경했다. 최종 결과는 기존 straight-alpha / sRGB / top-down RGBA8 계약을 유지한다.
- WebGL2는 `EXT_color_buffer_float`가 있을 때 같은 HDR 중간 버퍼를 사용한다. 해당 기능이 없는 WebGL2 장치는 기존 RGBA8 경로를 유지한다. 렌더 엔진을 자동 전환하지 않는다.
- 색상만 출력하는 캡처는 최대 16,777,216 pixels, 단일 변은 최대 8192로 제한한다. 4096×4096 컬러 결과를 만들 수 있으며, LT/깊이 처리는 기존 8,388,608 pixels 제한을 그대로 유지한다.
- renderer별 캡처 자원 풀은 활성/유휴/정렬된 GPU readback 예상량을 함께 계산한다. 총 예산은 512 MiB, 유휴 유지 한도는 64 MiB/2세트다. 과도한 요청은 GPU 할당 전에 거부한다.
- 읽기 작업이 끝난 자원만 다시 빌려준다. 요청 실패, adapter 해제, renderer 해제, device loss 경로를 명시적으로 연결했다.
- 다른 R3F View가 다시 마운트되어도 이전 View의 미완료 GPU 복사를 같은 예산에 포함한다. 마운트 반복으로 메모리 예산을 우회하지 않는다.
- 한 패스가 동기적으로 실패하더라도 이미 제출된 다른 패스의 Promise를 모두 관찰한 후 자원을 해제한다.
- 캡처 중 변경한 MRT, render target, cube face/mip, viewport, scissor, XR, clear color/alpha를 복원한다. clear color는 hex 변환을 거치지 않아 선형/HDR 값의 정밀도를 보존한다.
- `StudioBg3dCaptureBridge`는 늦게 만들어진 adapter 및 unmount 자원을 해제한다. 실제 renderer의 `dispose()`에도 자원 소유권을 연결해 R3F 직접 해제 경로를 덮는다.

## 구현 위치

- `apps/web/src/domains/creator/scene3d/studio-scene3d-resource-pool.ts`
- `apps/web/src/domains/creator/scene3d/studio-scene3d-resource-owner.ts`
- `apps/web/src/domains/creator/bg3d/studio-bg3d-capture-budget.ts`
- `apps/web/src/domains/creator/bg3d/studio-bg3d-three-webgpu-capture.ts`
- `apps/web/src/domains/creator/bg3d/studio-bg3d-three-webgl-capture.ts`
- `apps/web/src/domains/creator/bg3d/studio-bg3d-three-webgpu-renderer.ts`
- `apps/web/src/domains/creator/bg3d/StudioBg3dCaptureBridge.tsx`

WebGPU 구현 식별자는 `studio-three-webgpu-capture-adapter-v2-hdr-owned`다. 과거 저장 출력의 V1 상수는 제거하지 않았다.

## 실 GPU 검증

새 하네스는 production renderer factory와 capture adapter를 직접 사용한다.

- Chromium: 151.0.7922.34
- 실제 renderer device: `vendor=apple`, `architecture=metal-3`, `isFallbackAdapter=false`
- 이 정보만으로 특정 GPU 모델명을 추측하지 않는다.
- 선형 RGB `[4, 1, 0.25]`에 대한 Reinhard + sRGB 독립 수식의 예상 RGBA: `[231, 188, 124, 255]`
- WebGPU와 WebGL 모두 같은 RGBA를 반환했다. 해당 fixture의 전체 채널 최대 차이는 **0**이었다.
- 최초 64×64 캡처 이후 8번 반복에서 추가 render target 할당은 **0**이었다.
- 2048×2048 컬러 출력: **16,777,216 bytes**.
- 4096×4096 컬러 출력: **67,108,864 bytes**.
- 위 모든 캡처에서 사용한 render target **7개 모두 dispose 이벤트**를 확인했다.
- 최종 실행의 2K/4K 캡처 경과 시간은 약 9.3/40.5 ms였다. 단색 HDR 평면 fixture의 1회 캡처 값이며, 복잡한 캐릭터/배경 장면의 성능이나 개선율로 해석하지 않는다.
- 브라우저 page/console/request 오류: **0**.

하네스:

```bash
pnpm run verify:studio-scene3d-capture-resources
# GPU가 없는 장비의 별도 소프트웨어 검증 경로
SCENE3D_CAPTURE_GPU_LANE=swiftshader pnpm run verify:studio-scene3d-capture-resources
```

JSON과 screenshot은 `TOONSPECTRUM_VERIFY_DIR` 또는 임시 디렉터리에 생성한다. 생성된 바이너리/QA 결과는 Git에 넣지 않는다.

## 기존 브라우저 회귀

`verify-studio-bg3d-webgpu-engine.mjs`는 별도의 SwiftShader lane이다. 실제 GPU 성능 검증과 구분한다.

첫 cold-cache 실행에서는 Vite가 도중에 의존성을 재최적화해 로더 요청이 취소되고 빈 픽셀이 관찰됐다. Three/WebGPU/TSL/OutputPass를 명시적으로 사전 번들링하고 동적 의존성 재탐색을 막은 뒤, 새로운 캐시 디렉터리에서도 검증이 통과했다.

- WebGPU/WebGL2 opaque 및 transparent 캡처 비교
- depth 비교
- KTX2 두 renderer 초기화
- VRM 기존 허용 오차 및 backend 보호 정책
- 인앱 브라우저 선택/거부 정책
- 최종 `failures: []`

VRM 전체 WebGPU 색상 동등성을 달성한 것은 아니다. 기존 MToon 보호와 WebGL 전용 제약은 유지한다.

## 자동 검증

- 확장 Scene3D/캡처/복구/샷 배치 회귀: **61개 파일, 540개 테스트 통과**.
- professional completion: **28개 파일, 130개 테스트 통과**. 자원 풀, 소유권, HDR 캡처, renderer teardown, 분리된 해상도 예산 검사를 추가했다.
- 웹 TypeScript 검사 통과.
- 변경된 TypeScript/TSX/MJS 파일에 대한 strict lint 통과.
- `pnpm run build:bundle` 통과: prebuild, Vite production build, third-party notices, static CSP 검사 포함. 기존 dependency externalization 등 bundler warning은 전체 무경고로 표시하지 않는다.
- 오래된 capture boundary 테스트가 독립 `setSceneBaseDocument` undo/redo 호출 두 개를 기대하던 것을 현재 공통 command history + 원자적 canonical-state 교체 계약으로 갱신했다. 검증을 skip하지 않았다.

## 이번에 완료하지 않은 범위

이번 자원 풀은 **실제 캡처 render target**에 적용된다. 전체 모델/텍스처 자산의 자동 eviction, GPU timestamp profiler, 완성된 MRT/NPR 실행기, CSM/TAAU/SSGI/SSS, Gaussian Splat, GPU XPBD, closed-chain IK, 엔진 의존성 업그레이드까지 완료한 것은 아니다. 기존 candidate capability를 근거 없이 true로 변경하지 않았다.

다음 구현의 직접 연결점은 이 자원 소유권에 MRT attachment를 붙이고, semantic depth/normal/ID 결과를 기존 Scene3D NPR planner의 실제 executor로 연결하는 부분이다. 자산 원본/문서/undo를 변경하지 않는 경계를 유지한다.
