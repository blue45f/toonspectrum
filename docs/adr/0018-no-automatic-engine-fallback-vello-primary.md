# ADR-0018: 자동 엔진 폴백 금지와 Vello WebGPU/WASM 문서 엔진 승격

- 상태: Accepted
- 날짜: 2026-08-31
- 범위: Studio 2D 문서, 라이브 브러시, 이미지 필터, Worker/WASM 실행,
  export, BG3D·VRM·DCC, 엔진 레지스트리

## 맥락

Studio는 Konva/Canvas2D, Pixi, Vello, 전용 WebGPU 브러시, Worker/WASM 필터,
Three WebGPU/WebGL2, Babylon 등 여러 렌더러를 보유한다. 기존 계약은 후보 목록과
`fallbackProviderId`를 조합해 실행 실패 뒤 다른 엔진으로 픽셀 권한을 넘겼다. 이 방식은
표면마다 서로 다른 출력과 복구 규칙을 만들고, 장치 손실·초기화 실패를 실제 오류가 아닌
다른 엔진의 성공으로 가렸다. 결과적으로 테스트 상태와 사용자가 본 픽셀이 일치하지 않고,
Konva 의존성도 계속 유지됐다.

현재 배포 아티팩트와 제품 연결 상태를 비교하면 Vello가 문서용 WebGPU + WASM 엔진으로서
실제 브라우저 GPU 표면, PathIR, 대형 장면 검증을 모두 가진 유일한 교체 후보다. 저장소에 고정된
`canvaskit-wasm@0.41.1` 기본 바이너리는 WebGL 경로이며, 타입 선언에 있는 WebGPU API와 달리
배포 JS glue에는 해당 API가 없다. CanvasKit GPU island도 아직 probe-only다. Skia upstream에는
Graphite/Dawn WebGPU 구현이 있지만, 이 저장소가 재현 가능하게 고정·검증한 Graphite WASM
아티팩트는 아직 없다.

## 결정

1. 한 작업은 시작 전에 정확히 하나의 엔진을 선택한다. capability 불일치, 초기화 실패,
   render/present 실패, device loss 뒤 다른 provider를 같은 작업에서 시도하지 않는다.
2. 실패한 선택은 `unavailable` 또는 `failed`로 노출하고 마지막 정상 프레임을 보존한다.
   CPU/Canvas2D/WebGL2 엔진은 사용자가 직접 선택한 독립 엔진이나 명시적 reference/export
   실행으로만 사용할 수 있다.
3. 레지스트리의 `fallbackProviderId`, planner/frame graph의 `fallbackChain`, 실행 영수증의
   fallback 증거를 제거한다. 장애 증거는 `failureIsolation`으로 기록한다.
4. 2D 문서 픽셀 권한의 목표 엔진은 Vello WebGPU/WASM이다. Vello가 정확히 표현할 수 있는
   페이지는 같은 scene revision의 GPU present 영수증을 받은 뒤에만 Konva 문서 shadow를
   숨긴다. Konva Stage는 당분간 입력·hit-test와 선택/변형 chrome 경계만 맡는다.
5. Vello가 아직 표현하지 못하는 텍스트, 이미지, 일부 필터와 고급 브러시 재질은 작업 시작
   전에 선언되는 `legacy compatibility boundary`다. 이것은 Vello 실패 후 실행되는 폴백이
   아니며, 지원 범위가 추가될 때 경계를 줄인다.
6. BG3D의 WebGPU/WebGL2와 전문 Babylon/VRM/DCC 도구도 독립 엔진으로 유지한다. WebGPU가
   실패하거나 WebXR/VRM 기능이 현재 WebGPU에 없더라도 WebGL2를 자동 mount하지 않는다.
7. Pixi 선택 오버레이도 호출자가 WebGPU 또는 WebGL을 하나만 선택한다. Pixi에는 선택한
   renderer 하나만 포함한 허용 목록을 넘기며, 다른 renderer가 활성화되면 provider를 폐기하고
   unavailable로 닫는다. 현재 제품 host는 WebGPU를 명시적으로 선택한다.
8. CanvasKit을 명시적 GPU provider로 채택할 때는 `MakeWebGLCanvasSurface`처럼 GPU surface
   생성 실패 시 내부에서 software surface를 만드는 convenience API를 사용하지 않는다. 선택한
   WebGL/WebGPU context와 surface를 단계별로 만들고 어느 단계든 실패하면 unavailable로 닫는다.
9. Worker와 메인 스레드 구현, WASM64·WASM32·JavaScript 커널도 각각 독립 execution
   provider다. 제품 호출자는 작업 전에 `executionMode` 또는 정확한 backend를 전달하고,
   Worker 생성·ready·postMessage·실행 실패나 WASM 인스턴스화 실패 뒤 다른 구현으로 같은
   작업을 재실행하지 않는다. direct/JavaScript 구현은 명시적으로 선택한 reference·headless·QA
   경로에만 남길 수 있다.
10. export의 Worker encoder와 main-thread encoder도 서로 대체하지 않는다. 선택한 encoder가
    실패하면 아티팩트를 만들지 않고 실패를 반환한다. 이전 프레임이나 필터 전 원본을 성공한
    export처럼 내보내지 않는다.
11. VRM 의상 물리·스키닝과 DCC boolean도 같은 규칙을 따른다. XPBD 실패 뒤 procedural
    mesh를 mount하거나, skinned garment 실패 뒤 rigid geometry를 만들거나, Manifold 실패 뒤
    다른 CSG 알고리즘으로 재계산하지 않는다. 각 구현은 카탈로그에서 작업 전에 선택하는 별도
    provider다.
12. ONNX Runtime의 WebGPU/WASM execution provider와 MediaPipe GPU/CPU delegate도 provider
    생성 전에 하나만 고정한다. API 부재, session/task 생성 실패, device loss 뒤 두 번째 provider를
    만들지 않으며 receipt의 selected/active/attempted identity는 동일한 단일 값이어야 한다.
13. 동일한 의미의 CPU reference는 비교·golden·headless 작업에서 미리 선택할 수 있다. 예를 들어
    볼륨 렌더의 CPU와 GPU backend는 별도 생성 API이며 GPU dispatch·output validation 실패 뒤
    CPU 렌더를 호출하지 않는다.
14. capability probe가 여러 후보를 비교하는 것은 실제 작업과 provider 초기화 전에만 허용한다.
    작업 영수증에는 probe 후보 목록이 아니라 실제 선택한 provider와 그 provider의 시도만 남긴다.
    실패 뒤 후보 순회를 재개하는 것은 금지한다.

## 단계적 교체

| 단계 | Vello 권한 | Konva 역할 | 완료 조건 |
|---|---|---|---|
| 1 | 엄격한 CSS 색·blend·clip 계약을 통과한 기본 기하 도형, focus/speed lines | 입력·hit-test, 선택 chrome, frame 및 미지원 문서 | 동일 PathIR, exact-revision GPU present 영수증, 자동 폴백 0 |
| 2 | 일반 freehand/stroke 재생 | 입력·hit-test, 고급 재질 | stroke parity 및 장시간 획 성능 게이트 |
| 3 | 텍스트 glyph path와 이미지 texture | 입력·hit-test만 | 글꼴·색공간·필터 parity 게이트 |
| 4 | 전체 문서 | 제거 후보 | 선택·변형 hit-test 대체 및 브라우저 전수 검증 |

## 결과와 트레이드오프

- 엔진 장애가 즉시 보이고 재현 가능해지며, hidden demotion으로 인한 품질 변화를 없앤다.
- 일부 장치나 기능은 자동으로 저성능 엔진에서 계속 동작하는 대신 명시적인 사용 불가 상태를
  보게 된다. 사용자는 별도 설정에서 다른 엔진을 선택해 다음 작업을 시작할 수 있다.
- Konva 패키지를 즉시 삭제하지는 않는다. 픽셀 권한부터 제거하고 입력·hit-test 의존성을
  측정 가능한 경계로 축소한 뒤, 마지막 단계에서 교체한다.
- 적응형 viewport clip, export/save/timelapse, hydration/collaboration 미확정 상태, master 편집,
  필터·고급 fill 미리보기, timeline/animation, node 편집, 선택·marquee, 진행 중 gesture는
  1단계 Vello 권한 범위 밖이다. 이 경계에서는 작업 시작 전에 Konva 문서 엔진을 명시적으로
  선택하며 Vello 실패 뒤 Konva를 실행하지 않는다.
- 배포 전 검증은 provider별 성공뿐 아니라 실패 주입 시 다른 provider 실행 횟수가 0인지도
  확인해야 한다.
