# Virtual Studio Living World — 움직임·NPC·사용자 상호작용 상세 설계

상태: **target / 상세 설계 제안**. 이 문서의 신규 기능은 구현 완료·병합·운영 배포를 뜻하지 않는다. 2026-09-20 현재 작업본을 읽고 최초 Virtual Studio 목적을 재검토했다. 아래 수치 중 목표·초기값으로 표시한 값은 플레이테스트 전 가설이다.

## 0. 범위와 현재 확인한 사실

프로젝트 이름은 Codex의 `toonstudio`, 저장소는 `blue45f/toonspectrum`이다. 조사한 worktree는 `/Users/hjunkim/.chatgpt-worktrees/toonspectrum-vs-polish-reviewed-20260920`, branch는 `feat/virtual-studio-polish-reviewed-20260920`, HEAD는 `ed116cd47`이며 미커밋 변경이 있다. 다른 세션의 소스·Git index를 덮어쓰지 않는다.
`docs/studio-p2p-virtual-studio-2026-09-18.md`, `docs/studio/virtual-studio-world-authoring.md`, 실제 Virtual Space/Phaser/Huddle source를 비교했다. 예전 문서의 좌표·heartbeat 수치와 실제 source가 다를 때 source를 현재 사실로 취급한다.
현재 플레이어에는 가속·감속, fixed-step 표시 보간, 이동거리 기반 atlas, 포커스 차단, A*와 충돌 등이 있다. 하지만 이것만으로 완성된 게임 조작감이 입증되는 것은 아니다.
현재 NPC는 `idle/talk/draw/review/patrol`과 waypoint 추적 정도다. 순찰은 sprite 좌표를 일정 속도로 변경하며 플레이어와 동일한 가감속·회피 체계를 사용하지 않는다. 기본 manifest의 `npcs: []`도 확인했다. 배경 그림의 인물들은 독립 NPC가 아니다.
현재 peer 클릭은 가까우면 Huddle 열기, 아니면 follow다. 초대 수락·동시 행동·상호작용 자리 예약 등은 별도 설계가 필요하다. 현재 media 제한은 원격 3명, 즉 본인 포함 4명이다. 공간 상한 24는 상수이지 24명 실네트워크 성능 검증 결과가 아니다.
현재 source의 presence는 `toonspectrum-space-v1`, 최소 송신 간격 90ms, heartbeat 2500ms, stale 10000ms, 패킷 상한 1024B다. 새 social event를 이 presence 패킷에 무분별하게 추가하지 않는다.
현재 4종·4방향·8프레임은 `technique: cutout-rig`다. 원화 변형 atlas를 개별 작화 프레임이라고 부르지 않는다. 엔진 선택만으로 새로운 관절 동작·가려진 배경 픽셀이 생기지 않는다.

## 1. 최초 기획을 유지하는 제품 목표

목표는 별도 게임/일반 사무실의 복제가 아니라 **원본 아트의 창작 스튜디오 안에서 사람이 만나 실제 제작 도구를 사용하는 경험**이다. Classic/Virtual Studio는 같은 프로젝트·문서·권한을 공유하는 표현 모드로 유지한다.
상단 프로젝트바, 좌측 메뉴, 중앙 월드, 우측 Huddle/Chat/Members, 하단 6개 제작 기능을 유지한다. 중앙 월드를 게임으로 바꾸더라도 문서 저장·편집·검수 권위를 Phaser로 옮기지 않는다.
Lounge는 인사·잡담·휴식, Writers Room은 스토리 공동 검토, Storyboard Wall은 컷/콘티 검토, Drawing Studio는 기존 공동 드로잉, Review Room은 기존 리뷰, Asset Library는 기존 에셋 선택·공유, Assistant Desk는 명시적으로 요청한 AI 기능, Plaza/Project Board는 모임·일정·작업 상태 진입점으로 쓴다.
방/물건을 클릭했다고 상대방 문서를 자동으로 열거나 수정하지 않는다. 초대 수락 → 해당 기능의 기존 권한 검사 → 원래 화면/도구 열기로 연결한다. 자리 사용은 문서 편집권 획득이 아니다.
보존할 제약: 원본 화풍, 실제 기능 연결, P2P 우선, 명시적 미디어 동의, 오프라인 작업, 기존 보안·CI. 새 서버·DB·유료 RTC·TURN/SFU·요금제·운영 배포는 자동 추가하지 않는다.
**역동성은 모두가 계속 뛰는 것이 아니라, 시선·작업·휴식·인사·이동·대화가 상황에 맞게 달라지는 것**으로 정의한다. 집중 작업 중에는 장식 애니메이션과 NPC 접근을 줄인다.

## 2. 책임 분리

React는 product shell·대화·초대 UI·접근성·권한 안내를, Phaser는 월드 렌더·로컬 물리·카메라·애니메이션을 맡는다. 순수 TypeScript 모델이 이동 의도, NPC 의사결정, 상호작용 상태, 대화 그룹 규칙을 소유하고 Phaser 객체는 그 상태의 표시로만 사용한다.
`ActorIntent → Locomotion → Collision → RenderPose → Animation`을 플레이어·NPC가 공유한다. 원격 사용자는 수신한 위치를 보간하는 proxy이며 로컬 물리로 실제 상대방을 밀어내거나 조작하지 않는다.

## 3. 플레이어 이동 — 즉각적인 조작과 자연스러운 보행을 분리

입력은 키보드/WASD·화살표, gamepad, joystick, click path를 하나의 정규화된 intent로 변환한다. 우선순위는 권한/모달/blur 중단 → 직접 입력 → 수락한 연출 행동 → 클릭 경로 → follow다. 직접 입력은 자동 이동을 취소하고, 입력창·IME 조합·모달은 게임 키를 소비하지 않는다.
물리는 60Hz fixed step을 유지하고 렌더는 화면 refresh에 맞춰 보간한다. 제어 계산도 고정 tick 경계로 수렴시켜 30/60/120Hz에서 이동거리·제동 차이가 누적되지 않게 한다. catch-up step 수는 제한하고 숨김 탭에서 복귀할 때 긴 delta를 한 번에 재생하지 않는다.[S1]
기존 기본값 205 units/s, acceleration 1500, deceleration 2100은 이상적인 직선 조건에서 가속 약 137ms·감속 약 98ms다. 단순히 관성을 크게 늘리지 않는다. 초기 목표는 입력 반영 1~2 render frame, 정지 80~120ms, 정속 대각선/직선 속도 차이 2% 이내다. 이는 측정할 기준이지 현재 달성 선언이 아니다.
발 접지점을 collider·sprite origin·shadow·seat anchor의 공통 기준으로 사용한다. 화면상의 손/머리가 아니라 발 아래의 작은 원형 body로 충돌한다. 시각적 보폭은 실제 충돌 후 이동거리로 진행해 벽 앞 제자리 걷기를 막는다.
걷기 phase는 방향 전환에도 보존한다. 순간 반대 입력에는 빠른 제동·turn pose를 쓰되 사용자의 이동 방향을 늦추지 않는다. 입력은 8방향을 지원하되 현재 4방향 원화를 8방향 아트라고 표시하지 않는다. 8방향 표현은 검수한 추가 원화가 확보될 때만 활성화한다.
클릭 이동은 기존 A*를 유지하고 인접 waypoint를 collision clearance가 있을 때만 건너뛴다. 보기 좋은 spline 때문에 책상 모서리를 가로지르지 않는다. 도착 지점에서 제동하고, 막히면 제한 횟수 재탐색 후 명확한 실패 표시를 한다. 접근 불가능한 클릭은 텔레포트로 성공 처리하지 않는다.
대인 충돌은 hard body-block 대신 부드러운 회피를 기본값으로 한다. NPC가 실제 사용자에게 양보하며, 다른 사용자가 문을 막아 진행을 방해할 수 없게 한다. 벽·책상·막힌 문은 hard collision이다. 좁은 복도에서는 한쪽으로 양보하는 규칙과 timeout을 사용해 좌우로 춤추는 교착을 방지한다.
카메라는 프레임률 독립 smoothing과 deadzone을 사용한다. 전체 방이 보이는 데스크톱에서는 불필요한 흔들림을 줄이고, 모바일에서는 작은 진행방향 look-ahead를 둔다. 기본 screen shake는 없다. 확대/회전/시점 변경을 상대방이 강제로 실행할 수 없다.
follow는 상대의 바로 뒤가 아니라 진행방향 offset에 정지한다. 도달 시 idle, 상대 이동 시 재추적한다. 상대 이탈·world revision 변경·직접 입력·Escape·blur·차단 시 즉시 끝난다.

## 4. 애니메이션·아트 — 엔진과 별도로 충족해야 하는 조건

현재 한 장을 변형한 cutout-rig는 프로토타입/대체 표현으로 유지할 수 있지만 최종 보행 품질 판정은 별도다. 발 contact→down→passing→up과 반대발 contact가 실제로 다른 포즈여야 한다. 발을 고정하지 않고 전체 이미지만 기울이는 방식을 최종 보행으로 인정하지 않는다.
같은 캐릭터의 얼굴·헤어·의상·조명·카메라 높이를 먼저 고정한 model sheet를 만든다. 원본을 작은 부위로 분리하고 가려진 관절/머리카락만 복원하거나 pose를 보완한 뒤 atlas로 bake한다. 방향마다 독립적으로 재생성해 다른 사람처럼 변하는 결과는 탈락시킨다.
기본 clip 계약: idle/breath/blink, walk 4방향, 빠른 이동, turn, greet, talk/listen, sit-down/seated/stand-up, draw, review, pick/place, cheer, 서로 수락한 high-five. 각 clip은 capability로 등록하고 없는 동작은 메뉴에서 숨기거나 명시된 fallback을 쓴다.
걷기는 우선 방향별 8개의 유효 key pose를 검수하고 필요할 때 12개로 확장한다. idle은 길고 작은 동작, 인사/앉기는 짧은 non-loop transition, draw/review는 손·상체 중심 loop로 분리한다. 표시 60fps와 원화 60장을 혼동하지 않는다.[S2]
`CharacterDefinition`은 stable `skinKey`, `registryRevision`, 방향/clip, atlas frame, footPivot, interaction sockets(손/의자/시선), displayHeight, strideLength, contact event를 가진다. 자동/숫자 avatarIndex는 기존 wire 호환에만 사용한다. 등록 순서가 바뀌어 상대가 다른 캐릭터로 보이지 않게 handshake에서 stable key/version을 확인한다.
기준 화면의 full character height는 원본 인물과 나란히 비교해 대략 75~90px를 초기 교정 범위로 삼는다. canvas DPR와 world scale을 구분하고 384×512 atlas cell 크기를 표시 크기로 사용하지 않는다. 프레임별 발 위치·bounding box·색·실루엣을 자동/육안으로 검사한다.
Phaser native Sprite/atlas를 기본 runtime으로 유지한다. 별도 skeletal runtime이나 WASM을 선제적으로 추가하지 않는다. 보조 hair/clothes bounce는 작은 secondary motion이며 얼굴 전체 squash나 과도한 기울임으로 품질을 대신하지 않는다.
원본 background 전체는 master proof로 보관한다. 수정하지 않는 영역의 픽셀은 그대로 유지하고, 실제 인물/NPC를 분리하는 영역만 mask와 clean plate를 만든다. 인물이 가렸던 바닥은 원본에서 추출할 수 없으므로 해당 부분의 복원·검수가 필요하며, 그 영역까지 원본 픽셀과 동일하다고 주장하지 않는다.
완성 레이어는 floor/wall-base, 고정 가구의 뒤쪽, y-sort actor/props, 가구의 앞쪽·식물 foreground, light/effect, text/UI다. 문구·말풍선을 배경에서 분리하면 상태에 맞는 실제 UI로 바꿀 수 있다. 배경 속 정적인 인물을 남긴 채 그 자리에 같은 NPC를 또 올리지 않는다.
방을 옮길 수 있어야 하므로 장기적으로는 room별 floor/wall와 가구를 조합 가능한 모듈로 분리한다. **manifest의 collider 위치만 바꾸는 것은 배경 속 책상을 이동시키지 않는다.** 시각 레이어와 게임 지형이 같은 object ID/transform을 사용해야 한다.

## 5. NPC — 목적과 반응이 있는 생활 시뮬레이션

NPC를 점 사이에서 계속 왕복하는 장식으로 만들지 않는다. 구조는 **행동 선택 → 길찾기/회피 → 공통 이동체 → 애니메이션**이다. 행동 선택과 steering/locomotion을 구분하면 새 직업·캐릭터를 추가해도 이동 엔진을 복제하지 않는다.[S3]
초기 구현은 계층형 상태기계(HFSM)와 작은 점수 기반 행동 선택으로 충분하다. 매 프레임 LLM 호출, 무조건적인 거대 behavior tree/GOAP 도입은 하지 않는다. LLM 대화/AI Producer는 사용자가 요청한 별도 기능이며 NPC가 private chat·마이크를 관찰하지 않는다.
공통 상태: Rest → ChooseActivity → WalkToAnchor → Approach → Align → Perform → Leave. 긴급 상태는 Yield, Greet, WaitForSlot, Repath, Cancel이다. 같은 clip만 무한 반복하는 대신 state별 최소 체류시간, cooldown, 선택 가중치를 둔다.
`NpcProfile`은 id, skinKey, role, home/allowed rooms, allowed object tags, routine weights, movement profile, awareness radius, cooldown, idle variants, seed, simulation scope를 가진다. 확률은 개체별 PRNG와 단조 시계로 관리해 모든 NPC가 같은 순간 움직이지 않게 한다.

| 역할 | 자연스러운 기본 루틴 | 실제 사용자에 대한 반응 |
| --- | --- | --- |
| 리셉션/가이드 | 입구 대기 → 안내판 확인 → 자리로 복귀 | 가까이 오면 시선/짧은 인사; 요청·수락한 경우에만 목적지 안내 |
| 작가 | 책상에 앉아 집필 → 콘티 보드 보기 → 짧은 휴식 | 집중 사용자는 방해하지 않고, 가까운 상대에게 잠깐 고개를 돌림 |
| 작화가 | 드로잉 작업 → 손목/기지개 → 모니터 확인 | 사용자가 자리를 선택하면 양보 가능한 장식 자리에서 일어남 |
| 에셋 담당 | 서가 접근 → 책/소품 확인 → 테이블에서 정리 | 에셋 도움 요청 시 기존 에셋 UI로 연결; 자산을 임의 변경하지 않음 |
| 마스코트/고양이 | 분수 주변 산책 → 소파 휴식 → 주변 바라보기 | 짧게 반응하고 복귀; 사용자를 지속 추적하거나 작업 영역을 가리지 않음 |

동시에 보이는 ambient NPC는 우선 6~8명, 이동 중은 2~3명 이내를 초기 연출 예산으로 삼는다. 모바일은 3~4명과 이동 1~2명부터 검수한다. 실제 사용자 수가 늘면 ambient 밀도를 낮춘다. 온라인 인원에는 NPC·마스코트를 포함하지 않으며 클릭 정보에 NPC임을 표시한다.
NPC 이동에도 플레이어와 같은 acceleration/deceleration, collision, foot phase, arrival, stable facing을 적용한다. NPC는 실제 사용자의 진행을 막지 않고 먼저 양보한다. 가까운 최대 이웃만 조회하는 spatial hash를 두고, 문 앞에서는 우선순위와 짧은 대기로 통행을 정리한다.
이동 목적은 임의 좌표가 아니라 `ActivityAnchor`다. 의자의 접근점·착석점·바라보는 방향·퇴장점, 서가의 정지점, 보드의 관찰점을 명시한다. 가구 중앙으로 걸어 들어가거나 앉을 때 순간적으로 멀리 이동하지 않는다.
같은 행동 연속 선택을 줄이는 cooldown, 업무/휴식 비율, 짧은 시선 변화, 약한 고개 끄덕임을 둔다. 인사 반응은 사용자별 제한과 화면 전체 제한을 함께 둔다. 집중 모드에서는 접촉 없는 ambient만 남긴다.
막힌 길은 일정 시간 감지 후 재탐색하고 대체 anchor를 선택한다. invalid NPC spawn도 collider와 비교한다. 화면 중앙에서 튀는 teleport 대신 허용된 안전 위치 재배치가 필요한 이유를 디버그에 남기고, 일반 동작에서는 자연스러운 취소/대기를 우선한다.
의사결정은 2~5Hz, 가까운 회피는 10~20Hz, 이동체는 fixed 60Hz, 화면 표시만 render rate를 초기 목표로 삼는다. 화면 밖 NPC는 저빈도 상태 갱신으로 줄인다. 경로 재탐색은 매 frame이 아니라 목표·지형 revision·막힘 변화에 반응한다.

### NPC의 동기화 범위

`ambient-local` NPC는 개인별 생활감 연출이다. 화면마다 약간 달라도 되지만 shared seat/문서/회의에 영향을 줄 수 없다. 안내 NPC의 개인 투어도 요청한 사용자에게만 제공한다.
`shared-session` NPC가 필요하면 모두에게 동일한 행동·대상·시작/종료를 전달한다. authority는 기존 room coordination의 짧은 session lease/epoch로 고정하고 분할 네트워크에서 독자적인 복수 leader로 승격하지 않는다. lease가 불확실하면 shared 행동은 중단하고 ambient/local 모드로만 남긴다.
shared NPC는 목표/seed/phase/유효기간과 필요 시 낮은 빈도의 위치 보정을 보낸다. 같은 seed가 부동소수점·충돌·탭 스케줄 차이까지 동일하게 보장한다고 가정하지 않는다. 매 tick 서버에서 NPC를 시뮬레이션하지 않는다.

## 6. 입장한 사용자와의 상호작용

입장 흐름은 프로젝트 권한 확인 → 공간 아트/월드 revision 준비 → P2P 참여 안내·동의 → authenticated peer 발견 → 아바타 등장이다. 카메라/마이크는 이 과정에서 요청하지 않는다. 다른 사용자와 연결되지 못한 상태를 가짜 아바타나 온라인 숫자로 감추지 않는다.
아바타 단일 클릭은 무조건 Huddle/follow 대신 **작은 사용자 카드**를 연다. 카드에는 이름·온라인/집중/자리비움·현재 작업(공유 허용한 정보만)·연결 상태와 가능한 행동을 표시한다. 모바일은 탭으로 같은 행동에 접근한다.

| 행동 | 동의/실행 규칙 | 화면 표현 |
| --- | --- | --- |
| 인사/리액션 | 짧은 targeted event, rate limit, 차단·집중 정책 존중 | 상대를 향한 손인사/작은 말풍선; 실제 수신 실패는 전달 완료로 표시하지 않음 |
| 대화 요청 | 상대에게 수락/거절/나중에, 만료시간 | 수락 뒤 같은 Conversation ID로 묶이고 media scope 표시 |
| 함께 이동/안내 | 상대 수락 후 각자의 로컬 캐릭터만 이동 | 나란히/offset follow; 직접 조작·Esc로 즉시 해제 |
| 하이파이브/축하 | 둘 다 수락, 접근점 2개 확보, animation capability 확인 | 정렬 → 준비 확인 → 짧은 동작 → 원래 상태 복귀 |
| 함께 앉기/검토 | 빈 interaction slot 확보; 자리 상태와 문서 권한 분리 | 같은 모니터 방향을 보고 앉되 리뷰/원고 열기는 다시 명시적으로 선택 |
| 작업실/문서 초대 | 인증된 프로젝트 범위의 reference만 전송 | 수락 후 기존 writer/drawing/review 경로로 이동; unsaved 작업 보호 |
| 화면/카메라 공유 | 본인 명시적 장치 선택 + 대화 그룹 대상 확인 | 공유 중 배지와 즉시 중지; 타 그룹/지나가는 사람에게 전송하지 않음 |

공통 social state는 Idle → Offered → Accepted → Approaching → Ready → Performing → Completed이며 어디서든 Declined/Expired/Cancelled로 끝날 수 있다. shared action은 acceptance 없이 상대 위치·방향·카메라·문서·장치를 바꿀 수 없다.
`InteractionSession`은 interactionId, actionId, initiator, targets, worldRevision, slotIds, phase, expiry, epoch를 가진다. peer별 중복 이벤트를 무시하고 동작 하나당 avatar lock을 둔다. 늦게 온 start가 이미 취소한 동작을 다시 시작하지 못하게 한다.
두 사람이 동시에 다른 요청을 보내는 경우 deterministic request 우선순위로 하나만 남기되, 각 사용자의 수락은 항상 별도다. 1초 단위 화면 연출은 원격 wall clock을 그대로 믿지 않고 명시적 ready handshake와 추정 offset/늦은 도착 정책을 사용한다. 늦은 client가 순간이동으로 맞추지 않는다.
양보 가능한 NPC 장식 자리와 실제 사람의 shared seat는 분리한다. shared slot에는 짧은 lease, revision, fencing token, reconnect release가 필요하다. 승인된 slot 하나에 두 사람이 동시에 앉지 않도록 단일 grant를 검증한다. 서버 연결이 불확실할 때 새 shared 점유를 성공 처리하지 않는다.

## 7. 대화 영역 — 거리와 멤버십을 구분

Gather의 거리 기반 교류/소그룹 대화/회의 공간은 UX 참고점이다. Gather의 bubble과 private area는 동일한 의미가 아니므로 이름만 가져와 privacy를 추정하지 않는다. 우리 구현에서는 **누구에게 소리·화면을 보내는지 실제 transport scope로 결정**한다.[S4][S5]
근접 상태는 OutOfRange → Candidate → Invited/OptedIn → Active → Leaving → Closed로 관리한다. 초기 tuning 예: 진입 반경 120 world units, 이탈 156, 진입 안정화 300ms, 이탈 유예 600~1000ms. 원본 크기와 UI에서 체감 검증 후 조정하며 매 frame 최근접 3명을 바꾸지 않는다.
한 대화는 모두 같은 `conversationId`, `mode`, `members`, `capacity`, `mediaScope`, `revision`을 가진다. A는 B/C와 대화 중인데 B는 A/D와 묶이는 비대칭 최근접 그룹을 허용하지 않는다. 기존 미디어 상한인 본인 포함 4명을 기본으로 유지하고 새 멤버는 수락·capacity 확인 뒤 참여한다.
라운지에서는 사용자가 먼저 켠 '근처 대화 허용' 모드에 한해 같은 모드의 상대와 자동 연결을 허용할 수 있다. 기본은 대화 요청이다. 이전 마이크 권한이 남아 있어도 앱의 현재 mic/대화 동의 상태를 별도로 검사한다.
집중/방해금지에서는 접근만으로 통화가 붙거나 알림/이모트가 반복되지 않는다. private conversation은 멤버가 아닌 peer에게 음성·영상·화면 트랙을 아예 연결하지 않는다. 볼륨 0이나 CSS로 video 숨기기만 하는 것을 privacy로 간주하지 않는다.
벽 너머 소리가 새지 않도록 `AcousticZone`/닫힌 출입 경계와 room policy를 사용한다. 거리 감쇠는 허용된 수신자 내부에서만 적용한다. 시청 중 대상과 전송 대상은 별개로 표시한다. 이동/탈퇴/차단/권한 회수 시 scope를 다시 계산하고 불필요한 sender·연결·오디오 노드를 정리한다.
서버 health flag와 RTC 실제 연결을 분리한다. 일시적 API 오류만으로 아직 유효한 P2P 세션을 성공/실패로 오인하지 않되, admission 만료나 권한 회수 시 미디어를 계속 보내지 않는다. 신규 참가/권한 작업은 기존 authority를 통과해야 한다.

## 8. P2P 전송·권위·서버 비용

기존 인증된 `StudioLiveDirectPort`, room admission, Huddle를 재사용한다. 새 게임 서버·SFU를 만들지 않는다. 실제 문서 변경은 기존 문서 CRDT/command/저장 경로를, 권한·게시·검수는 기존 서버 authority를 그대로 사용한다.
세 종류를 분리한다: (a) 버려도 되는 position/facing/moving presence, (b) 수락/취소/자리 grant 등 누락되면 안 되는 social control, (c) 음성·영상·화면 media. 논리 lane을 구분하며 지금 존재하는 unreliable DataChannel을 '신뢰성 전송'이라고 부르지 않는다.
presence는 현재 90ms throttle과 final flush를 유지한 상태에서 실제 전송률을 측정한다. 향후 10~15Hz 예산은 목표 범위다. 밀릴 때 오래된 position을 FIFO로 전부 보내지 않고 최신 것만 남긴다. 상대 표시에는 수신시각 기반 80~120ms buffer와 짧은 bounded prediction을 후보로 쓰고, 장시간 packet이 없으면 멈추고 연결 상태를 표시한다.
social control은 별도 versioned namespace로 schema·크기·rate 제한을 둔다. 동일 RTC 기반이라도 ordered/reliable lane 또는 bounded ACK/retry/dedup adapter가 필요하다. 제어 이벤트 ID·session epoch·sequence·target·expiry·world revision을 검증하고, 뒤늦은 accepted/started가 cancel을 되돌리지 못하도록 terminal 상태를 보존한다.[S6]
`SocialEnvelope` 후보 필드: wire, sessionEpoch, worldId, worldRevision, interactionId, sequence, kind, senderSessionId, targetSessionIds, expiresAfterMs, payload. sender를 JSON 문자열에서 믿지 않고 authenticated transport identity와 대조한다. 상대 session 변경 뒤 재생된 packet은 거부한다.
좌석·공유 문·shared NPC leader 등 배타 상태는 기존 room coordination의 소량 ephemeral lease/CAS로만 중재한다. authority가 추가되지 않은 상태에서 P2P만으로 완전한 배타성·분할 안전성을 보장한다고 주장하지 않는다. 신규 grant는 fail-closed, 개인 ambient/local 미리보기는 계속 가능하게 한다.
lease coordinator는 기존 배포 단위의 adapter로 두며 tick별 게임 상태는 받지 않는다. 게임 좌표·NPC loop·이모트의 DB 기록은 만들지 않는다. 새로운 서버 또는 과금 항목이 필요한 구현이 되면 별도 승인 전에는 활성화하지 않는다.
현재 공간 상한 24는 유지하면서 8/16/24명의 실연결 부하를 검증한다. 24명의 완전 연결 mesh는 276개 peer 쌍, 각 browser는 최대 23개의 상대 연결을 가질 수 있으므로 '좌표 데이터가 작다'만으로 비용이 없다고 할 수 없다. 화면 밖 culling은 GPU 일을 줄일 뿐 기존 연결 수를 자동으로 줄이지 않는다.
오디오·영상은 현재 그룹 최대 4명, 화면공유는 초기 정책 1명으로 제한한다. 멀리 있는 사람에게 고빈도 좌표/미디어를 보낼 필요가 없도록 interest 정책을 설계하되, private 멤버십과 단순 거리 최적화를 혼동하지 않는다.
STUN-only 직접 연결은 일부 네트워크에서 실패할 수 있다. 실패 시 연결 불가/재시도를 표시하고 로컬 작업은 유지한다. TURN은 실제 릴레이 트래픽과 비용이 생기는 별도 결정이며, '서버 자원 없이 모두 연결'을 약속하지 않는다. 현재 승인 없이 TURN/SFU fallback을 켜지 않는다.[S7]
최초 방문에 필요한 self skin/current room만 먼저 로드하고 새 peer/NPC skin은 지연 로드한다. 같은 skin texture는 공유하고, loading 실패 시 검증된 기존 skin을 유지한다. entity가 떠난 뒤 도착한 비동기 asset 결과가 새 scene을 오염시키지 않게 generation guard를 둔다.

## 9. 변경 가능한 방·가구·상호작용 데이터

Tiled의 object custom properties와 templates를 room/prop 작성에 사용한다. object template inheritance는 런타임에서 우연히 해결되기를 기대하지 않고 export 단계에서 풀어 검증된 WorldManifest로 compile한다. native painterly art를 픽셀 타일로 다시 그릴 필요는 없다.[S8][S9]
`WorldManifest` 확장 후보: schemaVersion, worldId, contentRevision/hash, layers, rooms, props, colliders, navRegions, interactionAnchors, acousticZones, spawns, npcProfiles/instances, allowedActionIds. 런타임 manifest는 immutable compiled snapshot으로 두고 authoring draft와 분리한다.
`PropDefinition`은 asset, transform, depthFootY, colliders, renderParts, tags, capabilities, interactionSlots를 가진다. 의자는 앉기, 소파는 여러 좌석, 모니터는 검토/공유, 보드는 공동 문서 reference처럼 실제 의미를 가진다. object마다 새 React component를 복제하지 않는다.
`InteractionSlot`은 approachPoint, seated/standing anchor, facing, exitPoint, animation sockets, capacity, occupancy scope, action IDs를 정의한다. draw/review/seat 같은 행동은 `ActionRegistry`의 승인된 handler로만 실행한다. 가져온 JSON의 JS, 임의 HTML, 실행식, 임의 외부 URL은 실행하지 않는다.
Arcade의 기본 collider는 사각형/원이다. 기울어진 가구는 검증된 단순 collider 조합으로 표현하고 통로 여유를 검사한다. 회전된 sprite의 bounding box만 무작정 solid로 쓰면 실제 통로가 막힐 수 있다. 임의 polygon이 필수가 될 때만 collision adapter를 확장한다.[S1]
작은 배치 변경도 visual transform, collider, anchor, nav obstacle, acoustic boundary가 같은 revision에서 함께 바뀌어야 한다. 책상만 옮기고 의자의 접근점/앉는 방향이 남는 상태는 validation에서 실패시킨다.
로컬 편집은 preview namespace에서만 동작하고 shared presence에 좌표를 내보내지 않는다. publish는 기존 프로젝트 권한 및 저장 정책으로만 수행한다. 배포/게시 승인을 JSON export와 혼동하지 않는다.
공유 map update는 새 revision 사전 로드 → 대화/interaction 종료 또는 명시적 이관 → 안전 spawn 검증 → revision 전환 → 참여 재개 순서다. 다른 revision의 actor/seat event를 적용하지 않는다. backward compatibility는 view-only/fallback으로 명시하고 예전 client에게 새 행동이 된 것처럼 표시하지 않는다.

## 10. 역동적인 연출과 집중 가능한 화면

기본 연출은 분수/마스코트의 작은 움직임, 커피의 옅은 김, 간접등의 미세 변화, 선택한 오브젝트 강조, 작업 중 손동작/시선, 인사 때 짧은 표정이다. 과도한 bloom·전 화면 파티클·카메라 흔들기·동기화된 반복 점프는 기본값에서 제외한다.
activity density는 Focus / Balanced / Lively로 사용자가 조절한다. Lively도 UI와 문서를 가리지 않는 상한을 가진다. 사람이 많으면 NPC와 장식 FX를 줄이지 실제 사용자를 가짜로 숨기거나 offline로 표시하지 않는다.
연출 우선순위는 직접 조작 > 진행 중인 social/문서 interaction > 실제 상대의 대화 상태 > NPC > 환경 장식이다. 화면 밖 FX는 꺼지고 object/particle은 pool을 사용한다. 이모트는 peer와 전체 화면 rate limit을 모두 적용한다.
발자국/환경음은 opt-in이고 통화 중 자동 ducking한다. 말소리 감지 상태는 가능한 로컬 audio level로 표시하며 음성 녹음/전사/분석 전송을 추가하지 않는다. 작업 BGM은 회의 상대에게 기본 전송하지 않는다.
화면을 가리는 offline 안내는 compact 상태 pill과 확장 설명으로 바꾼다. 로컬 작업·P2P 직접 연결·미디어 상태를 따로 표시한다. 서버 오류 메시지가 계속 월드 상단 1/4을 가리지 않게 한다.
`prefers-reduced-motion`과 사용자 설정에서는 장식·bob·flash·카메라 연출을 줄인다. 필수 위치 이동과 상대 존재를 숨기지는 않는다. 모든 동작은 아바타 외에도 참가자 목록/키보드 메뉴에서 수행할 수 있어야 한다. NPC 말풍선이 live region을 계속 읽게 만들지 않는다.

## 11. 성능·품질 예산 — 측정 전 목표

데스크톱 대표 프로파일은 1312×1199, DPR 최대 2, 실제 사용자 16명 + ambient NPC 8명 + 4인 미디어 그룹으로 정의한다. 24명은 스트레스 조건으로 별도 검증한다. 모바일 대표 프로파일은 430×932, 실제 사용자 8명 + NPC 4명이며 낮은 등급 장치에서는 장식만 먼저 줄인다. 검증 전 동시 인원 보장으로 광고하지 않는다.
목표는 desktop 안정 60fps, mobile 기본 60fps/저전력 30fps 선택, 조작 처리 p95 50ms 이내, 워밍업 이후 50ms 초과 main-thread long task가 반복되지 않는 것이다. frame time·physics step·GPU/texture bytes·network packets를 나누어 기록한다. 평균 fps만으로 조작감 합격을 판단하지 않는다.
A* 작업은 bounded queue에 넣어 tick별 budget을 제한하고, 병목이 계측되면 revision-tagged Web Worker로 분리한다. worker의 늦은 결과는 map revision/actor request generation이 다르면 버린다. 단순 NPC 수를 이유로 즉시 WASM/새 엔진을 도입하지 않는다.
압축 파일 크기와 decoded GPU 메모리를 따로 계산한다. 예를 들어 1536×1024 RGBA8 atlas는 base level만 약 6MiB, 16장은 약 96MiB다. 6MB WebP 전송량이 6MB GPU 메모리라는 뜻이 아니다. mipmap·driver overhead·기타 textures는 추가다.
캐릭터 atlas는 표시 크기·DPR에 맞는 tier, 동일 skin 공유, 사용 중 reference count, 필요 없는 장면 texture 회수를 갖춘다. 초상화는 작은 별도 이미지, 걷기 atlas는 실제 등장하는 skin만 로드한다. 초기 manifest/내 캐릭터 준비 없이 모든 clip download를 대기하지 않는다.
frame/profile 목표는 비디오 없는 상태와 4인 Huddle 상태를 따로 측정한다. 실제 RTC 패킷·decoded video·CPU thermal/장시간 메모리도 검증한다. 브라우저 synthetic gamepad 성공과 물리 gamepad/모바일 Safari 성공을 구분한다.

## 12. 구현 작업 묶음과 의존성

작업을 아래 묶음으로 관리하되 일부만 구현하고 전체 완료라고 하지 않는다. 각 묶음은 source·tests·실제 화면 근거를 갖고 연결된 통합 시나리오를 마지막에 검증한다.
**Runtime 안정화:** 현재 dev shim·workspace dependency·build 실패 원인을 해결해 저장소의 재현 가능한 명령으로 부팅시킨다. 동시 writer·다른 worktree·공유 node_modules를 보존하고 검증을 우회하지 않는다.
**Art/Actor 기반:** 원본 clean plate·가구 전후 레이어·같은 캐릭터의 실보행 pose·발/손/의자 anchor를 만들고 registry로 연결한다. 이미지는 실제 제품에서 검수하며 에셋 시트 생성만으로 끝내지 않는다.
**Locomotion/Presentation:** 플레이어와 NPC의 공통 fixed-step 이동, 제동, 방향, 경로 smoothing, 회피, 카메라, atlas phase와 lifecycle cleanup을 구현한다.
**Living NPC/Smart Props:** profile·루틴·activity anchors·양보·좌석/문/물건 상태·등록된 기본 NPC를 연결한다. 실제 인물이 있는 배경 위에 중복 NPC를 올리지 않는다.
**Social/Conversation:** 아바타 카드, targeted 인사, 요청/수락/취소, 2인 행동, 그룹 멤버십, 집중/차단, 허용된 미디어 scope, slot lease와 문서 초대를 구현한다.
**Authoring/Protocol/Operations:** Tiled template compile, manifest hash/revision, safe import, private preview, permission-scoped publish와 기존 v1 compatibility를 연결한다. 비용·권한·배포 승인을 분리한다.
**Acceptance:** 실제 여러 브라우저·장치·network 조건에서 end-to-end 확인하고, lint/type/build/required CI를 통과한 범위만 PR에 표시한다. 실패를 근거 없이 기존 baseline 문제로 분류하지 않는다.

## 13. 코드 경계와 테스트 설계

변경은 `apps/web/src/domains/creator/virtual-space` 내부에서 우선 구현한다. 기존 파일/API를 점진적으로 adapter화하고 1000줄이 넘는 Phaser component에 모든 social/NPC 규칙을 추가하지 않는다. 실제 두 번째 소비자가 생기기 전 별도 `packages/domains`나 범용 ECS 플랫폼을 만들지 않는다.
권장 모듈은 `actor-locomotion`, `actor-animation`, `npc-director`, `activity-anchor`, `interaction-registry`, `interaction-session`, `conversation-policy`, `social-protocol`, `world-compiler`다. 순수 결정 로직은 Phaser/DOM 없이 unit test 가능하게 한다. 기존 `live/huddle`는 명시적 integration adapter로 재사용한다.
React↔engine bridge에는 입력 명령·interaction intent와 낮은 빈도의 상태변경만 전달한다. render frame마다 전체 UI의 state를 새로 만들거나 모든 참가자 목록을 다시 렌더하지 않는다. Phaser 객체를 저장소 정본이나 문서에 직렬화하지 않는다.

| 검증 영역 | 필수 통과 조건 |
| --- | --- |
| 플레이어 조작 | 30/60/120Hz에서 속도·도착 오차 목표 충족; 대각선 정규화; 키 해제/blur/IME/modal 중지; 직접 입력으로 자동 행동 취소 |
| 보행 아트 | 원본 silhouette·색·의상 유지; 4방향 실제 보행 pose; 발 anchor 안정; 벽 앞 보행 중지; 방향변경 phase 연속; crop/alpha halo 없음 |
| NPC | 기본 월드에 실제 등록·렌더; 20분 동안 끼임/문 막기/좌석 중복 없음; 동시 행동 비동기화; 집중 사용자 방해 제한; background 인물 중복 없음 |
| 대인 행동 | 초대 동시 발생·거절·만료·상대 이탈·취소 중 패킷 지연; 수락 전 상대 제어 없음; 행동 중 직접 입력 우선 |
| 공유 물건 | 두 사용자 동시 좌석 요청 중 하나만 승인; lease 만료/권한 회수/reconnect/분할 시 잘못된 이중 grant 없음 |
| 대화/미디어 | 그룹 membership 대칭; proximity 경계에서 연결 churn 제한; mic/camera 명시적 동의; 비멤버에게 트랙 미송신; 차단 후 송수신 중지 |
| P2P 장애 | reordered/duplicated/lost events, epoch 교체, late join, jitter, 느린 peer, bufferedAmount 증가, 일부 NAT 직접 연결 실패를 거짓 성공 없이 처리 |
| 맵 편집 | stale world hash 거부; local preview 격리; collider/anchor/image 동시 변경; 안전 spawn/도달성; 잘못된 import·외부 명령 실행 차단 |
| lifecycle/접근성 | StrictMode mount/unmount, 탭복귀, context loss, asset retry, motion-reduction, 키보드 메뉴, screen-reader 과잉 알림 방지 |
| 출시 검증 | required tests·lint·typecheck·build·CSP/보안/architecture gate 유지; 실제 screenshot/video·정확한 SHA·남은 미완료 기록 |

통합 플레이테스트는 같은 프로젝트의 두 실제 세션이 입장 → 인사 → 대화 수락 → 리뷰 자리로 이동 → 함께 앉기 → 기존 리뷰 도구 열기 → 한 명이 이동/집중 전환 → 미디어 scope 정리까지 이어져야 한다. 동시에 NPC는 주변 루틴을 수행하되 사용자의 길·자리를 방해하지 않아야 한다.
이후 4인 conversation, 8/16/24명 presence, mobile Safari/Chrome, 키보드·실물 gamepad·touch를 확장한다. 테스트 fixture가 실제 admission/원격 인터넷을 우회한 경우 범위를 결과에 명시한다. WAN 검증 없이 STUN 성공률을 주장하지 않는다.
성능 보고는 fps뿐 아니라 input-to-render p95, frame-time distribution, stop drift, route completion/error, NPC stuck count, conversation joins/leaves, media scope violations, packet rate/queue, texture bytes, 20분 session heap 추이를 포함한다. 사용자 텍스트·음성·문서를 telemetry payload로 수집하지 않는다.

## 14. 완료의 의미와 아직 결정하지 않은 것

최종 완료는 '그림이 움직임'이 아니라 원본과 유사한 아트·실보행·목적 있는 NPC·실제 사용자 교류·변경 가능한 월드·P2P/권한·검증이 모두 함께 작동하는 상태다. 배경에 합쳐진 인물이 남거나 cutout 변형이 최종 보행을 대신하거나 private media가 단순 mute라면 해당 항목은 미완료다.
다음 값은 구현/플레이테스트로 확정한다: 8방향 원화 필요성, idle/행동별 frame 수, 각 NPC 루틴 비율, proximity radius/time, 목표 장치별 asset tier, 24명 mesh의 지원 조건. 현재 설계로 모든 숫자가 이미 성능 보장된 것처럼 취급하지 않는다.
첫 검수 장면은 원본의 입구–라운지–분수–리뷰 데스크 동선으로 고정한다. 이 동선에서 플레이어 2명과 NPC 3명이 자연스럽게 공존하고 대화/좌석/도구 연결을 끝까지 수행하는 모습을 실제 제품에서 먼저 확인한다. 이는 나머지 기능을 제외하는 별도 출시 단계가 아니라 전체 구현의 공통 품질 기준 장면이다.

## 근거와 참고 자료

현재 사실은 아래 source 경로를 2026-09-20 직접 읽어 확인했다. 이전 assistant의 완료/성능 주장은 증거로 사용하지 않았다.
- `StudioVirtualSpacePhaserCanvas.tsx`: local/remote 표시, NPC 순찰, fixed physics, input/interaction 연결.
- `studio-virtual-space-world-manifest.ts`: room/prop/portal/spawn/NPC 구조와 기본 NPC 목록.
- `studio-virtual-space-character-skins.ts`: cutout-rig 8프레임·4방향·4종 registry.
- `studio-virtual-space-motion.ts`: acceleration 1500, deceleration 2100, maxSpeed 205.
- `studio-virtual-space-model.ts`, `studio-virtual-space-presence.ts`: 공간 상한 24, 근접 원격 3, presence v1 및 크기/빈도 제한.
- `StudioVirtualSpacePage.tsx`: peer 클릭의 Huddle/follow 분기.
- `live/huddle/studio-p2p-huddle-protocol.ts`, `StudioP2pHuddleLauncher.tsx`: 원격 미디어 3명 상한과 명시적 장치 UI.
- `docs/studio-p2p-virtual-studio-2026-09-18.md`, `docs/studio/virtual-studio-world-authoring.md`: 최초 창작공간 목적, 비용/동의, 기존 authoring 구조. 오래된 수치는 source 우선.
- `AGENTS.md`, `ARCHITECTURE.md`, `docs/architecture/modular-monorepo-target.md`, `openwiki/quickstart.md`, accepted ADR-0022: 배포·도메인·권위 경계.

[S1] Phaser 공식 Arcade Physics: 사각형/원 collider, fixed-step 설정. https://docs.phaser.io/phaser/concepts/physics/arcade
[S2] Phaser 공식 Animations: frame/sprite sheet/atlas, clip 재생/이벤트. 이 자료가 아트 품질을 보장하는 것은 아니다. https://docs.phaser.io/phaser/concepts/animations
[S3] Craig Reynolds, Steering Behaviors for Autonomous Characters (GDC 1999): action selection·steering·locomotion, arrival/separation/avoidance. https://www.red3d.com/cwr/steer/gdc99/
[S4] Gather 공식 Overview of Meeting Rooms (Private Areas), 2026-06-09 갱신: private area의 대화 범위. https://support.gather.town/articles/2550999600-overview-of-meeting-rooms-private-areas
[S5] Gather 공식 Talk in a Bubble, 2026-01-26 갱신: bubble의 별도 동작/공유 범위. 우리 제품의 privacy 계약과 같다고 가정하지 않는다. https://support.gather.town/articles/3330510961-talk-in-a-bubble
[S6] W3C WebRTC: RTCDataChannel의 ordered/maxRetransmits/bufferedAmount 등 전송 계약. https://www.w3.org/TR/webrtc/#rtcdatachannel
[S7] MDN WebRTC protocols: ICE/STUN/TURN와 relay 필요성. https://developer.mozilla.org/ko/docs/Web/API/WebRTC_API/Protocols
[S8] Tiled 공식 Custom Properties: object/class/enum/file 등 작성 계약. https://doc.mapeditor.org/en/stable/manual/custom-properties/
[S9] Tiled 공식 Using Templates: object template 인스턴스/override 및 detach export. https://doc.mapeditor.org/en/stable/manual/using-templates/

이 문서는 설계 산출물이다. source 수정, runtime 검증, PR merge, 운영 배포의 결과와 분리해 추적한다.
