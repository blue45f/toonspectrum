# 오프라인 드로잉·실제 추론·공간형 리더

- 상태: **현재 runtime 설명**
- 최종 갱신: **2026-09-26**

## 사용자 진입점

- `/draw-app/install.html`: **ToonStudio Draw** 설치 화면이다. 별도 editor가 아니라 canonical `/studio`를
  `drawingShell=app&uiMode=focus&startTool=draw`로 연다. 문서 ID, brush engine, layer, autosave,
  collaboration, import/export와 project storage는 일반 Studio와 같다.
- `/studio?...&drawingShell=app`: 같은 Studio를 canvas-first chrome으로 표시한다.
- `/studio?...&drawingShell=integrated`: 같은 문서를 일반 production Studio chrome으로 되돌린다.
- `/offline-draw/`: 인증, API, React bundle, 외부 font 없이 동작하는 **비상 복구 editor**다. Studio와
  기능 동등성을 주장하거나 ToonStudio Draw로 설치하지 않는다.
- `/offline-draw/portable.html`: 저장 후 origin·service worker·CDN·API 없이 여는 단일 HTML 복구본이다.
- `/studio/ai-lab`: 인증된 실제 Wan/TripoSR/SDXL 작업 제출, 진행, 취소, 검증 download, owner cleanup 화면이다.
- `/spatial-reader/`: image가 내장된 chapter의 2D/spatial/AR/VR 저작·읽기와 `.toonspace` export를 제공한다.

제품 drawing 경험은 **하나의 source/runtime과 두 presentation**으로 구성한다. 비상 editor는 복원용 별도
surface이며 제품 구현의 대체 권위가 아니다.

## 서버 장애 동작

초기 bootstrap은 React 앱과 독립적으로 작은 `/offline-draw/` shell을 준비한다. root service worker는
same-origin GET 중 승인된 static asset만 처리하고 write queue나 private API cache를 만들지 않는다.
Studio navigation에서 network 실패, HTTP 5xx 또는 4초 응답 실패가 발생하면 준비된 비상 shell을 새
경로로 제안할 수 있다. 열린 Studio tab을 API 실패만으로 조용히 대체하지 않는다.

설치형 ToonStudio Draw는 정상 Studio service worker와 저장소를 사용한다. `/offline-draw/` worker는
자기 scope에만 머물러 competing document authority가 되지 않는다.

최초 사용에는 정상 설치·cache 또는 portable file 보유가 필요하다. storage 삭제, private mode, quota
압박은 자동 저장을 제거할 수 있으므로 명시적 backup export를 유지한다. worker는 실행 중 editor를
`skipWaiting`/`clients.claim`으로 획 중간 교체하지 않는다.

## 로컬 데이터 안전

- Studio/ToonStudio Draw: 기존 Studio 문서 저장·복구·협업 권위를 공유한다.
- 비상 editor: `toonstudio-emergency-drawing-v1`을 사용하고 Studio OPFS/SQLite와 분리한다.
- 비상 문서: 문서와 최근 revision 5개를 원자 commit한다. 성공한 transaction만 저장 완료로 표시한다.
- version 충돌: overwrite 대신 recovery copy를 만든다.
- spatial chapter: `toonstudio-spatial-reader-v1`을 사용하고 다시 열 때 chapter ID를 fork한다.

storage 실패 시 memory의 작업을 유지하고 저장 실패와 export 선택지를 명시한다.

## 공간 렌더링 계약

하나의 native WebGL owner가 현재 cut과 앞뒤 cut을 렌더한다. source image 최대 2048px, GPU upload
최대 1024px, cut당 depth layer 최대 4개다. 3-cut window 밖 texture는 해제하고 desktop은 상시 loop
대신 변경 시 렌더한다. DPR은 1.5로 제한한다.

WebXR은 eye별 projection/view matrix와 viewport를 사용한다. 진입에는 사용자 gesture가 필요하다.
AR은 가능하면 hit-test/DOM overlay를 쓰고, VR은 controller ray나 debounce된 stick을 사용한다.
이전·다음·종료와 flat DOM reader를 유지하며 자동 cut 진행은 opt-in이다. 실제 hardware 지원은
browser/device와 secure context에 의존하고 별도 수용 검사가 필요하다.

## 실제 추론 경계

CPU test runner는 API·validation을 검증할 뿐 생성 품질을 증명하지 않는다. model weight, GPU,
license, moderation과 비용 budget을 검토한 뒤에만 실제 worker를 활성화한다. 설정되지 않은 engine은
503으로 실패하며 성공 형태의 placeholder를 반환하지 않는다.

세부 설치·보안·license는 `services/creator-inference/README.md`를 따른다.

## 검증 명령

```sh
node --test tools/creator-runtime/contracts.test.mjs
node tools/creator-runtime/build-portable.mjs --check
python -m pytest services/creator-inference/test_runtime.py -q
node tools/creator-runtime/compile-worker.mjs
python tools/creator-runtime/offline-browser.py
python tools/creator-runtime/spatial-browser.py
rm -f apps/web/public/__test-sw.js
pnpm typecheck
pnpm build
```

브라우저 script는 실제 worker source와 로컬 HTTP fixture를 사용한다. hardware XR과 실제 model inference는
별도 수용 게이트다.

## 릴리스 점검

- contract/API/browser/typecheck/build와 screenshot 검토
- immutable model revision과 license 검토
- 세 실제 inference 경로의 output·시간 안정성·pose/identity·mesh 결함 검토
- Android XR 배치·종료와 지원 headset controller 검증
- 실제 host의 response header와 service worker upgrade 확인
- retention·model usage 정책 게시

이 구성요소 문서 자체는 유료 API·hardware provision, main merge 또는 운영 배포를 수행하지 않는다.
