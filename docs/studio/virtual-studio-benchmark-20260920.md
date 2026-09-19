# Virtual Studio 공식 제품 벤치마크와 전체 완료 조건 — 2026-09-20

상태: **current 조사 / target 요구사항**. 공식 문서는 2026-09-20에 열람했다. ToonStudio 비교 기준은 `2981170a292fbe83a57b2a2913d6ddcfa3cbde74`의 source이며, 구현 작업 중인 파일의 후속 변경은 이 기준에 포함하지 않는다. 이 문서는 제품 사용 실험이나 접근성 인증, 실네트워크 성능 검증을 대신하지 않는다. 아래 우선순위는 구현 순서이며 낮은 순위의 원설계 요구를 삭제하거나 전체 완료 범위를 줄이지 않는다.

후속 구현과 실제 검증 범위는 [continuation acceptance](virtual-studio-completion-acceptance-20260920.md)에 따로 기록한다. 아래 기준 SHA 비교표는 과거 조사 기준을 보존하며, 후속 구현을 누락했다는 뜻이 아니다. 후속 기록에서도 B01–B20와 E01–E25 전체 완료를 선언하지 않는다.

## 1. 설계 출처와 비교 방법

비교 대상은 Gather 2.0, WorkAdventure, Kumospace의 공식 도움말·개발 문서다. Gather Classic 1.0 자료는 별도로 표시한다. 특히 기존 설계가 인용한 Classic의 bubble을 최신 Gather의 private conversation과 같은 기능으로 취급하지 않는다. 공식 설명에서 확인하지 못한 접근성·성능 항목은 **미확인**이며 경쟁 제품에 해당 기능이 없다는 판정이 아니다.

내부 요구의 정본은 [Living World 상세 설계](virtual-studio-living-world-design-20260920.md)의 §§1–14, [최초 P2P 창작 스튜디오 목적](../studio-p2p-virtual-studio-2026-09-18.md), [월드 작성 계약](virtual-studio-world-authoring.md)와 실제 source/tests다. [기존 구현·검증 기록](virtual-studio-living-world-acceptance-20260920.md)은 구현된 부분과 미완료 여섯 항목을 명시한다. 이 벤치마크는 그 설계 전체를 유지하며, 경쟁 제품 기능만으로 완료 범위를 다시 정하지 않는다.

사용자가 제공한 [원 공유 대화](https://chatgpt.com/share/6aaee800-d520-83ee-ac26-d2a1f812cece)는 이번 web fetch가 timeout으로 실패했지만, 같은 작업의 최초 브라우저 tool 결과를 root가 복구했다. `/tmp/virtual-studio-chat-readable-50.txt`의 읽을 수 있는 본문을 확인했으며, 725행 이후의 확장 전략 §§1–12를 아래 §7에서 추적한다. 이 파일은 로컬 회수 근거이지 저장소 정본이나 외부 사용자에게 제공할 첨부 사본이 아니다. **“상세 확장 전략·30개 기능 백로그 검토서” 버튼은 있지만 첨부본문은 미수신**이다. 아래 목록을 그 첨부의 정확한 30개 항목이라고 주장하지 않는다. 2026-09-02의 다른 공유 대화 URL은 이번 대화의 대체 출처로 사용하지 않았다.

증거 수준은 다음과 같이 구분한다.

- **source 확인**: 기준 SHA의 실행 코드에 해당 경로가 있다. UI/네트워크 종단 성공을 뜻하지 않는다.
- **기존 검증 기록**: 위 acceptance 문서 또는 기존 로컬 report에 성공 기록이 있다. 이번 조사에서 테스트를 재실행하지 않았다.
- **target**: 설계/벤치마크에서 필요한 수락 조건이다. 코드·테스트·실제 제품 경로 증거가 갖춰지기 전 완료로 표시하지 않는다.

## 2. 공식 제품에서 확인한 동작

### Gather — 최신 2.0과 Classic을 분리

Gather 2.0은 사람·영역 검색, 키보드/더블클릭 이동, 개인 자리 복귀, 상세/단순/자동 보기, 상태와 주변 대화 듣기 설정을 제공한다. 처음에는 mic/camera가 꺼져 있고, 사람 선택 뒤 인사·회의 요청·접근을 고를 수 있다. 회의 요청 수락 후 함께 회의실로 이동하며, 잠긴 대화에는 내부 참가자의 허가가 필요하다. 참가자를 찾고, 행동을 선택하고, 동의를 받고, 목적지에 도착하는 흐름이 연결되어 있다는 점이 중요하다. [Gather 2.0 Getting Started Guide](https://support.help.gather.town/articles/1982412443-getting-started-guide)

Gather Studio는 영역 안의 객체를 함께 이동하고, 방·책상·팀 영역을 배치한다. 한 번에 관리자 한 명만 편집하며 편집 중 다른 장식 변경도 잠근다. 출입구 막힘을 확인하도록 안내하고 편집 후 Publish를 명시한다. 별도 Decorator에는 객체 회전·색/종류 변경과 undo/redo가 있다. 현재 이 문서들은 사용자 객체 업로드를 지원하지 않는다고 명시하므로 Classic의 custom asset 기능을 2.0에도 있다고 합쳐 설명하면 안 된다. [Studio Overview](https://support.help.gather.town/articles/1963307749-studio-overview), [Decorating Your Office](https://support.help.gather.town/articles/4223087616-decorate-office)

Classic의 private area는 내부 참가자와 외부 참가자의 듣기 범위를 나누지만, **Classic bubble은 외부에서도 작은 소리로 들릴 수 있고 화면 공유는 일반 대화 범위로 전송된다**. 따라서 ToonStudio의 비멤버 트랙 미전송 요구에 bubble 구현을 그대로 대입하지 않는다. [Classic Private Areas](https://support.gather.town/articles/2550999600-overview-of-meeting-rooms-private-areas), [Classic Talk in a Bubble](https://support.gather.town/articles/3330510961-talk-in-a-bubble)

Classic 접근성 설정에는 reduced motion, tooltip 크기와 줌에 무관한 일정 크기, frame-rate 제한이 있다. 공간 설계 안내는 도움을 얻는 여러 경로, 통역·집중 공간과 custom spawn을 다룬다. 이는 ToonStudio에 적용할 구체적 UX 참고이며 Gather 전체의 screen-reader 적합성 인증 근거는 아니다. [Classic User Settings](https://support.gather.town/articles/8746349223-user-settings), [Inclusive Space Design](https://support.gather.town/articles/1489858946-accessibility-best-practices-for-inclusive-space-design)

**적용 기회:** 사람/방/도구 통합 찾기, 이동 실패 안내, 현재 대화 대상의 명시, 장식 편집과 공간 구조 편집의 구분, 변경 미리보기·복구가 창작 스튜디오에 직접 도움이 된다. Classic/Virtual 모드의 문서 권위는 유지한다.

### WorkAdventure — 객체·영역의 의미를 작성 데이터로 표현

WorkAdventure는 admin/editor가 사용하는 인라인 객체·영역 편집과, 바닥·벽·심화 지형을 만드는 Tiled를 구분한다. 객체를 클릭하면 가능한 동작 목록을 표시하며 객체 깊이·충돌·이름·태그를 작성한다. Tiled 배경에 들어간 객체는 인라인에서 이동할 수 없고 다시 독립 객체로 만들어야 한다고 설명한다. ToonStudio의 flattened 배경 속 책상과 별도 prop을 구분해야 하는 이유와 일치한다. [Map Building](https://docs.workadventu.re/map-building/), [Objects and Furniture](https://docs.workadventu.re/map-building/inline-editor/entity-editor/)

meeting area에는 입장 시 camera/microphone off 기본값이 있고, 같은 이름의 영역은 한 회의 공간으로 묶일 수 있다. lockable area는 내부 사용자의 잠금·외부 진입 차단·마지막 사용자 이탈 시 해제를 제공한다. silent area는 대화 중지를 이름 옆 표시와 함께 보여 준다. **시각적 벽, 음향 경계, 출입 권한, 장치 상태는 각각의 규칙**이라는 점을 배운다. 이 UI 문서만으로 실제 암호화 또는 패킷 미전송을 인증하지 않는다. [Meeting Room](https://docs.workadventu.re/map-building/inline-editor/area-editor/meetingRoom/), [Lockable Area](https://docs.workadventu.re/map-building/inline-editor/area-editor/lockable-area/), [Silent Area](https://docs.workadventu.re/map-building/inline-editor/area-editor/silent/)

Map Scripting API는 첫 방문 안내와 NPC 대화를 예시로 들며, 기본적으로 각 사용자의 브라우저에서 실행되고 공유 상태에는 별도 variables/events가 필요하다고 명시한다. ToonStudio의 local ambient NPC와 shared authority를 구분하는 근거로 유용하다. 다만 외부 script/iframe의 실행 모델을 JSON import에 도입하지 않고 승인된 ActionRegistry를 사용한다. [Map Scripting API](https://docs.workadventu.re/developer/map-scripting/)

**적용 기회:** 방·책상·보드에 명확한 기능과 접근점을 부여하고, 비개발자는 인라인 편집, 고급 작성자는 Tiled export/compile을 이용하게 한다. 이번에 확인한 공식 페이지들에서는 제품 전체의 screen-reader 지원이나 구체적인 frame-time 보장을 확인하지 못했다.

### Kumospace — 사람 찾기·문·공간 편집의 발견성

Kumospace는 WASD/방향키·클릭·맵·사람 찾기·follow로 이동하며 follow 요청은 수락/거절할 수 있고 수동 이동으로 끝난다. 닫힌 문에는 knock 행동이 있다. 주의할 차이는 **기본 floor에서는 camera/screen-share가 소리 범위 밖에도 보이고, 문을 닫으면 외부 시청이 제한된다**는 점이다. ToonStudio는 화면상의 거리 원만으로 media privacy를 설명하지 않고 승인된 수신자 목록을 보여 줘야 한다. [Navigation](https://www.kumospace.com/help/navigation)

room audio는 같은 방의 사람들에게 거리와 관계없이 들리고 방 밖과 분리된다. 공간 전체 broadcast는 room audio를 넘어설 수 있다. 따라서 공간 범위 안내에는 예외까지 설명해야 한다. Profile Card에서 Chat/Find/Nudge/Follow를 찾을 수 있어 아바타를 직접 클릭하기 어려울 때도 사람 기반 탐색이 가능하다. [Spatial and Room Audio](https://www.kumospace.com/help/spatial-and-room-audio), [Profile Cards](https://www.kumospace.com/help/profile-card)

편집에서는 방 크기·벽·바닥·문과 가구를 바꾸고, 방과 가구를 그룹으로 옮길 수 있다. 가구 검색·회전·높이·grid snap을 제공하며 역할에 따라 편집을 제한한다. 각 방이 Chat 목록의 장소로도 나타나 공간과 목록 탐색이 연결된다. [Furniture and Rooms](https://www.kumospace.com/help/customizing-your-rooms)

Settings는 Battery Saver/Performance/High Quality와 video 표시, audio radius, 클릭 이동 방식, 알림 항목을 따로 둔다. 공식 권장 환경은 desktop/laptop와 Chrome 중심이며 네트워크·hardware acceleration 문제를 별도로 설명한다. 이 자료는 장치별 예산과 사용자 선택의 필요성을 보여 주며, ToonStudio 기능/해상도를 비용 때문에 낮추라는 근거가 아니다. [User Settings](https://www.kumospace.com/help/user-settings), [Optimize Your Experience](https://www.kumospace.com/help/checklist-optimal-experience)

입장 안내는 이름·장치 미리보기·lobby·floor 선택을 다룬다. ToonStudio에서는 이 발견성을 가져오되 입장에 camera/microphone/recording 권한을 요구하지 않고 실제 사용 버튼에서 요청한다. [Joining a Space and Floor](https://www.kumospace.com/help/join-floor)

**적용 기회:** 사람 카드, 방 목록과 맵의 일치, 목적지 찾기, 재시도할 수 있는 장치 상태, 편집 가능한 가구 검색. 공식 navigation에 키보드 경로는 있으나 이것만으로 완전한 키보드·screen-reader 접근성 인증을 주장하지 않는다.

## 3. ToonStudio 현재 코드와의 차이

아래 근거는 source 존재 확인이다. 이전 브라우저 report는 로컬 Chromium 및 같은 브라우저의 RTCDataChannel fixture이며 `mediaStarted: false`, gamepad는 simulated 상태다. 다른 기기/WAN 미디어 성공이나 24명 성능으로 승격하지 않는다.

| 영역 | 기준 SHA에서 확인한 현재 기능 | 남은 차이와 원설계 연결 |
| --- | --- | --- |
| 실제 제작 도구 | Page의 `activateInteraction` 및 방/기능 카드가 기존 writer/comic/canvas/review/assets/assistant 경로에 연결된다. | 프로젝트·문서·선택 컷·권한을 보존하는 전체 여정 회귀. 사용자를 별도 게임 문서로 복제하지 않음. 설계 §1. |
| 이동·NPC | 공통 motion/pathfinding, 네 종류 NPC director, 분위기 모드, 접근 가능한 NPC 버튼이 있다. | 실제 장치 조작감, activity anchor 착석/퇴장, 혼잡 시 밀도/이웃 budget, 마스코트, NPC 투어와 자세 clip. 설계 §§3–5. |
| 아트 | clean plate 한 장과 4방향 cutout-rig 8프레임 atlas. manifest가 실제 기법을 명시한다. | 그린 contact/down/passing/up 보행, 행동 clip, 같은 인물 model sheet, 가구 전후 레이어. integrity 검사는 작화 품질의 대체가 아님. §4. |
| 사람 선택·동의 | SocialPanel에 실제 peer 목록과 talk/follow/review/celebrate 수락·거절·취소가 있다. | 상세 상태/연결/현재 공유 작업 카드, targeted 인사, 차단, snooze, 동작 capability. Page의 `onWave`는 `sendReaction("wave")`이며 대상 지정 greeting 프로토콜이 아님. §6. |
| 대화 그룹 | social talk 수락 시 `peerIds: [request.peer.sessionId]`로 exact scope Huddle을 연다. Huddle remote cap은 3. | cap 3이라는 상수만으로 3·4번째 사용자 초대/대칭 membership/capacity 경합이 구현된 것은 아님. 공간 경계·hysteresis·의미 있는 그룹 UI 필요. §7. |
| 검토 초대 | 같은 프로젝트 검토함 진입과 리뷰 데스크로 이동이 있다. | 현재 UI는 검수본/버전을 검토함에서 별도 선택하도록 안내한다. 특정 document/cut/revision/digest 동의·권한 재검증·결정 반영은 아직 없음. §§1,6; ADR-0022. |
| 공유 좌석·문 | 일반 prop/collider/portal 데이터가 있다. | `InteractionSlot`, seat grant, fencing/lease, private door, acoustic zone 계약이 없다. 로컬 앉기 또는 이동은 배타 점유의 증거가 아님. §§6–9. |
| 월드 편집 | JSON/Tiled import/export, room/prop/collider/spawn/NPC 필드, depth policy, validation, local preview 격리가 있다. | 기본 그림 속 가구는 독립 객체가 아님. 그룹 transform/anchor/nav/acoustic 일괄 변경, template compile, permission-scoped publish와 원자적 revision 전환 필요. §9. |
| 아바타 식별 | 로컬 skinKey lookup은 있지만 presence avatarIndex와 등록 배열 순서를 사용한다. | stable skinKey/registryRevision capability handshake와 미지원 동작 fallback을 검증해야 함. §4. |
| 첫 사용·접근성 | NPC/peer native button, 입력창 게임 키 차단, 모바일 joystick, reduced motion 대응과 기본 방 카드가 있다. | 재생 가능한 온보딩, 방/사람/도구 검색, 일정 글자 크기, 모든 공간 행동의 비공간 경로, screen-reader 수동 검수. §§1,10,13. |
| 성능·로딩 | fixed physics, throttle, bounded NPC mover, asset error/retry 등의 경로가 있다. | 기준 커밋의 Phaser `preload`는 모든 등록 skin의 정지 방향·행동 이미지와 최초 self/peer/NPC skin의 4방향 walk atlas를 적재한다. 기본 NPC 네 명 때문에 기본 월드에서는 모든 skin이 이 초기 walk 대상에 든다. 나머지 skin의 walk 방향은 이미 지연 요청한다. 필요한 현재 방향·행동 우선 적재·참조 수명, p95/20분/실기기/실미디어 계측이 더 필요하다. §§8,11. |

확인한 주요 소스:

- [Page와 도구·social 연결](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.tsx), [SocialPanel](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceSocialPanel.tsx), [social 프로토콜](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-social.ts), [social hook](../../apps/web/src/domains/creator/virtual-space/use-studio-virtual-space-social.ts)
- [world manifest](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest.ts), [작성 모델](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-authoring.ts), [작성 UI](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceWorldAuthoringPanel.tsx)
- [Phaser canvas](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx), [NPC director](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-director.ts), [skin registry](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-character-skins.ts), [presence](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-presence.ts)
- [Huddle controller](../../apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts), [Huddle cap와 wire](../../apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts), [runtime 검증기](../../scripts/validate-virtual-studio-runtime.mjs), [기존 acceptance 기록](virtual-studio-living-world-acceptance-20260920.md)

## 4. 전체 완료 원장에 추가할 요구·수락 증거

`P1`은 기반/핵심 제작 경로, `P2`는 같은 전체 완료 범위의 경험·확장 검증이다. 아래 항목은 전부 **target 또는 부분 구현**이다. 완료 판정에는 기능별 정확한 SHA, 실행 명령, 테스트 결과, 제품 경로 screenshot/video 또는 RTC 관측, 미검증 환경을 붙인다. 테스트 이름을 만들었다는 것과 실제 실행 성공은 다르다.

| ID · 순서 | 구체적인 완료 요구 | 지금 있는 증거 | 추가로 필요한 수락 증거 |
| --- | --- | --- | --- |
| VS-B01 · P1 | Classic/Virtual에서 같은 프로젝트·문서·권한과 unsaved 작업을 보존한다. 방별 제작 동작은 실제 도구를 연다. | Page action routing. | 두 모드 왕복 후 문서/선택/dirty state 동일; read-only 사용자 수정 거부; 8개 역할 공간별 정상·실패 경로. |
| VS-B02 · P1 | 원화와 일치하는 모델·4방향 실제 보행·발 pivot·기본 행동 clip을 제공한다. 없는 동작은 capability로 숨기거나 명시한다. | cutout-rig 등록, 이미지 무결성. | 4방향 contact/down/passing/up의 독립 pose contact sheet; 게임 크기에서 원화와 나란히 비교; 방향 전환·벽 정지·draw/review/turn/greet/sit/stand/pick/place/cheer/high-five 영상. 표시 fps를 원화 수로 세지 않음. |
| VS-B03 · P1 | 가구 앞뒤 가림과 독립 객체 이동을 지원한다. | prop depth API, flattened background. | 입구→분수→리뷰 데스크 경로의 앞/뒤 occlusion 영상; 책상 이동 시 image/collider/anchor/nav/acoustic이 같은 revision에 이동; 이전 자리 잔상/유령 충돌 없음. |
| VS-B04 · P1 | 키보드·touch·gamepad·click·follow를 일관된 intent와 취소 규칙으로 처리한다. | 관련 모델/입력 테스트와 로컬 브라우저 기록. | 30/60/120Hz 거리/제동 오차 측정, 대각선 2% 이내 목표, blur/IME/modal 취소; 실제 gamepad·iOS/Android에서 경로/정지; 막힌 목적지는 설명 후 안전 정지. |
| VS-B05 · P1 | NPC가 목적지 anchor에서 작업/휴식하고 사람에게 양보한다. guide는 사용자가 요청한 투어만 한다. | 4역할 local director, NPC 목록, focus mode. | 20분 혼잡 동선에서 stuck/좌석 중복/문 막기 0; anchor approach/align/exit; 사용자가 guide tour 취소 가능; 역할별 작업·마스코트 clip과 사람 증가 시 ambient budget. |
| VS-B06 · P1 | 선택한 사람에게만 보내는 인사·차단·나중에·상태 안내가 있다. | 수락 기반 4 social action. | A→B 인사는 C에게 targeted 알림으로 배달되지 않음; 실패를 배달 완료로 표시하지 않음; 차단 후 social/media 종료; focus/away/차단에서 반복 알림 없음; 선택 카드와 키보드 경로 동등. |
| VS-B07 · P1 | 2–4인 대화의 ID/members/capacity/revision이 모두 일치한다. | 2인 exact scoped Huddle와 remote cap3. | A/B 대화에 C/D가 수락 후 참가; 두 동시 마지막 자리 요청 하나만 승인; 지연/중복/탈퇴/재접속 시 동일 membership; fifth 참가 거부를 설명; UI 수신자와 실제 sender 연결 일치. |
| VS-B08 · P1 | room/acoustic/closed-door 정책과 consent를 분리한다. 거리 진입·이탈은 안정화되고 private track은 비멤버에 송신하지 않는다. | 초대 수락, 거리120/156, scope 검사. | 다른 방 또는 닫힌 경계의 대상 거부; 경계 왕복 churn 계수; outsider RTC sender/track 0; 장치 권한 기존 승인 상태에서도 현재 사용자 클릭 전 capture0; 탈퇴/권한 회수 중 pending capture 정리. |
| VS-B09 · P1 | 좌석/공유 문/공유 NPC에는 기존 authority의 ephemeral grant와 fencing을 적용한다. | 설계만 있음. | 동시에 한 seat를 요구한 두 브라우저 중 grant1; 늦은/만료/다른 epoch grant 거부; disconnect/partition/reconnect에서 새 grant fail-closed; 문서 편집권은 별도; ambient-local 계속 동작. |
| VS-B10 · P1 | 공동 검토를 project/document/cut/revision/digest에 고정하고 원래 권한을 확인한다. | 프로젝트 검토함 링크. | 서로 다른 head를 가진 두 사용자에게 동일 snapshot 표시; 수락 전 문서 열기/수정 없음; revoked/unsaved/stale revision 처리; 실제 댓글/결정은 Review authority 경로로 반영. |
| VS-B11 · P1 | 가구/방 작성에 grouped transform·undo/redo·안전 preview와 승인된 action만 제공한다. | JSON/Tiled/form authoring, 안전 import. | move/rotate/resize 후 모두 정합; undo/redo로 hash/geometry 복구; 막힌 문·고립 spawn·위험 URL·script import 거부; keyboard form와 canvas 편집 결과 동일; 기본 아트에 실제 반영. |
| VS-B12 · P1 | template compile와 권한 있는 publish·revision 사전 로드/전환/rollback을 제공한다. | hash handshake, local preview 격리. | Tiled template 상속 export 재현성; 미리보기 presence 유출0; non-owner publish 거부; 두 client가 같은 immutable hash로 전환; active social/seat 종료 또는 명시적 이관; asset 실패 시 원본 월드 유지. |
| VS-B13 · P1 | stable skinKey/registryRevision·clip capability로 확장을 협상한다. | 로컬 key registry와 avatarIndex. | 배열 순서가 다른 두 client도 같은 캐릭터; 미지원 skin/clip는 검증된 fallback; old client read-only/fallback 설명; 늦게 로드된 skin이 떠난 entity/새 scene에 적용되지 않음. |
| VS-B14 · P2 | 첫 사용자는 입장→이동→도구→사람/동의→집중/나가기를 배우고 언제든 다시 안내를 열 수 있다. | 기본 힌트·NPC/방 버튼. | onboarding skip/replay/storage 실패 처리; 키보드와 touch 각각 첫 제작 도구 도달; 이동 안내가 자동 미디어/AI를 시작하지 않음; guide tour는 허락 후 시작. |
| VS-B15 · P2 | 방/사람/도구 찾기와 목록 기반 동작을 제공한다. | 방 카드·peer/NPC 목록. | 한국어/영어 검색, 빈 결과/접근 불가/멀리 있는 목적지 설명, safe path와 cancel; 목록의 이름/온라인 상태가 실제 manifest/peer와 일치; teleport로 막힘을 숨기지 않음. |
| VS-B16 · P1 | 모든 핵심 행동은 키보드·screen-reader·touch로 가능하고 motion/글자 설정을 존중한다. | native 버튼, reduced motion과 focus. | Tab 순서/명확한 focus/escape 복귀, zoom200%와 좁은 viewport, 읽기 순서/상태 알림, map 미사용으로 초대·도구·그룹 탈퇴; NPC 대사 live-region 폭주 없음; 줌과 무관한 읽을 수 있는 label. |
| VS-B17 · P2 | Focus/Balanced/Lively와 소리 설정으로 집중을 유지하면서 생활감을 제공한다. | NPC 분위기 선택. | 사용자 입력/문서/social이 ambient보다 우선; 화면 밖 FX 중단; 환경음 opt-in, 통화 ducking, BGM media 미전송; 장식 effect·마스코트가 reduced motion에서 억제되며 핵심 존재 정보는 유지. |
| VS-B18 · P1 | 필요한 skin/room 우선 적재, texture 공유/회수와 generation guard를 갖춘다. | scene preload와 오류 복구. | 최초 ready 이전 불필요한 skin download 차단; 동일 texture 중복0; 20분 출입/skin 교체 뒤 참조/heap/texture bytes 회복; offline cached 작업 지속; retry가 새 scene을 오염시키지 않음. |
| VS-B19 · P1 | 실제 8/16/24 presence·4인 media와 20분 성능을 측정한다. | 로컬 fixture/상한 상수. | desktop16+NPC8+media4, mobile8+NPC4, stress24의 fps분포/input p95/long task/queue/packet/heap/GPU; no-media와 media를 분리; 실제 Safari/Chrome·다른 NAT·loss/jitter; 실패 연결을 성공으로 표시하지 않음. 설계의 숫자는 합격 전 목표. |
| VS-B20 · P1 | 기존 CI·보안·문서 권위를 유지하고 실제 통합 여정으로 마감한다. | unit/integration/로컬 harness 및 기존 기록. | 두 실제 사용자 입장→인사→수락→리뷰 데스크→seat→동일 검수본→이탈/집중→track 정리; NPC 공존; 정확한 SHA의 필수 gate와 CI 상태, screenshot/video, 잔여 미완료 공개. merge를 배포로 보고하지 않음. |

외부 벤치마크가 직접 뒷받침하는 방향은 사람이 찾기 쉬운 상호작용(Gather/Kumospace), 의미 있는 공간·객체(WorkAdventure), private 범위·상태 안내(세 서비스), 안전한 작성·미리보기(Gather/WorkAdventure/Kumospace)다. **실보행 원화·creator review authority·P2P mesh 부하 목표는 ToonStudio 원설계에서 온 요구**이며 외부 제품이 검증해 준 것으로 표시하지 않는다.

## 5. 독립적으로 구현 가능한 작업 묶음

| 작업 묶음 | 제안 소유 범위 | 의존성/주의점 | 완료 원장 ID |
| --- | --- | --- | --- |
| 발견성·접근성 | 작은 onboarding/search/controls component와 순수 검색 모델 | Page adapter에서 조립; NPC director/권한 변경 없이 시작 가능; canvas 이외 동일 동작 | B14–B16 |
| 피부·clip 계약 및 로더 | character registry, asset loader, integrity validator | 원화와 runtime 계약을 먼저 고정; capability 없는 pose를 UI에 노출하지 않음 | B02, B13, B18 |
| 공간 의미/prop 편집 | manifest/compiler, grouped transform/history/validation | 시각 asset 작업과 병렬; 실제 asset 없는 collider만 이동하면 B03/B11 미완료 | B03, B11–B12 |
| social 대상·그룹·privacy | social protocol/controller, conversation policy, Huddle adapter | 기존 pair compatibility 보존; room semantics 계약 공유; device 활성화는 각 사용자 소유 | B06–B08 |
| shared seat authority | 기존 room coordinator adapter와 순수 grant 모델 | 별도 유료 서비스/DB/game server 도입 없음; 권위 미확인 상태에서 배타 성공 선언 금지 | B09 |
| creator review adapter | 문서 reference/permission/snapshot model, 기존 review 진입 | ADR-0022의 revision·review authority 재사용; Phaser는 표시만 | B01, B10 |
| NPC anchor·생활 연출 | director, activity anchors, greeting/yield policies | B02/B03/B09 capability에 맞춰 align/perform/exit; local/shared 구분 유지 | B05, B17 |
| 측정·통합 수락 | runtime harness, reproducible perf report, 실기기 검수표 | synthetic/loopback/WAN 범위 구분; 더미 사람으로 online 보장하지 않음 | B04, B19–B20 |

root는 위 묶음을 기존 전체 요구사항 원장과 합쳐 진행한다. 작은 기능이 검증됐다는 이유로 원화·seat·revision·privacy·성능을 별도 미래 단계로 빼고 전체 완료라고 선언하지 않는다. 구현이 불가능한 외부 조건은 필요한 실제 장치/네트워크/권한과 실패 증거를 특정해 남기고, 다른 독립 작업은 계속 진행한다.

## 6. 제품에 적용할 판단

ToonStudio의 차별점은 풍부한 사무실 장식보다 **같은 작품의 실제 제작·공동 검토까지 이어지는 공간**이다. 예쁜 방 안에 일반 외부 링크만 두는 것으로 완료하지 않는다. 경쟁 제품의 발견성·객체 편집·공간 규칙을 참고하면서 기존 Studio의 문서/저장/권한/Review authority를 보존한다.

기존 이미지의 화풍과 고품질 보행·상호작용은 제품 수락 조건이다. 숨겨진 비용을 줄이기 위해 기능·해상도·모델을 내려서는 안 된다. 사용자가 선택하는 focus/저전력 모드, 화면 밖 장식 생략, 같은 texture 공유, 증분 로딩은 핵심 결과와 품질을 보존하는 범위에서 적용한다. AI는 통합 BYOK 설정을 사용한 명시적 실행으로 유지하며 NPC가 사적 대화나 음성을 자동 수집하지 않는다.

최종 보고는 구현한 기능, 실제 검증한 환경, 정확한 main SHA, CI의 성공/실패/취소/미실행, 원화·실장치 등 잔여 항목, 운영 배포 여부를 분리한다. 이 조사에서는 유료 서비스 가입, 외부 메시지 전송, 제품 코드 수정, 테스트 재실행, 배포를 하지 않았다.

## 7. 복구한 원 공유 대화의 확장 전략 추적

다음 목록은 회수한 **화면에 표시된 본문**의 의미 단위다. 대화 내 과거 PR·완료·시험 성과 발언은 현재 구현 증거로 재사용하지 않는다. 버튼으로 참조된 사이트 전체 설계 두 파일과 30개 백로그 첨부는 이 조사에서 첨부본문을 수신하지 못했으므로 그 내용까지 읽었다고 표시하지 않는다.

분류 `통합`은 기존 도구·권한·저장 경로에 연결해야 한다는 뜻이지 이미 구현됐다는 뜻이 아니다. `신규`는 Virtual Studio에 새 모델/워크플로/UX가 필요함을 뜻한다. `조건부`·`장기 실험`은 **원 대화가 명시한 분류**를 보존하며 임의로 제외한 기능이 아니다. 조건을 충족하지 않은 기능은 원장에 남기고 미완료/조건 미충족을 설명한다.

| 추적 ID · 원문 위치 | 유지할 요구 | 분류 | 기존 조건과 연결 / 완료 증거 |
| --- | --- | --- | --- |
| VS-E01 · §1 | 가상공간·제작 목록·집중 작업의 3개 표현은 같은 데이터를 사용한다. 이동이 업무 실행의 필수 조건이 되지 않는다. | 통합 | B01/B15/B16. 같은 검수본을 세 경로에서 열어 ID/revision/권한 동일, 공간 미사용 팀원도 동일 작업 가능. |
| VS-E02 · §2 | 회차 공동 세션에 사람·작업 대상·버전·목적·결과를 묶고 `ScopeRef`로 회차/컷을 연결한다. | 신규 + 통합 | B10. 세션 생성·참가·이탈 후 동일 review snapshot과 결과 유지. 단순 통화 ID 또는 일반 프로젝트 링크만으로 완료 아님. |
| VS-E03 · §2 | 진행자 함께 보기와 개인 탐색을 분리하고 따라보기를 즉시 해제한다. | 신규 + 통합 | 문서 follow는 avatar follow와 다른 권한. 상대의 스크롤이 개인 편집 위치·선택을 강제 변경하지 않는 두 client 시험. |
| VS-E04 · §§2–3 | 컷·버전·담당자·완료 조건이 있는 수정 요청→작업→새 검수본→재검토→권한 있는 승인으로 연결한다. | 통합 + 신규 연결 | B10/B20. 회의 reaction은 승인 아님; 한 컷의 수정부터 재검토/승인까지 실제 저장된 reference를 추적. |
| VS-E05 · §3 | Writers Room의 대본 리딩·장면 카드·대사 후보 비교·결정 기록, Storyboard Wall의 전체 컷 배치·공동 스크롤·분기안 비교. | 통합 | 기존 Writer/Comic authority를 조사해 재사용. 선택 대본 버전·콘티·컷별 수정 요청이 실제 연결되어야 함. |
| VS-E06 · §3 | Drawing Studio의 공동 작화 상태·설명용 표시·역할별 작업 범위. | 통합 | 기존 편집/저장 명령을 사용한 결과 검증; 설명 overlay를 원고 변경과 구분; 권한 없는 편집 거부. |
| VS-E07 · §3 | Review Room의 두 버전 비교·overlay·컷별 주석·재검토. | 통합 | 비교한 두 revision을 명시하고 주석이 어느 버전에 귀속되는지 보존. 단순 화면 공유와 구별. |
| VS-E08 · §§3,7 | Asset Library의 후보함·공동 선택·사용 컷 검색·출처/사용 조건, 팀 도구함의 brush/palette/material/balloon/export preset. | 통합 + 신규 묶음 | 개인 설정 덮어쓰기 없이 프로젝트 권장 설정 비교→명시적 적용; 새 회차/신규 팀원에 같은 패키지 전달. |
| VS-E09 · §§3–4,9 | Production Board에 선행 작업·막힌 이유·기한·완료 조건·다음 담당자와 역할별 작업 패키지를 연결한다. | 통합 + 신규 연결 | 입력 자료·관련 컷·산출물 규격·제출 결과가 동일 작업에 연결; 다음 담당자가 자료를 다시 묻지 않고 시작할 수 있는 시나리오. |
| VS-E10 · §4 | 다른 시간에 접속한 사람을 위한 인수인계 봉투, 버전 고정 검토함, 주석 재연결 상태. | 신규 + 통합 | B10과 기존 저장/동기화. local saved / queued / delivered / acknowledged 별도 상태; 컷 이동 뒤 불확실한 주석은 자동 좌표 재부착하지 않음. |
| VS-E11 · §4 | 사용자가 남긴 짧은 화면 설명·포인터 기록을 실시간 사람과 구별한다. 녹화/전사/AI 요약은 동의·저장 정책을 갖춘다. | 신규, 기록은 명시적 opt-in | 부재 설명 badge·작성자/시각/대상 버전; 녹음/기록을 자동 시작하지 않음. 기록 NPC를 online 사용자로 세지 않음. |
| VS-E12 · §5 | 공식 원본 공간 보존, 기능을 갖춘 소품, 재사용 가능한 공간 패키지와 1인/4인 연재팀/2인 리뷰실/멘토링/에셋 전시실 템플릿. | 신규 + 통합 | B03/B09/B11/B12. template에 art/collider/approach/seat/facing/exit/capacity/action/privacy 포함; 이미지 없는 숫자 템플릿으로 완료하지 않음. |
| VS-E13 · §5 | 코드 없이 등록된 조건·행동을 조합한다. 모니터→지정 검수본, NPC→투어, 실제 제출 완료→검토함 알림. | 신규 | 임의 JS/HTML 실행 금지; 외부통신/파일/AI는 권한 분리. 로컬 실행과 팀 반영을 구분하고 허위 제출 알림 방지. |
| VS-E14 · §6 | 생활형·기능형·AI 보조형 NPC를 구별하고 verified character package를 사용한다. 사용자 avatar·NPC·작품 캐릭터의 정체성을 구분한다. | 통합 + 신규 | B02/B05/B13/B14. 생활형은 로컬 규칙, 기능형은 실제 도구 안내, AI형은 명시적 허용자료 질문. NPC가 독립 권한 주체 또는 부재 사용자 대역이 되지 않음. |
| VS-E15 · §7 | 대본 리딩·콘티 리허설에서 대사별 담당·길이·장면 순서·동선·후보 비교·결정을 실제 대본/콘티에 연결한다. | 통합 + 신규 세션 | E05의 확장. 세션 결과 적용·되돌리기·개인 탐색 경계 확인. |
| VS-E16 · §7 | 기존 3D 작업면의 배경·포즈·카메라 후보를 공동 검토해 해당 컷에 연결한다. | 통합 | Phaser를 새 3D 소셜 엔진으로 교체하지 않음. 3D/월드/미디어 렌더 우선순위와 결과 reference 검증. |
| VS-E17 · §§3,7 | 작품 세계관 쇼룸과 Showcase에는 승인한 등장인물·장소·소품·콘티만 별도 권한으로 공개한다. | 조건부 공개 surface + 내부 통합 | 내부 설정 일관성 검토와 외부 공개를 분리; 비공개 원고/참고자료 유출0; 승인한 snapshot만 공개. |
| VS-E18 · §8 | AI Producer: 규칙 검사→허용 자료 검색/요약→생성; 상황 정리·변경 영향·검토 의제·작업 설명 초안·창작 후보·내보내기 설명. | 통합 + 신규 워크플로 | 읽은 자료/버전·근거·비용·diff·공유 대상을 표시; BYOK 유지. 보기/초안/반영/공개 분리, 취소·되돌리기; 파일/댓글의 지시문에 실행 권한 없음. |
| VS-E19 · §§8–9 | 작업중/검수/승인/게시 버전 분리, 사람 권한에 따른 승인. AI가 연출·사용권·흥행을 자동 보증하지 않음. | 통합 | B10/ADR-0022. 새 head가 올라와도 이전 approved revision 불변; reaction·AI판정으로 승인 상태 변경0. |
| VS-E20 · §9 | 소재 출처·사용 컷·납품 포함 여부·교체/제거 영향 추적. 향후 Content Credentials 검토는 권리 보증과 분리. | 통합; C2PA는 조건부 | 사용 위치/공개패키지 조회 및 교체 영향 검증. 출처 검증≠권리/사실성 자동 보증. |
| VS-E21 · §10 | 제한된 검수본의 멘토링, 산출물 중심 공동 창작 모임, 역할/포트폴리오/일정 기반 팀 연결. | 조건부 확장 | 실제 수요·운영·권리 경계 확인; 외부 검토자가 전체 프로젝트/원본 편집권 없이 허용범위 주석 가능. 일반 피드 먼저 확장하지 않음. |
| VS-E22 · §10 | 공간·소재·가구·캐릭터 동작·brush/palette 패키지 생태계와 공개 open studio. | 조건부 확장 | version/compatibility/provenance/performance budget, publish 권한. 공개 방문자의 실시간 P2P는 별도 동의와 작은 세션 경계. |
| VS-E23 · §11 | 위치/커서/emote, reliable control, ephemeral occupancy, durable document/review/handoff, scoped media, static art cache, explicit AI의 데이터 경계를 유지한다. | 통합 + 신규 adapter | B06–B13/B18–B19. 저장·수신·확인 구분, 오래된 위치 latest-only, tick DB 기록 없음, 새 유료 backend 자동 추가 없음. |
| VS-E24 · §11 | 공용 로비와 프로젝트/회차별 작은 공간; 대형 행사·방송·3D social은 별도 수요/성능/media/비용 검증 후 판단한다. | 소규모 공간 통합; 대형은 장기 실험 | 24명 mesh의 단순 연결쌍 계산을 지원 보장으로 쓰지 않음. TURN/SFU/대형행사를 무료·무제한 기본확장으로 선언하지 않음. |
| VS-E25 · §12 | 첫 작업 시간, 유효 결정, 수정 완료, 인수인계 재설명, 저장/복구 실패, 연결 성공, 세션 자원 비용으로 성과를 측정한다. | 신규 계측 | B19/B20. 사용자 키 입력·마이크 사용·아바타 이동을 생산성 점수로 수집하지 않음. 익명 집계도 실제 필요한 범위만 정의. |

원문이 가장 먼저 완성하라고 정리한 세 경로는 **같은 컷 검토→수정→재검토**, **산출물 제출→다른 시간의 인수인계**, **팀 템플릿→도구 배치→권한 있는 공동 세션**이다. 이 세 경로에 아트·실보행·NPC·교류 품질 전제를 함께 연결한다. §4의 B01–B20만 구현하고 위 E01–E25를 누락한 상태를 원 공유 대화 전체 완료라고 표시하지 않는다.
