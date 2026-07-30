# ToonSpectrum Studio — Babylon.js 제품 활용 전수 검토

- 검토일: 2026-07-31
- 검토 기준: Babylon.js 9.19.0, `@babylonjs/core`, `loaders`, `materials`, `serializers`
- 라이선스: Babylon.js 핵심 패키지 Apache-2.0
- 상태: **격리 specialist 확대 승인 / 대화형 편집 엔진 교체는 보류**
- 관련 ADR: [studio-babylonjs-adoption-evaluation-2026-07-11.md](./studio-babylonjs-adoption-evaluation-2026-07-11.md)

## 결론

Babylon.js는 ToonSpectrum의 모든 2D·3D 기능을 소유하는 범용 엔진보다, 장면의 깊이·노멀·조명·
모션·재질 정보를 이용하는 GPU 제작 기능을 필요할 때만 실행하는 specialist 포트폴리오로 쓰는
것이 가장 가치가 높다.

우선 적용할 축은 다음 여섯 가지다.

1. 장면 인식형 웹툰 필터와 시네마틱 배경 FX
2. 3D 장면을 선화·톤·마스크·PSD 레이어로 분해하는 멀티패스 렌더
3. 결정적인 날씨·입자·조명 애니메이션과 영상 내보내기
4. 대규모 배경·군중·도시·Gaussian Splat 렌더링
5. 캐릭터 애니메이션 리타게팅과 물리 기반 소품 배치 보조
6. 자산 검사·썸네일·프리뷰·렌더 진단 specialist

현재 가장 큰 병목은 FX 종류를 v1 union에 계속 추가하는 일이 아니다. 격리 Babylon 런타임과
versioned artifact bundle에 더해 canonical primitive·검증된 자체 포함 core GLB의 제한된
beauty/depth/normal executor, 파싱 후 실제 자원 receipt와 늦게 정착하는 loader 자원의 회수
경계까지 마련됐다. 독립적인 clean local Chromium 실행에서는 WebGL2와 WebGPU 모두 64×64
beauty/depth/normal readback을 통과했다. 다음 핵심 작업은 이 최소 증거를 브라우저·GPU별
straight-alpha·normal packing 골든과 반복 soak로 확장하고, 그 결과를 기존 Three 장면·linked
3D→2D cache/dirty planner에 원자적으로 연결하는 일이다.

Babylon의 런타임 객체는 Studio 문서, undo/redo, CRDT, 저장 파일에 들어가지 않는다. Studio는
계속 엔진 중립적인 장면 문서와 제한된 효과 recipe를 소유하고, Babylon은 검증된 입력을 받아
RGBA·depth·normal·ID 같은 이동 가능한 결과만 반환한다.

```text
canonical SceneDocument + verified asset bytes + bounded recipe
  → isolated Babylon WebGPU job
  → WebGL fallback 또는 기존 엔진 복귀
  → portable RGBA/depth/normal/ID
  → Studio 선택·마스크·LT·레이어·PSD·영상 파이프라인
```

## 현재 구현 상태와 실제 도입 차단점

이 문서는 Babylon 제품 기능을 구현 완료로 표시하는 목록이 아니다. 2026-07-31 현재 저장소에는
다음 **격리 specialist 기반**이 구현돼 있다.

- `@babylonjs/core@9.19.0`, `@babylonjs/loaders@9.19.0` exact 의존성
- 유일하게 승인된 `studio-bg3d-babylon-specialist-entry.ts` lazy entry
- 3D 배경 `보기` 패널의 사용자 명시 WebGL2/WebGPU 진단. 모달 open, hover/focus, render,
  `CaptureBridge`는 entry를 가져오지 않으며 backend는 자동 fallback·재표시하지 않음
- WebGL/WebGPU 초기화, 단일 작업 직렬화, abort, context/device loss, dispose를 소유하는
  Babylon lifecycle runtime
- beauty/depth/normal/object ID/material ID/shadow/AO/emission/velocity를 제한된 typed-array로
  반환하는 `artifact-capture-v2` 계약과 fail-closed 검증
- Babylon 패키지를 전용 manual chunk로 격리하고 앱·Studio·3D 편집기 정적 그래프 유입을
  금지하는 manifest bundle guard
- Babylon WebGL/WebGPU specialist를 표현하는 runtime ID·capability와 topology 계약
- bounded `webtoon-fx-capture` v1 요청과 RGBA/depth 결과 검증
- line/depth/object-ID/normal/combined의 renderer-neutral linked-render planner
- LT Worker, shot batch, PSD, WebCodecs, thumbnail로 이어지는 기존 소비 경계
- canonical primitive와 검증된 자체 포함 core GLB를 Babylon scene으로 복원해 beauty RGBA8,
  linear normalized depth, view-space octahedral RG8 normal을 반환하는 제한된 실제 executor
- GLB JSON preflight 뒤 Babylon public scene delta에서 mesh/node/geometry/draw/triangle,
  material/texture 크기·mip 추정, animation/keyframe/value, skeleton/joint, morph와 decoded
  geometry byte를 재계수하고 증폭을 fail-closed하는 post-parse resource receipt
- abort·60초 timeout이 먼저 끝난 뒤 `ImportMeshAsync`가 늦게 resolve/reject해도 partial scene
  delta와 반환 자원 그래프를 한 번만 폐기하는 late-settle cleanup
- 한 후보가 완전히 실패한 뒤에만 다음 후보를 실행하고 partial artifact를 섞지 않는
  renderer-neutral 원자적 failover 기반
- bounded artifact bundle을 소비하는 CPU toon-outline, depth-atmosphere, emissive-bloom 기반

다만 UI에서 연결된 Babylon 호출은 사용자가 직접 누르는 격리 진단뿐이다. 이 진단은 분리
캔버스에서 `runtime-metrics`를 확인한 다음 64×64 canonical primitive의 beauty RGBA8, linear
normalized depth, view-space octahedral RG8 normal을 요청·검증하도록 연결됐다. executor와
normal packing/readback은 자동 테스트를 통과했고, 2026-07-31 local Chromium 150의
cross-origin-isolated production preview에서 독립 clean 실행 기준 WebGL2와 WebGPU 모두 실제
beauty/depth/normal 진단을 통과했다. WebGPU clean 실행 측정값은 2,739ms였다. 다만 서로 다른
백엔드를 같은 탭에서 연속으로 반복하는 soak에서는 GPU→CPU readback이 지연돼 60초 fail-closed
timeout에 도달하는 사례가 있어, 이 결과를 다중 브라우저·GPU 안정성 골든 완료로 확대 해석하지
않는다. 실제 executor도 작품 결과 provider나 기존 Three 장면, linked render, LT, 필터 commit,
shot batch에는 아직 연결되지 않았다. beauty/depth/normal은 canonical primitive와 검증된 자체
포함 core GLB의 제한 범위만 구현됐으며, object ID/material ID/shadow/AO/emission/velocity는
계약만 있고 실제 Babylon pass는 없다. CPU FX와 원자적 failover도 foundation·단위 테스트
단계이지 프로덕션 배선 완료 상태가 아니다.

GLB 허용 범위도 의도적으로 좁다. 현재 image/texture를 포함한 GLB와 Draco·Meshopt·BasisU 등
외부 decoder가 필요한 GLB는 계속 preflight에서 거부한다. post-parse texture dimension·mip
receipt가 생겼다는 이유로 이 입력 정책이 자동 완화된 것은 아니다.

남은 운영 연결 과제는 다음과 같다.

1. local Chromium에서 통과한 WebGL2/WebGPU 실제 readback을 Chrome·Edge·Safari Technology
   Preview와 주요 GPU vendor matrix로 확장해 BGRA/RGBA, Y축, premultiplied 여부와 반복
   readback 지연을 골든/soak로 고정한다. 출력은 항상 top-down straight-alpha sRGB와 깨끗한
   transparent RGB로 정규화한다.
2. 구현된 GLB post-parse receipt를 실제 WebGL2/WebGPU corpus에서 골든으로 고정한다. 현재
   mesh·material·texture dimension/mip·animation·skeleton·morph·decoded geometry 증폭은
   재검사하지만, texture/decoder GLB 자체는 아직 허용하지 않는다.
3. 작품 기능이 요청될 때만 승인된 lazy entry를 runtime adapter registry와 linked-render
   provider에 등록한다. 현재 진단 activation을 작품 결과 activation으로 오해하면 안 된다.
4. canonical Three 장면과 제한된 Babylon scene의 beauty/depth/normal 골든을 확정한 다음,
   object/material ID 실제 pass를 구현한다.
5. 한 capture의 color와 depth/normal/ID를 서로 다른 엔진에서 섞지 않는다. Babylon pass 하나라도
   실패하면 renderer-neutral atomic failover를 통해 해당 capture 전체를 다음 provider에서 다시
   만들고, 검증된 결과 하나만 commit한다.
6. shot batch를 시작하면 engine, backend, adapter revision, output profile, recipe를 끝까지 고정한다.
   WebGPU 실패를 이유로 batch 중간부터 WebGL·Three 결과를 섞지 않는다.
7. 현재 PSD 계약은 최대 4개 레이어, 2,097,152 canvas pixels, 128 MiB다. normal·ID·shadow·emission을
   모두 넣으려면 lazy artifact manifest와 선택적 pass를 갖는 PSD/export vNext가 필요하다.
8. 현재 `lt-source` v1은 depth와 `toon-outline`만 허용하지만 downstream LT도 선화를 추출한다.
   clean beauty+depth와 pre-outline+depth를 실제 장면에서 A/B 비교해 이중 외곽선·halo가 생기면
   `toon-outline`을 beauty 전용으로 제한해야 한다.
9. reader에서는 페이지마다 engine/context를 만들지 않고, 보이는 페이지 묶음이 공유하는
   surface 하나와 last-good baked artifact를 사용해야 한다.

따라서 다음 코드 단계는 effect union을 늘리는 패치가 아니라
**브라우저 readback/straight-alpha/normal·post-parse receipt 골든 + 운영 activation +
실제 object/material ID·emission pass + 원자적 provider commit**이다.

## Babylon.js 9 계열에서 특히 주목할 기능

Babylon.js 9.0은 ToonSpectrum과 직접 연결할 수 있는 기능을 다수 추가했다.

- Clustered Lighting: 많은 광원을 화면 타일과 깊이 구간으로 나눠 계산
- Textured Area Lights: 이미지 자체를 면광원으로 사용하는 조명
- Node Particle Editor, Particle Flow Maps, Attractors
- WebGPU compute 기반 Volumetric Lighting과 WebGL 2 fallback
- 정식 v1 Frame Graph와 Node Render Graph
- 서로 다른 스켈레톤 사이 Animation Retargeting
- PLY·Splat·SPZ·SOG/SOGS와 compound scene을 포함한 Gaussian Splat
- Large World/Floating Origin, Geospatial Camera, 3D Tiles
- Physically Based Atmosphere
- Dynamic IBL Shadows
- Signed Distance Field Text
- 새로운 Outline Renderer
- 개선된 Nav Mesh, Audio, 3MF Export

공식 개요는 [Babylon.js 9.0 발표](https://babylonjs.medium.com/welcome-to-babylon-js-9-0-c3edc9ee6428),
[WebGPU 문서](https://doc.babylonjs.com/setup/support/webGPU/),
[Frame Graph](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview/)를
기준으로 검토했다.

## 전체 활용 매트릭스

### P0 — 바로 PoC할 가치가 높은 기능

| 제품 기능 | Babylon 활용 | 작가 가치 | 현재 연결 지점 | 판정 |
| --- | --- | --- | --- | --- |
| 3D Magic Layer | object/material ID + depth/normal | 벽·창문·인물·재질·깊이를 클릭해 즉시 선택·필터·레이어 분리 | linked render + selection/mask | 즉시 PoC |
| 연결형 3D 배경 레이어 | pass별 cache/dirty refresh | 3D 카메라·조명을 바꿔도 손으로 보정한 2D 레이어 유지 | `studio-bg3d-linked-render-state.ts` | 즉시 PoC |
| 툰 외곽선 | depth·normal 불연속과 Outline Renderer | 3D 배경의 인공적인 면을 웹툰 선화로 즉시 변환 | `studio-bg3d-webtoon-fx.ts`, LT Worker | 즉시 PoC |
| 깊이 안개 | depth-aware post-process | 실내·거리·산악 원근을 슬라이더 한 번으로 연출 | Webtoon FX specialist | 즉시 PoC |
| 체적광·빛기둥 | Volumetric Lighting | 창문빛, 무대광, 숲의 햇살, 공포 장면 연출 | 배경 FX/beauty capture | 즉시 PoC |
| 발광·네온 | emissive + bloom/glow | 야경·간판·마법·SF 컷을 빠르게 제작 | FX recipe `emissive-bloom` | 즉시 PoC |
| 결정적 날씨 | GPU particles + fixed timestep | 비·눈·꽃잎·먼지·불씨를 라이브와 영상에서 동일하게 재생 | `WebtoonFxPlayer`, motion export | 즉시 PoC |
| 깊이 가림 입자 | depth occlusion | 비나 꽃잎이 캐릭터·건물 앞뒤를 자연스럽게 통과 | Beauty/depth capture | 즉시 PoC |
| 제작 보조 패스 | MRT·PrePass·GeometryBuffer | 선화, 선택 마스크, 합성 레이어를 한 장면에서 생성 | Shot batch/PSD | 즉시 PoC |
| 페이지 합성 필터 | 선·벡터·텍스트를 page-composite raster로 만든 뒤 GPU filter | 첨부 이미지가 없어도 그은 선과 도형 전체에 필터 적용 | 필터 composite/commit 경계 | 즉시 PoC |
| 빈 레이어 생성형 필터 | ProceduralTexture·full-screen pass | 첨부 이미지 없이 안개·빛·톤·노이즈·구름 레이어 생성 | 필터/레이어 삽입 | 즉시 PoC |
| 효과 골든 렌더 | 고정 camera/seed/time + offscreen capture | 라이브와 저장 후 결과가 달라지는 회귀를 조기에 탐지 | runtime adapter/test harness | 즉시 PoC |
| 3D 썸네일 렌더 | 격리 offscreen scene | 다양한 3D 캐릭터·배경 썸네일을 일관된 조명으로 생성 | model thumbnail controller | 즉시 PoC |

### P1 — 첫 PoC 통과 뒤 제품화할 기능

| 제품 기능 | Babylon 활용 | 작가 가치 | 주의점 |
| --- | --- | --- | --- |
| 조명 프리셋 확장 | Clustered Lighting, textured area light | 네온 거리·교실 창·스튜디오·콘서트처럼 다광원 장면 제작 | 편집 장면 소유권은 Three 유지 |
| 시간대 자동 변환 | Physically Based Atmosphere | 같은 배경을 새벽·낮·노을·밤으로 재사용 | 물리 정확성보다 웹툰 스타일 preset 우선 |
| 환경 그림자 | Dynamic IBL Shadows | HDRI·파노라마 배경과 캐릭터 접지를 자연스럽게 연결 | 모바일 품질 단계 필요 |
| 입자 방향 페인팅 | Flow Map | 사용자가 붓으로 바람·연기·비의 흐름을 직접 지시 | flow map도 canonical raster asset으로 저장 |
| 감정장 연출 | Attractor/repulsor particles | 인물 주위 꽃잎·빛·충격파·긴장선을 자동 배치 | wall-clock과 무작위 전역 상태 금지 |
| 3D 속도선·동선·전선 | GreasedLine | 가변 굵기·점선·발광·reveal이 카메라 원근을 따름 | 급격한 각도와 긴 segment 분할 필요 |
| 카메라 애니매틱 | Babylon animation + fixed timeline | 돌리·팬·줌·랙 포커스를 장면 프리셋으로 제작 | 기존 Studio timeline이 시간 권위 유지 |
| 애니메이션 리타게팅 | Babylon retargeting | 체형이 다른 캐릭터가 동작 라이브러리를 공유 | VRM humanoid 표준과 골든 포즈 필요 |
| 물리 기반 소품 정착 | Havok specialist | 의자에 앉히기, 손에 소품 맞추기, 바닥에 자연스럽게 놓기 | 결과 transform만 bake하고 physics world는 폐기 |
| 천·머리·장식 미리보기 | bone/constraint/physics 보조 | 포즈 변경 시 의상·머리·소품의 어색한 관통 감소 | 완전한 의상 시뮬레이션으로 과장 금지 |
| 오브젝트·재질 선택 | object/material ID pass | 3D 배경의 특정 벽·바닥·창문을 한 번에 선택·채색 | stable logical ID legend 필요 |
| 표면 스냅·데칼 | picking, depth, render-to-texture | 포스터·간판·낙서·오염 텍스처를 벽이나 소품에 부착 | UV 없는 모델의 투영 정책 필요 |
| 스케치→지형 | height map ground | 손그림·AI depth map으로 산·언덕·도로의 3D 원근 생성 | 해상도·단위·경계 smoothing 필요 |
| 건축 불리언 | CSG2 specialist | 문·창문·계단·벽 개구부와 배경 매스 편집 | 결과 mesh만 canonical GLB로 bake |
| 웹툰 재질 프리셋 | Cell/Water/Gradient/Procedural material | 셀 셰이딩·물결·그라데이션·격자 배경을 빠르게 적용 | `@babylonjs/materials` 선택 import |
| 카메라별 일괄 렌더 | AssetContainer + isolated scene reuse | 여러 컷·각도·조명 변형을 한 번에 출력 | GPU 자원 수명과 취소 직렬화 필요 |
| Gaussian Splat 배경 | splat loader/rendering | 사진 측량 공간·실사 장소를 웹툰 배경 참고로 사용 | 선화 변환, 라이선스, 대용량 스트리밍 필요 |
| Thin instance 군중·도시 | thin instances | 창문·가로등·나무·학생·차량을 대량 배치 | 개별 편집은 canonical instance record로 유지 |
| 군중 동작 굽기 | baked vertex animation texture | 많은 엑스트라의 짧은 반복 동작을 낮은 draw 비용으로 표시 | 편집용 rig와 출력용 bake 분리 |
| 장면 진단 | instrumentation/Inspector 개념 | 무거운 재질·광원·텍스처·draw call을 작가에게 설명 | Inspector 자체는 개발 모드에만 로드 |
| GPU 효과 그래프 | Node Render Graph 개념 | 비파괴 FX를 연결하고 프리셋으로 공유 | Babylon JSON·임의 셰이더를 문서에 저장하지 않음 |
| 영상·캔버스 필터 | ImageFilter/ThinEngine PoC | 동영상 프레임과 캔버스를 실시간 후처리 | `@babylonjs/controls`는 alpha이므로 비교 PoC만 |
| 선명한 3D 글자 | SDF Text | 간판·전광판·3D 공간 대사·표지판의 확대 품질 유지 | 최종 웹툰 대사는 기존 텍스트 객체가 권위 |

### P2 — 장기 차별화 후보

| 제품 기능 | Babylon 활용 | 가능성 | 보류 이유 |
| --- | --- | --- | --- |
| 유체 연출 | Fluid Renderer | 물·잉크·피·마법 액체 참고와 투명 FX 생성 | 결정성·readback·모바일 비용 검증 필요 |
| 대규모 도시 원고 | Large World/Floating Origin | 초대형 도시·학교·던전 세트를 정밀하게 편집 | 현재 10,000 단위 canonical 좌표와 마이그레이션 필요 |
| 지도 기반 배경 | Geospatial Camera + 3D Tiles | 실제 도시 지형을 원근 자료와 배경으로 활용 | 외부 데이터 권리·네트워크·캐시 비용 큼 |
| 자동 군중 동선 | Nav Mesh | 엑스트라의 보행 경로와 시선 방향 자동 생성 | 정지 웹툰의 우선순위보다 낮음 |
| 읽기 전용 XR 세트 탐색 | WebXR | 작가가 장면 안에 들어가 카메라 위치를 찾음 | 기기 지원과 멀미 UX, 편집 권위 분리 필요 |
| XR 손 포즈 캡처 | WebXR hand tracking | 손 모양을 캐릭터 포즈 참고로 변환 | 관절 매핑 품질·브라우저 편차 검증 필요 |
| 공간 음향 프리뷰 | Audio V2 | 모션 웹툰·PV의 위치 기반 사운드 미리보기 | 핵심 창작 기능보다 낮고 기본 비활성 |
| 3MF 출력 | serializer | 피규어·소품 3D 프린트 내보내기 | 웹툰 본 작업과 거리가 멂 |
| OpenPBR 교차 검사 | OpenPBR alpha | DCC 간 재질 일관성 검사 | alpha 기능이고 canonical 재질로 채택하기에는 이르다 |

### 비권장 또는 명시적으로 금지할 활용

| 비권장 설계 | 이유 |
| --- | --- |
| Three/R3F 편집 장면을 Babylon으로 즉시 교체 | VRM·선택·기즈모·undo·소품 부착을 다시 구현해야 하고 두 엔진 병행 비용만 커짐 |
| Three와 Babylon이 같은 편집 scene을 동시에 소유 | 카메라·본·재질·GPU 리소스 동기화가 매 프레임 발생 |
| 모든 밝기·커브·색상 필터에 Babylon 사용 | 엔진 활성화·렌더 타깃·readback 비용이 단순 연산보다 큼 |
| Babylon scene/material/node graph JSON을 canonical 저장 | 버전·엔진 종속성이 작업 파일과 협업 CRDT에 침투 |
| 사용자 WGSL·GLSL을 그대로 실행 | GPU hang, 정보 노출, 자원 증폭, 저장 호환성 위험 |
| 매 프레임 GPU→CPU readback | 필기·조작 지연과 모바일 발열 증가 |
| Babylon GUI로 Studio 전체 메뉴 재작성 | React 접근성·디자인 시스템·상태 소유권을 잃음 |
| Babylon 런타임 객체를 CRDT로 동기화 | 충돌 병합이 불가능하고 직렬화 안정성이 낮음 |
| 서버 Babylon 렌더를 기본값으로 사용 | 서버 GPU 비용과 작업 대기 시간이 증가 |
| Inspector·Editor를 프로덕션 기본 번들에 포함 | 제작 기능과 무관한 대형 개발 도구 비용 발생 |

## 1. 필터와 생성형 FX

### 1.1 장면 인식형 후처리

Babylon Frame Graph/Node Render Graph는 렌더, depth/normal 생성, blur pyramid, 합성, readback을
명시적인 DAG로 구성하고 임시 텍스처 수명을 최적화할 수 있다. 다음 필터는 기존 평면 필터보다
Babylon specialist에서 의미가 크다.

- depth-aware blur와 tilt-shift
- fog, aerial perspective
- volumetric light, god ray
- emissive bloom, glow, neon bleed
- heat haze, glass/refraction, water ripple
- chromatic aberration과 렌즈 왜곡
- SSAO 기반 접촉 그림자
- motion vector 기반 motion blur
- depth/normal 기반 edge와 curvature
- 재질·오브젝트별 선택 후 색 보정

Frame Graph는 texture allocation 재사용을 지원하지만, back buffer를 입력으로 읽는 post-process에는
제약이 있으므로 specialist는 항상 명시적 offscreen texture를 source/output으로 사용해야 한다.
[Frame Graph 클래스 개요](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphClassFramework/frameGraphClassOverview/),
[Frame Graph FAQ](https://doc.babylonjs.com/features/featuresDeepDive/frameGraph/frameGraphFAQ/)

### 1.2 입력 이미지가 없어도 작동하는 필터

필터 입력은 업로드 이미지 노드로 제한하지 않는다. 현재 페이지의 선·브러시·벡터 도형·텍스트·
배경을 page-composite raster로 만든 뒤 GPU provider에 전달하면, 사용자가 그은 선만 있는
페이지에서도 일반 필터와 장면 효과를 적용할 수 있다. 선택 영역 또는 선택 레이어만 합성하면
“선택한 영역만 필터”도 같은 경계에서 처리할 수 있다.

빈 캔버스에서도 사용할 수 있어야 하는 효과는 입력 이미지를 요구하는 필터보다 투명 생성
레이어로 다룬다.

- 종이·필름·먼지·스크래치
- 안개·연무·구름
- 빛샘·보케·렌즈 플레어
- 속도선·집중선·충격파
- 별·비·눈·꽃잎·불씨
- 물결·열기·마법진
- 스크린톤·하프톤·그라데이션 맵

Node Material의 ProceduralTexture/PostProcess 모드를 사용할 수 있지만, 문서에는 Babylon graph가
아닌 ToonSpectrum 소유의 `kind + bounded parameters + seed + time` recipe를 저장한다.
[Node Material modes](https://doc.babylonjs.com/typedoc/enums/BABYLON.NodeMaterialModes)

### 1.3 Babylon ImageFilter Control

`@babylonjs/controls`의 ImageFilter는 URL·video·canvas를 입력으로 받아 post-process나 custom
effect를 실행하고 결과 canvas 또는 GPU texture를 만들 수 있다. Studio의 영상 프레임·참고 이미지
필터뿐 아니라 page-composite canvas 필터 PoC에도 적합하다. 하지만 현재 패키지가
`2.0.0-alpha.1`이므로 제품의 canonical 필터 엔진으로 즉시 채택하지 않는다. 기존 raw WebGPU
필터와 품질·알파·GC·지연을 비교하는 벤치마크 대상이다.
[Image Filter Control](https://doc.babylonjs.com/features/featuresDeepDive/controls/imageFilter/)

### 1.4 고급 색보정·렌즈·광원 후보

일반 밝기·대비·채도는 기존 WebGPU 경로를 유지하되, 다음 기능은 Babylon의 장면 pass와 결합했을
때 의미가 있다.

| 후보 | 활용 | 도입 판정 |
| --- | --- | --- |
| ColorCurves·3D LUT | 그림자·중간톤·하이라이트별 색조, 작품/회차 look preset | 기존 필터와 품질·색공간 비교 후 선택 적용 |
| Lens pipeline | 그레인·색수차·가장자리 왜곡·비네트·보케 | 회상·공포·스마트폰·속도 장면용 PoC |
| Selection Outline·Highlight | 선택된 3D 대상과 그룹을 선명하게 표시 | 편집 UX와 Magic Layer에 우선 적용 |
| TAA | 고해상도 정지 캡처의 edge 안정화 | final still 전용 PoC, 라이브·canonical 필터 금지 |
| Velocity motion blur | 카메라·캐릭터·소품의 방향성 잔상 | WebCodecs exact-frame corpus 검증 뒤 적용 |
| SSR | 젖은 도로·타일·유리·수면·야경 반사 | 고품질 배경 preset PoC |
| GI RSM·IBL shadow | 실내 색 번짐과 환경광 접지 | desktop final 품질 단계에 제한 |
| Ray tracing | 고급 반사·그림자 | WebGPU 지원과 결정성이 안정될 때까지 비권장 |

색상 효과는 sRGB 표시 결과만 맞추는 것으로 끝내지 않는다. linear 작업 공간, premultiplied/straight
alpha, 투명 픽셀 RGB, LUT interpolation, WebGPU/WebGL 차이를 골든으로 고정해야 한다.
[ColorCurves](https://doc.babylonjs.com/typedoc/classes/_babylonjs_core.ColorCurves),
[ColorGradingTexture](https://doc.babylonjs.com/typedoc/classes/BABYLON.ColorGradingTexture),
[LensRenderingPipeline](https://doc.babylonjs.com/typedoc/classes/babylon.lensrenderingpipeline),
[Selection Outline Layer](https://doc.babylonjs.com/features/featuresDeepDive/mesh/selectionOutlineLayer/),
[TAA](https://doc.babylonjs.com/typedoc/classes/BABYLON.TAARenderingPipeline),
[Motion Blur](https://doc.babylonjs.com/typedoc/classes/BABYLON.MotionBlurPostProcess),
[SSR](https://doc.babylonjs.com/typedoc/classes/BABYLON.SSRRenderingPipeline),
[IBL Shadows](https://doc.babylonjs.com/typedoc/classes/BABYLON.IblShadowsRenderPipeline)

### 1.5 WebGPU compute 활용

Babylon specialist가 이미 활성화된 장면 작업에서는 compute pass를 다음 제작 보조에 활용할 수 있다.

- object/material ID와 depth에서 선택 mask 생성
- mask dilate/erode/open/close와 feather용 distance field
- 연결 요소와 작은 hole 제거를 이용한 Magic Layer 정리
- height/depth에서 normal·curvature·접촉 경계 계산
- particle flow field·attractor·volumetric lighting
- 대형 pass의 tile checksum·무결성 검증 보조

그러나 평면 필터 하나를 실행하기 위해 Babylon engine을 켜거나, 기존 raw WebGPU 필터 runtime과
`GPUDevice`, staging buffer, pipeline cache를 공유하지 않는다. 기존 provider는 단순 2D와
필기 인접 작업을 소유하고 Babylon은 장면 specialist job의 내부 compute만 소유한다.
실제 adapter가 conformance·device-loss·dispose 테스트를 통과하기 전에는 topology의 `compute`
capability를 제품 지원으로 광고하지 않는다.
[Babylon WebGPU support](https://doc.babylonjs.com/setup/support/webGPU/)

## 2. 웹툰 배경과 시네마틱 연출

### 2.1 날씨와 분위기

Particle Flow Map과 Attractor를 웹툰 작업 방식으로 재해석한다.

- 캔버스에 방향을 그리면 꽃잎·눈·연기가 그 흐름을 따름
- 인물이나 손을 attractor로 지정해 빛·마법·먼지가 모임
- 컷 바깥이나 효과점에서 repulsor를 사용해 폭발·충격파 생성
- depth를 이용해 전경·중경·후경 파티클의 크기와 초점 차등
- 캐릭터 matte를 이용해 얼굴 위 입자를 자동으로 회피

실시간 미리보기와 영상 export는 동일 `seed`, `time = frameIndex / fps`, fixed timestep을 사용한다.
아티스트가 재생 순서를 바꾸거나 중간 프레임부터 export해도 특정 프레임 결과가 같아야 한다.

### 2.2 조명

- Clustered Lighting: 네온 거리·콘서트·도시 창문처럼 광원이 많은 장면
- Textured Area Light: 스테인드글라스, 창문 그림자, 전광판, 프로젝터, 나뭇잎 사이 빛
- Volumetric Lighting: 안개 낀 숲, 지하실, 교회, 공연장, 공포 장면
- Dynamic IBL Shadows: HDRI·파노라마와 3D 캐릭터 접지
- Physically Based Atmosphere: 낮·노을·밤·달빛·이세계 하늘 변형

물리적으로 정확한 값을 그대로 노출하지 않고, “로맨스 노을”, “스릴러 역광”, “교실 오후”처럼
웹툰 결과 중심의 preset으로 감싼다.

### 2.3 배경 재사용

하나의 canonical scene에서 다음을 batch로 생성한다.

- 카메라 각도와 focal length 변형
- 시간대와 날씨 변형
- 인물 포함/제외
- 소품 visibility 변형
- beauty, 선화, 톤, depth, normal, matte
- 썸네일과 contact sheet

Babylon AssetContainer는 batch 내부 scene 자원을 재사용하는 구현 수단일 뿐이며, 자산 ID와 장면
배치 정보의 권위는 `StudioBg3dSceneDocument`에 남긴다.
[Asset Containers](https://doc.babylonjs.com/features/featuresDeepDive/importers/assetContainers/)

### 2.4 원근을 따르는 선과 2.5D 요소

GreasedLine은 카메라를 향하는 삼각형 mesh로 다양한 굵기의 선을 만들며, 점선·다중 색·texture·
glow·reveal animation·instance를 지원한다. 다음 기능에 적합하다.

- 3D 공간의 속도선·집중선·충격파
- 도로·전선·배관·철도·이동 경로
- 원근을 따르는 효과음 꼬리와 시선 유도선
- 발광 마법 궤적·네온 튜브·번개
- mesh edge를 기준으로 만든 보조 선화
- 카메라 동선·캐릭터 이동 path 미리보기

원본 path는 Studio의 engine-neutral polyline/curve로 저장하고 Babylon mesh는 매 실행 시
재생성한다. 먼 거리 군중·표지·나무·효과는 SpriteManager/atlas와 결합해 완전한 3D mesh보다
가볍게 표시할 수 있다.
[GreasedLine](https://doc.babylonjs.com/features/featuresDeepDive/mesh/creation/param/greased_line),
[SpriteManager](https://doc.babylonjs.com/typedoc/classes/BABYLON.SpriteManager)

## 3. 3D에서 2D 웹툰 레이어로

가장 차별화 가치가 큰 출력은 한 장의 beauty PNG가 아니라 편집 가능한 제작 패스다.

### 3.1 3D Magic Layer

사용자가 3D 배경에서 대상 하나를 클릭하면 object/material ID와 depth/normal을 조합해 다음
작업을 한 번에 제공한다.

- 선택한 벽·창문·도로·의상만 색상·커브·Bloom 적용
- 같은 재질을 사용하는 항목 전체 선택
- 전경·중경·후경을 depth 범위로 선택
- 인물 뒤 배경만 흐리게 만들기
- 선택한 대상에 DOF 초점 맞추기
- 캐릭터 뒤로 효과음·오라·속도선을 자동 배치
- object ID별 레이어 그룹과 matte 생성
- 특정 창문만 야간 발광으로 변환

화면 표시용 ID 색상 PNG를 객체 정체성으로 사용하지 않는다. canonical node/material ID에 대응하는
정수 ID buffer와 stable legend를 권위로 사용하고, 표시용 색상은 파생 결과로만 만든다.

### 3.2 권장 패스

- beauty
- base color
- tone
- main line
- texture line
- depth
- view-space normal
- world-space normal
- velocity
- object ID
- material ID
- character matte
- background matte
- shadow
- ambient occlusion
- emission
- reflection/specular

이 패스를 이용하면 다음 작업이 가능하다.

- 벽·바닥·창문·의상·피부를 클릭 한 번으로 선택
- 캐릭터와 배경을 PSD 레이어로 분리
- depth에 따라 안개·블러·스크린톤 조절
- normal 변화에서 굴곡선과 접힘선 추출
- 재질 경계에서 안정적인 보조 선화 생성
- 그림자만 별도 레이어로 받아 수동 보정
- 발광 영역만 별도 레이어로 합성
- object ID를 2D 선택 마스크로 전환

Babylon의 GeometryBuffer/PrePass 결과가 자동으로 stable object/material ID를 보장하지는 않는다.
ID 패스는 canonical logical node ID와 material slot을 고유 색상으로 렌더하는 별도 pass로 만들고,
동일 ID와 색상 사이 legend를 함께 저장해야 한다.
[GeometryBufferRenderer](https://doc.babylonjs.com/typedoc/classes/BABYLON.GeometryBufferRenderer),
[PrePassRenderer](https://doc.babylonjs.com/typedoc/classes/BABYLON.PrePassRenderer)

### 3.3 연결형 재편집 3D 배경

3D 배경을 PNG 한 장으로 굳히지 않고 recipe와 검증된 baked artifact를 함께 저장한다.

1. SceneDocument, camera, lighting, FX recipe를 linked source로 보존한다.
2. 캔버스에는 마지막으로 검증된 baked pass를 표시한다.
3. 장면을 바꾸면 영향을 받은 pass만 dirty로 표시한다.
4. 카메라 변경은 line/depth/ID/normal을 갱신하지만, 무관한 2D 수정 레이어는 유지한다.
5. 같은 revision과 signature의 렌더 요청은 CRDT operation ID로 합쳐 중복 실행하지 않는다.
6. 다시 열 때는 baked artifact를 먼저 표시하고 specialist는 요청 시 갱신한다.

현재 `studio-bg3d-linked-render-state.ts`에는 line, depth, object-ID, normal, combined pass의
renderer-neutral dependency DAG, cache signature, idempotent operation planner가 이미 있다.
Babylon은 이 planner가 요청한 pass를 생성하는 provider가 된다.

작품의 장기 외형을 보존하려면 recipe 외에 다음 renderer receipt를 baked artifact와 함께 기록한다.

- scene/source/options hash
- recipe와 pass profile version
- engine/backend와 adapter revision
- shader revision
- seed와 canonical time
- color space, alpha, row order, normal packing

### 3.4 현재 result 계약과 남은 pass

현재 FX v1은 RGBA와 선택적 depth를 반환하고, v2 bounded multi-artifact bundle의 형식·검증
계약도 구현됐다. 현재 Babylon executor는 beauty와 depth에 더해 view-right-handed normal을
octahedral RG8로 packing해 실제 v2 artifact로 반환한다. local Chromium의 독립 clean WebGL2와
WebGPU 진단은 이 세 pass의 실제 readback을 확인했지만, 반복 soak·브라우저/GPU matrix와 Three
대비 골든은 아직 남아 있다. Magic Layer에 필요한 object/material ID와 발광 레이어용 emission
등은 아래 계약에 맞는 실제 렌더 pass가 남아 있다.

| artifact | 권장 형식 | 의미 |
| --- | --- | --- |
| beauty | top-down straight-sRGB RGBA8 | 화면과 최종 합성 |
| depth | normalized Float32 | FX 이전 base scene depth |
| normal | versioned packed 또는 Float texture | 좌표계가 명시된 view/world normal |
| object ID | Uint32 또는 lossless packed ID | canonical node legend 참조 |
| material ID | Uint32 또는 lossless packed ID | canonical material legend 참조 |
| shadow/AO | linear R8/R16F | 그림자·접촉 음영 레이어 |
| emission | straight RGBA8/RGBA16F | 네온·발광 합성 |
| velocity | versioned 2-channel float | camera/object motion과 단위 명시 |

각 artifact는 scene hash, recipe hash, dimensions, profile, byte length를 독립 검증하고, 필요하지 않은
pass는 생성하지 않는다.

## 4. 캐릭터·포즈·소품

### 4.1 애니메이션 리타게팅

Babylon 9의 animation retargeting은 서로 다른 스켈레톤과 체형 사이 동작 공유를 목표로 한다.
ToonSpectrum에서는 다음으로 재해석할 수 있다.

- VRM과 일반 rigged GLB가 같은 걷기·앉기·전투·감정 pose library 공유
- 사용자 캐릭터에 pose preset 자동 재매핑
- 체형 차이로 생기는 발 미끄러짐·손 위치 오차를 correction layer로 보정
- 리타게팅 결과를 canonical bone transform으로 bake
- 원본 animation clip과 보정 layer를 분리해 다시 편집

실제 도입 전 VRM 0/1 humanoid, Mixamo 계열, Blender rig, 비표준 bone name으로 corpus를 구성하고
손·발·골반·머리 방향 오차를 수치화해야 한다.

### 4.2 물리 기반 정착 보조

Babylon/Havok을 실시간 게임 물리보다 “배치 해결사”로 사용한다.

- 컵·책·가방을 손·책상·선반에 자연스럽게 정착
- 의자·소파와 골반·발·등의 접촉 보조
- 여러 소품이 겹치지 않게 간단히 흩뿌리기
- 머리카락·귀걸이·망토·가방끈의 짧은 settle preview
- ragdoll이 아니라 작가 pose를 보존하는 제한적 constraint solve

시뮬레이션은 요청별 격리하고, 승인된 최종 transform만 SceneDocument에 transaction으로 반영한다.
Physics world, collider pointer, WASM heap은 문서에 저장하지 않는다.
[Physics prestep](https://doc.babylonjs.com/features/featuresDeepDive/physics/prestep),
[Physics Character Controller](https://doc.babylonjs.com/typedoc/classes/BABYLON.PhysicsCharacterController)

### 4.3 군중과 자동 배치

- thin instance를 이용한 학생·행인·차량·나무·가로등 대량 미리보기
- Nav Mesh를 이용한 엑스트라 위치 후보와 진행 방향 제안
- 카메라 frustum과 depth를 고려한 화면 밀도 제어
- 같은 모델도 seed 기반 의상색·자세·scale 변형
- 최종 선택한 인스턴스만 편집 가능한 canonical node로 승격

## 5. 3D 자산·배경 파이프라인

### 5.1 교차 검증기

Babylon loader는 도입 시 first-party GLB validator를 대체하지 않고 advisory 교차 검사에만
사용한다. `@babylonjs/loaders` 패키지는 버전을 고정했고 승인 lazy entry closure 안에 core GLB
loader만 명시적으로 등록했다. 현재 용도는 검증된 자체 포함 GLB의 제한된 beauty/depth/normal
capture다. core JSON preflight에 더해 파싱 후 실제 Babylon scene delta receipt를 검사하며,
abort/timeout 뒤 늦게 정착한 loader 자원도 회수한다. 아래 advisory 대조는 아직 운영 검사기에
연결되지 않았고, image/texture GLB와 Draco·Meshopt·BasisU는 로컬 decoder byte와 예산 정책을
확정하기 전까지 fail-closed한다.

- mesh/material/texture/skeleton/morph/animation 수 대조
- bounds와 unit scale 대조
- 누락 텍스처와 extension 경고
- alpha mode, double-sided, normal/tangent 품질 경고
- KTX2·Meshopt·Draco 지원 여부 진단
- source와 렌더 결과 사이 비정상적인 차이 탐지

서로 다른 파서가 같은 자산을 독립적으로 해석하면 특정 엔진만 통과하는 손상 파일을 더 잘 찾을
수 있다. 다만 “Babylon에서 보인다”는 이유만으로 안전 검증을 통과시키지 않는다.

### 5.2 Gaussian Splat

Babylon 9의 PLY·Splat·SPZ·SOG/SOGS와 compound splat 지원은 다음에 활용 가능하다.

- 실제 장소 촬영물을 배경 참고로 탐색
- 복잡한 실내 공간의 카메라 각도 찾기
- 여러 splat 공간과 3D 캐릭터를 결합한 구성
- splat beauty + depth 기반 선화·톤 변환 실험
- 사진 배경과 3D 소품의 접지 참고

Splat은 선화·material ID·정확한 충돌을 제공하는 메시와 다르므로 메시 배경의 완전한 대체로
취급하지 않는다.
[GaussianSplattingMesh](https://doc.babylonjs.com/typedoc/classes/BABYLON.GaussianSplattingMesh)

### 5.3 대형 배경

Large World와 3D Tiles는 장기적으로 다음에 적합하다.

- 도시 전체를 하나의 배경 프로젝트로 관리
- 학교·병원·궁전·우주선 같은 거대 세트
- 실제 지형·건물 타일을 카메라 참고 자료로 사용
- 카메라 근처만 고정밀로 스트리밍

현재 canonical 좌표 제한, 저장 크기, 외부 데이터 권리, 오프라인 재현성을 먼저 재설계해야 하므로
P2로 둔다.

### 5.4 절차적 지형·건축·재질

Babylon의 geometry와 material 기능은 SketchUp·Blender 전체를 대체하는 모델러가 아니라, 웹툰
배경의 반복 작업을 줄이는 요청별 specialist로 사용할 수 있다.

- grayscale/AI depth map에서 산·언덕·도로·옥상 지형 생성
- CSG2를 이용한 벽의 문·창문 개구부, 계단·기둥·건축 매스 boolean
- decal을 이용한 간판·포스터·벽 균열·낙서·오염·피격 흔적 부착
- DynamicTexture를 이용한 가변 상호·도로 표지·교실 게시물
- ProceduralTexture를 이용한 종이·구름·물결·불·연기·스크린톤 source
- CellMaterial을 이용한 빠른 셀 셰이딩 reference
- WaterMaterial을 이용한 강·바다·수영장·웅덩이의 reflection/refraction preview
- baked vertex animation texture를 이용한 군중·나뭇잎·깃발 반복 동작
- RenderTargetTexture를 이용한 거울·CCTV·모니터·포털·창밖 장면

boolean·terrain 연산의 결과는 Babylon mesh 객체로 보존하지 않는다. 검증된 geometry를
self-contained GLB 또는 canonical primitive/attachment로 bake한 후 undo transaction으로
삽입한다.
[Height-map ground](https://doc.babylonjs.com/features/introductionToFeatures/chap5/hills/),
[Decal](https://doc.babylonjs.com/typedoc/functions/BABYLON.CreateDecal),
[DynamicTexture](https://doc.babylonjs.com/typedoc/classes/BABYLON.DynamicTexture),
[ProceduralTexture](https://doc.babylonjs.com/typedoc/classes/BABYLON.ProceduralTexture),
[Baked vertex animation](https://doc.babylonjs.com/typedoc/classes/BABYLON.BakedVertexAnimationManager),
[RenderTargetTexture](https://doc.babylonjs.com/typedoc/classes/BABYLON.RenderTargetTexture)

## 6. 애니메이션·모션 웹툰·영상

### 6.1 동일 렌더 경로

다음 세 출력이 같은 provider와 recipe를 사용해야 한다.

1. 편집 미리보기
2. 독자용 Webtoon FX Player
3. MP4/WebM/APNG/프레임 export

라이브에서는 Babylon이 시간을 스스로 증가시키지 않는다. Studio timeline이 계산한 canonical
time을 매 프레임 전달한다. 영상 export는 순서와 상관없이 특정 프레임을 직접 렌더할 수 있어야
하며, MediaRecorder 캡처가 아니라 가능하면 WebCodecs 입력용 고정 프레임을 생성한다.

### 6.2 영상 타임라인

`@babylonjs/controls` Timeline은 대량 thumbnail을 GPU에 표시하는 아이디어를 검토할 가치가 있다.
다만 패키지 안정성과 Studio timeline interaction 요구가 다르므로 그대로 UI를 교체하지 않는다.
현재 timeline의 thumbnail atlas/cache 전략을 개선하는 비교 구현에 사용한다.
[Timeline Control](https://doc.babylonjs.com/features/featuresDeepDive/controls/timeline/)

### 6.3 웹툰용 반복 연출

- 창문 밖 비와 눈
- 머리카락·옷자락의 짧은 loop
- 불빛 깜빡임
- 물결과 반사
- 전광판과 네온
- 카메라 dolly/parallax
- 반복 가능한 연기·불꽃·먼지
- 인물 등장 시 일회성 꽃잎·충격파·감정 입자

각 loop는 시작·종료가 연결되도록 canonical duration을 갖고, reduced-motion과 모바일 저전력
등급에서는 정적 대표 프레임으로 대체한다.

### 6.4 저작과 출판 런타임 분리

작가가 Babylon의 고급 조명·입자·카메라 기능을 사용했다고 해서 모든 독자에게 Babylon 런타임을
전송할 필요는 없다.

- 정적 웹툰: Beauty/레이어를 PNG·WebP로 bake
- 가벼운 역동 효과: depth를 여러 장의 2.5D 레이어로 분리해 CSS/WebGL parallax
- 복잡한 시네마틱: WebM/APNG/프레임 시퀀스로 사전 렌더
- 고급 인터랙티브 작품: 작가가 명시적으로 선택한 경우에만 live Babylon reader

이 구조는 저작 품질을 높이면서 독자 트래픽의 GPU 요구와 서버 비용을 낮춘다. 2.5D 변환 시
빈 공간은 depth-aware inpaint 또는 작가 보정 레이어로 채우고, 원본 depth와 layer split recipe를
함께 저장한다.

## 7. 효과 저작 UI와 공유

### 7.1 안전한 노드형 FX 편집기

Node Material Editor와 Node Render Graph Editor의 조작 개념은 차용하되 다음 허용 노드만 제공한다.

- scene color/depth/normal/object ID 입력
- color adjust, threshold, gradient map
- blur, dilate, erode
- edge, contour, depth range
- noise, procedural pattern
- blend, mask, transform
- particles, atmosphere, bloom
- output beauty/transparent layer/LT source

그래프 저장 형식은 ToonSpectrum 소유 버전 스키마로 제한하고, cycle, texture 수, pass 수, 픽셀
예산을 사전에 계산한다. 사용자 셰이더 문자열·URL·Babylon 직렬화 객체는 받지 않는다.

### 7.2 에셋 마켓과 팀 공유

공유 가능한 항목은 다음과 같다.

- FX recipe
- 조명 rig
- camera rig
- atmosphere preset
- particle preset과 flow map
- render pass preset
- LT 변환 preset
- shot template

패키지는 썸네일, 권리 manifest, 엔진 중립 recipe, 입력 자산 hash, 최소 Studio 버전을 포함한다.
Babylon 패키지 버전은 실행 환경 정보일 뿐 공유 자산의 정체성이 되지 않는다.

### 7.3 AI 보조

AI는 셰이더 코드를 직접 생성하지 않고 제한된 recipe를 작성한다.

- 대사·장면 설명에서 시간대·조명·날씨 추천
- 카메라 focal length·구도·DOF 제안
- “비 오는 네온 거리” 같은 문장에서 FX stack 생성
- 캐릭터·배경 matte를 고려한 입자 회피 영역 제안
- 참조 컷에서 분위기 색·광원 방향을 추정
- 성능 예산에 맞춰 모바일/데스크톱 preset 자동 생성

실제 렌더는 브라우저 GPU에서 수행하므로 매 프레임 AI 서버를 호출하지 않고 서버 비용도 거의
증가하지 않는다.

### 7.4 협업·리뷰·교육

Babylon을 영상 통화나 화면 스트리밍보다 작은 장면 operation을 각 참여자 기기에서 렌더하는
협업 프리뷰로 사용한다.

- 3D 공간의 특정 node/local position/local normal에 댓글 핀 고정
- 댓글을 선택하면 작성자가 본 camera/shot으로 이동
- 발표자 camera를 다른 참여자가 선택적으로 follow
- 원격 참여자의 선택 object와 3D ray 표시
- 조명·카메라·날씨·FX variant 투표
- 샷별 승인·수정 요청과 contact sheet 리뷰
- 마켓 상세 화면에서 선택적 3D viewer와 material variant 미리보기
- 카메라·투시·조명 원리를 배우는 단계별 실습
- 교사가 동일 SceneDocument/recipe를 배포하고 결과를 비교

협업 서버에는 SceneDocument operation, camera pose, selection, comment anchor, artifact hash만
전송한다. GPU 프레임이나 Babylon 객체를 전송하지 않으므로 서버 비용은 기존 presence/CRDT
메타데이터 수준으로 제한할 수 있다.

## 8. 모바일·성능·안정성

### 품질 단계

| 단계 | 대표 정책 |
| --- | --- |
| 고성능 데스크톱 | WebGPU, full-resolution depth/normal, volumetric, GPU particles, clustered lights |
| 일반 데스크톱 | WebGPU 또는 WebGL 2, half-resolution volumetric, 제한된 particles |
| 모바일 고성능 | WebGPU/WebGL 2, 낮은 DPR, temporal reuse, 선택적 depth |
| 모바일 절전 | 기존 Canvas2D FX, 정적 atmosphere, particles 축소 |
| reduced motion | 정적 대표 프레임, 카메라 motion·입자 비활성 |

### 필수 런타임 규칙

- 기능을 열기 전 Babylon 네트워크 요청·engine·GPU context는 0
- 한 specialist 세션 안에서 engine/scene/render target 재사용
- slider 변경마다 Scene과 shader를 재생성하지 않음
- resize는 debounce하고 이전 렌더를 abort
- GPU readback은 commit/export 시점으로 제한
- hidden tab과 화면 밖 reader effect는 정지
- device loss/context loss 시 마지막 성공 결과 보존
- dispose 뒤 canvas, Worker, listener, texture, buffer 잔류 금지
- shader compile과 첫 활성화 시간은 별도 계측
- 모바일 발열·배터리·메모리 압박 시 품질 단계 자동 하향

Babylon은 WebGPU와 WebGL을 병행 지원하며 WebGPU 엔진 초기화가 비동기다. 따라서 WebGPU
초기화 실패를 정상적인 분기로 취급해야 한다.
[WebGPU support](https://doc.babylonjs.com/setup/support/webGPU/)

## 9. 현재 ToonSpectrum 연결 지점

| 영역 | 현재 코드 | Babylon 연결 |
| --- | --- | --- |
| FX recipe | `studio-bg3d-webtoon-fx.ts` | versioned specialist request 유지 |
| runtime routing | `studio-bg3d-runtime-topology.ts` | Three primary + Babylon isolated specialist |
| output boundary | `studio-bg3d-runtime-adapter.ts` | exact RGBA/depth/octahedral-normal 검증과 방어 복사 |
| Babylon lazy entry | `studio-bg3d-babylon-specialist-entry.ts` | 동적 import 전용 단일 entry와 deep ESM binding; 사용자 명시 진단에서만 호출 |
| Babylon lifecycle | `studio-bg3d-babylon-specialist-runtime.ts` | WebGL/WebGPU 초기화·직렬화·중단·손실·폐기 |
| Babylon capture | `studio-bg3d-babylon-artifact-capture.ts` | primitive·검증된 core GLB의 beauty/depth/normal, post-parse receipt, late-settle cleanup 구현; object/material ID·emission과 프로덕션 배선은 미구현 |
| multi-artifact v2 | `studio-bg3d-artifact-capture-v2.ts` | pass별 profile·크기·예산·legend 검증 |
| atomic failover | `studio-bg3d-atomic-specialist-failover.ts` | all-or-nothing 후보 실행 기반; 작품 commit 경로에는 미배선 |
| artifact FX | `studio-bg3d-artifact-webtoon-fx.ts` | 저해상도 CPU outline/atmosphere/bloom 기반; Babylon GPU/프로덕션 소비 경로에는 미배선 |
| 이미지 필터 commit | `StudioKonvaImageNode.tsx` | 공통 commit 앞 provider 후보 |
| 독자용 ambient FX | `WebtoonFxPlayer.tsx` | cinematic preset에서 GPU particle provider |
| 결정적 particle | `studio-motion-fx.ts` | preset/seed 의미 공유 |
| 모션 export | `studio-motion-export.ts` | fixed-time frame provider |
| LT Worker | `studio-bg3d-lt-render-worker-client.ts` | `lt-source` RGBA/depth 소비 |
| shot batch pass | `studio-bg3d-shot-batch-pass-catalog.ts` | normal/ID/shadow/emission 확장 |
| PSD | `studio-bg3d-shot-psd.ts` | portable pass를 레이어로 패키징 |
| linked 3D render | `studio-bg3d-linked-render-state.ts` | pass별 cache/dirty/CRDT operation을 실제 adapter 출력과 연결 |
| semantic matte | `studio-bg3d-semantic-materials.ts` | object/material ID legend와 결합 |
| scene document | `studio-bg3d-scene-document.ts` | canonical camera/light/node/shot 권위 유지 |
| physics | `studio-bg3d-physics.ts` | 요청별 Havok solve 후 transform bake |
| panorama | `studio-bg3d-procedural-panorama.ts` | atmosphere/IBL source 후보 |
| model thumbnail | `studio-bg3d-model-thumbnail-capture.ts` | 격리 batch thumbnail provider |
| asset validation | `studio-bg3d-glb-validation.ts` | Babylon loader advisory 교차 검사 후보; 아직 미배선 |

## 10. 패키지 도입 전략

`@babylonjs/core`와 `@babylonjs/loaders`는 `9.19.0` exact 버전으로 설치했다. 사용자의 명시적
요청에 따라 저장소의 `minimumReleaseAge` 24시간 숙성 정책은 해제했으며, 버전 고정·lockfile·
라이선스/보안 감사는 계속 유지한다.

현재 core 엔진 코드는 유일한 승인 lazy entry의 정적 closure 안에서 전용
`studio-bg3d-babylon-runtime` manual chunk로 격리한다. 이후 기능 패키지는 아래 단위로
사용 시점에만 추가한다.

| 지연 로드 단위 | 후보 패키지 | 용도 |
| --- | --- | --- |
| `babylon-fx-core` | `@babylonjs/core`의 필요한 ES module | WebGPU/WebGL engine, FrameGraph, capture |
| `babylon-scene-loaders` | `@babylonjs/loaders` | 검증된 GLB·OBJ·STL·splat PoC |
| `babylon-fx-materials` | `@babylonjs/materials`의 선택 import | 특수 재질 PoC |
| `babylon-export` | `@babylonjs/serializers` | GLB/3MF 등 명시적 export에서만 |
| `babylon-physics` | `@babylonjs/havok` | 배치·소품 settle 요청에서만 |
| `babylon-controls-lab` | `@babylonjs/controls` | ImageFilter/Timeline 비교 PoC에만 |

Babylon 공식 CDN은 학습·소규모 실험 용도이며 프로덕션 사용을 권장하지 않는다. 실제 채택 시
버전이 고정된 자체 빌드 자산으로 배포하고 integrity와 캐시 정책을 소유한다.
[Babylon.js 공식 저장소](https://github.com/BabylonJS/Babylon.js/)

## 11. 권장 구현 순서

### 단계 A — 장면 FX 골든 PoC

1. 완료: Babylon WebGPU/WebGL lazy entry와 lifecycle runtime
2. 완료: artifact-capture-v2 계약과 전용 manual chunk/bundle guard
3. 완료(제한 범위): 사용자 명시 진단 activation과 canonical primitive/검증된 core GLB의 실제
   beauty/depth/normal executor
4. 기반 완료·배선 전: renderer-neutral atomic failover와 bounded CPU
   outline/depth-atmosphere/emissive-bloom
5. 완료(제한 범위): GLB post-parse resource receipt와 abort/timeout late-settle cleanup
6. 완료(최소 증거)·확장 필요: local Chromium 독립 clean WebGL2/WebGPU
   beauty/depth/normal readback. 다음은 브라우저/GPU matrix, 반복 soak, straight-alpha·normal
   packing·post-parse receipt 골든
7. 다음: Three/Babylon 동일 beauty/depth/normal 비교와 object/material ID 실제 캡처
8. 다음: Babylon GPU outline + depth fog + bloom executor
9. 다음: 작품 결과 activation, 원자적 provider commit, device-loss 골든/soak 검증

### 단계 B — Multi-artifact와 Magic Layer

1. 완료: result v2 bundle과 stable legend 검증
2. 완료(제한 범위): view-space octahedral RG8 normal 실제 렌더와 canonical artifact 반환
3. 다음: object ID/material ID 실제 렌더
4. 다음: stable legend와 click selection
5. 다음: linked render cache/dirty planner와 pass별 commit

### 단계 C — 날씨와 모션

1. rain/snow/petals
2. fixed timestep 300프레임 반복
3. flow map과 attractor
4. reader/export 동일성

### 단계 D — 제작 패스

1. 완료(제한 범위): view-space octahedral RG8 normal
2. object/material ID + stable legend
3. shadow/emission/AO
4. LT·선택·PSD 연결

### 단계 E — 조명과 배경

1. textured area light
2. volumetric lighting
3. atmosphere/day-night
4. dynamic IBL shadow

### 단계 F — 캐릭터와 배치

1. animation retarget corpus
2. physics prop settle
3. surface snap/decal
4. thin-instance crowd

### 단계 G — 고급 자산

1. Gaussian Splat
2. loader 교차 검사
3. batch thumbnail/contact sheet
4. Large World/3D Tiles 연구

### 단계 H — 저작·공유

1. allowlist FX graph
2. preset package/rights manifest
3. 팀 공유와 revision
4. AI→bounded recipe

## 12. 채택 게이트

### 기능을 사용하지 않을 때

- Babylon JS/WASM 다운로드 0
- GPU context 0
- Worker 0
- Studio 초기 interaction 지연 변화 없음

### 성능

- 대표 1080p preview p95 16.7ms 이하 또는 기존보다 25% 이상 개선
- 모바일 p95 33.3ms 이하
- 입력 지연 p95 100ms 이하
- 50ms 이상 main-thread long task 없음
- 30분 soak 뒤 JS heap/GPU resource 지속 증가 없음

### 품질

- 동일 기기·동일 backend·동일 adapter revision에서는 scene/recipe/seed/time 반복 결과 exact 일치 목표
- 다른 GPU 또는 WebGPU/WebGL 사이에는 채널·depth·perceptual golden 허용 오차 적용
- 저장된 작품 외형은 마지막 검증 baked artifact bytes/hash가 권위
- top-down row order와 straight-alpha 규약 준수
- 투명 픽셀 RGB 오염 없음
- depth는 같은 카메라의 FX 이전 base scene depth
- object/material ID는 경계 1px을 제외하고 정확
- 카메라 이동 시 outline shimmer와 depth halo 허용치 통과
- LT source에는 bloom·DOF·입자 오염 없음

### 복구

- WebGPU 초기화 실패 시 WebGL 또는 기존 Three 경로로 복귀
- device/context loss 뒤 재시도 가능
- abort/resize/stale epoch 결과가 새 장면을 덮지 않음
- 오류가 canonical 문서와 undo history를 변경하지 않음
- dispose 뒤 listener, canvas, texture, buffer, object URL 잔류 없음

## 최종 판단

Babylon.js의 가장 큰 가치는 “3D를 하나 더 보여 주는 것”이 아니다. ToonSpectrum에서는 장면을
이해하는 GPU 제작 보조 계층으로 사용해야 한다.

- 단순 필터는 기존 WebGPU/Worker
- 대화형 3D 편집과 VRM은 Three/R3F
- Babylon은 장면 FX, 멀티패스, 입자, 조명, 리타게팅, 물리 solve, splat, 대형 배경 specialist
- 결과는 항상 Studio 소유의 RGBA/depth/normal/ID와 canonical recipe로 귀환

이 경계를 유지하면 현재 편집기를 위험하게 갈아엎지 않고도 체적광·날씨·깊이 기반 선화·
레이어 분리·대규모 배경·동작 재사용처럼 경쟁 제품과 명확히 차별화되는 기능을 순차적으로
도입할 수 있다.
