# SHAPER 외부 비교·기기 검증 가능 범위 — 2026-09-13

기준 checkout: `4ab96607a53d03bc0e8efc0d118b44978f056afc`. 초기 읽기 전용 환경 조사 이후 공식 설치기를 임시 경로에서 다운로드하고 실행했다. 본 앱 설치·구매·로그인·외부 파일 전송·SHAPER의 3D 실행은 완료하지 않았다.

## 확인한 앱과 접근 범위

- [SHAPER 공식 웹](https://shaper.webtoons.com/)과 [공식 사용 가이드](https://shaper.webtoons.com/how-to/)는 접근 가능했다. Windows/macOS 설치형 다운로드 링크와 프리셋·직접 그리기·포즈 인식·PSD 내보내기 설명이 있다. 브라우저에서 편집 가능한 SHAPER 실행 화면은 확인하지 못했다.
- `/Applications` 및 `~/Applications`의 앱 번들 목록에서 `/Applications/Blender.app`을 확인했다. SHAPER, Photoshop, CLIP STUDIO PAINT, Krita, GIMP, Affinity, Pixelmator는 해당 범위에서 발견되지 않았다. 비표준 설치 위치나 실행 가능한 라이선스 보유 여부까지 부재를 단정하지 않는다.
- PATH에서 Blender 실행 파일이 확인됐다. ImageMagick, GIMP, Krita 명령과 Python `psd_tools`는 발견되지 않았다. Python Pillow·NumPy는 존재하지만 PSD 저장 미리보기를 읽는 것과 편집용 레이어를 독립 재합성하는 것은 다른 검증이다.
- Blender는 장면·조명·구도 비교용 참조 렌더러 후보이다. 설치 사실은 VRM 가져오기 애드온, MToon 재현, PSD 레이어 재합성 지원을 증명하지 않는다. 이번 조사에서 Blender 렌더링이나 애드온 설치는 하지 않았다.

## 실제 동일 장면 비교에 필요한 조건

[공식 macOS 다운로드](https://shaper.webtoons.com/api/clients/download?file_path=macInstaller%2FShaperInstaller.zip)의 인증 없는 GET으로 1,154,962바이트 ZIP을 받았다. SHA-256은 `51eeebe357a2abee41b7489326b6ea0eb983cc0edb7ea00f99a72a78d5cfbd7a`이다. 이 파일은 본 앱 전체가 아닌 Intel x86_64 설치기(`0.1`)이며 최종 설치 용량은 미확인이다. 기존 Rosetta가 있는 macOS 26.7에서 임시 설치기 프로세스가 실행되는 것까지 확인했다. 설치기의 빌드 최소 버전 10.7을 SHAPER 본 앱의 지원 사양으로 해석하지 않는다.

현재 컴퓨터 제어 도구는 실행된 설치기를 앱 목록에 노출하지 않았다. 직접 앱 선택과 Finder 경로 입력도 도구 오류로 완료하지 못했다. 그래서 설치 대상, 동의·로그인 화면, 실제 import 메뉴를 관찰하지 못했고, 임시 설치기 프로세스는 종료했다. 이는 SHAPER 제품의 실행 실패나 Mac 미지원 증거가 아니다. [공식 사용 가이드](https://shaper.webtoons.com/how-to/)와 [출시 공지](https://shaper.webtoons.com/notice/01/)만으로 로그인 필수, 외부 GLB/VRM/FBX/OBJ 지원, 본 앱의 네이티브 Apple Silicon 지원을 단정하지 않는다. 원본 메타데이터·실행 기록은 `/private/tmp/shaper-official-research/feasibility-report.md`에 보존했다.

1. SHAPER가 설치·실행 가능한 환경과 동일 자산 반입/반출 허용 범위를 확인해야 한다. 공식 소개에 공통 VRM/GLB 가져오기가 명시되지 않았으므로 동일 메시를 SHAPER에 넣을 수 있다고 가정하지 않는다. 공통 자산 반입이 불가능하면 같은 모델의 픽셀 비교 대신 같은 제작 과제의 품질·작업시간 비교로 구분한다.
2. 공통 자산이 가능할 때 자산 해시·포즈·표정·카메라 투영/FOV/위치·출력 해상도·배경 알파·색 공간·조명·선 굵기와 앱 버전을 기록한다. 정면/측면/원근 축소, 겹친 머리카락, 반투명 가장자리, 어두운 소재, 의상 변형을 같은 조건으로 PNG/PSD 출력한다.
3. Photoshop/CSP 등 외부 편집기가 준비되면 PSD를 열고 숨김 Beauty를 계속 숨긴 채 실제 편집용 레이어만 재합성한다. 투명 PNG로 내보내 원본 Beauty와 알파 및 검정/흰색 배경 합성 오차를 비교한다. 단순 저장 merged preview 열람이나 숨김 Beauty 표시를 레이어 호환성 통과로 기록하지 않는다.
4. 레이어명·가시성·혼합 모드·클리핑·마스크를 확인하고 한 레이어 변경 후 저장/재열기까지 증거를 남긴다. 앱별 다른 결과는 각각 기록한다. 이번 조사에서는 이 외부 앱 검증을 완료하지 못했다.

## 기기 및 기존 측정 도구

- `adb`, `idevice_id`는 PATH에 없고 `xcrun devicectl`은 제공되지 않았다. Xcode 선택 경로는 `/Library/Developer/CommandLineTools`이다. `system_profiler SPUSBDataType -json`에서 기기 이름을 얻지 못했다. 따라서 연결된 실제 Android/iOS 기기를 확인하지 못했다. 샌드박스에서 CPU/메모리 `sysctl` 조회는 권한 오류였으므로 이 결과로 하드웨어 사양을 단정하지 않는다.
- [Playwright 에뮬레이션](https://playwright.dev/docs/emulation)은 viewport·UA·touch 등 브라우저 동작을 설정한다. 기존 Character/BG3D 모바일 프로필은 이 범주이며 실제 휴대전화의 GPU·발열·메모리 압박 측정이 아니다.
- [Chrome Android 원격 디버깅](https://developer.chrome.com/docs/devtools/remote-debugging/)은 실제 장치, USB 디버깅, 장치의 연결 승인 및 모델명 확인이 필요하다. 이 연결을 새로 설정하지 않았다.
- `scripts/verify-studio-five-hour-soak.mts`는 한 편집기에서 드로잉·브러시·history를 반복하지만 기본 launch에 SwiftShader 플래그가 있다. 네이티브 3D 성능 근거로 그대로 사용할 수 없다.
- `scripts/qa-studio-cross-browser-soak.mjs`는 반복 route/context/viewport 순회다. `scripts/qa/studio-soak-config.mjs`는 여러 짧은 verifier를 재실행하는 작업 구성이다. 둘 모두 하나의 3D 렌더러를 30분 유지하는 출력 자원 수명 검증과 다르다.
- `studio-bg3d-engine-benchmark-analysis.ts`의 30분·입력 p95·프레임·용량 기준은 엔진 도입 판정 계약이다. 계약 존재는 해당 기기/장면에서 실제 측정했다는 증거가 아니다.

## 이번에 준비한 출력 soak

`scripts/verify-studio-3d-quality-soak.mts`와 독립 `apps/web/tools/browser-harnesses/studio-3d-quality-soak.ts`는 실제 bundled VRM을 production cooperative RGBA/PNG Worker API로 반복 출력한다. 원근·직교 카메라 두 번의 완전한 warmup 이후 30분간 같은 렌더러를 유지한다. 각 순환에서 부분 타일 PNG, 4K 첫 타일 취소, 재시도, viewport의 프레임 렌더, 카메라/배경/outline/renderer 복원, GPU 자원 수와 Worker 종료를 확인한다.

- 실제 렌더러의 WebGL 식별값을 측정 시작 전에 검사하고 소프트웨어 렌더링이면 중단한다. 브라우저 실행 경로·버전·소스/자산 SHA를 기록한다.
- warmup 이후 같은 고정 장면에서 textures/geometries/programs 수가 baseline과 같아야 한다. 모든 순환에서 Worker 생성/종료 수가 일치하고 활성 Worker가 0이어야 한다. 이는 소유 자원 수 검사이며 총 GPU 바이트나 운영체제 RSS 상한이 아니다.
- CDP main renderer heap/backing storage, 캡처·인코딩 시간, 긴 작업·프레임 간격은 정보로 기록한다. 새로운 벽시계 성능 통과 기준은 추가하지 않는다. CPU 4배 throttle 또는 mobile-emulated 프로필은 실제 저사양/모바일 기기로 표시하지 않는다.
- 30분 미만은 `smoke-passed-duration-not-qualified`로 기록한다. 이 도구는 소스 모듈 격리 harness이며 생산 번들 UI·undo/save·PSD·BG3D 엔진 전체·기기 연결 복구를 검증했다고 주장하지 않는다.

짧은 smoke 예시(GPU 예약 후 실행):

```sh
TOONSPECTRUM_SOAK_3D_MINUTES=0.1 TOONSPECTRUM_SOAK_3D_CYCLE_MS=1000 TOONSPECTRUM_SOAK_3D_OUT=/private/tmp/shaper-remaining-qa/soak-smoke pnpm_config_verify_deps_before_run=warn pnpm exec tsx scripts/verify-studio-3d-quality-soak.mts
```

동일 명령에서 minutes=30, 출력 폴더를 별도로 정하면 30분 측정이다. 측정 중 다른 GPU 검증을 병렬 실행하지 않는다. 준비한 도구와 실제 실행 결과는 구분하며, 결과 파일이 생성되고 실패/기간/기기 판정을 확인되기 전까지 완료로 기록하지 않는다.

## 이번 환경에서 실행한 짧은 native smoke

2026-09-13 03:39 KST, `/private/tmp/shaper-remaining-qa/soak-smoke-final/result.json`에 `smoke-passed-duration-not-qualified`를 기록했다. full Chromium `151.0.7922.34`의 실제 렌더러는 `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)`이었다. 두 warmup 이후 6,004.665ms 동안 6회, 전체 8회 순환을 완료했다. Worker 8개 생성/8개 종료·활성 0, context loss 0, console/pageerror 0을 확인했다. GPU 자원 수는 warmup 이후 textures 28/geometries 14/programs 16으로 유지됐으며 최종 정리 후 모두 0이었다.

첫 smoke의 정리 검사는 공유 fullscreen geometry 1개를 발견해 실패했다. 이는 제품 캡처가 반복 사용을 위해 의도적으로 유지하는 Three OutputPass 모듈 자원이었다. 독립 페이지의 마지막 캡처가 끝난 뒤만 해당 공유 자원을 명시적으로 해제하도록 harness를 수정했고, 0개 검사를 유지한 채 재실행했다. 제품 수명 정책은 바꾸지 않았다.

이 결과는 30분 지속성, CPU throttle 4배, 실제 모바일, 저사양 기기, 생산 번들 UI, PSD 외부 앱 호환성의 통과를 의미하지 않는다. 긴 작업 합계는 초기화와 warmup을 포함하며, frame-gap 통계는 warmup 이후이다. 모든 시간은 이 짧은 실행의 정보성 관측이다. 실행 프로세스는 exit 0으로 종료되고 전용 브라우저와 Vite 서버도 정리됐다.
