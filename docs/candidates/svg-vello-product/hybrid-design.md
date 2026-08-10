# SVG Vello 제품 하이브리드 설계

## 실제 호출 경로

`/studio`의 자산 도구가 lazy-load한 `StudioAssetToolPopoverBody`에서 요소 탭을 열면 `StudioElementsPanel`이 실제 카탈로그 tile을 만든다. focus, pointer enter 또는 pointer down이 발생한 tile만 `StudioSvgAssetPreview`가 bounded tournament를 요청한다. 클릭과 drag payload는 라우팅 결과가 아니라 원본 `item.svg`를 계속 사용한다.

## 결정 순서

1. 2MiB source, 4096px dimension, 1,048,576 pixel 예산과 active/external-content 정책을 먼저 검사한다.
2. `auditSvgNative`가 strict subset을 통과해야만 Vello 후보를 렌더한다.
3. Vello CPU 결과와 resvg 결과를 같은 크기로 만들고 대칭 3×3 RGBA δ48 mismatch를 계산한다.
4. mismatch가 2% 이하일 때만 `vello-svg-native`를 선택한다. 이 픽셀은 CPU sibling이므로 interactive GPU readback은 0B다.
5. native 거부 시 FormatGateway를 실행한다. warnings와 unsupported가 모두 0일 때만 SceneIR/CanvasKit editable 후보를 시도한다.
6. SceneIR 의미가 불완전하거나 CanvasKit runtime을 해석할 수 없으면 resvg가 static preview를 소유하고 ledger를 decision에 보존한다.
7. font-dependent SVG는 번들 카탈로그에 한해서만 원본 browser SVG를 유지한다. 사용자 입력은 active/external 정책을 통과하지 못하거나 safe provider가 없으면 fail-closed한다.

## 표면 소유권

- tile surface의 primary owner는 한 번에 하나다. 완전한 routed frame이 준비되기 전에는 원본 `<img>`가 보이고, 이후에만 `<canvas>`로 원자 교체한다.
- winner pixels는 캐시 최대 24개/8MiB, 실행 동시성 2로 제한한다. 같은 source digest의 in-flight 요청은 합친다.
- Vello와 resvg 결과를 비교하는 작업은 hover/focus 후 idle callback에서 시작한다. pen-down canvas hot path와 무관하다.
- renderer 객체나 pixel cache를 프로젝트 IR에 저장하지 않는다.

## 명시적 격리

- 전체 Konva/ImageEl 배치 surface의 renderer 교체는 이 bounded island에 포함하지 않는다.
- CanvasKit adapter의 root-app 타입 경계는 runtime-resolved candidate다. 배포 해석 실패는 decision reason으로 기록하고 resvg로 우회한다. 이를 `available` full-canvas route로 과장하지 않는다.
- native GPU SVG API는 readback 기반이므로 interactive caller에서 격리한다.
