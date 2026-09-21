# Studio P2P 채팅·화상통화

검토일: 2026-09-13. 대상: 무료 운영을 지향하는 소규모 공동 드로잉 작업실.

## 선택한 방향

Magma의 캔버스 안 채팅·통화·화면 공유 동선을 참고하되, Magma 내부 네트워크가 순수 P2P라고 가정하지 않는다. FigJam의 가벼운 음성 참여·리액션, tldraw의 커서 채팅·참여자 따라가기를 비교했다. ToonStudio에 이미 존재하는 커서 채팅·따라가기·주의 요청은 중복 구현하지 않고 보존한다.

Excalidraw의 암호화 협업은 서버가 암호문을 전달하는 방식도 포함한다. 암호화된 서버 전달과 RTC 직접 전송을 같은 의미의 P2P로 표시하지 않는다. 이번 채널은 서버 대체 전송이 없는 별도 경로다.

## 사용자 동선

공동작업 원고의 우측 하단 **P2P 채팅·통화**를 열고 안내에 동의해 참여한다. 상대도 같은 원고에서 이 채널에 참여해야 한다. 참여만으로는 마이크·카메라를 요청하지 않는다. 각 장치를 명시적으로 켜고 끌 수 있으며, 화면 공유는 카메라 영상 트랙을 교체한다.

패널을 접어도 세션은 유지된다. 소리 끄기, 손들기, 네 가지 리액션, 이 세션에서 상대 차단, 나가기를 제공한다. 나가기·원고 변경·작업실 연결 종료·채팅 권한 해제 시 로컬 캡처를 종료한다. 장치 권한 팝업이 늦게 승인되어도 이미 종료된 세션에는 연결하지 않고 반환된 트랙을 즉시 정지한다.

기존 협업 세션 채팅은 보존되며 **P2P 채팅과 별개**다. 새 채널의 수신 확인은 상대 브라우저에 도착했다는 의미이지, 사용자가 읽었다는 의미가 아니다. 전송 실패·부분 전송은 성공으로 표시하지 않는다.

## 네트워크 경계

기존 실시간 작업실의 참가 승인·presence·STUN-only RTC mesh를 재사용한다. 서버는 기존 mesh의 연결 신호를 전달하지만, 새 채팅 본문과 통화용 SDP/ICE는 해당 RTCDataChannel의 `studio-direct-v1` 경로로만 이동한다. 음성·영상은 별도 RTCPeerConnection의 RTP로 전달한다.

`StudioLiveTransport.direct`가 없는 서버/로컬/BroadcastChannel 구현은 미지원으로 처리한다. `direct.send`는 primary transport의 send를 호출하지 않는다. 네트워크 장애, 버퍼 포화, 채널 닫힘에서도 서버 중계로 전환하지 않는다. 본 변경은 원고 CRDT·잠금·복구의 기존 권위 경로를 변경하지 않는다.

## 비용·지원 범위

새 유료 SDK, SFU, TURN 계정, 외부 API 키, DB 테이블 또는 마이그레이션은 추가하지 않는다. 기존 `STUDIO_LIVE_VOICE_ENABLED`를 켜거나 `/voice/ice`·`/screen-share/ice`의 자격 증명을 호출하지 않는다. 별도 통화 미디어 중계 요금은 도입하지 않지만, 사이트 호스팅과 기존 signaling 비용까지 0이라는 의미는 아니다.

구현은 STUN-only이며, 일부 NAT·방화벽·회사망에서는 연결할 수 없다. HTTPS 또는 localhost와 WebRTC 지원 브라우저가 필요하다. 인앱 브라우저·Safari·물리 장치·서로 다른 실제 통신사 망을 전부 검증했다는 주장을 하지 않는다. 화면 공유는 브라우저 지원 및 매번 사용자 선택에 따른다.

2–4인 작업팀을 권장하고 세션당 원격 참여자를 최대 3명으로 제한한다. 이는 각 클라이언트의 미디어 연결 상한이지 서버가 보장하는 전역 회의 정원은 아니다. 대규모 회의·웨비나 기능은 제공하지 않는다. 카메라는 기본 640×360/15fps를 요청하며 최대 1280×720/24fps, 화면 공유는 최대 15fps를 요청한다. 실제 해상도는 브라우저·장치 협상에 따른다.

## 개인정보·방어 경계

브라우저 메모리에만 최대 150개 메시지를 보유한다. 녹화·서버 대화 저장·자동 전사·분석 수집은 추가하지 않는다. 상대의 OS 녹화·캡처를 막지는 못한다. P2P 특성상 네트워크 주소가 상대에게 노출될 수 있으므로 참여 안내에서 신뢰할 수 있는 협업자와 사용하도록 알린다.

RTC 직접 채널은 작업 ID를 검사하고, 발신자 프로필은 데이터의 자체 주장 대신 기존 승인된 mesh 참여자에 결합한다. 열람자·알 수 없는 상대·끊어진 참가 승인은 차단한다. UTF-8 프레임 64KiB, 송신 버퍼 128KiB, 수신 3초당 180개/512KiB, 채팅 2,000자·10초당 20개, 중복 기억 512개, ICE 대기 64개로 제한한다. 세션 epoch와 대상 epoch로 이전 통화 신호가 재참여한 세션을 오염시키지 않게 한다.

동시 offer는 polite/impolite perfect negotiation과 순차 SDP 처리로 해결한다. 미디어 동의·장치 소유권은 로컬에 있으며 상대는 장치를 강제로 활성화할 수 없다. 상대 차단은 현재 로컬 세션에만 적용되는 기능이며 서비스 전체 제재가 아니다.

## 검증

단위/회귀 테스트는 `live/huddle`, 기존 P2P overlay·재연결·adaptive cursor, collaboration provider/panel, 비용 경계 테스트에 포함한다. UI 테스트는 명시적 캡처 동의, 접힌 패널의 통화 유지, 원고 이동 시 캡처 정지, 미지원·열람자 진입 차단을 검사한다.

`node scripts/verify-studio-p2p-huddle.mjs`는 별도 Vite fixture와 Chromium 두 컨텍스트를 열고 실제 RTCDataChannel·양방향 RTP 연결을 만든다. 가상 카메라·마이크만 사용하며 사용자의 물리 장치는 열지 않는다. 한글 채팅/수신 확인, 양쪽 영상의 실제 프레임 디코딩, primary 메시지 경로에 채팅 본문이 없는지, 종료 후 트랙 상태가 ended인지 검사한다. 로컬 브라우저 검증을 실제 광역망·물리 장치 검증으로 대체하지 않는다.

운영 번들은 별도로 `vite build`, 타입은 루트 `tsc -p tsconfig.json --noEmit`, 코드 규칙은 ESLint로 확인한다. 브라우저 테스트용 signaling 중계는 테스트 프로세스에서만 사용하며 운영 통신 경로에 추가되지 않는다.

## 벤치마킹·기술 근거

- Magma, Calls, Chats and Comments: https://help.magma.com/en/articles/8422203-how-to-chat-with-others-calls-chats-and-comments
- Figma/FigJam audio: https://help.figma.com/hc/en-us/articles/1500004414622-Use-audio-to-chat-with-your-team
- tldraw collaboration: https://tldraw.dev/sdk-features/collaboration
- tldraw cursor chat: https://tldraw.dev/sdk-features/cursor-chat
- Excalidraw pseudo-P2P collaboration: https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature
- WebRTC peer connections / signaling / STUN / TURN: https://webrtc.org/getting-started/peer-connections
- MDN perfect negotiation: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
- MDN screen capture: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture

## 배포 권한 헤더

Vercel 문서 응답과 Studio 개발 서버의 `Permissions-Policy`에서 카메라·마이크는 `(self)`만 허용한다. 기존 `microphone=()`는 사용자가 권한을 허용해도 음성 캡처 자체를 차단하므로 제거했다. 같은 출처 허용은 자동 캡처나 브라우저 권한 승인과 다르며, 기기 요청은 P2P 참여 후 명시적인 장치 버튼에서만 발생한다. API 응답의 장치 차단 정책과 외부 프레임의 권한은 완화하지 않는다. 브라우저 검증 fixture도 `vercel.json`의 실제 Permissions-Policy 값을 읽어 적용한다.

## 참여 가능 상태 판정 (2026-09-21)

허들 참여는 원고 저장 상태와 별도로 판정한다. 보안 컨텍스트와 `RTCPeerConnection`, 서버 모드의 승인된 `room.ready`·`room.direct`, 채팅 권한이 필요하다. 원고 저장소의 비종료성 경고(`durability-risk`)만으로 참여를 막거나 이미 동의한 통화를 종료하지 않는다. 원고 편집·저장 보호 조건은 변경하지 않는다.

작업실 객체는 동일한 채로 내부 연결 상태가 변할 수 있으므로 `useSyncExternalStore`로 직접 포트를 구독한다. 실제 연결이 끊기거나 권한이 해제되면 캡처를 종료하며, 재연결 후에도 사용자가 다시 참여·장치 사용에 동의해야 한다. 권한 회수·참가 거부·원고 복구 필요 상태는 계속 차단한다.

참여 불가 안내는 HTTPS 미사용, WebRTC 미지원, 로컬 탭 전용 연결, 연결 중, 서버 연결 오류, 직접 포트 미제공을 구분한다. WebRTC 지원 브라우저에서 서버 연결이나 P2P 설정이 빠진 경우 브라우저 미지원이라고 표시하지 않는다. 재확인 버튼은 기존 `retryServer`만 호출하며 브라우저 권한 요청, 자동 참여, 서버 중계, 환경변수 변경을 수행하지 않는다.

회귀 테스트는 저장 경고 중 참여 및 통화 유지, 동일 작업실의 연결 완료·해제·복구, 미지원 브라우저, HTTPS 요건, 로컬 전용 세션, P2P 포트 누락, 종료성 권한/복구 차단, 미디어 API 없는 채팅 참여를 포함한다.
