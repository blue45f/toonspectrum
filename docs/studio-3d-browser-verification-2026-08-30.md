# Studio 3D 표면 실 브라우저 전수 검증 (2026-08-30)

- 상태: 검증 완료 · 결함 2건 수정 · 회귀 스위트 상설화.
- 검증 환경: Chromium(headless) + ANGLE/SwiftShader WebGL2, Vite dev 서버, Studio API 서버 없음.
- 상설 스위트: `e2e/studio-3d-visual-verification.spec.ts`
  (`pnpm exec playwright test e2e/studio-3d-visual-verification.spec.ts`).

## 왜 DOM 검사로는 부족했나

기존 3D E2E(`comprehensive-browser-audit`, `studio-full-verification`)는 다이얼로그가 열리고
버튼이 보이는지만 확인한다. 그래서 **뷰포트가 완전히 비어 있어도, 3D 배경이 캔버스에 한 번도
붙지 않아도 통과한다**. 실제로 아래 결함 1은 그 상태로 통과하고 있었다.

새 스위트는 렌더된 프레임의 픽셀을 판정 근거로 쓴다. WebGL 캔버스는
`preserveDrawingBuffer: false`로 만들어져 페이지 안에서 `drawImage`로 되읽으면 항상 비어
있으므로, Playwright가 합성 프레임을 PNG로 찍고 그 PNG를 다시 페이지에 넣어 브라우저가
디코딩하게 한 뒤 통계를 낸다(Node 측 이미지 의존성 없음).

`playwright.config.ts`는 GPU 없는 머신에서도 실제 프레임이 나오도록 ANGLE/SwiftShader 인자를
넘긴다. 이는 WebGPU가 없는 브라우저에서 BG3D가 실제로 내려가는 기준선과 같은 경로다.

## 결함 1 — 3D 배경을 캔버스에 붙일 수 없었다

`/studio`는 저장된 작품 id가 없는 모든 세션에 `?room=work-instant-…` 잼 룸을 발행한다
(`shouldPublishStudioLiveJamRoom`). 그래서 `studioLiveJam = Boolean(liveRoomQueryParam || !workId)`가
참이 되고 `isRealtimeTeamSession`도 참이 된다. 로그인해서 저장된 작품을 열면 이번에는
`expectsSharedDocument`가 참이라 역시 같은 값이 된다.

`applyBg3dRenderedImage`는 그 값 하나로 실패로 닫혀 있었다. 즉 **사용자가 실제로 도달하는 모든
경로에서 3D 배경 삽입이 거부**됐고, 화면에는 "일반 작업 문서에서 적용해 주세요"라는, 도달할 수
있는 문서가 존재하지 않는 안내만 남았다.

fail-closed의 근거 자체는 유효하다. `linked3dRender`·`shared3dStage`·LT 번들은 아직 하나의
CRDT/CAS 영수증을 공유하지 않아서, 분리 레이어 묶음을 실시간 룸에 발행하면 원격 참가자가
해석할 수 없는 빈 참조가 된다. 바뀐 것은 **거부 대신 무엇을 주느냐**다.

실시간 룸은 이제 문서 마스터 표면이 이미 쓰던 것과 같은 **자기완결 병합 합성**을 받는다.
래스터 본문 하나와 그 안에 담긴 장면 문서가 전부이고, 요소 바깥을 가리키는 id가 없다 — 붙여넣은
이미지 레이어가 이미 복제되는 것과 같은 모양이다. "빈 원격 참조를 만들지 않는다"는 성질은 그대로
유지되고, 3D 배경은 붙는다. 장면 원본이 요소에 실려 있으므로 잃는 것은 분리된 컬러·톤·선화
레이어이지 3D 원본이 아니며, 그 사실을 상태 레일이 알린다.

## 결함 2 — 성공 알림이 빨간 오류 배너로 나갔다

상태 레일은 `error` 한 채널만 갖고 있고 항상 "bad" 톤과 `오류 메시지 닫기` 컨트롤로 렌더된다.
병합 합성 안내처럼 **성공했지만 결과 모양이 다른** 경우를 그 채널로 보내면 실패처럼 보인다.
중립 알림 채널(`role="status"`)을 레일에 추가하고 이 안내를 그쪽으로 보냈다.

같은 채널이 Hybrid 3D DCC의 죽은 버튼도 고친다. `openHybridDccWorkspace`는 권한이 확정되기
전에는 라우트에 진입하지 않고 사유를 `onAnnounce`(aria-live)로만 보냈다. 라우트에 못 들어가면
`StudioHybridDccRouteGate`도 마운트되지 않으므로, 화면에는 아무 변화가 없었다 — 버튼이 고장난
것처럼 보인다. 이제 같은 사유가 상태 레일에도 남는다.

## 정상 확인된 3D 기능

실 브라우저에서 프레임과 상호작용으로 확인했고, 콘솔·페이지 오류는 0건이었다.

| 표면 | 확인 내용 |
| --- | --- |
| BG3D 엔진 | WebGPU 없는 브라우저에서 WebGL2로 내려가고 그 사유를 표시 |
| BG3D 도형 | 상자·원기둥·구 추가 시 프레임이 실제로 바뀜, 기즈모 동작 |
| BG3D 절차형 에셋 | "오픈 룸 셸" 4파츠로 추가, 파츠별 편집 가능 |
| BG3D 선화(LT) 미리보기 | 같은 장면이 선화로 다시 래스터화됨 |
| BG3D 변환 | 이동·회전·크기, 글로벌/로컬 축, 스냅, 바닥 접지 |
| BG3D 4분할 뷰 | 4개 뷰가 각자 카메라로 렌더 |
| BG3D 탭 | 도형·템플릿·레이어·보기·LT·에셋 전환 |
| BG3D 모델 첨부 | `.glb` 가져오기 → 씬·레이어에 반영 |
| BG3D 실행취소/다시실행 | 동작 |
| 3D 캐릭터(VRM) | 캐릭터 렌더, `.vrm` 업로드, "이 포즈로 추가"가 캔버스 레이어 생성 |
| 3D 데생 인형 | 렌더, 포즈 라이브러리, "캔버스로 캡처"가 캔버스에 삽입 |

캔버스 삽입 경로는 넷 중 하나만 막혀 있었다. 3D 캐릭터의 "이 포즈로 추가", 3D 데생 인형의
"캔버스로 캡처", `.glb`/`.vrm` 파일 첨부는 모두 정상이었고, 막힌 것은 3D 배경뿐이었다.

## 이 환경에서 확인하지 못한 것

컨테이너의 Chromium 빌드는 `navigator.gpu`를 노출하지 않는다(여러 플래그 조합으로 확인).
따라서 **WebGPU 백엔드의 렌더 경로는 여기서 실행되지 않았다.** WebGPU가 있는 브라우저의 BG3D
렌더링 판정은 `scripts/verify-studio-bg3d-webgpu-engine.mjs`가 담당하며, 그 스크립트는 WebGPU가
없으면 종료 코드 2로 명시적 환경 스킵을 낸다. 새 E2E 스위트는 두 백엔드 중 무엇이 선택되든
프레임이 실제로 그려지는지를 판정하므로, WebGPU가 있는 머신에서 그대로 돌리면 그 경로도 덮는다.
