# ToonSpectrum Studio 기능 완성도 감사

- 기준일: 2026-07-12
- 최신 구현 반영: 2026-07-20 (CRDT/WebGPU/다중 서버 adapter/절차적 360° 환경과 3D 후속 감사)
- 감사 범위: 첨부 요구사항, 최근 대화 요청, 상용 드로잉·웹툰·3D·협업 제품의 공식 기능
- 판정 원칙: UI가 보이는 것만으로 완료로 세지 않고, 실행 경로·저장/복원·권한·오류 처리·테스트까지 연결되어야 완료로 판정한다.

## 결론

첨부 요구사항의 모든 기능이 구현된 상태는 아니다. 현재 제품은 다음 영역에서 강한 실사용 기반을 갖는다.

- 세로 웹툰 페이지·패널·말풍선·대사 자동 배치
- 압력·기울기·배럴 회전을 반영하는 브라우저 드로잉
- 패턴·스크린톤·고급 채우기·색 보정·PSD 레이어 입출력
- 플랫폼별 긴 웹툰 분할 출력과 모바일 스크롤 미리보기
- AI 세계관·시나리오·구도·대사·번역·팔레트 보조
- reference image와 캐릭터 바이블을 사용한 장면 연속성 보조
- VRM 포즈·표정·손가락·조명·spring bone·웹캠 추적
- GLB 2.0 기반 3D 배경, 카메라·조명·객체 변형, 절차적 360° 환경, 컬러/톤/선화 분리 삽입
- 서버 팀 역할·초대·활동 이력·revision 충돌 방지·복원과 Yjs 기반 동시 편집 vertical slice
- 실제 pressure stroke를 표시하는 retained WebGPU live-draft compositor와 Canvas2D/Konva 안전 폴백

다음 영역은 아직 부분 구현이거나 제품 실행 경로에 연결되지 않았다.

- 의미 영역 분할과 색 힌트를 사용하는 AI 자동 채색
- 인증 Socket.IO 세션을 팀 패널 밖에서도 유지하는 항상 켜진 Studio live room
- 캔버스 원격 커서, 선택 영역, 실제 편집 mutation을 막는 서버 권위 잠금
- 파괴적 raster tile 편집까지 포함하는 완전한 pixel CRDT와 모든 도구의 CRDT 변환
- 움직이는 배경·인물의 transform tween, parallax, 본/카메라 트랙
- Konva의 committed scene/readback까지 대체하는 전면 WebGPU authority
- VRM/3D 모델 전체 라이브러리의 사전 생성 썸네일
- AI 텍스트/이미지→3D mesh 생성·repair·리깅
- Clip Studio Paint 3D의 mesh surface snap, 외부 파노라마/UV 저작, BVH·texture painting
- 표준 3D 형식별 실파일 release corpus 완결과 검증된 KTX2의 runtime renderer 연결
- Google Drive·Dropbox·Notion 같은 외부 클라우드 연동
- Firefly·D5·Artbreeder 등 특정 상용 서비스의 직접 API·라이선스 보증

## 판정 기호

- `완료`: 제품 UI부터 실행·저장/복원·오류 경계까지 연결됨
- `부분`: 유의미한 구현은 있으나 벤치마크 제품과 동등하다고 볼 수 없음
- `기반`: 독립 코어나 서버가 있으나 실제 Studio 작업 흐름에 아직 연결되지 않음
- `미구현`: 실행 가능한 제품 코드가 없음
- `외부 필요`: 브라우저만으로 끝나지 않고 서버·모델·OAuth·라이선스가 필요함

## 1. 웹툰 제작·드로잉

| 기능 | 판정 | 현재 범위와 남은 차이 |
| --- | --- | --- |
| 패널·컷 템플릿 | 완료 | 프레임과 말풍선을 함께 구성하는 패널 레이아웃, 세로 3~6컷 템플릿 제공 |
| 대사 스크립트→말풍선 | 완료 | `이름: 대사`와 지문을 파싱해 좌우·세로 배치 |
| 말풍선·효과음·배경 소재 | 부분 | 다양한 내장 소재와 편집은 있으나 Clip Studio Assets/Canva 규모의 온라인 생태계는 아님 |
| 압력·기울기·twist | 완료 | PointerEvent pressure, tiltX/Y, twist, coalesced event 사용 |
| Procreate/Krita/MediBang식 브러시 | 부분 | G펜·마커·붓·수채·연필·톤, 표준/속도 적응/정밀 추적 안정화, 독립 후보정·각점 보존, 실제 시간 기반 속도 필압, QuickShape, 대칭, 원근 보조 제공. 브러시 팁 저작·센서→속성 다이내믹·고급 혼색은 격차 |
| Photopea/Photoshop식 보정 | 부분 | 커브·레벨·색상 균형·채널 믹서·Selective HSL·그라디언트 맵·마스크·클리핑 제공. 스마트 오브젝트/스마트 필터·완전한 조정 레이어는 미완성 |
| PSD 왕복 | 부분 | 레이어 입출력은 되지만 텍스트·조정 레이어·스마트 오브젝트의 완전한 편집성은 보존하지 못함 |
| 긴 세로 원고·플랫폼 분할 | 완료 | 네이버·WEBTOON Canvas·카카오·레진·SNS 프리셋과 순차 다운로드 |
| 모바일 세로 스크롤 미리보기 | 완료 | 독립 스크롤, 폭 선택, 현재 페이지 이동 |
| 사용자 매크로·전용 컨트롤러 | 미구현 | 단축키는 있으나 Stream Deck/TourBox 프로필, 매크로 녹화 API는 없음 |

상세 근거는 [웹 드로잉 벤치마크](./studio-web-drawing-benchmark-2026-07-12.md)와 [경쟁 기능 목록](./studio-competitor-features.md)에 유지한다.

## 2. AI 제작 기능

| 기능 | 판정 | 현재 범위와 안전 경계 |
| --- | --- | --- |
| Z.ai↔DeepSeek 잔액 부족 전환 | 완료·텍스트 전용 | 문서화된 잔액/패키지 소진 또는 HTTP 402만 안전한 failover로 분류. 일반 429·네트워크 실패는 이중 과금 위험 때문에 무조건 재호출하지 않음 |
| 세계관·시놉시스·콘티 | 완료/강한 부분 | Writer Room, 캐릭터 바이블, 장면 분할, 구도·대사·번역·팔레트 제공 |
| 한 프롬프트→2~10 세로 장면 | 부분 | 장면 JSON, 대사, 세로 배치, reference image 흐름 제공. 생성 결과 검토·승인을 거침 |
| 캐릭터 일관성 | 부분 | 캐릭터 바이블 고정 필드와 이전 컷 reference image 사용. LoRA/IP-Adapter 수준 동일 인물 보장은 아님 |
| BYOK 이미지 생성·편집 | 부분 | OpenAI 호환 Images API와 CORS/응답 형식을 지원하는 공급자에서 사용 가능 |
| 서버 AI 에셋 생성 | 부분·외부 필요 | 기능 플래그와 서버 이미지 모델 키가 있을 때 생성→저장→삽입. 텍스트 전용 Z.ai/DeepSeek를 이미지 모델로 오표시하지 않음 |
| AI 자동 채색 | 부분 | 선택 이미지 전체를 one-shot edit하는 흐름. 색 힌트 scribble·semantic mask·영역별 재채색은 없음 |
| AI 표정·동작·3D 포즈 추천 | 미구현 | 정적 프리셋은 있으나 대사 의미를 3D pose/expression으로 추천·적용하는 실행 경로 없음 |
| AI 3D mesh 생성 | 미구현·외부 필요 | Hunyuan3D/TRELLIS/TripoSR/Meshy/Rodin 계열 추론·mesh repair·리깅 파이프라인 없음 |
| Firefly 상업 안전 보증 | 미구현·라이선스 필요 | Adobe credential·Content Credentials·정책 연동 없이 같은 보증을 주장할 수 없음 |

API 키는 저장소·브라우저 번들·문서에 넣지 않는다. 대화에 노출된 키는 폐기·재발급하고 서버 환경변수로만 주입해야 한다.

## 3. 팀·실시간 협업

### 완료된 서버 협업 기반

- owner/admin/editor/commenter/viewer 역할과 capability ACL
- 초대 수락/거절, 멤버 역할 변경, append-only 활동 이력
- 공유 문서 GET/PATCH, `baseRevision` 충돌 감지, revision snapshot·복원
- 팀 작품 목록과 모바일 독립 스크롤

### 이번 체크포인트의 로컬 실시간 기반

- 같은 출처 탭 전용 `BroadcastChannel` transport
- strict envelope, 작품 범위·크기·시각·순번·target 검증
- 탭 presence와 active/idle, 정규화 커서 코어, lease soft-lock 코어
- 사용자가 직접 누를 때만 시작하는 Screen Capture API
- 오디오를 요청하지 않는 WebRTC 화면 스트림
- 시청 요청별 호스트 승인/거절, 승인 전 offer·영상 track 전송 금지
- 승인 대기 8건·동시 시청자 4명 상한과 호스트의 개별 시청 종료
- offer 전 ICE queue, 동시 캡처 generation guard, 늦은 참가자 presence 응답·공유 재안내
- SDP/ICE 메모리 전용 signaling과 종료 시 track/peer cleanup
- 로컬 모드를 `인터넷 팀 접속`으로 오표시하지 않는 제품 UI

### 이번 체크포인트의 Socket.IO 서버 코어

- `/studio-live` namespace, 작품 ACL join, presence snapshot/update/leave
- 정규화 커서 relay, editor 전용 5~30초 lease soft-lock
- 화면 공유 announce/request/access/stop과 `shareId`를 보존하는 대상 지정 offer/answer/ICE/bye relay
- Socket.IO namespace middleware에서 연결 허용 전에 세션 인증 완료
- 세션 principal의 만료·sessionVersion 재검증과 권한 회수 cleanup
- presence·cursor·lock·화면 상태 변경과 대상 relay 직전에 최신 participant·principal·권한 세대를 다시
  확인하고, 같은 이벤트 루프 틱에서 변경/전송해 권한 하향 중 `await` 경합을 차단
- SDP·ICE 문자열은 원문 UTF-8과 JSON escape 본문 크기를 각각 제한하고, SDP의 CR/LF 외 제어 문자를
  거부하며 잘못된 signal도 rate-limit 예산을 먼저 소비
- 첫 ICE는 양 peer를 강제 재검증하고, 같은 작품·`shareId`·peer pair에만 고정 2초 동안 결과를 재사용한다.
  candidate 전송으로 만료가 연장되지 않으며 재검증 시작·거절·종료·재참가·연결 해제·권한 회수 시 폐기
- 작품 전환 중 지연 ACL 결과가 다른 작품 권한으로 사용되지 않도록 participant generation 확인
- 팀 ACL/adapter room join·leave 도중 세션이 만료되면 speculative room leave 완료를 기다리지 않고 즉시
  participant·principal을 정리하고 transport를 끊는 fail-closed 참가 처리
- 허용되지 않은 WebSocket `Origin`의 upgrade를 `allowRequest`에서 거부
- 로컬 Vite `/socket.io` WebSocket proxy

### 이번 체크포인트의 인증 프런트엔드 연결

- 로그인 토큰을 Socket.IO handshake 메모리에만 넣고 `/studio-live` 작품 방 ACL ACK 전에는 준비 상태로
  전환하지 않는 same-origin WebSocket adapter
- 서버 connection ID와 브라우저 탭 session ID를 분리해 자기 자신이 원격 참가자로 중복 표시되지 않는
  participant identity 변환
- presence·cursor·서버 권위 lease lock·화면 공유·WebRTC 이벤트를 strict local envelope로 변환
- 서버가 발급한 lease ID를 받은 뒤에만 잠금을 확정하며, reconnect 이전 ACK는 generation과 connection
  identity가 다르면 폐기
- 연결 끊김·재접속·권한 회수 상태를 팀 패널에 표시하고, 실패 시 **팀 서버 다시 연결** 또는 명시적인
  **로컬 탭 모드**를 선택하는 44px 모바일 복구 조작 제공
- 공유 중 서버가 복구되면 같은 `shareId`를 재안내하되 캡처를 다시 요청하지 않고, 재안내 실패가 연결 완료
  메시지에 덮이지 않도록 dispatch 다음 microtask에서 보고. terminal 권한 회수는 진행 중 picker/승인 세대까지
  즉시 무효화해 기존 track·peer·busy 상태와 늦은 오류를 함께 정리
- 작품 ACL 조회 도중 세션이 만료되는 경계와 ACL 회수 후 adapter room 이탈 지연을 fail-closed disconnect로
  차단

실제 두 Socket.IO 클라이언트 E2E에서 즉시 인증 참가, 참가자 2명 snapshot, 커서 전달, 잠금 경쟁 거부, 화면 상태, 대상 signaling, 잠금 해제, 내부 DB user ID 비노출을 검증했다. 임의 Origin의 upgrade도 거부됐다.

인증 프런트엔드 연결 후에는 실제 Studio를 같은 계정·작품의 브라우저 탭 두 개로 열어 양쪽 모두
`팀 서버 연결`, `나 포함 2개 작업 탭`, `다른 탭 1개`로 수렴하는 것을 확인했다. Nest 프로세스를 중단했다가
복구했을 때 재접속과 작품 ACL 재참가 뒤 두 탭이 자동 복원됐다. 별도 runtime client 검사에서는
announce→request→approved→SDP가 같은 `shareId`를 보존했고, `shareId` 없는 signal은 `invalid_payload`로
거절됐다. 마지막 보안 보강 뒤에도 별도 두 소켓 runtime 검사에서 announce→request→approved→offer→ICE가
모두 성공했고 누락 `shareId`는 계속 strict 거절됐으며, 임시 QA 작품은 검사 직후 삭제해 잔여 0건을 확인했다.
375×812에서 팀 패널 하단 `700px`, 모바일 도크 상단 `700.40625px`, 겹침 `0px`이며 공유 조작은 44px 높이를
유지했다.

### 아직 완료가 아닌 부분

| 기능 | 판정 | 이유 |
| --- | --- | --- |
| Studio UI↔Socket.IO adapter | 완료(팀 패널 범위) | 인증 join·재접속·권한 회수·event 변환·명시적 로컬 fallback까지 연결. 현재 room 수명은 팀 패널 마운트에 종속 |
| 원격 커서 overlay | 기반 | room 코어는 있으나 Konva Stage에 렌더하지 않음 |
| 실제 mutation 잠금 | 기반 | soft-lock 상태가 HTTP 공유 문서 저장이나 요소 편집 guard를 강제하지 않음 |
| operation stream/CRDT | 부분·제품 연결 | Yjs stroke·scene reference·page·layer group·삭제/복구 operation과 PostgreSQL update/snapshot, sequence-gap repair를 연결. 파괴적 pixel rewrite는 아직 tile operation이 아님 |
| 서버 앵커 댓글 | 미구현 | 현재 Studio 댓글은 문서 포함 local-first 데이터 |
| 인터넷 WebRTC 안정성 | 외부 필요 | STUN/TURN 단기 자격 증명과 운영 장기 실행 Socket.IO 호스트가 필요 |
| 다중 API 인스턴스 | 부분·배포 설정 필요 | 장기 실행 Nest에서 PostgreSQL Socket.IO adapter와 DB 기반 lease/CRDT durability를 사용 가능. direct PostgreSQL URL·migration이 필요하며 cluster-wide admission budget은 아직 process-local |
| 음성·영상 회의·채팅 | 미구현 | 화면 영상만 범위에 포함하고 오디오는 의도적으로 제외 |

현재 Vercel serverless 함수는 장기 WebSocket 업그레이드 서버가 아니다. 운영 실시간 협업은 OCI 등 장기 실행 Nest 서버 또는 별도 realtime 서비스와 리버스 프록시가 필요하다.

## 4. 움직이는 웹툰

| 기능 | 판정 | 현재 범위 |
| --- | --- | --- |
| 다중 레이어 타임라인 | 부분 | 페이지별 트랙·held frame·재생·onion skin 제공 |
| transform tween·easing | 미구현 | 현재 프레임 데이터는 이미지 교체 중심이며 위치·회전·스케일 보간 없음 |
| 본·VRM motion track | 미구현 | 포저의 숨쉬기·깜빡임·spring bone 미리보기는 최종 정적 PNG 삽입으로 끝남 |
| 스크롤 등장·강조·파티클 | 부분/완료 | IntersectionObserver·Web Animations·비/눈/벚꽃·BGM/SFX 제공 |
| 실제 배경 parallax | 미구현 | 레이어 depth, camera 이동, loop/tween 저작과 독자 뷰어 재생 없음 |
| WebM 출력 | 부분 | canvas captureStream + MediaRecorder. 일부 오디오/overlay 합성 제한을 UI에 고지 |

## 5. VRM 캐릭터·소품

| 기능 | 판정 | 현재 범위 |
| --- | --- | --- |
| VRM 0/1·pose·finger·expression | 완료/강한 부분 | humanoid pose, 손가락, look-at, 재질, 조명, spring bone 제공 |
| 연령·성별 표현·직업 recipe | 부분 | 고령·청년·여성·남성·중성 표현과 의료진 시작 recipe 제공 |
| 소품 결합 | 부분 | rigid follower, geometry anchor, 보조 손 two-bone IK. collision·penetration·물리 grasp는 없음 |
| Avatar Forge | 부분 | 기존 VRM 리그 보존형 비파괴 조형. 새 mesh/texture/rig/VRM export를 만드는 VRoid Studio 대체가 아님 |
| 번들 캐릭터 썸네일 | 부분 | 활성 모델 썸네일은 생성하지만 미방문 모델은 기본 아이콘이며 전체 poster coverage가 없음 |
| AI 캐릭터/VRM 생성 | 미구현·외부 필요 | mesh 생성, topology repair, rigging, blendshape, VRM export 파이프라인 필요 |

## 6. Clip Studio Paint 3D 공식 기능 비교

비교 기준은 CELSYS의 [3D 기능 사용법](https://help.clip-studio.com/ko-kr/manual_kr/660_3d/660_3d.htm), [3D 데이터 종류](https://help.clip-studio.com/ko-kr/manual_kr/660_3d/3D_%EB%8D%B0%EC%9D%B4%ED%84%B0_%EC%A2%85%EB%A5%98.htm), [3D 파일 가져오기](https://help.clip-studio.com/ko-kr/manual_kr/660_3d/3D_%ED%8C%8C%EC%9D%BC_%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0.htm)다.

| Clip Studio 3D 기능군 | ToonSpectrum | 구현 가능성/격차 |
| --- | --- | --- |
| GLB/glTF/OBJ/FBX 등 import | 부분/강한 부분 | GLB, glTF, OBJ/MTL, FBX, DAE, STL, PLY, 3DS와 연결 리소스를 로컬에서 해석해 self-contained GLB 2.0으로 정규화하는 로더 경로는 구현됐다. 다만 일부 형식은 실제 저작 도구·버전·텍스처 조합을 포함한 release corpus가 아직 미완이므로 모든 변형의 지원 완료로 판정하지 않는다 |
| KTX2/Basis texture | 검증 완료/렌더 미연결 | validation Worker의 구조·예산 검사, pinned Basis transcoder attestation과 실제 mip pretranscode release gate는 연결됐다. 그러나 Three runtime GLTFLoader에는 아직 `KTX2Loader`가 연결되지 않아 검증 통과가 곧 viewport 렌더 지원을 뜻하지 않는다 |
| VRM 0/1 | 완료/강한 부분 | 별도 VRM 포저 제공 |
| CSP 전용 cs3c/cs3o/cs3s | 미구현 | 공개 사양·라이선스 없이는 동일 호환을 보장할 수 없음 |
| 객체 이동·회전·크기 | 완료 | TransformControls·수치 입력·undo/redo |
| camera orbit/pan/zoom/FOV/preset | 완료 | perspective·orthographic, FOV, preset, focus selected와 All Sides View 제공 |
| 다중 선택·part 선택 | 완료/부분 | 객체 다중 선택·함께 변형 제공. GLB 내부 mesh part 직접 선택은 없음 |
| 표시/잠금·부모 자식 hierarchy | 완료/강한 부분 | `parentId`를 재귀 runtime scene graph로 해석하고 부모 변경 시 기존 world transform을 보존하는 local TRS를 계산한다. 비균일 scale 조합이 shear를 만들거나 부모 행렬이 singular이면 문서를 변형하지 않고 오류로 fail closed한다 |
| 접지·이동/회전/object snap | 완료 | 바닥 접지와 이동·회전 step snap 제공. mesh surface snap은 후속 |
| 선택 대상 focus | 완료 | 선택 bounds 중심 focus 제공 |
| 광원·그림자·안개 | 완료 | ambient/key/fill directional light, shadow, 거리 안개 색·시작·완전 혼합 거리 제공 |
| 기본 도형·복합 배경 템플릿 | 완료/부분 | 블록아웃과 웹툰용 장면 템플릿 제공 |
| texture/UV/normal map | 미구현 | 사용자 texture upload와 UV/normal authoring 없음 |
| 3D에 직접 그리기 | 미구현 | texture/projective painting 없음 |
| 두상·체형·포즈·손가락 | 부분/강한 부분 | VRM 조형·pose는 강하지만 CSP 데생 인형/두상 모델과 동형은 아님 |
| BVH pose sequence | 미구현 | BVH import·frame range 없음 |
| panorama/360° | 부분 | URL 없는 절차적 낮·노을·밤 equirectangular 환경과 수평 회전, 불투명 LT 캡처를 제공. 사용자 이미지 import·fisheye/UV 저작은 없음 |
| 사면도 | 완료 | perspective/정면/측면/상단 View와 모바일 단일뷰 전환 제공 |
| LT 선화·톤 분리 | 완료/부분 | 컬러·톤·텍스처 선·주선을 별도 raster PNG로 삽입. 진짜 vector LT는 아님 |
| 재사용 3D 소재 생태계 | 부분 | 로컬 scene/model library는 있으나 CSP Assets식 권리·태그·공유 생태계는 아님 |

표준 포맷의 release corpus 확대, KTX2 runtime renderer 연결, snapping, panorama, texture painting, BVH는 브라우저로 구현할 수 있다. 다중 선택과 재귀 hierarchy, orthographic/four-view는 이미 제품 경로에 연결됐다. Blender 수준 modeling/sculpting/UV/rigging도 기술적으로 불가능한 것은 아니지만 별도 DCC 제품 규모이며, 웹툰 제작 시간을 줄이는 순서로 나누어야 한다.

3D 구현·테스트 상세는 [3D 상용 기능 벤치마크](./studio-3d-commercial-benchmark-2026-07-12.md)를 따른다.

## 7. WebGL·WebGPU·Babylon.js

- 3D 배경과 VRM은 Three.js + React Three Fiber의 WebGL 제품 경로다.
- WebGPU retained live-draft compositor는 pressure normal/erase dab, viewport tile cache, device-loss 복구와
  Canvas2D fallback까지 제품 경로에 연결됐다. 다만 committed Konva scene과 모든 readback의 최종 authority는
  pixel parity가 충족될 때까지 이전하지 않는다.
- Babylon.js 병행 도입은 VRM의 Three 생태계를 제거하지 못하면서 별도 엔진 비용을 만든다.
- WebGPU는 Babylon에 종속되지 않는다. Three WebGPU renderer를 격리된 대표 장면에서 WebGL fallback과 비교하는 편이 현재 구조에 맞다.
- 결정과 번들 측정은 [Babylon.js 도입 평가](./studio-babylonjs-adoption-evaluation-2026-07-11.md)에 기록한다.

## 8. 브라우저로 가능한 범위와 외부 의존성

### 브라우저와 현재 서버로 구현 가능

- Socket.IO presence·remote cursor·soft-lock
- 사용자 동의 기반 Screen Capture API·WebRTC
- GLB/glTF/OBJ/FBX import와 scene hierarchy
- orthographic camera, four-view, panorama, snapping
- texture painting, BVH playback, transform/camera timeline
- WebGPU live-draft renderer + Canvas2D/Konva fallback의 점진적 확대
- parallax·레이어 animation·VRM motion clip

### 별도 인프라가 사실상 필요한 영역

- semantic segmentation 자동 채색 모델
- LoRA/IP-Adapter급 캐릭터 일관성
- 고품질 AI 3D mesh 생성·repair·rigging
- 인터넷 WebRTC TURN relay
- cluster-wide CRDT admission budget·운영 지연 기반 adaptive throttling
- Google Drive·Dropbox·Notion OAuth
- Firefly·D5·Artbreeder 등 특정 상용 API

### 그대로 보장할 수 없는 요구

- 사용자 동의 없이 자동 화면 공유 시작
- 비공개 CSP 형식과 유료 Assets의 무허가 복제
- 범용 생성 모델 결과에 Adobe Firefly와 같은 상업 안전성 자동 보증
- reference image edit만으로 동일 캐릭터 100% 보장
- Photoshop·Blender·Clip Studio의 모든 기능을 하나의 완료 항목으로 취급

## 9. 다음 구현 우선순위

1. 캔버스 원격 커서 overlay와 follow viewport
2. 서버 lease ack를 실제 selection/drag/text mutation guard에 연결
3. 파괴적 raster 도구의 chunked tile operation과 cluster-wide adaptive admission
4. deployment-owned TURN 단기 credential과 운영 장기 실행 realtime host
5. VRM·3D 모델 전체 poster thumbnail 사전 생성
6. 색 힌트 scribble + semantic mask 기반 AI 자동 채색
7. transform tween·parallax·camera/VRM motion track 기반 동적 웹툰
8. 3D mesh surface snap, KTX2 runtime renderer, 외부 panorama/UV·BVH·texture painting
9. WebGPU analytic segment parity와 GPU-aware readback composition
10. 실기기·실제 다중 서버/다중 사용자 장시간 soak 및 장애 복구 검증

이 문서는 기능을 많이 보이게 만드는 목록이 아니라, 완료를 과장하지 않고 다음 상용화 순서를 고정하는 제품 계약으로 유지한다.
