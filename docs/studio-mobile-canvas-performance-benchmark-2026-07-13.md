# Studio 모바일 캔버스·입력·초기 로딩 벤치마크

작성일: 2026-07-13
대상: `/studio` 컷툰 편집기, 모바일 집중 드로잉 셸 후속 성능 배치

## 결론

이번 배치는 이미 구현된 모바일 전용 앱 셸과 전체 잔여 높이 캔버스 위에서 세 가지 병목을 줄였다.

1. `/studio` 컷툰 편집기에서는 사이트 인트로를 렌더하지 않아 첫 펜 입력을 장식용 전환이 가로막지
   않는다. 게시용 `mode=upload` 흐름은 기존 앱 인트로 정책을 유지한다.
2. SVG/PSD 내보내기·PSD 가져오기 엔진은 Studio 첫 진입 그래프에서 제외하고 실제 버튼의
   `pointerenter`·`pointerdown`·`focus` 또는 실행 시점에 한 번만 불러온다.
3. 한 스트로크를 한 `pointerId`에 귀속하고, coalesced 하드웨어 샘플과 preview-only predicted
   샘플을 분리해 빠른 펜 이동의 꼬리·필압·기울기를 보존한다.
4. 저장된 3D 장면을 판별하는 문자열 메타데이터 파서를 Three.js 무의존 모듈로 분리했다. 실제
   Three/R3F 편집기는 3D 배경 버튼의 `pointerenter`·`pointerdown`·`focus` 또는 활성화 시점에만
   한 번 불러온다.

프로덕션 Vite manifest의 정적 import 폐쇄를 같은 방식으로 측정한 결과, Studio 초기 JavaScript는
3,264,770B raw / 988,919B gzip에서 2,948,329B / 893,614B로 줄었다. 각각 316,441B(9.7%)와
95,305B(9.6%) 감소다. SVG/PSD 엔진은 이 정적 폐쇄에 남지 않는다.

이어 3D 런타임 경계를 분리한 동일 방식의 production manifest 측정에서 Studio 정적 폐쇄는
2,948,329B raw / 893,614B gzip에서 **2,224,408B / 710,282B**로 줄었다. 직전 기준 대비
723,921B raw(24.6%)와 183,332B gzip(20.5%) 감소이며, 첫 측정 3,264,770B / 988,919B와 비교하면
총 1,040,362B raw(31.9%)와 278,637B gzip(28.2%)를 줄였다. `StudioBackground3D`, R3F,
`three.module`, primitive 생성기는 이제 Studio 정적 import 폐쇄에 남지 않는다.

선택형 WebGL 인트로의 Three.js도 앱 공통 엔트리에서 분리했다. 앱 엔트리는 최초 1,171,388B raw /
329,246B gzip에서 현재 **443,257B / 143,949B**가 됐다. 동적 인트로 청크 로드가 실패하면 이미
엔트리에 있는 정적 스플래시로 복구한다. Studio 3D 편집기 역시 intent preload 실패를 활성화 실패로
고정하지 않고, 실제 활성화 시 다시 시도할 수 있는 별도 dynamic import 경계를 사용한다.

## 공식 제품 동작에서 가져온 설계 원칙

- Clip Studio Paint의 [Simple Mode와 Studio Mode](https://help.clip-studio.com/en-us/manual_en/090_tablet/Simple_Mode_and_Studio_Mode.htm)는
  단순 모드가 도구를 줄여 캔버스 공간을 확보하고 언제든 전문 모드로 전환할 수 있게 한다. ToonSpectrum은
  기능을 제거하는 별도 편집기가 아니라 같은 문서·undo·선택·스크롤을 유지한 채 사이트 chrome만
  언마운트하는 `집중 드로잉 / 앱 모드 종료` 왕복 구조로 적용했다.
- Krita의 [Canvas-only mode](https://docs.krita.org/en/reference_manual/preferences/canvas_only_mode.html)는
  설정 가능한 UI 요소를 숨기고 Tab 또는 네 손가락 탭으로 작업면을 넓힌다. ToonSpectrum은 모바일에서
  같은 목표를 명시적 44px 동작, safe area, 키보드 inset, 하단 엄지 도크와 결합했다.
- Procreate의 [QuickMenu](https://help.procreate.com/procreate/handbook/5.0/interface-gestures/quickmenu)는
  여섯 방향 사용자화 메뉴를 빠른 호출과 flick 동작에 연결한다. ToonSpectrum의 기존 6방향 퀵 액션은
  집중 모드에서도 유지하며, 핵심 기능을 다시 긴 세로 메뉴에 넣지 않는 기준으로 삼는다.
- Procreate의 [제스처](https://help.procreate.com/procreate/handbook/5.3/interface-gestures/gestures)는
  pinch 확대·회전, 두 손가락 undo, 세 손가락 redo처럼 캔버스를 가리지 않는 조작을 제공한다. MediBang
  Paint의 [공식 제스처 설명](https://medibangpaint.com/en/medibang-pro/manual/interface/gesture/)도
  pencil/finger 분리, pinch, 2/3손가락 undo/redo, long press를 제공한다. ToonSpectrum은 한 손가락
  드로잉을 보존하고 두 번째 손가락 접촉은 손가락 획을 무커밋 폐기한 뒤 기존 pinch 탐색으로 넘기며,
  펜 옆 touch는 palm 입력으로 격리한다.
- Clip Studio Paint의 [터치 제스처 설정](https://help.clip-studio.com/en-us/manual_en/750_gestures/Setting_Up_Touch_Gestures.htm)과
  [Preferences](https://help.clip-studio.com/en-us/manual_en/720_preferences/Preferences.htm)는 pen/finger
  도구 분리, touch-friendly 화면, 팔레트 숨김, drag 최소 거리 같은 조작 설정을 제공한다. 이 원칙을
  pointer ownership, 최소 스트로크 거리, 캔버스 전용 `touch-action` 경계로 번역했다.

## Pointer Events 구현 경계

W3C [Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/)의 coalesced/predicted event 모델과
[Pointer Events](https://www.w3.org/TR/pointerevents/)의 pointer capture 계약을 기준으로 삼았다.

- primary·왼쪽 접촉만 스트로크를 연다. 보조 터치, 우클릭, 펜 배럴 버튼은 획을 만들지 않는다.
- pointer capture를 사용해 캔버스 바깥에서 끝난 빠른 flick도 같은 획으로 종료한다. 미지원 브라우저,
  분리된 DOM 노드, 이미 해제된 capture는 예외 없이 폴백한다.
- 브라우저가 묶은 coalesced 이벤트는 timestamp로 정렬하지 않고 전달 순서 그대로 사용한다. 동일한
  timestamp라도 좌표·pressure·tilt·twist가 다르면 보존한다.
- 현재 dispatch 이벤트가 coalesced 배열에 포함되는 브라우저와 포함되지 않는 브라우저 모두에서 마지막
  샘플을 정확히 한 번만 저장한다. API가 없거나 호출이 실패하면 현재 이벤트 하나로 폴백한다.
- predicted 이벤트는 transient draft에만 사용한다. 문서 모델, undo, pressure/tilt/twist 배열,
  원근·아이소메트릭 ruler lock에는 반영하지 않는다.
- foreign pointer의 move/up/cancel은 활성 펜 획을 확정하거나 폐기하지 않는다. matching pointerup만
  한 번의 commit을 소유하므로 한 획은 한 undo 단위다.
- `pointerrawupdate`는 넣지 않았다. Konva `pointermove`와 이중 소비·순서 역전 가능성이 있어 전용 native
  listener ownership과 실제 장치 latency 계측 없이 활성화하지 않는다.

## 재발 방지

`vite.config.ts`가 production manifest를 만들고 `pnpm run check:studio-bundle`이 다음을 검사한다.

- Studio 정적 JS: 2,350,000B raw / 750,000B gzip 이하
- 앱 공통 엔트리: 500,000B raw / 170,000B gzip 이하
- SVG export, PSD export/import가 Studio 정적 폐쇄에 포함되지 않음
- `studio-background-3d-primitives`, `StudioBackground3D`, `react-three-fiber`, `three.module`이
  Studio 정적 폐쇄에 포함되지 않음
- `IntroSplash`와 `three.module`이 앱 공통 엔트리에 포함되지 않음

Studio 예산은 현재 측정값보다 raw 125,592B(5.6%), gzip 39,718B(5.6%) 여유를 두되, SVG/PSD,
3D 편집 런타임 또는 WebGL 인트로가 다시 정적 import되면 이름 검사에서도 즉시 실패하도록 잡았다.
로컬 `ci`와 GitHub Actions 모두 production build 직후 이 검사를 실행한다.

## 다음 우선순위

3D 런타임 분리는 완료됐다. 다음 번들 후보는 게시 package/schedule/preflight, AI runtime, 연속성
메타데이터 편집기의 조건부 패널이다. 각 단계는 기능 삭제가 아니라 intent preload와 오류 복구를
유지한 조건부 로딩으로 진행한다.

WebGPU는 엔진 이름만 교체하지 않는다. 현재 프로덕션은 Three/R3F를 사용 시점에 로드하는 경로를
유지하고, 렌더러와 무관한 비동기 캡처 어댑터와 WebGL 기준 pixel diff를 먼저 만든 뒤 대표 장면에서
Three WebGPU 경로를 단계적으로 비교한다. Babylon.js는 기존 실측 ADR의 이중 엔진 비용 때문에
프로덕션 의존성에 넣지 않고 lab-only 후보로 유지한다. 상세 수치와 공식 근거는
[3D 런타임 지연 로딩·WebGPU 단계 도입 벤치마크](./studio-3d-runtime-loading-benchmark-2026-07-13.md)에
분리해 기록했다.
