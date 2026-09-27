# 가상 사무실 협업 벤치마크와 팀원·검수 흐름 — 2026-09-27

상태: **migration**. 이 문서는 `codex/virtual-studio-experience-20260927`의 현재 source/tests로 확인한 변경을 기록한다. 제품 목표는 웹툰 제작 업무에 최적화된 가상 사무실이다. 장식·동작은 사람과 업무를 이해하는 데 도움을 주며, 문서 권한과 협업 의사를 대체하지 않는다. 운영 배포, 인증된 다중 사용자 브라우저 검증, 서비스 전체와의 품질 동등성을 주장하지 않는다.

## 공식 자료 비교

아래 자료는 2026-09-27 확인했다. 열람 날짜와 문서 갱신 날짜를 구분한다. 갱신 날짜가 확인되지 않은 자료를 최신 릴리스라고 단정하지 않는다.

| 서비스·공식 근거 | 확인한 패턴 | ToonStudio 적용·경계 |
| --- | --- | --- |
| [Gather Classic 상태 안내](https://support.gather.town/articles/3094704589-set-your-status-available-busy-and-do-not-disturb) — 문서상 2026-01-26 갱신, Classic 안내 | 참여자 목록에서도 대화 가능·바쁨·방해 금지 상태를 파악한다. 상태는 주변 미디어 참여와 연결된다. | 접속 여부와 작업 상태를 분리해 표시한다. 집중·자리비움일 때 기존 초대 차단을 유지하고 이유를 노출한다. Classic의 동작을 Gather의 모든 버전에 대한 주장으로 확장하지 않는다. |
| [WorkAdventure 채팅 안내](https://docs.workadventu.re/user/chat/) | 실제 온라인 사용자 목록에서 회의 초대를 보내며 상대가 수락·거절한다. 일시적인 근접 대화와 지속되는 채팅의 범위를 구분한다. | 실제 presence 목록에서만 검수 초대를 시작한다. 기존 요청·수락 프로토콜과 고정 검수본 검증을 재사용하며 메시지나 참가자를 생성해 표시하지 않는다. |
| [SoWork 공식 릴리스](https://www.sowork.com/whats-new) — 2026-08-01 게시의 7월 업데이트 및 2026-07-01 게시의 6월 업데이트 | 사람의 위치와 현재 회의를 파악하는 대시보드, 상태 표시, 검색 가능한 업무 자료, 모바일 업무 접근을 강조한다. | 위치·작업 상태·접속 권한 역할로 팀원을 찾고 현황을 실제 목록에서 계산한다. 동의 없는 앱 사용 추적이나 가상의 일정·회의 요약은 추가하지 않았다. |
| [Kumospace 상태·가용성 안내](https://www.kumospace.com/help/status) | Available·Away·Focusing을 구분하고 채팅에서도 상태를 볼 수 있다. | 집중·자리비움·원고 검토·대화 가능을 색과 텍스트로 함께 표시한다. 미디어 설정이나 초대 가능 여부를 녹색 점 하나로 추정하지 않는다. |
| [SpatialChat 방 직접 연결 안내](https://how.spatial.chat/help/getting-started/how-to-send-guests-directly-to-a-private-room-in-spatialchat/) | 목적지가 있는 초대는 인증을 거쳐 바로 해당 방으로 연결한다. | 목록의 검수 초대에서 실제 고정 검수본 선택으로 연결한다. 상대 수락이나 원고 접근 권한을 생략하지 않고 현재 서버 검증 경계를 유지한다. |
| [Teamflow 공식 제품 안내](https://www.teamflowhq.com/) | 회의에 관련 문서와 앱을 유지해 다시 자료를 찾는 시간을 줄인다. | 검수 초대에 선택된 원고·검수·리비전의 기존 고정 참조를 유지한다. 일반 최신 편집본으로 바꾸거나 초대만으로 편집 권한을 주지 않는다. 이 근거는 제품 소개이며 세부 구현·현재 모든 플랜의 가용성 검증은 아니다. |

## 확인한 문제와 변경 — current

기존 `StudioVirtualSpaceSocialPanel`은 접속자의 이름 옆에 같은 녹색 점을 표시했다. 실제로는 집중·자리비움 상태여도 목록에서 그 차이를 바로 알 수 없고, 장소와 접속 역할도 나타나지 않았다. 검색은 이름만 지원했다. 검수 초대는 팀원을 선택한 뒤 세부 동작에서 함께 검토를 누르고 검수본을 선택해야 했다. 버튼이 비활성화된 이유와 목록 아래 열린 검수본 선택 화면도 찾기 어려웠다.

현재 구현은 다음과 같다.

- 참여자의 실제 활동, 현재 장소, 접속 권한 역할을 표시한다. 역할은 작품 소유자·관리자·편집 참여자·의견 참여자·보기 전용이다. 확인되지 않은 작가·PD 등의 업무 직책은 추측하지 않는다.
- 팀원·장소 찾기와 팀원 패널에서 이름, 한글·영문 위치, 작업 상태와 역할을 함께 검색한다. NFKC 정규화와 여러 검색어의 교집합을 지원한다.
- 접속 수, 초대 가능한 수, 집중·자리비움 수는 현재 전달받은 실제 참여자에서 계산한다. NPC나 예시 계정을 포함하지 않는다. 초대 가능 필터는 기존 readiness와 차단·진행 중 요청 상태를 반영한다.
- 목록의 검수 초대 버튼으로 기존 `StudioVirtualSpaceReviewPicker`를 연다. 검수본이 있는 경우 기본 선택본을 확인하고 두 번째 클릭으로 초대를 요청할 수 있다. 다른 버전을 선택하는 경우에는 그 선택 과정이 추가된다. 아무 버튼도 누르지 않았을 때 원고 조회나 초대를 시작하지 않는다.
- 집중·자리비움, 차단, 진행 중 요청·함께하기, 연결·공간 접근 준비, 검수 프로토콜 준비 상태의 제한 이유를 보여준다. 실제 요청 시에는 기존 컨트롤러가 조건과 권한을 다시 확인한다.
- 검수 화면을 열면 제목으로 포커스를 옮기고 화면에 보이도록 스크롤한다. 닫으면 시작 버튼으로 복귀하되, 사용자가 이미 다른 컨트롤로 이동했다면 포커스를 빼앗지 않는다.
- 상태를 색만으로 전달하지 않는다. 주요 조작은 최소 44px 영역을 유지하며 좁은 모바일에서는 초대 버튼을 다음 행으로 배치한다.

핵심 소스는 [참여자 표시·검색·초대 제한](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-teammates.ts), [팀원 패널](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceSocialPanel.tsx), [작업실 찾기](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceDirectory.tsx), [검수 선택](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceReviewPicker.tsx)이다. 부모 페이지는 팀원 패널의 optional `manifest`에 현재 월드를 전달한다. 미전달 시에도 기존 장소 카탈로그·캠퍼스의 알려진 위치만 표시하며 미확인 위치를 꾸며내지 않는다.

## 캐릭터 정체성과 테마 미리보기 연결 — current

새 테마 캐릭터의 방향 URL은 32개 포즈가 포함된 원본 시트다. 기존 직접 `img` 표시를 그대로 사용하면 여러 캐릭터가 한꺼번에 노출된다. [공통 캐릭터 미리보기](../../apps/web/src/domains/creator/virtual-space/StudioVirtualCharacterPreview.tsx)는 렌더러와 같은 원본 메타데이터를 사용해 한 프레임만 표시한다. 균등 격자의 정수 경계와 검수된 불균등 프레임 영역을 모두 지원하며, `viewBox`와 명시적인 `clipPath`를 함께 사용해 넓은 컨테이너에서도 옆 프레임이 보이지 않게 한다. 검수된 원본의 머리·발 범위를 임의로 줄이지 않으며 기존 단일 이미지와 상태 이미지는 기존 URL을 유지한다.

- 입장 화면, 공간 내 캐릭터 선택, 참여자 표시, NPC 대화, 개인 홈의 캐릭터를 공통 미리보기로 연결했다.
- [여섯 테마 대표 캐릭터 선택](../../apps/web/src/domains/creator/virtual-space/StudioVirtualThemeCharacterPicker.tsx)은 현재 테마에 맞는 캐릭터를 추천하되 기존 선택을 자동 변경하지 않는다. 클릭은 기존 `avatarIndex` 저장·presence 경로를 사용한다. 신규 캐릭터는 자동 배정 후보에 추가하지 않는다.
- 현재 테마의 가구 원본을 목록과 배치 지도에 함께 표시한다. 테마만 변경하면 가구의 위치·회전·크기와 편집 기록을 유지한다.
- 추천 선택 버튼에는 이름, 선택 상태, 텍스트 추천을 표시하며 모바일 2열 배치와 최소 44px 조작 영역을 유지한다.

## 실행한 검증

- `pnpm exec vitest run`으로 `StudioVirtualSpaceSocialPanel.work`, `StudioVirtualSpaceSocialPanel.appearance`, `StudioVirtualSpaceDirectory`, `StudioVirtualSpaceReviewPicker`, `StudioVirtualSpacePage.social`의 **5파일 59테스트 통과**.
- 명시적 두 번의 클릭으로 고정 검수본을 기존 초대 callback에 전달하는 흐름, 6개 준비·차단 조건, 상대 집중·자리비움, 검색·필터·역할 표시, 빈 실제 참여자 목록, 포커스 이동과 복귀를 검증했다.
- 기존 팀원 picker의 모든 버튼 텍스트가 이름뿐이라는 테스트는 메타데이터와 검수 버튼 추가로 실패했다. 선택 버튼의 접근 가능한 이름 목록을 검사하도록 바꿔 NPC가 선택 가능한 팀원에 포함되지 않는 본래 계약을 유지했다.
- 관련 TS/TSX 8파일 ESLint, 이 문서의 Secretlint, `pnpm harness:check`, `git diff --check` 통과. 전체 통합 `harness:verify`, 최종 타입 검사·빌드·CI는 부모 작업의 최종 게이트에서 확인해야 한다.
- 미리보기 연결 후 `StudioVirtualCharacterPreview`, `StudioVirtualThemeCharacterPicker`, `StudioVirtualSpaceEntryLobby`, `StudioVirtualSpaceCustomizationPanel`, `StudioVirtualSpacePage.social`, `StudioWorkspacePage.continuity`, `StudioVirtualSpaceNpcDialoguePanel`의 **7파일 70테스트 통과**. 실제 여섯 테마 등록을 사용해 명시 선택과 배경 테마 변경 시 정체성 유지를 확인했다. 홀수 원본 크기, 균등 셀을 넘는 검수 영역, 손상된 메타데이터, 기존 단일 이미지와 2×2 원본의 여백도 검사했다. 이 결과는 실제 브라우저 화면이나 휴대폰 시각 검증을 대신하지 않는다.

## 남은 검증·목표 — target

- 인증된 실제 두 사용자로 원고 목록 조회, 초대·수락·거절, 검수 권한 변경·연결 종료를 브라우저에서 확인한다. 현재 결과는 컴포넌트·기존 페이지 회귀 테스트이며 실제 통신 성공 증거가 아니다.
- 실제 휴대폰·스크린리더·여러 언어에서 긴 이름, 많은 참여자, 검수 화면의 스크롤과 포커스를 확인한다.
- 서로 다른 장소에 있는 프로젝트 팀원을 통합 조회하는 기능은 서버의 명시적 presence 범위가 필요하다. 현재 패널은 전달받은 현재 연결 범위의 팀원만 보여준다.
- 별도 기능으로 필요한 일정 연동, 지속되는 채팅, 업무 직책·담당 공정, 외부 게스트 초대와 회의 자료 고정은 기존 서버·권한 계약을 확인한 뒤 구현해야 한다. 이번 UI 개선만으로 구현되었다고 표시하지 않는다.

이 작업은 운영 배포를 실행하지 않았다. PR·병합과 배포 승인은 별도이며 [운영 정책](../operations/minimum-cost-deployment-policy.md)을 따른다.
