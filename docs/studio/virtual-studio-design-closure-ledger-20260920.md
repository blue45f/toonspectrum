# 원설계 VS-01–30 구현 근거와 남은 완료 경로

> **Historical status notice (2026-09-24):** This ledger records the implementation state audited on 2026-09-20. Later main-branch work closed the product-code gaps. Use [Virtual Studio and all-pages spatial experience — product-code closure](virtual-studio-all-pages-closure-20260924.md) for the current closure matrix and keep physical-device, WAN, long-session, and production-rollout certification separate.


상태: **current 작업트리 감사 / migration 연결 작업 / target 잔여 구분**. 2026-09-20에 원 공유 대화의 [30개 요구](virtual-studio-original-backlog-20260920.md)를 THIRD와 WORLD의 실제 source/tests에 대조했다. THIRD 기준은 `fb5d225f8aa6473daab71ccc7cf3a72b44e91750`, WORLD 게시 클라이언트 기준은 `0f3bfa6b8bcbebd488c72fa62cfd9b1c69dac245`, 서버 대화 동의/heartbeat 기준은 `0cc0a2a86fe719b9f6509c5ca239cfcd858d8024`다. 후속 승인 검수본 ZIP의 로컬 검증은 R7, 실제 저작 후 Host 저장·캡처 검증은 갱신한 R4에 별도 표시한다. 이 문서는 main 병합, 필수 CI, 운영 배포 또는 30개 전체 완료 증명이 아니다.

**구현**은 표에 적힌 사용자 동작과 권한 경계를 갖춘 좁은 기능을 뜻한다. **부분**은 실제 진입점이 있지만 원문 완료 조건의 연결이 남았다는 뜻이다. **미구현**은 조사한 Virtual Studio 흐름에 해당 사용자 완료 경로가 없다는 뜻이며, 다른 도메인의 유사 도구까지 없다고 단정하지 않는다. 버튼·목적지 링크·상태 라벨만으로 완료를 판정하지 않았다.

## 근거 읽는 법

아래의 `R1`–`R7`, `W1`, `S`는 이번 감사에서 구분한 증거 수준이다. 과거 실행 결과를 이번 HEAD에서 다시 실행한 결과로 바꾸어 적지 않는다.

| 표시 | 실제 확인한 증거 | 증명하지 않는 것 |
| --- | --- | --- |
| R1 | `.qa/virtual-studio-review-editor-handoff/report.json`: 실제 HandoffMount/권한·projection·selection adapter/HTTP parser, 6개 desktop·390px 시나리오 PASS. dirty/revoked/실패한 page 이동/늦은 응답은 selection 0. | 문서는 합성 fixture. 전체 Host 또는 운영 인증·저장이 아님. |
| R2 | `.qa/virtual-studio-review-production/report.json`: 실제 연결 폼/controller/client, 10개 시나리오 PASS. 역할 명시 선택, 교체 동의, CAS 충돌, 응답 유실, actor 변경, 갱신 중 키보드 focus/만료 검사. | review/team/workspace HTTP는 합성. 실제 후속 담당자가 인계받은 증거는 아님. |
| R3 | `.qa/virtual-studio-review-resolution/report.json`: 실제 완료 dialog→identity URL→Panel→두 preview/겹쳐 보기→명시 resolve, 11개 시나리오 PASS. 422의 legacy fallback 0, 불명확 POST의 재확인은 읽기만 수행. | 합성 완료 응답·PNG·HTTP. 실제 편집→저장→전체 producer→재검토가 한 번에 연결된 E2E는 아님. |
| R4 | `.qa/virtual-studio-review-host-authored-final/report.json`: 실제 로그인/DB/Core/Host에서 2페이지 6획 저작→공동 저장 PATCH 1회(revision 1→2, server sequence 203)→캡처 PASS. 1440×2160 원본 2장, 각 획 8/8 좌표 샘플 일치. producer HTTP만 fixture. | 운영 object storage, 모든 브러시·텍스트·3D의 픽셀 동등성 인증, 변경 후 재제출 전체 경로는 아님. 기존 빈 페이지 QA의 공동 저장 미검증 범위를 보완함. |
| R5 | `.qa/virtual-studio-review-workflow/report.json`: 실제 React/이미지 decode/parser, 고정 검수 UI fixture PASS. 관련 source map/주석/assignment/review mutation/attestation의 unit·실제 PG 테스트가 존재하고 실행 근거는 각 구현 문서에 보존됨. | 모든 테스트를 이번 감사에서 재실행한 것은 아님. PG 관계 검증과 browser fixture를 운영 통합 E2E로 합치지 않음. |
| R6 | 저장소의 `verify-virtual-studio-drawn-art.mjs`, `verify-virtual-studio-ambient-audio.mjs`, `validate-virtual-studio-runtime.mjs` 및 대응 character/NPC/slot/appearance tests. 기존 품질 실행 기록과 실제 source를 확인. | 새로운 조용한 환경 성능 측정, 모든 장치·WAN·20인 검증은 아님. |
| R7 | `.qa/virtual-studio-review-export/report.json`: 실제 저장 UI/parser/WebCrypto/ZIP worker/다운로드, desktop·390px 원본 bytes 보존 및 손상·회수·취소·계정 변경 차단, 6개 시나리오 PASS. 4 suites 51 tests, 필수 CI 계약 8 tests 및 Web tsc/lint PASS. | 승인·preview HTTP/PNG는 합성. 운영 private storage CORS·실제 API 통합, graph approved revision 또는 공개 Release가 아님. |
| W1 | WORLD `.qa/virtual-studio-world-publication/report.json`: 실제 Experience/Phaser/게시 UI와 decode, 7개 1280·390px 시나리오 PASS. 게시·이전본 새 게시·동일 read 유지·asset 실패·persisted base·CAS·actor fence. 11 suites 143 tests, Web tsc/lint의 기존 실행 기록도 있음. | actor/world/team HTTP는 합성. 다른 클라이언트 동시 채택, 운영 게시, 외부 URL bytes 불변을 증명하지 않음. |
| S | 아래 링크한 source와 인접 회귀 테스트를 읽어 현재 계약을 확인. 이번 감사에서 해당 suite를 새로 실행하지 않음. | 파일·테스트 존재 자체를 실행 성공이나 제품 흐름 완료로 취급하지 않음. |

이번 감사에서 별도로 실행한 것은 WORLD conversation service/schema **2 suites 7 tests PASS**다. 서버 담당자의 최종 실제 PG 53개 + service 4개 보고와는 별도다. immutable consent revision과 ephemeral lease revision 분리, terminal invalidation hint, fresh participant 최소 만료 시간 제한을 source로 재검토했다. 마지막 차단 보완도 source/회귀를 읽었다. 차단자의 현재 방문 epoch와 서버에서 확인한 상대 actor로 제한하므로 상대의 재연결·다른 탭은 우회하지 못하고, 차단자의 새 방문에서는 새 동의가 필요하다. 이것은 계정 전체의 영구 차단 계약은 아니다.

## 검수와 제작 연결: VS-01–09

| ID / 판정 | 실제 사용자 진입점 | 저장 결과와 권한 source | 검증 / 원문 완료 지점까지 남은 것 |
| --- | --- | --- | --- |
| **VS-01 부분** 공동 작업 세션 | 공간의 사람 카드→대화·검수 초대, `StudioVirtualSpaceConversationPanel`, 고정 검수 Picker. | 공개 공간의 authenticated direct consent가 정확한 roster/ID를 공유한다. 검수는 서버 `reviewId/revisionId/rootGraphHash`, 제작 연결은 별도 CAS JSON이다. | S, R2·R3. 목적·ScopeRef·고정 입력본·참가자·종료 결과를 하나의 **저장된 작업 세션**으로 연결한 레코드/완료 UI는 아직 없다. 미디어 conversation과 제작 작업을 같은 권위라고 표시하면 안 된다. |
| **VS-02 부분** 함께 보기 | 기존 Studio 팀/실시간 협업 UI의 따라가기·중지; 공간 카드의 동의 기반 이동 따라가기. | `StudioLiveCanvasOverlay`는 선택한 peer의 page를 `onFollowPage`로 전달하고, 공간 follow는 별도 로컬 이동 제어다. 둘 다 편집 권한을 주지 않는다. | S: live following/overlay 및 공간 hook tests. opt-in·중지는 구현되어 있으나 **고정 검수 버전의 진행자 view/컷/viewport**가 같은 session으로 동기화되는 완료 경로는 확인되지 않았다. 아바타 follow를 원고 follow로 계산하지 않는다. |
| **VS-03 부분** 회차 콘티 벽 | 콘티 소품→기존 comic route; 편집기의 `StudioStoryboardGridPanel`. | 기존 page/컷 및 3D storyboard 명령·undo 경로를 사용한다. 소품 자체는 새 원고 저장소가 아니다. | S. 현재 원고의 grid/선택 도구는 있으나 공간에서 **회차 컷 순서·대사·원고를 고정 버전으로 공유하고 변경을 합의 후 기존 명령에 적용**하는 벽은 남아 있다. |
| **VS-04 부분** 버전 비교 검토 | 검수 Panel의 비교본 선택/양쪽 페이지/겹쳐 보기, 수정 capture 완료→원 의견으로 돌아가기. | 서버 saved `sourceSnapshot`에서 page/frame/element ID·치수를 도출한다. `anchor.source`와 graph `ScopeRef.panelId`는 구별한다. 새 submission parent와 old/new capture receipt를 서버가 검증한다. | R1·R3·R4·R5. 실제 두 preview와 명시 해결은 구현. legacy mapping 불가 시 전체 의견만 허용한다. **실제 컷 수정부터 새 저장·캡처·재검토까지 하나의 실제 API 흐름**은 분리된 증거를 잇는 검증이 남았다. |
| **VS-05 부분** 수정 요청 작업화 | 저장된 의견의 담당자/기한/필수도와 ‘제작 작업 연결’. 기존 task·handoff·role assignment를 선택. | 실제 comment user ID→기존 roleAssignment ID를 명시 대응. 서버가 work/review/comment/revision/hash와 scope·현재 역할을 검사하고 최신 workspace의 한 task만 CAS 저장한다. `acceptanceCriteria`는 기존 handoff에 남긴다. | R2 + 서버 관계/경합 tests. 저장·재시도·교체는 구현. **의견 해결·새 재검토 결과를 연결 작업의 완료 기준 검토로 이어 주는 화면/단계 전환**은 아직 별개다. 연결 자체가 작업 완료나 승인이 아니다. |
| **VS-06 부분** 결정 노트 | 고정 검수 `StudioPinnedReviewWorkflow`의 변경 요청/승인, 과거 검수 기록. | graph review에 결정자·상태·고정 revision이 저장된다. fresh reviewer/manager 권한과 필수 의견 상태가 결정 권위다. | R5 + review mutation tests. 검수 결정은 구현. 세션 중 일반 결정/이유/AI 제안의 채택 이력을 묶는 독립 노트는 없다. **review approved**, artifact의 **approvedRevision**, 공개 **Release**는 서로 다르다. |
| **VS-07 부분** 인수인계 봉투 | Production 운영 패널의 인계 브리프 생성/상태 변경, 의견→기존 handoff 연결. | `ProductionHandoffBrief`의 목적·필수 연출·연속성·완료 기준을 서버 workspace JSON/CAS로 저장한다. 현재 `createdBy/assignedTo`는 텍스트이고 status는 편집 가능한 값이다. | S, R2. 입력/산출물의 정확한 revision·사용 조건·남은 의견을 봉투에 고정하고 **실제 수신자 역할로 인수 확인**하는 권위 있는 전달 경로가 남았다. `accepted` 라벨 선택을 실제 인수 증거로 세지 않는다. |
| **VS-08 부분** 비동기 검토함 | Production Review Board, 역할 task inbox, 저장된 검수/의견 목록. | review/comment와 workspace는 서버에 보존된다. `rankCreatorRoleTasks`는 역할·기한·담당 기준으로 workspace tasks를 투영한다. | S. 비동기 목록은 있다. 요청의 **발송 대기/발송/수신/읽음/결정**을 구분하는 durable delivery/ack는 확인되지 않았다. P2P 초대 기록이나 task 상태가 그 증거를 대신하지 않는다. |
| **VS-09 미구현** 짧은 설명 기록 | 현 검수에는 텍스트 의견과 실시간 Huddle가 있다. | 검수본에 묶인 명시적 설명 녹음·업로드·공유·삭제/보존 계약이 없다. | S 범위 조사. 주변 promo recording/audio 도구와 공간 환경음은 이 요구의 구현이 아니다. 상시 녹음을 추가하거나 현재 통화를 녹음 중이라고 표시해서는 안 된다. |

주요 직접 source:

- [고정 검수 Panel](../../apps/web/src/domains/creator/virtual-space/StudioPinnedReviewPanel.tsx), [비교](../../apps/web/src/domains/creator/virtual-space/StudioPinnedReviewComparison.tsx), [공간 주석](../../apps/web/src/domains/creator/virtual-space/StudioReviewSpatialAnnotation.tsx), [결정](../../apps/web/src/domains/creator/virtual-space/StudioPinnedReviewWorkflow.tsx).
- [editor handoff controller](../../apps/web/src/domains/creator/review-handoff/studio-review-editor-handoff.ts), [production 연결 모델](../../apps/web/src/domains/creator/review-production/studio-review-production-model.ts), [production authority](../../apps/web/src/domains/creator/review-production/studio-review-production-authority.ts), [수정본 해결 UI](../../apps/web/src/domains/creator/review-resolution/StudioReviewResolution.tsx).
- [source mapping 계약](../../packages/studio-project-model/src/graph/review-source-map.ts), [capture attestation](../../apps/api/src/modules/studio-project-graph/studio-review-capture-attestation.ts), [review repository](../../apps/api/src/modules/studio-project-graph/studio-project-graph.repository.ts).
- [Production workspace](../../apps/web/src/domains/creator/studio-production/studio-production-workspace-runtime.ts), [인계 운영 UI](../../apps/web/src/domains/creator/studio-production/StudioProductionOperationsPanel.tsx), [역할 inbox 투영](../../apps/web/src/domains/creator/studio-production/creator-role-task-inbox.ts), [함께 보기](../../apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx), [콘티 grid](../../apps/web/src/domains/creator/StudioStoryboardGridPanel.tsx).

## 사람·공간·아트: VS-10–19

| ID / 판정 | 실제 사용자 진입점 | 저장 결과와 권한 source | 검증 / 남은 범위 |
| --- | --- | --- | --- |
| **VS-10 구현, 범위 한정** 아바타 카드 | Canvas/주변 사람/대화 멤버의 아바타와 `StudioVirtualSpaceSocialPanel`; NPC는 별도 panel. | 사람은 authenticated room presence, 상태·지원 appearance는 검증 descriptor. peer가 보낸 URL/클립 권한을 신뢰하지 않는다. 차단·가능 행동·호환 안내가 별도다. | S, R6: stable skinKey와 index 불일치 DOM/Canvas, unknown fallback, NPC 구분 회귀. 영구적인 계정 전체 차단/서비스 전체 profile 정책까지 이 카드가 완성하지는 않는다. |
| **VS-11 구현, 범위 한정** 초대 기반 행동 | 인사·이동 follow·검수 초대·대화의 명시 요청/수락/거절/취소. | social/conversation 상태기계가 정확한 peer/instance/request를 확인한다. focused/away/disconnect/world 교체와 late result를 정리한다. 요청은 편집·미디어 권한을 대체하지 않는다. | S: paired ports/controller/hook/Page 회귀. 일반 blur는 입력/follow·pending 제안에 영향을 주며 이미 수락한 통화를 임의로 종료시키지 않는다. 운영 WAN 전송 보장·영속 inbox는 별도다. |
| **VS-12 부분** 대화 멤버십 | 2–4인 동의 panel→정확한 roster의 scoped Huddle→명시 Join. | 공개 공간 client consent와 Huddle가 같은 ID/peer allowlist를 사용한다. outsider inbound/outbound media를 거부하고 scope 변경은 capture를 닫는다. WORLD 서버는 실제 socket/session/door/world pin을 검증하는 self-consent 계약을 추가했다. | S: conversation/media/CreativeHuddleController tests; 이번 서버 service/schema 7 tests PASS, 실제 PG는 담당자 실행 별도. **서버 private grant를 소비하는 Web/provider media gate는 미연결**이다. session lease나 scope digest만으로 private 통화를 열 수 없다. |
| **VS-13 부분** 외부 검토자 | 기존 외부 검토 링크 생성→`StudioExternalReviewPanel` token route. | 서버 token hash·만료·revocation·viewer/commenter·page allowlist와 feedback을 보존한다. 그러나 `getExternalReview`는 **현재 CreatorWork.pages/doc**를 읽는다. | S: 기존 외부 Panel/client/API tests. 외부 링크 자체는 존재한다. **지정한 불변 review snapshot**만 읽는 제한 링크와 현재 pinned review ACL 연계는 아직 없다. 기존 기능을 미구현으로 지우거나 고정 검수 완료로 과장하지 않는다. |
| **VS-14 구현, 등록된 자리 범위** 활동 앵커 | 자리 목록/의자·책상 접근→도착→점유→지원되는 sit/작업 pose→이동 해제. | validated manifest의 approach/anchor/exit/collider와 authoritative lease가 함께 쓰인다. 도달 전 claim 0, 지원되지 않는 pose는 착석으로 표시하지 않는다. | S, R6: seated actors/slot hook/manifest, 실제 아트·Canvas 검증. 임의 새 소품에 자동으로 올바른 pose/occlusion이 생긴다는 뜻은 아니다. |
| **VS-15 부분** 공간 템플릿 | 공간 편집→Tiled/manifest 가져오기·로컬 초안; WORLD owner/admin 게시·현재 게시본 적용·이전본 새 게시. | v2 draft는 원래 base revision을 보존한다. 서버 publication CAS/operation/receipt, canonical hash가 공유 세계의 권위다. 자산 decode 후 안전 채택. | W1. draft/shared publish는 구현. **팀용 template 카탈로그·검증된 도구 구성·역할/door 권한 기본값을 함께 적용**하는 흐름은 남았다. 외부 이미지 URL bytes의 영구 pinning도 별도다. |
| **VS-16 부분** No-code 규칙 | 현재 소품/interaction의 등록 action으로 story/comic/canvas/review/assets/assistant를 연다. | action union·manifest validator와 기존 도구 권한을 사용한다. import가 임의 script 실행을 허용하지 않는다. | S: authoring/interaction tests. 사용자 편집 가능한 조건→행동 규칙과 충돌·순환·실행 결과 확인은 없다. 기존 안전한 action registry는 외부 IO/AI 비용 승인이 아니다. |
| **VS-17 구현, provider 한정** 슬롯 임시 점유 | 자리 사용 버튼, 점유자/확인 필요/해제 상태. | provider의 실제 authoritative-lock capability와 서버 room lease가 단일 권위. acquisition/owner/revision/expiry를 확인하고 미지원 provider는 닫힌 상태를 유지한다. | S, R6: 동시 grant·늦은 ACK·이동/blur/hidden·reconnect·동일 slot 경쟁 회귀. UI의 빈자리 추정으로 권한을 만들지 않는다. 모든 provider/WAN 분할의 실기기 증명은 남는다. |
| **VS-18 구현, 등록된 NPC 범위** 역할 NPC | NPC panel·안내 투어·공간 루틴 및 등록된 작업 소품. | 로컬 director/routine/activity anchor가 경로·양보·집중 중단을 제어한다. NPC는 authenticated 사용자/온라인 인원에 포함되지 않는다. | S, R6: guide/director/yield/activity tests와 Canvas 실행 기록. NPC의 대사나 행동은 실제 팀원·AI 실행·제작 승인으로 저장되지 않는다. |
| **VS-19 부분** 프레임 아트 품질 | Phaser의 네 skin·4방향 walk·sit/wave, pink draw와 silver review, 목록/헤더의 동일 stable skin. | 로컬 registry revision/capability·실제 PNG layout/foot·hip attachment가 렌더 근거. 필요한 texture만 로드하고 세대/참조 해제. | R6, appearance/character-assets tests. 실제 그린 action frames와 reduced-motion/fallback 표시는 구현. **모든 skin의 모든 업무 pose**, 광범위 장치/GPU·장시간 메모리·WAN 품질까지 완료한 것은 아니다. |

주요 직접 source:

- [사람 카드](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceSocialPanel.tsx), [사회적 동의 모델](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-social.ts), [대화 모델](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-conversation.ts), [Huddle 연결](../../apps/web/src/domains/creator/live/huddle/StudioP2pHuddleLauncher.tsx), [현재 acoustic policy](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-acoustics.ts).
- [외부 검토 UI](../../apps/web/src/domains/creator/studio-production/StudioExternalReviewPanel.tsx), [외부 token/현재 원고 읽기 repository](../../apps/api/src/modules/creator/studio-production.repository.ts).
- [자리 hook](../../apps/web/src/domains/creator/virtual-space/use-studio-virtual-space-slots.ts), [world manifest](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest.ts), [world authoring](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-authoring.ts), [NPC director](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-director.ts), [실제 아트 registry](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-character-skins.ts).
- WORLD 전용 구현: `apps/web/src/domains/creator/virtual-space/world-publication/`의 controller/assets/hook/Panel, `apps/api/src/modules/studio-project-graph/studio-world-{publication,acoustic,conversation}.repository.ts`. 이 source가 THIRD의 동일 파일에 이미 통합됐다는 뜻은 아니다.

## 제작 접점과 운영 품질: VS-20–30

| ID / 판정 | 실제 사용자 진입점 | 저장 결과와 권한 source | 검증 / 남은 범위 |
| --- | --- | --- | --- |
| **VS-20 부분** 대본 리딩 | 대본 소품→story/script route, 기존 Writer Room의 검토·제안 적용. | 기존 script/document 및 명시적 적용 command를 사용한다. AI 제안과 원고 변경은 구분된다. | S: WriterRoomReviewSurfaces tests. **고정 대본 버전의 공동 리딩 세션·참가자 차례·수정안→별도 승인** 연결은 없다. 단순 story 링크를 완료로 세지 않는다. |
| **VS-21 부분** 3D 검토 연결 | 기존 3D preview/spatial storyboard의 shot/camera 선택·적용. | 기존 scene/camera/shot 참조와 `onApplyProductionShot` 등 명령 경로가 source다. | S: bg3d/scene-3d tests. 실제 3D 도구는 존재하나 **선택한 render 컷을 pinned review와 연결하고 공간 진입/이탈 시 runtime 수명을 보장**하는 검수 경로는 별도다. |
| **VS-22 부분** 에셋 공동 후보함 | Asset workspace의 `StudioAssetDecisionPanel`: 후보 비교·선택→명시 적용. | 현재 비교 후보는 해당 UI 상태이며 실제 적용은 기존 callback/명령 경로다. | S: asset decision 모델/tests. 개인 후보 비교는 있다. **공유 candidate ID/버전·참가자 투표·결정 이력**은 확인되지 않았다. 인사·반응·poll을 구매/자산 승인으로 바꿀 수 없다. |
| **VS-23 부분** 자산 사용 원장 | Host의 Asset Rights Audit dialog→원고 사용처·권리 확인→JSON/CSV 출력. | 원고 page/element projection과 asset provenance/rights manifest, 명시 attestation을 사용한다. | S: rights manifest/projection/dialog tests. 출처·조건·사용처 진단은 있다. **서버의 버전 고정 원장·삭제 영향·공개 Release 포함 여부**를 일관되게 재검사하는 권위는 아직 별개다. |
| **VS-24 부분** AI 근거 카드 | Assist Hub/Writer Room의 provider·연결·비용 범주 사전 안내와 명시 적용. | 기존 BYOK execution preflight·AI handoff model. 생성/적용을 원고 승인으로 취급하지 않는다. | S: ai execution preflight/generated asset boundary tests. **읽은 정확한 source/version·불확실성·변경 diff·비용을 하나의 저장된 검수 evidence card로 고정**하는 연결은 없다. AI 기능이나 BYOK를 제거하는 해결책은 허용되지 않는다. |
| **VS-25 구현, 현재 경로 범위** 개인/팀/검토 보기 | 공간 Canvas 외 directory/목록·직접 workspace 목적지·review route·집중 상태. | 같은 work를 기존 route/runtime와 서버 권한으로 연다. 이동 성공이 문서 접근 허가가 아니다. | S, R1–R5의 키보드/390px. 핵심 도구에 불필요한 걷기를 요구하지 않는다. 모든 외부/멘토/역할별 세분화 화면까지 동일하게 완성했다는 뜻은 아니다. |
| **VS-26 미구현** 멘토링 작업실 | 현재 일반 팀 검수·외부 review UI를 재사용할 재료는 있다. | 멘토/학습자 전용 제출 범위·세션·원고/미디어 권한 계약은 확인되지 않았다. | S 범위 조사. 일반 editor 역할 부여나 통화 초대를 ‘원본을 보호하는 멘토링 모드’로 제시하면 안 된다. |
| **VS-27 미구현, VS 승인본 공개 경로** 프로젝트 쇼케이스 | 현재 일반 showcase 목적지는 있으나 pinned review의 공개 승인 동작은 없다. | 승인 review와 공개 snapshot/Release의 분리된 권위 연결이 필요하다. | R7. **승인 검수본 원본 이미지 ZIP**은 로컬 출력으로 구현·검증했다. 그것은 graph approved Revision 생성이나 공개 Release가 아니며, 댓글/서명 URL/회원 정보를 ZIP에 넣지 않는 별도 경계다. |
| **VS-28 부분** 템플릿/소재 생태계 | Tiled/manifest import·validation, asset/skin 로컬 registry. | world/action/appearance version과 validator가 현재 호환 근거다. arbitrary code는 실행하지 않는다. | S, W1. **배포되는 template/material package의 rights·호환 버전·성능 budget·검증·업데이트 영향**을 사용자에게 제공하는 생태계는 아직 없다. 단일 import 성공은 해당 package의 권리 보증이 아니다. |
| **VS-29 부분** 관측·진단 | 실제 QA scripts/artifacts, project diagnostic와 runtime/아트 검증. | typed 진단 입력·실제 실패·브라우저 reports가 근거다. 합성 관찰과 실제 runtime을 구분한다. | R1–R6, W1. input/queue/메모리/장치/전송 실패·비용까지 이어지는 **일관된 실운영 진단·조용한 환경 scale evidence**는 남았다. 지금의 PASS 수를 20인/WAN 성능으로 변환하지 않는다. |
| **VS-30 부분** world revision 전환 | WORLD의 현재 게시본 적용·게시·이전 manifest 새 게시. | `{workId,worldId,revisionId,contentHash}` scope, 서버 CAS, preload/decode 후 안전 spawn. 실제 epoch 변경만 old social/Huddle/slot 정리; 불변 read는 scene 유지. | W1: stale scope 거부·같은 내용 새 revision·decode 실패 보존·base conflict. **다중 클라이언트 adoption/ack·오프라인 복귀 수렴·immutable 외부 asset bytes**는 미완료다. client compatibility hash는 권한 grant가 아니다. |

주요 직접 source:

- [Writer Room review](../../apps/web/src/domains/creator/StudioWriterRoomReviewSurfaces.tsx), [3D storyboard](../../apps/web/src/domains/creator/bg3d/StudioBg3dSpatialStoryboardPanel.tsx), [에셋 비교 UI](../../apps/web/src/domains/creator/StudioAssetDecisionPanel.tsx), [권리 audit](../../apps/web/src/domains/creator/StudioAssetRightsAuditDialog.tsx).
- [AI 실행 preflight](../../apps/web/src/domains/creator/ai/studio-ai-execution-preflight.ts), [직접 workspace 목적지](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-model.ts), [목록](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceDirectory.tsx), [project 진단](../../apps/web/src/domains/creator/studio-project-diagnostics.ts).

## 세 핵심 흐름에서 다음으로 닫을 다섯 구현 단위

다음 항목은 현재 기능을 다시 만들기 위한 목록이 아니다. 이미 저장되는 정확한 identity와 권한을 이용해 **사용자가 어디에서 완료를 확인하지 못하는지**를 좁혀 놓은 순서다.

1. **수정 결과를 연결 제작 작업의 완료 기준 검토로 이어 주기 — VS-04/05/07.** 지금은 `reviewRef`에 원 comment/handoff를 저장하고, 별도 resolve에서 새 submission을 기록하지만 작업 연결 화면이 그 최신 결과·새 검수 상태·기준 확인을 함께 보여주지 않는다. `review-production/`의 읽기 모델/UI와 기존 task/handoff CAS 경계에서 old/new pin·해결 상태·미충족 기준을 fresh read로 제시하고, 권한 있는 사람이 명시적으로 확인/단계를 전환하게 한다. 자동 done·자동 승인·과거 ref 덮어쓰기는 금지한다. 수락 증거는 **실제 같은 컷 수정→저장→실제 producer 등록→원 의견 해결→연결 작업 재개**의 한 로컬 API/DB/browser journey와 CAS/회수 실패 경로다. 현재 R1/R3/R4를 단순 합산해서 대신하지 않는다.
2. **정확한 제출본을 담은 인계 봉투와 수신자 인수 확인 — VS-07/06.** 기존 `ProductionHandoffBrief`에 입력/산출물 pin·남은 의견·권리 조건 참조를 연결하고 실제 사용자/역할 배정으로 수신자를 식별한다. `studio-production` workspace/parser와 API repository가 동일 work/scope/current role 및 baseRevision을 확인해야 한다. 작성자의 `accepted` 선택을 수신자의 인수로 간주하지 않도록 명시 전달/수신자 확인 의미를 분리한다. 수락 지점은 다른 계정이 나중에 로그인해 **같은 입력본/기준을 보고 인수하고 후속 작업을 여는 것**이다.
3. **검토·인계 요청의 비동기 상태를 저장해 복구하기 — VS-08/01.** 기존 Role Inbox/Review Board 위에 요청 ID, 송신자·수신자, 고정 subject, 전송/읽음/결정/취소의 실제 서버 상태를 투영한다. 실제 API authority가 durable delivery를 소유하고 P2P는 알림 힌트만 담당하도록 한다. 현 ephemeral social history를 재사용해 전달 성공을 주장하지 않는다. 수락 지점은 송신자 오프라인·응답 유실·수신자 재접속 뒤에도 한 요청으로 **미수신/읽음/결정**을 구별하는 것이다. 새 schema/migration이 필요하면 그 별도 작업 범위를 명확히 한다.
4. **게시된 template에서 권한 있는 private 세션까지 연결 — VS-12/15/17/30.** WORLD의 실제 게시·안전 채택을 시작점으로 template의 도구/door defaults를 명시 선택하고, 서버 door/session/self-consent를 소비하는 작은 Web adapter를 완성한다. `world-publication/`, acoustic policy, conversation hook, Huddle provider의 실제 capability 경계가 대상이다. 정확한 world revision·session epoch·동의 roster·만료/차단을 미디어 전송/수신 전에 확인하고, 지원 없는 provider에서는 닫힌 상태를 유지한다. 수락 지점은 두 실제 인증 클라이언트가 **template 게시→같은 revision 채택→각자 수락/Join→허용 멤버만 연결→회수/재접속 시 차단**을 확인하는 것이다. 서버 lease 하나를 이 완료로 부풀리지 않는다.
5. **작업 세션의 시작 입력과 종료 결과를 저장 — VS-01/02/06.** 검수·인계 또는 template 세션을 생성할 때 목적·ScopeRef·고정 입력 pin·참가자를 명시하고, 종료 시 실제 생성된 review/decision/task/handoff 결과를 참조한다. 문서 follow는 이 고정 입력 안에서 opt-in으로 제공하며 편집/미디어 권한과 분리한다. 서버 graph/기존 workspace 중 실질적 소비 경계를 먼저 정하고 새 범용 플랫폼을 선제 도입하지 않는다. 수락 지점은 참가자가 이후 기록을 열어 **무엇을 보고 무엇이 결정·전달됐는지** 확인하는 것이다.

승인 검수본 원본 묶음 출력은 R7과 [별도 구현 문서](virtual-studio-review-export-20260920.md)에 정확한 preview ordinal/hash와 SHA 검증, 준비 전후 현재 ACL, actor/session/hidden/cancel 및 검증 범위를 기록했다. 해당 ZIP을 공식 approved Revision·Release나 공개 허가의 증거로 쓰지 않는다. 위 다섯 단위도 운영 배포·유료 인프라·AI 운영자 키·새 마이그레이션 실행을 승인하는 문서가 아니다.
