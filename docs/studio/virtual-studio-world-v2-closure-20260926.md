# 가상스튜디오 World v2 구현·검증 원장 — 2026-09-26

상태: **migration**. 이 문서는 구현 계획과 현재 소스 관찰을 구분하는 작업 원장이다. 전체 완료 보고, 현 브랜치의 테스트 통과 기록, 운영 배포 승인이 아니다.

## 1. 기준과 판정 방법

- 관찰 기준은 `codex/virtual-studio-world-v2-20260926`, 기반 커밋 `e9b9fde0d5ca13a7ed1bc35440bd9bb5b54eed86`와 2026-09-26에 보존해 옮긴 미커밋 작업이다. 다른 작업자가 같은 브랜치에서 구현 중이므로 아래 내용은 최초 소스 감사 시점의 기준선이다.
- 기존 2026-09-20 원문 30개 항목은 [원문 복구 기록](virtual-studio-original-backlog-20260920.md)을 따른다. 원문 링크는 [공유 대화](https://chatgpt.com/share/6aaee800-d520-83ee-ac26-d2a1f812cece)이며, 복구된 확장 문서 이름은 `ToonStudio_Virtual_Studio_Expansion_Strategy_2026-09-20.md`다.
- 2026-09-26 P0/P1/P2는 같은 기능을 삭제하거나 품질을 낮추는 대체 계획이 아니라, 기존 기능을 보존하면서 공간 경험을 완성하는 추가 요구다. 엔진은 Phaser를 유지한다.
- `current`는 실제 진입점과 연결된 소스를 확인한 범위다. 그 소스가 존재한다는 사실만으로 이번 브랜치의 실행 검증, 시각 품질, 실기기 성능, 운영 권한 구성이 증명되지는 않는다. `target`은 남은 완료 조건이고 `migration`은 일부 구현과 연결이 진행 중인 범위다.
- [2026-09-24 전체 페이지 완료 문서](virtual-studio-all-pages-closure-20260924.md)와 [2026-09-25 개선 문서](virtual-studio-complete-enhancements-20260925.md)는 이전 구현 설명이다. 이번 원장에서는 그 문서의 일괄 완료 표현을 재인용해 완료 근거로 삼지 않는다. 아래 세부 경계가 다르면 현재 source/tests를 기준으로 후속 검증한다.
- 이번 감사에서는 테스트, 브라우저, 빌드, 배포를 실행하지 않았다. 이전 문서의 PASS 수치를 현재 HEAD의 결과로 옮기지 않는다.

이하 경로 약어는 `web` = `apps/web/src/domains/creator`, `api` = `apps/api/src/modules/creator`, `model` = `packages/studio-project-model/src/graph`다. 실제 저장소 내 소스 경로이며 앱 간 직접 import를 허용한다는 뜻은 아니다.

## 2. 기존 기능 보존 기준

기존 기능을 새 타일 렌더러나 HUD로 옮길 때 다음 경계를 보존해야 한다.

| 기능 | 현재 연결된 사용자 진입점과 소스 | 보존할 권위와 결과 |
| --- | --- | --- |
| 고정 검수본과 컷·객체 주석 | `web/virtual-space/StudioPinnedReviewPanel.tsx`, `StudioPinnedReviewPreview.tsx`, `web/review-capture/` | 저장된 원고에서 유도한 source mapping과 고정 revision/hash를 사용한다. 페이지 ID를 graph ScopeRef의 panel ID로 혼용하지 않는다. |
| 원고 수정과 재검수 | `web/review-handoff/`, `web/review-resolution/`, `web/review-production/` | 명시적인 현재 원고 선택, 저장 후 새 캡처, 원래 의견과 새 검수본의 서버 검증 연결을 보존한다. 자동 해결이나 과거 원고 덮어쓰기를 하지 않는다. |
| 연결 작업의 완료 기준 | `web/review-task-completion/StudioReviewTaskCompletion.tsx`, `api/studio-review-task-completion.repository.ts`, `studio-review-task-completion-invalidation.ts` | 현재 해결 근거와 정확한 기준을 확인한 사용자 완료, 서버 actor/시각/receipt, 관련 근거 변경 시 무효화 이력을 보존한다. 일반 수동 done과 공식 근거를 구분한다. |
| 인수인계 봉투 | `web/handoff-envelope/`, `api/studio-handoff-envelope.repository.ts`, `studio-handoff-envelope-basis.ts` | 지정 수신자와 고정 근거, delivered/read/accepted/cancelled/changed 구분을 보존한다. 작성자가 수신자의 인수를 대신 확정할 수 없다. |
| 작업 세션과 비공간 진입 | `web/work-session/StudioWorkSessionWorkspace.tsx`, `web/studio-production/StudioProductionHubPageV2.tsx` | 목적·참가자·고정 자료·결정·종료 결과를 기존 서버 세션에 저장한다. 작업 화면에서도 바로 접근할 수 있어야 한다. |
| 대화와 좌석 | `web/virtual-space/private-room/`, `web/live/huddle/`, `web/virtual-space/use-studio-virtual-space-slots.ts` | 실제 provider 권위, 같은 월드 revision, 정확한 참가자 동의, 명시적인 미디어 사용과 만료·퇴장 처리를 보존한다. 개인 공간을 팀 권한처럼 취급하지 않는다. |
| 외부 검수·쇼케이스·설명 기록 | `web/review-share/`, `web/virtual-space/StudioReviewVoiceNotes.tsx`, `web/review-export/` | 별도 고정 공유본, 기한·회수·실제 접근 권한, 명시 녹음과 삭제를 보존한다. 검수 승인, ZIP 원본 묶음, graph 승인 Revision, Release는 서로 다른 결과다. |
| 월드 게시와 템플릿 | `web/virtual-space/world-publication/`, `studio-world-template-package.ts`, `StudioWorldRuleEditor.tsx` | 최신 권한·CAS 게시, 원본 초안 기준, 자산 준비 뒤 안전한 채택, 실패 시 기존 월드 유지, 허용된 규칙만 실행하는 경계를 보존한다. |

위 소스가 남아 있음을 확인했으며, 원래 코드가 모두 유실되었다고 볼 근거는 발견하지 못했다. 반대로 경로 존재만으로 모든 기능의 통합 동작과 원문 전체 충족을 선언하지 않는다.

## 3. 원문 30개 요구의 현재 범위

표의 `current`는 표시된 좁은 구현 범위의 확인이다. 모든 행의 2026-09-26 실행 재검증은 별도로 남아 있다.

| ID / 원문 요구 | 현재 사용자 진입·결과와 소스 근거 | 남은 경계 / 상태 |
| --- | --- | --- |
| VS-01 공동 작업 세션 | 공간의 세션 패널과 제작 허브 → `web/work-session/`, `api/studio-work-session.repository.ts`. 목적·자료·참가자·종료 결과를 서버 세션으로 보존한다. | **current**: 저장 흐름 존재. 새 장소 이동과 재접속을 포함한 실제 여정은 재검증한다. |
| VS-02 함께 보기 | `StudioWorkSessionDetail.tsx`, `StudioWorkSessionPreview.tsx`의 발표·따라보기와 세션 상태. | **current**: 선택적 따라보기. 편집 권한이나 미디어 동의로 자동 승격하지 않는 경계를 보존한다. |
| VS-03 회차 콘티 벽 | `StudioSessionAgenda.tsx`, `model/work-session-workflows.ts`의 순서·대사·안건 제안. | **migration**: UI가 원고 수정이 아닌 세션 제안임을 명시한다. 기존 원고 명령을 통한 명시적 적용까지 같은 기능으로 완료 처리하지 않는다. |
| VS-04 버전 비교 검토 | 고정 검수 패널의 비교·source anchor, `web/review-resolution/`의 새 캡처 연결. | **current**: 두 고정본과 의견 연결. 같은 컷 수정→저장→새 검수본까지 통합 여정 재검증이 필요하다. |
| VS-05 수정 요청 작업화 | 검수 의견 → `web/review-production/` → `web/review-task-completion/`. 담당 역할·완료 기준·서버 완료 receipt. | **current**: 연결·기준 검토·완료와 검수 승인은 분리된다. 변경·재해결·재접속을 포함한 통합 여정은 미실행이다. |
| VS-06 결정 노트 | `web/work-session/StudioSessionClosingDraft.tsx`, 세션 이벤트와 검수 결정. | **current**: actor·고정 자료·결정 기록. AI 제안과 사람의 승인·Release를 합치지 않는다. |
| VS-07 인수인계 봉투 | 제작 허브의 `StudioHandoffEnvelopeInbox`, `api/studio-handoff-envelope.repository.ts`. 고정 입력·산출물·남은 문제·조건·수신자와 별도 인수 증거. | **current**: 수신자 변경·권한 회수와 기준 변경은 원래 전달/인수와 구분한다. 두 실제 사용자 완료 여정은 재검증한다. |
| VS-08 비동기 검토함 | `web/handoff-envelope/`, `web/review-export/StudioReviewDelivery.tsx`와 서버 전달 상태. | **current**: 보냄·받음·읽음·인수 등 저장 상태가 존재한다. P2P 힌트나 화면 표시를 외부 알림 실제 배달로 주장하지 않는다. |
| VS-09 짧은 설명 기록 | 검수 패널 → `StudioReviewVoiceNotes.tsx`와 API 음성 기록 저장·서명 재생·삭제. | **current**: 명시 녹음/업로드와 transcript·보존 기한. 통화 상시 녹음 또는 이번 환경의 저장소 검증 완료를 뜻하지 않는다. |
| VS-10 아바타 사용자 카드 | `StudioVirtualSpaceSocialPanel.tsx`, presence/appearance 모델. | **current**: 사람/NPC 구분과 사용자 행동. 새 아트·모바일 이름표 배치 품질은 P0 재검증 대상이다. |
| VS-11 초대 기반 공동 행동 | social controller/hook과 초대 패널의 수락·거절·취소·만료·차단. | **current**: 동의 흐름 보존. 새 portal/world 전환 후 늦은 응답이 행동을 복구하지 않아야 한다. |
| VS-12 대화 멤버십 | conversation/private-room controller와 Huddle의 정확한 멤버 범위. | **current**: 명시 동의와 서버 권위 연결. 실제 WAN·다중 기기·권한 프롬프트 조합은 별도 미증명이다. |
| VS-13 외부 검토자 모드 | `web/review-share/StudioPinnedReviewSharePage.tsx`와 API pinned-share. | **current**: 고정 공유본과 만료·회수. 공간/팀 전체 접근 권한으로 확대하지 않는다. |
| VS-14 활동 앵커 소품 | manifest interaction slots, 좌석 hook/panel, Canvas pose 처리. | **migration**: 접근·점유 권위는 보존하되 새 독립 장소의 소품·앉기·출구·가림 정합성이 필요하다. |
| VS-15 공간 템플릿 | `studio-world-template-package.ts`, authoring·publication UI. | **migration**: 검증 패키지/게시 계약은 존재한다. P1/P2 독립 장소·완성 테마와 실제 템플릿→동일 월드 세션 여정은 남아 있다. |
| VS-16 No-code 공간 규칙 | `StudioWorldRuleEditor.tsx`와 허용된 interaction registry. | **current**: 등록된 행동만 사용한다. 네트워크·AI 비용·권한 동작을 근접만으로 자동 승인하지 않는다. |
| VS-17 슬롯 임시 점유 | slots hook와 실제 authoritative lock capability. | **current**: provider 지원/만료/이동·집중·월드 변경 경계. 새 장소 전환과 지연 grant 회귀를 보존한다. |
| VS-18 역할형 NPC | NPC director/interaction·locomotion, living-world presentation. | **migration**: 루틴과 행동은 존재하지만 독립 장소별 NPC/동선·ambient 완성은 P1이다. NPC를 온라인 팀원 수로 세지 않는다. |
| VS-19 프레임 아트 품질 | character registry와 `scripts/extract-virtual-studio-imagegen25-v6.py`, 방향별 추출/manifest. | **migration**: 현재 일부 strip은 같은 프레임을 위치 이동해 만든다. 실제 관절 동작·발 피벗·실루엣 검수와 중복 교체를 완료로 볼 수 없다. |
| VS-20 대본 리딩 | session kind와 `StudioSessionAgenda.tsx`의 고정 자료·차례·대사 제안. | **migration**: 제안 저장과 원고의 승인된 대사 적용은 다르다. VS-03과 같은 기존 명령 적용 연결이 필요하다. |
| VS-21 3D 검토 연결 | scene-review 세션과 `model/work-session-evidence.ts`, API evidence projection의 `nativeSceneKind`. | **migration**: 이 경로에서 exact scene/camera/shot 선택 고정과 적용은 확인하지 못했다. 앱의 다른 3D 기능 전체가 없다는 뜻은 아니다. |
| VS-22 에셋 공동 후보함 | `StudioSessionMaterialBoard.tsx`의 후보·투표·결정 이력. | **migration**: 현재 안내대로 결정 기록이 원고나 사용 권리를 바꾸지 않는다. 권한 있는 명시 적용 bridge를 별도 연결·검증해야 한다. |
| VS-23 자산 사용 원장 | `StudioSessionEvidencePanel.tsx`, `api/studio-session-evidence-projection.ts`의 고정 원고 자산·출처·사용 기록. | **current**: 저장된 증거 투영 범위. 외부 라이선스 진위·모든 삭제 영향·운영 Release 검증을 자동 보장하지 않는다. |
| VS-24 AI 근거 카드 | 같은 evidence panel과 `model/work-session-evidence.ts`의 provider/model/status/usage/prompt digest. | **migration**: UI도 실제 청구액·전체 입력·결과 변경분을 확인할 수 없다고 명시한다. 정확한 입력/출력 diff·사람의 채택까지 확장 검증이 남아 있다. |
| VS-25 개인/팀/검토 보기 | `/studio/space`, 프로젝트 공간·제작 허브·직접 검수 경로. | **current**: 직접 접근 경로 보존. 개인 공간의 비활성 프로젝트 기능 숨김과 시작 경험은 P0이다. |
| VS-26 멘토링 작업실 | mentoring session kind와 일반 session actor `canEdit/canComment`. | **migration**: 해당 모듈에서 멘토/학습자의 별도 제한된 제출 권한은 확인하지 못했다. 타입 이름만으로 외부 멘토 권한 경계 완료를 선언하지 않는다. |
| VS-27 프로젝트 쇼케이스 | `StudioPinnedReviewShowcasePage.tsx`와 별도 pinned-share 게시/회수. | **current**: 승인된 고정 공개본을 구분한다. 현재 원고·댓글·팀 내부 정보 공개와 합치지 않는다. |
| VS-28 템플릿/소재 생태계 | world template package의 버전·compatibility·rights·자산 검증과 규칙 registry. | **migration**: 계약은 존재한다. P2 공개 템플릿·사용자 제작 공유의 실제 사용 흐름, 독립 아트/성능 검수는 남아 있다. |
| VS-29 관측·진단 도구 | runtime/RTC diagnostics와 `scripts/validate-virtual-studio-runtime.mjs` 등 QA 도구. | **current**: 진단·테스트 소스 존재. 2026-09-26 실제 결과, 지속 실행 자원 추세, 비용 관측은 별도 증거가 필요하다. |
| VS-30 world revision 전환 | `web/virtual-space/world-publication/`의 preload·재검증·안전 채택·이전 월드 유지. | **migration**: 기존 게시 전환 권위 보존. 독립 map/chunk/assets와 portal을 연결한 rollback·늦은 좌표/seat/media 정리는 이번 후속 범위다. |

## 4. 2026-09-26 P0/P1/P2 요구 보존

### P0 — 현재 경험 정리

1. 일회성 새 배경 이미지를 반복 추가하는 방식 중단.
2. 개인 공간에서 사용할 수 없는 프로젝트 기능 숨김.
3. 상하단 중복 명령과 큰 상호작용 링 제거.
4. 모바일 이름표·joystick·button 겹침 수정.
5. 중복 방향 캐릭터 교체.
6. Page/Phaser/CSS의 책임 분리. CSS 일부가 이미 분리되었다는 사실과 Page/Canvas 분리 완료는 구별한다.
7. 월드 편집·협업·검수의 실제 지연 로딩.
8. bundle gate 복구와 실제 산출물 측정.

### P1 — 독립된 장소를 이루는 엔진과 아트

1. 실제 tilemap/chunk renderer.
2. portal로 연결되는 여러 독립 장소.
3. 실제 foreground occlusion/roof fade.
4. 광장·개인 atelier·review theater·cafe의 gold 기준 4장소.
5. sky·webtoon·neon의 완성된 3 theme.
6. ImageGen2.5 생성·후처리·검수 pipeline과 provenance/중복 gate.
7. 장소별 ambient/NPC.

### P2 — 장소·테마·저장과 공유 확장

1. 8~12개의 독립 장소.
2. 기존 6 theme 완성.
3. hanok·beach·industrial·space 확장.
4. day/dusk/night/weather.
5. seasonal event.
6. 프로젝트 공간 저장과 public template.
7. user-authored 공유.

Place(동선·충돌·portal·앵커), Theme(재사용 가능한 아트/재질), Environment(시간·날씨·분위기)는 독립 축으로 유지해야 한다. 이름이 다른 카드나 같은 배경의 색조 변화를 독립 장소/완성 테마 수로 계산하지 않는다.

## 5. 현재 남은 8개 구현 단위

| 단위 | 최초 감사의 구체적인 소스 관찰 | 다음 완료 조건 |
| --- | --- | --- |
| G1 개인 공간·몰입 HUD·모바일 | `StudioVirtualSpacePlaceGallery.tsx`/`studio-virtual-space-place-catalog.ts`에 personal의 projectOnly 필터가 있다. `StudioVirtualSpacePhaserCanvas.tsx`에는 radius 140/72의 proximity overlay 원이 남아 있다. | 개인 진입에서 작동하지 않는 팀 도구를 보이지 않게 하고, 중복 명령/큰 링을 정리한다. 390/320px 이름표·조작부와 키보드 직접 경로를 실제 확인한다. |
| G2 분리·lazy·bundle | 최초 감사 당시 Page 약 2,279줄, Canvas 약 2,003줄이다. 일부 Huddle/gallery/environment/session은 lazy지만 authoring/publication/social/conversation 등의 정적 import가 남아 있다. `studio-workspace-live.css`는 이미 분리 CSS를 가져오는 파일이다. | 책임 있는 module 분리와 실제 chunk 경계를 확인하고 생산 bundle gate를 통과한다. 파일을 기계적으로 줄이거나 기능을 삭제해 통과시키지 않는다. |
| G3 실제 tile/chunk 파이프라인 | 기존 `studio-virtual-space-tiled-adapter.ts`는 tilelayer 타입 이름이 있어도 객체 layer를 읽는다. `studio-virtual-space-living-world.ts`는 전체 128px 격자에 좌표 기반 frame을 선택해 image를 놓는다. 이번 작업 중 `model/world-tilemap.ts`가 추가되고 있으나 아직 통합 검증되지 않았다. | tileset/GID/layer 데이터를 보존해 실제 renderer에 전달하고, 보이는 chunk 생성·해제와 texture lifetime을 측정한다. actor interest management를 tile streaming으로 대체 설명하지 않는다. Wang/terrain 자동 연결은 별도 실제 지원 여부를 확인한다. |
| G4 독립 장소와 portal | `studio-virtual-space-place-catalog.ts`는 14개 카드지만 cafe/beach는 lounge, plaza/event-stage는 live room을 재사용한다. Page의 이동은 같은 manifest의 `studioWorldSpawn(...roomId)`로 path를 설정한다. | 먼저 4개 gold 장소의 독립 공간 데이터·도착점·왕복 portal을 완성한 뒤 8~12장소로 늘린다. 모든 portal의 실제 도달성과 세션 정리를 검증한다. |
| G5 가림·지붕·장소별 생동감 | manifest의 roof polygon/구역 portal과 Canvas의 배경 복제 image·geometry mask는 존재한다. 이것만으로 독립 소품 foreground와 roof fade 품질이 증명되지 않는다. | 플레이어/NPC의 발 위치·깊이·실내 진입에 맞는 실제 layer 가림과 부드러운 roof 전환, 장소별 ambient/NPC 동선을 확인한다. |
| G6 캐릭터 실제 프레임 | `scripts/extract-virtual-studio-imagegen25-v6.py`의 `animated_strip`은 같은 추출 프레임을 이동해 walk/talk/draw/review strip을 만든다. 방향별 source crop 변경은 WIP다. | 방향별 실제 구도와 동작 프레임, 발 피벗·실루엣·색상 일관성을 검수한다. 픽셀 hash가 다른 것과 읽을 수 있는 걷기/앉기 자세를 구별한다. |
| G7 아트·theme·environment 품질 | `imagegen25-v7/manifest.json`은 source board 2개, place preview 14개·backdrop 4개·atlas 1개를 기록한다. 생성기는 deterministic crop 중심이다. v7 gate는 hash/bytes/치수/경로/provenance 검사이며 지각적 중복 품질 판정은 아니다. | 생성 원본·후처리·검수 이력을 분리하고 실제 재사용 tileset/props로 3 theme와 4 gold 장소를 완성한다. 기존 6 theme·추가 4방향 theme·시간/날씨/이벤트는 P2로 남긴다. |
| G8 기존 제작 기능의 실제 종료점 | `StudioSessionAgenda.tsx`, `StudioSessionMaterialBoard.tsx`, `StudioSessionEvidencePanel.tsx`는 각각 세션 제안, 투표 기록, 저장 증거 투영의 한계를 명시한다. VS-21/26도 kind/metadata만으로 전체 권한·작업 적용을 증명할 수 없다. | VS-03/20 명시 원고 적용, VS-21 exact scene/camera/shot, VS-22 명시 에셋 적용, VS-24 입력/변경/채택 근거, VS-26 제한된 멘토 역할을 실제 소비자와 권한 경계에 연결한다. 아래 세 핵심 여정을 새 world에서 끝까지 검증한다. |

## 6. 사용자 완료 지점에서 확인할 세 여정

| 여정 | 재사용할 현재 구현 | 이번 브랜치에서 필요한 종료 증거 |
| --- | --- | --- |
| J1 같은 컷 수정·재검토 | pinned preview/source anchor → editor handoff → 실제 저장·capture → resolution → 연결 task criteria/completion → 새 검수. | 두 사람이 원래 컷/의견을 보존한 채 수정본을 확인한다. dirty/다른 revision/권한 회수 때 선택·업로드·해결 0, 새 capture와 올바른 submission parent, 명시 완료/재검토를 실제 결과로 확인한다. 승인/Release를 자동 실행하지 않는다. |
| J2 제출 후 다음 사람에게 인계 | production task + completion receipt → immutable envelope → 수신함 read/accept. | 지정 수신자가 나중에 실제 읽고 인수를 확인한다. 이름/다른 멤버 변경은 보존하고, recipient revoke→regrant 또는 기준 A→B→A는 옛 인수를 재승격하지 않는다. 응답 유실 후 같은 intent 조회와 취소 상태를 검증한다. |
| J3 template에서 authorized session까지 | template/rule/asset validation → world publish CAS → 안전 채택 → work session/private consent. | 동일 게시 revision/hash와 준비된 자산으로 두 클라이언트가 진입한다. 명시 권한/roster 동의 뒤 세션을 시작하고 portal/rollback/재접속/권한 회수에서 옛 미디어·좌석·좌표가 재사용되지 않음을 확인한다. |

우선순위는 G1~G7의 실제 공간 경로를 만들면서 위 세 여정의 기존 권위를 유지하는 것이다. 각각의 단위 테스트나 서로 다른 fixture 로그를 합쳐 하나의 실제 종단 여정 PASS라고 기록하지 않는다. G8은 범위를 감춘 완료 선언 대신 별도 소비자·권한·종료 결과를 가진 작은 후속 구현으로 분리한다.

## 7. 검증 원장과 정량 목표

아래 숫자는 **target**이다. 최초 소스 감사에서는 측정하지 않았다.

| 구분 | 목표 / 필요한 증거 | 2026-09-26 이 문서 작성 시점 |
| --- | --- | --- |
| 시작 | 3회 이하 입력 / 20초 이내. 신규·재방문·개인·프로젝트를 구분한다. | 미실행 |
| 공간 비중·명령 | 화면 80%가 world, desktop 주요 명령 5개 / mobile 3개. | 미실행 |
| 이동 | 실제 portal 100% 도달, 도착점 충돌·탈출·왕복과 NPC/좌석 정합성. | 미실행 |
| 프레임 | desktop 60fps, mobile 30~45fps, frame p95 16.7ms / 33ms. 기기·해상도·품질·동시 참여·샘플 시간 명시. | 미측정; headless fixture 수치로 실기기 보증하지 않음 |
| 전송·bundle | 첫 자산 8MB/15MB, bundle 약 1MB gzip/160 requests. 캐시 유무와 어떤 profile이 각 예산인지 측정 보고에 명시. | 미측정 |
| 아트·visual | 독립 4 gold 장소, 3 theme, 방향/pose, 실제 가림, 390/320px, 접근성·reduced motion. | 소스 확인만; 화면 검수 미실행 |
| 단위·통합·권한 | 신규 tile/portal/asset 실패와 기존 social/Huddle/review/production/envelope/publication 회귀. API 실제 PostgreSQL 경합/권한 포함. | 이번 감사에서는 미실행 |
| 전체 정적·빌드·CI | harness, Secretlint, type/lint, 아키텍처 경계, 생산 build/bundle/CSP 및 PR 보호 검사. | 이번 감사에서는 미실행; 기존 성공 기록을 대입하지 않음 |
| 종단 사용자 여정 | 위 J1/J2/J3 각각의 실제 두 사용자/현재 HEAD 증거. | 미실행 |
| 별도 환경 보증 | 실제 iOS/Android/펜, 보조기술, WAN 다중 미디어, 장시간 메모리/track 추세, 외부 알림. | 이번 작업의 증거 없음 |
| 배포 | 사용자가 별도 승인한 정확한 main SHA와 운영 검증. | 미실행·미승인. PR/merge 요청은 운영 배포 승인이 아님 |

### 기존 브라우저 시작점

아래는 발견한 실행 경로이며 이번 문서 작업에서 실행하지 않았다. 의존성과 Playwright Chromium이 준비되어 있고, 다른 세션이 쓰지 않는 로컬 포트를 사용해야 한다. 같은 worktree 루트에서 실행한다. 스크립트가 로컬 서버 PID의 cwd와 실행 cwd를 대조한다.

```sh
cd /Users/hjunkim/.codex/worktrees/virtual-studio-world-v2/toonspectrum
pnpm dev --port 5248
```

5248이 비어 있는지 확인한 뒤 선택해야 하며, 사용 중이면 자신의 다른 전용 포트로 두 명령을 함께 바꾼다. 별도 터미널에서 기존 runtime harness를 실행한다.

```sh
cd /Users/hjunkim/.codex/worktrees/virtual-studio-world-v2/toonspectrum
STUDIO_QA_BASE_URL=http://127.0.0.1:5248 node scripts/validate-virtual-studio-runtime.mjs
```

- 기존 runtime harness는 실제 `/studio/p/virtual-demo/space`와 `/tools/browser-harnesses/virtual-studio-runtime-acceptance.html`을 사용하고 `.qa/virtual-studio-runtime-acceptance`에 결과를 남긴다.
- 현재 스크립트는 초기 Canvas ready와 `.vs2-feature` 6개를 기대한다. 현재 Page의 입장 선호가 미확정이면 EntryLobby가 먼저 열리므로, 신규 입장 단계와 새 HUD 계약에 맞게 사용자 행동을 검증하는 갱신이 필요할 수 있다. 이것은 소스상 호환 위험이며 실행 실패 보고는 아니다.
- 개인 공간은 `/studio/space`다. route가 `personal`과 `virtual-demo:personal-home`을 전달하고, Page가 publication/participant를 비활성화한다. 실제 프로젝트 공간은 `/studio/p/:projectId/space`다.
- 별도 offline query는 확인하지 못했다. 개인 공간은 팀 서버 권위를 사용하지 않지만 최초 자산 로딩까지 네트워크가 불필요하다는 뜻은 아니다. offline 검증은 자산 준비 후 네트워크 차단과 재진입 조건을 명시해야 한다.
- 게시 전환 fixture는 같은 방식으로 `scripts/verify-virtual-studio-world-publication.mjs`, authoring fixture는 `scripts/verify-virtual-world-authoring.mjs`를 실행한다. HTTP fixture와 실제 API/DB 증거를 구분한다.

## 8. 원장 갱신 규칙

기능을 닫을 때에는 해당 G/VS/P 항목에 실제 source commit, 사용자 진입·완료 결과, 실행한 명령/환경, 권한·실패 회귀, 화면 또는 측정 산출물을 함께 연결한다. 테스트가 없는 새 완료 주장을 추가하거나 과거 문서의 선언을 근거로 PASS를 이동하지 않는다. 이 원장 단일 파일 작성 중에는 제품 코드·다른 작업트리·기존 미커밋 아트·설정·운영 데이터를 수정하지 않았다.

## 9. 기존 WIP 아트 재검토 — 2026-09-26

상태: **migration**. 이 절은 최초 소스 감사 이후 수행한 읽기 전용 검사 결과다. 아래 제한된 무결성 테스트 결과는 7절의 전체 통합·브라우저·성능 검증을 대신하지 않는다. 검사 대상은 새로 생성 중인 교체 후보가 아니라, 보존해 옮긴 `living-town-v6/imagegen25-character`와 `imagegen25-v7` 산출물이다. 기존 이미지와 생성 원본은 이 검사에서 수정하지 않았다.

### G6 / VS-19: 실제 동작 프레임 교체가 필요한 근거

- `scripts/extract-virtual-studio-imagegen25-v6.py:129`의 `animated_strip`은 하나의 정지 프레임을 네 번 합성하며 좌표만 바꾼다. `walk`, `talk`, `draw`, `review` 각각을 네 방향에 적용하는 경로는 같은 파일의 166~170행이다. 이 방식은 기반 커밋에도 존재했고, 보존된 WIP는 방향별 원본 crop 좌표와 산출물을 바꾸지만 동작 생성 방식은 고치지 않았다.
- 실제 WebP 16개를 각각 160×160 셀 네 개로 메모리에서 읽고, 각 셀의 알파 경계 밖 여백만 제외한 RGBA 바이트를 비교했다. **16개 중 16개에서 네 셀의 크기와 RGBA SHA-256이 모두 동일했다.** 바깥 여백이나 전체 프레임의 hash 차이는 관절 움직임의 증거가 아니다. 이 산출물에는 해당 strip 내의 실제 걷기·말하기·그리기·검토 동작 변화가 없다.
- 예를 들어 `player-imagegen25-walk-down.webp`의 네 알파 경계는 `(28,9,128,145)`, `(30,5,130,141)`, `(32,9,132,145)`, `(30,10,130,146)`이다. 모두 100×136 픽셀이며, 여백 제거 뒤 SHA-256은 네 개 모두 `ce4daa5e145f15ad1ca6c767a4999817a332c81a2c36d68d53829d48570550f5`다.
- 방향 이미지도 직접 열어 확인했다. `direction-up`에는 정면의 두 눈이 보이고, `direction-left/right`도 좌우 측면 자세로 읽히지 않는다. `direction-right` 오른쪽에는 캐릭터와 떨어진 밝은 세로 조각이 남아 있다. `direction-down`은 나머지 방향과 머리·의상 형태가 일치하지 않는다. 다른 파일 hash 네 개를 확보하는 것만으로 네 방향 검수를 통과했다고 볼 수 없다.
- 현재 character registry의 `imagegen25Clip`은 `technique: "drawn"`을 선언하고 이 팩을 선택 가능한 캐릭터로 노출한다. 실제 작화 동작 프레임이 준비되기 전까지 이 선언과 에셋의 실제 내용은 불일치다. **G6·VS-19·P0 중복 방향 교체와 P1 아트 품질은 미완료**이며, 이 팩을 고품질 동작 완성 근거로 사용하는 것은 병합 전 해결할 결함이다.

검사 당시 `living-town-v6/imagegen25-source-manifest.json`의 SHA-256은 `8855530d117829db06afe6a1685e2dda50cfb98107b00e530f7cea7b469bcf25`다. 상세 로컬 관찰 파일은 `/tmp/virtual-studio-legacy-wip-motion-audit.json`이며 임시 파일이므로 영구 보존 증거로 의존하지 않는다. 다음 명령으로 같은 검사를 재현할 수 있다. Python과 Pillow가 필요하며 이미지나 저장소 파일을 쓰지 않는다.

```sh
cd /Users/hjunkim/.codex/worktrees/virtual-studio-world-v2/toonspectrum
python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
from PIL import Image

root = Path("apps/web/public/assets/virtual-studio/living-town-v6/imagegen25-character")
count = 0
for action in ("walk", "talk", "draw", "review"):
    for direction in ("down", "left", "right", "up"):
        path = root / f"player-imagegen25-{action}-{direction}.webp"
        with Image.open(path) as source:
            image = source.convert("RGBA")
        assert image.size == (640, 160), path
        signatures = []
        for index in range(4):
            frame = image.crop((index * 160, 0, (index + 1) * 160, 160))
            bounds = frame.getchannel("A").getbbox()
            assert bounds is not None, path
            frame = frame.crop(bounds)
            signatures.append((frame.size, sha256(frame.tobytes()).hexdigest()))
        same = len(set(signatures)) == 1
        count += same
        print(path.name, "translation_only=", same)
print("translation_only_sheets=", count, "/ 16")
PY
```

교체 완료 조건은 새 생성 원본을 보존하고, 실제 네 방향 자세와 팔·다리의 서로 다른 동작, 발 위치·실루엣·의상 일관성을 직접 검수한 뒤 런타임 거리 기반 위상에 연결하는 것이다. 생성 후보의 존재만으로 선택 가능한 기존 캐릭터 교체 완료를 선언하지 않는다.

### G7: v7 지형과 무결성 검증의 실제 범위

- `scripts/generate-virtual-studio-imagegen25-v7.py:153`의 지형 생성은 원본의 26×26 조각 아홉 개를 128×128로 확대한 다음, 일곱 개를 mirror/flip/180도 회전해 16셀 atlas를 만든다. 실제 atlas의 추가 일곱 셀도 이 변환 복사본과 RGBA 바이트가 정확히 일치했다. 이 파일은 47개의 서로 다른 지형 전환 작화나 높은 원본 해상도의 증거가 아니다.
- v7의 장소 미리보기 14개와 배경 네 개는 같은 source board의 영역 crop이다. 미리보기 용도와 독립 월드의 동선·충돌·portal·별도 작화 완성 수를 구분한다.
- v6 verifier에 추가된 방향 중복 조건은 manifest의 `visualSignature` 문자열 네 개가 서로 다른지 검사한다. 해당 값이 실제 방향 자세인지, 알파 여백을 제외한 동작이 다른지는 검증하지 않는다. v6/v7의 hash·bytes·치수·경로 검사는 파일 무결성 범위로 해석해야 한다.
- source PNG에서 `gpt-image`·`trainedAlgorithmicMedia` 문자열을 찾는 검사는 provenance 관련 내용의 존재를 확인하는 수준이다. 생성 모델 버전의 독립 인증이나 C2PA 서명 체인 검증을 수행한 결과로 확대하지 않는다.

### 실행한 좁은 검사와 CI 변경 검토

같은 worktree에서 다음을 실행했다. 생성기는 실행하지 않았고, 전체 typecheck·build·배포도 이 재검토에서 실행하지 않았다.

| 검사 | 실제 결과 | 해석 |
| --- | --- | --- |
| `node --test scripts/verify-virtual-studio-living-town-v6.test.mjs scripts/verify-virtual-studio-imagegen25-v7.test.mjs` | 2개 통과, 0개 실패 | 위 동작·방향 결함이 존재해도 통과한다. 아트 품질 통과 근거로 사용하지 않는다. |
| `node --test scripts/ci-executed-gates.test.mjs` | 20개 통과, 0개 실패 | 실행되는 CI gate와 sparse checkout 계약의 회귀 검사다. |
| 보존 WIP의 `.github/workflows/ci.yml`·`package.json` diff | v7 sparse checkout, 생성 명령과 검증 명령 추가 | 기존 v3/v4/v5/v6 검증 삭제·완화나 자동 배포 재활성화는 이 diff에서 발견하지 못했다. |

테스트 로그는 각각 `/tmp/virtual-studio-legacy-wip-art-audit-tests.log`, `/tmp/virtual-studio-legacy-wip-ci-audit-tests.log`에 남겼다. 위 결과는 이미지 원본 보존과 결함 식별을 위한 기록이며, 병합·운영 배포 또는 가상스튜디오 전체 품질 완료 기록이 아니다.

## 10. 픽셀 메이커 걷기 원본 교체 — 2026-09-26

상태: **migration**. 9절에서 결함을 확인한 기존 WebP와 source board는 보존한다. 새 `world-v2/characters/pixel-maker/walk-{down,up,left,right}.png` 네 개를 생성 원본에서 재인코딩 없이 복사했으며, 각 파일은 1254×1254 RGBA와 627×627 셀 네 개를 유지한다. 앞·뒤·좌·우와 서로 다른 팔·다리 자세를 직접 확인했다. 같은 디렉터리의 `manifest.json`에는 원본 bytes/SHA-256 및 alpha≥32 경계를, `prompts.json`에는 별도 생성 기록을 둔다. 해시 차이 자체를 작화 품질 인증으로 취급하지 않는다.

- `studio-virtual-space-character-native-art.ts`는 측정한 머리·신발 경계와 수동 몸 중심으로 각 셀의 origin과 같은 비율의 크기 조절 정보를 제공한다. 이미지 픽셀은 수정하지 않는다. alpha 1~7의 외곽 잡점을 발 위치로 오인하지 않으며, 실제 머리~발 높이를 맞춘다.
- 선택 가능한 `imagegen25` 캐릭터의 Canvas 걷기는 새 원본을 읽는다. `idleFrames`와 기존 자산 residency를 통해 정지 때도 같은 atlas의 접지 프레임을 유지하고, 기존 저해상도 방향 정지 이미지를 요청하지 않는다. **별도 서 있는 자세를 새로 그린 것은 아니다.** 전용 standing 작화는 남아 있다.
- 정지→걷기→정지 전환은 같은 texture key를 공유하므로 마지막 걷기 프레임을 잘못 유지하지 않도록 프레임 번호도 확인한다. 실제 이동 거리 기반 위상, reduced motion과 기존 실패 시 표시 유지 방식은 보존한다. 원본 치수가 계약과 다르면 잘못된 시트를 정지 자세로 채택하지 않는다.
- `talk/draw/review`는 이전 기능과 자산을 유지하면서 `translated-still`로 분류를 바로잡았다. 새 실제 동작 작화로 교체한 것은 아니며, `sit/wave`와 함께 미해결 아트 범위다. EntryLobby·Page의 기존 portrait도 별도 후속 연결 대상이며 atlas 전체를 한 얼굴 이미지처럼 사용하지 않는다.

실행한 `studio-virtual-space-character-assets.test.ts`·`studio-virtual-space-presentation.test.ts`의 35개 검사가 통과했다. 새 검사는 같은 atlas 요청 재사용, 잘못된 원본 치수 거절, 원본 bytes/SHA/IHDR/caBX 보존, 실제 alpha 경계에 대한 발·머리 정렬 및 legacy 행동의 구분을 확인한다. 이 결과는 런타임 브라우저의 시각·입력·프레임 성능 검증을 대체하지 않는다. G6/VS-19 전체 완료나 모든 캐릭터 동작 교체로 확대하지 않는다.
## 11. 2026-09-26 통합 검증 기록

상태: **migration**. 이 문서는 원 설계 전체의 완료 선언이 아니다. 기본 월드는 아직 기존 배경 기반 구조이며, 새 타일 렌더러는 가져오거나 게시한 `manifest.tilemap`을 사용하는 경로와 개발용 실제 렌더러 화면에 연결했다. 네 독립 장소·47개 전환 작화·장소 간 이동 그래프는 다음 구현 범위다.

- 타일 계약은 논리 셀과 원본 이미지 셀 크기를 분리하고, unsigned GID 8가지 반전, 레이어 위치·깊이·불투명도, Wang metadata를 가져오기·게시·내보내기에서 보존한다.
- 실제 Phaser TilemapLayer를 카메라 주변 청크에 생성한다. 화면 밖 청크와 마지막 사용 텍스처를 회수하고, 종료 뒤 늦게 도착한 이미지와 재시작 세대를 구분한다.
- 처음 필요한 타일이 준비된 뒤 진입을 허용한다. 로딩 실패는 해당 엔진 생명주기에서 종료 상태로 유지해 늦은 성공이 입력을 다시 열지 않는다. tilemap에는 기존 맵 고정 상자 충돌·물 감속·폭포·길 overlay를 적용하지 않는다.
- 선택 패널을 사용할 때만 불러오며, 패널 로딩 실패를 해당 패널에서 재시도한다. 외형 입력 초안은 탭 이동 후에도 보존한다. 개인 공간의 프로젝트 전용 카드와 무반응 목적지를 정리한다.
- 새 석재·잔디 PNG 2개는 원본 1254×1254를 보존했다. 직선 반복의 완전한 무봉제 작화를 주장하지 않으며, 검증 화면에서는 인접 GID의 수평·수직 반전으로 같은 경계 픽셀을 연결한다. 새로운 47개 지형 전환 작화와 구분한다.
- 생성 도구가 실제 모델 버전을 반환하지 않았으므로 요청 모델 `ImageGen 2.5`와 보고된 모델 버전 없음은 프롬프트 provenance에 분리했다.

실제 브라우저 검증: `scripts/verify-virtual-studio-tile-world.mjs`, 로컬 4397 포트의 이 작업 공간 서버, Chromium Canvas 및 SwiftShader WebGL. 1440×960에서 24개 청크, 반대쪽 이동 후 12개, 390×844와 zoom 0.8에서 6개를 확인했다. 종료 후 레이어·소유 텍스처 0, 재시작 복구, canvas 1개, page error 0이었다. 이는 원본 재료와 렌더러 자원 수명 검증이며, 완성 장소의 미학·실기기 GPU 성능·운영 배포 검증은 아니다.

검증 실행의 원본 보고서 및 화면은 `/tmp/virtual-studio-world-v2-browser-final/`에 저장했다. 전체 128개 suite 첫 실행은 1,021개 통과였으며, 닉네임 검사 범위 오류 1개와 NPC 장시간 시뮬레이션 timeout 2개가 있었다. 이후 닉네임 대화상자 안으로 로딩 검사 범위를 바로잡았다.

### 병합 준비 시점의 후속 검증

- 진입·패널 5개 suite 44개 검사를 1 worker로 통과했다. 이후 프로젝트 데스크톱에서 사라진 RTC 진단 진입점을 공간의 환경 설정에 복구했고, 해당 접근·개인 공간 숨김·외형 초안 보존 3개 검사를 다시 통과했다.
- 타일 runtime·청크 19개 검사를 통과했다. HTTP 200 뒤 PNG 해독 실패가 `loaderror`를 내지 않는 Phaser 경로를 재현해 로더 완료 시 소유 텍스처를 확인하고, 초기·새 청크·Scene 종료 뒤 실패 정리 회귀 3개를 추가했다.
- 전체 기존 아트 무결성 명령이 통과했고, 새 원본 팩은 6파일·16프레임·9,450,415바이트였다. 아트 및 CI Node 검사 31개와 최종 sparse checkout 보완 후 CI 20개가 통과했다. 해시 검사를 시각 품질 인증으로 확대하지 않는다.
- 타일맵에는 기존 월드의 고정 좌석 표시를 생성하지 않는다. Canvas/WebGL의 데스크톱·모바일·청크 해제·종료·재시작을 최종 소스에서 재검증했다. 보고서는 `/tmp/virtual-studio-world-v2-merge-browser-final/`이며 WebGL은 SwiftShader다.
- NPC의 불변 월드 충돌 목록을 재사용하고 동일 이동 후보의 중복 검사를 제거했다. 동일 100초 시뮬레이션의 CPU 관측은 2.262초에서 0.863초로 감소했고, 2,000회 출력의 전체 trace hash는 동일했다. 절대 성능이나 장시간 검사 통과를 보장하는 수치는 아니다.
- 마지막 NPC 26개 검사 중 24개가 통과했으나, 두 20분 시뮬레이션은 로컬에서 각각 87.402초·41.790초가 걸려 기존 60초·30초 제한을 넘겼다. 제한·시뮬레이션 길이·skip을 변경하지 않았다. `/tmp/virtual-studio-npc-final-26-tests.log`에 실패를 보존했으며 원격 CI 결과와 구분한다.

위 기록은 실행 시점의 로컬 결과다. 최종 타입 검사·최신 main 통합·원격 CI·병합 결과는 연결된 PR의 현재 상태로 확인한다. 이 브랜치의 병합은 독립 장소 전체 완성이나 운영 배포를 뜻하지 않는다.
