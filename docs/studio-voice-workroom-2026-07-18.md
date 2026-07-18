# Studio WebRTC 음성 작업실 — 2026-07-18

Studio의 실시간 협업에 짧은 작업 대화를 위한 **최대 6인 오디오 전용 P2P 허들**을 추가한다.
화면 공유 오디오에 묶이지 않은 독립 기능이며, 팀 패널은 조작 UI일 뿐 통화 수명주기를 소유하지
않는다.

## 사용자 계약

- 사용자가 `음성 참가`를 명시적으로 누른 뒤에만 브라우저의 마이크 권한을 요청한다. Provider
  마운트, 팀 패널 열기, 다른 참가자의 입장만으로는 WebRTC 컨트롤러 청크도 내려받지 않고 권한도
  요청하지 않는다. 작품·역할이 바뀌는 동안 늦게 끝난 로딩이나 캡처는 해당 세대에서 즉시 폐기한다.
- 캡처는 오디오 전용이며 echo cancellation, noise suppression, automatic gain control을
  요청한다. 영상 권한과 화면 캡처 권한은 요청하지 않는다.
- 참가 후 일반 음소거와 `눌러 말하기`를 제공한다. 눌러 말하기는 포인터/키를 놓을 때뿐 아니라
  포인터 캡처 유실, 창 포커스 상실, 탭 숨김, 조작 UI 해제에서도 즉시 송출을 중지한다.
- 브라우저가 원격 오디오 자동 재생을 차단하면 참여자별 `재생` 버튼을 노출해 사용자 제스처로
  안전하게 재시도한다.
- 패널을 닫아도 항상 마운트된 collaboration provider와 숨겨진 오디오 sink가 통화를 유지한다.
  미니 도크에서 음소거, 참여자 수 확인, 상세 패널 열기, 나가기를 수행할 수 있다.

## 전송·권한 경계

- `voice:join`, `voice:state`, `voice:leave`, targeted `voice:description`, `voice:ice`만 허용하는
  엄격한 프로토콜을 사용한다. SDP/ICE와 원시 오디오는 채팅, 댓글, CRDT 문서, PostgreSQL,
  localStorage, 활동 기록에 기록하지 않는다.
- viewer는 클라이언트·로컬 transport·서버 gateway 모두에서 거절한다. commenter, editor,
  admin, owner만 참여할 수 있고 서버가 작품 ACL을 최종 강제한다.
- 서버는 발신자와 대상이 같은 작품·같은 `callId`에 실제로 참가 중인지 검사하며 자기 자신을
  대상으로 보내는 신호, 다른 작품/허들의 신호, 미가입 대상, 초과 키와 잘못된 payload를
  거절한다.
- 서버 또는 BroadcastChannel은 SDP/ICE 시그널만 중계한다. WebRTC 미디어는 DTLS-SRTP로
  보호되며, 브라우저가 직접 경로를 만들 수 없을 때는 배포 소유 TURN이 암호화된 패킷을
  중계한다. TURN은 오디오를 복호화하거나 작품 문서에 기록하지 않는다. 로컬 fallback은 외부
  ICE 서버를 전혀 사용하지 않으며 같은 허들 팀원끼리 직접 후보가 교환될 수 있음을 UI에
  명확히 표시한다.
- 6명 제한은 로컬 컨트롤러와 룸/서버 admission 양쪽에서 강제한다. 세션 ID 순서로 한쪽만
  offerer가 되도록 정해 glare를 피하고, remote description보다 먼저 온 ICE는 제한된 큐에서
  기다린 뒤 적용한다.
- 서버 모드에서는 `voice:join`의 권한·정원 ACK가 도착하기 전 offer/ICE와 최신 음소거 상태를
  세대별 제한 큐에 둔다. 10초 안에 승인이 오지 않거나 거절되면 큐를 폐기하고 마이크·피어를
  종료하며, 늦은 ACK에는 즉시 leave를 보내 유령 membership이 생기지 않게 한다.
- 다중 API 노드에서는 작품별 PostgreSQL advisory lock 안에서 현재 어댑터 membership을 다시
  조회한 뒤 admission을 결정한다. 조회 실패나 모호한 결과는 fail-closed 처리해 동시 참가자가
  여섯 번째 자리를 함께 차지하거나 기존 참가자가 밀려나는 경쟁 조건을 막는다.
- 노드 사이로 전달된 SDP/ICE는 최종 수신 노드에서 발신자와 수신자의 현재 작품·통화 membership,
  소켓 세대, 권한을 다시 확인한다. 중계 중 퇴장하거나 재접속한 세션의 오래된 신호는 버리고,
  짧은 TTL과 제한된 크기의 dedupe 캐시로 같은 신호가 중복 전달되는 것도 막는다.
- 인증 주체와 권한은 gateway의 비공개 저장소에서만 유지한다. 공유 Socket.IO 어댑터가 볼 수 있는
  `socket.data`에는 라우팅에 필요한 공개 participant/membership 정보만 넣고, 연결 실패·권한 회수·
  퇴장·모듈 종료 때 인증 정보와 핸드셰이크 토큰을 정리한다.

## 배포 소유 TURN 정책

- 서버 room에서 사용자가 `음성 참가`를 누르면 마이크 권한보다 먼저 인증된
  `GET /creator/works/:id/voice/ice`를 호출한다. 현재 작품 ACL을 다시 읽어 active commenter 이상만
  허용하며 viewer, 다른 작품 사용자, 비인증 요청은 자격증명을 받지 못한다. 응답은
  `Cache-Control: private, no-store`이고 room broadcast, Socket.IO adapter, CRDT, localStorage에
  넣지 않는다.
- 발급기는 coturn REST API 방식의 `${expiry}:${opaqueIdentity}` username과 HMAC-SHA1 credential을
  만든다. opaque identity는 배포 비밀로 HMAC 처리해 TURN 로그에 원본 user/work ID가 남지 않게
  하고, 기본 900초의 짧은 TTL만 허용한다. 정책 계약은 사용자 정보가 들어간 URL, 제어 문자,
  임의 query, 불완전한 credential, STUN/TURN 혼합 서버 항목을 거절한다.
- 브라우저는 정책 요청을 10초로 제한하고 작품 전환, 권한 변경, 나가기, 참가 실패, Provider
  해제 시 요청·갱신 타이머·메모리 자격증명을 즉시 폐기한다. 정책의 서버 발급 시각과 TTL을
  검증하되 실제 lease는 응답 수신 시각에 고정해 브라우저 시계 오차 때문에 새 credential이
  즉시 만료되지 않게 한다.
- 만료 전에 새 credential을 받아 열려 있는 모든 `RTCPeerConnection`에 `setConfiguration`으로
  적용한다. 참가자 세션 ID로 정한 단 하나의 offerer만 `restartIce()`와 ICE-restart offer를
  보내므로 양쪽이 동시에 재협상하는 glare를 피한다. 갱신 실패는 단일 in-flight 요청,
  지수 backoff와 jitter로 제한하고, 이미 만료된 credential은 새 peer에 절대 재사용하지 않는다.
- `STUDIO_VOICE_TURN_REQUIRED=true`인 경우 UDP relay 경로와 TCP 또는 TLS/TCP 경로가 모두
  없으면 잘못된 부분 구성으로 보고 Nest 모듈 초기화가 실패한다. `NODE_ENV=production`에서 필수
  모드를 켜지 않은 배포는 전체 API를 중단시키지 않되 음성 정책 endpoint만 503으로 fail-closed한다.
  따라서 운영 사용자가 조용히 direct 모드로 내려가지는 않는다. development/test만 설정이 없을
  때 privacy-preserving direct 모드로 동작한다.
- HTTP 자격증명 발급기는 일반 API origin(`VITE_API_BASE`/runtime API)을 사용하고, 시그널링은
  별도 `VITE_STUDIO_LIVE_ORIGIN`을 사용할 수 있다. 두 Nest 배포는 같은 세션/ACL 버전과 계약을
  사용해야 하며 TURN shared secret은 발급 API와 실제 TURN 데이터 플레인에만 존재해야 한다.

필수 운영 변수:

```dotenv
STUDIO_VOICE_STUN_URLS=stun:voice.example.com:3478
STUDIO_VOICE_TURN_URLS=turn:voice.example.com:3478?transport=udp,turn:voice.example.com:3478?transport=tcp,turns:voice.example.com:5349?transport=tcp
STUDIO_VOICE_TURN_SHARED_SECRET=<coturn static-auth-secret와 동일한 32자 이상 비밀>
STUDIO_VOICE_TURN_REQUIRED=true
STUDIO_VOICE_TURN_TTL_SECONDS=900
```

Nest는 자격증명 제어면이지 미디어 데이터 플레인이 아니다. 운영에는 별도 coturn 또는 관리형
TURN의 공인 IP, DNS, TLS 인증서, UDP/TCP/TLS listener, relay UDP 포트 범위, allocation·사용자·
대역폭 quota, credential이 제거된 로그, relay 선택률·실패율·대역폭 관측이 필요하다. 공유 secret
교체는 새 발급기와 TURN 서버를 같은 변경 창에서 갱신하고 기존 TTL 이상 겹쳐 운영하는 절차로
수행한다. 저장소의 비활성 기본 배포 예시와 방화벽·인증서·쿼터·무중단 secret 교체·외부 smoke
절차는 [`deploy/coturn/README.md`](../deploy/coturn/README.md)에 분리했다.

## 수명주기와 실패 안전성

- 나가기, 마이크 트랙 종료, 작품 전환, 참가자/권한 변경, ACL 회수, transport 종료, Provider
  해제 시 로컬 트랙·원격 스트림·오디오 sink·RTCPeerConnection을 정리한다.
- 음소거 시 로컬 트랙 상태와 시그널 상태를 함께 갱신한다. 상태 전파가 실패하면 둘 다 직전
  상태로 롤백해 UI와 실제 송출 상태가 어긋나지 않게 한다.
- 패널에는 마이크 거절, 장치 없음, 다른 앱이 사용 중, 자동 재생 차단, 인원 제한과 연결 실패를
  사용자 행동으로 복구 가능한 한국어 메시지로 표시한다.
- 클러스터 환경에서는 기존 Socket.IO 어댑터를 통해 시그널을 릴레이하고, 연결 종료·작품 전환·
  권한 회수 때 노드의 임시 membership을 제거한다. 클라이언트는 presence보다 먼저 도착한 음성
  상태를 제한된 큐에 보관해 identity가 확인된 뒤 한 번만 재생하며, leave tombstone으로 늦게
  도착한 snapshot이 이미 나간 참여자를 되살리는 일을 막는다.

## 의도된 한계

- 녹음, 녹취, 자막, 음성 파일 업로드, 회의 기록은 제공하지 않는다. 이 범위를 추가하려면 별도
  동의·보존 기간·삭제·접근 감사 정책이 먼저 필요하다.
- 저장소만으로 실제 TURN 서버가 생성되지는 않는다. 위 운영 데이터 플레인이 배포되지 않았거나
  DNS·인증서·relay 포트가 잘못된 경우 단위 테스트가 통과해도 제한된 NAT/방화벽 환경의 연결을
  보장할 수 없다. production 배포 승인은 실제 서로 다른 네트워크에서 forced-relay 검증을
  통과한 뒤에만 내린다.
- P2P mesh는 소규모 허들용이다. 6명을 넘는 음성실은 TURN 추가만으로 해결하지 않고 SFU,
  대역폭 admission, 화자 선택, 운영 관측성과 abuse 대응을 포함한 별도 서버 아키텍처가 필요하다.

## 검증 경계

- 프로토콜/룸/소켓/gateway 테스트는 역할·작품·허들·대상 격리, 단일·다중 노드 6명 제한 경쟁,
  identity/voice 도착 순서, 늦은 ACK와 stale snapshot, 재접속 자격 증명 정리, 최종 중계 재검증,
  중복 신호 억제와 잘못된 신호 거절을 다룬다.
- 컨트롤러 테스트는 명시적 권한 요청, 오디오 제약, 단일 offerer, ICE 순서, 음소거 롤백,
  눌러 말하기, 자동 재생 복구, 비디오 트랙 거절과 모든 종료 경로의 자원 해제를 다룬다.
- Provider/UI 테스트는 패널과 통화 수명주기의 분리, 작품/권한 전환 정리, 44px 조작 대상,
  접근 가능한 상태/오류 안내와 내부 세션 ID 비노출을 다룬다.
- 정책 테스트는 환경 fail-closed, UDP+TCP/TLS 경로, URL/credential strictness, coturn HMAC,
  ACL과 발급 제한, timeout/abort, 시계 오차, 만료 전 갱신, 기존 peer 구성 교체와 단일 offerer
  ICE restart를 다룬다.
- 운영 smoke/E2E는 두 격리 브라우저에서 `iceTransportPolicy: relay`를 강제하고 `getStats()`의
  selected candidate pair가 `relay`인지, 원격 audio RTP byte가 증가하는지 확인해야 한다. UDP
  차단 시 TCP/TLS fallback, credential 만료·교체, TURN 재시작, Wi-Fi↔모바일 네트워크 전환도
  별도로 검증한다. 이 검증은 실제 TURN endpoint 없이는 저장소 로컬 CI에서 수행할 수 없다.
