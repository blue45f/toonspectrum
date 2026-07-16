# Studio live session chat — 2026-07-16

Magma의 협업 커뮤니케이션 3축(통화 · 채팅 · 댓글) 중 ToonSpectrum Studio에는 댓글(작품 단위,
영속)과 화면 공유(WebRTC)만 있었고 **세션 채팅이 없었다**. 이 슬라이스는 실시간 작업실에
텍스트 채팅을 추가한다.

## 범위

- 프로토콜 kind `chat:message` (`studio-live-collaboration-protocol.ts`)
  - `{ messageId, text }` 브로드캐스트 전용. targeted 채팅(귓속말)은 프로토콜이 거부한다.
  - 텍스트는 500 code unit, 제어문자 금지, 공백 전용 금지. 기존 envelope 바이트/재생 방어를
    그대로 상속한다.
- 룸 (`studio-live-collaboration-room.ts`)
  - `sendChatMessage()`는 로컬 에코를 반환/이벤트로 방출한다. BroadcastChannel과 서버 룸
    브로드캐스트 모두 발신자에게 메시지를 되돌리지 않으므로 로컬 에코가 발신자의 기록이다.
  - 히스토리는 룸 메모리에만 최신 `STUDIO_LIVE_CHAT_HISTORY_LIMIT`(200)줄 보관. 세션 종료·권한
    회수 시 즉시 소거된다.
- 서버 (`apps/api/src/modules/creator/studio-live.gateway.ts`)
  - `studio:chat:send` → 룸 브로드캐스트 `studio:chat:message`. Socket.IO 어댑터를 타므로
    PostgreSQL 어댑터 구성의 다중 노드에서도 전달된다.
  - zod 스키마(500자·제어문자 금지) + 연결당 레이트리밋(10초에 20건) + ACL. **comment 또는
    edit capability가 없는 열람자(viewer)는 `forbidden`** — 채팅은 쓰기 행위로 취급한다.
- UI (`StudioLiveCollaborationPanel.tsx`, provider/context)
  - 같이 보기 패널에 `role="log"` 메시지 목록(자동 스크롤, 최대 높이 스크롤 컨테이너),
    라벨된 입력 + 44px 전송 버튼, 실패 시 `role="status"` 안내.
  - viewer 역할은 입력이 비활성화되고 사유를 placeholder/캡션으로 노출한다(UX 게이트,
    서버가 최종 강제).

## 저장하지 않는 것

채팅 본문은 문서 CRDT, PostgreSQL, localStorage, 활동 기록 어디에도 저장하지 않는다.
패널 카피("기록에 저장되지 않음")가 이 계약을 사용자에게 그대로 알린다. 영속 대화가 필요한
논의는 기존 작품 댓글(`StudioCommentsPanel`)이 담당한다.

## 검증

- 프로토콜: 경계(500자)·제어문자·공백·targeted·초과 키 거부 (`studio-live-collaboration-protocol.test.ts`)
- 룸: 로컬 에코 + 피어 수신 + 200줄 캡 + 닫힌 룸 거부 (`studio-live-collaboration-room.test.ts`)
- 소켓 트랜스포트: envelope ↔ 서버 이벤트 매핑, 미지의 connectionId·제어문자 수신 드롭
  (`studio-live-socket-transport.test.ts`)
- 게이트웨이: 브로드캐스트 대상/트림, viewer forbidden, invalid_payload, 레이트리밋 20/10초
  (`studio-live.gateway.test.ts`)
- 패널: 메시지/발신자/시각 렌더, id 미노출, viewer 비활성 카피 (`StudioLiveCollaborationPanel.test.tsx`)

## 후속 범위 (이 슬라이스 아님)

- 패널이 닫혀 있을 때 presence dock 안읽음 배지
- 음성 통화(Magma calls) — WebRTC 오디오는 화면 공유와 별개 동의/보안 검토 필요
- 채팅에서 특정 컷/요소로 점프하는 앵커 링크
