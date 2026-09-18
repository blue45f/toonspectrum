# Studio P2P 가상 창작 스튜디오 — 2026-09-18

상태: **current implementation slice**. 기존 Studio 실시간 협업과 P2P Huddle 위에 서버 비영속 공간 presence를 추가한다.

## 목적

일반 가상 오피스를 복제하지 않고 웹툰·웹소설 제작에 맞춘 2D 창작 공간을 제공한다.

- Project Lobby
- Writers Room
- Storyboard Wall
- Creator Lounge
- Asset Library
- Drawing Studio
- Review Room
- Assistant Desk

사용자는 공간을 클릭·드래그·방향키·모바일 탭으로 이동한다. 같은 프로젝트의 P2P 참여자 위치와 작업 상태를 보고, 같은 존에서 가까운 사용자를 근접 대화 대상으로 삼을 수 있다.

## 비용 경계

새 서버, DB 테이블, 외부 RTC SDK, SFU, TURN 계정은 추가하지 않는다.

```text
authenticated Studio room
        │
        ├─ 기존 signaling / admission
        │
        └─ WebRTC DataChannel mesh
              ├─ P2P chat
              ├─ virtual-space position / zone / activity
              └─ huddle control

nearby peers only
        └─ separate WebRTC RTP peer connections
              ├─ microphone
              ├─ camera
              └─ screen share
```

공간 좌표·존·상태는 `StudioLiveDirectPort`의 `studio-direct-v1` RTCDataChannel로만 전송한다. primary/server transport로 fallback하지 않으며 서버에 저장하지 않는다.

미디어는 기존 Huddle의 STUN-only P2P RTP를 재사용한다. 근접 미디어가 활성화되면 동일 존이면서 거리 반경 안에 있는 사용자만 별도 미디어 PeerConnection 대상이 된다. 멀어지면 해당 RTP 연결을 닫되 DataChannel mesh와 텍스트 협업은 유지한다.

## 동작과 수명주기

가상 공간은 사용자가 **P2P 채팅 참여**에 명시적으로 동의한 뒤에만 시작한다. 컴포넌트 mount만으로 카메라나 마이크 권한을 요청하지 않는다.

위치 상태는 브라우저 메모리에만 존재한다.

- heartbeat: 4초
- stale peer: 12초
- pointer 이동 전송 최소 간격: 90ms
- 좌표: 0–100 정규화 후 2–98로 clamp
- 근접 반경: 동일 존 + 24 단위
- direct frame 상한: 4KiB
- sequence/epoch로 오래된 상태 replay를 무시

작품 전환, Huddle 나가기, transport 종료, component unmount 시 `space-left`를 best-effort로 보내고 타이머·구독·메모리 상태를 정리한다.

## 개인정보와 제한

P2P 특성상 직접 연결 상대에게 네트워크 주소가 노출될 수 있다. 공간 좌표는 실제 위치정보가 아니라 프로젝트 UI 내부의 정규화된 가상 좌표다.

STUN-only이므로 일부 회사망, 대칭 NAT, 방화벽, 인앱 브라우저에서는 직접 연결이 실패할 수 있다. 실패해도 유료 TURN/SFU나 서버 미디어 중계로 자동 전환하지 않는다.

미디어 Huddle은 기존 정책대로 소규모 팀을 대상으로 한다. 공간 presence는 기존 P2P overlay 상한 안에서 동작하지만 대규모 회의나 웨비나를 목표로 하지 않는다.

## 경험 모드와 UI 원칙

공개 홈은 데이터와 라우트를 복제하지 않고 표현 레이어만 바꾸는 두 가지 경험 모드를 제공한다.

- Classic: 기존 제작 중심 홈을 그대로 유지
- Virtual Studio: 좌측 내비게이션, 중앙 제작 룸, 우측 Huddle/채팅/AI 패널, 하단 기능 스트립으로 같은 기능을 공간형 UI로 표현
- 선택은 브라우저에 저장하며 색상 테마와 독립적으로 유지
- 모바일에서는 공간 이동을 방 카드/바로가기 중심으로 단순화

실제 P2P 공간에서는 다음 원칙을 유지한다.

- PC: 지도 클릭·드래그·방향키 이동
- 모바일: 지도 탭과 존 바로가기 버튼
- 드로잉 중에는 기존 collaboration floating UI가 자동으로 접히는 규칙을 유지
- 마이크·카메라·화면 공유는 기존 명시적 버튼에서만 활성화
- 근접 미디어를 끄면 기존 Huddle처럼 참여자 전체를 미디어 대상으로 사용할 수 있음
- 가상 공간이 닫혀도 문서 CRDT, 잠금, 저장, 복구의 권위 경로는 변경하지 않음

## 검증

단위 테스트:

- `studio-p2p-space-controller.test.ts`
  - RTC direct lane으로만 공간 상태 교환
  - 존/거리 기반 proximity 계산
  - pointer 이동 전송 throttle + final flush
  - 인증된 peer set에서 사라진 참가자 정리
  - viewer 공간 세션 미시작
- `studio-p2p-huddle-controller.test.ts`
  - proximity scope 밖에서는 미디어 PeerConnection 미생성
  - scope 진입 시 생성
  - scope 이탈 시 RTP PeerConnection 종료
- `StudioP2pHuddleLauncher.test.tsx`
  - P2P 참여 동의 전 가상 공간 미시작
  - 참여 후 공간 UI 노출
  - 공간 진입만으로 기기 캡처를 요청하지 않음

운영 배포는 `AGENTS.md` 정책대로 별도 명시적 승인 전에는 수행하지 않는다.

## 후속 단계

현재 슬라이스 이후 확장 시에도 서버 비용을 우선 통제한다.

1. Storyboard/Review/Drawing zone을 실제 Studio 패널·프로젝트 기능과 연결
2. P2P cursor-follow와 공간 아바타의 follow-user 동작 통합
3. 공간별 임시 화이트보드/포스트잇을 direct lane 또는 기존 CRDT에 명확히 구분해 연결
4. 4인 초과 미디어 요구가 실제로 확인될 때만 선택적 SFU adapter 검토
5. TURN은 연결 성공률 데이터와 운영 비용을 확인한 뒤 opt-in fallback으로만 검토
